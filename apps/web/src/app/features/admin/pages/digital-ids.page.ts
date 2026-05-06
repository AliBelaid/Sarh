import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DigitalIdCard, DigitalIdCardsService, CardStatus } from '@core/digital-id-cards.service';
import { CARD_STATUS } from '../../../shared/status-pills';

@Component({
  selector: 'app-admin-digital-ids',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">الهويات الرقمية</h1>
          <p class="sub">كل بطاقات NFC المُصدرة وحالاتها.</p>
        </div>
        <div class="head-right">
          <div class="kpis">
            <div class="kpi">
              <span class="kpi-num good">{{ countByStatus()['active'] }}</span>
              <span class="kpi-lbl">نشطة</span>
            </div>
            <div class="kpi">
              <span class="kpi-num warn">{{ countByStatus()['frozen'] }}</span>
              <span class="kpi-lbl">مجمّدة</span>
            </div>
            <div class="kpi">
              <span class="kpi-num bad">{{ countByStatus()['revoked'] }}</span>
              <span class="kpi-lbl">ملغاة</span>
            </div>
          </div>
          <a routerLink="/app/digital-ids/new" class="btn primary">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            إصدار جديد
          </a>
        </div>
      </header>

      <div class="filters">
        <input class="search" type="search" [(ngModel)]="search"
               placeholder="ابحث برقم البطاقة، رقم الهوية، أو NFC UID…" />
        <select class="region" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="">كل الحالات</option>
          <option value="active">نشطة</option>
          <option value="frozen">مجمّدة</option>
          <option value="revoked">ملغاة</option>
          <option value="expired">منتهية</option>
        </select>
      </div>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/></svg>
          <p>لا توجد بطاقات.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>رقم الهوية الرقمية</th>
                <th>رقم البطاقة</th>
                <th>NFC UID</th>
                <th>تاريخ الإصدار</th>
                <th>الانتهاء</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtered(); track c.id) {
                <tr class="row" (click)="open(c.id)">
                  <td dir="ltr"><span class="mono code">{{ c.digital_id_number }}</span></td>
                  <td dir="ltr" class="mono small">{{ c.card_serial }}</td>
                  <td dir="ltr" class="mono small">{{ c.nfc_uid ?? '—' }}</td>
                  <td dir="ltr" class="mono small">{{ shortDate(c.issued_at) }}</td>
                  <td dir="ltr" class="mono small" [class.expiring]="isExpiringSoon(c.expires_at)">{{ shortDate(c.expires_at) }}</td>
                  <td>
                    <span class="badge" [style.background]="status(c.status).color">
                      {{ status(c.status).ar }}
                    </span>
                  </td>
                  <td class="chev" aria-hidden="true">←</td>
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
    .head-right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 14px;
      border-radius: 10px;
      font-size: 12.5px; font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      font-family: inherit;
      border: 1.5px solid transparent;
      transition: all .15s;
    }
    .btn.primary {
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      box-shadow: 0 3px 12px rgba(15,23,42,0.18);
    }
    .btn.primary:hover { transform: translateY(-1px); box-shadow: 0 5px 18px rgba(15,23,42,0.25); }

    .kpis { display: flex; gap: 10px; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 9px 16px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; min-width: 80px; }
    .kpi-num { font-size: 22px; font-weight: 800; line-height: 1; }
    .kpi-num.good { color: var(--good); }
    .kpi-num.warn { color: #f59e0b; }
    .kpi-num.bad  { color: var(--warn); }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
    .search { flex: 1; min-width: 240px; padding: 10px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px; font-family: inherit; }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }
    .region { padding: 10px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px; font-family: inherit; min-width: 140px; }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); }
    .tbl tbody td { padding: 12px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr.row { cursor: pointer; transition: background .12s; }
    .tbl tbody tr.row:hover { background: rgba(249, 115, 22, 0.05); }
    .chev { color: var(--muted); font-size: 16px; width: 24px; }
    [dir='rtl'] .chev { transform: scaleX(1); }
    [dir='ltr'] .chev { transform: scaleX(-1); }

    .code { font-weight: 700; font-size: 12.5px; }
    .small { font-size: 12px; }
    .expiring { color: #f59e0b; font-weight: 600; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.4; margin-bottom: 10px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminDigitalIdsPage implements OnInit {
  private readonly api = inject(DigitalIdCardsService);
  private readonly router = inject(Router);

  readonly items = signal<DigitalIdCard[]>([]);
  readonly loading = signal(false);
  search = '';
  statusFilter: CardStatus | '' = '';

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const items = this.items();
    if (!q) return items;
    return items.filter((c) =>
      c.digital_id_number.toLowerCase().includes(q) ||
      c.card_serial.toLowerCase().includes(q) ||
      (c.nfc_uid ?? '').toLowerCase().includes(q),
    );
  });

  readonly countByStatus = computed(() => {
    const out: Record<string, number> = { active: 0, frozen: 0, revoked: 0, expired: 0, lost: 0 };
    for (const c of this.items()) out[c.status] = (out[c.status] ?? 0) + 1;
    return out;
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.list({ status: this.statusFilter || undefined, limit: 100 });
      this.items.set(res.items);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  open(id: string): void {
    void this.router.navigate(['/app/digital-ids', id]);
  }

  status(s: string) { return CARD_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  shortDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB');
  }
  isExpiringSoon(iso: string): boolean {
    const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
    return days > 0 && days < 90;
  }
}
