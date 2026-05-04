import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-shell">
      <div class="login-card">
        <div class="brand">
          <div class="seal" aria-hidden="true">س</div>
          <div>
            <div class="display title">سِجِلّي</div>
            <div class="mono sub">SIJILLI · LIBYAN REGISTRY + DIGITAL ID</div>
          </div>
        </div>

        <h1 class="welcome">تسجيل الدخول</h1>

        <form (ngSubmit)="submit()" autocomplete="off">
          <label class="field">
            <span>البريد الإلكتروني</span>
            <input type="email" name="email" [(ngModel)]="email" required dir="ltr" />
          </label>
          <label class="field">
            <span>كلمة المرور</span>
            <input type="password" name="password" [(ngModel)]="password" required dir="ltr" />
          </label>

          @if (error()) {
            <div class="err mono">{{ error() }}</div>
          }

          <button type="submit" class="primary" [disabled]="loading()">
            {{ loading() ? 'جارٍ التحقق…' : 'دخول' }}
          </button>
        </form>

        <div class="hint mono">
          For demo: demo@sijilli.ly / Demo!12345
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .login-shell {
      min-height: 100vh;
      display: grid; place-items: center;
      background:
        radial-gradient(1200px 600px at 80% -10%, rgba(212,175,55,0.10), transparent),
        radial-gradient(900px 500px at -10% 110%, rgba(35,158,70,0.10), transparent),
        var(--paper);
      padding: 24px;
    }
    .login-card {
      width: 100%; max-width: 420px;
      background: var(--paper);
      border: 1px solid var(--rule);
      padding: 32px 28px;
      box-shadow: 0 12px 36px rgba(15, 26, 20, 0.06);
    }
    .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
    .seal {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--primary); color: var(--accent);
      display: grid; place-items: center; font-weight: 700; font-size: 26px;
    }
    .title { font-size: 24px; font-weight: 700; }
    .sub { font-size: 9px; letter-spacing: 0.22em; color: var(--muted); margin-top: 2px; }
    .welcome { font-size: 16px; font-weight: 600; margin: 0 0 16px; color: var(--ink); }
    .field { display: block; margin-bottom: 12px; }
    .field span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .field input {
      width: 100%; padding: 10px 12px; font-size: 14px;
      background: #fff; border: 1px solid var(--rule);
    }
    .field input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    .err {
      background: #fff5f5; color: var(--warn);
      border: 1px solid var(--warn);
      padding: 8px 10px; font-size: 12px; margin: 8px 0;
    }
    .primary {
      width: 100%; padding: 12px;
      background: var(--primary); color: var(--accent);
      border: 0; cursor: pointer; font-size: 14px; margin-top: 8px;
      letter-spacing: 0.04em;
    }
    .primary:hover:not(:disabled) { background: #1a2a22; }
    .primary:disabled { opacity: 0.6; cursor: progress; }
    .hint { font-size: 10px; color: var(--muted); margin-top: 16px; text-align: center; }
  `],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

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
      this.router.navigateByUrl(next ?? this.auth.homeFor(user.role));
    } catch (e: unknown) {
      const msg = (e as { error?: { error?: { message_ar?: string } }; message?: string });
      this.error.set(msg.error?.error?.message_ar ?? 'فشل تسجيل الدخول.');
    } finally {
      this.loading.set(false);
    }
  }
}
