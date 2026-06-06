// Captures real UI screenshots of the running Sarh web app (http://localhost:4200,
// API on :3001) into docs/project/screenshots/*.png via the global Puppeteer.
// Requires the web dev server + API to be running. Logs in with demo accounts.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'project', 'screenshots');
await mkdir(outDir, { recursive: true });

const BASE = process.env.SARH_WEB || 'http://localhost:4300';
const CONFLICT_ID = '01744725-538A-4F99-8AF0-7FFFDD3430EF';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(import.meta.url);
const puppeteerPath = require.resolve('puppeteer', {
  paths: ['C:\\Users\\Ali\\AppData\\Roaming\\npm\\node_modules', process.cwd()],
});
const puppeteer = (await import(pathToFileURL(puppeteerPath).href)).default;

const browser = await puppeteer.launch({
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=ar'],
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });

const done = [];
const fail = [];

// Wait until the global stylesheet has loaded (CSS custom properties resolve)
// and webfonts are ready — otherwise screenshots render unstyled.
async function ready(page) {
  await page
    .waitForFunction(
      () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().length > 0,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready : true)).catch(() => {});
}

async function shot(page, name, { selector, settle = 1500 } = {}) {
  try {
    await ready(page);
    if (selector) await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {});
    await wait(settle);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    done.push(name);
    console.log('  ✓', name);
  } catch (e) {
    fail.push(`${name}: ${e.message}`);
    console.log('  ✗', name, e.message);
  }
}

async function gotoReady(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await ready(page);
}

// UI login is flaky under the dev server, so authenticate via the API and
// inject the JWT into localStorage (the exact keys AuthService uses). The page
// must already be on the :4200 origin when setSession runs.
async function authViaApi(email, password) {
  const res = await fetch('http://localhost:3001/api/v1/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in ${res.status} for ${email}`);
  const j = await res.json();
  return { token: j.access_token, user: j.user };
}

async function setSession(page, sess) {
  await page.evaluate((s) => {
    if (s) {
      localStorage.setItem('sarh.access_token', s.token);
      localStorage.setItem('sarh.user', JSON.stringify(s.user));
    } else {
      localStorage.removeItem('sarh.access_token');
      localStorage.removeItem('sarh.user');
    }
  }, sess);
}

try {
  // 1) Public login page (no auth). Lands us on the :4200 origin.
  await gotoReady(page, '/login');
  await shot(page, '01-login', { selector: '.card', settle: 1800 });

  // 2) Officer (Tripoli) — queue, the CONFLICT review page, region map.
  await setSession(page, await authViaApi('officer@sarh.ly', 'Demo!12345'));
  await gotoReady(page, '/app/queue');
  await shot(page, '02-officer-queue', { settle: 1800 });
  await gotoReady(page, `/app/review/${CONFLICT_ID}`);
  await shot(page, '03-officer-review-conflict', { selector: '.conflict-banner', settle: 4000 });
  await gotoReady(page, '/app/map');
  await shot(page, '04-officer-map', { selector: 'app-parcel-map', settle: 4000 });

  // 3) Citizen — draw a new parcel (registered parcels shown as a backdrop).
  await setSession(page, await authViaApi('ahmed@sarh.ly', 'Demo!12345'));
  await gotoReady(page, '/app/my/properties/new');
  await shot(page, '05-citizen-new-property', { settle: 4000 });

  // 4) Public cadastral map + verify (no auth).
  await setSession(page, null);
  await gotoReady(page, '/map');
  await shot(page, '06-public-map', { selector: 'app-parcel-map', settle: 4000 });
  await gotoReady(page, '/verify');
  await shot(page, '07-verify', { settle: 1800 });
} finally {
  await browser.close();
}

console.log(`\nCaptured ${done.length}: ${done.join(', ')}`);
if (fail.length) console.log(`Failed ${fail.length}:\n - ${fail.join('\n - ')}`);
