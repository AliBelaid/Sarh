# Sarh — Data Dictionary

Field-level reference for the Sarh SQL Server schema. Source of truth: `infra/mssql/migrations/000…025.sql`. All time columns are `DATETIMEOFFSET(3)` defaulting to `SYSDATETIMEOFFSET()`. All primary keys are `UNIQUEIDENTIFIER DEFAULT NEWID()` unless noted otherwise.

## Conventions

| Concept | Convention |
| ------- | ---------- |
| Table names | snake_case, English plural (`citizens`, `properties`) |
| ENUMs | `NVARCHAR(N) CHECK (col IN (…))` |
| JSONB equivalent | `NVARCHAR(MAX)` with `CHECK ISJSON(col) = 1` |
| Geometry | SQL Server `geography` (SRID 4326 implicit) |
| Soft-delete | `is_active = 0` |
| Audit | append-only via `INSTEAD OF UPDATE/DELETE` triggers on `audit_log` |

## auth_users

Authentication identity (one row per credential — citizens & officers both reference this).

| Column | Type | Constraints | Source / notes |
| ------ | ---- | ----------- | -------------- |
| `id` | UNIQUEIDENTIFIER | PK, default NEWID() | issued at signup |
| `email` | NVARCHAR(254) | UNIQUE, NOT NULL | normalized lowercase |
| `encrypted_password` | NVARCHAR(255) | NOT NULL | bcrypt cost-12 (BCrypt.Net-Next) |
| `email_confirmed_at` | DATETIMEOFFSET | NULL | set after email verify |
| `last_sign_in_at` | DATETIMEOFFSET | NULL | refreshed on each sign-in |
| `raw_app_meta_data` | NVARCHAR(MAX) JSON | CHECK `ISJSON()` | `{ "sarh_role": "citizen" }` |
| `raw_user_meta_data` | NVARCHAR(MAX) JSON | NULL | locale, theme |
| `created_at` | DATETIMEOFFSET | DEFAULT SYSDATETIMEOFFSET() | row birth |

## citizens

Libyan natural persons. The `legacy_national_no` keeps the paper-era ID — required by the migration constraint in CLAUDE.md so identity can be re-issued without data loss when Libya launches a national digital ID.

| Column | Type | Constraints | Source / notes |
| ------ | ---- | ----------- | -------------- |
| `id` | UNIQUEIDENTIFIER | PK | |
| `auth_user_id` | UNIQUEIDENTIFIER | FK → `auth_users.id`, UNIQUE NULL | NULL until citizen signs up |
| `first_name_ar` | NVARCHAR(120) | NOT NULL | Arabic only |
| `father_name_ar` | NVARCHAR(120) | NOT NULL | |
| `grandfather_name_ar` | NVARCHAR(120) | NULL | |
| `family_name_ar` | NVARCHAR(120) | NOT NULL | |
| `mother_name_ar` | NVARCHAR(160) | NOT NULL | |
| `legacy_national_no` | NVARCHAR(40) | INDEX | paper national-no, never expires |
| `gender` | NVARCHAR(10) | CHECK IN (`male`,`female`) | |
| `birth_date` | DATE | NOT NULL | |
| `region_id` | INT | FK → `regions.id` | governorate of registration |
| `municipality_id` | INT | NULL | sub-region |
| `is_active` | BIT | DEFAULT 1 | soft-delete flag |
| `created_at` / `updated_at` | DATETIMEOFFSET | auto-stamped | |

## officers

Sarh employees. Roles drive UI access; granular permissions live in JSON.

| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| `id` | UNIQUEIDENTIFIER | PK | |
| `auth_user_id` | UNIQUEIDENTIFIER | FK → `auth_users.id`, UNIQUE | one credential per officer |
| `employee_no` | NVARCHAR(20) | UNIQUE | issued by HR |
| `full_name_ar` | NVARCHAR(200) | NOT NULL | |
| `role` | NVARCHAR(40) | CHECK IN (`super_admin`,`registry_officer`,`reviewer`,`auditor`,`id_issuer`) | drives navigation gates |
| `region_id` | INT | FK → `regions.id` | scope of authority |
| `permissions` | NVARCHAR(MAX) JSON | CHECK ISJSON() | granular `{ "review.approve": true }` |
| `is_active` | BIT | DEFAULT 1 | |

## properties

Cadastral parcel record. Geometry uses `geography` so distance & intersect queries work in metres.

| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| `id` | UNIQUEIDENTIFIER | PK | |
| `property_code` | NVARCHAR(40) | UNIQUE NULL | issued on approval (`PRP-YYYY-NNNN`) |
| `parcel_number` | NVARCHAR(40) | INDEX | from cadastral plan |
| `plan_number` | NVARCHAR(40) | NULL | |
| `block_number` | NVARCHAR(20) | NULL | |
| `owner_citizen_id` | UNIQUEIDENTIFIER | FK → `citizens.id` | |
| `property_type` | NVARCHAR(20) | CHECK IN (`residential`,`agricultural`,`commercial`,`governmental`,`industrial`,`mixed`) | |
| `region_id` | INT | FK → `regions.id` | governorate |
| `address` | NVARCHAR(500) | NULL | freeform Arabic |
| `boundary_polygon` | GEOGRAPHY | NOT NULL | SRID 4326 polygon |
| `centroid` | GEOGRAPHY | computed via trigger | `EnvelopeCenter()` of polygon |
| `area_sqm` | DECIMAL(12,2) | computed `STArea()` | server-authoritative |
| `status` | NVARCHAR(30) | CHECK IN (`draft`,`pending`,`under_review`,`needs_clarification`,`approved`,`rejected`,`frozen`) | drives officer queue |
| `submitted_at` | DATETIMEOFFSET | NULL | first transition to `pending` |
| `reviewed_by_officer_id` | UNIQUEIDENTIFIER | FK → `officers.id` | |
| `decree_number` | NVARCHAR(40) | NULL | populated on approve |
| `deed_pdf_path` | NVARCHAR(400) | NULL | storage relative path |
| `deed_signed_hash` | CHAR(64) | NULL | SHA-256 of signed PDF |
| `vc_credential_id` | NVARCHAR(80) | NULL | SSI VC id |

**Uniqueness rule (CLAUDE.md §3):** two approved properties cannot share the same centroid. Polygon overlap fires a reviewer warning, not a hard block — legacy paper deeds may legitimately overlap.

## registration_requests

The lifecycle envelope for a property submission. Splits the audit-trail of status transitions from the property entity itself.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `request_no` | NVARCHAR(40) | UNIQUE — `REQ-YYYY-NNNN` |
| `property_id` | UNIQUEIDENTIFIER | FK → `properties.id` |
| `current_status` | NVARCHAR(30) | mirrors `properties.status` |
| `submitted_at` | DATETIMEOFFSET | |

## review_comments

Conversation thread between owner and officer.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `request_id` | UNIQUEIDENTIFIER | FK → `registration_requests.id` |
| `officer_id` | UNIQUEIDENTIFIER | NULL — citizen replies allowed |
| `body_ar` | NVARCHAR(2000) | Arabic |
| `created_at` | DATETIMEOFFSET | |

## property_documents

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `property_id` | UNIQUEIDENTIFIER | FK → `properties.id` |
| `doc_type` | NVARCHAR(40) | `legacy_deed`, `inheritance`, `neighbour_certificate`, `survey`, `other` |
| `storage_path` | NVARCHAR(400) | under `STORAGE_ROOT` |
| `sha256` | CHAR(64) | content hash for tamper detection |
| `size_bytes` | BIGINT | |
| `uploaded_by_user_id` | UNIQUEIDENTIFIER | actor |

## digital_id_cards

Citizen NFC ID card. One active card per citizen (older cards keep `status=revoked` for history).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `citizen_id` | UNIQUEIDENTIFIER | FK → `citizens.id` |
| `digital_id_number` | NVARCHAR(40) | UNIQUE — `LY-RR-YYYY-NNNNNN-X` |
| `card_serial` | NVARCHAR(40) | UNIQUE physical serial |
| `nfc_uid` | CHAR(14) | NTAG 424 DNA UID, hex |
| `last_nfc_counter` | BIGINT | rolling SUN counter — never decreases |
| `did` | NVARCHAR(120) | `did:sov:LY:…` |
| `issued_by_officer_id` | UNIQUEIDENTIFIER | FK → `officers.id` |
| `issued_at` | DATETIMEOFFSET | |
| `expires_at` | DATETIMEOFFSET | normally +5 years |
| `status` | NVARCHAR(20) | `active` / `frozen` / `revoked` / `expired` / `lost` |

**Anti-cloning rule (CLAUDE.md §4):** static UID is not enough. Each verify request must produce a fresh SUN message; server rejects any counter ≤ `last_nfc_counter`.

## nfc_card_secrets

Wrapped AES keys, stored 1:1 with the card.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `card_id` | UNIQUEIDENTIFIER | FK → `digital_id_cards.id`, UNIQUE |
| `meta_read_key_enc` | VARBINARY(MAX) | AES-GCM-wrapped K_meta |
| `sdm_file_read_key_enc` | VARBINARY(MAX) | AES-GCM-wrapped K_sdm |
| `kms_key_id` | NVARCHAR(80) | reference to KMS material |

## id_issuance_history

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `citizen_id` | UNIQUEIDENTIFIER | FK |
| `card_id` | UNIQUEIDENTIFIER | FK — current row's card |
| `action` | NVARCHAR(20) | `issue` / `reissue` / `revoke` / `replace` |
| `reason` | NVARCHAR(40) | `lost` / `damaged` / `expiring` / `data_change` / `other` |
| `officer_id` | UNIQUEIDENTIFIER | FK |
| `occurred_at` | DATETIMEOFFSET | |

## ssi_wallets / ssi_credentials

Bridges to the Hyperledger Aries Cloud Agent. The DID is the citizen's wallet anchor; credentials are issued (`PropertyDeed`, `CitizenIdentity`) and stored as JSON-LD payloads.

## audit_log

Append-only. `INSTEAD OF UPDATE` and `INSTEAD OF DELETE` triggers prevent mutation. Ordered by IDENTITY for tail-streaming.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | BIGINT IDENTITY | PK |
| `actor_user_id` | UNIQUEIDENTIFIER | NULL for system actions |
| `action` | NVARCHAR(60) | `property.approve`, `card.reissue`, etc. |
| `entity` | NVARCHAR(60) | table name |
| `entity_id` | UNIQUEIDENTIFIER | row touched |
| `before_state` | NVARCHAR(MAX) JSON | NULL on insert |
| `after_state` | NVARCHAR(MAX) JSON | NULL on delete |
| `ip_address` | NVARCHAR(45) | optional |
| `occurred_at` | DATETIMEOFFSET | DEFAULT SYSDATETIMEOFFSET() |

## regions

Static reference: 22 Libyan governorates, codes 10–31. Seeded once.

## notifications

In-app + SMS + email pipe.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UNIQUEIDENTIFIER | PK |
| `recipient_citizen_id` | UNIQUEIDENTIFIER | FK |
| `title_ar` / `body_ar` | NVARCHAR | |
| `channel` | NVARCHAR(20) | `in_app` / `sms` / `email` |
| `read` | BIT | DEFAULT 0 |
| `created_at` | DATETIMEOFFSET | |

## Enumerations (canonical values)

| Field | Allowed values |
| ----- | -------------- |
| `properties.status` | draft, pending, under_review, needs_clarification, approved, rejected, frozen |
| `properties.property_type` | residential, agricultural, commercial, governmental, industrial, mixed |
| `digital_id_cards.status` | active, frozen, revoked, expired, lost |
| `id_issuance_history.action` | issue, reissue, revoke, replace |
| `id_issuance_history.reason` | lost, damaged, expiring, data_change, other |
| `officers.role` | super_admin, registry_officer, reviewer, auditor, id_issuer |
| `notifications.channel` | in_app, sms, email |
