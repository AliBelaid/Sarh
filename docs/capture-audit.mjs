// Focused screenshot of the admin Audit page (سجل التدقيق) after the audit/
// notification overhaul. Web on :4300, API on :3001. Logs in as super_admin
// and injects the JWT into localStorage (same keys AuthService uses).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'project', 'screenshots');
await mkdir(outDir, { recursive: true });

const BASE = process.env.SARH_WEB || 'http://localhost:4300';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);
const puppeteerPath = require.resolve('puppeteer', {
  paths: ['C:\\Users\\Ali\\AppData\\Roaming\\npm\\node_modules', process.cwd()],
});
const puppeteer = (await import(pathToFileURL(puppeteerPath).href)).default;

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1.5 },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)); });

async function ready() {
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().length > 0,
    { timeout: 20000 },
  ).catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready : true)).catch(() => {});
}

async function authViaApi(email, password) {
  const res = await fetch('http://localhost:3001/api/v1/auth/sign-in', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${res.status}`);
  return res.json();
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await ready();
  const sess = await authViaApi('admin@sarh.ly', 'Demo!12345');
  await page.evaluate((s) => {
    localStorage.setItem('sarh.access_token', s.access_token);
    localStorage.setItem('sarh.user', JSON.stringify(s.user));
  }, sess);

  await page.goto(`${BASE}/app/audit`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await ready();
  await page.waitForSelector('.tbl tbody tr, .empty', { timeout: 15000 }).catch(() => {});
  await wait(2500);
  await page.screenshot({ path: join(outDir, 'audit-page.png'), fullPage: true });
  console.log('  ✓ audit-page.png');

  // Open the detail drawer on the first row to show before/after state.
  const row = await page.$('.tbl tbody tr.clickable');
  if (row) {
    await row.click();
    await wait(1500);
    await page.screenshot({ path: join(outDir, 'audit-detail-drawer.png') });
    console.log('  ✓ audit-detail-drawer.png');
  }
} catch (e) {
  console.log('  ✗', e.message);
} finally {
  await browser.close();
}
