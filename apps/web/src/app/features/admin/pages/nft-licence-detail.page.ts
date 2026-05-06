import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { CitizensService, type Citizen } from '@core/citizens.service';
import {
  NftsService,
  type NftLicenseView,
  type OwnershipEvent,
  type TransferableReason,
  type TransferReason,
} from '@core/nfts.service';
import { NFT_STATUS } from '../../../shared/status-pills';

const TRANSFER_OPTIONS: Array<{ key: TransferableReason; ar: string }> = [
  { key: 'sale',        ar: 'بيع' },
  { key: 'inheritance', ar: 'إرث' },
  { key: 'gift',        ar: 'هبة' },
  { key: 'court_order', ar: 'قرار محكمة' },
  { key: 'correction',  ar: 'تصحيح إداري' },
];

const TRANSFERABLE_ROLES = new Set(['super_admin', 'department_manager', 'registry_officer']);

const REASON_AR: Record<TransferReason, string> = {
  initial_mint: 'الإصدار الأولي',
  sale:         'بيع',
  inheritance:  'إرث',
  gift:         'هبة',
  court_order:  'قرار محكمة',
  correction:   'تصحيح إداري',
};

const REASON_TONE: Record<TransferReason, string> = {
  initial_mint: '#0891B2',  // cyan — first issuance
  sale:         '#F97316',  // gold — value transfer
  inheritance:  '#7c3aed',  // purple — succession
  gift:         '#0891B2',
  court_order:  '#DC2626',  // red — legal action
  correction:   '#6b7280',  // grey — admin
};

// Per-NFT detail: the licence card on top, KV block of chain artifacts,
// and an append-only ownership timeline rendered as a vertical list.
// Backend: GET /property-nfts/:id  +  GET /property-nfts/:id/history.
@Component({
  selector: 'app-nft-licence-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page">
      <header class="head">
        <a routerLink="/app/nft-licences" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للسجل
        </a>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (!nft()) {
        <div class="empty"><p>لم يتم العثور على الرخصة.</p></div>
      } @else if (nft(); as n) {

        <!-- Hero NFT card -->
        <div class="nft-art">
          <div class="nft-bg"></div>
          <div class="nft-content">
            <div class="nft-top">
              <div>
                <div class="nft-band">PROPERTY LICENCE · NFT</div>
                <div class="nft-title">رخصة عقار رقمية</div>
                <div class="nft-code mono">{{ n.property_code ?? '—' }}</div>
              </div>
              <div class="badge-wrap">
                <span class="badge" [style.background]="status(n.status).color">{{ status(n.status).ar }}</span>
                <div class="seal" aria-hidden="true">ص</div>
              </div>
            </div>

            @if (canTransfer() && (n.status === 'minted' || n.status === 'transferred')) {
              <div class="hero-actions">
                <button class="hero-btn" (click)="openTransfer()">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  نقل الملكية
                </button>
              </div>
            }

            <div class="nft-bottom">
              <div>
                <div class="lbl">TOKEN ID</div>
                <div class="val mono">{{ shorten(n.token_id, 18) }}</div>
              </div>
              <div>
                <div class="lbl">NETWORK</div>
                <div class="val">{{ networkLabel(n.network) }} · {{ n.standard }}</div>
              </div>
              <div>
                <div class="lbl">MINTED</div>
                <div class="val mono small">{{ longDate(n.minted_at) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chain artifacts KV -->
        <div class="grid">
          <div class="panel">
            <h2 class="panel-title">بيانات السلسلة</h2>
            <dl>
              <dt>عقد الذكاء (Contract)</dt>
              <dd class="mono small" dir="ltr">{{ n.contract_address }}</dd>
              <dt>معاملة السكّ (Tx)</dt>
              <dd class="mono small" dir="ltr">{{ n.mint_tx_hash }}</dd>
              <dt>رقم الكتلة</dt>
              <dd class="mono">{{ n.mint_block_number ?? '—' }}</dd>
              <dt>صاحب الحق (DID)</dt>
              <dd class="mono small" dir="ltr">{{ n.owner_did }}</dd>
              <dt>عنوان المالك (Address)</dt>
              <dd class="mono small" dir="ltr">{{ n.owner_address || '—' }}</dd>
              <dt>SHA-256 لبيانات التعريف</dt>
              <dd class="mono small" dir="ltr">{{ shorten(n.metadata_sha256, 24) }}</dd>
            </dl>
            <div class="links">
              <a [href]="explorerTxUrl(n)" target="_blank" rel="noopener" class="link-btn">المعاملة على المستكشف ↗</a>
              <a [href]="explorerTokenUrl(n)" target="_blank" rel="noopener" class="link-btn ghost">صفحة الرمز ↗</a>
              <a [href]="metadataUrl(n)" target="_blank" rel="noopener" class="link-btn ghost">metadata.json ↗</a>
            </div>
          </div>

          <!-- Ownership timeline -->
          <div class="panel">
            <h2 class="panel-title">سلسلة الملكية</h2>
            @if (history().length === 0) {
              <p class="hint">لا توجد سجلات تحويل.</p>
            } @else {
              <ol class="timeline">
                @for (e of history(); track e.id; let i = $index, last = $last) {
                  <li class="event" [class.last]="last">
                    <div class="dot" [style.background]="reasonTone(e.reason)">
                      @if (i === 0) {
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2L2 22h20L12 2z"/></svg>
                      } @else {
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      }
                    </div>
                    <div class="event-body">
                      <div class="event-head">
                        <span class="reason" [style.background]="reasonTone(e.reason)">{{ reasonLabel(e.reason) }}</span>
                        <span class="event-date mono small" dir="ltr">{{ longDate(e.transferred_at) }}</span>
                      </div>
                      <div class="event-route">
                        <span class="who">{{ e.from_citizen_name ?? (e.from_did ? shorten(e.from_did, 22) : '—') }}</span>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        <span class="who">{{ e.to_citizen_name ?? shorten(e.to_did, 22) }}</span>
                      </div>
                      @if (e.notes_ar) {
                        <p class="notes">{{ e.notes_ar }}</p>
                      }
                      @if (e.transfer_tx_hash) {
                        <div class="event-tx mono small" dir="ltr">tx: {{ shorten(e.transfer_tx_hash, 22) }}</div>
                      }
                    </div>
                  </li>
                }
              </ol>
            }
          </div>
        </div>

        @if (modalOpen()) {
          <div class="modal-backdrop" (click)="closeTransfer()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3 class="modal-title">نقل ملكية الرخصة</h3>
              <p class="modal-sub">سيتم تسجيل الحدث في سجل الملكية، ونقل الرمز إلى DID المالك الجديد على السلسلة.</p>

              <label class="lbl">المالك الجديد</label>
              <input type="search" class="ctl" [(ngModel)]="citizenSearch"
                     (ngModelChange)="onCitizenSearch()" name="citizenSearch"
                     placeholder="ابحث بالاسم العربي…" autocomplete="off" />
              @if (citizenList().length > 0 && !selectedCitizen()) {
                <ul class="suggest">
                  @for (c of citizenList(); track c.id) {
                    <li (click)="pickCitizen(c)">
                      <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                      <div>
                        <div class="cz-name">{{ fullName(c) }}</div>
                        <div class="cz-meta mono">{{ c.legacy_national_no ?? '—' }} · {{ c.phone ?? '—' }}</div>
                      </div>
                    </li>
                  }
                </ul>
              }
              @if (selectedCitizen(); as c) {
                <div class="chosen">
                  <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                  <div class="meta-block">
                    <div class="cz-name">{{ fullName(c) }}</div>
                    <div class="cz-meta mono">{{ c.legacy_national_no ?? '—' }} · {{ c.phone ?? '—' }}</div>
                  </div>
                  <button type="button" class="clear" (click)="clearCitizen()">تغيير</button>
                </div>
              }

              <label class="lbl">سبب النقل</label>
              <select class="ctl" [(ngModel)]="reason" name="reason">
                @for (o of transferOptions; track o.key) {
                  <option [value]="o.key">{{ o.ar }}</option>
                }
              </select>

              <label class="lbl">ملاحظة <span class="muted">(إلزامية لقرار المحكمة والتصحيح الإداري)</span></label>
              <textarea class="ctl" rows="3" [(ngModel)]="notesAr" name="notesAr"
                        placeholder="سياق إضافي يُحفظ في سجل الملكية"></textarea>

              @if (transferError(); as err) {
                <div class="banner err"><span class="banner-mark">!</span>{{ err }}</div>
              }

              <div class="modal-actions">
                <button class="btn ghost" (click)="closeTransfer()" [disabled]="transferring()">إلغاء</button>
                <button class="btn primary" (click)="confirmTransfer()"
                        [disabled]="!canSubmit() || transferring()">
                  @if (transferring()) { <span class="spin sm"></span> جارٍ النقل… }
                  @else { تأكيد النقل }
                </button>
              </div>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; max-width: 1100px; }

    .head { margin-bottom: 18px; }
    .back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--paper); border: 1px solid var(--rule); border-radius: 99px; color: var(--muted); font-size: 12px; font-weight: 500; text-decoration: none; transition: all .15s; }
    .back:hover { color: var(--accent); border-color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }

    .nft-art { position: relative; aspect-ratio: 3; min-height: 200px; border-radius: 18px; overflow: hidden; box-shadow: 0 14px 36px rgba(15, 23, 42, 0.18); color: #fff; margin-bottom: 16px; }
    .nft-bg { position: absolute; inset: 0;
      background:
        radial-gradient(800px 400px at 110% -10%, rgba(249, 115, 22, 0.45), transparent 60%),
        radial-gradient(500px 300px at -10% 110%, rgba(8, 145, 178, 0.25), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 50%, #243a31 100%);
    }
    .nft-content { position: relative; z-index: 1; padding: 26px 30px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
    .nft-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .nft-band { font-size: 10.5px; letter-spacing: 0.22em; color: var(--accent); }
    .nft-title { font-size: 22px; font-weight: 800; margin-top: 6px; }
    .nft-code { font-size: 14px; font-weight: 700; color: var(--accent); margin-top: 6px; }
    .badge-wrap { display: flex; align-items: center; gap: 12px; }
    .badge { display: inline-block; padding: 5px 14px; border-radius: 99px; font-size: 11px; font-weight: 700; color: #fff; }
    .seal { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #C2410C); color: var(--primary); display: grid; place-items: center; font-weight: 800; font-size: 24px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4); }
    .nft-bottom { display: flex; gap: 32px; flex-wrap: wrap; }
    .nft-bottom .lbl { font-size: 9px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; }
    .nft-bottom .val { font-size: 13px; font-weight: 600; margin-top: 3px; word-break: break-all; }
    .nft-bottom .val.small { font-size: 11.5px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .panel { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .panel-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); }

    dl { display: grid; grid-template-columns: 200px 1fr; gap: 12px 16px; margin: 0; }
    dt { font-size: 11.5px; color: var(--muted); align-self: center; }
    dd { font-size: 12.5px; font-weight: 600; color: var(--ink); margin: 0; align-self: center; word-break: break-all; }
    @media (max-width: 600px) { dl { grid-template-columns: 1fr; gap: 4px 0; } }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
    .small { font-size: 11.5px; }

    .links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); }
    .link-btn { padding: 7px 14px; border-radius: 8px; background: var(--primary); color: var(--accent); font-size: 11.5px; font-weight: 700; text-decoration: none; transition: all .12s; }
    .link-btn:hover { transform: translateY(-1px); }
    .link-btn.ghost { background: transparent; border: 1px solid var(--rule); color: var(--ink); }
    .link-btn.ghost:hover { border-color: var(--accent); color: var(--accent); }

    /* Timeline */
    .timeline { list-style: none; padding: 0; margin: 0; position: relative; }
    .timeline::before { content: ''; position: absolute; inset-inline-start: 14px; top: 14px; bottom: 14px; width: 2px; background: var(--rule); }
    .event { position: relative; padding-inline-start: 44px; padding-block: 12px; }
    .event.last::after { content: ''; position: absolute; inset-inline-start: 13px; top: 30px; bottom: 0; width: 4px; background: var(--paper); }
    .dot { position: absolute; inset-inline-start: 4px; top: 16px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; box-shadow: 0 0 0 4px var(--paper); flex-shrink: 0; }
    [dir='rtl'] .dot svg { transform: scaleX(-1); }
    .event-body { display: flex; flex-direction: column; gap: 6px; }
    .event-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .reason { display: inline-block; padding: 3px 10px; border-radius: 99px; color: #fff; font-size: 11px; font-weight: 700; }
    .event-date { color: var(--muted); }
    .event-route { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink); flex-wrap: wrap; }
    [dir='rtl'] .event-route svg { transform: scaleX(-1); }
    .who { font-weight: 600; }
    .notes { font-size: 11.5px; color: var(--muted); margin: 0; line-height: 1.6; }
    .event-tx { color: var(--muted); }
    .hint { font-size: 12px; color: var(--muted); margin: 0; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty p { font-size: 13px; margin: 0; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.sm { width: 14px; height: 14px; border-width: 2px; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Hero transfer button */
    .hero-actions { position: absolute; bottom: 22px; inset-inline-end: 30px; z-index: 2; }
    .hero-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 18px; border-radius: 99px;
      background: rgba(249, 115, 22, 0.95); color: var(--primary);
      border: 0; font-family: inherit;
      font-size: 12.5px; font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);
      transition: all .15s;
    }
    .hero-btn:hover { transform: translateY(-1px); background: var(--accent); }
    [dir='rtl'] .hero-btn svg { transform: scaleX(-1); }

    /* Modal */
    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); display: grid; place-items: center; z-index: 200; padding: 16px; }
    .modal { width: 100%; max-width: 520px; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4); display: flex; flex-direction: column; gap: 10px; max-height: 90vh; overflow-y: auto; }
    .modal-title { font-size: 17px; font-weight: 800; color: var(--ink); margin: 0; }
    .modal-sub { font-size: 12.5px; color: var(--muted); margin: 0 0 6px; line-height: 1.6; }
    .lbl { font-size: 12px; font-weight: 600; color: #334155; margin-top: 4px; }
    .lbl .muted { font-weight: 400; color: var(--muted); margin-inline-start: 4px; font-size: 11px; }
    .ctl {
      width: 100%; box-sizing: border-box;
      padding: 10px 12px; font-size: 13px; color: var(--ink);
      background: var(--paper);
      border: 1.5px solid var(--rule); border-radius: 8px;
      font-family: inherit;
    }
    .ctl:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
    textarea.ctl { resize: vertical; min-height: 64px; }

    .suggest { list-style: none; margin: 4px 0 0; padding: 4px; max-height: 220px; overflow-y: auto; background: #fff; border: 1px solid var(--rule); border-radius: 8px; }
    .suggest li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; }
    .suggest li:hover { background: rgba(249,115,22,0.08); }
    .avatar { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--good)); color: var(--primary); display: grid; place-items: center; font-weight: 700; flex-shrink: 0; }
    .cz-name { font-size: 13px; font-weight: 600; color: var(--ink); }
    .cz-meta { font-size: 11px; color: var(--muted); }

    .chosen { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #fff; border: 1.5px solid var(--good); border-radius: 8px; }
    .chosen .meta-block { flex: 1; min-width: 0; }
    .clear { padding: 5px 10px; background: transparent; border: 1px solid var(--rule); border-radius: 6px; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: inherit; }
    .clear:hover { color: var(--warn); border-color: var(--warn); }

    .banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; font-size: 12px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 11px; font-weight: 700; }

    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    .btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary { background: linear-gradient(135deg, var(--primary), #1e293b); color: var(--accent); }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.ghost { background: #fff; border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  `],
})
export class AdminNftLicenceDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(NftsService);
  private readonly auth = inject(AuthService);
  private readonly citizens = inject(CitizensService);

  readonly nft = signal<NftLicenseView | null>(null);
  readonly history = signal<OwnershipEvent[]>([]);
  readonly loading = signal(true);

  // Transfer modal state.
  readonly transferOptions = TRANSFER_OPTIONS;
  readonly modalOpen = signal(false);
  readonly transferring = signal(false);
  readonly transferError = signal<string | null>(null);
  readonly citizenList = signal<Citizen[]>([]);
  readonly selectedCitizen = signal<Citizen | null>(null);
  citizenSearch = '';
  reason: TransferableReason = 'sale';
  notesAr = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly canTransfer = computed(() => {
    const u = this.auth.user();
    return !!u && TRANSFERABLE_ROLES.has(u.role);
  });

  readonly canSubmit = computed(() => {
    if (!this.selectedCitizen() || !this.reason) return false;
    if ((this.reason === 'court_order' || this.reason === 'correction') && !this.notesAr.trim()) return false;
    return true;
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/app/nft-licences']);
      return;
    }
    try {
      // Parallel fetch — detail and history are independent.
      const [n, h] = await Promise.all([
        this.api.get(id),
        this.api.history(id).catch(() => [] as OwnershipEvent[]),
      ]);
      this.nft.set(n);
      this.history.set(h);
    } catch {
      this.nft.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Transfer flow ────────────────────────────────────────────
  openTransfer(): void {
    this.modalOpen.set(true);
    this.transferError.set(null);
    this.citizenSearch = '';
    this.selectedCitizen.set(null);
    this.reason = 'sale';
    this.notesAr = '';
    void this.preloadCitizens();
  }

  closeTransfer(): void { this.modalOpen.set(false); }

  private async preloadCitizens(): Promise<void> {
    try {
      const res = await this.citizens.list({ limit: 20 });
      // Filter out the current owner so they can't be re-selected as recipient.
      const ownerId = this.nft()?.owner_citizen_id;
      this.citizenList.set(res.items.filter(c => c.id !== ownerId));
    } catch {
      this.citizenList.set([]);
    }
  }

  onCitizenSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      try {
        const q = this.citizenSearch.trim();
        const res = await this.citizens.list({ q: q || undefined, limit: 20 });
        const ownerId = this.nft()?.owner_citizen_id;
        this.citizenList.set(res.items.filter(c => c.id !== ownerId));
      } catch {
        this.citizenList.set([]);
      }
    }, 250);
  }

  pickCitizen(c: Citizen): void {
    this.selectedCitizen.set(c);
    this.citizenList.set([]);
  }

  clearCitizen(): void {
    this.selectedCitizen.set(null);
    this.citizenSearch = '';
    void this.preloadCitizens();
  }

  async confirmTransfer(): Promise<void> {
    const n = this.nft();
    const c = this.selectedCitizen();
    if (!n || !c || !this.canSubmit()) return;

    this.transferring.set(true);
    this.transferError.set(null);
    try {
      const res = await this.api.transfer(n.id, {
        to_citizen_id: c.id,
        reason: this.reason,
        notes_ar: this.notesAr.trim() || undefined,
      });
      // Splice the resulting NFT + new event into the page state.
      this.nft.set(res.nft);
      this.history.update(prev => [...prev, res.event]);
      this.modalOpen.set(false);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string; message_en?: string } } };
      this.transferError.set(err.error?.error?.message_ar ?? 'تعذّر تنفيذ النقل.');
    } finally {
      this.transferring.set(false);
    }
  }

  fullName(c: Citizen): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
      .filter(Boolean).join(' ');
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
  reasonLabel(r: TransferReason): string { return REASON_AR[r] ?? r; }
  reasonTone(r: TransferReason): string  { return REASON_TONE[r] ?? '#94a3b8'; }
  shorten(s: string | null, max: number): string {
    if (!s) return '—';
    if (s.length <= max) return s;
    const head = Math.ceil((max - 1) / 2);
    const tail = Math.floor((max - 1) / 2);
    return `${s.slice(0, head)}…${s.slice(-tail)}`;
  }
  longDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  explorerTokenUrl(n: NftLicenseView): string {
    return ({
      'ethereum-mainnet':   `https://etherscan.io/token/${n.contract_address}?a=${n.token_id}`,
      'ethereum-sepolia':   `https://sepolia.etherscan.io/token/${n.contract_address}?a=${n.token_id}`,
      'polygon-mainnet':    `https://polygonscan.com/token/${n.contract_address}?a=${n.token_id}`,
      'polygon-amoy':       `https://amoy.polygonscan.com/token/${n.contract_address}?a=${n.token_id}`,
      'hyperledger-fabric': '#',
    } as Record<string, string>)[n.network] ?? '#';
  }
  metadataUrl(n: NftLicenseView): string {
    if (!n.metadata_uri.startsWith('ipfs://')) return n.metadata_uri;
    const cid = n.metadata_uri.slice('ipfs://'.length);
    return `https://w3s.link/ipfs/${cid}`;
  }
}
