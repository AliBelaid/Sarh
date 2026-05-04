# CLAUDE.md — Sijilli Build Context

## Project Identity
- **Name (AR)**: سِجِلّي
- **Name (EN)**: Sijilli
- **Purpose**: Libyan Real Estate Registry + Digital Identity issuance platform.
- **Owner**: LVCT (Libya Vision for Communication & Technology).
- **Target Users**: Libyan citizens, registry officers, ID issuance officers, super admins, public verifiers.

## Non-Negotiable Constraints
1. **Arabic-first RTL** for ALL user-facing UI. Latin only for codes, IDs, technical labels.
2. **Ownership of digital identity must be re-issuable**: when (if) Libya launches a national digital ID, the system must migrate without data loss. Keep `legacy_national_no` field on every citizen.
3. **Coordinates uniqueness**: two approved properties cannot share the same centroid. Polygon overlap must trigger a reviewer warning, not a hard block (legacy paper deeds may legitimately conflict).
4. **NFC card cloning resistance**: use NTAG 424 DNA only. Static UID is not enough. Each card must produce a SUN message with rolling counter validated server-side.
5. **Tamper-evident documents**: every issued PDF deed must be PAdES-signed and contain a verifiable QR pointing to `verify.sijilli.ly/{deed_id}`.
6. **Audit log is append-only**. No UPDATE or DELETE allowed.
7. **No free-text role checking in code** — always go through the JSON permission map on `officers.permissions`.

## Tech Stack (Pinned)
- **Backend**: ASP.NET Core 8 (.NET 8), C# 12, EF Core 8 (`Microsoft.EntityFrameworkCore.SqlServer`) + `Microsoft.Data.SqlClient`. Lives at `apps/api-dotnet/`. The legacy NestJS service (`apps/api/`) was retired in Phase 7 — `git checkout 949a57d -- apps/api/` resurrects it if needed
- **Database**: Local **SQL Server 2019/2022** with `geography` for geometry, full-text catalog (Arabic) for name search, `INSTEAD OF` triggers for the append-only audit log. Migrations live in `infra/mssql/migrations/000–025.sql` and run via `pnpm db:reset` → `scripts/db/run-migrations.ps1` (sqlcmd-based)
- **Mobile**: Flutter 3.22+, Dart 3.4, Riverpod 2.x, go_router, flutter_nfc_kit, mapbox_maps_flutter
- **Web**: Single Angular 21 app at `apps/web/` (citizen + officer + id-issuer + admin + verify behind role-based routing) with Material 21, transloco (RTL), Sijilli brand SCSS tokens. The four legacy `apps/web-{citizen,officer,id-issuer,admin}/` apps remain in the repo only as a source for component migration; they no longer build into the prod compose stack as primaries
- **SSI**: Hyperledger Aries Cloud Agent Python (ACA-Py) v0.12+, did:sov method
- **Auth**: Custom HS256 JWT (`SIJILLI_JWT_SECRET`) + bcrypt (`BCrypt.Net-Next`); `auth_users` table + `sijilli_auth_claims` proc emit the same `citizen_id`/`officer_id`/`role`/`permissions` shape the rest of the app expects. `apps/api-dotnet/Auth/JwtTokenService.cs` signs/verifies; the global `[Authorize]` attribute + per-method `[OfficerOnly(...)]` filter validate locally with no DB roundtrip
- **Storage**: Local filesystem under `STORAGE_ROOT`; `apps/api-dotnet/Storage/StorageService.cs` exposes `UploadAsync` / `ReadAsync` / `OpenRead` / `WriteRawAsync`. The verify deed PDF is streamed via the public route `GET /api/v1/verify/:code/deed.pdf`
- **Realtime**: ASP.NET Core SignalR (planned; previously NestJS WebSocket gateway / Supabase Realtime)

## Repository Layout
```
sijilli/
├── apps/
│   ├── api-dotnet/           # ASP.NET Core 8 backend (mssql + bcrypt + JWT)
│   ├── web/                  # Single Angular app (current; ports 4200)
│   ├── web-citizen/          # LEGACY — kept for component migration only
│   ├── web-officer/          # LEGACY — kept for component migration only
│   ├── web-id-issuer/        # LEGACY — kept for component migration only
│   ├── web-admin/            # LEGACY — kept for component migration only
│   └── mobile/               # Flutter
├── packages/
│   ├── shared-types/         # TS interfaces shared across web apps
│   ├── ui-kit/               # Angular UI components (RTL)
│   └── flutter-shared/       # Dart shared widgets/models
├── infra/
│   ├── mssql/migrations/     # Active T-SQL migrations 000_database…025
│   ├── supabase/             # LEGACY — Postgres history; do not run
│   ├── docker/               # Dockerfiles + production compose
│   └── nginx/                # Reverse proxy config
├── docs/
└── scripts/
    ├── db/run-migrations.ps1 # SQL Server migration runner (sqlcmd)
    └── deploy/               # VPS deploy scripts
```

## Database Conventions
- SQL Server 2019/2022. Snake_case for tables and columns.
- All primary keys are `UNIQUEIDENTIFIER DEFAULT NEWID()` (except `audit_log` which is `BIGINT IDENTITY` for ordering).
- All time columns are `DATETIMEOFFSET(3)` defaulting to `SYSDATETIMEOFFSET()`.
- Every entity has `created_at` and `updated_at` (auto-stamped by `AFTER UPDATE` triggers).
- Soft delete = `is_active = 0`. Hard delete on `audit_log` is blocked by `INSTEAD OF UPDATE/DELETE` triggers.
- Geometry: SQL Server `geography` type (SRID 4326 implicit). Use `STIntersects`, `STDistance`, `EnvelopeCenter()`, `STArea()`.
- ENUMs: SQL Server has none — use `NVARCHAR(N) CHECK (col IN (…))`.
- JSONB: `NVARCHAR(MAX)` with `CHECK ISJSON(col) = 1`; the API's query builder JSON-parses on read and stringifies on write for known JSON columns (`permissions`, `did_doc`, `payload`, `before_state`, `after_state`, `raw_app_meta_data`, `raw_user_meta_data`).
- Always migrate via numbered T-SQL files in `infra/mssql/migrations/`. Run `pnpm db:reset` to drop+recreate locally.

## API Conventions
- REST under `/api/v1/`.
- Resource naming in English plural (`/citizens`, `/properties`, `/digital-id-cards`).
- All write endpoints emit an `audit_log` entry through a NestJS interceptor.
- Pagination: cursor-based using `?cursor=&limit=20`. No offset pagination on large tables.
- Error envelope: `{ "error": { "code": "ERR_X", "message_ar": "...", "message_en": "..." } }`.

## Frontend Conventions
- All Angular apps share `packages/ui-kit` for RTL components.
- Material 17 with custom theme matching brand colors:
  - Primary: `#0F1A14` (Libyan black)
  - Accent:  `#D4AF37` (gold)
  - Warn:    `#E70013` (Libyan red)
  - Success: `#239E46` (Libyan green)
- Flutter app uses identical color tokens (lib/core/theme/sijilli_colors.dart).
- Form validation messages always in Arabic.

## Security Checklist (per build phase)
- [ ] All Supabase tables have RLS enabled
- [ ] Storage buckets have private access by default
- [ ] JWT contains only `sub`, `citizen_id` or `officer_id`, `role`, `exp` — never PII
- [ ] No secrets in repo. Use `.env.local` ignored by git
- [ ] CORS restricted to known frontends
- [ ] Rate limit on `/auth/*` and `/properties/submit`
- [ ] Antivirus scan on uploaded documents (ClamAV in Edge Function)

## Branding Assets
- Logo:           `branding/logo-sijilli.svg`
- Login bg:       `branding/login-background.svg`
- Architecture:   `docs/architecture-diagram.svg`
- Favicon:        derive from logo, 32x32 + 192x192 + 512x512

## Build Order (see PROMPTS.md)
1. **Phase 0** — Repo scaffold, infra, Supabase project
2. **Phase 1** — Schema + RLS + seed
3. **Phase 2** — Backend auth + citizens module
4. **Phase 3** — Digital ID issuance + NFC encoding service
5. **Phase 4** — Properties module + PostGIS queries
6. **Phase 5** — Workflow + officer review + notifications
7. **Phase 6** — SSI wallet + VC issuance
8. **Phase 7** — Citizen mobile app (Flutter)
9. **Phase 8** — Officer web portal (Angular)
10. **Phase 9** — ID issuer web station (Angular + NFC + camera)
11. **Phase 10** — Admin console + reports
12. **Phase 11** — Public verification site
13. **Phase 12** — Hardening, audit, deployment

## Done Definition
A phase is "done" when:
- Code passes lint + unit tests
- E2E happy-path scenario runs green
- API endpoints documented in OpenAPI
- Permissions reviewed against permission map
- Arabic UI verified on RTL with real Arabic content
- Audit entries verified for all write paths
