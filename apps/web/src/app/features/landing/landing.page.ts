import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="nav">
        <div class="nav-inner">
          <a class="brand" routerLink="/">
            <span class="brand-mark">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">
                <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-7h-4v7H5a1 1 0 0 1-1-1z"/>
              </svg>
            </span>
            <span class="brand-text">
              <span class="brand-ar">صَرح</span>
              <span class="brand-en">Sarh · LY</span>
            </span>
          </a>

          <nav class="links">
            <a href="#how">كيف يعمل</a>
            <a href="#features">المزايا</a>
            <a href="#trust">الأمان</a>
            <a href="/verify">التحقّق</a>
          </nav>

          <div class="cta-row">
            <a class="btn-ghost" routerLink="/login">تسجيل الدخول</a>
            <a class="btn-primary" routerLink="/login">ابدأ الآن ←</a>
          </div>
        </div>
      </header>

      <section class="hero">
        <div class="hero-inner">
          <div class="hero-text">
            <span class="eyebrow">
              <span class="eyebrow-dot"></span>
              منصّة العقارات والهويّة الرقميّة الليبيّة
            </span>
            <h1>
              سجلّ عقاري مُحكَم.
              <span class="hero-accent">هويّة رقميّة موثوقة.</span>
            </h1>
            <p class="hero-sub">
              صَرح يحوّل سجلّ الملكيّة الورقي إلى منظومة موحَّدة تربط المواطن، الموظّف، والمتحقّق
              العام. خرائط دقيقة، توقيعات معتمدة، وبطاقات NFC مقاومة للاستنساخ — كلّه في مكان واحد.
            </p>

            <div class="hero-cta">
              <a class="btn-primary big" routerLink="/login">تسجيل الدخول →</a>
              <a class="btn-secondary big" href="#how">جولة سريعة</a>
            </div>

            <div class="trust">
              <div class="trust-item">
                <strong>+22</strong>
                <span>منطقة ليبيّة مغطاة</span>
              </div>
              <div class="trust-divider"></div>
              <div class="trust-item">
                <strong>NTAG 424 DNA</strong>
                <span>بطاقة NFC مقاومة الاستنساخ</span>
              </div>
              <div class="trust-divider"></div>
              <div class="trust-item">
                <strong>PAdES</strong>
                <span>توقيع رقمي معتمد على كل صحيفة</span>
              </div>
            </div>
          </div>

          <div class="hero-visual">
            <div class="float-card map-card">
              <div class="map-head">
                <span class="map-pill">طرابلس · حي الأندلس</span>
                <span class="map-status approved">معتمد</span>
              </div>
              <div class="map-body">
                <svg viewBox="0 0 280 200" width="100%" height="100%" preserveAspectRatio="none">
                  <rect width="280" height="200" fill="#F1F5F9"/>
                  <line x1="0" y1="60" x2="280" y2="48" stroke="#fff" stroke-width="6"/>
                  <line x1="0" y1="140" x2="280" y2="148" stroke="#fff" stroke-width="6"/>
                  <line x1="80" y1="0" x2="92" y2="200" stroke="#fff" stroke-width="6"/>
                  <line x1="200" y1="0" x2="208" y2="200" stroke="#fff" stroke-width="6"/>
                  <polygon points="100,80 180,76 184,142 105,148" fill="rgba(249,115,22,0.22)" stroke="#F97316" stroke-width="2.5"/>
                  <circle cx="142" cy="113" r="6" fill="#F97316"/>
                  <circle cx="142" cy="113" r="14" fill="none" stroke="#F97316" stroke-width="1.5" opacity="0.5"/>
                </svg>
              </div>
              <div class="map-foot">
                <div>
                  <span class="muted">رمز السند</span>
                  <strong class="mono">PRP-2026-0438</strong>
                </div>
                <div>
                  <span class="muted">المساحة</span>
                  <strong class="mono">425.5 م²</strong>
                </div>
              </div>
            </div>

            <div class="float-card id-card">
              <div class="id-band"></div>
              <div class="id-body">
                <span class="id-label">بطاقة هويّة رقميّة</span>
                <span class="id-name">علي محمد بلعيد</span>
                <span class="id-num mono">LY-10-2026-000142-3</span>
                <div class="id-foot">
                  <span class="id-chip">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11h.01M9 15h.01M13 11h6M13 15h6"/><rect x="3" y="7" width="18" height="12" rx="2"/></svg>
                    NFC
                  </span>
                  <span class="id-status">سارية</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" class="section">
        <div class="section-inner">
          <span class="section-eyebrow">كيف يعمل</span>
          <h2>أربع خطوات من الطلب إلى الصحيفة المعتمدة</h2>

          <div class="steps">
            <article class="step">
              <span class="step-num">01</span>
              <h3>التسجيل</h3>
              <p>المواطن يُدخِل بيانات العقار، يحدّد الحدود على الخريطة، ويرفع الوثائق الورقيّة القديمة.</p>
            </article>
            <article class="step">
              <span class="step-num">02</span>
              <h3>المراجعة</h3>
              <p>موظّف السجلّ يتحقّق من الوثائق، يكتشف التداخل عبر الخريطة، ويُصدر القرار في طابور موحَّد.</p>
            </article>
            <article class="step">
              <span class="step-num">03</span>
              <h3>الإصدار</h3>
              <p>يُنتج النظام صحيفة الملكيّة موقَّعة رقمياً (PAdES) مع رمز QR متصل بصفحة التحقّق العام.</p>
            </article>
            <article class="step">
              <span class="step-num">04</span>
              <h3>التحقّق</h3>
              <p>أي طرف يقرأ QR على الورقة أو يلمس بطاقة NFC ليرى صحّة المستند فوراً.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="features" class="section alt">
        <div class="section-inner">
          <span class="section-eyebrow">المزايا</span>
          <h2>منصّة كاملة، مبنيّة لتقاوم الزمن</h2>

          <div class="feat-grid">
            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M12 22s-8-4-8-12V5l8-3 8 3v5c0 8-8 12-8 12z"/>
                </svg>
              </div>
              <h3>سجلّ تدقيق غير قابل للتعديل</h3>
              <p>كل عملية كتابة تُسجَّل عبر <code>INSTEAD OF UPDATE/DELETE</code>. لا يمكن مَحوها بعد ذلك.</p>
            </article>

            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M3 9l9-7 9 7v11H3z"/>
                  <path d="M9 22V12h6v10"/>
                </svg>
              </div>
              <h3>خريطة دقيقة بالأمتار</h3>
              <p>SQL Server <code>geography</code> مع SRID 4326. كشف التداخل والتنبيه قبل الاعتماد.</p>
            </article>

            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <rect x="3" y="7" width="18" height="12" rx="2"/>
                  <path d="M9 11h.01M9 15h.01M13 11h6M13 15h6"/>
                </svg>
              </div>
              <h3>NFC مع SUN ديناميكي</h3>
              <p>NTAG 424 DNA يولّد رسالة فريدة كل مرّة. عدّاد الخادم يرفض المحاولات المُعاد إرسالها.</p>
            </article>

            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <h3>PAdES على كل صحيفة</h3>
              <p>توقيع رقمي + SHA-256 + رمز QR للتحقّق العام في <code>verify.sarh.ly</code>.</p>
            </article>

            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>
                </svg>
              </div>
              <h3>دعم RTL عربي حصراً</h3>
              <p>كل واجهات المستخدم عربيّة من البداية، لا ترجمة لاحقة. الإنجليزية فقط للأرقام والأكواد.</p>
            </article>

            <article class="feat">
              <div class="feat-ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
              </div>
              <h3>هويّة ذاتيّة (SSI)</h3>
              <p>VC قابلة للتحقّق عبر Hyperledger Aries، وقابلة للترحيل عند إطلاق هويّة وطنيّة موحَّدة.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="trust" class="section">
        <div class="section-inner trust-section">
          <div class="trust-text">
            <span class="section-eyebrow">الأمان والامتثال</span>
            <h2>بُنيَ على معايير حكوميّة قابلة للتدقيق</h2>
            <p class="muted">
              صَرح ليس مجرّد واجهة — هو منظومة متكاملة من قاعدة البيانات إلى الواجهة، مع التزام صارم
              بالخصوصيّة والمراجعة. كلّ سطر كود قابل للمراجعة، وكلّ تغيير في البيانات قابل للتتبّع.
            </p>
            <ul class="trust-list">
              <li><span class="tick">✓</span> JWT بدون PII — فقط معرّف المستخدم والدور.</li>
              <li><span class="tick">✓</span> bcrypt cost-12 لكلمات السرّ.</li>
              <li><span class="tick">✓</span> تشفير AES-GCM لمفاتيح NFC في قاعدة البيانات.</li>
              <li><span class="tick">✓</span> فحص ClamAV للملفّات المرفوعة.</li>
              <li><span class="tick">✓</span> Rate limit على مسارات المصادقة وإرسال العقار.</li>
            </ul>
          </div>

          <div class="trust-stats">
            <div class="stat-card">
              <span class="stat-num">100%</span>
              <span class="stat-lbl">عمليّات الكتابة مُسجَّلة</span>
            </div>
            <div class="stat-card">
              <span class="stat-num">0</span>
              <span class="stat-lbl">حذف مسموح في سجلّ التدقيق</span>
            </div>
            <div class="stat-card">
              <span class="stat-num">5y</span>
              <span class="stat-lbl">صلاحية البطاقة الافتراضيّة</span>
            </div>
            <div class="stat-card">
              <span class="stat-num">RTL</span>
              <span class="stat-lbl">عربي أوّلاً، بدون استثناء</span>
            </div>
          </div>
        </div>
      </section>

      <section class="cta-final">
        <div class="cta-inner">
          <h2>هل أنت جاهز للبدء؟</h2>
          <p>سجّل دخولك للوصول إلى لوحة التحكّم، أو ابحث عن سند للتحقّق من صحّته.</p>
          <div class="cta-actions">
            <a class="btn-primary big" routerLink="/login">تسجيل الدخول</a>
            <a class="btn-ghost-light big" href="/verify">التحقّق من سند</a>
          </div>
        </div>
      </section>

      <footer class="foot">
        <div class="foot-inner">
          <div class="foot-brand">
            <span class="brand-ar">صَرح</span>
            <span class="brand-en">Sarh · Libya</span>
          </div>
          <div class="foot-meta">
            <span>© 2026 LVCT — جميع الحقوق محفوظة</span>
            <a class="mono" href="/verify">verify.sarh.ly</a>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: #FFFFFF; color: var(--ink); }
    .page { background: #FFFFFF; }

    .nav { position: sticky; top: 0; z-index: 50; background: rgba(255, 255, 255, 0.92); backdrop-filter: saturate(140%) blur(8px); border-bottom: 1px solid var(--rule); }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; gap: 28px; }

    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; }
    .brand-mark { width: 32px; height: 32px; border-radius: 9px; background: var(--primary); color: var(--accent); display: grid; place-items: center; }
    .brand-text { display: flex; flex-direction: column; line-height: 1; }
    .brand-ar { font-size: 16px; font-weight: 800; color: var(--primary); }
    .brand-en { font-size: 9.5px; letter-spacing: 0.18em; color: var(--muted); direction: ltr; margin-top: 3px; }

    .links { display: flex; gap: 22px; flex: 1; justify-content: center; }
    .links a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; transition: color .12s; }
    .links a:hover { color: var(--primary); }

    .cta-row { display: flex; gap: 8px; }

    .btn-primary, .btn-secondary, .btn-ghost, .btn-ghost-light {
      padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 700;
      font-family: inherit; text-decoration: none; cursor: pointer;
      transition: all .15s; border: 1px solid transparent;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }
    .btn-secondary { background: #fff; color: var(--primary); border-color: var(--rule); }
    .btn-secondary:hover { border-color: var(--primary); }
    .btn-ghost { background: transparent; color: var(--muted); }
    .btn-ghost:hover { color: var(--primary); }
    .btn-ghost-light { background: transparent; color: #fff; border-color: rgba(255, 255, 255, 0.3); }
    .btn-ghost-light:hover { background: rgba(255, 255, 255, 0.1); border-color: #fff; }
    .big { padding: 12px 22px; font-size: 14px; }

    .hero { padding: 72px 24px 48px; background: linear-gradient(180deg, #FFFFFF 0%, var(--paper) 100%); }
    .hero-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: center; }
    @media (max-width: 980px) { .hero-inner { grid-template-columns: 1fr; gap: 40px; } }

    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 12px;
      background: rgba(249, 115, 22, 0.08);
      border: 1px solid rgba(249, 115, 22, 0.25);
      border-radius: 999px;
      font-size: 11.5px; font-weight: 600;
      color: var(--accent);
      margin-bottom: 20px;
    }
    .eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 2.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5); } 50% { box-shadow: 0 0 0 6px rgba(249, 115, 22, 0); } }

    .hero h1 { font-size: 52px; line-height: 1.08; font-weight: 800; color: var(--primary); margin: 0 0 20px; letter-spacing: -0.02em; }
    .hero-accent { color: var(--accent); }
    @media (max-width: 720px) { .hero h1 { font-size: 36px; } }

    .hero-sub { font-size: 16px; line-height: 1.85; color: var(--muted); margin: 0 0 32px; max-width: 540px; }
    .hero-cta { display: flex; gap: 12px; margin-bottom: 36px; flex-wrap: wrap; }

    .trust { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; padding-top: 28px; border-top: 1px solid var(--rule); }
    .trust-item { display: flex; flex-direction: column; gap: 3px; }
    .trust-item strong { font-size: 14px; color: var(--primary); font-weight: 800; }
    .trust-item span { font-size: 11.5px; color: var(--muted); }
    .trust-divider { width: 1px; height: 32px; background: var(--rule); }

    .hero-visual { position: relative; min-height: 420px; }
    .float-card {
      background: #FFFFFF;
      border: 1px solid var(--rule);
      border-radius: 18px;
      box-shadow: 0 24px 60px -20px rgba(15, 23, 42, 0.18);
      position: absolute;
    }

    .map-card { top: 0; inset-inline-end: 0; width: 88%; padding: 18px; }
    .map-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .map-pill { font-size: 11.5px; font-weight: 600; color: var(--muted); }
    .map-status { padding: 3px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: #fff; }
    .map-status.approved { background: var(--good); }
    .map-body { border-radius: 10px; overflow: hidden; aspect-ratio: 14 / 10; background: #F1F5F9; margin-bottom: 12px; }
    .map-foot { display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--rule); font-size: 11px; }
    .map-foot strong { display: block; color: var(--primary); font-size: 13px; margin-top: 2px; }
    .muted { color: var(--muted); }

    .id-card {
      bottom: 0; inset-inline-start: 0; width: 70%;
      background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%);
      color: #fff; overflow: hidden; transform: rotate(-3deg);
    }
    .id-band { height: 3px; background: linear-gradient(90deg, var(--warn), var(--accent), var(--good)); }
    .id-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
    .id-label { font-size: 10px; letter-spacing: 0.18em; color: rgba(249, 115, 22, 0.7); }
    .id-name { font-size: 14px; font-weight: 700; }
    .id-num { font-size: 13px; color: var(--accent); margin-top: 2px; direction: ltr; }
    .id-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.12); font-size: 10px; }
    .id-chip { display: inline-flex; align-items: center; gap: 5px; color: rgba(255, 255, 255, 0.7); }
    .id-status { color: var(--good); font-weight: 700; }

    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }

    .section { padding: 88px 24px; }
    .section.alt { background: var(--paper); }
    .section-inner { max-width: 1200px; margin: 0 auto; }
    .section-eyebrow {
      display: inline-block;
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em;
      color: var(--accent);
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .section h2 { font-size: 32px; font-weight: 800; color: var(--primary); margin: 0 0 36px; max-width: 680px; line-height: 1.25; letter-spacing: -0.01em; }

    .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
    @media (max-width: 880px) { .steps { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 540px) { .steps { grid-template-columns: 1fr; } }
    .step { padding: 24px; background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; }
    .step-num { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 700; color: var(--accent); margin-bottom: 8px; letter-spacing: 0.06em; }
    .step h3 { font-size: 15px; color: var(--primary); margin: 0 0 8px; }
    .step p  { font-size: 13px; color: var(--muted); line-height: 1.75; margin: 0; }

    .feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
    @media (max-width: 980px) { .feat-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 600px) { .feat-grid { grid-template-columns: 1fr; } }
    .feat {
      background: #FFFFFF; border: 1px solid var(--rule); border-radius: 14px;
      padding: 24px; transition: all .2s;
    }
    .feat:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 14px 40px -16px rgba(15, 23, 42, 0.12); }
    .feat-ico {
      width: 42px; height: 42px; border-radius: 10px;
      background: rgba(249, 115, 22, 0.08); color: var(--accent);
      display: grid; place-items: center; margin-bottom: 14px;
    }
    .feat h3 { font-size: 14.5px; color: var(--primary); margin: 0 0 6px; }
    .feat p  { font-size: 12.5px; color: var(--muted); line-height: 1.75; margin: 0; }
    .feat code { background: rgba(15, 23, 42, 0.06); padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: 'JetBrains Mono', monospace; direction: ltr; unicode-bidi: bidi-override; }

    .trust-section { display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: start; }
    @media (max-width: 880px) { .trust-section { grid-template-columns: 1fr; gap: 36px; } }
    .trust-text p { font-size: 14.5px; line-height: 1.85; }
    .trust-list { list-style: none; padding: 0; margin: 22px 0 0; display: flex; flex-direction: column; gap: 10px; }
    .trust-list li { font-size: 13.5px; color: var(--ink); display: flex; gap: 10px; align-items: flex-start; }
    .tick { color: var(--good); font-weight: 700; flex-shrink: 0; }

    .trust-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .stat-card { padding: 28px 22px; background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; }
    .stat-num { display: block; font-size: 32px; font-weight: 800; color: var(--accent); line-height: 1; margin-bottom: 6px; letter-spacing: -0.02em; }
    .stat-lbl { font-size: 12px; color: var(--muted); }

    .cta-final { background: var(--primary); color: #FFFFFF; padding: 80px 24px; }
    .cta-inner { max-width: 680px; margin: 0 auto; text-align: center; }
    .cta-final h2 { font-size: 32px; color: #FFFFFF; margin: 0 0 14px; letter-spacing: -0.01em; }
    .cta-final p { font-size: 14.5px; color: rgba(255, 255, 255, 0.7); margin: 0 0 28px; }
    .cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

    .foot { background: var(--primary); color: rgba(255, 255, 255, 0.65); padding: 28px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
    .foot-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 12px; }
    .foot-brand { display: flex; flex-direction: column; line-height: 1.2; }
    .foot-brand .brand-ar { font-size: 14px; color: var(--accent); font-weight: 700; }
    .foot-brand .brand-en { font-size: 9.5px; letter-spacing: 0.18em; color: rgba(255, 255, 255, 0.4); direction: ltr; margin-top: 3px; }
    .foot-meta { display: flex; gap: 18px; align-items: center; }
    .foot-meta a { color: var(--accent); text-decoration: none; }
    .foot-meta a:hover { color: #fff; }

    @media (max-width: 720px) {
      .links { display: none; }
      .nav-inner { gap: 12px; }
    }
  `],
})
export class LandingPage {}
