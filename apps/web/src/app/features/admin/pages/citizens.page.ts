import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Citizen, CitizensService } from '@core/citizens.service';
import { REGIONS } from '../../../shared/status-pills';

@Component({
  selector: 'app-admin-citizens',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">المواطنون</h1>
          <p class="sub">سجل المواطنين المسجلين في النظام.</p>
        </div>
        <div class="kpi">
          <span class="kpi-num">{{ items().length }}</span>
          <span class="kpi-lbl">إجمالي</span>
        </div>
      </header>

      <div class="filters">
        <input class="search" type="search" [(ngModel)]="search"
               placeholder="ابحث بالاسم أو البريد أو الرقم الوطني…" />
        <select class="region" [(ngModel)]="regionFilter" (ngModelChange)="reload()">
          <option [ngValue]="null">كل المناطق</option>
          @for (r of regionEntries; track r[0]) {
            <option [ngValue]="r[0]">{{ r[1] }}</option>
          }
        </select>
      </div>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <p>لا توجد نتائج.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الجنس</th>
                <th>تاريخ الميلاد</th>
                <th>المنطقة</th>
                <th>الهاتف</th>
                <th>البريد</th>
                <th>الرقم الوطني السابق</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtered(); track c.id) {
                <tr>
                  <td>
                    <div class="name-cell">
                      <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                      <div>
                        <div class="name">{{ fullName(c) }}</div>
                        <div class="id mono">{{ c.id.slice(0, 8) }}…</div>
                      </div>
                    </div>
                  </td>
                  <td>{{ c.gender === 'male' ? 'ذكر' : 'أنثى' }}</td>
                  <td dir="ltr" class="mono small">{{ dateLabel(c.birth_date) }}</td>
                  <td>{{ regionLabel(c.region_id) }}</td>
                  <td dir="ltr" class="mono small">{{ c.phone ?? '—' }}</td>
                  <td dir="ltr" class="mono small">{{ c.email ?? '—' }}</td>
                  <td dir="ltr" class="mono small">{{ c.legacy_national_no ?? '—' }}</td>
                  <td>
                    <span class="status" [class.on]="c.is_active" [class.off]="!c.is_active">
                      {{ c.is_active ? 'نشط' : 'موقوف' }}
                    </span>
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
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 10px 18px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; min-width: 90px; }
    .kpi-num { font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1; }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .search { flex: 1; min-width: 240px; padding: 10px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px; font-family: inherit; }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }
    .region { padding: 10px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px; font-family: inherit; min-width: 160px; }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); }
    .tbl tbody td { padding: 12px 14px; border-bottom: 1px solid var(--rule); vertical-align: middle; color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.03); }

    .name-cell { display: flex; align-items: center; gap: 10px; }
    .avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--good)); color: var(--primary); display: grid; place-items: center; font-weight: 700; flex-shrink: 0; }
    .name { font-weight: 600; }
    .id { font-size: 10.5px; color: var(--muted); }
    .small { font-size: 12px; }

    .status { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .status.on { background: rgba(8, 145, 178, 0.12); color: var(--good); }
    .status.off { background: rgba(220, 38, 38, 0.10); color: var(--warn); }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.4; margin-bottom: 10px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminCitizensPage implements OnInit {
  private readonly api = inject(CitizensService);

  readonly items = signal<Citizen[]>([]);
  readonly loading = signal(false);
  search = '';
  regionFilter: number | null = null;

  readonly regionEntries = Object.entries(REGIONS)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => a[0] - b[0]);

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const items = this.items();
    if (!q) return items;
    return items.filter((c) =>
      this.fullName(c).toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.legacy_national_no ?? '').toLowerCase().includes(q),
    );
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.list({ region_id: this.regionFilter ?? undefined, limit: 100 });
      this.items.set(res.items);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  fullName(c: Citizen): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar].filter(Boolean).join(' ');
  }
  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGIONS[id] ?? `منطقة ${id}`;
  }
  dateLabel(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB');
  }
}
