// Renders docs/diagrams-a4.html → docs/Sarh-Diagrams-A4.pdf via Puppeteer.
// Mirrors print-pdf.mjs (the Sarh.pdf builder) but targets the A4 diagrams
// deck. PNGs are loaded relative to the HTML file (diagrams/a4/*.png).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, 'diagrams-a4.html');
const pdfPath = join(here, 'Sarh-Diagrams-A4.pdf');

await stat(htmlPath); // throws if missing

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
      <div style="font-size:8pt; width:100%; padding: 0 14mm; color:#5C6661; border-top:1px solid #E6E2D6; padding-top:3mm; display:flex; justify-content:space-between; direction:ltr; font-family: system-ui;">
        <span>Sarh — System diagrams · A4 edition</span>
        <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '14mm', bottom: '18mm', left: '12mm', right: '12mm' },
  });

  const s = await stat(pdfPath);
  console.log(`✓ Wrote ${pdfPath} — ${(s.size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
