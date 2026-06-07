// Renders docs/project/07-blockchain-erd-class-review.ar.md into a single RTL PDF:
// docs/project/Sarh-Blockchain-ERD-Review.pdf — via the globally-installed
// Puppeteer/Chromium. Mirrors docs/print-project-docs.mjs (same md→html + CSS),
// but for the one review chapter and resolving ../diagrams/*.png figures.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, 'project');
const CHAPTER = '07-blockchain-erd-class-review.ar.md';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  const codes = [];
  text = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return ` ${codes.length - 1} `; });
  text = esc(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Guard: only substitute placeholders we actually created — literal numbers
  // surrounded by spaces in the prose (e.g. "RFC 7946") must pass through.
  text = text.replace(/ (\d+) /g, (m, i) => (codes[+i] !== undefined ? `<code>${esc(codes[+i])}</code>` : m));
  return text;
}

const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-');
const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };

  while (i < lines.length) {
    let line = lines[i];
    const t = line.trim();

    if (/^```/.test(t)) {
      flush(); i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^<\/?(div|br|hr|img|figure|figcaption|details|summary)/i.test(t)) { flush(); out.push(line); i++; continue; }
    if (t === '') { flush(); i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^---+$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(t)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    if (t.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(cells(lines[i])); i++; }
      const thead = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    if (/^(-|\d+\.)\s+/.test(t)) {
      flush();
      const ordered = /^\d+\.\s+/.test(t);
      const items = [];
      while (i < lines.length && /^(-|\d+\.)\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^(-|\d+\.)\s+/, '')); i++; }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}

const titlePage = `
<section class="title-page">
  <div class="seal">صَرح</div>
  <h1 class="title">مراجعة تقنية — البلوكتشين والمخططات</h1>
  <p class="subtitle">المخطط المفاهيمي · المخطط المنطقي (UML) · مخطط الفئات · اعتماد الأرض على السلسلة</p>
  <p class="owner">منصّة صَرح · الرؤية الليبية للاتصالات والتقنية — LVCT · 2026</p>
</section>`;

const bodyHtml = `<section class="chapter">${mdToHtml(await readFile(join(projectDir, CHAPTER), 'utf8'))}</section>`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Tahoma", "Traditional Arabic", sans-serif; color: #0F172A; line-height: 1.75; font-size: 12.5pt; }
  .title-page { height: 247mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; }
  .seal { width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(135deg,#0F172A,#1e293b); color:#F97316; display:flex; align-items:center; justify-content:center; font-size:42px; font-weight:800; border:4px solid #F97316; margin-bottom:24px; }
  .title-page .title { font-size: 28pt; margin: 8px 0; color:#0F172A; }
  .title-page .subtitle { font-size: 13pt; color:#475569; margin: 4px 0; }
  .title-page .owner { font-size: 12pt; color:#64748B; margin-top: 28px; }
  .chapter { page-break-before: always; }
  h1 { font-size: 21pt; color:#0F172A; border-bottom:3px solid #F97316; padding-bottom:8px; margin-top:0; }
  h2 { font-size: 16pt; color:#0F172A; margin-top: 22px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; }
  h3 { font-size: 13.5pt; color:#1e293b; margin-top: 16px; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 24px 8px 0; padding: 0 18px 0 0; }
  li { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11pt; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 9px; text-align: right; vertical-align: top; }
  th { background: #0F172A; color: #fff; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  code { font-family: "Consolas","Courier New",monospace; background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:10.5pt; direction:ltr; unicode-bidi: embed; }
  pre { background:#0F172A; color:#e2e8f0; padding:12px 14px; border-radius:8px; overflow-x:auto; direction:ltr; text-align:left; page-break-inside: avoid; }
  pre code { background:transparent; color:inherit; padding:0; font-size:9pt; line-height:1.5; }
  blockquote { border-right:4px solid #F97316; background:#fff7ed; margin:10px 0; padding:8px 14px; color:#475569; }
  hr { border:0; border-top:1px solid #e2e8f0; margin:18px 0; }
  a { color:#0891B2; text-decoration:none; }
  figure { margin: 14px 0; page-break-inside: avoid; text-align:center; }
  figure img { max-width:100%; border:1px solid #cbd5e1; border-radius:8px; }
  figcaption { font-size:10pt; color:#64748B; margin-top:6px; text-align:center; }
</style></head><body>${titlePage}${bodyHtml}</body></html>`;

const renderFile = join(projectDir, '.render-bc.html');
await writeFile(renderFile, html, 'utf8');

const require = createRequire(import.meta.url);
const puppeteerPath = require.resolve('puppeteer', {
  paths: ['C:\\Users\\Ali\\AppData\\Roaming\\npm\\node_modules', process.cwd()],
});
const puppeteer = (await import(pathToFileURL(puppeteerPath).href)).default;

const pdfPath = join(projectDir, 'Sarh-Blockchain-ERD-Review.pdf');
console.log('Launching Chromium…');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(renderFile).href, { waitUntil: 'networkidle0' });
  const imgInfo = await page.evaluate(() => {
    const imgs = [...document.images];
    return { total: imgs.length, broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length };
  });
  console.log('images:', JSON.stringify(imgInfo));
  await page.pdf({
    path: pdfPath, format: 'A4', printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    displayHeaderFooter: true,
    footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#94a3b8;">صَرح · مراجعة البلوكتشين والمخططات · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    headerTemplate: '<div></div>',
  });
  console.log('PDF written:', pdfPath);

  if (process.argv.includes('--shots')) {
    await page.setViewport({ width: 920, height: 1300, deviceScaleFactor: 1 });
    await page.screenshot({ path: join(projectDir, '.bc-preview-full.png'), fullPage: true });
    console.log('Preview PNG written: .bc-preview-full.png');
  }
} finally {
  await browser.close();
  await rm(renderFile, { force: true });
}
