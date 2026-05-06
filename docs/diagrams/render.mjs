// Renders Mermaid .mmd files to PNG.
// Primary backend: mermaid.ink (GET, fast). Fallback for big diagrams: kroki.io (POST).
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

async function tryMermaidInk(body) {
  const url = `https://mermaid.ink/img/${b64url(body)}?type=png&bgColor=FBFAF6`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
}

async function tryKroki(body) {
  const res = await fetch('https://kroki.io/mermaid/png', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
}

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
  process.stdout.write(`Rendering ${name} ... `);
  try {
    let r = await tryMermaidInk(body);
    if (!r.ok && (r.status === 414 || r.status >= 500)) {
      process.stdout.write(`mermaid.ink ${r.status}, retrying via kroki ... `);
      r = await tryKroki(body);
    }
    if (!r.ok) {
      console.error(`HTTP ${r.status}`);
      failed++;
      continue;
    }
    await writeFile(pngPath, r.buf);
    console.log(`${(r.buf.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.error(e?.message ?? e);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
