# Sarh — Security Review Checklist

This checklist is the artefact produced at the end of Phase 12 (hardening)
and the gate that every subsequent release MUST sign off on. It mirrors the
Security Checklist in `CLAUDE.md` but expands each line into a verifiable
control with a **how-to-check** command or query.

Sign-off: a release engineer fills the **Status** column on the day of the
release and saves a copy alongside the release ticket.

| Area | Control | How to verify | Status |
|---|---|---|---|
| RLS — citizens | Row-level security enabled, only the owning citizen + their officer can SELECT | `select relname, relrowsecurity from pg_class where relname='citizens';` should be `t`. | |
| RLS — properties | Officers see their region only; citizens see only their own properties | `explain analyze` an officer-scoped query and confirm a `region_id =` predicate fires before any heap scan. | |
| RLS — audit_log | Append-only; no UPDATE / DELETE policy exists | `select polname, polcmd from pg_policy where polrelid='audit_log'::regclass;` — only `r` (read) and `a` (append) should appear. | |
| RLS — ssi_credentials | Citizen sees only their own; admin sees all | Manual test: log in as Citizen A, try to GET /digital-id-cards/{id} of Citizen B → expect 404. | |
| Storage — `id-photos` bucket | Private; signed URL only | Supabase dashboard → Storage → bucket → "Public" toggle = OFF. | |
| Storage — `deeds` bucket | Private; signed URL only; signed URL TTL ≤ 10 min | Same dashboard check; grep `createSignedUrl` in `apps/api` for `expiresIn` values. | |
| Storage — `signatures` bucket | Private; signed URL only | Dashboard. | |
| JWT contents | Only `sub`, `citizen_id` or `officer_id`, `role`, `exp`. NO PII (name, ID number, phone). | Decode a fresh token (`jwt.io`) — confirm absence of name/national_no/phone fields. | |
| `.env` not committed | `.env` excluded from git | `git ls-files \| grep -E '^\.env$'` → empty. `cat .gitignore \| grep .env` → present. | |
| Hardcoded secrets | None in source | `git grep -nE '(SUPABASE_SERVICE_ROLE\|ACA_PY_ADMIN_API_KEY\|p12_password)'` should return only `.env.example` and docs. | |
| CORS allowlist | Restricted to known frontends | Hit `OPTIONS /api/v1/citizens` from `https://attacker.test` → expect missing/empty `Access-Control-Allow-Origin`. | |
| Rate limit — `/auth/*` | 10r/m steady, burst 5 | `for i in $(seq 1 50); do curl -s -o /dev/null -w '%{http_code}\n' https://officer.sarh.ly/api/v1/auth/login; done \| sort \| uniq -c` should show 429s after burst. | |
| Rate limit — `/verify/*` | 30r/m steady, burst 20 | Same pattern against `/api/v1/verify/PING`. | |
| Antivirus on uploads | ClamAV scans any user-supplied document before accept | `apps/api/src/properties/upload.service.ts` calls clamav helper; confirm a known-bad EICAR file is rejected. | |
| Audit on every write | All POST/PATCH/PUT/DELETE produce an `audit_log` row | Run a smoke test that exercises one write per module; `select count(*) from audit_log where created_at > now() - interval '1 minute'` — count should match writes 1:1. | |
| HSTS preload | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every public host | `curl -I https://sarh.ly \| grep -i strict-transport`. Repeat for all 5 hosts. | |
| TLS profile | TLS 1.2 + 1.3 only; no RC4/3DES | `nmap --script ssl-enum-ciphers -p 443 sarh.ly` shows A grade equivalent. | |
| HTTP → HTTPS redirect | Every plain HTTP request 301s to HTTPS | `curl -I http://sarh.ly` → `301`, `Location: https://...`. | |
| CSP header | Present on every host, no `unsafe-eval`, no `*` in `script-src` | `curl -I https://officer.sarh.ly \| grep -i content-security-policy`. | |
| `X-Frame-Options: DENY` | Set on every web vhost | `curl -I https://admin.sarh.ly \| grep -i x-frame-options`. | |
| Permissions-Policy | Camera/USB only on issuer host; geolocation only on citizen + officer | `curl -I` per host. | |
| PAdES B-B signature | Every issued deed validates against the trust root | `pdfsig deeds/<sample>.pdf` → "Signature is Valid". | |
| QR verifier | QR on every deed resolves to verify.sarh.ly/<code> | Decode a sample with `zbarimg` → URL matches. | |
| NFC SUN validation | Server rejects replayed SUN messages | Capture a tap, replay it, expect 401. | |
| KMS key rotation policy | Annual rotation enabled OR rotation runbook documented | `aws kms get-key-rotation-status --key-id $NFC_KMS_KEY_ID` → `KeyRotationEnabled: true` OR runbook §4. | |
| Backup encryption | Latest snapshot is age-encrypted | `aws s3 cp s3://.../latest.dump.age - \| head -c 16` starts with `age-encryption.org/v1`. | |
| Backup restore drill | Restore performed in the last 90 days | Ticket reference. | |
| Dependency audit — API | `pnpm audit --prod` shows 0 high/critical | `scripts/audit-deps.sh` exit code 0. | |
| Dependency audit — web apps | Same, per app | `scripts/audit-deps.sh` covers each. | |
| Dependency audit — mobile | `flutter pub outdated --mode=null-safety` reviewed | Manual screenshot. | |
| Container base image age | Base images ≤ 60 days old | `docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}'`. | |
| Non-root in API container | `docker exec sarh-api id` returns non-zero UID | `docker exec sarh-api id -u`. | |
| Secrets in compose | All secrets pulled from `.env` or Docker secrets, not inline | `git grep -nE 'password\|secret\|key' infra/docker/docker-compose.production.yml` only shows env-var references. | |

## Sign-off

- Release version: `_______`
- Reviewed by: `_______`
- Date (UTC): `_______`
- Open exceptions (with mitigations): `_______`
