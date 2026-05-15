import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NftsService, type NftLicenseView } from '@core/nfts.service';
import { NFT_STATUS } from '../../../shared/status-pills';

// Citizen's licences wallet. Lists every NFT the citizen currently owns
// (per the registry), with a hero card per row + pill + click-through to
// the public verify page (which renders the full chain reconciliation).
//
// Backend: GET /api/v1/me/nft-licences. Citizens never see other citizens'
// licences — the endpoint scopes to the JWT's citizen_id.
@Component({
  selector: 'app-citizen-wallet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">محفظتي الرقمية</h1>
          <p class="sub">رخص العقارات الموثَّقة على البلوكتشين باسمك في سجل العقارات الليبي.</p>
        </div>
        <div class="kpi">
          <span class="kpi-num">{{ items().length }}</span>
          <span class="kpi-lbl">رخصة فعّالة</span>
        </div>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (items().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <p>لا توجد رخص رقمية مسجّلة باسمك بعد. ستظهر هنا فور اعتماد عقارك من الإدارة.</p>
          <a routerLink="/app/my/properties" class="btn ghost">عقاراتي ←</a>
        </div>
      } @else {
        <div class="cards">
          @for (n of items(); track n.id) {
            <article class="card">
              <div class="art">
                <div class="art-bg"></div>
                <div class="art-content">
                  <div class="art-top">
                    <div>
                      <div class="band">PROPERTY LICENCE · NFT</div>
                      <div class="title">{{ n.property_code ?? '—' }}</div>
                    </div>
                    <span class="status-pill" [style.background]="status(n.status).color">{{ status(n.status).ar }}</span>
                  </div>
                  <div class="art-bottom">
                    <div>
                      <div class="lbl">TOKEN</div>
                      <div class="val mono">{{ shorten(n.token_id, 14) }}</div>
                    </div>
                    <div>
                      <div class="lbl">NETWORK</div>
                      <div class="val">{{ networkLabel(n.network) }}</div>
                    </div>
                    <div>
                      <div class="lbl">MINTED</div>
                      <div class="val mono small">{{ shortDate(n.minted_at) }}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="row">
                <div class="kvline"><span>DID:</span> <span class="mono small" dir="ltr">{{ shorten(n.owner_did, 22) }}</span></div>
                <div class="kvline"><span>عقد الذكاء:</span> <span class="mono small" dir="ltr">{{ shorten(n.contract_address, 18) }}</span></div>
              </div>
              <div class="actions">
                <a [href]="verifyUrl(n)" target="_blank" rel="noopener" class="link-btn">
                  صفحة التحقّق العامة ↗
                </a>
                <a [href]="explorerTxUrl(n)" target="_blank" rel="noopener" class="link-btn ghost">
                  المعاملة ↗
                </a>
              </div>
            </article>
          }
        </div>

        <p class="footnote">
          لمشاهدة سلسلة ملكية كل رخصة بالكامل، شارك رابط صفحة التحقّق العامة مع أي طرف يحتاج إلى التأكد.
        </p>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; max-width: 1100px; }
    .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 600px; }
    .kpi { display: flex; flex-direction: column; align-items: center; padding: 10px 22px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; }
    .kpi-num { font-size: 28px; font-weight: 800; line-height: 1; color: var(--accent); }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; }
    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }

    .art { position: relative; aspect-ratio: 1.586; color: #fff; }
    .art-bg { position: absolute; inset: 0;
      background:
        radial-gradient(800px 400px at 110% -10%, rgba(249, 115, 22, 0.4), transparent 60%),
        radial-gradient(500px 300px at -10% 110%, rgba(8, 145, 178, 0.2), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 50%, #243a31 100%);
    }
    .art-content { position: relative; z-index: 1; padding: 20px 22px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
    .art-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .band { font-size: 9.5px; letter-spacing: 0.22em; color: var(--accent); }
    .title { font-size: 19px; font-weight: 800; margin-top: 4px; }
    .status-pill { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 10.5px; font-weight: 700; color: #fff; }
    .art-bottom { display: flex; justify-content: space-between; gap: 12px; }
    .art-content .lbl { font-size: 8.5px; letter-spacing: 0.16em; color: var(--accent); text-transform: uppercase; }
    .art-content .val { font-size: 11.5px; font-weight: 600; margin-top: 2px; }
    .art-content .val.small { font-size: 10.5px; }

    .row { padding: 14px 18px; border-bottom: 1px solid var(--rule); display: flex; flex-direction: column; gap: 5px; }
    .kvline { font-size: 11.5px; color: var(--ink); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .kvline > span:first-child { color: var(--muted); font-weight: 600; min-width: 60px; }
    .small { font-size: 11px; }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }

    .actions { padding: 12px 18px; display: flex; gap: 8px; flex-wrap: wrap; }
    .link-btn { padding: 7px 12px; border-radius: 8px; background: var(--primary); color: var(--accent); font-size: 11.5px; font-weight: 700; text-decoration: none; transition: all .12s; }
    .link-btn:hover { transform: translateY(-1px); }
    .link-btn.ghost { background: transparent; border: 1px solid var(--rule); color: var(--ink); }
    .link-btn.ghost:hover { border-color: var(--accent); color: var(--accent); }

    .footnote { font-size: 11.5px; color: var(--muted); margin: 18px 4px 0; line-height: 1.7; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .empty svg { opacity: 0.4; }
    .empty p { font-size: 13px; margin: 0; max-width: 480px; line-height: 1.7; }
    .btn { padding: 9px 18px; border-radius: 10px; font-size: 12.5px; font-weight: 700; text-decoration: none; }
    .btn.ghost { background: var(--paper); border: 1.5px solid var(--rule); color: var(--ink); }
    .btn.ghost:hover { border-color: var(--accent); color: var(--accent); }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class CitizenWalletPage implements OnInit {
  private readonly api = inject(NftsService);

  readonly items = signal<NftLicenseView[]>([]);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.api.mine();
      this.items.set(list);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
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

  shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { year: '2-digit', month: 'short', day: '2-digit' });
  }

  verifyUrl(n: NftLicenseView): string {
    return `${window.location.origin}/verify/${n.property_code ?? n.property_id}`;
  }

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
