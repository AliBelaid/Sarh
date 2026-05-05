# Sarh — Project documentation

This folder is the canonical home for Sarh technical documentation.

## What's inside

| File | Purpose |
| ---- | ------- |
| **`Sarh.pdf`** | Master technical document — RTL, 32 pages. Cover, TOC, executive summary, architecture, conceptual & logical ERDs, data dictionary, class diagram, sequence diagrams, user flows, UI/UX guide, wireframes, JSON API contracts, security, roadmap. |
| `sarh.html` | Source HTML for the PDF (regenerate via `print-pdf.mjs`). |
| `print-pdf.mjs` | Node script that renders `sarh.html` → `Sarh.pdf` using the locally cached Chromium. Run: `node print-pdf.mjs`. |
| `data-dictionary.md` | Field-by-field reference for every SQL Server table. |
| `api-samples.json` | Full request/response samples for every public API endpoint. |
| `ui-ux.md` | Visual system, brand tokens, component primitives, RTL rules. |
| `runbook.md` | Operational runbook (existing). |
| `security-review.md` | Security checklist (existing). |
| `schema.sql` | Snapshot of the SQL Server schema (regenerate from `infra/mssql/migrations/`). |
| `architecture-diagram.svg` | High-level architecture line-art (existing). |
| `diagrams/` | Mermaid sources + rendered PNGs. See `diagrams/README.md`. |
| `wireframes/` | SVG wireframes for the five canonical screens. |
| `_archived_Hay.pdf.bak` | Legacy graduation-project PDF — superseded by `Sarh.pdf`. Delete when no longer needed. |

## Regenerating the PDF

```powershell
cd D:\Sarh\docs
node print-pdf.mjs
```

The HTML loads the diagram PNGs and SVG wireframes from this folder via relative paths, so make sure those exist (run `node diagrams/render.mjs` first if you've edited a `.mmd`).

## Style

- All Arabic-first text in the PDF is RTL.
- Latin numerals/IDs use `direction: ltr` so digits render correctly inline.
- Brand tokens come from `apps/web/src/styles.scss` — keep them in sync.
