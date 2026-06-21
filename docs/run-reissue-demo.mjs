// Drives the id-issuer "reissue card" flow end-to-end in the real web app to
// show the new initial-PIN feature. Web on :4300, API on :3001. Logs in as
// id_issuer, searches the placeholder citizen, reissues, and screenshots the
// PIN box. Throwaway citizen ("مستخدم") so it doesn't disturb demo logins.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'project', 'screenshots');
await mkdir(outDir, { recursive: true });

const WEB = process.env.SARH_WEB || 'http://localhost:4300';
const API = 'http://localhost:3001/api/v1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);
const puppeteerPath = require.resolve('puppeteer', {
  paths: ['C:\\Users\\Ali\\AppData\\Roaming\\npm\\node_modules', process.cwd()],
});
const puppeteer = (await import(pathToFileURL(puppeteerPath).href)).default;

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 1.4 },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });

async function ready() {
  await page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().length > 0,
    { timeout: 20000 },
  ).catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready : true)).catch(() => {});
}

async function authViaApi(email, password) {
  const res = await fetch(`${API}/auth/sign-in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${res.status}`);
  return res.json();
}

try {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await ready();
  await page.screenshot({ path: join(outDir, 'run-1-login.png') });
  console.log('  ✓ run-1-login.png');

  const sess = await authViaApi('idissuer@sarh.ly', 'Demo!12345');
  await page.evaluate((s) => {
    localStorage.setItem('sarh.access_token', s.access_token);
    localStorage.setItem('sarh.user', JSON.stringify(s.user));
  }, sess);
  console.log('  ✓ logged in as id_issuer:', sess.user.role);

  await page.goto(`${WEB}/app/issue/reissue`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await ready();
  await wait(800);
  await page.screenshot({ path: join(outDir, 'run-2-reissue-page.png') });
  console.log('  ✓ run-2-reissue-page.png');

  // 1) search the placeholder citizen
  await page.waitForSelector('input.search', { timeout: 10000 });
  await page.type('input.search', 'مستخدم');
  await page.click('.search-row button.btn-primary');
  await page.waitForSelector('ul.results li.row', { timeout: 10000 });
  await wait(400);

  // 2) select first result
  await page.click('ul.results li.row');
  await page.waitForSelector('select[name="reason"]', { timeout: 10000 });
  await wait(500);

  // 3) pick a reason and confirm reissue
  await page.select('select[name="reason"]', 'lost');
  await wait(200);
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button.btn-primary')];
    const b = btns.find((x) => x.textContent.includes('تأكيد إعادة الإصدار'));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('  reissue button clicked:', clicked);

  // 4) wait for the PIN box
  await page.waitForSelector('.pin-box .pin-value', { timeout: 15000 });
  const pin = await page.$eval('.pin-box .pin-value', (el) => el.textContent.trim());
  console.log('  ✓ PIN shown in UI:', pin);
  await wait(400);
  await page.screenshot({ path: join(outDir, 'run-3-reissue-pin.png') });
  console.log('  ✓ run-3-reissue-pin.png');
} catch (e) {
  console.log('  ✗', e.message);
  await page.screenshot({ path: join(outDir, 'run-error.png') }).catch(() => {});
} finally {
  await browser.close();
}
