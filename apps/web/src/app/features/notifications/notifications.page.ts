import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  NotificationsService,
  type SarhNotification,
} from '@core/notifications.service';

type Tab = 'all' | 'unread';

// Per-user inbox. Citizens see citizen-scoped rows (mint, transfer received,
// review decisions); officers see officer-scoped rows (new submission in
// region, manager approval needed). Backend scopes via JWT — no role gate
// on this page beyond authGuard.
@Component({
  selector: 'app-notifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">الإشعارات</h1>
          <p class="sub">آخر المستجدّات على طلباتك ورخصك العقارية.</p>
        </div>
        <div class="actions">
          <button class="btn ghost" (click)="markAll()" [disabled]="markingAll() || unreadCount() === 0">
            @if (markingAll()) { <span class="spin sm"></span> جارٍ… }
            @else { تحديد الكل كمقروء ({{ unreadCount() }}) }
          </button>
        </div>
      </header>

      <div class="tabs">
        <button class="tab" [class.on]="tab() === 'all'" (click)="setTab('all')">
          الكل ({{ items().length }})
        </button>
        <button class="tab" [class.on]="tab() === 'unread'" (click)="setTab('unread')">
          غير مقروءة ({{ unreadCount() }})
        </button>
      </div>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (filtered().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <p>لا توجد إشعارات{{ tab() === 'unread' ? ' غير مقروءة' : '' }}.</p>
        </div>
      } @else {
        <ul class="list">
          @for (n of filtered(); track n.id) {
            <li class="row" [class.unread]="!n.read_at" (click)="open(n)">
              <div class="dot" [class.unread]="!n.read_at"></div>
              <div class="body">
                <div class="row-head">
                  <span class="title">{{ n.title_ar || '—' }}</span>
                  <span class="when mono small" dir="ltr">{{ relative(n.sent_at) }}</span>
                </div>
                @if (n.body_ar) {
                  <p class="text">{{ n.body_ar }}</p>
                }
                @if (linkFor(n); as lk) {
                  <div class="links">
                    @if (lk.verify) {
                      <a [href]="lk.verify" target="_blank" rel="noopener" class="link-btn">صفحة التحقّق ↗</a>
                    }
                    @if (lk.explorer) {
                      <a [href]="lk.explorer" target="_blank" rel="noopener" class="link-btn ghost">المعاملة على المستكشف ↗</a>
                    }
                    @if (lk.app) {
                      <a [routerLink]="lk.app" class="link-btn ghost">فتح في التطبيق →</a>
                    }
                  </div>
                }
              </div>
            </li>
          }
        </ul>

        @if (nextCursor()) {
          <div class="more">
            <button class="btn ghost" (click)="loadMore()" [disabled]="loadingMore()">
              @if (loadingMore()) { <span class="spin sm"></span> جارٍ التحميل… }
              @else { تحميل المزيد }
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; max-width: 880px; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }
    .actions { display: flex; gap: 8px; }

    .tabs { display: flex; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--rule); margin-bottom: 14px; }
    .tab { padding: 9px 16px; background: transparent; border: 0; border-bottom: 2px solid transparent; margin-bottom: -7px; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .12s; }
    .tab:hover { color: var(--ink); }
    .tab.on { color: var(--primary); border-bottom-color: var(--accent); }

    .list { list-style: none; padding: 0; margin: 0; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
    .row { display: flex; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--rule); cursor: pointer; transition: background .12s; }
    .row:last-child { border-bottom: 0; }
    .row:hover { background: rgba(249, 115, 22, 0.03); }
    .row.unread { background: rgba(249, 115, 22, 0.04); }
    .row.unread:hover { background: rgba(249, 115, 22, 0.07); }

    .dot { width: 8px; height: 8px; border-radius: 50%; background: transparent; margin-top: 8px; flex-shrink: 0; }
    .dot.unread { background: var(--accent); box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.18); }

    .body { flex: 1; min-width: 0; }
    .row-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .title { font-size: 13.5px; font-weight: 700; color: var(--ink); }
    .when { color: var(--muted); white-space: nowrap; font-size: 11px; }
    .text { font-size: 12.5px; color: var(--ink); margin: 4px 0 0; line-height: 1.7; }
    .small { font-size: 11px; }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }

    .links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .link-btn { padding: 5px 10px; border-radius: 6px; background: var(--primary); color: var(--accent); font-size: 11px; font-weight: 700; text-decoration: none; transition: all .12s; }
    .link-btn:hover { transform: translateY(-1px); }
    .link-btn.ghost { background: transparent; border: 1px solid var(--rule); color: var(--ink); }
    .link-btn.ghost:hover { border-color: var(--accent); color: var(--accent); }

    .more { display: flex; justify-content: center; margin-top: 14px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; }
    .btn.ghost { background: var(--paper); border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.sm { width: 12px; height: 12px; border-width: 2px; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class NotificationsPage implements OnInit {
  private readonly api = inject(NotificationsService);

  readonly items = signal<SarhNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly markingAll = signal(false);
  readonly tab = signal<Tab>('all');

  readonly filtered = computed(() =>
    this.tab() === 'unread' ? this.items().filter(n => !n.read_at) : this.items());

  ngOnInit(): void { void this.reload(); }

  setTab(t: Tab): void { this.tab.set(t); }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [list, count] = await Promise.all([
        this.api.list({ limit: 50 }),
        this.api.refreshUnread(),
      ]);
      this.items.set(list.items);
      this.nextCursor.set(list.next_cursor);
      this.unreadCount.set(count);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor) return;
    this.loadingMore.set(true);
    try {
      const res = await this.api.list({ cursor, limit: 50 });
      this.items.update(prev => [...prev, ...res.items]);
      this.nextCursor.set(res.next_cursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  async open(n: SarhNotification): Promise<void> {
    if (n.read_at) return;
    try {
      const updated = await this.api.markRead(n.id);
      this.items.update(prev => prev.map(x => x.id === n.id ? updated : x));
      // Service decrements the shared signal — mirror locally for tab counts.
      this.unreadCount.update(c => Math.max(0, c - 1));
    } catch { /* swallow — let the user retry on click */ }
  }

  async markAll(): Promise<void> {
    if (this.markingAll() || this.unreadCount() === 0) return;
    this.markingAll.set(true);
    try {
      await this.api.markAllRead();
      const now = new Date().toISOString();
      this.items.update(prev => prev.map(x => x.read_at ? x : { ...x, read_at: now }));
      this.unreadCount.set(0);
    } finally {
      this.markingAll.set(false);
    }
  }

  // Derives helper links from the notification's payload so the row exposes
  // a one-click jump to the resource it's about. Pure presentational —
  // unknown payload shapes just render no extra links.
  linkFor(n: SarhNotification): { app?: string; verify?: string; explorer?: string } | null {
    const p = n.payload;
    if (!p) return null;
    const links: { app?: string; verify?: string; explorer?: string } = {};
    if (typeof p['property_code'] === 'string') {
      links.verify = `${window.location.origin}/verify/${p['property_code']}`;
    }
    if (typeof p['explorer_url'] === 'string') links.explorer = p['explorer_url'] as string;
    if (typeof p['property_id'] === 'string') links.app = `/app/my/wallet`;
    return Object.keys(links).length ? links : null;
  }

  relative(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return `قبل ${m} د`;
    const h = Math.floor(m / 60);
    if (h < 24) return `قبل ${h} س`;
    const d = Math.floor(h / 24);
    if (d < 30) return `قبل ${d} يوم`;
    return new Date(iso).toLocaleDateString('en-GB');
  }
}
