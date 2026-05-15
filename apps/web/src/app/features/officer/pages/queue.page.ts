import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PropertiesService } from '@core/properties.service';
import type { Property, PropertyStatus, PropertyType } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

const QUEUE_STATUSES: PropertyStatus[] = ['pending', 'under_review', 'needs_clarification'];

@Component({
  selector: 'app-officer-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">طابور المراجعة</h1>
          <p class="sub">طلبات تسجيل العقارات المنتظرة لقرار من الموظف.</p>
        </div>
        <div class="kpi-row">
          <div class="kpi">
            <span class="kpi-num accent">{{ filtered().length }}</span>
            <span class="kpi-lbl">في القائمة</span>
          </div>
          <div class="kpi">
            <span class="kpi-num good">{{ countByStatus('pending') }}</span>
            <span class="kpi-lbl">بانتظار المراجعة</span>
          </div>
          <div class="kpi">
            <span class="kpi-num warn">{{ countByStatus('needs_clarification') }}</span>
            <span class="kpi-lbl">يحتاج توضيح</span>
          </div>
        </div>
      </header>

      <div class="filters">
        <div class="chips">
          <button class="chip" [class.on]="status() === ''" (click)="setStatus('')">الكل</button>
          @for (s of queueStatuses; track s) {
            <button class="chip" [class.on]="status() === s"
                    [style.--c]="statusColor(s)"
                    (click)="setStatus(s)">{{ statusLabel(s) }}</button>
          }
        </div>
        <select class="type" [(ngModel)]="typeFilter" (ngModelChange)="onTypeChange()">
          <option value="">كل الأنواع</option>
          <option value="residential">سكني</option>
          <option value="agricultural">زراعي</option>
          <option value="commercial">تجاري</option>
          <option value="governmental">حكومي</option>
          <option value="industrial">صناعي</option>
          <option value="mixed">مختلط</option>
        </select>
      </div>

      @if (loading()) {
        <div class="skel-table">
          @for (i of [1,2,3,4]; track i) {
            <div class="skel-row">
              <div class="skeleton" style="width: 120px; height: 14px;"></div>
              <div class="skeleton" style="width: 60px; height: 14px;"></div>
              <div class="skeleton" style="width: 80px; height: 14px;"></div>
              <div class="skeleton" style="width: 60px; height: 14px;"></div>
              <div class="skeleton" style="width: 70px; height: 22px; border-radius: 99px;"></div>
            </div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty slide-up">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>
          <h3>لا طلبات بهذه التصفية</h3>
          <p>يمكنك تغيير الفلتر أو الانتظار حتى تصل طلبات جديدة.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>الرمز / القطعة</th>
                <th>النوع</th>
                <th>المنطقة</th>
                <th>المساحة</th>
                <th>تاريخ الإرسال</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (p of filtered(); track p.id) {
                <tr (click)="open(p.id)">
                  <td>
                    <div class="code-cell">
                      <span class="mono code">{{ p.property_code ?? p.parcel_number ?? '—' }}</span>
                      @if (p.parcel_number && p.property_code) {
                        <span class="mono small">قطعة {{ p.parcel_number }}</span>
                      }
                    </div>
                  </td>
                  <td>{{ typeLabel(p.property_type) }}</td>
                  <td>{{ regionLabel(p.region_id) }}</td>
                  <td dir="ltr" class="mono small">{{ areaLabel(p.area_sqm) }}</td>
                  <td dir="ltr" class="mono small">{{ dateLabel(p.submitted_at) }}</td>
                  <td>
                    <span class="badge" [style.background]="status_(p.status).color">
                      {{ status_(p.status).ar }}
                    </span>
                  </td>
                  <td>
                    <button class="open-btn" (click)="open(p.id); $event.stopPropagation()">فتح ←</button>
                  </td>
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

    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .kpi-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 10px 18px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; min-width: 90px; transition: all .15s; }
    .kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(15,23,42,0.06); }
    .kpi-num { font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1; }
    .kpi-num.accent { color: var(--accent); }
    .kpi-num.good { color: var(--good); }
    .kpi-num.warn { color: #f59e0b; }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .filters { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip {
      padding: 6px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 99px;
      font-size: 12px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: inherit;
      transition: all .12s;
    }
    .chip:hover { border-color: var(--c, var(--ink)); color: var(--c, var(--ink)); }
    .chip.on { background: var(--c, var(--primary)); color: #fff; border-color: var(--c, var(--primary)); }
    .type { padding: 8px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 8px; font-size: 12.5px; font-family: inherit; }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); }
    .tbl tbody td { padding: 12px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr { cursor: pointer; transition: background .12s; }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.05); }

    .code-cell { display: flex; flex-direction: column; gap: 2px; }
    .code { font-weight: 700; color: var(--ink); font-size: 12.5px; }
    .small { font-size: 11px; color: var(--muted); }

    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }
    .open-btn {
      padding: 5px 12px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 6px;
      font-size: 11.5px; font-weight: 600; color: var(--ink);
      cursor: pointer; font-family: inherit;
      transition: all .12s;
    }
    .open-btn:hover { background: var(--primary); color: var(--accent); border-color: var(--primary); }

    .skel-table { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 8px 0; }
    .skel-row { display: flex; align-items: center; gap: 18px; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
    .skel-row:last-child { border-bottom: 0; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.3; margin-bottom: 14px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }
  `],
})
export class OfficerQueuePage implements OnInit {
  private readonly api = inject(PropertiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly queueStatuses = QUEUE_STATUSES;
  readonly status = signal<PropertyStatus | ''>('pending');
  readonly items = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  typeFilter: PropertyType | '' = '';

  readonly filtered = computed(() => {
    const t = this.typeFilter;
    if (!t) return this.items();
    return this.items().filter((p) => p.property_type === t);
  });

  async ngOnInit(): Promise<void> {
    const qStatus = this.route.snapshot.queryParamMap.get('status') as PropertyStatus | null;
    if (qStatus) this.status.set(qStatus);
    await this.reload();
  }

  setStatus(s: PropertyStatus | ''): void {
    this.status.set(s);
    void this.reload();
  }

  onTypeChange(): void { /* local filter via computed */ }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.list({ status: this.status() || undefined, limit: 100 });
      this.items.set(res.items);
    } catch (e) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر تحميل الطابور.');
    } finally {
      this.loading.set(false);
    }
  }

  open(id: string): void {
    void this.router.navigate(['/app/review', id]);
  }

  countByStatus(s: string): number {
    return this.items().filter(p => p.status === s).length;
  }

  status_(s: string) { return PROPERTY_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  statusLabel(s: string): string { return PROPERTY_STATUS[s]?.ar ?? s; }
  statusColor(s: string): string { return PROPERTY_STATUS[s]?.color ?? '#94a3b8'; }
  typeLabel(t: string)  { return PROPERTY_TYPE[t] ?? t; }
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
    return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
}
