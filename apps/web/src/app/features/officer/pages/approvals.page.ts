import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PropertiesService } from '@core/properties.service';
import type { Property, PropertyStatus } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

type Tab = 'approved' | 'rejected' | 'all';

@Component({
  selector: 'app-officer-approvals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">الاعتمادات</h1>
          <p class="sub">القرارات الصادرة على طلبات تسجيل العقارات.</p>
        </div>
        <div class="kpis">
          <div class="kpi">
            <span class="kpi-num good">{{ countApproved() }}</span>
            <span class="kpi-lbl">معتمد</span>
          </div>
          <div class="kpi">
            <span class="kpi-num warn">{{ countRejected() }}</span>
            <span class="kpi-lbl">مرفوض</span>
          </div>
        </div>
      </header>

      <div class="tabs">
        <button class="tab" [class.on]="tab() === 'approved'" (click)="tab.set('approved')">معتمد</button>
        <button class="tab" [class.on]="tab() === 'rejected'" (click)="tab.set('rejected')">مرفوض</button>
        <button class="tab" [class.on]="tab() === 'all'" (click)="tab.set('all')">الكل</button>
      </div>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="20 6 9 17 4 12"/></svg>
          <p>لا توجد قرارات في هذه الفئة.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>الرمز</th>
                <th>النوع</th>
                <th>المنطقة</th>
                <th>المساحة</th>
                <th>تاريخ القرار</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (p of filtered(); track p.id) {
                <tr>
                  <td><span class="mono code">{{ p.property_code ?? '—' }}</span></td>
                  <td>{{ typeLabel(p.property_type) }}</td>
                  <td>{{ regionLabel(p.region_id) }}</td>
                  <td dir="ltr" class="mono small">{{ areaLabel(p.area_sqm) }}</td>
                  <td dir="ltr" class="mono small">{{ dateLabel(p.reviewed_at) }}</td>
                  <td>
                    <span class="badge" [style.background]="status(p.status).color">
                      {{ status(p.status).ar }}
                    </span>
                  </td>
                  <td><a [routerLink]="['/app/review', p.id]" class="link">فتح ←</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (error()) {
        <div class="banner err">
          <span class="banner-mark">!</span>
          {{ error() }}
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 16px; flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .kpis { display: flex; gap: 10px; }
    .kpi {
      display: flex; flex-direction: column; align-items: center;
      padding: 9px 18px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 12px;
      min-width: 80px;
      transition: all .15s;
    }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(15,23,42,0.06); }
    .kpi-num { font-size: 22px; font-weight: 800; line-height: 1; }
    .kpi-num.good { color: var(--good); }
    .kpi-num.warn { color: var(--warn); }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .tabs {
      display: flex; gap: 4px;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--rule);
    }
    .tab {
      padding: 9px 16px;
      background: transparent; border: 0;
      border-bottom: 2px solid transparent;
      margin-bottom: -7px;
      color: var(--muted);
      font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit;
      transition: all .12s;
    }
    .tab:hover { color: var(--ink); }
    .tab.on { color: var(--primary); border-bottom-color: var(--accent); }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th {
      text-align: start; padding: 12px 14px;
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;
      color: var(--muted); text-transform: uppercase;
      background: rgba(249, 115, 22, 0.04);
      border-bottom: 1px solid var(--rule);
    }
    .tbl tbody td { padding: 12px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.03); }
    .code { font-weight: 700; color: var(--ink); font-size: 12.5px; }
    .small { font-size: 12px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }
    .link { color: var(--primary); text-decoration: none; font-weight: 600; font-size: 12.5px; }
    .link:hover { color: var(--accent); }

    .empty {
      padding: 60px 24px; text-align: center; color: var(--muted);
      background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px;
    }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 11px; font-weight: 700; }
  `],
})
export class OfficerApprovalsPage implements OnInit {
  private readonly api = inject(PropertiesService);

  readonly tab = signal<Tab>('approved');
  readonly approved = signal<Property[]>([]);
  readonly rejected = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly countApproved = computed(() => this.approved().length);
  readonly countRejected = computed(() => this.rejected().length);

  readonly filtered = computed(() => {
    switch (this.tab()) {
      case 'approved': return this.approved();
      case 'rejected': return this.rejected();
      case 'all': return [...this.approved(), ...this.rejected()];
    }
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const [a, r] = await Promise.all([
        this.api.list({ status: 'approved' as PropertyStatus, limit: 50 }),
        this.api.list({ status: 'rejected' as PropertyStatus, limit: 50 }),
      ]);
      this.approved.set(a.items);
      this.rejected.set(r.items);
    } catch {
      this.error.set('تعذّر تحميل الاعتمادات.');
    } finally {
      this.loading.set(false);
    }
  }

  status(s: string) { return PROPERTY_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  typeLabel(t: string) { return PROPERTY_TYPE[t] ?? t; }
  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGIONS[id] ?? `منطقة ${id}`;
  }
  areaLabel(a: number | null | undefined): string {
    if (a == null) return '—';
    return `${Number(a).toLocaleString('ar-LY')} م²`;
  }
  dateLabel(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
