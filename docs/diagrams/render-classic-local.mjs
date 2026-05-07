// Pure-white classic-UML PNG renderer using mermaid-cli locally.
//
// Reads every .mmd in this folder, prepends a verbose init directive that
// forces every Mermaid theme variable to white-on-black, writes a temp file,
// and shells out to mmdc to render. Saves into ../diagrams-classic/.
//
// Local rendering avoids mermaid.ink's URL-length limit and kroki's worker
// timeouts that the verbose theme JSON triggers. Slower (~3 s/diagram) but
// rock solid.
//
// Usage:
//   node render-classic-local.mjs                  # render every .mmd
//   node render-classic-local.mjs db-schema-identity org-chart
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'diagrams-classic');
const tmpDir = join(here, '..', '.tmp-classic');
const puppeteerCfg = join(here, '.puppeteer.json');

const PROFILES = {
  default:  { fontSize: 18, w: 2400, h: 1700, fill: '#FFFFFF' },
  sequence: { fontSize: 18, w: 1800, h: 2400, fill: '#FFFFFF' },
  mindmap:  { fontSize: 20, w: 2400, h: 1800, fill: '#FFFFFF' },
  org:      { fontSize: 20, w: 3000, h: 1500, fill: '#FFFFFF' },
  schema:   { fontSize: 18, w: 2800, h: 2000, fill: '#FFFFFF' },
  // Chen-style ERD with the lavender fill from docs/our digram old/conxeptple ERD.jpeg.
  chen:     { fontSize: 18, w: 2400, h: 1700, fill: '#EDE7F6' },
  // Logical ERD with lavender table cells matching docs/our digram old/dirgiarionm.jpeg.
  schemaLav:{ fontSize: 18, w: 2800, h: 2000, fill: '#EDE7F6' },
};

function profileFor(name) {
  if (name === 'conceptual-erd')          return PROFILES.chen;
  if (name.startsWith('db-schema'))       return PROFILES.schemaLav;
  if (name.startsWith('sequence-'))       return PROFILES.sequence;
  if (name.startsWith('data-dictionary')) return PROFILES.mindmap;
  if (name === 'org-chart')               return PROFILES.org;
  if (name === 'class-diagram')           return PROFILES.schemaLav;
  return PROFILES.default;
}

function themeVars(fontSize, fill) {
  // Page background stays white; only shape fills change with `fill`.
  return {
    fontSize: `${fontSize}px`,
    background: '#FFFFFF',
    primaryColor: fill,
    primaryBorderColor: '#000000',
    primaryTextColor: '#000000',
    secondaryColor: fill,
    secondaryBorderColor: '#000000',
    secondaryTextColor: '#000000',
    tertiaryColor: fill,
    tertiaryBorderColor: '#000000',
    tertiaryTextColor: '#000000',
    mainBkg: fill,
    secondBkg: fill,
    nodeBkg: fill,
    nodeBorder: '#000000',
    clusterBkg: '#FFFFFF',
    clusterBorder: '#000000',
    defaultLinkColor: '#000000',
    titleColor: '#000000',
    edgeLabelBackground: '#FFFFFF',
    lineColor: '#000000',
    textColor: '#000000',
    actorBkg: fill,
    actorBorder: '#000000',
    actorTextColor: '#000000',
    actorLineColor: '#000000',
    signalColor: '#000000',
    signalTextColor: '#000000',
    labelBoxBkgColor: fill,
    labelBoxBorderColor: '#000000',
    labelTextColor: '#000000',
    loopTextColor: '#000000',
    noteBkgColor: fill,
    noteBorderColor: '#000000',
    noteTextColor: '#000000',
    activationBkgColor: fill,
    activationBorderColor: '#000000',
    sequenceNumberColor: '#000000',
    altBackground: '#FFFFFF',
    attributeBackgroundColorOdd: fill,
    attributeBackgroundColorEven: '#FFFFFF',
    classText: '#000000',
    fillType0: fill,
    fillType1: fill,
    fillType2: fill,
    fillType3: fill,
    fillType4: fill,
    fillType5: fill,
    fillType6: fill,
    fillType7: fill,
  };
}

function withInitDirective(body, profile) {
  const cfg = {
    theme: 'base',
    themeVariables: themeVars(profile.fontSize, profile.fill),
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

function runMmdc(args) {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['-y', '-p', '@mermaid-js/mermaid-cli', 'mmdc', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const targets = process.argv.slice(2).length
    ? process.argv.slice(2)
    : (await readdir(here))
        .filter((f) => f.endsWith('.mmd'))
        .map((f) => f.replace(/\.mmd$/, ''));

  let failed = 0;
  for (const name of targets) {
    const mmdPath = join(here, `${name}.mmd`);
    const tmpPath = join(tmpDir, `${name}.mmd`);
    const pngPath = join(outDir, `${name}.png`);
    let body;
    try {
      body = await readFile(mmdPath, 'utf8');
    } catch {
      console.error(`skip: ${name}.mmd not found`);
      continue;
    }
    // Strip UTF-8 BOM and normalise CRLF — both break the `---` YAML detection.
    if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
    body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const profile = profileFor(name);
    const tuned = withInitDirective(body, profile);
    await writeFile(tmpPath, tuned, 'utf8');

    process.stdout.write(`Rendering classic ${name} (${profile.w}x${profile.h}) ... `);
    const { code, stderr } = await runMmdc([
      '-i', tmpPath,
      '-o', pngPath,
      '-b', '#FFFFFF',
      '-w', String(profile.w),
      '-H', String(profile.h),
      '-p', puppeteerCfg,
    ]);
    if (code !== 0) {
      console.error(`mmdc exit ${code}\n${stderr}`);
      failed++;
      continue;
    }
    console.log('OK');
  }

  // Best-effort cleanup of tmp.
  try { await rm(tmpDir, { recursive: true, force: true }); } catch {}

  process.exit(failed ? 1 : 0);
}

main();
