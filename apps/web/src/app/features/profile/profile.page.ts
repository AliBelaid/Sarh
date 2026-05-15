import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { SarhRole } from '@core/auth.types';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="profile fade-in">
      <div class="hero-card">
        <div class="hero-bg"></div>
        <div class="hero-content">
          <div class="avatar">{{ initial() }}</div>
          <div class="hero-text">
            <h1 class="display">{{ name() }}</h1>
            <div class="role-badge">
              <span class="role-dot" [style.background]="roleAccent()"></span>
              {{ roleLabel() }}
            </div>
          </div>
        </div>
      </div>

      <div class="grid">
        <div class="card slide-up stagger-1">
          <div class="card-head">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <h2>تفاصيل الحساب</h2>
          </div>
          <dl>
            <dt>البريد الإلكتروني</dt>
            <dd dir="ltr">{{ user()?.email ?? '—' }}</dd>
            <dt>المعرف</dt>
            <dd dir="ltr" class="mono small">{{ user()?.id ?? '—' }}</dd>
            @if (user()?.officer_id) {
              <dt>معرف الموظف</dt>
              <dd dir="ltr" class="mono small">{{ user()?.officer_id }}</dd>
            }
            @if (user()?.citizen_id) {
              <dt>معرف المواطن</dt>
              <dd dir="ltr" class="mono small">{{ user()?.citizen_id }}</dd>
            }
          </dl>
        </div>

        <div class="card slide-up stagger-2">
          <div class="card-head">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <h2>الأمان</h2>
          </div>
          <ul class="sec-list">
            <li>
              <span class="ck"></span>
              <span>مصادقة JWT — HS256 مع انتهاء كل ساعة</span>
            </li>
            <li>
              <span class="ck"></span>
              <span>كلمة مرور مشفرة — bcrypt cost-12</span>
            </li>
            <li>
              <span class="ck"></span>
              <span>الرمز لا يحتوي بيانات شخصية</span>
            </li>
          </ul>
        </div>

        <div class="card slide-up stagger-3">
          <div class="card-head">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <h2>الجلسة الحالية</h2>
          </div>
          <dl>
            <dt>المتصفح</dt>
            <dd class="small">{{ browser() }}</dd>
            <dt>اللغة</dt>
            <dd>{{ langLabel() }}</dd>
            <dt>الدور</dt>
            <dd>{{ roleLabel() }}</dd>
          </dl>
        </div>

        <div class="card slide-up stagger-4">
          <div class="card-head">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>
            <h2>روابط سريعة</h2>
          </div>
          <div class="quick-links">
            <a routerLink="/app/dashboard" class="qlink">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
              الرئيسية
            </a>
            <a routerLink="/app/notifications" class="qlink">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
              الإشعارات
            </a>
            <a routerLink="/verify" class="qlink">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
              التحقق العام
            </a>
          </div>
        </div>
      </div>

      <button class="logout slide-up stagger-5" (click)="logout()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        تسجيل الخروج
      </button>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .profile { max-width: 820px; margin: 0 auto; }

    .hero-card {
      position: relative;
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 22px;
      padding: 32px 28px;
      color: #fff;
    }
    .hero-bg {
      position: absolute; inset: 0;
      background:
        radial-gradient(600px 300px at 90% -20%, rgba(249,115,22,0.35), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 60%, #243a31 100%);
    }
    .hero-bg::after {
      content: '';
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(249,115,22,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(249,115,22,0.04) 1px, transparent 1px);
      background-size: 32px 32px;
    }
    .hero-content { position: relative; z-index: 1; display: flex; align-items: center; gap: 20px; }
    .avatar {
      width: 72px; height: 72px; border-radius: 16px;
      background: linear-gradient(135deg, var(--accent), #C2410C);
      color: var(--primary);
      display: grid; place-items: center;
      font-size: 28px; font-weight: 800;
      box-shadow: 0 8px 24px rgba(249,115,22,0.3);
      flex-shrink: 0;
    }
    .hero-text h1 { font-size: 24px; margin: 0 0 8px; color: #fff; }
    .role-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 5px 14px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(249,115,22,0.3);
      border-radius: 99px;
      font-size: 12px; font-weight: 600; color: #fff;
    }
    .role-dot { width: 8px; height: 8px; border-radius: 50%; }

    .grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }

    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 20px;
    }
    .card-head {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 14px;
      color: var(--accent);
    }
    .card-head h2 { font-size: 14px; margin: 0; color: var(--ink); }

    dl { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 8px 14px; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); word-break: break-all; }
    .small { font-size: 11.5px; }
    .mono { font-family: var(--font-mono); }

    .sec-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .sec-list li { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--ink); }
    .ck {
      width: 20px; height: 20px; border-radius: 50%;
      background: var(--good); flex-shrink: 0;
      position: relative;
    }
    .ck::before {
      content: ''; position: absolute;
      top: 6px; left: 5px;
      width: 9px; height: 5px;
      border-left: 2px solid #fff;
      border-bottom: 2px solid #fff;
      transform: rotate(-45deg);
    }

    .quick-links { display: flex; flex-direction: column; gap: 6px; }
    .qlink {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
      color: var(--ink);
      text-decoration: none;
      font-size: 13px; font-weight: 500;
      transition: all .15s;
    }
    .qlink:hover { border-color: var(--accent); color: var(--accent); transform: translateX(-4px); }
    .qlink svg { color: var(--muted); transition: color .15s; }
    .qlink:hover svg { color: var(--accent); }

    .logout {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px;
      border: 1px solid var(--rule);
      background: #fff;
      color: var(--warn);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px; font-weight: 600;
      font-family: inherit;
      transition: all .15s;
    }
    .logout:hover { background: #fff2f3; border-color: var(--warn); transform: translateY(-1px); }
  `],
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = computed(() => this.auth.user());
  readonly name = computed(() => this.user()?.email?.split('@')[0] ?? '—');
  readonly initial = computed(() => this.name().charAt(0).toUpperCase());
  readonly roleLabel = computed(() => this.label(this.user()?.role));

  readonly roleAccent = computed(() => {
    switch (this.user()?.role) {
      case 'super_admin':      return 'var(--accent)';
      case 'auditor':          return 'var(--warn)';
      case 'registry_officer': return 'var(--good)';
      case 'reviewer':         return 'var(--good)';
      case 'id_issuer':        return 'var(--accent)';
      case 'citizen':          return '#3b82f6';
      default:                 return 'var(--muted)';
    }
  });

  readonly browser = computed(() => {
    if (typeof navigator === 'undefined') return '—';
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Microsoft Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'متصفح آخر';
  });

  readonly langLabel = computed(() => {
    const dir = typeof document !== 'undefined' ? document.documentElement.getAttribute('dir') : 'rtl';
    return dir === 'ltr' ? 'English' : 'العربية';
  });

  logout(): void {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }

  private label(role: SarhRole | undefined): string {
    switch (role) {
      case 'super_admin':      return 'مسؤول عام';
      case 'auditor':          return 'مدقق';
      case 'registry_officer': return 'موظف تسجيل';
      case 'reviewer':         return 'مراجع';
      case 'id_issuer':        return 'مصدر هويات';
      case 'citizen':          return 'مواطن';
      default:                 return '—';
    }
  }
}
