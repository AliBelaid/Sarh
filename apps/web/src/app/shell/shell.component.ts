import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { SijilliRole } from '@core/auth.types';

interface NavItem {
  path: string;
  ar: string;
  en: string;
  roles: readonly SijilliRole[];
}

const NAV: NavItem[] = [
  // Citizen
  { path: '/citizen',                ar: 'لوحتي',          en: 'My dashboard',  roles: ['citizen'] },
  { path: '/citizen/properties',     ar: 'عقاراتي',        en: 'My properties', roles: ['citizen'] },
  { path: '/citizen/properties/new', ar: 'تسجيل عقار',     en: 'Register',      roles: ['citizen'] },
  { path: '/citizen/id',             ar: 'هويتي الرقمية',   en: 'My digital ID', roles: ['citizen'] },

  // Officer
  { path: '/officer',                ar: 'لوحة الموظف',    en: 'Officer',       roles: ['registry_officer', 'reviewer', 'super_admin'] },
  { path: '/officer/queue',          ar: 'قائمة المراجعة', en: 'Queue',         roles: ['registry_officer', 'reviewer', 'super_admin'] },
  { path: '/officer/approvals',      ar: 'الاعتمادات',     en: 'Approvals',     roles: ['registry_officer', 'reviewer', 'super_admin'] },

  // ID Issuer
  { path: '/id-issuer',              ar: 'محطة الإصدار',   en: 'ID station',    roles: ['id_issuer', 'super_admin'] },
  { path: '/id-issuer/produce',      ar: 'إصدار جديد',     en: 'New issuance',  roles: ['id_issuer', 'super_admin'] },
  { path: '/id-issuer/reissue',      ar: 'إعادة إصدار',    en: 'Re-issue',      roles: ['id_issuer', 'super_admin'] },

  // Admin
  { path: '/admin',                  ar: 'الإدارة',        en: 'Admin',         roles: ['super_admin', 'auditor'] },
  { path: '/admin/citizens',         ar: 'المواطنون',      en: 'Citizens',      roles: ['super_admin', 'auditor'] },
  { path: '/admin/properties',       ar: 'العقارات',       en: 'Properties',    roles: ['super_admin', 'auditor'] },
  { path: '/admin/digital-ids',      ar: 'الهويات',        en: 'Digital IDs',   roles: ['super_admin', 'auditor'] },
  { path: '/admin/officers',         ar: 'الموظفون',       en: 'Officers',      roles: ['super_admin'] },
  { path: '/admin/audit',            ar: 'سجل التدقيق',    en: 'Audit',         roles: ['super_admin', 'auditor'] },
  { path: '/admin/reports',          ar: 'التقارير',       en: 'Reports',       roles: ['super_admin', 'auditor'] },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <header class="masthead">
        <div class="brand">
          <div class="seal" aria-hidden="true">س</div>
          <div>
            <div class="brand-title display">سِجِلّي</div>
            <div class="brand-sub mono">SIJILLI · LIBYAN REGISTRY</div>
          </div>
        </div>
        <div class="meta mono">
          @if (auth.user(); as u) {
            <span class="user">
              {{ u.email ?? '—' }}
              <span class="role">· {{ roleLabel(u.role) }}</span>
            </span>
          }
          <button class="tool-btn" (click)="logout()">⏻ خروج</button>
        </div>
      </header>

      <nav class="nav">
        @for (n of visibleNav(); track n.path) {
          <a [routerLink]="n.path"
             routerLinkActive="active"
             [routerLinkActiveOptions]="{ exact: false }"
             class="nav-link">{{ n.ar }}</a>
        }
      </nav>

      <main class="body">
        <router-outlet></router-outlet>
      </main>

      <footer class="foot mono">
        <span>سِجِلّي · LVCT © {{ year }}</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--paper); }
    .shell { min-height: 100vh; display: flex; flex-direction: column; }
    .masthead {
      border-bottom: 1px solid var(--rule);
      padding: 18px 28px 14px;
      display: flex; align-items: center; gap: 20px;
    }
    .brand { display: flex; align-items: center; gap: 14px; flex: 1; }
    .seal {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--primary); color: var(--accent);
      display: grid; place-items: center;
      font-size: 22px; font-weight: 700;
      font-family: var(--font-ar);
      letter-spacing: 0;
    }
    .brand-title { font-size: 22px; font-weight: 700; line-height: 1.05; color: var(--ink); }
    .brand-sub { font-size: 9px; letter-spacing: 0.22em; color: var(--muted); margin-top: 2px; }
    .meta { display: flex; gap: 14px; align-items: center; font-size: 11px; color: var(--muted); }
    .user { display: inline-flex; gap: 6px; }
    .user .role { color: var(--accent); }
    .tool-btn {
      background: transparent; border: 1px solid var(--rule);
      padding: 6px 10px; font-size: 11px; cursor: pointer;
      color: var(--muted); font-family: var(--font-ar);
    }
    .tool-btn:hover { color: var(--warn); border-color: var(--warn); }
    .nav {
      border-bottom: 1px solid var(--rule);
      padding: 0 28px;
      display: flex; gap: 0; background: var(--paper);
      position: sticky; top: 0; z-index: 10;
      overflow-x: auto;
    }
    .nav-link {
      padding: 14px 16px; font-size: 13px; color: var(--muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px; text-decoration: none; white-space: nowrap;
    }
    .nav-link:hover { color: var(--ink); }
    .nav-link.active { color: var(--primary); border-bottom-color: var(--accent); }
    .body { flex: 1; padding: 24px 28px 40px; }
    .foot {
      padding: 14px 28px; border-top: 1px solid var(--rule);
      font-size: 10px; color: var(--muted);
    }
  `],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly year = new Date().getFullYear();

  readonly visibleNav = computed(() => {
    const role = this.auth.user()?.role;
    if (!role) return [];
    return NAV.filter((n) => n.roles.includes(role));
  });

  roleLabel(role: SijilliRole): string {
    switch (role) {
      case 'super_admin':      return 'مسؤول عام';
      case 'auditor':          return 'مدقق';
      case 'registry_officer': return 'موظف تسجيل';
      case 'reviewer':         return 'مراجع';
      case 'id_issuer':        return 'مصدر هويات';
      case 'citizen':          return 'مواطن';
    }
  }

  logout(): void {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
