// Renders Mermaid .mmd files to PNG via mermaid.ink (no Puppeteer download).
// Usage: node render.mjs [name1 name2 ...]   (defaults to all .mmd files)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const b64url = (s) =>
  Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(here)).filter((f) => f.endsWith('.mmd')).map((f) => f.replace(/\.mmd$/, ''));

let failed = 0;
for (const name of targets) {
  const mmdPath = join(here, `${name}.mmd`);
  const pngPath = join(here, `${name}.png`);
  let body;
  try {
    body = await readFile(mmdPath, 'utf8');
  } catch {
    console.error(`skip: ${name}.mmd not found`);
    continue;
  }
  // mermaid.ink accepts /img/<base64url-of-the-mmd> — bgColor as query.
  const url = `https://mermaid.ink/img/${b64url(body)}?type=png&bgColor=FBFAF6`;
  process.stdout.write(`Rendering ${name} ... `);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HTTP ${res.status}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(pngPath, buf);
    console.log(`${(buf.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.error(e?.message ?? e);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
