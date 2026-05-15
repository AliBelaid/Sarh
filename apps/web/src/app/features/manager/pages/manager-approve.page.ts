import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PropertiesService } from '@core/properties.service';
import { CitizensService, type Citizen } from '@core/citizens.service';
import type { LicenseResult, Property } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

// Five sequential steps the LicenseService runs server-side. The UI flips
// each pill from "pending" → "active" → "done" as we estimate the work
// progressing. Because the backend call is one round trip we don't get true
// streaming progress, so we animate optimistically and snap to "done" on
// success or "failed" on the active pill on error.
type StepStatus = 'pending' | 'active' | 'done' | 'failed';
const STEPS = [
  { key: 'pades',  ar: 'توقيع PAdES للسند' },
  { key: 'ssi',    ar: 'إصدار شهادة SSI VC' },
  { key: 'ipfs',   ar: 'تثبيت metadata.json على IPFS' },
  { key: 'mint',   ar: 'استدعاء mint() على العقد' },
  { key: 'record', ar: 'حفظ tokenId + tx_hash + إشعار' },
] as const;
type StepKey = typeof STEPS[number]['key'];

@Component({
  selector: 'app-manager-approve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <a routerLink="/app/manager/queue" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للقائمة
        </a>
        <h1 class="display">إصدار رخصة عقار رقمية على البلوكتشين</h1>
        <p class="sub">راجع طلب الاعتماد، أدخل رقم القرار، ثم اضغط «اعتماد وإصدار NFT» لسكّ الرخصة على السلسلة.</p>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (!property()) {
        <div class="empty">
          <p>لم يتم العثور على العقار، أو أن حالته لا تسمح بالاعتماد النهائي.</p>
          <a routerLink="/app/manager/queue" class="btn ghost">عودة للقائمة</a>
        </div>
      } @else if (property(); as p) {

        <div class="grid">
          <!-- LEFT: property summary + officer recommendation -->
          <div class="panel">
            <h3 class="panel-title">ملخّص العقار</h3>
            <div class="kv">
              <div><span class="k">رمز العقار</span><span class="v mono">{{ p.property_code ?? '—' }}</span></div>
              <div><span class="k">المالك</span><span class="v">{{ ownerName() }}</span></div>
              <div><span class="k">DID</span><span class="v mono small" dir="ltr">{{ ownerDid() }}</span></div>
              <div><span class="k">المنطقة</span><span class="v">{{ regionLabel(p.region_id) }}</span></div>
              <div><span class="k">المساحة</span><span class="v mono" dir="ltr">{{ areaLabel(p.area_sqm) }}</span></div>
              <div><span class="k">SHA-256</span><span class="v mono small" dir="ltr">{{ shortHash(p.deed_signed_hash) }}</span></div>
            </div>

            <div class="rec">
              <div class="rec-mark"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
              <div class="rec-body">
                <div class="rec-title">توصية موظف السجل · معتمد</div>
                <div class="rec-meta">جميع الفحوصات الفنية اكتملت — الطلب جاهز للاعتماد النهائي وسكّ الرخصة.</div>
              </div>
            </div>
          </div>

          <!-- RIGHT: NFT preview + form -->
          <div>
            <div class="nft-card">
              <div class="nft-bg"></div>
              <div class="nft-content">
                <div class="nft-top">
                  <div>
                    <div class="nft-band">PROPERTY LICENCE · NFT</div>
                    <div class="nft-title">رخصة عقارية رقمية</div>
                  </div>
                  <div class="seal">ص</div>
                </div>
                <div class="nft-mid">
                  <svg viewBox="0 0 160 130" width="120" height="100" fill="none" stroke="#F97316" stroke-width="1.6" opacity="0.7">
                    <polygon points="0,40 60,0 130,12 154,72 92,114 18,98" fill="rgba(249,115,22,0.15)"/>
                    <circle cx="76" cy="58" r="4" fill="#F97316" stroke="none"/>
                  </svg>
                </div>
                <div class="nft-bottom">
                  <div>
                    <div class="lbl">TOKEN ID</div>
                    <div class="val mono small">{{ result()?.nft?.token_id ?? '— سيتم توليده عند السكّ —' }}</div>
                  </div>
                  <div>
                    <div class="lbl">CONTRACT</div>
                    <div class="val mono small" dir="ltr">{{ contractLabel() }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="form">
              <label class="lbl-form" for="decree">رقم قرار الاعتماد</label>
              <input id="decree" class="ctl" [(ngModel)]="decree" name="decree"
                     [placeholder]="p.approval_decree_no ?? 'مثال: DCR-2026-1142'" />
              <p class="hint">اتركه فارغاً للاحتفاظ برقم القرار المسجّل من موظف السجل ({{ p.approval_decree_no ?? '—' }}).</p>

              <label class="check">
                <input type="checkbox" disabled checked />
                <span>سكّ الرخصة فوراً على البلوكتشين بعد الاعتماد</span>
              </label>
              <p class="hint">سيتم تثبيت بيانات التعريف على IPFS، ثم استدعاء <span class="mono">mint()</span> على عقد ERC-721.</p>
            </div>
          </div>
        </div>

        <!-- Minting progress strip -->
        <div class="strip">
          <div class="strip-title">حالة عملية السكّ</div>
          <div class="pills">
            @for (s of steps(); track s.key; let i = $index) {
              <div class="pill" [class.active]="s.status === 'active'" [class.done]="s.status === 'done'" [class.failed]="s.status === 'failed'">
                <div class="pill-num">
                  @if (s.status === 'done') {
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  } @else if (s.status === 'failed') {
                    <span>!</span>
                  } @else if (s.status === 'active') {
                    <div class="dot"></div>
                  } @else {
                    <span>{{ i + 1 }}</span>
                  }
                </div>
                <div class="pill-lbl">{{ s.ar }}</div>
              </div>
            }
          </div>
        </div>

        @if (error(); as err) {
          <div class="banner err"><span class="banner-mark">!</span>{{ err }}</div>
        }
        @if (result(); as r) {
          <div class="banner ok">
            <span class="banner-mark ok">✓</span>
            <div>
              <div>تم سكّ الرخصة بنجاح. رقم الرمز:
                <span class="mono">{{ r.nft.token_id }}</span>.
              </div>
              <div class="links">
                <a [href]="r.explorer_tx_url" target="_blank" rel="noopener">عرض المعاملة على المستكشف ↗</a>
                <a [href]="r.metadata_gateway_url" target="_blank" rel="noopener">metadata.json ↗</a>
              </div>
            </div>
          </div>
        }

        <!-- Action buttons -->
        <div class="actions">
          <a routerLink="/app/manager/queue" class="btn ghost">إلغاء</a>
          <button class="btn primary" (click)="submit()" [disabled]="submitting() || !!result()">
            @if (submitting()) {
              <span class="spin sm"></span> جارٍ السكّ…
            } @else if (result()) {
              تم الإصدار
            } @else {
              اعتماد وإصدار NFT
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            }
          </button>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; max-width: 1100px; }

    .head { margin-bottom: 22px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px;
      background: var(--paper); border: 1px solid var(--rule);
      border-radius: 99px;
      color: var(--muted); font-size: 12px; font-weight: 500;
      text-decoration: none;
      margin-bottom: 14px;
      transition: all .15s;
    }
    .back:hover { color: var(--accent); border-color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }
    .head h1 { font-size: 22px; margin: 0 0 6px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 700px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .panel { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .panel-title { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); }

    .kv { display: grid; gap: 12px; }
    .kv > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .k { font-size: 11.5px; color: var(--muted); }
    .v { font-size: 13px; color: var(--ink); font-weight: 600; }
    .v.small { font-size: 11.5px; }

    .rec {
      display: flex; gap: 10px;
      margin-top: 16px;
      padding: 12px;
      background: rgba(8,145,178,0.06);
      border: 1px solid rgba(8,145,178,0.3);
      border-radius: 10px;
    }
    .rec-mark { width: 22px; height: 22px; border-radius: 50%; background: var(--good); color: #fff; display: grid; place-items: center; flex-shrink: 0; }
    .rec-title { font-size: 12.5px; font-weight: 700; color: var(--good); }
    .rec-meta { font-size: 11.5px; color: rgba(15,23,42,0.65); margin-top: 2px; line-height: 1.5; }

    /* NFT preview card */
    .nft-card { position: relative; aspect-ratio: 1.586; border-radius: 18px; overflow: hidden; box-shadow: 0 14px 36px rgba(15, 23, 42, 0.18); color: #fff; margin-bottom: 14px; }
    .nft-bg { position: absolute; inset: 0;
      background:
        radial-gradient(800px 400px at 110% -10%, rgba(249, 115, 22, 0.4), transparent 60%),
        radial-gradient(500px 300px at -10% 110%, rgba(8, 145, 178, 0.2), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 50%, #243a31 100%);
    }
    .nft-content { position: relative; z-index: 1; padding: 22px 26px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
    .nft-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .nft-band { font-size: 10px; letter-spacing: 0.22em; color: var(--accent); }
    .nft-title { font-size: 20px; font-weight: 800; margin-top: 6px; }
    .seal { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #C2410C); color: var(--primary); display: grid; place-items: center; font-weight: 800; font-size: 22px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4); }
    .nft-mid { flex: 1; display: grid; place-items: center; }
    .nft-bottom { display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; }
    .nft-content .lbl { font-size: 8.5px; letter-spacing: 0.16em; color: var(--accent); text-transform: uppercase; }
    .nft-content .val { font-size: 12px; font-weight: 600; margin-top: 2px; word-break: break-all; }

    .form { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 18px 22px; }
    .lbl-form { display: block; font-size: 12.5px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }
    .ctl {
      width: 100%; box-sizing: border-box;
      padding: 11px 14px; font-size: 13.5px; color: var(--ink);
      background: #fff; border: 1.5px solid var(--rule); border-radius: 10px; font-family: inherit;
      transition: all .15s;
    }
    .ctl:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
    .hint { font-size: 11px; color: var(--muted); margin: 6px 0 0; }
    .check { display: inline-flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 12.5px; color: var(--ink); }

    /* Progress strip */
    .strip { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 18px 22px; margin-bottom: 14px; }
    .strip-title { font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); }
    .pills { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
    .pill { display: inline-flex; align-items: center; gap: 8px; }
    .pill-num { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: rgba(15,23,42,0.45); background: #fff; border: 1.5px solid var(--rule); }
    .pill.active .pill-num { background: var(--accent); color: #fff; border-color: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
    .pill.done   .pill-num { background: var(--good);   color: #fff; border-color: var(--good); }
    .pill.failed .pill-num { background: var(--warn);   color: #fff; border-color: var(--warn); }
    .pill-lbl { font-size: 12px; color: rgba(15,23,42,0.65); }
    .pill.done .pill-lbl, .pill.active .pill-lbl { color: var(--ink); font-weight: 600; }
    .pill.failed .pill-lbl { color: var(--warn); font-weight: 700; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.45); } 50% { box-shadow: 0 0 0 6px rgba(249,115,22,0.0); } }

    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 18px; border-radius: 10px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
      cursor: pointer; font-family: inherit; text-decoration: none;
      border: 1.5px solid transparent; transition: all .15s;
    }
    .btn.primary { background: linear-gradient(135deg, var(--primary), #1e293b); color: var(--accent); box-shadow: 0 4px 14px rgba(15,23,42,0.2); }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.ghost { background: #fff; border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover { border-color: var(--accent); color: var(--accent); }
    [dir='rtl'] .btn.primary svg { transform: scaleX(-1); }

    .banner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 10px; font-size: 12.5px; margin-bottom: 14px; line-height: 1.7; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .banner-mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 800; flex-shrink: 0; }
    .banner-mark.ok { background: #16a34a; }
    .banner .links { display: flex; gap: 14px; margin-top: 6px; flex-wrap: wrap; }
    .banner .links a { color: inherit; text-decoration: underline; font-weight: 600; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); background: var(--paper); border: 1px dashed var(--rule); border-radius: 14px; }
    .empty p { font-size: 13px; margin: 0 0 14px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.sm { width: 14px; height: 14px; border-width: 2px; margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ManagerApprovePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PropertiesService);
  private readonly citizensApi = inject(CitizensService);

  readonly property = signal<Property | null>(null);
  readonly owner = signal<Citizen | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<LicenseResult | null>(null);

  decree = '';

  // Live progress map. Snapshot rendered into the strip via computed().
  private readonly stepStatus = signal<Record<StepKey, StepStatus>>({
    pades: 'pending', ssi: 'pending', ipfs: 'pending', mint: 'pending', record: 'pending',
  });

  readonly steps = computed(() =>
    STEPS.map(s => ({ ...s, status: this.stepStatus()[s.key] })));

  readonly ownerName = computed(() => {
    const o = this.owner();
    if (!o) return '—';
    return [o.first_name_ar, o.father_name_ar, o.grandfather_name_ar, o.family_name_ar]
      .filter(Boolean).join(' ');
  });

  readonly ownerDid = computed(() => {
    const o = this.owner();
    if (!o) return '—';
    return `did:sov:LY:${o.id.replace(/-/g, '').slice(0, 16)}`;
  });

  readonly contractLabel = computed(() => {
    const r = this.result();
    return r ? `${r.nft.contract_address.slice(0, 10)}…${r.nft.contract_address.slice(-6)} · ${r.nft.network}` : '— سيُحدَّد من إعدادات الإدارة —';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/app/manager/queue']);
      return;
    }
    try {
      const p = await this.api.get(id);
      this.property.set(p);
      const c = await this.citizensApi.get(p.owner_citizen_id).catch(() => null);
      this.owner.set(c);
    } catch {
      this.property.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const p = this.property();
    if (!p || this.submitting() || this.result()) return;

    this.error.set(null);
    this.submitting.set(true);

    // Optimistic strip animation. Step durations are guesses tuned for the
    // common case (sub-second stub mode); real chain mode will overshoot
    // visually but the final snap-to-done at the end keeps the UI honest.
    const order: StepKey[] = ['pades', 'ssi', 'ipfs', 'mint', 'record'];
    const setStep = (k: StepKey, s: StepStatus) => {
      this.stepStatus.update(m => ({ ...m, [k]: s }));
    };

    let activeStep: StepKey = 'pades';
    const ticker = (() => {
      let i = 0;
      setStep(order[0], 'active');
      activeStep = order[0];
      return setInterval(() => {
        if (i >= order.length - 1) return;
        setStep(order[i], 'done');
        i++;
        setStep(order[i], 'active');
        activeStep = order[i];
      }, 600);
    })();

    try {
      const r = await this.api.finalApprove(p.id, {
        approval_decree_no: this.decree.trim() || undefined,
      });
      clearInterval(ticker);
      // Snap all to done.
      for (const k of order) setStep(k, 'done');
      this.result.set(r);
      // Reflect updated property status in the local signal.
      this.property.set(r.property);
    } catch (e: unknown) {
      clearInterval(ticker);
      setStep(activeStep, 'failed');
      const err = e as { error?: { error?: { message_ar?: string; message_en?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر سكّ الرخصة. يرجى المحاولة مرة أخرى.');
    } finally {
      this.submitting.set(false);
    }
  }

  status(s: string) { return PROPERTY_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  typeLabel(t: string) { return PROPERTY_TYPE[t] ?? t; }
  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGIONS[id] ?? `منطقة ${id}`;
  }
  areaLabel(a: number | null | undefined): string {
    if (a == null) return '—';
    return `${Number(a).toLocaleString('ar-LY')} م²`;
  }
  shortHash(h: string | null | undefined): string {
    if (!h) return '—';
    return h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h;
  }
}
