import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NftsService, type NftLicenseView } from '@core/nfts.service';
import type { NftStatus } from '@sarh/shared-types';
import { NFT_STATUS } from '../../../shared/status-pills';

type Tab = 'all' | NftStatus;
const TABS: Array<{ key: Tab; ar: string }> = [
  { key: 'all',         ar: 'الكل' },
  { key: 'minted',      ar: 'معتمدة' },
  { key: 'transferred', ar: 'محوَّلة' },
  { key: 'pending',     ar: 'قيد السكّ' },
  { key: 'failed',      ar: 'فشل السكّ' },
  { key: 'burned',      ar: 'ملغاة' },
];

// Read-only ledger of every NFT licence ever minted — admin/auditor scope.
// Backend: Workflow/NftsService.cs (joins property_nfts → properties for
// property_code + owner_citizen_id). Each row links to the on-chain explorer
// (etherscan.io/tx/... or equivalent for the configured network).
@Component({
  selector: 'app-nft-licences',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">سجل رخص العقارات (NFT)</h1>
          <p class="sub">كل عملية سكّ ومتابعة على البلوكتشين، مع روابط مستكشف المعاملات.</p>
        </div>
        <div class="kpis">
          <div class="kpi"><span class="kpi-num good">{{ counts().minted }}</span><span class="kpi-lbl">معتمدة</span></div>
          <div class="kpi"><span class="kpi-num gold">{{ counts().transferred }}</span><span class="kpi-lbl">محوَّلة</span></div>
          <div class="kpi"><span class="kpi-num warn">{{ counts().failed }}</span><span class="kpi-lbl">فشل</span></div>
        </div>
      </header>

      <div class="bar">
        <div class="tabs">
          @for (t of tabs; track t.key) {
            <button class="tab" [class.on]="tab() === t.key" (click)="setTab(t.key)">{{ t.ar }}</button>
          }
        </div>
        <input type="search" class="search" [(ngModel)]="ownerDidFilter" (ngModelChange)="onSearch()"
               placeholder="بحث برقم DID للمالك…" dir="ltr" />
      </div>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (items().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <p>لا توجد رخص NFT في هذه الفئة.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>العقار</th>
                <th>رقم الرمز</th>
                <th>الشبكة</th>
                <th>عقد الذكاء</th>
                <th>المالك (DID)</th>
                <th>تاريخ السكّ</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (n of items(); track n.id) {
                <tr>
                  <td><span class="mono code">{{ n.property_code ?? n.property_id.slice(0, 8) }}</span></td>
                  <td><span class="mono small" dir="ltr">{{ shorten(n.token_id, 14) }}</span></td>
                  <td><span class="net">{{ networkLabel(n.network) }}</span></td>
                  <td><span class="mono small" dir="ltr">{{ shortHex(n.contract_address) }}</span></td>
                  <td><span class="mono small" dir="ltr">{{ shorten(n.owner_did, 26) }}</span></td>
                  <td dir="ltr" class="mono small">{{ dateLabel(n.minted_at) }}</td>
                  <td><span class="badge" [style.background]="status(n.status).color">{{ status(n.status).ar }}</span></td>
                  <td class="actions-cell">
                    <a [routerLink]="['/app/nft-licences', n.id]" class="link">تفاصيل ←</a>
                    <a [href]="explorerTxUrl(n)" target="_blank" rel="noopener" class="link muted-link">المعاملة ↗</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (nextCursor()) {
          <div class="more">
            <button class="btn ghost" (click)="loadMore()" [disabled]="loadingMore()">
              @if (loadingMore()) { <span class="spin sm"></span> جارٍ التحميل… }
              @else { تحميل المزيد }
            </button>
          </div>
        }
      }

      @if (error()) {
        <div class="banner err"><span class="banner-mark">!</span>{{ error() }}</div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 600px; }

    .kpis { display: flex; gap: 10px; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 9px 18px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; min-width: 80px; }
    .kpi-num { font-size: 22px; font-weight: 800; line-height: 1; }
    .kpi-num.good { color: var(--good); }
    .kpi-num.gold { color: var(--accent); }
    .kpi-num.warn { color: var(--warn); }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .tabs { display: flex; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--rule); flex: 1; min-width: 320px; }
    .tab { padding: 9px 16px; background: transparent; border: 0; border-bottom: 2px solid transparent; margin-bottom: -7px; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .12s; }
    .tab:hover { color: var(--ink); }
    .tab.on { color: var(--primary); border-bottom-color: var(--accent); }
    .search { padding: 9px 14px; min-width: 280px; font-size: 12px; color: var(--ink); background: #fff; border: 1.5px solid var(--rule); border-radius: 10px; font-family: inherit; }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }

    .table-wrap { background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; overflow: auto; }
    .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tbl thead th { text-align: start; padding: 12px 14px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--muted); text-transform: uppercase; background: rgba(249, 115, 22, 0.04); border-bottom: 1px solid var(--rule); }
    .tbl tbody td { padding: 12px 14px; border-bottom: 1px solid var(--rule); color: var(--ink); }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.03); }
    .code { font-weight: 700; font-size: 12.5px; }
    .small { font-size: 11.5px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }
    .net { font-size: 11.5px; color: var(--muted); padding: 3px 8px; background: rgba(15,23,42,0.04); border-radius: 6px; }
    .link { color: var(--primary); text-decoration: none; font-weight: 600; font-size: 12px; }
    .link:hover { color: var(--accent); }
    .link.muted-link { color: var(--muted); margin-inline-start: 12px; }
    .actions-cell { white-space: nowrap; }

    .more { display: flex; justify-content: center; margin-top: 14px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .15s; }
    .btn.ghost { background: #fff; border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.sm { width: 14px; height: 14px; border-width: 2px; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 11px; font-weight: 700; }
  `],
})
export class AdminNftLicencesPage implements OnInit {
  private readonly api = inject(NftsService);

  readonly tabs = TABS;
  readonly tab = signal<Tab>('all');
  readonly items = signal<NftLicenseView[]>([]);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly nextCursor = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  ownerDidFilter = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly counts = computed(() => {
    const all = this.items();
    return {
      minted:      all.filter(n => n.status === 'minted').length,
      transferred: all.filter(n => n.status === 'transferred').length,
      failed:      all.filter(n => n.status === 'failed' || n.status === 'burned').length,
    };
  });

  ngOnInit(): void { void this.reload(); }

  setTab(t: Tab): void {
    this.tab.set(t);
    void this.reload();
  }

  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 250);
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.list({
        status: this.tab() === 'all' ? '' : this.tab() as NftStatus,
        owner_did: this.ownerDidFilter.trim() || undefined,
        limit: 50,
      });
      this.items.set(res.items);
      this.nextCursor.set(res.next_cursor);
    } catch {
      this.error.set('تعذّر تحميل سجل الرخص.');
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
      const res = await this.api.list({
        status: this.tab() === 'all' ? '' : this.tab() as NftStatus,
        owner_did: this.ownerDidFilter.trim() || undefined,
        cursor,
        limit: 50,
      });
      this.items.update(prev => [...prev, ...res.items]);
      this.nextCursor.set(res.next_cursor);
    } finally {
      this.loadingMore.set(false);
    }
  }

  status(s: string) { return NFT_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  networkLabel(n: string): string {
    return ({
      'ethereum-mainnet':   'Ethereum',
      'ethereum-sepolia':   'Sepolia',
      'polygon-mainnet':    'Polygon',
      'polygon-amoy':       'Amoy',
      'hyperledger-fabric': 'Hyperledger',
    } as Record<string, string>)[n] ?? n;
  }
  shorten(s: string | null | undefined, max: number): string {
    if (!s) return '—';
    if (s.length <= max) return s;
    const head = Math.ceil((max - 1) / 2);
    const tail = Math.floor((max - 1) / 2);
    return `${s.slice(0, head)}…${s.slice(-tail)}`;
  }
  shortHex(s: string | null | undefined): string {
    if (!s) return '—';
    return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
  }
  dateLabel(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Network-aware explorer URL. The backend already returned an
  // ExplorerTxUrl in the LicenseResult, but for the ledger we don't
  // re-fetch that — derive from the network label instead.
  explorerTxUrl(n: NftLicenseView): string {
    const tx = n.mint_tx_hash;
    return ({
      'ethereum-mainnet':   `https://etherscan.io/tx/${tx}`,
      'ethereum-sepolia':   `https://sepolia.etherscan.io/tx/${tx}`,
      'polygon-mainnet':    `https://polygonscan.com/tx/${tx}`,
      'polygon-amoy':       `https://amoy.polygonscan.com/tx/${tx}`,
      'hyperledger-fabric': '#',
    } as Record<string, string>)[n.network] ?? '#';
  }
}
