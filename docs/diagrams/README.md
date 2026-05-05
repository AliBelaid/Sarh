# Sarh — System diagrams

Source files are Mermaid (`.mmd`); each is rendered to a `.png` of the same
name. Both are committed so you don't need any tooling to read them.

| Source | PNG | What it shows |
|---|---|---|
| `conceptual-erd.mmd` | `conceptual-erd.png` | High-level Conceptual ERD — entities only, no columns. Foundation for the logical model. |
| `db-schema.mmd` | `db-schema.png` | Logical ERD — full SQL Server schema (citizens, properties, officers, digital ID cards, NFC secrets, audit log, SSI wallets, notifications). |
| `class-diagram.mmd` | `class-diagram.png` | Domain class diagram for the .NET 8 backend (Citizen, Officer, Property, DigitalIdCard, JwtTokenService, PadesSigner, …). |
| `system-flow.mmd` | `system-flow.png` | End-to-end flow chart by role (citizen → officer → ID issuer → admin) with the .NET 8 API, SQL Server, local FS, and ACA-Py at the centre. |
| `sequence-signin.mmd` | `sequence-signin.png` | `POST /api/v1/auth/sign-in` from browser → proxy → AuthController → BCrypt.Verify → JWT issuance. |
| `sequence-property-approval.mmd` | `sequence-property-approval.png` | Property submission, officer review, PAdES-signed deed, SSI VC issuance, public verify-by-QR. |
| `sequence-id-issuance.mmd` | `sequence-id-issuance.png` | Full ID-card issuance: 5-step wizard → citizen create → card issue → NFC encode → SSI VC → print. |
| `user-flow-citizen.mmd` | `user-flow-citizen.png` | Citizen journey: landing → sign in → register property → wait for review → receive deed. |
| `user-flow-officer.mmd` | `user-flow-officer.png` | Officer journey: queue → review → decision (approve / clarify / reject); ID-issuer & admin branches. |

## Regenerating PNGs

Run `node render.mjs` from this folder. With no arguments it re-renders every
`.mmd`; pass names to render only those:

```bash
node render.mjs conceptual-erd class-diagram
```

The script base64-url-encodes the source and asks **mermaid.ink** to render
it (fast on Windows — no Chromium download from `@mermaid-js/mermaid-cli`).
PNGs are saved next to their `.mmd` source.

If you have a working install of `@mermaid-js/mermaid-cli`:

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i db-schema.mmd -o db-schema.png -b transparent -w 2400 -H 2200
```

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
