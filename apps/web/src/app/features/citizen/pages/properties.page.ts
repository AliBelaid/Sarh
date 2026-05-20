import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PropertiesService } from '@core/properties.service';
import type { Property } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

@Component({
  selector: 'app-citizen-properties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">عقاراتي</h1>
          <p class="sub">قائمة طلبات تسجيل ملكيتي وحالتها الحالية.</p>
        </div>
        <a routerLink="/app/my/properties/new" class="btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          تسجيل عقار جديد
        </a>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (error()) {
        <div class="banner err">
          <span class="banner-mark">!</span>
          {{ error() }}
        </div>
      } @else if (items().length === 0) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
          <h3>لا توجد عقارات بعد</h3>
          <p>ابدأ بتسجيل عقارك الأول لتظهر له حالة هنا.</p>
          <a routerLink="/app/my/properties/new" class="btn-primary inline">تسجيل عقار جديد</a>
        </div>
      } @else {
        <div class="grid">
          @for (p of items(); track p.id) {
            <article class="card">
              <div class="card-top">
                <span class="code mono">{{ p.property_code ?? 'بدون رمز' }}</span>
                <span class="badge" [style.background]="status(p.status).color">
                  {{ status(p.status).ar }}
                </span>
              </div>
              <h3>{{ typeLabel(p.property_type) }}</h3>
              <div class="meta">
                <span>{{ regionLabel(p.region_id) }}</span>
                <span aria-hidden="true">·</span>
                <span dir="ltr">{{ areaLabel(p.area_sqm) }}</span>
              </div>
              @if (p.parcel_number || p.plan_number) {
                <div class="parcel mono">
                  @if (p.parcel_number) { <span>قطعة {{ p.parcel_number }}</span> }
                  @if (p.plan_number)   { <span>· مخطط {{ p.plan_number }}</span> }
                </div>
              }
              @if (p.address_ar) {
                <p class="addr">{{ p.address_ar }}</p>
              }
              <footer class="card-foot">
                <span class="ts mono">{{ dateLabel(p.submitted_at ?? p.created_at) }}</span>
                @if (p.deed_pdf_path) {
                  <span class="deed-flag">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    سند رقمي
                  </span>
                }
              </footer>
              @if (p.status === 'approved') {
                <button class="btn-mint" type="button"
                        (click)="mint(p)"
                        [disabled]="minting() === p.id">
                  @if (minting() === p.id) {
                    <span class="spin sm"></span>
                    <span>جارٍ السكّ…</span>
                  } @else {
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span>إصدار رخصتي (NFT)</span>
                  }
                </button>
                @if (mintError() && mintErrorFor() === p.id) {
                  <p class="mint-err">{{ mintError() }}</p>
                }
              }
              @if (p.status === 'minted') {
                <div class="mint-done">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>تم إصدار الرخصة على البلوكتشين</span>
                </div>
              }
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 16px; flex-wrap: wrap;
      margin-bottom: 22px;
    }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 16px;
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      border-radius: 10px;
      font-size: 13px; font-weight: 700;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
      transition: all .2s;
    }
    .btn-primary:hover { transform: translateY(-1px); color: var(--accent); }
    .btn-primary.inline { margin-top: 12px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 14px;
    }

    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 18px 18px 14px;
      display: flex; flex-direction: column;
      transition: all .2s;
    }
    .card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
      border-color: rgba(249, 115, 22, 0.4);
    }
    .card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .code { font-size: 12.5px; font-weight: 700; color: var(--ink); }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; color: #fff; }

    .card h3 { font-size: 16px; margin: 0 0 6px; color: var(--ink); }
    .meta { display: flex; gap: 8px; font-size: 12.5px; color: var(--muted); }
    .parcel { font-size: 11px; color: var(--muted); margin-top: 6px; }
    .addr { font-size: 12.5px; color: var(--ink); margin: 8px 0 0; line-height: 1.55; }

    .card-foot {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 14px; padding-top: 12px;
      border-top: 1px dashed var(--rule);
      font-size: 11.5px;
    }
    .ts { color: var(--muted); }
    .deed-flag { display: inline-flex; align-items: center; gap: 4px; color: var(--good); font-weight: 600; }

    .empty {
      padding: 60px 24px;
      text-align: center;
      color: var(--muted);
      background: var(--paper);
      border: 1px dashed var(--rule);
      border-radius: 14px;
    }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { padding: 12px 14px; border-radius: 10px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }

    .btn-mint {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; margin-top: 12px;
      padding: 9px 14px;
      background: linear-gradient(135deg, var(--accent), #C2410C);
      color: var(--primary);
      border: 0; border-radius: 10px;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.03em;
      cursor: pointer; font-family: inherit;
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.25);
      transition: transform .15s, box-shadow .15s;
    }
    .btn-mint:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(249, 115, 22, 0.35); }
    .btn-mint:disabled { opacity: 0.6; cursor: not-allowed; }
    .mint-err { margin: 8px 0 0; font-size: 11.5px; color: var(--warn); }
    .mint-done {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 12px; padding: 7px 12px;
      background: rgba(8,145,178,0.08);
      color: var(--good);
      border: 1px solid rgba(8,145,178,0.25);
      border-radius: 8px;
      font-size: 11.5px; font-weight: 700;
    }
    .spin.sm { width: 14px; height: 14px; border: 2px solid rgba(15,23,42,0.25); border-top-color: var(--primary); border-radius: 50%; animation: spin .6s linear infinite; }
  `],
})
export class CitizenPropertiesPage implements OnInit {
  private readonly api = inject(PropertiesService);

  readonly items = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Per-card mint state. `minting` holds the id of the property currently
  // being minted (so the right button shows the spinner); `mintError` is
  // the most recent failure message, scoped to `mintErrorFor`.
  readonly minting = signal<string | null>(null);
  readonly mintError = signal<string | null>(null);
  readonly mintErrorFor = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.list({ limit: 50 });
      this.items.set(res.items);
    } catch {
      this.error.set('تعذّر تحميل قائمة العقارات.');
    } finally {
      this.loading.set(false);
    }
  }

  async mint(p: Property): Promise<void> {
    if (this.minting()) return;
    if (!confirm('سيتم سكّ رخصة NFT لعقارك على البلوكتشين. هل تريد المتابعة؟')) return;
    this.minting.set(p.id);
    this.mintError.set(null);
    this.mintErrorFor.set(null);
    try {
      const r = await this.api.finalApprove(p.id, {});
      // Update the card in-place rather than re-fetching the whole list.
      this.items.update((items) => items.map((it) => (it.id === p.id ? r.property : it)));
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.mintErrorFor.set(p.id);
      this.mintError.set(err.error?.error?.message_ar ?? 'تعذّر إصدار الرخصة. حاول مجدداً.');
    } finally {
      this.minting.set(null);
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
  dateLabel(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
