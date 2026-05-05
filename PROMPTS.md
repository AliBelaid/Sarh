# PROMPTS.md — Sarh Build Sequence (Claude Code CLI)

> ⚠️ **Historical document.** This file captures the *original* build plan (Phases 0–12)
> as it was issued to Claude Code. The shipped system deviated in two large ways:
> the API was migrated from NestJS/Prisma to **ASP.NET Core 8 + EF Core** (`apps/api-dotnet/`),
> and the data layer moved from Supabase/Postgres to **local SQL Server 2019/2022**
> (`infra/mssql/migrations/`). The four separate Angular apps were also consolidated
> into a single role-routed `apps/web/`. The legacy NestJS service and the four legacy
> web apps were deleted; recover from git history at commit `949a57d` if needed.
>
> For the current state, see `README.md`, `CLAUDE.md`, and `docs/Sarh.pdf`.

---

> Run each prompt **in order** in Claude Code CLI from the repo root. After every phase,
> commit the changes with a clear message and run the verification steps before moving on.

---

## Phase 0 — Scaffold

```text
Scaffold a monorepo at the current path named "sarh" using pnpm workspaces.
Create folders: apps/api, apps/web-citizen, apps/web-officer, apps/web-id-issuer,
apps/web-admin, apps/mobile, packages/shared-types, packages/ui-kit,
packages/flutter-shared, infra/supabase, infra/docker, infra/nginx, docs, scripts.
Add a root .gitignore covering node_modules, .env, dist, build, .dart_tool.
Add a root README.md pointing to CLAUDE.md and docs/.
Initialize git, then create the api app with NestJS CLI (no http test scaffolds).
Create web-citizen, web-officer, web-id-issuer, web-admin via Angular CLI 17 with
SCSS, routing, RTL preconfigured (dir="rtl" in index.html, transloco installed).
Initialize the mobile Flutter app with platforms ios/android only.
Do NOT add any business code yet — only scaffolding.
```

**Verify**: `pnpm install` runs clean, every app boots in dev mode.

---

## Phase 1 — Database

```text
Create the Supabase migration files under infra/supabase/migrations/.
Use the schema in /docs/schema.sql as the single source of truth and split it into
numbered migrations:
  001_extensions.sql, 002_lookup.sql, 003_citizens.sql, 004_digital_id.sql,
  005_officers.sql, 006_properties.sql, 007_documents.sql, 008_workflow.sql,
  009_ssi.sql, 010_notifications.sql, 011_audit.sql, 012_views.sql,
  013_functions.sql, 014_triggers.sql, 015_rls.sql, 016_seed_regions.sql.
Add a Supabase config.toml for local dev. Add npm scripts in api/package.json:
"db:reset", "db:migrate", "db:seed".
Generate Prisma schema from the live database, place under apps/api/prisma/schema.prisma.
```

**Verify**: `supabase db reset` runs all migrations green; `npx prisma db pull` produces
matching Prisma models.

---

## Phase 2 — Auth & Citizens Module (Backend)

```text
In apps/api implement:
- Auth module wrapping Supabase Auth: sign-in, sign-up (officer-only invite),
  custom JWT claims injection (citizen_id or officer_id, role, permissions).
- A NestJS guard `DigitalIdAuthGuard` that validates a JWT and loads the citizen.
- A `CitizensController` with CRUD: create (officer-only), list, get-by-id,
  update-by-officer. All write endpoints push to `audit_log` via an interceptor.
- DTOs use class-validator with Arabic-first error messages.
- A service `DigitalIdNumberService` that calls the SQL function generate_digital_id()
  to produce LY-RR-YYYY-SSSSSS-C identifiers.
- Unit tests for the number generator (Luhn check, region prefix).
```

**Verify**: officer signs in, creates a citizen, gets back a unique digital ID number,
audit_log shows the create entry.

---

## Phase 3 — Digital ID Issuance + NFC

```text
In apps/api add:
- DigitalIdCardsController with endpoints: POST /digital-id-cards/issue,
  POST /digital-id-cards/:id/freeze, POST /digital-id-cards/:id/revoke,
  POST /digital-id-cards/:id/reissue.
- An NFC encoding service that:
    1. Receives card_id + raw NFC UID detected by the issuance station,
    2. Generates a SUN configuration (NTAG 424 DNA) with a server-side key in KMS,
    3. Returns a signed payload to write into NDEF record 1 (the digital ID number)
       and the SUN-protected URL into NDEF record 2.
- An endpoint POST /nfc/verify that takes a SUN URL, validates the rolling counter
  and signature, returns the citizen + card status.
- Photo hashing on upload (sha256), stored on `digital_id_cards.photo_hash`.
- Issuance writes to id_issuance_history.
```

**Verify**: with a real ACR122U + NTAG 424 DNA card, encode, then verify a tap
returns 200 with the citizen identity. A second tap with stale counter returns 401.

---

## Phase 4 — Properties + PostGIS

```text
Add PropertiesController with endpoints:
- POST /properties (citizen submits — status auto draft → pending)
- GET /properties (citizen sees their own; officer sees their region)
- POST /properties/:id/documents (uploads to Supabase Storage)
- GET /properties/overlap-check?polygon=GeoJSON (uses find_property_overlaps())
- GET /properties/nearby?lng=&lat=&radius_m=
The submit endpoint:
- Validates polygon is closed and area matches `area_sqm` within 5% tolerance.
- Rejects if a centroid duplicate already exists in approved status.
- Creates a registration_request with a sequential request_no (year-based).
Implement Storage upload helper that scans file size limits, mime types
(pdf, jpg, png), stores under `property_documents/{property_id}/`.
```

**Verify**: submit a triangular polygon in Tripoli, see pending request, run
overlap-check against a duplicate to get the matching property.

---

## Phase 5 — Officer Workflow + Notifications

```text
Add WorkflowController and ReviewService:
- POST /properties/:id/review { decision: 'approve' | 'reject' | 'needs_clarification', note }
  validates officer.region_id matches the property region.
- On approve: generates property_code, calls DeedGeneratorService to make a
  PAdES-signed PDF, uploads to Storage at deeds/{property_code}.pdf, persists
  deed_signed_hash, then calls SsiService.issuePropertyDeedVc().
- On reject or needs_clarification: writes review_comments and notifies citizen.
NotificationsService:
- Sends SMS via Libyana gateway for approve/reject.
- Sends Realtime push by inserting into notifications table.
- An Edge Function (Deno) processes the notifications row and calls the SMS API.
```

**Verify**: approve a property → citizen gets SMS + push, deed PDF available, VC
issued.

---

## Phase 6 — SSI Wallet & VC

```text
Stand up Hyperledger Aries Cloud Agent Python (ACA-Py) in infra/docker/aca-py/.
Define schemas:
- DigitalIdSchema (1.0): full_name, dob, digital_id_number, photo_hash.
- PropertyDeedSchema (1.0): property_code, owner_did, type, area_sqm, polygon_hash.
In apps/api add SsiService with:
- createWallet(citizen_id) → did, public_key, encrypted_seed
- issueDigitalIdVc(card_id) — called when card status moves to active
- issuePropertyDeedVc(property_id) — called on approval
- revokeVc(credential_id, reason)
Persist all results into ssi_wallets and ssi_credentials tables.
```

**Verify**: a citizen has a wallet row after their first card, the issued VC
appears in ssi_credentials with a valid revocation_reg_id.

---

## Phase 7 — Citizen Mobile (Flutter)

```text
In apps/mobile build the citizen-facing Flutter app. Use Riverpod + go_router.
Color tokens: primary #0F172A, accent #F97316, warn #DC2626, success #0891B2.
Default locale ar_LY, RTL.
Screens:
1. Splash with logo (assets/branding/logo-sarh.svg)
2. Onboarding (3 slides about Sarh)
3. Login: input digital_id_number + tap NFC card → confirm + PIN 6-digit
4. Home dashboard: list of "my properties" with status chips
5. Property submission wizard:
   step 1 — type (residential/agricultural/commercial/governmental)
   step 2 — location pick on Mapbox map (drop polygon)
   step 3 — dimensions (length, width, depth, area auto-computed)
   step 4 — documents (camera + gallery, multi-file)
   step 5 — review + submit
6. Property detail with timeline of status changes
7. Wallet: list of VCs, share via QR
8. Notifications inbox
9. Profile: view ID card, request reissue
Hook to API via dio + interceptor that injects JWT.
```

**Verify**: full submission flow works on a real Android device with NFC.

---

## Phase 8 — Officer Web Portal (Angular)

```text
In apps/web-officer build the registry officer portal. RTL, Material 17.
Pages:
1. Login (Supabase Auth)
2. Dashboard with KPIs (pending count by region, my queue, today's approvals)
3. Pending queue — table with filters (region, type, date)
4. Property detail review:
   - Header: parcel info, owner card, status pill
   - Map panel showing polygon over base layer
   - Overlap warnings (red highlight on conflicting parcels)
   - Documents viewer (pdf inline, image carousel)
   - Comment thread with citizen
   - Decision panel: Approve / Reject / Needs clarification
5. My approvals history
Use NgRx for the pending queue state and live-update via Supabase Realtime
subscription on `properties` table filtered by region_id.
```

**Verify**: officer reviews 5 properties, approves 3, rejects 1, requests
clarification on 1; all changes appear in audit_log and the citizen mobile
gets push notifications.

---

## Phase 9 — ID Issuer Web Station (Angular)

```text
In apps/web-id-issuer build the standalone station that data-entry officers
use to issue physical digital ID cards. RTL.
Flow:
1. Login (officer with role=id_issuer)
2. New citizen wizard:
   step 1 — full quadruple name, gender, DOB, mother's name, region/municipality
   step 2 — capture photo with webcam (with face-centering guides)
   step 3 — capture signature on touch pad
   step 4 — fingerprint (optional, via fingerprint reader if available)
   step 5 — review + submit → backend issues digital_id_number
3. Card production:
   - Render the card preview using the brand SVG layers + citizen data
   - Prompt to insert blank NTAG 424 DNA card into reader
   - Press "encode" → calls /digital-id-cards/issue then /nfc/encode
   - On success: send to printer via CardPress SDK
4. Reissue flow for lost/expired cards
Use ACR122U via WebUSB or a small local helper service exposing /nfc/* on
localhost:9090 (for browsers without WebUSB).
```

**Verify**: produce a card end-to-end in under 5 minutes; tap on mobile
verifies identity instantly.

---

## Phase 10 — Admin Console + Reports

```text
In apps/web-admin build the super admin console. RTL.
Pages:
1. Officers management (CRUD, role assignment, permissions JSON editor)
2. Citizens search (full-text + filters)
3. Properties oversight — full table + map view
4. Audit log explorer with filters (actor, action, entity, date range)
5. Reports dashboard:
   - Daily issuance counts by region (chart)
   - Approvals vs rejections trend
   - Average review time
   - Heatmap of property submissions on Mapbox
   - Export to xlsx and PDF
6. System settings (SMS gateway, expiration policies, fees)
```

**Verify**: super admin creates a new officer, assigns permissions, the new
officer can immediately log into web-officer with the right scope.

---

## Phase 11 — Public Verification Site

```text
Build a small standalone site at verify.sarh.ly (sub-app inside
apps/web-citizen with routing or a separate Angular app — use
apps/web-verify). No login required.
Pages:
1. Home: "تحقق من وثيقة عقارية" with QR scanner (web camera) + manual code
   input.
2. Result page: shows a sanitized view of the deed:
   - Property code, parcel number, type, area
   - Owner first name + family name only (mask middle names)
   - Status (active / revoked) with color
   - Issue date and expiry
   - Map of the parcel polygon (Mapbox)
   - "تحميل الوثيقة الرسمية" link if the deed is public
Backend: GET /verify/:code returns the sanitized payload.
```

**Verify**: scan a deed QR with a phone, see the verified result page in <2
seconds.

---

## Phase 12 — Hardening + Deploy

```text
Security pass:
- Run npm audit + flutter pub outdated, patch critical CVEs.
- OWASP ZAP baseline scan against staging.
- Penetration test of NFC verify endpoint (replay attacks).
- Force HTTPS everywhere via Nginx, HSTS preload.
- Configure Supabase backups: daily encrypted snapshot to S3-compatible storage.
- Add Grafana + Prometheus + Loki stack in infra/docker/observability/.
- Write a runbook docs/runbook.md covering: outage, data restore, certificate
  rotation, NFC KMS rotation, SSI agent restart.
Deploy:
- Production Supabase project provisioned with RLS verified.
- API + web apps containerized; deploy to a 3-node cluster behind Nginx.
- Mobile app: build signed AAB and IPA, prepare store listings (Arabic).
Final acceptance:
- Run a UAT script with 10 real citizens, 3 officers, 2 admins. All flows
  green. Sign-off from LVCT.
```

**Verify**: production smoke test passes, runbook reviewed by ops, sign-off
documented.

---

## Notes for Claude Code CLI Usage

- After each phase, run: `git add -A && git commit -m "phase X: <name>"`
- If a phase fails verification, fix in-place rather than starting the next one.
- Use the `--no-cache` flag when scaffolding to avoid stale Angular CLI
  presets.
- For Supabase migrations, prefer `supabase db diff -f` to capture schema
  drift.
- All commits must include a Co-Authored-By: Claude line if using CLI.
