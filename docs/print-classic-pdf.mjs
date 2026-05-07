// Renders docs/diagrams-classic.html → docs/Sarh-Diagrams-Classic.pdf via Puppeteer.
// Mirrors print-diagrams-pdf.mjs but targets the pure-white classic UML deck.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, 'diagrams-classic.html');
const pdfPath = join(here, 'Sarh-Diagrams-Classic.pdf');

await stat(htmlPath);

const require = createRequire(import.meta.url);
const puppeteerPath = require.resolve('puppeteer', {
  paths: [
    'C:\\Users\\Ali\\AppData\\Roaming\\npm\\node_modules',
    'C:\\Users\\Ali\\AppData\\Roaming\\npm-cache',
    process.cwd(),
  ],
});
const puppeteer = (await import(pathToFileURL(puppeteerPath).href)).default;

console.log('Launching Chromium…');
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  console.log(`Loading ${htmlPath} …`);
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });

  console.log('Printing to PDF…');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="font-size:8pt; width:100%; padding: 0 14mm; color:#444; border-top:1px solid #000; padding-top:3mm; display:flex; justify-content:space-between; direction:ltr; font-family: system-ui;">
        <span>Sarh — System diagrams · Classic UML edition</span>
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '14mm', bottom: '18mm', left: '12mm', right: '12mm' },
  });

  const s = await stat(pdfPath);
  console.log(`✓ Wrote ${pdfPath} — ${(s.size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
