// Post-scaffold transformer for Sijilli Angular apps.
// Applies: RTL + Arabic, brand colors, dev server port,
// @sijilli/* package name, Material + transloco + NgRx in deps,
// Sijilli landing page.
//
// Run: node scripts/post-scaffold-angular.mjs

import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');

const APPS = [
  {
    dir: 'web-citizen',
    pkg: '@sijilli/web-citizen',
    port: 4200,
    titleAr: 'سِجِلّي — بوابة المواطن',
    titleEn: 'Sijilli — Citizen Portal',
    headlineAr: 'بوابة المواطن',
    subAr: 'سجّل عقاراتك، تابع طلباتك، شارك وثائقك بأمان.',
  },
  {
    dir: 'web-officer',
    pkg: '@sijilli/web-officer',
    port: 4201,
    titleAr: 'سِجِلّي — لوحة موظف السجل',
    titleEn: 'Sijilli — Registry Officer',
    headlineAr: 'لوحة موظف السجل العقاري',
    subAr: 'مراجعة الطلبات، فحص الإحداثيات، اعتماد الوثائق.',
  },
  {
    dir: 'web-id-issuer',
    pkg: '@sijilli/web-id-issuer',
    port: 4202,
    titleAr: 'سِجِلّي — محطة إصدار الهوية',
    titleEn: 'Sijilli — ID Issuance Station',
    headlineAr: 'محطة إصدار الهوية الرقمية',
    subAr: 'إدخال بيانات المواطن، التقاط الصورة، ترميز بطاقة NFC.',
  },
  {
    dir: 'web-admin',
    pkg: '@sijilli/web-admin',
    port: 4203,
    titleAr: 'سِجِلّي — لوحة الإدارة',
    titleEn: 'Sijilli — Admin Console',
    headlineAr: 'لوحة الإدارة العامة',
    subAr: 'إدارة الموظفين، التدقيق، التقارير، إعدادات النظام.',
  },
];

// Common deps to merge into every Angular app.
// Versions chosen to match Angular 21.x scaffold the CLI produced.
const COMMON_DEPS = {
  '@angular/animations': '^21.1.0',
  '@angular/cdk': '^21.1.0',
  '@angular/material': '^21.1.0',
  '@ngrx/store': '^19.0.0',
  '@ngrx/effects': '^19.0.0',
  '@ngrx/store-devtools': '^19.0.0',
  '@jsverse/transloco': '^7.5.1',
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

for (const app of APPS) {
  const root = path.join(REPO, 'apps', app.dir);
  if (!fs.existsSync(root)) {
    console.error('skip:', root, '(missing)');
    continue;
  }

  // ---- package.json: rename + add deps + ng serve script with port ----
  const pkgPath = path.join(root, 'package.json');
  const pkg = readJson(pkgPath);
  pkg.name = app.pkg;
  pkg.scripts = {
    ...pkg.scripts,
    start: `ng serve --port ${app.port} --host 0.0.0.0`,
    lint: 'ng lint',
  };
  pkg.dependencies = { ...pkg.dependencies, ...COMMON_DEPS };
  writeJson(pkgPath, pkg);

  // ---- angular.json: set serve port ----
  const ngPath = path.join(root, 'angular.json');
  const ng = readJson(ngPath);
  const projKey = Object.keys(ng.projects)[0];
  const serve = ng.projects[projKey].architect.serve;
  serve.options = { ...(serve.options ?? {}), port: app.port, host: 'localhost' };
  writeJson(ngPath, ng);

  // ---- index.html: RTL + Arabic + title + viewport ----
  write(
    path.join(root, 'src/index.html'),
    `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${app.titleAr}</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${app.titleEn}">
  <meta name="theme-color" content="#0F1A14">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body class="sijilli-body">
  <app-root></app-root>
</body>
</html>
`,
  );

  // ---- styles.scss: brand tokens + RTL-friendly base ----
  write(
    path.join(root, 'src/styles.scss'),
    `// Sijilli — global styles
// Brand tokens (from CLAUDE.md)
:root {
  --sijilli-primary: #0F1A14;   // أسود ليبي
  --sijilli-accent:  #D4AF37;   // ذهبي رسمي
  --sijilli-warn:    #E70013;   // أحمر ليبي
  --sijilli-success: #239E46;   // أخضر ليبي
  --sijilli-bg:      #FAF9F6;
  --sijilli-text:    #1A1A1A;
  --sijilli-muted:   #6B6B6B;
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: 'Noto Naskh Arabic', 'Amiri', 'Segoe UI', Tahoma, sans-serif;
  background: var(--sijilli-bg);
  color: var(--sijilli-text);
  direction: rtl;
}

code, kbd, pre, .ltr-num {
  font-family: 'Inter', ui-monospace, SFMono-Regular, Menlo, monospace;
  direction: ltr;
  unicode-bidi: isolate;
}

a { color: var(--sijilli-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
`,
  );

  // ---- src/app/app.html: simple Sijilli landing ----
  write(
    path.join(root, 'src/app/app.html'),
    `<main class="sijilli-shell">
  <header class="sijilli-shell__header">
    <div class="sijilli-brand">
      <span class="sijilli-brand__name">سِجِلّي</span>
      <span class="sijilli-brand__sub">${app.headlineAr}</span>
    </div>
  </header>

  <section class="sijilli-shell__body">
    <h1>${app.headlineAr}</h1>
    <p class="lead">${app.subAr}</p>
    <p class="muted ltr-num">${app.titleEn} · v0.1.0</p>
  </section>

  <footer class="sijilli-shell__footer">
    <span>© LVCT · رؤية ليبيا للاتصالات وتقنية المعلومات</span>
  </footer>
</main>

<router-outlet />
`,
  );

  // ---- src/app/app.scss ----
  write(
    path.join(root, 'src/app/app.scss'),
    `.sijilli-shell {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.sijilli-shell__header {
  background: var(--sijilli-primary);
  color: var(--sijilli-bg);
  padding: 1rem 2rem;
  border-bottom: 3px solid var(--sijilli-accent);
}

.sijilli-brand {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
.sijilli-brand__name {
  font-family: 'Amiri', serif;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--sijilli-accent);
}
.sijilli-brand__sub {
  font-size: 1rem;
  opacity: 0.85;
}

.sijilli-shell__body {
  padding: 4rem 2rem;
  max-width: 960px;
  margin: 0 auto;
  text-align: start;
}
.sijilli-shell__body h1 {
  font-family: 'Amiri', serif;
  font-size: 2.5rem;
  margin: 0 0 1rem;
  color: var(--sijilli-primary);
}
.lead { font-size: 1.15rem; line-height: 1.8; color: var(--sijilli-text); }
.muted { color: var(--sijilli-muted); margin-top: 2rem; }

.sijilli-shell__footer {
  padding: 1rem 2rem;
  text-align: center;
  background: #fff;
  border-top: 1px solid #eee;
  color: var(--sijilli-muted);
  font-size: 0.9rem;
}
`,
  );
}

console.log('Angular post-scaffold complete for', APPS.map((a) => a.dir).join(', '));
