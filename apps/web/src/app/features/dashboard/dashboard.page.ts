import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '@core/auth.service';
import { SarhRole } from '@core/auth.types';

interface Tile {
  ar: string;
  desc: string;
  path: string;
  icon: string;
  accent: 'primary' | 'accent' | 'good' | 'warn' | 'sky';
  roles: readonly SarhRole[];
}

const ALL: readonly SarhRole[] = [
  'super_admin', 'auditor', 'registry_officer', 'reviewer', 'id_issuer', 'citizen',
];

const TILES: Tile[] = [
  // Citizen
  {
    ar: 'عقاراتي', desc: 'تصفّح عقاراتك المسجّلة وتقدّم بطلب جديد.',
    path: '/app/my/properties', icon: 'properties', accent: 'good', roles: ['citizen'],
  },
  {
    ar: 'هويتي الرقمية', desc: 'بطاقة NFC والشهادات الرقمية الخاصة بك.',
    path: '/app/my/digital-id', icon: 'id', accent: 'accent', roles: ['citizen'],
  },
  {
    ar: 'تسجيل عقار', desc: 'ابدأ ملف تسجيل ملكية جديد ورفع المستندات.',
    path: '/app/my/properties/new', icon: 'plus', accent: 'sky', roles: ['citizen'],
  },

  // Officer / reviewer
  {
    ar: 'قائمة المراجعة', desc: 'الطلبات المنتظرة للمراجعة.',
    path: '/app/queue', icon: 'queue', accent: 'primary',
    roles: ['registry_officer', 'reviewer', 'super_admin'],
  },
  {
    ar: 'الاعتمادات', desc: 'القرارات الموافق عليها أو المرفوضة.',
    path: '/app/approvals', icon: 'check', accent: 'good',
    roles: ['registry_officer', 'reviewer', 'super_admin'],
  },

  // ID issuer
  {
    ar: 'إصدار جديد', desc: 'بدء معالج إصدار بطاقة هوية رقمية.',
    path: '/app/issue/produce', icon: 'id', accent: 'accent',
    roles: ['id_issuer', 'super_admin'],
  },
  {
    ar: 'البطاقات المُصدرة', desc: 'استعراض وإدارة كل بطاقات الهوية الرقمية.',
    path: '/app/digital-ids', icon: 'id', accent: 'sky',
    roles: ['id_issuer'],
  },
  {
    ar: 'إعادة إصدار', desc: 'استبدال بطاقة هوية مفقودة أو منتهية.',
    path: '/app/issue/reissue', icon: 'refresh', accent: 'warn',
    roles: ['id_issuer', 'super_admin'],
  },

  // Admin / auditor
  {
    ar: 'العقارات', desc: 'الخريطة الكاملة لكل العقارات في النظام.',
    path: '/app/properties', icon: 'map', accent: 'good', roles: ['super_admin', 'auditor'],
  },
  {
    ar: 'المواطنون', desc: 'سجل المواطنين والوضع الحالي لبطاقاتهم.',
    path: '/app/citizens', icon: 'citizens', accent: 'sky', roles: ['super_admin', 'auditor'],
  },
  {
    ar: 'الهويات الرقمية', desc: 'كل بطاقات NFC المُصدرة وحالاتها.',
    path: '/app/digital-ids', icon: 'id', accent: 'accent', roles: ['super_admin', 'auditor'],
  },
  {
    ar: 'المستخدمون', desc: 'إدارة الموظفين والصلاحيات.',
    path: '/app/users', icon: 'users', accent: 'primary', roles: ['super_admin'],
  },
  {
    ar: 'سجل التدقيق', desc: 'سجل غير قابل للتعديل لكل العمليات.',
    path: '/app/audit', icon: 'audit', accent: 'warn', roles: ['super_admin', 'auditor'],
  },
  {
    ar: 'التقارير', desc: 'إحصائيات ومؤشرات الأداء.',
    path: '/app/reports', icon: 'chart', accent: 'sky', roles: ['super_admin', 'auditor'],
  },

  // For everyone
  {
    ar: 'التحقق العام', desc: 'تحقّق من سند بـ QR أو رقم سند.',
    path: '/verify', icon: 'verify', accent: 'good', roles: ALL,
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="dash">
      <header class="hero">
        <div>
          <div class="hello mono">{{ greetingPrefix() }}</div>
          <h1 class="display">{{ greeting() }}</h1>
          <p class="lede">{{ subtitle() }}</p>
        </div>
        <div class="role-chip">
          <span class="dot" [style.background]="roleAccent()"></span>
          {{ roleLabel() }}
        </div>
      </header>

      <div class="tiles">
        @for (t of visibleTiles(); track t.path) {
          <a [routerLink]="t.path" class="tile" [attr.data-accent]="t.accent">
            <div class="tile-icon" [innerHTML]="iconSvg(t.icon)"></div>
            <div class="tile-text">
              <h3>{{ t.ar }}</h3>
              <p>{{ t.desc }}</p>
            </div>
            <div class="tile-arrow" aria-hidden="true">←</div>
          </a>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .dash { max-width: 1280px; margin: 0 auto; }

    .hero {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 24px; flex-wrap: wrap;
      padding: 28px 28px 24px;
      background: linear-gradient(135deg, #0F172A 0%, #1e293b 60%, #243a31 100%);
      color: #fff;
      border-radius: 16px;
      margin-bottom: 28px;
      box-shadow: 0 6px 30px rgba(15, 23, 42, 0.18);
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: -50% -20% auto auto;
      width: 60%; height: 200%;
      background: radial-gradient(ellipse, rgba(249, 115, 22, 0.18) 0%, transparent 65%);
      pointer-events: none;
    }
    .hero > div, .hero > .role-chip { position: relative; z-index: 1; }

    .hello { font-size: 11px; letter-spacing: 0.18em; color: var(--accent); margin-bottom: 8px; }
    .hero h1 { font-size: 28px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.5px; }
    .hero .lede { font-size: 14px; color: rgba(255,255,255,0.72); margin: 0; max-width: 520px; line-height: 1.6; }

    .role-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(249, 115, 22, 0.25);
      border-radius: 99px;
      color: #fff; font-size: 13px; font-weight: 600;
    }
    .role-chip .dot { width: 8px; height: 8px; border-radius: 50%; }

    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .tile {
      display: flex; align-items: center; gap: 16px;
      padding: 20px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      text-decoration: none;
      color: inherit;
      transition: all .2s ease;
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
    }
    .tile:hover {
      transform: translateY(-3px);
      border-color: transparent;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
    }

    .tile-icon {
      width: 48px; height: 48px;
      display: grid; place-items: center;
      border-radius: 12px;
      flex-shrink: 0;
    }
    .tile[data-accent='primary'] .tile-icon { background: rgba(15, 23, 42, 0.06); color: var(--primary); }
    .tile[data-accent='accent']  .tile-icon { background: rgba(249, 115, 22, 0.14); color: #C2410C; }
    .tile[data-accent='good']    .tile-icon { background: rgba(8, 145, 178, 0.12);  color: var(--good); }
    .tile[data-accent='warn']    .tile-icon { background: rgba(220, 38, 38, 0.10);   color: var(--warn); }
    .tile[data-accent='sky']     .tile-icon { background: rgba(59, 130, 246, 0.10); color: #2563eb; }

    .tile:hover[data-accent='primary'] { border-color: var(--primary); }
    .tile:hover[data-accent='accent']  { border-color: var(--accent); }
    .tile:hover[data-accent='good']    { border-color: var(--good); }
    .tile:hover[data-accent='warn']    { border-color: var(--warn); }
    .tile:hover[data-accent='sky']     { border-color: #3b82f6; }

    .tile-text { flex: 1; min-width: 0; }
    .tile h3 { font-size: 15px; font-weight: 700; margin: 0 0 4px; color: var(--ink); }
    .tile p  { font-size: 12.5px; color: var(--muted); margin: 0; line-height: 1.55; }

    .tile-arrow {
      font-size: 18px; color: var(--muted);
      transition: transform .2s, color .2s;
      flex-shrink: 0;
    }
    .tile:hover .tile-arrow { color: var(--primary); transform: translateX(-4px); }
    [dir='ltr'] .tile-arrow { transform: scaleX(-1); }
    [dir='ltr'] .tile:hover .tile-arrow { transform: scaleX(-1) translateX(-4px); }

    @media (max-width: 640px) {
      .hero { padding: 22px; }
      .hero h1 { font-size: 22px; }
    }
  `],
})
export class DashboardPage {
  private readonly auth = inject(AuthService);

  readonly visibleTiles = computed(() => {
    const role = this.auth.user()?.role;
    if (!role) return [];
    return TILES.filter((t) => t.roles.includes(role));
  });

  readonly greetingPrefix = computed(() => {
    const u = this.auth.user();
    if (!u?.email) return 'مرحباً';
    return 'WELCOME · مرحباً';
  });

  readonly greeting = computed(() => {
    const u = this.auth.user();
    const name = u?.email?.split('@')[0] ?? 'ضيف';
    return `أهلاً، ${name}`;
  });

  readonly subtitle = computed(() => {
    switch (this.auth.user()?.role) {
      case 'citizen':
        return 'هذه لوحة المواطن — تابع عقاراتك وهويتك الرقمية وقدّم طلبات تسجيل جديدة.';
      case 'registry_officer':
      case 'reviewer':
        return 'لوحة موظف التسجيل — راجع الطلبات الواردة واتخذ قرارات الاعتماد.';
      case 'id_issuer':
        return 'محطة إصدار الهويات — أصدر بطاقات NFC جديدة أو استبدل البطاقات المنتهية.';
      case 'super_admin':
      case 'auditor':
        return 'لوحة الإدارة — إشراف على المواطنين والعقارات والهويات وسجل التدقيق.';
      default:
        return 'منصة صَرح للسجل العقاري والهوية الرقمية الليبية.';
    }
  });

  readonly roleLabel = computed(() => {
    switch (this.auth.user()?.role) {
      case 'super_admin':      return 'مسؤول عام';
      case 'auditor':          return 'مدقق';
      case 'registry_officer': return 'موظف تسجيل';
      case 'reviewer':         return 'مراجع';
      case 'id_issuer':        return 'مصدر هويات';
      case 'citizen':          return 'مواطن';
      default:                 return '—';
    }
  });

  readonly roleAccent = computed(() => {
    switch (this.auth.user()?.role) {
      case 'super_admin':      return 'var(--accent)';
      case 'auditor':          return 'var(--warn)';
      case 'registry_officer': return 'var(--good)';
      case 'reviewer':         return 'var(--good)';
      case 'id_issuer':        return 'var(--accent)';
      case 'citizen':          return '#3b82f6';
      default:                 return 'var(--muted)';
    }
  });

  private readonly sanitizer = inject(DomSanitizer);

  iconSvg(name: string): SafeHtml {
    const ico: Record<string, string> = {
      'properties': '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
      'id':         '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/><line x1="14" y1="14" x2="17" y2="14"/></svg>',
      'plus':       '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      'queue':      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>',
      'check':      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      'refresh':    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>',
      'map':        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
      'citizens':   '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      'users':      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      'audit':      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
      'chart':      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      'verify':     '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>',
    };
    return this.sanitizer.bypassSecurityTrustHtml(ico[name] ?? '');
  }
}
