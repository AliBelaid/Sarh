import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertiesService } from '@core/properties.service';
import { CitizensService } from '@core/citizens.service';
import { DigitalIdCardsService } from '@core/digital-id-cards.service';
import type { Property } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">التقارير</h1>
          <p class="sub">مؤشرات أداء النظام، حية من قاعدة البيانات.</p>
        </div>
        <button class="reload" (click)="reload()" [disabled]="loading()" title="تحديث">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          تحديث
        </button>
      </header>

      <!-- KPI tiles -->
      <div class="kpi-grid">
        <div class="kpi" data-accent="primary">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></div>
          <div class="kpi-num">{{ totalProperties() }}</div>
          <div class="kpi-lbl">عقارات مسجّلة</div>
        </div>
        <div class="kpi" data-accent="good">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div class="kpi-num">{{ approvedCount() }}</div>
          <div class="kpi-lbl">سندات معتمدة</div>
        </div>
        <div class="kpi" data-accent="amber">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div class="kpi-num">{{ pendingCount() }}</div>
          <div class="kpi-lbl">قيد المراجعة</div>
        </div>
        <div class="kpi" data-accent="warn">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <div class="kpi-num">{{ rejectedCount() }}</div>
          <div class="kpi-lbl">طلبات مرفوضة</div>
        </div>
        <div class="kpi" data-accent="sky">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div class="kpi-num">{{ totalCitizens() }}</div>
          <div class="kpi-lbl">مواطنون</div>
        </div>
        <div class="kpi" data-accent="accent">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/></svg></div>
          <div class="kpi-num">{{ activeCards() }}</div>
          <div class="kpi-lbl">بطاقات NFC نشطة</div>
        </div>
      </div>

      <!-- Distributions -->
      <div class="section-grid">
        <div class="card">
          <h2>التوزيع حسب نوع العقار</h2>
          @if (typeBreakdown().length === 0) {
            <p class="empty-line">لا بيانات بعد.</p>
          } @else {
            <ul class="bars">
              @for (row of typeBreakdown(); track row.key) {
                <li>
                  <div class="bar-row">
                    <span class="bar-lbl">{{ typeLabel(row.key) }}</span>
                    <span class="bar-num mono">{{ row.value }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="row.pct" [style.background]="'#0891B2'"></div>
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        <div class="card">
          <h2>التوزيع حسب الحالة</h2>
          @if (statusBreakdown().length === 0) {
            <p class="empty-line">لا بيانات بعد.</p>
          } @else {
            <ul class="bars">
              @for (row of statusBreakdown(); track row.key) {
                <li>
                  <div class="bar-row">
                    <span class="bar-lbl">
                      <span class="dot" [style.background]="statusColor(row.key)"></span>
                      {{ statusLabel(row.key) }}
                    </span>
                    <span class="bar-num mono">{{ row.value }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="row.pct" [style.background]="statusColor(row.key)"></div>
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        <div class="card wide">
          <h2>التوزيع الجغرافي حسب المنطقة</h2>
          @if (regionBreakdown().length === 0) {
            <p class="empty-line">لا بيانات بعد.</p>
          } @else {
            <ul class="bars">
              @for (row of regionBreakdown(); track row.key) {
                <li>
                  <div class="bar-row">
                    <span class="bar-lbl">{{ regionLabel(row.key) }}</span>
                    <span class="bar-num mono">{{ row.value }}</span>
                  </div>
                  <div class="bar-track">
                    <div class="bar-fill" [style.width.%]="row.pct" [style.background]="'#F97316'"></div>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="loading-banner"><div class="spin"></div> جارٍ تحديث المؤشرات…</div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 1280px; margin: 0 auto; }

    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .reload { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--ink); cursor: pointer; font-family: inherit; transition: all .15s; }
    .reload:hover:not(:disabled) { background: #fff; border-color: var(--accent); color: var(--accent); }
    .reload:disabled { opacity: 0.5; cursor: not-allowed; }

    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 24px; }
    .kpi {
      background: var(--paper); border: 1px solid var(--rule); border-radius: 14px;
      padding: 18px; display: flex; flex-direction: column; gap: 10px;
      transition: all .2s;
    }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,0.06); }
    .kpi-ico { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; }
    .kpi[data-accent='primary'] .kpi-ico { background: rgba(15,23,42,0.06); color: var(--primary); }
    .kpi[data-accent='good']    .kpi-ico { background: rgba(8,145,178,0.12); color: var(--good); }
    .kpi[data-accent='amber']   .kpi-ico { background: rgba(245,158,11,0.14); color: #f59e0b; }
    .kpi[data-accent='warn']    .kpi-ico { background: rgba(220,38,38,0.10); color: var(--warn); }
    .kpi[data-accent='sky']     .kpi-ico { background: rgba(59,130,246,0.10); color: #2563eb; }
    .kpi[data-accent='accent']  .kpi-ico { background: rgba(249,115,22,0.14); color: #C2410C; }
    .kpi-num { font-size: 28px; font-weight: 800; color: var(--primary); line-height: 1; letter-spacing: -1px; }
    .kpi-lbl { font-size: 12px; color: var(--muted); }

    .section-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .section-grid .wide { grid-column: 1 / -1; }
    @media (max-width: 880px) { .section-grid { grid-template-columns: 1fr; } .section-grid .wide { grid-column: auto; } }
    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 20px 22px; }
    .card h2 { font-size: 14px; margin: 0 0 16px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); color: var(--ink); }

    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .bar-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
    .bar-lbl { color: var(--ink); display: inline-flex; align-items: center; gap: 8px; }
    .bar-num { color: var(--muted); font-weight: 600; }
    .bar-track { height: 6px; background: rgba(15,23,42,0.06); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width .4s ease; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }

    .empty-line { color: var(--muted); font-size: 13px; margin: 0; padding: 12px 0; }
    .spin { width: 16px; height: 16px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-banner { margin-top: 14px; padding: 10px 14px; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font-size: 12.5px; color: var(--muted); display: inline-flex; align-items: center; gap: 8px; }
  `],
})
export class AdminReportsPage implements OnInit {
  private readonly props = inject(PropertiesService);
  private readonly citizensApi = inject(CitizensService);
  private readonly cards = inject(DigitalIdCardsService);

  readonly loading = signal(false);
  readonly properties = signal<Property[]>([]);
  readonly citizensCount = signal(0);
  readonly activeCards = signal(0);

  readonly totalProperties = computed(() => this.properties().length);
  readonly approvedCount   = computed(() => this.properties().filter((p) => p.status === 'approved').length);
  readonly rejectedCount   = computed(() => this.properties().filter((p) => p.status === 'rejected').length);
  readonly pendingCount    = computed(() => this.properties().filter((p) => p.status === 'pending' || p.status === 'under_review').length);
  readonly totalCitizens   = computed(() => this.citizensCount());

  readonly typeBreakdown   = computed(() => this.bucket(this.properties().map((p) => p.property_type)));
  readonly statusBreakdown = computed(() => this.bucket(this.properties().map((p) => p.status)));
  readonly regionBreakdown = computed(() =>
    this.bucket(this.properties().map((p) => p.region_id ?? 0).filter((r) => r > 0).map(String)),
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [p, c, k] = await Promise.all([
        this.props.list({ limit: 100 }),
        this.citizensApi.list({ limit: 100 }),
        this.cards.list({ status: 'active', limit: 100 }),
      ]);
      this.properties.set(p.items);
      this.citizensCount.set(c.items.length);
      this.activeCards.set(k.items.length);
    } catch {
      // leave previous values
    } finally {
      this.loading.set(false);
    }
  }

  typeLabel(t: string)   { return PROPERTY_TYPE[t] ?? t; }
  statusLabel(s: string) { return PROPERTY_STATUS[s]?.ar ?? s; }
  statusColor(s: string) { return PROPERTY_STATUS[s]?.color ?? '#94a3b8'; }
  regionLabel(id: string): string {
    const n = Number(id);
    return REGIONS[n] ?? `منطقة ${n}`;
  }

  private bucket(values: string[]): { key: string; value: number; pct: number }[] {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    const total = values.length || 1;
    return Array.from(m.entries())
      .map(([key, value]) => ({ key, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }
}
