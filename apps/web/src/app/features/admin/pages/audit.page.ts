import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';

interface AuditRow {
  id: number;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  entity_table: string;
  entity_id: string | null;
  ip_address: string | null;
  occurred_at: string;
}

interface AuditListResponse {
  items: AuditRow[];
  next_before_id: number | null;
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
};

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
          <button class="btn ghost" (click)="exportCsv()" [disabled]="items().length === 0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            تصدير CSV
          </button>
          <button class="btn ghost" (click)="reload()" [disabled]="loading()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/></svg>
            تحديث
          </button>
        </div>
      </header>

      <div class="filters">
        <select [(ngModel)]="actionFilter" (ngModelChange)="reload()">
          <option value="">كل الإجراءات</option>
          <option value="create">إنشاء</option>
          <option value="update">تعديل</option>
          <option value="delete">حذف</option>
          <option value="approve">اعتماد</option>
          <option value="reject">رفض</option>
          <option value="issue_id">إصدار هوية</option>
          <option value="revoke_id">إلغاء هوية</option>
          <option value="login">تسجيل دخول</option>
        </select>
        <select [(ngModel)]="entityFilter" (ngModelChange)="reload()">
          <option value="">كل الكيانات</option>
          <option value="properties">عقارات</option>
          <option value="citizens">مواطنون</option>
          <option value="digital_id_cards">بطاقات هوية</option>
          <option value="officers">موظفون</option>
          <option value="auth_users">حسابات</option>
          <option value="property_nfts">رخص NFT</option>
        </select>
        <select [(ngModel)]="actorFilter" (ngModelChange)="reload()">
          <option value="">كل الفاعلين</option>
          <option value="officer">موظف</option>
          <option value="citizen">مواطن</option>
          <option value="system">النظام</option>
        </select>
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
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.id) {
                <tr>
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
                    <span class="actor-pill">{{ actorLabel(row.actor_kind) }}</span>
                  </td>
                  <td class="mono small" dir="ltr">{{ row.ip_address ?? '—' }}</td>
                  <td class="mono small" dir="ltr">{{ formatDate(row.occurred_at) }}</td>
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

        <div class="count">{{ items().length }} سجلّ معروض</div>
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

    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .filters select { padding: 8px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 8px; font-size: 12.5px; font-family: inherit; min-width: 130px; }
    .filters select:focus { outline: none; border-color: var(--accent); }

    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; }
    .btn.ghost { background: var(--paper); border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .skel-table { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 8px 0; }
    .skel-row { display: flex; align-items: center; gap: 18px; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
    .skel-row:last-child { border-bottom: 0; }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); white-space: nowrap; }
    .tbl tbody td { padding: 10px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.03); }
    .small { font-size: 11px; }
    .mono { font-family: var(--font-mono); }

    .action-pill { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; color: #fff; background: var(--primary); }
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

    .actor-pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: rgba(15,23,42,0.06); color: var(--ink); }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.3; margin-bottom: 14px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }

    .more { display: flex; justify-content: center; margin-top: 14px; }
    .spin { width: 14px; height: 14px; border: 2px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    .spin.sm { width: 12px; height: 12px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .count { text-align: center; font-size: 11px; color: var(--muted); margin-top: 10px; }
  `],
})
export class AdminAuditPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly items = signal<AuditRow[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly nextBeforeId = signal<number | null>(null);

  actionFilter = '';
  entityFilter = '';
  actorFilter = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.fetch();
      this.items.set(res.items);
      this.nextBeforeId.set(res.next_before_id);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
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

  private fetch(beforeId?: number): Promise<AuditListResponse> {
    let p = new HttpParams().set('limit', '50');
    if (this.actionFilter) p = p.set('action', this.actionFilter);
    if (this.entityFilter) p = p.set('entity_table', this.entityFilter);
    if (this.actorFilter) p = p.set('actor_kind', this.actorFilter);
    if (beforeId) p = p.set('before_id', String(beforeId));
    return firstValueFrom(this.http.get<AuditListResponse>(`${API_BASE}/audit`, { params: p }));
  }

  exportCsv(): void {
    const rows = this.items();
    if (!rows.length) return;
    const header = 'id,action,entity_table,entity_id,actor_kind,actor_id,ip_address,occurred_at';
    const lines = rows.map(r =>
      [r.id, r.action, r.entity_table, r.entity_id ?? '', r.actor_kind, r.actor_id ?? '', r.ip_address ?? '', r.occurred_at].join(','),
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  actionLabel(a: string): string { return ACTION_LABELS[a] ?? a; }
  entityLabel(e: string): string { return ENTITY_LABELS[e] ?? e; }
  actorLabel(k: string): string {
    return ({ officer: 'موظف', citizen: 'مواطن', system: 'النظام' } as Record<string, string>)[k] ?? k;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }
}
