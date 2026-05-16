import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PropertiesService } from '@core/properties.service';
import { API_BASE } from '@core/api-config';
import type { Property } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

interface DayCount { date: string; count: number; }
interface TrendsResponse { days: number; submitted: DayCount[]; approved: DayCount[]; cards_issued: DayCount[]; }
interface SummaryResponse {
  total_properties: number; approved_properties: number; pending_properties: number;
  rejected_properties: number; total_citizens: number; active_cards: number; active_officers: number;
}

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">التقارير</h1>
          <p class="sub">مؤشرات أداء النظام، حية من قاعدة البيانات.</p>
        </div>
        <div class="head-actions">
          <button class="btn ghost" (click)="exportCsv()" [disabled]="loading()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            تصدير CSV
          </button>
          <button class="btn ghost" (click)="reload()" [disabled]="loading()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/></svg>
            تحديث
          </button>
        </div>
      </header>

      <!-- KPI tiles -->
      <div class="kpi-grid">
        <div class="kpi" data-accent="primary">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></div>
          <div class="kpi-num">{{ summary()?.total_properties ?? '—' }}</div>
          <div class="kpi-lbl">عقارات مسجّلة</div>
        </div>
        <div class="kpi" data-accent="good">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div class="kpi-num">{{ summary()?.approved_properties ?? '—' }}</div>
          <div class="kpi-lbl">سندات معتمدة</div>
        </div>
        <div class="kpi" data-accent="amber">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div class="kpi-num">{{ summary()?.pending_properties ?? '—' }}</div>
          <div class="kpi-lbl">قيد المراجعة</div>
        </div>
        <div class="kpi" data-accent="warn">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <div class="kpi-num">{{ summary()?.rejected_properties ?? '—' }}</div>
          <div class="kpi-lbl">طلبات مرفوضة</div>
        </div>
        <div class="kpi" data-accent="sky">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <div class="kpi-num">{{ summary()?.total_citizens ?? '—' }}</div>
          <div class="kpi-lbl">مواطنون</div>
        </div>
        <div class="kpi" data-accent="accent">
          <div class="kpi-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/></svg></div>
          <div class="kpi-num">{{ summary()?.active_cards ?? '—' }}</div>
          <div class="kpi-lbl">بطاقات NFC نشطة</div>
        </div>
      </div>

      <!-- Trend chart -->
      <div class="card wide trend-card">
        <div class="trend-head">
          <h2>النشاط خلال آخر 30 يوم</h2>
          <div class="legend">
            <span class="legend-item"><span class="legend-dot" style="background:#0891B2"></span>طلبات مقدّمة</span>
            <span class="legend-item"><span class="legend-dot" style="background:#F97316"></span>سندات معتمدة</span>
            <span class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span>بطاقات مصدرة</span>
          </div>
        </div>
        @if (trendDays().length === 0) {
          <p class="empty-line">لا بيانات متاحة لهذه الفترة.</p>
        } @else {
          <div class="chart">
            @for (day of trendDays(); track day.date) {
              <div class="chart-col" [title]="day.date">
                <div class="col-bars">
                  @if (day.submitted > 0) {
                    <div class="col-bar submitted" [style.height.px]="barH(day.submitted)"></div>
                  }
                  @if (day.approved > 0) {
                    <div class="col-bar approved" [style.height.px]="barH(day.approved)"></div>
                  }
                  @if (day.cards > 0) {
                    <div class="col-bar cards" [style.height.px]="barH(day.cards)"></div>
                  }
                  @if (day.submitted === 0 && day.approved === 0 && day.cards === 0) {
                    <div class="col-bar empty"></div>
                  }
                </div>
                @if (showLabel(day.idx)) {
                  <span class="col-date">{{ shortDate(day.date) }}</span>
                }
              </div>
            }
          </div>
        }
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
    .page { width: 100%; }

    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .head-actions { display: flex; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; }
    .btn.ghost { background: var(--paper); border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

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

    /* ── Trend chart ── */
    .trend-card { margin-bottom: 14px; }
    .trend-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; border-bottom: 1px solid var(--rule); padding-bottom: 10px; }
    .trend-head h2 { font-size: 14px; margin: 0; color: var(--ink); }
    .legend { display: flex; gap: 14px; font-size: 11px; color: var(--muted); }
    .legend-item { display: inline-flex; align-items: center; gap: 5px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 3px; }

    .chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding-top: 10px; }
    .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
    .col-bars { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; flex: 1; gap: 1px; width: 100%; }
    .col-bar { width: 100%; max-width: 16px; border-radius: 3px 3px 0 0; min-height: 2px; transition: height .3s ease; }
    .col-bar.submitted { background: #0891B2; }
    .col-bar.approved { background: #F97316; }
    .col-bar.cards { background: #3b82f6; }
    .col-bar.empty { background: rgba(15,23,42,0.04); height: 2px !important; }
    .col-date { font-size: 9px; color: var(--muted); margin-top: 4px; white-space: nowrap; }

    .section-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .section-grid .wide, .wide { grid-column: 1 / -1; }
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
  private readonly http = inject(HttpClient);
  private readonly props = inject(PropertiesService);

  readonly loading = signal(false);
  readonly summary = signal<SummaryResponse | null>(null);
  readonly properties = signal<Property[]>([]);
  readonly trends = signal<TrendsResponse | null>(null);

  readonly typeBreakdown   = computed(() => this.bucket(this.properties().map((p) => p.property_type)));
  readonly statusBreakdown = computed(() => this.bucket(this.properties().map((p) => p.status)));
  readonly regionBreakdown = computed(() =>
    this.bucket(this.properties().map((p) => p.region_id ?? 0).filter((r) => r > 0).map(String)),
  );

  readonly trendDays = computed(() => {
    const t = this.trends();
    if (!t) return [];
    const days = t.days;
    const result: { date: string; submitted: number; approved: number; cards: number; idx: number }[] = [];
    const subMap = new Map(t.submitted.map(d => [d.date, d.count]));
    const appMap = new Map(t.approved.map(d => [d.date, d.count]));
    const cardMap = new Map(t.cards_issued.map(d => [d.date, d.count]));
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({
        date: key,
        submitted: subMap.get(key) ?? 0,
        approved: appMap.get(key) ?? 0,
        cards: cardMap.get(key) ?? 0,
        idx: days - 1 - i,
      });
    }
    return result;
  });

  private maxTrend = computed(() => {
    const days = this.trendDays();
    let max = 0;
    for (const d of days) max = Math.max(max, d.submitted, d.approved, d.cards);
    return max || 1;
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [sum, p, t] = await Promise.all([
        firstValueFrom(this.http.get<SummaryResponse>(`${API_BASE}/reports/summary`)),
        this.props.list({ limit: 200 }),
        firstValueFrom(this.http.get<TrendsResponse>(`${API_BASE}/reports/trends?days=30`)),
      ]);
      this.summary.set(sum);
      this.properties.set(p.items);
      this.trends.set(t);
    } catch {
      // keep previous values
    } finally {
      this.loading.set(false);
    }
  }

  barH(count: number): number {
    return Math.max(4, Math.round((count / this.maxTrend()) * 90));
  }

  showLabel(idx: number): boolean {
    const total = this.trendDays().length;
    if (total <= 10) return true;
    return idx % Math.ceil(total / 7) === 0;
  }

  shortDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  exportCsv(): void {
    const s = this.summary();
    const props = this.properties();
    if (!s) return;

    const lines: string[] = [];
    lines.push('metric,value');
    lines.push(`total_properties,${s.total_properties}`);
    lines.push(`approved,${s.approved_properties}`);
    lines.push(`pending,${s.pending_properties}`);
    lines.push(`rejected,${s.rejected_properties}`);
    lines.push(`citizens,${s.total_citizens}`);
    lines.push(`active_cards,${s.active_cards}`);
    lines.push(`officers,${s.active_officers}`);
    lines.push('');
    lines.push('property_code,type,status,region_id,area_sqm,submitted_at');
    for (const p of props) {
      lines.push(`${p.property_code},${p.property_type},${p.status},${p.region_id ?? ''},${p.area_sqm ?? ''},${p.submitted_at ?? ''}`);
    }

    const csv = lines.join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sarh_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
