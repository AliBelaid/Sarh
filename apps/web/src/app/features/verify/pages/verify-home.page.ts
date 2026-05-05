import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-verify-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shell">
      <header class="brand">
        <div class="band"></div>
        <div class="brand-row">
          <div class="logo-ring">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-ar">صَرح · التحقّق العام</span>
            <span class="brand-en">verify.sarh.ly</span>
          </div>
        </div>
      </header>

      <main class="main">
        <section class="hero">
          <h1>تحقّق من صحّة وثيقة عقاريّة</h1>
          <p>أدخل رمز السند الظاهر على صحيفة الملكية، أو امسح رمز QR من خلف الصحيفة، للتحقّق
             من صدورها رسمياً عن سجلّ العقارات الليبي.</p>
        </section>

        <form class="search" (ngSubmit)="go()">
          <label class="field">
            <span>رمز السند العقاري</span>
            <input [(ngModel)]="code" name="code" placeholder="PRP-2026-0438" dir="ltr" autofocus />
          </label>
          <button type="submit" class="btn-primary">تحقّق ←</button>
        </form>

        <div class="grid">
          <div class="card">
            <div class="ico"><span>1</span></div>
            <h3>أدخل الرمز</h3>
            <p>الرمز يبدأ بـ <code>PRP-</code> ويتكوّن من ١٠ خانات.</p>
          </div>
          <div class="card">
            <div class="ico"><span>2</span></div>
            <h3>تحقّق المنظومة</h3>
            <p>المنظومة تُطابق توقيع المستند مع السجلّ المركزي.</p>
          </div>
          <div class="card">
            <div class="ico"><span>3</span></div>
            <h3>اعرض النتيجة</h3>
            <p>تظهر بيانات العقار العامّة والموقع، مع رابط تنزيل صحيفة الملكية.</p>
          </div>
        </div>
      </main>

      <footer class="foot">
        <span>© 2026 صَرح — LVCT</span>
        <span class="mono">verify.sarh.ly</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--paper); }
    .shell { min-height: 100vh; display: flex; flex-direction: column; }

    .brand {
      background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%);
      color: #FAFAF9;
      position: relative;
    }
    .band {
      height: 4px;
      background: linear-gradient(90deg, var(--warn), var(--accent), var(--good));
    }
    .brand-row {
      max-width: 1100px; margin: 0 auto;
      padding: 16px 24px;
      display: flex; align-items: center; gap: 12px;
    }
    .logo-ring {
      width: 38px; height: 38px;
      border-radius: 50%;
      background: rgba(249, 115, 22, 0.15);
      border: 1px solid rgba(249, 115, 22, 0.4);
      color: var(--accent);
      display: grid; place-items: center;
    }
    .brand-text { display: flex; flex-direction: column; gap: 2px; }
    .brand-ar { font-size: 17px; font-weight: 700; color: var(--accent); }
    .brand-en { font-size: 9.5px; letter-spacing: 0.2em; color: rgba(249, 115, 22, 0.55); direction: ltr; }

    .main { flex: 1; max-width: 1100px; margin: 0 auto; padding: 56px 24px; width: 100%; }

    .hero { margin-bottom: 28px; max-width: 720px; }
    .hero h1 { font-size: 28px; margin: 0 0 12px; color: var(--ink); }
    .hero p  { font-size: 14px; color: var(--muted); line-height: 1.85; margin: 0; }

    .search {
      display: flex; gap: 10px; align-items: flex-end;
      max-width: 720px;
      margin-bottom: 36px;
    }
    .field { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .field span { font-size: 11.5px; font-weight: 600; color: var(--muted); }
    .field input {
      padding: 11px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: var(--ink);
      transition: border-color .12s;
    }
    .field input:focus { outline: none; border-color: var(--accent); }

    .btn-primary {
      padding: 11px 22px;
      background: var(--primary); color: var(--accent);
      border: 1px solid var(--primary);
      border-radius: 8px;
      font-size: 13px; font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: all .12s;
      align-self: flex-end;
    }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      max-width: 980px;
    }
    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .card h3 { margin: 8px 0 4px; color: var(--ink); font-size: 14px; }
    .card p  { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.7; }
    .card code { background: rgba(15, 23, 42, 0.06); padding: 1px 5px; border-radius: 3px; font-size: 11px; }

    .ico {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: rgba(249, 115, 22, 0.14);
      color: #C2410C;
      display: grid; place-items: center;
      font-size: 12px; font-weight: 700;
    }

    .foot {
      max-width: 1100px; margin: 0 auto;
      padding: 18px 24px;
      border-top: 1px solid var(--rule);
      display: flex; justify-content: space-between;
      font-size: 11px; color: var(--muted);
    }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; direction: ltr; }
  `],
})
export class VerifyHomePage {
  private readonly router = inject(Router);
  code = '';

  go(): void {
    const c = this.code.trim();
    if (c) void this.router.navigate(['/verify', c]);
  }
}
