# Sarh — UI/UX Design Notes

This file documents the visual system shipped in `apps/web/` so future contributors keep components consistent without rummaging through every component file.

## Brand identity

| Token | Hex | Use |
| ----- | --- | --- |
| `--primary` (Libyan black) | `#0F172A` | sidebars, primary buttons, headers |
| `--accent` (gold) | `#F97316` | active nav indicator, CTA fill, highlights, NFC card band |
| `--warn` (Libyan red) | `#DC2626` | reject decisions, error banners, danger pills |
| `--good` (Libyan green) | `#0891B2` | approve decisions, success pills, ✓ markers |
| `--paper` | `#FAFAF9` | page bg, light cards |
| `--rule` | `#E5E7EB` | dividers, input borders |
| `--ink` | `#0F172A` | primary text |
| `--muted` | `#64748B` | secondary text, captions |

The palette comes from the Libyan flag (red-black-green) plus a heritage gold inspired by Ottoman-era Libyan registry stamps. **Never** introduce blue/purple shades — they conflict with the official identity.

## Typography

```css
--font-ar: 'IBM Plex Arabic', 'Cairo', system-ui, sans-serif;
--font-en: system-ui, 'Segoe UI', Tahoma, sans-serif;
--font-mono: 'JetBrains Mono', 'Consolas', monospace;
```

- Page title: 22px / 700 / `--ink`
- Section heading: 16px / 700
- Body: 13px / 400, line-height 1.7 for Arabic
- Captions / labels: 11.5px / 600 / `--muted`
- Numeric / IDs: monospace + `dir="ltr"` to keep digits left-to-right inside an RTL line

## Layout system

The whole authenticated app sits behind a single `LayoutComponent` with two regions:

```
┌──────────────────────────────────────────┬────────────┐
│  Topbar (white) — breadcrumb + lang/logout│            │
├──────────────────────────────────────────┤            │
│                                          │            │
│         Page content (paper bg)          │  Sidebar   │
│                                          │  (dark     │
│         max-width: 1280px / 1100px       │   gradient)│
│                                          │            │
└──────────────────────────────────────────┴────────────┘
```

For RTL the sidebar is on the **right**. The dark gradient (`#0F172A → #1e293b`) plus a hairline gold underline on the brand row mirrors the IMFAS template the user requested.

## Component primitives

### Card

```html
<div class="card">…</div>
```
```css
background: var(--paper);
border: 1px solid var(--rule);
border-radius: 14px;
padding: 22px;
```

A page typically contains 1–3 cards. KPI tiles, info panels, form panels and master-detail wraps all follow this pattern.

### Status pill

Centralised in `apps/web/src/app/shared/status-pills.ts`. Each pill is a coloured rounded chip with white text. Property and card statuses each have their own colour mapping — never invent colours per page.

```html
<span class="badge" [style.background]="status_(p.status).color">
  {{ status_(p.status).ar }}
</span>
```

### Filter chips

Pill buttons with an optional `--c` CSS custom property for the active colour. Clicking sets a signal that triggers a reload via `computed()`.

### Buttons

| Class | Use |
| ----- | --- |
| `.btn-primary` | dark fill, gold text — confirm / submit |
| `.btn-secondary` | white fill, ink text, gold hover border — back / cancel |
| `.btn-back` | transparent, muted text — secondary navigation |
| `.danger` modifier | swaps background to `--warn` for destructive actions |

All buttons share `padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700`.

### Form fields

```html
<label>
  <span>الحقل</span>
  <input type="text" />
</label>
```

- Label above input, both inside a flex column gap 6px
- Input border `1px solid var(--rule)` → `var(--accent)` on focus, no outline
- Validation errors appear below the input as a red span

### Map panels

All maps use Leaflet 1.9.4 + OSM tiles. Region centroids come from `REGION_CENTROIDS` in the page that uses them (Libya: 22 governorates 10–31). Markers are status-coloured `L.divIcon`, with deterministic jitter from `hashId(p.id)` so two properties at the same centroid don't stack.

## RTL & i18n rules

1. Default direction is `rtl` (set on `<html>`). English labels use `dir="ltr"` inline.
2. Numbers, IDs, dates rendered with `direction: ltr` and a monospace font — Arabic punctuation rules don't fight LTR digits this way.
3. Every error envelope returned by the API contains both `message_ar` and `message_en`. The current language toggle (saved in `localStorage` as `sarh.lang`) picks one; the UI never falls back silently.
4. Validation messages are **always Arabic-first**.

## Navigation tree

| Group | Citizen | Officer (registry/reviewer) | ID Issuer | Admin / Auditor |
| ----- | ------- | --------------------------- | --------- | --------------- |
| **Main** | Dashboard, My Properties, My Digital ID | Dashboard, Queue, Approvals | Dashboard, Issue station | Dashboard |
| **Admin** | — | — | — | Properties (map), Citizens, Digital IDs, Users, Audit, Reports |

Role gating is enforced both client-side (`roleGuard`) **and** server-side (`[OfficerOnly]` filter on .NET controllers). Routes a user can't access redirect to `/forbidden`.

## Wireframes (this doc)

See `docs/wireframes/` — six hand-drawn-style SVG mockups:

1. `01-login.svg` — glass card on dark gradient with quick-fill chips.
2. `02-dashboard.svg` — admin-flavoured dashboard with KPI tiles and a region distribution chart.
3. `03-property-registration.svg` — split master-detail: form on the right, Leaflet polygon picker on the left.
4. `04-officer-review.svg` — hero details + map + 3-button decision toggle.
5. `05-public-verify.svg` — anonymous verify page with QR, signed-deed download and the property's location.
6. `06-license-issuance.svg` — Department Manager final approval with NFT licence preview, decree input, and a 5-step minting progress strip (PAdES → SSI VC → IPFS pin → mint() → confirm).

## Property Licence (NFT) screen — `/app/approvals/:id` (department_manager)

A new role and a new page are introduced for the on-chain licence flow:

- **Role**: `department_manager` — sits between `reviewer` and `super_admin`. Their dashboard tile is the **Approvals queue** (status=`under_review`).
- **Page layout** (`docs/wireframes/06-license-issuance.svg`):
  - Two-column hero. Left column = property summary card + officer recommendation banner (cyan accent ✓). Right column = dark NFT preview card (gold band, polygon art, token-id placeholder, contract address) + decree number input + auto-mint checkbox.
  - Below the hero, a **minting progress strip** with five circular pills: 1) PAdES sign, 2) SSI VC issue, 3) IPFS pin metadata.json, 4) `mint()` call, 5) save tokenId + tx_hash + notify. Pills go cyan-filled when complete, gold-filled when active, hollow when pending.
  - Footer action bar: ghost "Reject" + ghost "Request clarification" + primary "اعتماد وإصدار NFT ↗" (black with gold text). The primary button is disabled until the decree number is filled.
- **State**: the page subscribes to a SignalR channel `nft:mint:{propertyId}` while minting is in progress and updates the pill colours live; reaching pill 5 navigates to `/app/digital-ids` style detail page for the new NFT.
- **Network selector** lives in `/app/admin/blockchain` (super_admin only) — never on the manager screen, so the manager can't accidentally swap chains.

## NFT licences ledger — `/app/nft-licences` (admin / auditor)

Mirror the existing `/app/digital-ids` table style: cursor-paginated rows of `{property_code, owner, token_id, contract, network, mint_tx_hash, status pill, minted_at}`. Status pill mapping:

| Status | Pill colour | Arabic label |
|---|---|---|
| `pending` | `--muted` grey | قيد السكّ |
| `minted` | `--good` cyan | معتمدة |
| `transferred` | `--accent` gold | محوَّلة |
| `burned` | `--warn` red | ملغاة |

Clicking a row opens a detail drawer showing the full ownership_history timeline and a button to view the transaction on the configured block explorer (`etherscan.io/tx/...` or the Hyperledger Explorer URL).

## Accessibility checklist

- Min touch target 36px (most buttons are 38–44px)
- Focus ring is 2px gold on inputs, never removed without replacement
- Status colour is **always** paired with an icon or label — never colour-only
- Arabic numerals are localised via `Number.toLocaleString('ar-LY')` for area / counts; dates stay in `en-GB` Gregorian (the registry standard)
- All decorative SVG has `role="presentation"` or `aria-hidden`

## What changed in this re-skin

The earlier Material 17 build was discarded after the user requested an IMFAS-template look. The current build:

- Removes `@angular/material` from every screen (only Leaflet + plain CSS remain)
- Unifies all four legacy portals (`web-citizen`, `web-officer`, `web-id-issuer`, `web-admin`) into a single Angular 21 app at `apps/web/`
- Introduces the dark sidebar / paper page split documented above
- Uses Angular 21 signals + `@if`/`@for` template syntax (no `*ngIf`)
