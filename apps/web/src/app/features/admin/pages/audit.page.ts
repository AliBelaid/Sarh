import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';

interface AuditRow {
  id: number;
  actor_kind: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_table: string;
  entity_id: string | null;
  ip_address: string | null;
  occurred_at: string;
}

interface AuditDetail extends AuditRow {
  before_state: string | null;
  after_state: string | null;
  user_agent: string | null;
}

interface AuditListResponse {
  items: AuditRow[];
  next_before_id: number | null;
}

interface AuditBreakdown { key: string; count: number; }

interface AuditStats {
  total: number;
  last24h: number;
  last7d: number;
  latest_id: number | null;
  by_action: AuditBreakdown[];
  by_entity: AuditBreakdown[];
}

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء', update: 'تعديل', delete: 'حذف',
  approve: 'اعتماد', reject: 'رفض',
  issue_id: 'إصدار هوية', revoke_id: 'إلغاء هوية',
  login: 'تسجيل دخول', view: 'عرض',
};

const ENTITY_LABELS: Record<string, string> = {
  properties: 'عقار', citizens: 'مواطن', digital_id_cards: 'بطاقة هوية',
  officers: 'موظف', auth_users: 'حساب', property_nfts: 'رخصة NFT',
  notifications: 'إشعار', ownership_history: 'سجل ملكية',
  property_disputes: 'نزاع ملكية', demo_data: 'بيانات تجريبية',
};

const POLL_MS = 8000;

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">سجل التدقيق</h1>
          <p class="sub">سجل غير قابل للتعديل لكل عمليات الكتابة في النظام. محمي بمحفّز <code class="mono">INSTEAD OF UPDATE/DELETE</code>.</p>
        </div>
        <div class="head-actions">
          <button class="btn live" [class.on]="live()" (click)="toggleLive()" [attr.aria-pressed]="live()">
            <span class="dot" [class.pulsing]="live()"></span>
            {{ live() ? 'مباشر' : 'بث مباشر' }}
          </button>
          <button class="btn ghost" (click)="exportCsv()" [disabled]="items().length === 0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button class="btn ghost" (click)="exportXls()" [disabled]="items().length === 0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Excel
          </button>
          <button class="btn ghost" (click)="exportPdf()" [disabled]="items().length === 0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            PDF
          </button>
          <button class="btn ghost" (click)="reload()" [disabled]="loading()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/></svg>
            تحديث
          </button>
        </div>
      </header>

      <div class="stats">
        <div class="stat">
          <span class="stat-val mono">{{ stats()?.total ?? '—' }}</span>
          <span class="stat-lbl">إجمالي السجلات</span>
        </div>
        <div class="stat">
          <span class="stat-val mono">{{ stats()?.last24h ?? '—' }}</span>
          <span class="stat-lbl">آخر ٢٤ ساعة</span>
        </div>
        <div class="stat">
          <span class="stat-val mono">{{ stats()?.last7d ?? '—' }}</span>
          <span class="stat-lbl">آخر ٧ أيام</span>
        </div>
        <div class="stat by">
          <span class="stat-lbl">التوزيع حسب الإجراء</span>
          <div class="chips">
            @for (b of topActions(); track b.key) {
              <span class="chip"><span class="action-pill sm" [attr.data-action]="b.key">{{ actionLabel(b.key) }}</span> {{ b.count }}</span>
            }
            @if (topActions().length === 0) { <span class="muted-sm">—</span> }
          </div>
        </div>
      </div>

      <div class="filters">
        <select [(ngModel)]="actionFilter" (ngModelChange)="reload()">
          <option value="">كل الإجراءات</option>
          @for (o of actionOptions(); track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
        <select [(ngModel)]="entityFilter" (ngModelChange)="reload()">
          <option value="">كل الكيانات</option>
          @for (o of entityOptions(); track o.value) {
            <option [value]="o.value">{{ o.label }}</option>
          }
        </select>
        <select [(ngModel)]="actorFilter" (ngModelChange)="reload()">
          <option value="">كل الفاعلين</option>
          <option value="officer">موظف</option>
          <option value="citizen">مواطن</option>
          <option value="system">النظام</option>
        </select>
        <div class="search">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input [(ngModel)]="searchTerm" (keyup.enter)="reload()" (ngModelChange)="onSearchChange()"
                 placeholder="بحث (كيان، إجراء، IP)…" />
          @if (searchTerm) {
            <button class="clear" (click)="searchTerm = ''; reload()" aria-label="مسح">✕</button>
          }
        </div>
      </div>

      @if (loading() && items().length === 0) {
        <div class="skel-table">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skel-row">
              <div class="skeleton" style="width: 50px; height: 14px;"></div>
              <div class="skeleton" style="width: 70px; height: 22px; border-radius: 99px;"></div>
              <div class="skeleton" style="width: 80px; height: 14px;"></div>
              <div class="skeleton" style="width: 110px; height: 14px;"></div>
              <div class="skeleton" style="width: 90px; height: 14px;"></div>
            </div>
          }
        </div>
      } @else if (items().length === 0) {
        <div class="empty slide-up">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <h3>لا توجد سجلات</h3>
          <p>لم يتم العثور على سجلات تدقيق بهذه التصفية.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>الإجراء</th>
                <th>الكيان</th>
                <th>الفاعل</th>
                <th>IP</th>
                <th>الوقت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.id) {
                <tr (click)="openDetail(row)" class="clickable" [class.is-new]="newIds().has(row.id)">
                  <td class="mono small">{{ row.id }}</td>
                  <td>
                    <span class="action-pill" [attr.data-action]="row.action">
                      {{ actionLabel(row.action) }}
                    </span>
                  </td>
                  <td>
                    <div class="entity-cell">
                      <span>{{ entityLabel(row.entity_table) }}</span>
                      @if (row.entity_id) {
                        <span class="mono small id-hint" dir="ltr">{{ row.entity_id.substring(0, 8) }}…</span>
                      }
                    </div>
                  </td>
                  <td>
                    <div class="actor-cell">
                      <span class="actor-pill" [attr.data-kind]="row.actor_kind">{{ actorLabel(row.actor_kind) }}</span>
                      @if (row.actor_name) { <span class="actor-name">{{ row.actor_name }}</span> }
                    </div>
                  </td>
                  <td class="mono small" dir="ltr">{{ row.ip_address ?? '—' }}</td>
                  <td class="mono small" dir="ltr">{{ formatDate(row.occurred_at) }}</td>
                  <td class="chev">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (nextBeforeId()) {
          <div class="more">
            <button class="btn ghost" (click)="loadMore()" [disabled]="loadingMore()">
              @if (loadingMore()) { <span class="spin sm"></span> جارٍ التحميل… }
              @else { تحميل المزيد }
            </button>
          </div>
        }

        <div class="count">{{ items().length }} سجلّ معروض @if (live()) { · <span class="live-tag">بث مباشر مُفعّل</span> }</div>
      }

      @if (detail(); as d) {
        <div class="drawer-overlay" (click)="closeDetail()"></div>
        <aside class="drawer slide-in">
          <header class="drawer-head">
            <div>
              <span class="action-pill" [attr.data-action]="d.action">{{ actionLabel(d.action) }}</span>
              <h2>{{ entityLabel(d.entity_table) }} · <span class="mono">#{{ d.id }}</span></h2>
            </div>
            <button class="x" (click)="closeDetail()" aria-label="إغلاق">✕</button>
          </header>

          <div class="drawer-body">
            <dl class="meta">
              <dt>الفاعل</dt>
              <dd>
                <span class="actor-pill" [attr.data-kind]="d.actor_kind">{{ actorLabel(d.actor_kind) }}</span>
                @if (d.actor_name) { {{ d.actor_name }} }
                @if (d.actor_id) { <span class="mono small id-hint" dir="ltr">({{ d.actor_id }})</span> }
              </dd>
              <dt>الكيان</dt>
              <dd>
                {{ entityLabel(d.entity_table) }}
                @if (d.entity_id) { <span class="mono small id-hint" dir="ltr">{{ d.entity_id }}</span> }
              </dd>
              <dt>الوقت</dt>
              <dd class="mono small" dir="ltr">{{ formatDateFull(d.occurred_at) }}</dd>
              <dt>عنوان IP</dt>
              <dd class="mono small" dir="ltr">{{ d.ip_address ?? '—' }}</dd>
              <dt>المتصفح</dt>
              <dd class="small ua" dir="ltr">{{ d.user_agent ?? '—' }}</dd>
            </dl>

            @if (d.before_state) {
              <div class="state-block">
                <h3>الحالة قبل / المُدخل</h3>
                <pre class="json" dir="ltr">{{ pretty(d.before_state) }}</pre>
              </div>
            }
            @if (d.after_state) {
              <div class="state-block">
                <h3>الحالة بعد / الاستجابة</h3>
                <pre class="json" dir="ltr">{{ pretty(d.after_state) }}</pre>
              </div>
            }
            @if (!d.before_state && !d.after_state) {
              <p class="muted-sm">لا توجد بيانات حالة مُسجّلة لهذا الإجراء.</p>
            }
          </div>
        </aside>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .sub code { background: rgba(15,23,42,0.06); padding: 1px 5px; border-radius: 3px; font-size: 10.5px; }
    .head-actions { display: flex; gap: 8px; }

    .stats { display: grid; grid-template-columns: repeat(3, minmax(110px, 1fr)) 2.4fr; gap: 12px; margin-bottom: 16px; }
    .stat { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
    .stat-val { font-size: 24px; font-weight: 800; color: var(--ink); line-height: 1; }
    .stat-lbl { font-size: 11.5px; color: var(--muted); font-weight: 600; }
    .stat.by { gap: 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--ink); background: rgba(15,23,42,0.04); border-radius: 99px; padding: 2px 8px 2px 4px; }
    .muted-sm { font-size: 11.5px; color: var(--muted); }

    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .filters select { padding: 8px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 8px; font-size: 12.5px; font-family: inherit; min-width: 130px; }
    .filters select:focus { outline: none; border-color: var(--accent); }
    .search { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--rule); border-radius: 8px; padding: 0 10px; flex: 1; min-width: 200px; color: var(--muted); }
    .search:focus-within { border-color: var(--accent); }
    .search input { border: 0; outline: none; padding: 8px 0; font-size: 12.5px; font-family: inherit; flex: 1; background: transparent; color: var(--ink); }
    .search .clear { border: 0; background: transparent; cursor: pointer; color: var(--muted); font-size: 13px; padding: 2px; }

    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; }
    .btn.ghost { background: var(--paper); border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.live { background: var(--paper); border-color: var(--rule); color: var(--muted); }
    .btn.live.on { border-color: var(--good); color: var(--good); background: rgba(8,145,178,0.06); }
    .btn.live .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .btn.live.on .dot { background: var(--good); }
    .dot.pulsing { animation: pulse 1.4s ease-in-out infinite; box-shadow: 0 0 0 0 rgba(8,145,178,0.5); }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(8,145,178,0.5); } 70% { box-shadow: 0 0 0 6px rgba(8,145,178,0); } 100% { box-shadow: 0 0 0 0 rgba(8,145,178,0); } }

    .skel-table { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 8px 0; }
    .skel-row { display: flex; align-items: center; gap: 18px; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
    .skel-row:last-child { border-bottom: 0; }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); white-space: nowrap; }
    .tbl tbody td { padding: 10px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr.clickable { cursor: pointer; transition: background .12s; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.05); }
    .tbl tbody tr.is-new { animation: flashIn 2.4s ease-out; }
    @keyframes flashIn { 0% { background: rgba(8,145,178,0.22); } 100% { background: transparent; } }
    .small { font-size: 11px; }
    .mono { font-family: var(--font-mono); }
    .chev { color: var(--muted); text-align: end; }
    .tbl tbody tr:hover .chev { color: var(--accent); }

    .action-pill { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; color: #fff; background: var(--primary); white-space: nowrap; }
    .action-pill.sm { padding: 1px 8px; font-size: 10px; }
    .action-pill[data-action='create'] { background: var(--good); }
    .action-pill[data-action='approve'] { background: var(--good); }
    .action-pill[data-action='update'] { background: #3b82f6; }
    .action-pill[data-action='reject'] { background: var(--warn); }
    .action-pill[data-action='delete'] { background: var(--warn); }
    .action-pill[data-action='revoke_id'] { background: var(--warn); }
    .action-pill[data-action='issue_id'] { background: var(--accent); color: var(--primary); }
    .action-pill[data-action='login'] { background: #6b7280; }

    .entity-cell { display: flex; flex-direction: column; gap: 2px; }
    .id-hint { color: var(--muted); }
    .actor-cell { display: flex; align-items: center; gap: 8px; }
    .actor-name { font-size: 12px; color: var(--ink); font-weight: 600; }

    .actor-pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: rgba(15,23,42,0.06); color: var(--ink); white-space: nowrap; }
    .actor-pill[data-kind='officer'] { background: rgba(249,115,22,0.12); color: #b45309; }
    .actor-pill[data-kind='citizen'] { background: rgba(8,145,178,0.12); color: #0e7490; }
    .actor-pill[data-kind='system'] { background: rgba(15,23,42,0.08); color: var(--muted); }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.3; margin-bottom: 14px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }

    .more { display: flex; justify-content: center; margin-top: 14px; }
    .spin { width: 14px; height: 14px; border: 2px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    .spin.sm { width: 12px; height: 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .count { text-align: center; font-size: 11px; color: var(--muted); margin-top: 10px; }
    .live-tag { color: var(--good); font-weight: 700; }

    /* Detail drawer */
    .drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.34); z-index: 40; animation: fade .14s ease; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .drawer { position: fixed; inset-block: 0; inset-inline-start: 0; width: min(520px, 92vw); background: #fff; z-index: 41; box-shadow: 2px 0 24px rgba(15,23,42,0.18); display: flex; flex-direction: column; }
    .slide-in { animation: slideIn .2s cubic-bezier(.2,.8,.2,1); }
    @keyframes slideIn { from { transform: translateX(-24px); opacity: .4; } to { transform: translateX(0); opacity: 1; } }
    .drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--rule); }
    .drawer-head h2 { font-size: 15px; margin: 8px 0 0; color: var(--ink); }
    .drawer-head .x { border: 0; background: rgba(15,23,42,0.05); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; color: var(--muted); font-size: 14px; }
    .drawer-head .x:hover { background: rgba(220,38,38,0.1); color: var(--warn); }
    .drawer-body { padding: 18px 20px; overflow: auto; }
    .meta { display: grid; grid-template-columns: 92px 1fr; gap: 8px 12px; margin: 0 0 18px; }
    .meta dt { font-size: 11.5px; color: var(--muted); font-weight: 700; padding-top: 2px; }
    .meta dd { font-size: 12.5px; color: var(--ink); margin: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
    .meta dd.ua { word-break: break-all; }
    .state-block { margin-bottom: 16px; }
    .state-block h3 { font-size: 12px; color: var(--muted); font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .03em; }
    .json { background: var(--primary); color: #e2e8f0; border-radius: 10px; padding: 12px 14px; font-size: 11.5px; font-family: var(--font-mono); white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow: auto; margin: 0; line-height: 1.5; }

    @media (max-width: 720px) {
      .stats { grid-template-columns: repeat(3, 1fr); }
      .stat.by { grid-column: 1 / -1; }
    }
  `],
})
export class AdminAuditPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);

  readonly items = signal<AuditRow[]>([]);
  readonly stats = signal<AuditStats | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly nextBeforeId = signal<number | null>(null);
  readonly detail = signal<AuditDetail | null>(null);
  readonly live = signal(false);
  readonly newIds = signal<Set<number>>(new Set());

  actionFilter = '';
  entityFilter = '';
  actorFilter = '';
  searchTerm = '';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  // Bumped on every filter/search change so an in-flight poll can detect that
  // the active filter set moved under it and discard stale rows.
  private filterToken = 0;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.reload(), this.loadStats()]);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  async reload(): Promise<void> {
    const token = ++this.filterToken;
    this.loading.set(true);
    this.newIds.set(new Set());
    try {
      const res = await this.fetch();
      if (token !== this.filterToken) return; // a newer reload superseded this one
      this.items.set(res.items);
      this.nextBeforeId.set(res.next_before_id);
    } catch {
      if (token === this.filterToken) this.items.set([]);
    } finally {
      if (token === this.filterToken) this.loading.set(false);
    }
  }

  async loadStats(): Promise<void> {
    try {
      const s = await firstValueFrom(this.http.get<AuditStats>(`${API_BASE}/audit/stats`));
      this.stats.set(s);
    } catch {
      // stats are best-effort; the table is the source of truth
    }
  }

  async loadMore(): Promise<void> {
    const bid = this.nextBeforeId();
    if (!bid) return;
    this.loadingMore.set(true);
    try {
      const res = await this.fetch(bid);
      this.items.update(prev => [...prev, ...res.items]);
      this.nextBeforeId.set(res.next_before_id);
    } finally {
      this.loadingMore.set(false);
    }
  }

  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.reload(), 350);
  }

  // ---- live polling -------------------------------------------------------

  toggleLive(): void {
    if (this.live()) { this.live.set(false); this.stopPolling(); }
    else { this.live.set(true); this.startPolling(); }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => { void this.pollNew(); }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async pollNew(): Promise<void> {
    if (this.loading() || this.detail()) return;
    const token = this.filterToken;
    try {
      const [res] = await Promise.all([this.fetch(), this.loadStats()]);
      // If a filter/search change happened while this poll was in flight, the
      // rows we just fetched may belong to a different filter set — discard them.
      if (token !== this.filterToken) return;
      const known = new Set(this.items().map(r => r.id));
      const fresh = res.items.filter(r => !known.has(r.id));
      if (fresh.length === 0) return;
      this.items.update(prev => [...fresh, ...prev]);
      this.newIds.set(new Set(fresh.map(r => r.id)));
    } catch {
      // transient poll failure — next tick retries
    }
  }

  private fetch(beforeId?: number): Promise<AuditListResponse> {
    let p = new HttpParams().set('limit', '50');
    if (this.actionFilter) p = p.set('action', this.actionFilter);
    if (this.entityFilter) p = p.set('entity_table', this.entityFilter);
    if (this.actorFilter) p = p.set('actor_kind', this.actorFilter);
    if (this.searchTerm.trim()) p = p.set('q', this.searchTerm.trim());
    if (beforeId) p = p.set('before_id', String(beforeId));
    return firstValueFrom(this.http.get<AuditListResponse>(`${API_BASE}/audit`, { params: p }));
  }

  // ---- detail drawer ------------------------------------------------------

  async openDetail(row: AuditRow): Promise<void> {
    // optimistic open with the row we already have, then hydrate state
    this.detail.set({ ...row, before_state: null, after_state: null, user_agent: null });
    try {
      const d = await firstValueFrom(this.http.get<AuditDetail>(`${API_BASE}/audit/${row.id}`));
      this.detail.set(d);
    } catch {
      // keep the optimistic view if the detail call fails
    }
  }

  closeDetail(): void { this.detail.set(null); }

  // ---- export -------------------------------------------------------------

  exportCsv(): void {
    const rows = this.items();
    if (!rows.length) return;
    const header = 'id,action,entity_table,entity_id,actor_kind,actor_name,actor_id,ip_address,occurred_at';
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = rows.map(r =>
      [r.id, r.action, r.entity_table, r.entity_id ?? '', r.actor_kind, r.actor_name ?? '', r.actor_id ?? '', r.ip_address ?? '', r.occurred_at].map(c => esc(String(c))).join(','),
    );
    // UTF-8 BOM (﻿) so Excel renders the Arabic columns correctly.
    this.downloadBlob('﻿' + [header, ...lines].join('\n'), 'text/csv;charset=utf-8', this.exportName('csv'));
  }

  // Excel export — a zero-dependency HTML-table workbook with the ms-excel
  // mimetype. RTL + UTF-8 BOM so Arabic columns read correctly. Opens cleanly
  // in Excel/LibreOffice (Excel shows a benign format-mismatch prompt).
  exportXls(): void {
    const rows = this.items();
    if (!rows.length) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const head = '<tr>' + this.exportHeaders()
      .map(h => `<th style="background:#0F172A;color:#fff;padding:6px 10px;border:1px solid #888;">${esc(h)}</th>`).join('') + '</tr>';
    const body = rows.map(r => '<tr>' + this.exportRow(r)
      .map(c => `<td style="padding:4px 10px;border:1px solid #ccc;mso-number-format:'\\@';">${esc(c)}</td>`).join('') + '</tr>').join('');
    const table = `<table border="1" style="direction:rtl;border-collapse:collapse;font-family:Tahoma,Arial,sans-serif;">${head}${body}</table>`;
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
      `<head><meta charset="utf-8"></head><body>${table}</body></html>`;
    this.downloadBlob('﻿' + doc, 'application/vnd.ms-excel', this.exportName('xls'));
  }

  // PDF export — print-based. The browser shapes Arabic glyphs perfectly (which
  // JS PDF libs do not, without a bundled shaping font), needs no network/CDN,
  // and reuses the window.print() pattern already used elsewhere in the app.
  // The user picks "Save as PDF" in the print dialog.
  exportPdf(): void {
    const rows = this.items();
    if (!rows.length) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const head = '<tr>' + this.exportHeaders().map(h => `<th>${esc(h)}</th>`).join('') + '</tr>';
    const body = rows.map(r => '<tr>' + this.exportRow(r)
      .map((c, i) => `<td class="${i === 0 || i === 3 || i === 6 || i === 7 ? 'mono' : ''}">${esc(c)}</td>`).join('') + '</tr>').join('');
    const stamp = esc(this.formatDate(new Date().toISOString()));
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>سجل التدقيق — صَرح</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Tahoma, Arial, sans-serif; color: #0F172A; }
        h1 { font-size: 18px; margin: 0 0 2px; }
        .sub { font-size: 11px; color: #64748b; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        thead { display: table-header-group; }
        th { background: #0F172A; color: #fff; padding: 6px 8px; text-align: right; }
        td { padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: right; }
        tr { page-break-inside: avoid; }
        tr:nth-child(even) td { background: #f6f7fb; }
        .mono { font-family: 'Courier New', monospace; direction: ltr; text-align: left; }
      </style></head><body>
        <h1>صَرح — سجل التدقيق</h1>
        <p class="sub">${rows.length} سجلّ · تم التصدير في ${stamp}</p>
        <table><thead>${head}</thead><tbody>${body}</tbody></table>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: '-9999px', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!win || !doc) { document.body.removeChild(iframe); return; }
    doc.open(); doc.write(html); doc.close();
    const cleanup = () => { try { document.body.removeChild(iframe); } catch { /* already gone */ } };
    win.onafterprint = () => setTimeout(cleanup, 100);
    setTimeout(() => { win.focus(); win.print(); setTimeout(cleanup, 60000); }, 300);
  }

  private exportHeaders(): string[] {
    return ['#', 'الإجراء', 'الكيان', 'معرّف الكيان', 'الفاعل', 'الاسم', 'IP', 'الوقت'];
  }
  private exportRow(r: AuditRow): string[] {
    return [
      String(r.id),
      this.actionLabel(r.action),
      this.entityLabel(r.entity_table),
      r.entity_id ?? '',
      this.actorLabel(r.actor_kind),
      r.actor_name ?? '',
      r.ip_address ?? '',
      this.formatDate(r.occurred_at),
    ];
  }
  private exportName(ext: string): string {
    return `audit_log_${new Date().toISOString().slice(0, 10)}.${ext}`;
  }
  private downloadBlob(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- labels & formatting ------------------------------------------------

  topActions(): AuditBreakdown[] {
    return (this.stats()?.by_action ?? []).slice(0, 5);
  }

  // Dropdown options are the UNION of the known label map and whatever keys the
  // log actually contains (from /audit/stats). This keeps the filters in sync
  // with reality — a newly-audited action/entity automatically gets an option,
  // so the dropdowns can never silently drift (this is how 'reject' was missing).
  actionOptions(): { value: string; label: string }[] {
    return this.optionsFrom(ACTION_LABELS, this.stats()?.by_action, k => this.actionLabel(k));
  }
  entityOptions(): { value: string; label: string }[] {
    return this.optionsFrom(ENTITY_LABELS, this.stats()?.by_entity, k => this.entityLabel(k));
  }
  private optionsFrom(
    labels: Record<string, string>, breakdown: AuditBreakdown[] | undefined, label: (k: string) => string,
  ): { value: string; label: string }[] {
    const keys = new Set<string>(Object.keys(labels));
    for (const b of breakdown ?? []) keys.add(b.key);
    return [...keys]
      .map(k => ({ value: k, label: label(k) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }

  actionLabel(a: string): string { return ACTION_LABELS[a] ?? a; }
  entityLabel(e: string): string { return ENTITY_LABELS[e] ?? e; }
  actorLabel(k: string): string {
    return ({ officer: 'موظف', citizen: 'مواطن', system: 'النظام' } as Record<string, string>)[k] ?? k;
  }

  pretty(json: string | null): string {
    if (!json) return '';
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  formatDateFull(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
    });
  }
}
