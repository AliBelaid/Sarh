// A4-friendly Mermaid PNG renderer.
//
// Reads every .mmd in this folder, prepends a per-diagram init directive that
// dials up font-size + curve smoothing for print, asks mermaid.ink to render
// to PNG, and saves into ./a4/. Falls back to kroki.io on 414 / 5xx.
//
// Usage:
//   node render-a4.mjs                     # render every .mmd → ./a4/
//   node render-a4.mjs db-schema org-chart # render selected names only
//
// The diagrams in this folder are already content-sized to fit on one A4
// sheet (db-schema has been split into three clusters; sequence diagrams
// stay tall and print on portrait A4). What this script adds is a printer-
// friendly classic-UML theme: 18-22px fonts on a pure white background,
// black strokes, no coloured fills.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'a4');

// Per-diagram tuning. Most diagrams use the default profile; sequences and
// mindmaps benefit from larger fonts because their default rendering is
// extra sparse.
const PROFILES = {
  default:    { fontSize: 18, theme: 'default' },
  sequence:   { fontSize: 20, theme: 'default' },
  mindmap:    { fontSize: 22, theme: 'default' },
  org:        { fontSize: 20, theme: 'default' },
};

function profileFor(name) {
  if (name.startsWith('sequence-'))     return PROFILES.sequence;
  if (name.startsWith('data-dictionary')) return PROFILES.mindmap;
  if (name === 'org-chart')             return PROFILES.org;
  return PROFILES.default;
}

function withInitDirective(body, profile) {
  // If the source already starts with a YAML front-matter ("--- ... ---"),
  // we have to inject AFTER it. Mermaid only honours `%%{init:...}%%` when
  // it appears as the first non-front-matter line.
  // Classic-UML look: neutral theme, white background, black strokes,
  // light-grey fills (Mermaid's "neutral" default), no brand accents.
  const init = `%%{init: {"theme":"neutral","themeVariables":{"fontSize":"${profile.fontSize}px","background":"#FFFFFF","primaryColor":"#FFFFFF","primaryBorderColor":"#000000","primaryTextColor":"#000000","lineColor":"#000000","secondaryColor":"#F5F5F5","tertiaryColor":"#FFFFFF","mainBkg":"#FFFFFF","textColor":"#000000"},"flowchart":{"curve":"linear","htmlLabels":true,"useMaxWidth":false},"er":{"useMaxWidth":false,"layoutDirection":"LR"},"sequence":{"useMaxWidth":false,"actorMargin":50,"messageFontSize":14}}}%%\n`;

  const lines = body.split('\n');
  if (lines[0].trim() === '---') {
    // Find closing '---'.
    let i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    if (i < lines.length) {
      lines.splice(i + 1, 0, init);
      return lines.join('\n');
    }
  }
  return init + body;
}

const b64url = (s) =>
  Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function tryMermaidInk(body) {
  // White background — classic-UML print look, no brand cream.
  const url = `https://mermaid.ink/img/${b64url(body)}?type=png&bgColor=FFFFFF`;
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

async function main() {
  await mkdir(outDir, { recursive: true });

  const targets = process.argv.slice(2).length
    ? process.argv.slice(2)
    : (await readdir(here))
        .filter((f) => f.endsWith('.mmd'))
        .map((f) => f.replace(/\.mmd$/, ''));

  let failed = 0;
  for (const name of targets) {
    const mmdPath = join(here, `${name}.mmd`);
    const pngPath = join(outDir, `${name}.png`);
    let body;
    try {
      body = await readFile(mmdPath, 'utf8');
    } catch {
      console.error(`skip: ${name}.mmd not found`);
      continue;
    }

    const tuned = withInitDirective(body, profileFor(name));
    process.stdout.write(`Rendering A4 ${name} ... `);
    try {
      let r = await tryMermaidInk(tuned);
      if (!r.ok) {
        process.stdout.write(`mermaid.ink ${r.status}, retrying via kroki ... `);
        r = await tryKroki(tuned);
      }
      // Some very dense diagrams (full db-schema, class-diagram) trip the
      // kroki worker when the init directive bumps the canvas. Last-ditch:
      // drop the directive and use kroki's defaults.
      if (!r.ok) {
        process.stdout.write(`tuned reject, retrying raw ... `);
        r = await tryKroki(body);
      }
      if (!r.ok) {
        console.error(`HTTP ${r.status}`);
        failed++;
        continue;
      }
      await writeFile(pngPath, r.buf);
      console.log(`${(r.buf.length / 1024).toFixed(1)} KB → a4/${name}.png`);
    } catch (e) {
      console.error(e?.message ?? e);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
