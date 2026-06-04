import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { DigitalIdCard, DigitalIdCardsService, CardStatus } from '@core/digital-id-cards.service';
import { CARD_STATUS } from '../../../shared/status-pills';

@Component({
  selector: 'app-admin-digital-ids',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
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
        <div class="skel-table">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="skel-row">
              <div class="skeleton" style="width: 160px; height: 14px;"></div>
              <div class="skeleton" style="width: 120px; height: 14px;"></div>
              <div class="skeleton" style="width: 100px; height: 14px;"></div>
              <div class="skeleton" style="width: 80px; height: 14px;"></div>
              <div class="skeleton" style="width: 60px; height: 22px; border-radius: 99px;"></div>
            </div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty slide-up">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/></svg>
          <h3>لا توجد بطاقات</h3>
          <p>لم يتم العثور على بطاقات تطابق البحث الحالي.</p>
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
                <th class="act-h">إجراءات</th>
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
                  <td class="actions" (click)="$event.stopPropagation()">
                    @if (canEdit() && editable(c)) {
                      <button type="button" class="act edit" title="تعديل البيانات" (click)="editCard(c, $event)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    }
                    @if (canDelete()) {
                      <button type="button" class="act del" title="حذف البطاقة" (click)="deleteCard(c, $event)">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    }
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
    .act-h { width: 1%; white-space: nowrap; text-align: center; }
    .actions { white-space: nowrap; text-align: center; }
    .act {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px;
      border: 1px solid var(--rule); background: #fff;
      border-radius: 8px; cursor: pointer; color: var(--muted);
      transition: all .15s; margin-inline-start: 6px;
    }
    .act:first-child { margin-inline-start: 0; }
    .act.edit:hover { color: var(--accent); border-color: var(--accent); background: rgba(249,115,22,0.08); }
    .act.del:hover  { color: var(--warn);   border-color: var(--warn);   background: #fff2f3; }

    .code { font-weight: 700; font-size: 12.5px; }
    .small { font-size: 12px; }
    .expiring { color: #f59e0b; font-weight: 600; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }

    .skel-table { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 8px 0; }
    .skel-row { display: flex; align-items: center; gap: 18px; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
    .skel-row:last-child { border-bottom: 0; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.3; margin-bottom: 14px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminDigitalIdsPage implements OnInit {
  private readonly api = inject(DigitalIdCardsService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  // Edit is open to the issuing roles; delete (hard-revoke + NFC-secret scrub)
  // is super-admin only — same gates the card detail page enforces and the
  // backend rejects anyone else. Both row actions deep-link into the detail
  // page's existing modals (no duplicated destructive logic here).
  readonly canEdit = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'super_admin' || r === 'id_issuer';
  });
  readonly canDelete = computed(() => this.auth.user()?.role === 'super_admin');

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

  // Row actions open the detail page with the matching modal already up, so
  // the edit/delete flows (reason input, confirm, audit) live in one place.
  // stopPropagation keeps the row's own navigate() from also firing.
  editCard(c: DigitalIdCard, ev: Event): void {
    ev.stopPropagation();
    void this.router.navigate(['/app/digital-ids', c.id], { queryParams: { edit: 1 } });
  }

  deleteCard(c: DigitalIdCard, ev: Event): void {
    ev.stopPropagation();
    void this.router.navigate(['/app/digital-ids', c.id], { queryParams: { delete: 1 } });
  }

  // A card is editable only while live; a revoked/expired one is read-only.
  editable(c: DigitalIdCard): boolean {
    return c.status === 'active' || c.status === 'frozen';
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
