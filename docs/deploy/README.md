# Deploying Sarh (صرح) to the LVCT VPS

This document is the canonical deployment runbook. Follow the phases in
order on a fresh setup. Once the VPS is bootstrapped, day-to-day deploys
are one command per app.

## Target host

| Field | Value |
|---|---|
| Host | `80.209.230.140` |
| User | `Administrator` (Windows Server) |
| SSH port | `22` |
| API port (planned) | `5309` |
| Web port | `80` (IIS reverse proxy → app) |

Credentials are **never** stored in this repo. The first-time SSH key
bootstrap uses the password once; every deploy after that uses the
public key in `~/.ssh/authorized_keys`. Rotate the VPS password after
the bootstrap step succeeds.

---

## Phase 1 — Local SSH bootstrap (one-time)

Run from the project root in PowerShell:

```powershell
pwsh -File scripts/deploy/bootstrap-vps.ps1
```

What it does:

1. Generates an `ed25519` key at `~/.ssh/sarh_vps` if one doesn't exist.
2. Adds an SSH config alias `sarh-vps` pointing at
   `Administrator@80.209.230.140` using the key.
3. Prompts you for the VPS password **once**, copies the public key to
   `C:\ProgramData\ssh\administrators_authorized_keys` on the server,
   sets the right ACL, and verifies passwordless login works.

After this finishes, `ssh sarh-vps` should connect with no prompt and
all the deploy scripts below work immediately.

---

## Phase 2 — VPS provisioning (one-time)

Bootstrap installs the runtime once the SSH key is set up:

```powershell
pwsh -File scripts/deploy/provision-vps.ps1
```

It installs (idempotently):

- Node.js 20 LTS via `winget`
- `pm2` globally so the API can run as a Windows service
- Opens **TCP 5309** in Windows Firewall for the Sarh API
- Creates `C:\sarh\` (releases live here) and `C:\sarh\logs`

If anything fails, the script prints the failed step and you can run it
manually over `ssh sarh-vps`.

---

## Phase 3 — Seed Supabase

The Supabase project is on the existing managed instance
(`rfmozdgpiaeopeqkkglf.supabase.co`).

1. **First-time only**: paste the contents of every file in
   `infra/supabase/migrations/*.sql` into the dashboard SQL editor in
   numeric order (`001` → `024`).
2. **Every time RLS misbehaves**: paste the contents of
   `infra/supabase/migrations/025_demo_open_rls.sql`. It is idempotent
   and re-runnable. It enables RLS, drops any prior `demo_*` policies,
   and adds permissive ones tied to `auth.uid()` so the demo flow can
   read/write end-to-end. It also opts the relevant tables into
   `supabase_realtime` so the admin lists stream live.
3. **Auth → Providers → Email**: turn off "Confirm email" for the demo
   project so `demo@sarh.ly` and `mobile-demo@sarh.ly` can sign in
   without a confirmation round-trip.

---

## Phase 4 — Per-app deploys

Each script builds the production bundle locally, uploads via SCP to
`C:\sarh\<app>\`, and (re)starts the right runtime on the VPS.

```powershell
# Web admin → IIS Default Web Site\admin
pwsh -File scripts/deploy/deploy-web-admin.ps1

# Public citizen landing → IIS Default Web Site\
pwsh -File scripts/deploy/deploy-web-citizen.ps1

# NestJS API → pm2 service "sarh-api" listening on :5309
pwsh -File scripts/deploy/deploy-api.ps1
```

Each script ends with a verification step that pings the served URL.

### First-time API secrets

The first run of `deploy-api.ps1` drops a starter `.env` at
`C:\sarh\api\.env` with empty Supabase keys. Edit it once on the VPS:

```powershell
ssh sarh-vps "notepad C:\sarh\api\.env"
```

Fill in `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
`DATABASE_URL`, and `KMS_MASTER_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
Then re-run the deploy — subsequent runs never overwrite `.env`.

---

## Day-2 operations

```powershell
ssh sarh-vps                           # interactive shell
ssh sarh-vps "pm2 status"              # see the API process
ssh sarh-vps "pm2 logs sarh-api --lines 200"
ssh sarh-vps "Get-Service W3SVC | Restart-Service"  # bounce IIS
```

---

## Schema-write gotchas (non-obvious)

The web/mobile clients write directly to Supabase. A few column names
differ from what intuition suggests — keep these straight when reviewing
PostgREST inserts:

| Wrong (don't write) | Right (the actual column) | Table |
|---|---|---|
| `status: 'pending_review'` | `status: 'pending'` | `properties` |
| `is_active: true` | (no such column — use `status`) | `properties` |
| `boundary_polygon_geojson` | `boundary_polygon` (PostGIS geometry — needs RPC + `ST_GeomFromGeoJSON`) | `properties` |
| `citizen_id` | `recipient_citizen_id` | `notifications` |
| `is_read: true` | `read_at: now()` | `notifications` |
| `channel: 'in_app'` | `kind: 'in_app'` | `notifications` |
| `related_table` / `related_id` | (collapse into `payload` JSONB) | `notifications` |
| `action: 'property.approved'` | `action: 'approve'` (enum) | `audit_log` |
| `diff: {...}` | `before_state` / `after_state` JSONB | `audit_log` |
| `verifiable_credentials` | `ssi_credentials` (joined to `ssi_wallets.citizen_id`) | SSI |

---

## Rotating the VPS password

After Phase 1 succeeds:

```powershell
ssh sarh-vps "net user Administrator '<new strong password>'"
```

Then forget the old password — every deploy from now on uses the SSH
key. Keep the private key somewhere safe (not in the repo).
