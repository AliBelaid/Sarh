import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <header class="top">
        <div class="brand">
          <div class="seal" aria-hidden="true">س</div>
          <div>
            <div class="title display">سِجِلّي</div>
            <div class="sub mono">SIJILLI · LIBYAN REGISTRY</div>
          </div>
        </div>
        <nav class="actions">
          <a routerLink="/verify">التحقق من سند</a>
          @if (signed()) {
            <a [routerLink]="home()" class="primary">الذهاب إلى لوحتي</a>
          } @else {
            <a routerLink="/login" class="primary">دخول</a>
          }
        </nav>
      </header>

      <section class="hero">
        <h1 class="display">السجل العقاري الليبي + الهوية الرقمية</h1>
        <p class="lede">
          منصة موحّدة لتسجيل العقارات وإصدار سندات رقمية موقّعة، وبطاقة هوية NFC
          آمنة لكل مواطن. مبنية على المعايير الدولية للهوية ذاتية السيادة.
        </p>
        <div class="cta">
          <a routerLink="/login" class="btn-primary">ابدأ الآن</a>
          <a routerLink="/verify" class="btn-ghost">تحقق من سند بالـ QR</a>
        </div>
      </section>

      <section class="grid">
        <article>
          <div class="dot" style="background: var(--primary)"></div>
          <h3>سند رقمي موقّع</h3>
          <p>كل سند مُلكية يصدر بصيغة PAdES موقّع رقمياً مع رمز QR للتحقق العام.</p>
        </article>
        <article>
          <div class="dot" style="background: var(--accent)"></div>
          <h3>هوية NFC مقاومة للنسخ</h3>
          <p>بطاقة NTAG 424 DNA بحماية SUN ومعدّاد رولينج يتحقق منه الخادم.</p>
        </article>
        <article>
          <div class="dot" style="background: var(--good)"></div>
          <h3>هوية ذاتية السيادة</h3>
          <p>محفظة DID خاصة بالمواطن مع شهادات قابلة للتحقق وفق Hyperledger Aries.</p>
        </article>
        <article>
          <div class="dot" style="background: var(--warn)"></div>
          <h3>سجل تدقيق غير قابل للتعديل</h3>
          <p>كل عملية كتابة تُسجّل بشكل غير قابل للحذف أو التعديل، للحوكمة والامتثال.</p>
        </article>
      </section>

      <footer class="bottom mono">
        © {{ year }} LVCT — Libya Vision for Communication & Technology
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .page {
      min-height: 100vh;
      background:
        radial-gradient(1100px 500px at 80% -10%, rgba(212,175,55,0.10), transparent),
        radial-gradient(900px 460px at -10% 110%, rgba(35,158,70,0.10), transparent),
        var(--paper);
      display: flex; flex-direction: column;
    }
    .top {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 32px;
      border-bottom: 1px solid var(--rule);
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .seal {
      width: 42px; height: 42px; border-radius: 50%;
      background: var(--primary); color: var(--accent);
      display: grid; place-items: center; font-weight: 700; font-size: 24px;
    }
    .title { font-size: 22px; font-weight: 700; }
    .sub { font-size: 9px; letter-spacing: 0.22em; color: var(--muted); margin-top: 2px; }
    .actions { display: flex; gap: 14px; align-items: center; }
    .actions a { text-decoration: none; color: var(--muted); font-size: 13px; }
    .actions a:hover { color: var(--ink); }
    .actions a.primary {
      background: var(--primary); color: var(--accent);
      padding: 8px 18px; border: 0;
    }
    .actions a.primary:hover { background: #1a2a22; color: var(--accent); }

    .hero {
      max-width: 820px; margin: 60px auto; padding: 0 24px;
      text-align: center;
    }
    .hero h1 { font-size: clamp(28px, 4vw, 44px); line-height: 1.15; margin: 0 0 14px; }
    .hero .lede { font-size: 16px; color: var(--muted); max-width: 620px; margin: 0 auto; line-height: 1.7; }
    .cta { margin-top: 30px; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .btn-primary, .btn-ghost {
      padding: 12px 22px; font-size: 14px; text-decoration: none;
      border: 1px solid var(--primary);
    }
    .btn-primary { background: var(--primary); color: var(--accent); }
    .btn-primary:hover { background: #1a2a22; }
    .btn-ghost { background: transparent; color: var(--primary); }
    .btn-ghost:hover { background: rgba(15,26,20,0.04); }

    .grid {
      max-width: 980px; margin: 60px auto; padding: 0 24px;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px;
    }
    .grid article {
      background: var(--paper); border: 1px solid var(--rule);
      padding: 20px;
    }
    .grid .dot { width: 10px; height: 10px; border-radius: 50%; margin-bottom: 10px; }
    .grid h3 { margin: 6px 0 6px; font-size: 15px; }
    .grid p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }

    .bottom { text-align: center; padding: 22px; color: var(--muted); font-size: 10px; border-top: 1px solid var(--rule); }
  `],
})
export class LandingPage {
  private readonly auth = inject(AuthService);

  readonly year = new Date().getFullYear();
  readonly signed = computed(() => this.auth.isAuthenticated());
  readonly home = computed(() => {
    const u = this.auth.user();
    return u ? this.auth.homeFor(u.role) : '/login';
  });
}
