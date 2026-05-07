# Sarh — System diagrams

Source files are Mermaid (`.mmd`); each is rendered to a `.png` of the same
name. Both are committed so you don't need any tooling to read them.

A second copy of every PNG, tuned for printing on A4, lives under `a4/`.
Those use a slightly larger font and print-friendly background; sequence
diagrams have been split so each chunk fits on one sheet.

A third copy lives under `../diagrams-classic/`. That set is rendered with
mermaid-cli locally (no online services) and overrides every Mermaid theme
variable to pure white + black — no grey participant boxes, no zebra rows,
no purple. It matches the classic-UML look in `our digram old/*.jpeg`. Run
`node render-classic-local.mjs` to rebuild after editing any `.mmd`.

| Source | Default PNG | A4 PNG | What it shows |
|---|---|---|---|
| `use-case.mmd` | `use-case.png` | `a4/use-case.png` | Use-case diagram (مخطط حالات الاستخدام) — Citizen / Registry officer / Department manager actors against 19 use-cases inside the platform, with external systems (SSI, Map, Notification, NFT minting, IPFS). |
| `conceptual-erd.mmd` | `conceptual-erd.png` | `a4/conceptual-erd.png` | Chen-style Conceptual ERD — entities (rectangles), relationships (diamonds), key attributes (ovals). Includes PROPERTY_NFT, OWNERSHIP_HISTORY, BLOCKCHAIN_TX, SMART_CONTRACT and DEPARTMENT_MANAGER. |
| `db-schema.mmd` | _(too dense for online renderers)_ | _(not in PDF)_ | Logical ERD — full SQL Server schema with PK / FK / UK markers. The dense full diagram trips both mermaid.ink and kroki workers; use the three cluster files below for printable output. |
| `db-schema-identity.mmd` | `db-schema-identity.png` | `a4/db-schema-identity.png` | Logical ERD · Identity cluster — auth_users, citizens, officers, regions, digital_id_cards, nfc_card_secrets, ssi_wallets, ssi_credentials, id_issuance_history. |
| `db-schema-property.mmd` | `db-schema-property.png` | `a4/db-schema-property.png` | Logical ERD · Property cluster — properties, registration_requests, review_comments, property_documents, property_nfts, ownership_history. |
| `db-schema-system.mmd` | `db-schema-system.png` | `a4/db-schema-system.png` | Logical ERD · System cluster — notifications + audit_log (append-only). |
| `data-dictionary-identity.mmd` | `data-dictionary-identity.png` | `a4/data-dictionary-identity.png` | Tree-style data dictionary, Identity domain — every column annotated with PK / FK / UK and the Arabic-friendly type. |
| `data-dictionary-property.mmd` | `data-dictionary-property.png` | `a4/data-dictionary-property.png` | Tree-style data dictionary, Property + On-chain domain. |
| `data-dictionary-system.mmd` | `data-dictionary-system.png` | `a4/data-dictionary-system.png` | Tree-style data dictionary, System domain (notifications + audit_log). |
| `org-chart.mmd` | `org-chart.png` | `a4/org-chart.png` | Organisational chart — Head of Digital Land Registry → Legal & Notary / Technical & GIS / IT & Blockchain / Citizen Service departments → individual roles, with the Citizen / Landowner and Stakeholders shown as external actors. |
| `class-diagram.mmd` | `class-diagram.png` | `a4/class-diagram.png` | Domain class diagram for the .NET 8 backend. Adds `PropertyNft`, `OwnershipHistory`, `BlockchainService`, `SmartContract`, `IpfsService`, `DepartmentManager`. |
| `dfd-level0-context.mmd` | `dfd-level0-context.png` | `a4/dfd-level0-context.png` | DFD Context (Level 0) — Sarh Platform as a single process with all external entities. |
| `dfd-level1.mmd` | `dfd-level1.png` | `a4/dfd-level1.png` | DFD Level 1 — five main processes (Account & Identity, Land Claim Processing, Spatial Auditing, NFT Documentation & Minting, Notifications) with data stores including `D3 Blockchain Ledger`. |
| `dfd-level2-spatial.mmd` | `dfd-level2-spatial.png` | `a4/dfd-level2-spatial.png` | DFD Level 2 — decomposition of process 3.0 (Document Review → Spatial Conflict Check → Technical Map Generation → Status Update). |
| `system-flow.mmd` | `system-flow.png` | `a4/system-flow.png` | End-to-end flow chart by role (citizen → officer → manager → ID issuer → admin) with the .NET 8 API, SQL Server, ACA-Py, IPFS, and the blockchain at the centre. |
| `sequence-signin.mmd` | `sequence-signin.png` | `a4/sequence-signin.png` | `POST /api/v1/auth/sign-in` from browser → proxy → AuthController → BCrypt.Verify → JWT issuance. |
| `sequence-property-approval.mmd` | `sequence-property-approval.png` | `a4/sequence-property-approval.png` | The original full property-approval sequence (12 participants, 6 phases). Too dense to print on A4 in one go — for hand-outs use the three split files below. |
| `sequence-property-submit-review.mmd` | `sequence-property-submit-review.png` | `a4/sequence-property-submit-review.png` | Property approval (1/3) — submission + officer review + manager final approval. |
| `sequence-property-mint.mmd` | `sequence-property-mint.png` | `a4/sequence-property-mint.png` | Property approval (2/3) — deed PDF + SSI VC + IPFS pin + NFT mint on blockchain. |
| `sequence-property-verify.mmd` | `sequence-property-verify.png` | `a4/sequence-property-verify.png` | Property approval (3/3) — citizen download + public verifier (PDF + on-chain `ownerOf`). |
| `sequence-id-issuance.mmd` | `sequence-id-issuance.png` | `a4/sequence-id-issuance.png` | Full ID-card issuance: 5-step wizard → citizen create → card issue → NFC encode → SSI VC → print. |
| `user-flow-citizen.mmd` | `user-flow-citizen.png` | `a4/user-flow-citizen.png` | Citizen journey: landing → sign in → register property → wait for officer + manager → receive deed + NFT licence. Includes "My Wallet (NFT licences)" branch. |
| `user-flow-officer.mmd` | `user-flow-officer.png` | `a4/user-flow-officer.png` | Officer + Department-manager journey: queue → review → recommend; manager approval queue → final approve → triggers PAdES + SSI + IPFS + mint chain. |

## Regenerating

| Want | Run |
|---|---|
| Default-size PNGs (rebuild after editing `.mmd`) | `pnpm diagrams:render` (or `node docs/diagrams/render.mjs`) |
| A4-tuned PNGs only (`a4/*.png`) | `node docs/diagrams/render-a4.mjs` |
| Pure-white classic-UML PNGs (`../diagrams-classic/*.png`, local mmdc) | `node docs/diagrams/render-classic-local.mjs` |
| One A4 PDF combining everything (`docs/Sarh-Diagrams-A4.pdf`) | `pnpm diagrams:pdf` |
| Pure-white classic-UML PDF (`docs/Sarh-Diagrams-Classic.pdf`) | `node docs/print-classic-pdf.mjs` |

The PNGs are rendered via mermaid.ink first (fast), falling back to kroki.io
for diagrams whose URL exceeds mermaid.ink's GET-limit. The classic-UML look
(white background, black strokes, no coloured fills) is set by the
`%%{init: …}%%` directive `render-a4.mjs` injects per file, plus the source
`.mmd` files which carry no `classDef` styling.

The PDF builder reads `docs/diagrams-a4.html` (cover + TOC + section
dividers + every PNG above wrapped in A4 page-break CSS) and uses
Puppeteer to print to A4. Re-run after any `.mmd` change.

Two scripts side by side:

- `node render.mjs`     — default-size PNGs in this folder.
- `node render-a4.mjs`  — A4-tuned PNGs into `a4/`.

Each accepts an optional list of names to render only those:

```bash
node render-a4.mjs db-schema-identity org-chart
```

Both base64-url-encode the source and call **mermaid.ink** first
(fast on Windows — no Chromium download from `@mermaid-js/mermaid-cli`).
If mermaid.ink returns 414 (URL too long) or a 5xx, they transparently
fall back to **kroki.io** via POST. PNGs are saved next to their `.mmd`
source (or under `a4/` for the A4 variant).

For very dense diagrams (≥120 classes/tables) both online services may
fail — kroki sometimes crashes its puppeteer worker on
`class-diagram.mmd` and the full `db-schema.mmd`. Render those locally
instead:

```powershell
# one-time
npx -y puppeteer browsers install chrome-headless-shell

# render
npx -y -p @mermaid-js/mermaid-cli mmdc `
  -i class-diagram.mmd -o class-diagram.png `
  -b "#FBFAF6" -w 2400 -H 2200 -p .puppeteer.json
```

## Editing tips

- These are Arabic-RTL friendly. Mermaid renders the boxes left-to-right
  but the labels render correctly with mixed Arabic + Latin.
- `db-schema.mmd` is dense — when you add a table, mirror the SQL DDL
  in `infra/mssql/migrations/*.sql` first, then update the `erDiagram`.
  Don't forget to also add the column to the right cluster file
  (`db-schema-{identity,property,system}.mmd`) and to its
  `data-dictionary-*.mmd` companion.
- The role colours in `system-flow.mmd` come from the Sarh brand:
  - `#3b82f6` blue — citizen
  - `#0891B2` green — officer / reviewer
  - `#F97316` gold — ID issuer
  - `#0F172A` black — admin / auditor
  - `#5b21b6` purple — department manager (matches the org-chart)
