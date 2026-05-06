import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PropertiesService } from '@core/properties.service';
import type { Property } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

// Department-manager queue: properties an officer has approved but the
// manager hasn't yet final-approved (i.e., NFT licence not yet minted).
// Filters on status='approved' since 'minted' = already done.
@Component({
  selector: 'app-manager-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">قائمة الاعتمادات النهائية</h1>
          <p class="sub">عقارات اعتمدها موظف السجل وفي انتظار سكّ الرخصة على البلوكتشين.</p>
        </div>
        <div class="kpi">
          <span class="kpi-num">{{ items().length }}</span>
          <span class="kpi-lbl">في الانتظار</span>
        </div>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (items().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="20 6 9 17 4 12"/></svg>
          <p>لا توجد طلبات في انتظار الاعتماد النهائي.</p>
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
                <th>اعتمده موظف السجل</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (p of items(); track p.id) {
                <tr>
                  <td><span class="mono code">{{ p.property_code ?? '—' }}</span></td>
                  <td>{{ typeLabel(p.property_type) }}</td>
                  <td>{{ regionLabel(p.region_id) }}</td>
                  <td dir="ltr" class="mono small">{{ areaLabel(p.area_sqm) }}</td>
                  <td dir="ltr" class="mono small">{{ dateLabel(p.reviewed_at) }}</td>
                  <td><span class="badge" [style.background]="status(p.status).color">{{ status(p.status).ar }}</span></td>
                  <td>
                    <a [routerLink]="['/app/manager/approve', p.id]" class="cta">
                      اعتماد وإصدار NFT
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 600px; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 10px 22px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; }
    .kpi-num { font-size: 26px; font-weight: 800; line-height: 1; color: var(--accent); }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

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
    .code { font-weight: 700; font-size: 12.5px; }
    .small { font-size: 12px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }

    .cta {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 8px;
      background: var(--primary); color: var(--accent);
      text-decoration: none; font-size: 12px; font-weight: 700;
      transition: all .12s;
    }
    .cta:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15,23,42,0.18); }
    [dir='rtl'] .cta svg { transform: scaleX(-1); }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ManagerQueuePage implements OnInit {
  private readonly api = inject(PropertiesService);

  readonly items = signal<Property[]>([]);
  readonly loading = signal(false);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.list({ status: 'approved', limit: 100 });
      this.items.set(res.items);
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
