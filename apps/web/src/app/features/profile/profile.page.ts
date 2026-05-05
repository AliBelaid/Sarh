import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { SarhRole } from '@core/auth.types';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="profile">
      <header class="head">
        <div class="avatar">{{ initial() }}</div>
        <div>
          <h1 class="display">{{ name() }}</h1>
          <div class="role mono">{{ roleLabel() }}</div>
        </div>
      </header>

      <div class="card">
        <h2>تفاصيل الحساب</h2>
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

      <button class="logout" (click)="logout()">
        تسجيل الخروج
      </button>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .profile { max-width: 720px; margin: 0 auto; }

    .head {
      display: flex; align-items: center; gap: 18px;
      margin-bottom: 24px;
    }
    .avatar {
      width: 64px; height: 64px; border-radius: 14px;
      background: linear-gradient(135deg, var(--accent), var(--good));
      color: var(--primary);
      display: grid; place-items: center;
      font-size: 24px; font-weight: 800;
    }
    .head h1 { font-size: 22px; margin: 0; color: var(--ink); }
    .role { font-size: 11px; color: var(--muted); letter-spacing: 0.18em; margin-top: 4px; }

    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 18px;
    }
    .card h2 { font-size: 14px; margin: 0 0 14px; color: var(--ink); }
    dl { margin: 0; display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); }
    .small { font-size: 11px; }

    .logout {
      padding: 10px 20px;
      border: 1px solid var(--rule);
      background: #fff;
      color: var(--warn);
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px; font-weight: 600;
      font-family: inherit;
    }
    .logout:hover { background: #fff2f3; border-color: var(--warn); }
  `],
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = computed(() => this.auth.user());
  readonly name = computed(() => this.user()?.email?.split('@')[0] ?? '—');
  readonly initial = computed(() => this.name().charAt(0).toUpperCase());
  readonly roleLabel = computed(() => this.label(this.user()?.role));

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
