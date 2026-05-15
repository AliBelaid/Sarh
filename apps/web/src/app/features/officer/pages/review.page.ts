import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { PropertiesService } from '@core/properties.service';
import type { Property, ReviewDecision } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

@Component({
  selector: 'app-officer-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <a routerLink="/app/queue" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للطابور
        </a>
        @if (property()) {
          <span class="badge" [style.background]="statusColor(property()!.status)">{{ statusLabel(property()!.status) }}</span>
        }
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (error()) {
        <div class="banner err">
          <span class="banner-mark">!</span>
          {{ error() }}
        </div>
      } @else if (property(); as p) {
        <div class="grid">
          <!-- Hero / details -->
          <article class="card hero-card">
            <div class="hero-top">
              <div>
                <h1 class="display">{{ p.property_code ?? 'طلب جديد' }}</h1>
                <div class="hero-sub mono">{{ p.parcel_number ? 'قطعة ' + p.parcel_number : 'لا رقم قطعة' }}</div>
              </div>
            </div>
            <dl>
              <dt>النوع</dt><dd>{{ typeLabel(p.property_type) }}</dd>
              <dt>المساحة</dt><dd dir="ltr" class="mono">{{ areaLabel(p.area_sqm) }}</dd>
              <dt>المنطقة</dt><dd>{{ regionLabel(p.region_id) }}</dd>
              <dt>العنوان</dt><dd>{{ p.address_ar ?? '—' }}</dd>
              <dt>تاريخ الإرسال</dt><dd dir="ltr" class="mono small">{{ dateLabel(p.submitted_at) }}</dd>
              @if (p.reviewed_at) {
                <dt>آخر مراجعة</dt><dd dir="ltr" class="mono small">{{ dateLabel(p.reviewed_at) }}</dd>
              }
            </dl>
          </article>

          <!-- Map -->
          <article class="card map-card">
            <h2>الموقع التقريبي</h2>
            <div #mapEl class="map"></div>
            <p class="hint">تظهر علامة عند مركز المنطقة (الإحداثيات الفعلية للمضلع تأتي من API لاحقاً).</p>
          </article>

          <!-- Decision -->
          <article class="card decision-card">
            <h2>القرار</h2>
            <div class="dec-toggle">
              <button class="dec-btn" [class.on]="decision() === 'approve'"
                      data-kind="approve" (click)="decision.set('approve')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                اعتماد
              </button>
              <button class="dec-btn" [class.on]="decision() === 'needs_clarification'"
                      data-kind="warn" (click)="decision.set('needs_clarification')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                طلب توضيح
              </button>
              <button class="dec-btn" [class.on]="decision() === 'reject'"
                      data-kind="reject" (click)="decision.set('reject')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                رفض
              </button>
            </div>

            @if (decision() === 'approve') {
              <div class="field">
                <label>رقم القرار الإداري <span class="opt">(اختياري)</span></label>
                <input dir="ltr" [(ngModel)]="decreeNo" name="decreeNo" [disabled]="busy()" />
              </div>
            }

            <div class="field">
              <label>
                ملاحظة للمواطن
                @if (decision() !== 'approve') { <span class="req">*</span> }
              </label>
              <textarea rows="3" [(ngModel)]="note" name="note"
                        [placeholder]="notePlaceholder()" [disabled]="busy()"></textarea>
            </div>

            @if (errorMsg()) {
              <div class="banner err inline">
                <span class="banner-mark">!</span>
                {{ errorMsg() }}
              </div>
            }
            @if (successMsg()) {
              <div class="banner ok inline">
                <span class="banner-mark ok">✓</span>
                {{ successMsg() }}
              </div>
            }

            <button class="submit" (click)="submit()" [disabled]="busy() || !canSubmit()">
              @if (busy()) {
                <span class="spin small"></span> جارٍ المعالجة…
              } @else {
                تأكيد القرار
              }
            </button>
          </article>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 99px;
      color: var(--muted);
      font-size: 12px; font-weight: 600;
      text-decoration: none;
      transition: all .15s;
    }
    .back:hover { border-color: var(--accent); color: var(--accent); }
    .back svg { transition: transform .15s; }
    [dir='rtl'] .back svg { transform: scaleX(-1); }
    .badge { padding: 5px 14px; border-radius: 99px; font-size: 12px; font-weight: 700; color: #fff; }

    .grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      grid-template-areas: "hero map" "hero decision";
      gap: 16px;
    }
    @media (max-width: 1024px) { .grid { grid-template-columns: 1fr; grid-template-areas: "hero" "map" "decision"; } }
    .hero-card { grid-area: hero; }
    .map-card { grid-area: map; }
    .decision-card { grid-area: decision; }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card h2 { font-size: 14px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); color: var(--ink); }

    .hero-top h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .hero-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }

    dl { margin: 0; display: grid; grid-template-columns: 130px 1fr; gap: 10px 14px; font-size: 13.5px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); }
    .small { font-size: 12px; }

    .map { width: 100%; height: 280px; border-radius: 10px; overflow: hidden; border: 1px solid var(--rule); margin-bottom: 8px; }
    .hint { font-size: 11.5px; color: var(--muted); margin: 0; }

    .dec-toggle { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 16px; }
    .dec-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 8px;
      background: #fff;
      border: 1.5px solid var(--rule);
      border-radius: 8px;
      font-size: 12.5px; font-weight: 600;
      color: var(--ink);
      cursor: pointer; font-family: inherit;
      transition: all .12s;
    }
    .dec-btn:hover { border-color: rgba(15,23,42,0.3); }
    .dec-btn[data-kind='approve'].on { background: var(--good); color: #fff; border-color: var(--good); }
    .dec-btn[data-kind='warn'].on    { background: #f59e0b; color: #fff; border-color: #f59e0b; }
    .dec-btn[data-kind='reject'].on  { background: var(--warn); color: #fff; border-color: var(--warn); }

    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .field label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .opt { color: var(--muted); font-weight: 400; }
    .req { color: var(--warn); }
    .field input, .field textarea {
      padding: 9px 12px;
      background: #fff;
      border: 1.5px solid var(--rule);
      border-radius: 8px;
      font-size: 13.5px; color: var(--ink);
      font-family: inherit;
    }
    .field textarea { resize: vertical; min-height: 70px; }
    .field input:focus, .field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(249,115,22,0.12); }

    .banner { padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: rgba(8,145,178,0.08); color: var(--good); border: 1px solid rgba(8,145,178,0.3); }
    .banner.inline { display: flex; margin-bottom: 12px; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .banner-mark.ok { background: var(--good); }

    .submit {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      border: 0;
      border-radius: 10px;
      font-size: 13.5px; font-weight: 700; letter-spacing: 0.04em;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(15, 23, 42, 0.25);
      transition: all .2s;
      font-family: inherit;
    }
    .submit:hover:not(:disabled) { transform: translateY(-1px); }
    .submit:disabled { opacity: 0.5; cursor: not-allowed; }

    .empty { padding: 60px 24px; text-align: center; color: var(--muted); }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.small { width: 14px; height: 14px; border-width: 2px; margin: 0; display: inline-block; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class OfficerReviewPage implements AfterViewInit, OnDestroy {
  @Input() id?: string;

  private readonly api = inject(PropertiesService);
  private readonly router = inject(Router);

  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  readonly property = signal<Property | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly decision = signal<ReviewDecision>('approve');
  note = '';
  decreeNo = '';

  private map?: L.Map;

  async ngOnInit(): Promise<void> {
    if (!this.id) { this.error.set('معرّف العقار غير صالح.'); this.loading.set(false); return; }
    try {
      this.property.set(await this.api.get(this.id));
    } catch (e) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر تحميل العقار.');
    } finally {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 0);
  }

  ngOnDestroy(): void { this.map?.remove(); }

  canSubmit(): boolean {
    if (this.decision() === 'approve') return true;
    return this.note.trim().length >= 3;
  }

  notePlaceholder(): string {
    return this.decision() === 'approve'
      ? 'ملاحظة اختيارية ترسل للمواطن مع السند.'
      : 'اشرح السبب بدقة (٣ أحرف على الأقل).';
  }

  async submit(): Promise<void> {
    const p = this.property();
    if (!p || !this.canSubmit()) return;
    this.busy.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    try {
      await this.api.review(p.id, {
        decision: this.decision(),
        note: this.note.trim() || undefined,
        approval_decree_no: this.decreeNo.trim() || undefined,
      });
      this.successMsg.set('تم تنفيذ القرار. جارٍ العودة للطابور…');
      setTimeout(() => this.router.navigate(['/app/queue']), 700);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.errorMsg.set(err.error?.error?.message_ar ?? 'تعذّر حفظ القرار.');
    } finally {
      this.busy.set(false);
    }
  }

  statusLabel(s: string): string { return PROPERTY_STATUS[s]?.ar ?? s; }
  statusColor(s: string): string { return PROPERTY_STATUS[s]?.color ?? '#94a3b8'; }
  typeLabel(t: string)  { return PROPERTY_TYPE[t] ?? t; }
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
    return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private initMap(): void {
    if (!this.mapEl || this.map) return;
    const p = this.property();
    if (!p) return;
    this.map = L.map(this.mapEl.nativeElement, { center: [27.0, 17.0], zoom: 6, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    const region = REGION_CENTROIDS[p.region_id ?? 10] ?? REGION_CENTROIDS[10];
    L.circleMarker([region.lat, region.lng], {
      radius: 10, color: '#0F172A', weight: 2, fillColor: '#F97316', fillOpacity: 1,
    }).addTo(this.map).bindPopup(p.property_code ?? 'العقار').openPopup();
    this.map.flyTo([region.lat, region.lng], 11, { duration: 0.6 });
  }
}

const REGION_CENTROIDS: Record<number, { lat: number; lng: number }> = {
  10: { lat: 32.8872, lng: 13.1913 }, 11: { lat: 32.0833, lng: 20.0667 },
  12: { lat: 32.7546, lng: 12.7236 }, 13: { lat: 32.5266, lng: 13.6212 },
  14: { lat: 32.3756, lng: 15.0935 }, 15: { lat: 32.4500, lng: 14.2500 },
  16: { lat: 30.7500, lng: 20.2500 }, 17: { lat: 32.7670, lng: 22.6359 },
  18: { lat: 32.7634, lng: 21.7081 }, 19: { lat: 32.0500, lng: 23.9700 },
  20: { lat: 31.2089, lng: 16.5879 }, 21: { lat: 30.8000, lng: 13.7000 },
  22: { lat: 30.1500, lng: 13.0500 }, 23: { lat: 31.7500, lng: 12.0500 },
  24: { lat: 26.3500, lng: 14.5500 }, 25: { lat: 24.9167, lng: 14.4500 },
  26: { lat: 27.0333, lng: 11.0167 }, 27: { lat: 27.0500, lng: 12.6500 },
  28: { lat: 24.1833, lng: 23.2667 }, 29: { lat: 25.9167, lng: 10.7333 },
  30: { lat: 28.0333, lng: 19.5500 }, 31: { lat: 30.6500, lng: 17.6833 },
};
