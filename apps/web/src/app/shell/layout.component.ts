import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { SarhRole } from '@core/auth.types';

interface NavItem {
  ar: string;
  en: string;
  path: string;
  icon: NavIcon;
  roles: readonly SarhRole[];
  group?: 'main' | 'admin';
}

type NavIcon =
  | 'dashboard' | 'citizens' | 'properties' | 'digital-id' | 'queue'
  | 'approvals' | 'issue' | 'audit' | 'reports' | 'users' | 'profile' | 'verify' | 'nft';

const ALL_ROLES: readonly SarhRole[] = [
  'super_admin', 'auditor', 'registry_officer', 'reviewer', 'id_issuer', 'department_manager', 'citizen',
];

const NAV: NavItem[] = [
  { ar: 'الرئيسية',     en: 'Dashboard',  path: '/app/dashboard',   icon: 'dashboard',  roles: ALL_ROLES, group: 'main' },

  // Citizen-focused
  { ar: 'عقاراتي',      en: 'My properties', path: '/app/my/properties', icon: 'properties', roles: ['citizen'], group: 'main' },
  { ar: 'هويتي الرقمية', en: 'My digital ID', path: '/app/my/digital-id', icon: 'digital-id', roles: ['citizen'], group: 'main' },

  // Officer / reviewer
  { ar: 'قائمة المراجعة', en: 'Review queue',  path: '/app/queue',     icon: 'queue',     roles: ['registry_officer', 'reviewer', 'super_admin'], group: 'main' },
  { ar: 'الاعتمادات',    en: 'Approvals',     path: '/app/approvals', icon: 'approvals', roles: ['registry_officer', 'reviewer', 'super_admin'], group: 'main' },

  // Department manager (NFT licence final approval)
  { ar: 'الاعتمادات النهائية', en: 'Final approvals', path: '/app/manager/queue', icon: 'nft', roles: ['department_manager', 'super_admin'], group: 'main' },

  // ID issuer
  { ar: 'محطة الإصدار',  en: 'Issue station', path: '/app/issue',     icon: 'issue',     roles: ['id_issuer', 'super_admin'], group: 'main' },

  // Admin / auditor
  { ar: 'العقارات',       en: 'Properties', path: '/app/properties',   icon: 'properties', roles: ['super_admin', 'auditor'], group: 'admin' },
  { ar: 'المواطنون',      en: 'Citizens',   path: '/app/citizens',     icon: 'citizens',   roles: ['super_admin', 'auditor'], group: 'admin' },
  { ar: 'الهويات الرقمية', en: 'Digital IDs', path: '/app/digital-ids', icon: 'digital-id', roles: ['super_admin', 'auditor'], group: 'admin' },
  { ar: 'سجل رخص NFT',    en: 'NFT licences', path: '/app/nft-licences', icon: 'nft',        roles: ['super_admin', 'auditor', 'department_manager'], group: 'admin' },
  { ar: 'المستخدمون',    en: 'Users',      path: '/app/users',        icon: 'users',      roles: ['super_admin'], group: 'admin' },
  { ar: 'سجل التدقيق',   en: 'Audit log',  path: '/app/audit',        icon: 'audit',      roles: ['super_admin', 'auditor'], group: 'admin' },
  { ar: 'التقارير',       en: 'Reports',    path: '/app/reports',      icon: 'reports',    roles: ['super_admin', 'auditor'], group: 'admin' },
];

@Component({
  selector: 'app-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="layout" [class.collapsed]="collapsed()">

      <div class="backdrop" [class.show]="mobileOpen()" (click)="closeMobile()"></div>

      <aside class="sidebar" [class.mobile-open]="mobileOpen()">
        <div class="sb-head">
          <a routerLink="/app/dashboard" class="brand">
            <div class="seal" aria-hidden="true">ص</div>
            <div class="brand-text">
              <div class="brand-ar display">صَرح</div>
              <div class="brand-en mono">SARH</div>
            </div>
          </a>
          <button class="sb-toggle desktop-only" (click)="toggleCollapsed()" [title]="collapsed() ? 'فتح' : 'طي'">
            @if (collapsed()) {
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            } @else {
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            }
          </button>
        </div>

        <nav class="sb-nav">
          @for (group of groupedNav(); track group.key) {
            @if (group.items.length) {
              <div class="nav-group">
                @if (!collapsed() && group.label) {
                  <div class="nav-group-label">{{ group.label }}</div>
                }
                @for (n of group.items; track n.path) {
                  <a [routerLink]="n.path" routerLinkActive="active"
                     class="nav-link" [title]="n.ar" (click)="closeMobile()">
                    <span class="nav-ico" [innerHTML]="iconSvg(n.icon)"></span>
                    <span class="nav-label">{{ n.ar }}</span>
                  </a>
                }
              </div>
            }
          }
        </nav>

        <div class="sb-foot">
          <a routerLink="/app/profile" class="user-card">
            <div class="avatar">{{ initial() }}</div>
            <div class="user-meta">
              <div class="user-name">{{ displayName() }}</div>
              <div class="user-role">{{ roleLabel(authUser()?.role) }}</div>
            </div>
          </a>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="tb-left">
            <button class="hamburger mobile-only" (click)="openMobile()" title="القائمة">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div class="crumb">
              <span class="crumb-current">{{ currentNavLabel() }}</span>
            </div>
          </div>

          <div class="tb-right">
            <a routerLink="/verify" class="tb-btn tb-link" title="التحقق العام">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
              <span class="tb-link-text">التحقق</span>
            </a>
            <button class="tb-btn" (click)="toggleLang()" [title]="lang() === 'ar' ? 'English' : 'العربية'">
              <span class="lang-pill">{{ lang() === 'ar' ? 'EN' : 'عر' }}</span>
            </button>
            <span class="tb-user">{{ displayName() }}</span>
            <button class="tb-logout" (click)="logout()">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              <span class="tb-logout-text">خروج</span>
            </button>
          </div>
        </header>

        <main class="page">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; height: 100dvh; }

    .layout {
      display: flex;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      background: #f4f1e8;
    }

    /* ── Sidebar ─────────────────────────────────────────── */
    .sidebar {
      width: 248px; min-width: 248px;
      background: linear-gradient(180deg, #0F172A 0%, #1e293b 100%);
      color: #cbd5c8;
      display: flex; flex-direction: column;
      transition: width .25s ease, min-width .25s ease;
      z-index: 100;
      flex-shrink: 0;
      overflow: hidden;
      border-inline-end: 1px solid #1e293b;
    }
    .layout.collapsed .sidebar { width: 68px; min-width: 68px; }

    .sb-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px;
      height: 60px;
      border-bottom: 1px solid rgba(249, 115, 22, 0.08);
      flex-shrink: 0;
    }
    .brand {
      display: flex; align-items: center; gap: 12px;
      text-decoration: none; color: inherit;
      overflow: hidden;
      flex: 1;
    }
    .seal {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), #C2410C);
      color: var(--primary);
      display: grid; place-items: center;
      font-weight: 800; font-size: 20px;
      flex-shrink: 0;
      box-shadow: 0 2px 12px rgba(249, 115, 22, 0.25);
    }
    .brand-text {
      display: flex; flex-direction: column;
      transition: opacity .25s;
      overflow: hidden;
    }
    .brand-ar { font-size: 17px; font-weight: 700; color: #fff; line-height: 1.05; }
    .brand-en { font-size: 9px; letter-spacing: 0.22em; color: var(--accent); margin-top: 1px; }
    .layout.collapsed .brand-text { opacity: 0; width: 0; }

    .sb-toggle {
      width: 26px; height: 26px;
      display: grid; place-items: center;
      border: 0; border-radius: 6px;
      background: rgba(249, 115, 22, 0.06);
      color: #cbd5c8;
      cursor: pointer;
      flex-shrink: 0;
    }
    .sb-toggle:hover { background: rgba(249, 115, 22, 0.16); color: var(--accent); }

    .sb-nav {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 12px 8px;
    }
    .sb-nav::-webkit-scrollbar { width: 4px; }
    .sb-nav::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 4px; }

    .nav-group { margin-bottom: 12px; }
    .nav-group-label {
      font-size: 10px; font-weight: 700;
      letter-spacing: 0.18em;
      color: rgba(249, 115, 22, 0.6);
      padding: 8px 12px 6px;
      text-transform: uppercase;
    }

    .nav-link {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      color: #9da6a0;
      text-decoration: none;
      font-size: 13.5px; font-weight: 500;
      white-space: nowrap;
      position: relative;
      transition: background .15s, color .15s;
      margin-bottom: 1px;
    }
    .nav-link:hover { background: rgba(249, 115, 22, 0.06); color: #fff; }
    .nav-link.active {
      background: rgba(249, 115, 22, 0.12);
      color: #fff;
    }
    .nav-link.active::before {
      content: '';
      position: absolute;
      inset-inline-start: 0;
      top: 8px; bottom: 8px;
      width: 3px;
      background: var(--accent);
      border-radius: 0 3px 3px 0;
    }
    [dir='rtl'] .nav-link.active::before { border-radius: 3px 0 0 3px; }
    .nav-link.active .nav-ico { color: var(--accent); }

    .nav-ico {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px;
      flex-shrink: 0;
    }
    .nav-ico svg { display: block; }
    .nav-label { transition: opacity .25s; overflow: hidden; }
    .layout.collapsed .nav-label { opacity: 0; width: 0; }
    .layout.collapsed .nav-link { justify-content: center; padding: 10px 0; }
    .layout.collapsed .nav-group-label { display: none; }

    .sb-foot {
      padding: 12px;
      border-top: 1px solid rgba(249, 115, 22, 0.08);
      flex-shrink: 0;
    }
    .user-card {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: inherit;
      overflow: hidden;
      padding: 4px;
      border-radius: 8px;
    }
    .user-card:hover { background: rgba(249, 115, 22, 0.06); }
    .avatar {
      width: 36px; height: 36px; border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), var(--good));
      color: var(--primary);
      display: grid; place-items: center;
      font-size: 14px; font-weight: 700;
      flex-shrink: 0;
    }
    .user-meta { display: flex; flex-direction: column; overflow: hidden; }
    .user-name { font-size: 13px; font-weight: 600; color: #e8e3d2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { font-size: 11px; color: #9da6a0; white-space: nowrap; }
    .layout.collapsed .user-meta { opacity: 0; width: 0; }

    /* ── Main ─────────────────────────────────────────── */
    .main {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      height: 100vh; height: 100dvh;
      overflow: hidden;
    }

    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      height: 60px;
      padding: 0 24px;
      background: var(--paper);
      border-bottom: 1px solid var(--rule);
      flex-shrink: 0;
      z-index: 10;
    }
    .tb-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .crumb { display: flex; align-items: center; min-width: 0; }
    .crumb-current { font-size: 15px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .tb-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

    .tb-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px;
      border: 1px solid var(--rule);
      background: #fff;
      color: var(--muted);
      border-radius: 8px;
      cursor: pointer;
      font-size: 12.5px; font-weight: 500;
      text-decoration: none;
      font-family: inherit;
      transition: all .15s;
    }
    .tb-btn:hover { background: var(--paper); color: var(--ink); border-color: var(--accent); }
    .tb-link-text { font-size: 12.5px; }
    .lang-pill { font-size: 11px; font-weight: 700; letter-spacing: .04em; }

    .tb-user { font-size: 13.5px; font-weight: 500; color: var(--ink); }

    .tb-logout {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px;
      border: 1px solid var(--rule);
      background: #fff;
      color: var(--muted);
      border-radius: 8px;
      cursor: pointer;
      font-size: 12.5px; font-weight: 500;
      font-family: inherit;
      transition: all .15s;
    }
    .tb-logout:hover { background: #fff2f3; border-color: var(--warn); color: var(--warn); }
    .tb-logout-text { font-size: 12.5px; }

    .hamburger {
      display: none;
      width: 36px; height: 36px;
      border: 0; background: transparent;
      color: var(--ink); border-radius: 6px;
      cursor: pointer;
    }
    .hamburger:hover { background: var(--paper); }

    .page {
      flex: 1; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
      padding: 24px;
      background: #f4f1e8;
    }

    /* ── Mobile ─────────────────────────────────────────── */
    .backdrop {
      display: none;
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.5);
      z-index: 90;
      opacity: 0;
      transition: opacity .25s;
      pointer-events: none;
    }
    .backdrop.show { opacity: 1; pointer-events: auto; }

    .desktop-only { display: inline-flex; }
    .mobile-only { display: none; }

    @media (max-width: 1024px) {
      .tb-user, .tb-link-text, .tb-logout-text { display: none; }
      .tb-logout, .tb-btn { padding: 7px 9px; }
      .page { padding: 16px; }
    }

    @media (max-width: 768px) {
      .desktop-only { display: none !important; }
      .mobile-only { display: inline-flex !important; }
      .backdrop { display: block; }

      .sidebar {
        position: fixed; top: 0; bottom: 0;
        inset-inline-start: 0;
        width: 248px !important; min-width: 248px !important;
        transform: translateX(-100%);
        transition: transform .25s ease;
        box-shadow: 4px 0 30px rgba(0,0,0,0.25);
      }
      [dir='rtl'] .sidebar { transform: translateX(100%); box-shadow: -4px 0 30px rgba(0,0,0,0.25); }
      .sidebar.mobile-open { transform: translateX(0); }
      .layout.collapsed .sidebar { width: 248px !important; min-width: 248px !important; }
      .layout.collapsed .brand-text,
      .layout.collapsed .nav-label,
      .layout.collapsed .user-meta { opacity: 1; width: auto; }
      .layout.collapsed .nav-link { justify-content: flex-start; padding: 10px 12px; }
      .main { width: 100%; }
      .topbar { padding: 0 16px; }
      .page { padding: 12px; }
    }
  `],
})
export class LayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
  readonly lang = signal<'ar' | 'en'>(
    typeof localStorage !== 'undefined' ? ((localStorage.getItem('sarh.lang') as 'ar' | 'en') || 'ar') : 'ar',
  );

  readonly authUser = computed(() => this.auth.user());

  readonly displayName = computed(() => {
    const u = this.auth.user();
    if (!u) return '—';
    return u.email?.split('@')[0] ?? this.roleLabel(u.role);
  });

  readonly initial = computed(() => {
    const n = this.displayName();
    return n.charAt(0).toUpperCase();
  });

  readonly groupedNav = computed(() => {
    const role = this.auth.user()?.role;
    if (!role) return [];
    const items = NAV.filter((n) => n.roles.includes(role));
    const main = items.filter((n) => n.group !== 'admin');
    const admin = items.filter((n) => n.group === 'admin');
    return [
      { key: 'main' as const, label: '', items: main },
      { key: 'admin' as const, label: 'الإدارة', items: admin },
    ];
  });

  readonly currentNavLabel = computed(() => {
    const url = this.router.url.split('?')[0];
    const match = NAV.find((n) => url === n.path || url.startsWith(n.path + '/'));
    return match?.ar ?? 'صَرح';
  });

  toggleCollapsed(): void { this.collapsed.update((v) => !v); }
  openMobile(): void { this.mobileOpen.set(true); }
  closeMobile(): void { this.mobileOpen.set(false); }

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

  logout(): void {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }

  roleLabel(role: SarhRole | undefined): string {
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

  iconSvg(name: NavIcon): string {
    const ico: Record<NavIcon, string> = {
      'dashboard':  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
      'citizens':   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'properties': '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
      'digital-id': '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/><line x1="14" y1="14" x2="17" y2="14"/></svg>',
      'queue':      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>',
      'approvals':  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'issue':      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 2 14 8 20 8"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
      'audit':      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
      'reports':    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      'users':      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'profile':    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      'verify':     '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>',
      'nft':        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    };
    return ico[name];
  }
}
