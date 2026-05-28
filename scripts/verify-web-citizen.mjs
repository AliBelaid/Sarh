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

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT_DIR}/01-login.png`, fullPage: true });

// Switch to PIN tab and fill Ahmed's credentials.
await page.getByRole('tab', { name: /هوية رقمية/ }).click();
await page.locator('input[name="digitalId"]').fill('LY-11-2026-000101-0');
await page.locator('input[name="pin"]').fill('123456');
await page.locator('button[type="submit"]').click();

await page.waitForURL(/\/app\/dashboard/, { timeout: 10_000 });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: `${OUT_DIR}/02-dashboard.png`, fullPage: true });

// Walk the sidebar — find every visible nav link and confirm it resolves.
const links = await page.locator('aside.sidebar a.nav-link').evaluateAll(els =>
  els.map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href') }))
);
findings.push(`sidebar links seen: ${links.length}`);
for (const l of links) {
  await page.goto(`${BASE}${l.href}`, { waitUntil: 'networkidle' });
  const url = page.url();
  const ok = !url.includes('/forbidden') && !url.includes('/login');
  findings.push(`${ok ? 'OK' : 'BLOCKED'} ${l.href} -> ${url} (${l.label})`);
}

// Final stop: My digital ID page — screenshot for visual proof of the BIN.
await page.goto(`${BASE}/app/my/digital-id`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800); // let the card render
await page.screenshot({ path: `${OUT_DIR}/03-my-digital-id.png`, fullPage: true });

const bin = await page.locator('.card-bottom .val.mono.small').first().textContent().catch(() => null);
findings.push(`BIN on page: ${bin ?? '(not found)'}`);

await browser.close();
console.log(findings.join('\n'));
