import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { PropertiesService } from '@core/properties.service';
import { MapService, ParcelFeature } from '@core/map.service';
import type { Property, ReviewDecision } from '@sarh/shared-types';
import { PROPERTY_STATUS, PROPERTY_TYPE, REGIONS, REGION_CENTROIDS, LIBYA_CENTER } from '../../../shared/status-pills';
import { Dispute, DisputesService } from '../disputes.service';

interface DocVM {
  id: string;
  type: string;
  label: string;
  isImage: boolean;
  url?: string;
}

const DOC_LABELS: Record<string, string> = {
  site_photo: 'صورة الموقع',
  koreky_certificate: 'كروكي',
  survey_certificate: 'شهادة مساحة',
  sale_contract: 'عقد بيع',
  inheritance_deed: 'إفادة وراثة',
  court_order: 'قرار محكمة',
  boundary_map: 'خريطة الحدود',
  other: 'مستند آخر',
};

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
        <div class="dispute-bar">
          @if (activeDisputes().length) {
            <div class="dispute-banner">
              <span class="dispute-mark">⚠</span>
              <div class="dispute-text">
                <strong>هذا العقار عليه حجز/نزاع قانوني قائم — لا يجوز بيعه أو سكّ رخصته.</strong>
                @for (x of activeDisputes(); track x.id) {
                  <p>• {{ x.dispute_type_ar }} — {{ x.issuing_authority }}{{ x.case_number ? ' (قضية ' + x.case_number + ')' : '' }}</p>
                }
              </div>
            </div>
          }
          <a class="manage-link" [routerLink]="['/app/disputes', p.id]">
            إدارة الحجوزات والنزاعات ←
          </a>
        </div>

        @if (p.has_location_conflict) {
          <div class="conflict-banner">
            <span class="conflict-mark">⚠</span>
            <div class="conflict-text">
              <strong>تضارب في الموقع — تتداخل حدود هذه الأرض مع قطعة مسجّلة أخرى (احتمال بيع الأرض لأكثر من شخص).</strong>
              @for (c of conflicts(); track c.property_id) {
                <p>• {{ c.property_code ?? (c.parcel_number ? 'قطعة ' + c.parcel_number : 'قطعة غير مرقّمة') }} — نسبة التداخل ≈ {{ c.overlap_pct != null ? (c.overlap_pct | number: '1.0-1') + '%' : '—' }}</p>
              }
              <p class="conflict-hint">القطع المتداخلة مميّزة باللون الأحمر على الخريطة. راجع المخطّط قبل الاعتماد.</p>
            </div>
          </div>
        }

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
              <dt>المساحة المقيسة</dt><dd dir="ltr" class="mono">{{ areaLabel(p.area_sqm) }}</dd>
              @if (p.documented_area_sqm != null) {
                <dt>المساحة حسب الأوراق</dt>
                <dd dir="ltr" class="mono">
                  {{ areaLabel(p.documented_area_sqm) }}
                  @if (p.documented_area_diff_pct != null) {
                    <span class="diff-chip" [class.warn]="p.documented_area_diff_pct > 10">
                      فرق {{ p.documented_area_diff_pct | number: '1.0-1' }}%
                    </span>
                  }
                </dd>
              }
              <dt>المنطقة</dt><dd>{{ regionLabel(p.region_id) }}</dd>
              <dt>العنوان</dt><dd>{{ p.address_ar ?? '—' }}</dd>
              <dt>رقم القطعة</dt><dd dir="ltr" class="mono">{{ p.parcel_number ?? '—' }}</dd>
              <dt>رقم المخطط</dt><dd dir="ltr" class="mono">{{ p.plan_number ?? '—' }}</dd>
              <dt>رقم البلوك</dt><dd dir="ltr" class="mono">{{ p.block_number ?? '—' }}</dd>
              <dt>تاريخ الإرسال</dt><dd dir="ltr" class="mono small">{{ dateLabel(p.submitted_at) }}</dd>
              @if (p.reviewed_at) {
                <dt>آخر مراجعة</dt><dd dir="ltr" class="mono small">{{ dateLabel(p.reviewed_at) }}</dd>
              }
            </dl>
          </article>

          <!-- Map -->
          <article class="card map-card">
            <h2>حدود الأرض</h2>
            <div #mapEl class="map"></div>
            <p class="hint">
              @if (p.boundary_polygon) {
                المضلّع المرسوم من قبل المواطن (المساحة المحسوبة منه: <span class="mono" dir="ltr">{{ areaLabel(p.area_sqm) }}</span>).
              } @else {
                لم تُرفق حدود مضلّع لهذا الطلب — يمكنك رسمها الآن قبل الاعتماد.
              }
            </p>
            <a class="edit-boundary"
               [routerLink]="['/app/properties', p.id, 'boundary']"
               [queryParams]="{ returnTo: '/app/review/' + p.id }">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
              {{ p.boundary_polygon ? 'تعديل حدود الأرض' : 'رسم حدود الأرض' }}
            </a>
          </article>

          <!-- Documents -->
          <article class="card docs-card">
            <h2>المرفقات (صور العقار + الكروكي)</h2>
            @if (docsLoading()) {
              <div class="docs-loading"><span class="spin small"></span> جارٍ تحميل المرفقات…</div>
            } @else if (docs().length === 0) {
              <p class="hint">لا توجد مرفقات لهذا الطلب.</p>
            } @else {
              <div class="docs-grid">
                @for (d of docs(); track d.id) {
                  <figure class="doc">
                    @if (d.isImage && d.url) {
                      <a [href]="d.url" target="_blank" rel="noopener">
                        <img [src]="d.url" [alt]="d.label" loading="lazy" />
                      </a>
                    } @else {
                      <a class="doc-file" [href]="d.url" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>فتح الملف</span>
                      </a>
                    }
                    <figcaption [class.koreky]="d.type === 'koreky_certificate'">{{ d.label }}</figcaption>
                  </figure>
                }
              </div>
            }
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
      grid-template-areas: "hero map" "hero decision" "docs docs";
      gap: 16px;
    }
    @media (max-width: 1024px) { .grid { grid-template-columns: 1fr; grid-template-areas: "hero" "map" "docs" "decision"; } }
    .hero-card { grid-area: hero; }
    .map-card { grid-area: map; }
    .decision-card { grid-area: decision; }
    .docs-card { grid-area: docs; }

    .docs-loading { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
    .docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .doc { margin: 0; border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; background: #fff; }
    .doc img { display: block; width: 100%; height: 120px; object-fit: cover; cursor: zoom-in; }
    .doc-file {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
      height: 120px; color: var(--muted); text-decoration: none; font-size: 12px;
    }
    .doc-file:hover { color: var(--accent); }
    .doc figcaption { padding: 7px 10px; font-size: 11.5px; font-weight: 600; color: var(--ink); border-top: 1px solid var(--rule); }
    .doc figcaption.koreky { color: var(--accent); }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card h2 { font-size: 14px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); color: var(--ink); }

    .hero-top h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .hero-sub { font-size: 12px; color: var(--muted); margin-bottom: 16px; }

    dl { margin: 0; display: grid; grid-template-columns: 130px 1fr; gap: 10px 14px; font-size: 13.5px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); }
    .small { font-size: 12px; }
    .diff-chip { display: inline-block; margin-inline-start: 8px; padding: 2px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 700; background: rgba(8,145,178,0.12); color: var(--good); }
    .diff-chip.warn { background: #fff2f3; color: var(--warn); }

    .dispute-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .dispute-banner { display: flex; gap: 12px; align-items: flex-start; flex: 1; min-width: 280px; padding: 12px 16px; background: rgba(220,38,38,0.07); border: 1.5px solid rgba(220,38,38,0.35); border-radius: 10px; }
    .dispute-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 15px; font-weight: 700; flex-shrink: 0; }
    .dispute-text strong { display: block; font-size: 12.5px; color: var(--warn); margin-bottom: 4px; }
    .dispute-text p { margin: 2px 0; font-size: 11.5px; color: var(--ink); }
    .manage-link { align-self: center; padding: 8px 14px; border: 1px solid var(--rule); border-radius: 99px; background: var(--paper); color: var(--ink); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: all .15s; }
    .manage-link:hover { border-color: var(--accent); color: var(--accent); }

    .conflict-banner { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; padding: 12px 16px; background: rgba(220,38,38,0.06); border: 1.5px solid rgba(220,38,38,0.4); border-radius: 10px; }
    .conflict-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #DC2626; color: #fff; font-size: 15px; font-weight: 700; flex-shrink: 0; }
    .conflict-text strong { display: block; font-size: 12.5px; color: #b91c1c; margin-bottom: 4px; }
    .conflict-text p { margin: 2px 0; font-size: 11.5px; color: var(--ink); }
    .conflict-text .conflict-hint { color: var(--muted); margin-top: 6px; }

    .map { width: 100%; height: 280px; border-radius: 10px; overflow: hidden; border: 1px solid var(--rule); margin-bottom: 8px; }
    .hint { font-size: 11.5px; color: var(--muted); margin: 0; }
    .edit-boundary {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 12px;
      padding: 7px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 99px;
      color: var(--ink);
      font-size: 12px; font-weight: 600;
      text-decoration: none;
      transition: all .15s;
    }
    .edit-boundary:hover { border-color: var(--accent); color: var(--accent); }

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
export class OfficerReviewPage implements OnDestroy {
  @Input() id?: string;

  private readonly api = inject(PropertiesService);
  private readonly mapApi = inject(MapService);
  private readonly disputesApi = inject(DisputesService);
  private readonly router = inject(Router);

  // The map div sits inside an @if that only renders once the property has
  // loaded, so a plain ViewChild + ngAfterViewInit queries it while it is
  // still absent (loading state) and the map never boots. A setter boots the
  // map the moment the element appears — property() is already set by then,
  // since the element only renders in the property() branch.
  //
  // The boot is deferred one macrotask: the setter fires synchronously during
  // change detection, the same tick the @if reveals the grid cell, so the
  // browser has not laid it out yet. Booting Leaflet then makes it measure a
  // 0-size container and fitBounds can't zoom to the parcel — the map stays at
  // world zoom and a small polygon looks like it's "not there". A setTimeout(0)
  // lets layout settle first (see initMap's invalidateSize()).
  private mapEl?: ElementRef<HTMLDivElement>;
  @ViewChild('mapEl') set mapElRef(el: ElementRef<HTMLDivElement> | undefined) {
    this.mapEl = el;
    if (el) setTimeout(() => this.initMap(), 0);
  }

  readonly property = signal<Property | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly decision = signal<ReviewDecision>('approve');
  note = '';
  decreeNo = '';

  readonly disputes = signal<Dispute[]>([]);
  readonly activeDisputes = computed(() => this.disputes().filter((d) => d.status === 'active'));

  // Neighbouring parcels drawn under the parcel-under-review so the reviewer can
  // eyeball overlaps ("شوف كل البوليقونات"). The ones this parcel actually
  // overlaps (server-computed) are highlighted red.
  readonly neighbors = signal<ParcelFeature[]>([]);
  readonly conflicts = computed(() => this.property()?.location_conflicts ?? []);
  private neighborLayer?: L.LayerGroup;

  readonly docs = signal<DocVM[]>([]);
  readonly docsLoading = signal(false);
  private objectUrls: string[] = [];

  private map?: L.Map;

  async ngOnInit(): Promise<void> {
    if (!this.id) { this.error.set('معرّف العقار غير صالح.'); this.loading.set(false); return; }
    try {
      const prop = await this.api.get(this.id);
      this.property.set(prop);
      void this.loadDocuments(this.id);
      this.disputesApi.list(this.id).then((d) => this.disputes.set(d)).catch(() => { /* non-fatal */ });
      // Pull every parcel in the region so the reviewer sees the surroundings
      // and any overlap. Non-fatal: the single parcel still renders without it.
      this.mapApi.officerMap(prop.region_id ?? undefined)
        .then((fc) => { this.neighbors.set(fc.features ?? []); this.renderNeighbors(); })
        .catch(() => { /* keep the lone parcel */ });
    } catch (e) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر تحميل العقار.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
  }

  // Fetch each attachment as a blob (the auth interceptor adds the JWT) and
  // expose it as an object URL so <img>/<a> can render it inline.
  private async loadDocuments(id: string): Promise<void> {
    this.docsLoading.set(true);
    try {
      const items = await this.api.listDocuments(id);
      const vms: DocVM[] = [];
      for (const it of items) {
        const isImage = (it.mime_type ?? '').startsWith('image/');
        let url: string | undefined;
        try {
          const blob = await this.api.documentBlob(id, it.id);
          url = URL.createObjectURL(blob);
          this.objectUrls.push(url);
        } catch { /* leave url undefined — still show the caption */ }
        vms.push({
          id: it.id,
          type: it.document_type,
          label: DOC_LABELS[it.document_type] ?? it.document_type,
          isImage,
          url,
        });
      }
      this.docs.set(vms);
    } catch {
      this.docs.set([]);
    } finally {
      this.docsLoading.set(false);
    }
  }

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

  // Paints the other parcels in the region as context. The ones THIS parcel
  // overlaps (server-computed location_conflicts) are red; the rest are a faint
  // grey backdrop. Re-runnable: clears its own layer first so it can fire from
  // both initMap (map ready first) and the officerMap fetch (neighbors first).
  private renderNeighbors(): void {
    if (!this.map) return;
    const me = this.property();
    if (!me) return;

    this.neighborLayer?.remove();
    this.neighborLayer = L.layerGroup().addTo(this.map);

    const conflictIds = new Set(this.conflicts().map((c) => c.property_id));

    for (const f of this.neighbors()) {
      if (f.properties.id === me.id) continue; // skip the parcel under review
      const ring = f.geometry?.coordinates?.[0];
      if (!ring || ring.length < 3) continue;
      const latlngs = ring.map(([lng, lat]) => [lat, lng] as [number, number]);
      const isConflict = conflictIds.has(f.properties.id) || f.properties.has_location_conflict;
      L.polygon(latlngs, {
        color: isConflict ? '#DC2626' : '#94a3b8',
        weight: isConflict ? 2.5 : 1,
        dashArray: isConflict ? '6 5' : undefined,
        fillColor: isConflict ? '#DC2626' : '#94a3b8',
        fillOpacity: isConflict ? 0.22 : 0.05,
      })
        .addTo(this.neighborLayer)
        .bindPopup(
          `<div style="direction:rtl;text-align:right;font-family:'IBM Plex Sans Arabic',system-ui;font-size:12px;">
             <b>${f.properties.property_code ?? f.properties.parcel_number ?? 'قطعة'}</b>
             ${isConflict ? '<br><span style="color:#b91c1c;font-weight:700;">⚠ تتداخل مع الأرض قيد المراجعة</span>' : ''}
           </div>`,
        );
    }
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

    // Make sure Leaflet has the container's real (laid-out) size before we
    // fit/zoom — the boot is deferred a tick precisely so this reads non-zero.
    this.map.invalidateSize();

    // Draw neighbouring parcels (if already fetched) UNDER the parcel-under-review.
    this.renderNeighbors();

    // Draw the real parcel boundary when the API returned it; otherwise fall
    // back to a marker at the region centroid.
    const ring = p.boundary_polygon?.coordinates?.[0];
    if (ring && ring.length >= 3) {
      const latlngs = ring.map((pt) => [pt[1], pt[0]] as [number, number]);
      const poly = L.polygon(latlngs, {
        color: '#0891B2', weight: 2, fillColor: '#0891B2', fillOpacity: 0.18,
      }).addTo(this.map);
      poly.bringToFront();
      latlngs.forEach((ll, i) => {
        L.circleMarker(ll, { radius: 5, color: '#0F172A', weight: 2, fillColor: '#F97316', fillOpacity: 1 })
          .addTo(this.map!)
          .bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'pt-tip' });
      });
      this.map.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 18 });
      return;
    }

    const known = p.region_id != null ? REGION_CENTROIDS[p.region_id] : undefined;
    const region = known ?? LIBYA_CENTER;
    L.circleMarker([region.lat, region.lng], {
      radius: 10, color: '#0F172A', weight: 2, fillColor: '#F97316', fillOpacity: 1,
    }).addTo(this.map).bindPopup(p.property_code ?? 'العقار').openPopup();
    this.map.flyTo([region.lat, region.lng], known ? 11 : 6, { duration: 0.6 });
  }
}
