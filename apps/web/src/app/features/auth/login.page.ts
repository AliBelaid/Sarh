import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';

function canRoleAccess(role: string, path: string): boolean {
  // Refuse to bounce back to system pages.
  if (path.startsWith('/forbidden') || path.startsWith('/login')) return false;
  const officer = ['registry_officer', 'reviewer', 'super_admin'];
  const issuer  = ['id_issuer', 'super_admin'];
  const admin   = ['super_admin', 'auditor'];
  if (path.startsWith('/app/my/'))                                      return role === 'citizen';
  if (path.startsWith('/app/queue') || path.startsWith('/app/approvals') || path.startsWith('/app/review')) return officer.includes(role);
  if (path.startsWith('/app/issue'))                                    return issuer.includes(role);
  if (path.match(/^\/app\/(citizens|properties|digital-ids|users|audit|reports)/)) return admin.includes(role);
  return true;
}

interface QuickRole {
  key: 'citizen' | 'officer' | 'manager' | 'issuer';
  ar: string;
  email: string;
  password: string;
  accent: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">

      <a routerLink="/" class="back-home">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span>الرجوع للصفحة الرئيسية</span>
      </a>

      <div class="card">
        <button class="lang-pill" type="button" (click)="toggleLang()">
          {{ lang() === 'ar' ? 'EN' : 'عر' }}
        </button>

        <div class="card-head">
          <div class="seal" aria-hidden="true">ص</div>
          <h1 class="display">صَرح</h1>
          <p class="sub mono">SARH · LIBYAN REGISTRY + DIGITAL ID</p>
        </div>

        @if (error()) {
          <div class="err">
            <span class="err-mark">!</span>
            <span>{{ error() }}</span>
          </div>
        }

        <form (ngSubmit)="submit()" autocomplete="off" class="form">
          <label class="field">
            <span class="lbl">البريد الإلكتروني</span>
            <input
              type="email" name="email" [(ngModel)]="email" required
              dir="ltr" autocomplete="username" placeholder="user@sarh.ly"
              [disabled]="loading()" />
          </label>

          <label class="field">
            <span class="lbl">كلمة المرور</span>
            <div class="pw-wrap">
              <input
                [type]="showPw() ? 'text' : 'password'"
                name="password" [(ngModel)]="password" required dir="ltr"
                autocomplete="current-password" placeholder="••••••••"
                [disabled]="loading()" />
              <button type="button" class="pw-toggle" (click)="showPw.set(!showPw())"
                [title]="showPw() ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'">
                @if (showPw()) {
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </label>

          <button type="submit" class="submit" [disabled]="loading() || !email || !password">
            @if (loading()) {
              <span class="spin"></span>
              <span>جارٍ التحقق…</span>
            } @else {
              <span>دخول</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            }
          </button>
        </form>

        <div class="quick">
          <div class="quick-label">دخول سريع للتجربة</div>
          <div class="quick-grid">
            @for (q of quickRoles; track q.key) {
              <button type="button" class="quick-btn" [style.--qa]="q.accent"
                      (click)="quickFill(q)" [disabled]="loading()">
                <span class="quick-dot"></span>
                {{ q.ar }}
              </button>
            }
          </div>
        </div>

        <p class="foot mono">© {{ year }} LVCT — Libya Vision for Communication & Technology</p>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }

    .page {
      min-height: 100vh;
      display: grid; place-items: center;
      padding: 24px;
      position: relative;
      overflow: hidden;
      background:
        radial-gradient(1100px 600px at 80% -10%, rgba(249, 115, 22, 0.18), transparent 60%),
        radial-gradient(900px 500px at -10% 110%, rgba(8, 145, 178, 0.12), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 45%, #243a31 100%);
    }
    .page::before {
      content: '';
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(249, 115, 22, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(249, 115, 22, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
    }

    .back-home {
      position: absolute;
      top: 22px;
      inset-inline-start: 22px;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(249, 115, 22, 0.2);
      border-radius: 999px;
      color: #cbd5c8;
      font-size: 12px; font-weight: 500;
      text-decoration: none;
      transition: all .2s;
      z-index: 5;
    }
    .back-home:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: var(--accent); }

    .card {
      position: relative;
      width: 100%; max-width: 460px;
      background: rgba(255, 255, 255, 0.97);
      backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 40px 36px 30px;
      box-shadow:
        0 30px 70px rgba(0, 0, 0, 0.35),
        0 0 0 1px rgba(249, 115, 22, 0.18);
      z-index: 1;
    }

    .lang-pill {
      position: absolute;
      top: 16px;
      inset-inline-end: 16px;
      width: 38px; height: 38px;
      border-radius: 50%;
      border: 1.5px solid var(--rule);
      background: var(--paper);
      color: var(--ink);
      font-size: 12px; font-weight: 700;
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
    }
    .lang-pill:hover { background: rgba(249, 115, 22, 0.12); border-color: var(--accent); color: var(--accent); }

    .card-head { text-align: center; margin-bottom: 26px; }
    .seal {
      width: 78px; height: 78px;
      margin: 0 auto 14px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      display: grid; place-items: center;
      font-size: 38px; font-weight: 700;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.35);
      border: 3px solid var(--accent);
    }
    .card-head h1 { font-size: 28px; font-weight: 800; color: var(--ink); margin: 0 0 4px; letter-spacing: -0.5px; }
    .sub { font-size: 9px; letter-spacing: 0.22em; color: var(--muted); margin: 0; }

    .err {
      display: flex; align-items: center; gap: 10px;
      background: #fff5f5;
      border: 1px solid #fecaca;
      color: var(--warn);
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .err-mark {
      display: grid; place-items: center;
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--warn);
      color: #fff;
      font-size: 13px; font-weight: 700;
      flex-shrink: 0;
    }

    .form { display: flex; flex-direction: column; gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .lbl { font-size: 12.5px; font-weight: 600; color: #334155; }
    .field input {
      width: 100%;
      padding: 11px 14px;
      font-size: 14px; color: var(--ink);
      background: var(--paper);
      border: 1.5px solid var(--rule);
      border-radius: 10px;
      box-sizing: border-box;
      transition: all .15s;
      font-family: inherit;
    }
    .field input:focus {
      outline: none;
      border-color: var(--accent);
      background: #fff;
      box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.15);
    }
    .field input:disabled { background: #f4f1e8; cursor: not-allowed; }

    .pw-wrap { position: relative; }
    .pw-wrap input { padding-inline-end: 44px; }
    .pw-toggle {
      position: absolute;
      top: 50%; transform: translateY(-50%);
      inset-inline-end: 8px;
      display: grid; place-items: center;
      width: 32px; height: 32px;
      border: 0; background: transparent;
      color: var(--muted);
      cursor: pointer;
      border-radius: 6px;
    }
    .pw-toggle:hover { color: var(--accent); background: rgba(249, 115, 22, 0.08); }

    .submit {
      margin-top: 6px;
      padding: 12px 18px;
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(135deg, var(--primary) 0%, #1e293b 100%);
      color: var(--accent);
      border: 0;
      border-radius: 10px;
      font-size: 14px; font-weight: 700; letter-spacing: 0.04em;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25);
      transition: all .2s;
      font-family: inherit;
    }
    .submit:hover:not(:disabled) {
      background: linear-gradient(135deg, #1e293b, #243a31);
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);
    }
    .submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .submit svg { transition: transform .2s; }
    [dir='rtl'] .submit svg { transform: scaleX(-1); }
    [dir='rtl'] .submit:hover:not(:disabled) svg { transform: scaleX(-1) translateX(-3px); }

    .spin {
      width: 16px; height: 16px;
      border: 2.5px solid rgba(249, 115, 22, 0.3);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .quick {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid var(--rule);
    }
    .quick-label {
      text-align: center;
      font-size: 11px; font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .quick-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .quick-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 12px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 12px; font-weight: 600;
      color: var(--ink);
      cursor: pointer;
      transition: all .15s;
      font-family: inherit;
    }
    .quick-btn:hover:not(:disabled) {
      border-color: var(--qa);
      background: #fff;
    }
    .quick-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .quick-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--qa);
      flex-shrink: 0;
    }

    .foot {
      text-align: center;
      margin: 22px 0 0;
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    @media (max-width: 540px) {
      .card { padding: 30px 22px 22px; border-radius: 16px; }
      .quick-grid { grid-template-columns: 1fr 1fr; }
      .back-home span { display: none; }
    }
  `],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly year = new Date().getFullYear();

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  showPw = signal(false);
  lang = signal<'ar' | 'en'>(
    typeof localStorage !== 'undefined'
      ? ((localStorage.getItem('sarh.lang') as 'ar' | 'en') || 'ar')
      : 'ar',
  );

  readonly quickRoles: QuickRole[] = [
    { key: 'citizen',  ar: 'مواطن (تجريبي)',  email: 'demo@sarh.ly',     password: 'Demo!12345', accent: '#3b82f6' },
    { key: 'officer',  ar: 'موظف تسجيل',     email: 'officer@sarh.ly',  password: 'Demo!12345', accent: '#0891B2' },
    { key: 'manager',  ar: 'مدير القسم',     email: 'manager@sarh.ly',  password: 'Demo!12345', accent: '#5b21b6' },
    { key: 'issuer',   ar: 'مصدر هويات',     email: 'idissuer@sarh.ly', password: 'Demo!12345', accent: '#DC2626' },
  ];

  toggleLang(): void {
    const next = this.lang() === 'ar' ? 'en' : 'ar';
    this.lang.set(next);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', next === 'ar' ? 'rtl' : 'ltr');
      document.documentElement.setAttribute('lang', next);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sarh.lang', next);
    }
  }

  quickFill(q: QuickRole): void {
    this.email = q.email;
    this.password = q.password;
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (!this.email || !this.password) {
      this.error.set('أدخل البريد الإلكتروني وكلمة المرور.');
      return;
    }
    this.loading.set(true);
    try {
      const user = await this.auth.signIn(this.email.trim(), this.password);
      const next = this.route.snapshot.queryParamMap.get('next');
      const target = next && canRoleAccess(user.role, next) ? next : this.auth.homeFor(user.role);
      this.router.navigateByUrl(target);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string; message_en?: string } }; status?: number; message?: string };
      this.error.set(
        err.error?.error?.message_ar ??
          (err.status === 401
            ? 'بيانات الدخول غير صحيحة.'
            : 'تعذّر تسجيل الدخول. حاول مجدداً.'),
      );
    } finally {
      this.loading.set(false);
    }
  }
}
