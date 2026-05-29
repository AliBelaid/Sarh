import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Ali/AppData/Roaming/npm/node_modules/playwright');

const BASE = process.env.SARH_WEB_BASE ?? 'http://localhost:4200';
const OUT_DIR = 'docs/runtime-checks';

import { mkdirSync } from 'node:fs';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'ar-LY' });
const page = await ctx.newPage();

const findings = [];

page.on('pageerror', (e) => findings.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().startsWith(BASE)) {
    findings.push(`HTTP ${r.status()} ${r.url()}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/01-login.png`, fullPage: true });

// Switch to PIN tab and fill Ahmed's credentials.
await page.getByRole('tab', { name: /هوية رقمية/ }).click();
await page.locator('input[name="digitalId"]').fill('LY-11-2026-000101-0');
await page.locator('input[name="pin"]').fill('123456');
await page.locator('button[type="submit"]').click();

await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 });
await page.waitForLoadState('networkidle');
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/02-dashboard.png`, fullPage: true });

// Walk the sidebar — find every visible nav link and confirm it resolves.
const links = await page.locator('aside.sidebar a.nav-link').evaluateAll(els =>
  els.map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') }))
);
findings.push(`sidebar links seen: ${links.length}`);
for (const l of links) {
  await page.goto(`${BASE}${l.href}`, { waitUntil: 'domcontentloaded' });
  const url = page.url();
  const ok = !url.includes('/forbidden') && !url.includes('/login');
  findings.push(`${ok ? 'OK' : 'BLOCKED'} ${l.href} -> ${url} (${l.label})`);
}

// Final stop: My digital ID page — screenshot for visual proof of the BIN.
await page.goto(`${BASE}/app/my/digital-id`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800); // let the card render
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/03-my-digital-id.png`, fullPage: true });

const bin = await page.locator('.card-bottom .val.mono.small').first().textContent().catch(() => null);
findings.push(`BIN on page: ${bin ?? '(not found)'}`);

// ─── new-property wizard: polygon area + mandatory attachments ──────
// The area is no longer length × width (parcels are rarely rectangles):
// it is computed from the drawn boundary polygon, and the registry now
// requires site photos + a koreky (croquis) sketch before submit. This
// net catches reversions to the old dimensions flow on the citizen page.
await page.goto(`${BASE}/app/my/properties/new`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.map', { state: 'visible' });
await page.waitForTimeout(500); // let Leaflet finish tile load
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/70-wizard-empty.png`, fullPage: true });

// The old dimensions flow must be gone: no direct area input, no
// length/width inputs, no "احسب المساحة" button.
const directAreaInputs = await page.locator('input[name="areaSqm"]').count();
const lengthInputs = await page.locator('input[name="lengthM"]').count();
const computeBtns = await page.locator('button:has-text("احسب المساحة")').count();
findings.push(`wizard: areaSqm inputs=${directAreaInputs}, lengthM inputs=${lengthInputs}, compute buttons=${computeBtns} (all expected 0)`);

const submit = page.locator('button[type="submit"]:has-text("إرسال للمراجعة")');
const areaResult = page.locator('.area-result').first();

// State 0: empty form — no polygon yet, so area-result is not .ok and
// submit is disabled.
const okEmpty = await areaResult.evaluate((el) => el.classList.contains('ok'));
findings.push(`wizard: empty → area .ok=${okEmpty} (expected false)`);

// Pick a region. Fire both input + change for the signal-form CVA.
const regionSel = page.locator('select[name="regionId"]');
await regionSel.selectOption({ label: 'طرابلس' });
await regionSel.evaluate((el) => {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(150);

// Draw a 4-point polygon — area must compute from the map automatically.
await page.waitForTimeout(800); // let Leaflet finish tile load
const mapBox = await page.locator('.map').boundingBox();
if (mapBox) {
  const cx = mapBox.x + mapBox.width / 2;
  const cy = mapBox.y + mapBox.height / 2;
  for (const [dx, dy] of [[-60, -60], [60, -60], [60, 60], [-60, 60]]) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(100);
  }
}
const okPolygon = await areaResult.evaluate((el) => el.classList.contains('ok'));
const areaText = (await areaResult.textContent())?.trim();
findings.push(`wizard: polygon drawn → area .ok=${okPolygon} (expected true), text="${areaText}"`);
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/71-wizard-area.png`, fullPage: true });

// Attachments still missing → submit must stay disabled.
const submitNoFiles = await submit.isEnabled();
findings.push(`wizard: no attachments → submit enabled=${submitNoFiles} (expected false)`);

// Upload one photo + one koreky via in-memory PNG buffers (hits the real
// /uploads/property-document endpoint, so the API must be up).
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const photoInput = page.locator('input[type="file"][multiple]');
await photoInput.setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: png });
const korekyInput = page.locator('input[type="file"]:not([multiple])');
await korekyInput.setInputFiles({ name: 'koreky.png', mimeType: 'image/png', buffer: png });
await page.waitForTimeout(1200); // let both uploads resolve

const fileRows = await page.locator('.file-list li').count();
const submitEnabled = await submit.isEnabled();
findings.push(`wizard: attachments uploaded rows=${fileRows} (expected 2), submit enabled=${submitEnabled} (expected true)`);
await page.screenshot({ timeout: 60_000, path: `${OUT_DIR}/72-wizard-ready.png`, fullPage: true });

await browser.close();
console.log(findings.join('\n'));
