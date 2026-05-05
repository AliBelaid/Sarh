# Sarh — Operator Runbook

This runbook is the on-call playbook for production Sarh. It covers
outage triage, data restore, TLS rotation, NFC KMS rotation, and SSI agent
restart. Every procedure here is destructive in some way — read the
**Preconditions** block before acting.

> All commands run from the deployment host as the `sarh` operator
> user. Image versions follow `infra/docker/.env` (`SARH_VERSION`).

---

## 0 — Conventions

- **Compose file**: `infra/docker/docker-compose.production.yml`
- **Env file**: `infra/docker/.env` (NEVER commit; copy of `.env.example`)
- **Compose alias**:
  ```bash
  alias sjc='docker compose -f infra/docker/docker-compose.production.yml --env-file infra/docker/.env'
  ```
- **Hostnames**: `sarh.ly`, `verify.sarh.ly`, `officer.sarh.ly`,
  `issuer.sarh.ly`, `admin.sarh.ly`, `agent.sarh.ly` (ACA-Py).

---

## 1 — Outage triage

### 1.1 Symptoms → first command

| Symptom | First check |
|---|---|
| Edge returns 502 / 504 on every host | `sjc ps` — is the API container restarting? |
| `verify.sarh.ly/{code}` 5xxs but other hosts OK | API logs for `verify` route; Supabase reachability |
| Officer/admin login fails ("invalid token") | Supabase Auth status page; clock skew on edge host |
| ID issuer wizard hangs at NFC step | Local NFC helper (`localhost:9090`) on the kiosk, NOT a server-side issue |
| Citizen mobile shows "Network error" | Edge TLS expiry; DNS A/AAAA records; mobile carrier blocking |

### 1.2 Health check sweep (~30s)

```bash
sjc ps
curl -fsS https://sarh.ly/healthz                    # edge → API
curl -fsS https://sarh.ly/api/v1/health              # API direct
curl -fsS https://verify.sarh.ly/api/v1/verify/PING  # rate-limited; 404 is OK, 5xx is not
sjc logs --tail=200 api edge
```

### 1.3 Restart matrix

Restart in **dependency order** so health checks don't cascade-fail:

```bash
sjc restart api          # zero-downtime — edge holds the connection
sjc restart edge         # ~3s blip on every host
sjc restart aca-py       # SSI ops queue and retry
sjc restart web-citizen web-officer web-id-issuer web-admin
```

Avoid `sjc down` unless the host is being recycled — it drops volumes
named in this file would survive, but ad-hoc bind mounts won't.

### 1.4 Roll back to the previous image

```bash
# Find last known-good tag (from the registry):
docker pull ghcr.io/lvct/sarh-api:<previous-sha>

# Pin in .env, bounce only the changed service:
sed -i 's/^SARH_VERSION=.*/SARH_VERSION=<previous-sha>/' infra/docker/.env
sjc up -d api
```

---

## 2 — Data restore

> **Preconditions**: you have a recipient `age` private key listed under
> `BACKUP_AGE_RECIPIENTS`. Without it, the snapshot is unrecoverable.
> The restore target should be a **new** Supabase project or a clearly
> labelled DR Postgres — never the live database without explicit
> sign-off from the Sarh data owner.

### 2.1 Locate a snapshot

```bash
# Snapshots land at s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/YYYY/MM/DD/
aws s3 ls s3://sarh-backups/supabase/2026/04/ --recursive
```

Each snapshot is two objects:
- `sarh-<UTCstamp>.dump.age` — encrypted custom-format pg_dump
- `sarh-<UTCstamp>.manifest.json` — sha256, size, recipient count

### 2.2 Verify integrity before decrypting

```bash
aws s3 cp s3://.../sarh-<stamp>.dump.age      ./
aws s3 cp s3://.../sarh-<stamp>.manifest.json ./

# Compare sha256 against manifest:
sha256sum sarh-<stamp>.dump.age
jq -r .sha256 sarh-<stamp>.manifest.json
```

Mismatched hashes = **stop**. Page the data owner; do not try a "best
effort" restore.

### 2.3 Decrypt + restore

```bash
age --decrypt -i ~/.config/sarh/operator.age sarh-<stamp>.dump.age \
    > sarh-<stamp>.dump

# Target is a fresh Postgres URI — NEVER the prod URI without sign-off.
pg_restore \
  --no-owner --no-privileges \
  --clean --if-exists \
  --dbname="$RESTORE_DATABASE_URL" \
  sarh-<stamp>.dump
```

After restore, **immediately** wipe the plaintext dump:

```bash
shred -u sarh-<stamp>.dump
```

### 2.4 Post-restore checks

- `select count(*) from audit_log` — row count matches the source within
  the snapshot lag window.
- `select pg_size_pretty(pg_database_size(current_database()))` — close
  to source size.
- Spot-check a citizen + property pair for PII completeness.
- If restoring into a new Supabase project: regenerate all JWT secrets,
  re-run RLS migrations, rotate API keys, swap `.env`.

---

## 3 — TLS rotation

### 3.1 Routine renewal (automatic)

The `certbot` sidecar runs `certbot renew` every 12h. It only acts on
certs ≤30 days from expiry. Force a dry-run:

```bash
sjc exec certbot certbot renew --dry-run
```

### 3.2 Adding a new hostname

```bash
# 1) Make sure DNS A/AAAA points at the edge.
# 2) Run the one-shot issuance from inside certbot:
sjc exec certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d new.sarh.ly \
  --non-interactive --agree-tos -m ops@lvct.ly

# 3) Add a server{} block in infra/nginx/conf.d/sarh.conf, commit,
#    redeploy nginx config:
sjc exec edge nginx -t && sjc exec edge nginx -s reload
```

### 3.3 Forcing a rotation (compromise)

If a private key is suspected compromised:

```bash
# Revoke + delete:
sjc exec certbot certbot revoke --cert-name <hostname> --reason keyCompromise
sjc exec certbot certbot delete  --cert-name <hostname>

# Re-issue with a fresh keypair:
sjc exec certbot certbot certonly --webroot -w /var/www/certbot -d <hostname> \
  --non-interactive --agree-tos -m ops@lvct.ly --key-type ecdsa --elliptic-curve secp384r1

sjc exec edge nginx -s reload
```

Then file an incident ticket: revocation must be communicated to anyone
who pinned the old cert.

---

## 4 — NFC KMS rotation

The NTAG 424 DNA SUN derivation keys live in AWS KMS under
`NFC_KMS_KEY_ID`. Rotation policy: every 12 months OR on operator
departure. A rotation does NOT invalidate already-issued cards — derived
keys are sealed inside the card's secure element.

### 4.1 Pre-flight

- Confirm the new key is in the **same region** as the old one
  (`NFC_KMS_REGION`). Cross-region key references cost extra latency
  per card-validation request.
- The KMS key policy must grant `kms:Decrypt` to the API task role and
  `kms:GenerateDataKey` to the ID issuer station role.

### 4.2 Procedure

```bash
# 1) Create the new key (manually in AWS console or via terraform/cli).
# 2) Re-encrypt every per-card derivation key under the new master:
sjc exec api node dist/scripts/rotate-nfc-kms.js \
  --from "$OLD_KMS_KEY_ID" --to "$NEW_KMS_KEY_ID" --confirm

# 3) Swap .env and restart the API + issuer:
sed -i "s|^NFC_KMS_KEY_ID=.*|NFC_KMS_KEY_ID=$NEW_KMS_KEY_ID|" infra/docker/.env
sjc up -d api web-id-issuer

# 4) Schedule deletion of the OLD key with a 30-day window — gives us
#    one billing cycle to discover any lingering reference.
aws kms schedule-key-deletion --key-id "$OLD_KMS_KEY_ID" --pending-window-in-days 30
```

If the rotation script aborts mid-run, the database holds a mix of
ciphertexts under both KMS keys. Both keys MUST remain active until the
script completes successfully — do not start the deletion timer early.

---

## 5 — SSI agent restart (ACA-Py)

ACA-Py keeps an in-memory state machine for in-flight credential
exchanges. A bounce will:
- Cancel any **pending** credential offer (citizens with the wallet open
  but not yet tapped "accept" lose the offer; the API auto-resends from
  the next reissue).
- NOT affect already-issued credentials. Wallet copies are durable.

### 5.1 Routine bounce

```bash
sjc restart aca-py
sjc logs --tail=200 aca-py            # wait for "successfully booted"
curl -fsS http://localhost:8021/status -H "X-API-KEY: $ACA_PY_ADMIN_API_KEY"
```

### 5.2 Wallet key rotation

The wallet master key (`ACA_PY_WALLET_KEY`) encrypts the askar wallet.
Rotation requires a re-export/import:

```bash
# 1) Export under old key:
sjc exec aca-py aca-py provision \
  --wallet-name sarh-issuer --wallet-key "$OLD_KEY" --wallet-rekey "$NEW_KEY"

# 2) Update .env, restart:
sed -i "s|^ACA_PY_WALLET_KEY=.*|ACA_PY_WALLET_KEY=$NEW_KEY|" infra/docker/.env
sjc up -d aca-py
```

### 5.3 Disaster — wallet corruption

If the askar wallet is corrupted (disk failure mid-write), there is no
short fix. The DID + schemas are anchored on the Indy ledger and can be
re-imported from a fresh wallet, but every previously-issued credential
identifier becomes orphaned. Procedure:

1. Stop ACA-Py: `sjc stop aca-py`
2. File a P0 incident — this is a recovery operation, not a restart.
3. Re-provision a new wallet, re-anchor the DID (requires a steward
   endorsement on the Indy ledger).
4. Re-issue all active credentials. The `ssi_credentials` table tracks
   which citizens hold which schema → use it to drive a bulk re-issue
   batch.

---

## 6 — Emergency contacts

| Surface | Owner | Channel |
|---|---|---|
| Backend / API / DB | LVCT engineering | `#sarh-eng` (Slack) |
| Supabase tenant | Supabase support | dashboard → support |
| Indy ledger (Sovrin MainNet) | Sovrin Foundation | sovrin.org/support |
| AWS account (KMS, S3) | LVCT cloud ops | `#sarh-cloud` |
| TLS / DNS | LVCT cloud ops | same |
