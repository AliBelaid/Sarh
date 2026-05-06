# Sarh — System diagrams

Source files are Mermaid (`.mmd`); each is rendered to a `.png` of the same
name. Both are committed so you don't need any tooling to read them.

| Source | PNG | What it shows |
|---|---|---|
| `use-case.mmd` | `use-case.png` | Use-case diagram (مخطط حالات الاستخدام) — Citizen / Registry officer / Department manager actors against 19 use-cases inside the platform, with external systems (SSI, Map, Notification, NFT minting, IPFS). |
| `conceptual-erd.mmd` | `conceptual-erd.png` | High-level Conceptual ERD — entities only, no columns. Includes PROPERTY_NFT, OWNERSHIP_HISTORY, BLOCKCHAIN_TX, SMART_CONTRACT and DEPARTMENT_MANAGER. |
| `db-schema.mmd` | `db-schema.png` | Logical ERD — full SQL Server schema. Includes `property_nfts` and `ownership_history` tables for the on-chain licence flow. |
| `class-diagram.mmd` | `class-diagram.png` | Domain class diagram for the .NET 8 backend. Adds `PropertyNft`, `OwnershipHistory`, `BlockchainService`, `SmartContract`, `IpfsService`, `DepartmentManager`. |
| `dfd-level0-context.mmd` | `dfd-level0-context.png` | DFD Context (Level 0) — Sarh Platform as a single process with all external entities (Citizen, Registry officer, Department manager, SSI, Map, Notification, NFT minting service). |
| `dfd-level1.mmd` | `dfd-level1.png` | DFD Level 1 — five main processes (Account & Identity, Land Claim Processing, Spatial Auditing, NFT Documentation & Minting, Notifications) with data stores including `D3 Blockchain Ledger`. |
| `dfd-level2-spatial.mmd` | `dfd-level2-spatial.png` | DFD Level 2 — decomposition of process 3.0 (Document Review → Spatial Conflict Check → Technical Map Generation → Status Update). |
| `system-flow.mmd` | `system-flow.png` | End-to-end flow chart by role (citizen → officer → manager → ID issuer → admin) with the .NET 8 API, SQL Server, ACA-Py, IPFS, and the blockchain at the centre. |
| `sequence-signin.mmd` | `sequence-signin.png` | `POST /api/v1/auth/sign-in` from browser → proxy → AuthController → BCrypt.Verify → JWT issuance. |
| `sequence-property-approval.mmd` | `sequence-property-approval.png` | Property submission → officer review → manager final approval → PAdES deed → SSI VC → IPFS pin → NFT mint on blockchain → public verify (PDF + on-chain `ownerOf`). |
| `sequence-id-issuance.mmd` | `sequence-id-issuance.png` | Full ID-card issuance: 5-step wizard → citizen create → card issue → NFC encode → SSI VC → print. |
| `user-flow-citizen.mmd` | `user-flow-citizen.png` | Citizen journey: landing → sign in → register property → wait for officer + manager → receive deed + NFT licence. Includes "My Wallet (NFT licences)" branch. |
| `user-flow-officer.mmd` | `user-flow-officer.png` | Officer + Department-manager journey: queue → review → recommend; manager approval queue → final approve → triggers PAdES + SSI + IPFS + mint chain. |

## Regenerating PNGs

Run `node render.mjs` from this folder. With no arguments it re-renders every
`.mmd`; pass names to render only those:

```bash
node render.mjs conceptual-erd class-diagram
```

The script base64-url-encodes the source and asks **mermaid.ink** to render
it (fast on Windows — no Chromium download from `@mermaid-js/mermaid-cli`).
If mermaid.ink returns 414 (URL too long) or a 5xx, it transparently falls
back to **kroki.io** via POST. PNGs are saved next to their `.mmd` source.

For very dense diagrams (≥120 classes/tables) both online services may fail
— kroki sometimes crashes its puppeteer worker on `class-diagram.mmd` and
`db-schema.mmd`. Render those locally instead:

```powershell
# one-time
npx -y puppeteer browsers install chrome-headless-shell

# render
npx -y -p @mermaid-js/mermaid-cli mmdc `
  -i class-diagram.mmd -o class-diagram.png `
  -b "#FBFAF6" -w 2400 -H 2200 -p .puppeteer.json
```

The committed `.puppeteer.json` already points at the cached
`chrome-headless-shell` binary on this machine.

## Editing tips

- These are Arabic-RTL friendly. Mermaid renders the boxes left-to-right but
  the labels render correctly with mixed Arabic + Latin.
- `db-schema.mmd` is dense — when you add a table, mirror the SQL DDL in
  `infra/mssql/migrations/*.sql` first, then update the `erDiagram`.
- The role colours in `system-flow.mmd` come from the Sarh brand:
  - `#3b82f6` blue — citizen
  - `#0891B2` green — officer / reviewer
  - `#F97316` gold — ID issuer
  - `#0F172A` black — admin / auditor
