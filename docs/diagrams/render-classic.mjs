// Pure white classic-UML PNG renderer.
//
// Reads every .mmd in this folder, prepends an init directive that forces
// every Mermaid theme variable to pure white background + pure black strokes
// + pure black text — no greys, no purples, no cream. Saves into
// ../diagrams-classic/.
//
// This is stricter than render-a4.mjs (which still leaves Mermaid's grey
// "neutral" defaults on participant boxes, notes, clusters, etc.).
//
// Usage:
//   node render-classic.mjs                    # render every .mmd
//   node render-classic.mjs db-schema-identity # render selected names only
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'diagrams-classic');

const PROFILES = {
  default:  { fontSize: 18 },
  sequence: { fontSize: 18 },
  mindmap:  { fontSize: 20 },
  org:      { fontSize: 20 },
};

function profileFor(name) {
  if (name.startsWith('sequence-'))       return PROFILES.sequence;
  if (name.startsWith('data-dictionary')) return PROFILES.mindmap;
  if (name === 'org-chart')               return PROFILES.org;
  return PROFILES.default;
}

// Force every Mermaid-known colour to white-on-black classic UML.
function whiteVars(fontSize) {
  return {
    fontSize: `${fontSize}px`,
    background: '#FFFFFF',
    // Flowchart / generic nodes
    primaryColor: '#FFFFFF',
    primaryBorderColor: '#000000',
    primaryTextColor: '#000000',
    secondaryColor: '#FFFFFF',
    secondaryBorderColor: '#000000',
    secondaryTextColor: '#000000',
    tertiaryColor: '#FFFFFF',
    tertiaryBorderColor: '#000000',
    tertiaryTextColor: '#000000',
    mainBkg: '#FFFFFF',
    secondBkg: '#FFFFFF',
    nodeBkg: '#FFFFFF',
    nodeBorder: '#000000',
    clusterBkg: '#FFFFFF',
    clusterBorder: '#000000',
    defaultLinkColor: '#000000',
    titleColor: '#000000',
    edgeLabelBackground: '#FFFFFF',
    lineColor: '#000000',
    textColor: '#000000',
    // Sequence-specific
    actorBkg: '#FFFFFF',
    actorBorder: '#000000',
    actorTextColor: '#000000',
    actorLineColor: '#000000',
    signalColor: '#000000',
    signalTextColor: '#000000',
    labelBoxBkgColor: '#FFFFFF',
    labelBoxBorderColor: '#000000',
    labelTextColor: '#000000',
    loopTextColor: '#000000',
    noteBkgColor: '#FFFFFF',
    noteBorderColor: '#000000',
    noteTextColor: '#000000',
    activationBkgColor: '#FFFFFF',
    activationBorderColor: '#000000',
    sequenceNumberColor: '#000000',
    altBackground: '#FFFFFF',
    // ER attribute zebra rows
    attributeBackgroundColorOdd: '#FFFFFF',
    attributeBackgroundColorEven: '#FFFFFF',
    // Class diagram
    classText: '#000000',
    // State / journey
    fillType0: '#FFFFFF',
    fillType1: '#FFFFFF',
    fillType2: '#FFFFFF',
    fillType3: '#FFFFFF',
    fillType4: '#FFFFFF',
    fillType5: '#FFFFFF',
    fillType6: '#FFFFFF',
    fillType7: '#FFFFFF',
  };
}

function withInitDirective(body, profile) {
  const cfg = {
    theme: 'base',
    themeVariables: whiteVars(profile.fontSize),
    flowchart: { curve: 'linear', htmlLabels: true, useMaxWidth: false },
    er: { useMaxWidth: false, layoutDirection: 'LR' },
    sequence: { useMaxWidth: false, actorMargin: 50, messageFontSize: 14 },
  };
  const init = `%%{init: ${JSON.stringify(cfg)}}%%\n`;

  const lines = body.split('\n');
  if (lines[0].trim() === '---') {
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
    process.stdout.write(`Rendering classic ${name} ... `);
    try {
      let r = await tryMermaidInk(tuned);
      if (!r.ok) {
        process.stdout.write(`mermaid.ink ${r.status}, retrying via kroki ... `);
        r = await tryKroki(tuned);
      }
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
      console.log(`${(r.buf.length / 1024).toFixed(1)} KB → diagrams-classic/${name}.png`);
    } catch (e) {
      console.error(e?.message ?? e);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
