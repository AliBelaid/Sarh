import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import * as L from 'leaflet';
import { API_BASE } from '@core/api-config';
import { UploadsService, UploadResult } from '@core/uploads.service';
import { REGIONS } from '../../../shared/status-pills';

// A file already uploaded to storage, ready to attach to the submission.
interface UploadedDoc {
  name: string;
  storagePath: string;
  mimeType: string;
  size: number;
  sha256: string;
}

type PropertyType =
  | 'residential' | 'agricultural' | 'commercial' | 'governmental' | 'industrial' | 'mixed';

interface SubmitResponse {
  property: { id: string; property_code: string | null; status: string };
  registration_request: { id: string; request_no: string };
  validation: { computed_area_sqm: number; area_diff_pct: number | null };
}

@Component({
  selector: 'app-new-property',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <h1 class="display">تسجيل عقار جديد</h1>
        <p class="sub">أدخل بيانات العقار وارسم حدوده على الخريطة، ثم أرسل الطلب للمراجعة.</p>
      </header>

      <form class="layout" (ngSubmit)="submit()">
        <!-- Form -->
        <div class="form">
          <div class="card">
            <h2>المعلومات الأساسية</h2>

            <div class="field">
              <label for="ptype">نوع العقار <span class="req">*</span></label>
              <select id="ptype" [(ngModel)]="propertyType" name="propertyType" required [disabled]="busy()">
                <option value="residential">سكني</option>
                <option value="agricultural">زراعي</option>
                <option value="commercial">تجاري</option>
                <option value="governmental">حكومي</option>
                <option value="industrial">صناعي</option>
                <option value="mixed">مختلط</option>
              </select>
            </div>

            <div class="field">
              <label for="region">المنطقة <span class="req">*</span></label>
              <select id="region" [(ngModel)]="regionId" name="regionId" required [disabled]="busy()">
                <option [ngValue]="null" disabled>اختر منطقة…</option>
                @for (r of regionEntries; track r[0]) {
                  <option [ngValue]="r[0]">{{ r[1] }}</option>
                }
              </select>
            </div>

            <div class="field">
              <label for="address">العنوان</label>
              <textarea id="address" rows="2" [(ngModel)]="addressAr" name="addressAr"
                        placeholder="مثال: حي الأندلس، شارع عمر المختار، مبنى رقم ٥" [disabled]="busy()"></textarea>
            </div>
          </div>

          <div class="card">
            <h2>أرقام السجل</h2>
            <div class="grid-3">
              <div class="field">
                <label for="parcel">رقم القطعة</label>
                <input id="parcel" [(ngModel)]="parcelNumber" name="parcelNumber" dir="ltr" [disabled]="busy()" />
              </div>
              <div class="field">
                <label for="plan">رقم المخطط</label>
                <input id="plan" [(ngModel)]="planNumber" name="planNumber" dir="ltr" [disabled]="busy()" />
              </div>
              <div class="field">
                <label for="block">رقم البلوك</label>
                <input id="block" [(ngModel)]="blockNumber" name="blockNumber" dir="ltr" [disabled]="busy()" />
              </div>
            </div>
          </div>

          <div class="card">
            <h2>المساحة</h2>
            <p class="sub-hint">تُحسب المساحة تلقائياً من حدود العقار التي ترسمها على الخريطة — لا حاجة لإدخال طول أو عرض، فالعقارات نادراً ما تكون مستطيلة منتظمة.</p>
            <div class="area-result" [class.ok]="computedArea() != null">
              @if (computedArea() != null) {
                <span class="ok-mark">✓</span>
                المساحة المحسوبة من الحدود: <span class="mono">{{ computedArea() | number: '1.0-2' }} م²</span>
              } @else {
                <span class="muted">ارسم ٣ نقاط على الأقل على الخريطة لحساب المساحة.</span>
              }
            </div>
          </div>

          <div class="card">
            <h2>المرفقات</h2>
            <p class="sub-hint">صور العقار والكروكي إلزامية. الكروكي رسم تخطيطي لحدود الأرض (صورة أو PDF).</p>

            <!-- Property photos -->
            <div class="field">
              <label>صور العقار <span class="req">*</span> <span class="muted">(صورة واحدة على الأقل)</span></label>
              <label class="drop" [class.disabled]="busy()">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
                       (change)="onPhotosSelected($event)" [disabled]="busy()" />
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                اختر صوراً للعقار
              </label>
              @if (photos().length > 0) {
                <ul class="file-list">
                  @for (p of photos(); track p.storagePath) {
                    <li>
                      <span class="fl-name">{{ p.name }}</span>
                      <span class="fl-size">{{ p.size / 1024 | number: '1.0-0' }} ك.ب</span>
                      <button type="button" class="fl-del" (click)="removePhoto(p)" [disabled]="busy()" aria-label="حذف">✕</button>
                    </li>
                  }
                </ul>
              }
            </div>

            <!-- Koreky / croquis -->
            <div class="field">
              <label>الكروكي <span class="req">*</span> <span class="muted">(صورة أو PDF)</span></label>
              @if (croquis() == null) {
                <label class="drop" [class.disabled]="busy()">
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden
                         (change)="onCroquisSelected($event)" [disabled]="busy()" />
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                  ارفع الكروكي
                </label>
              } @else {
                <ul class="file-list">
                  <li>
                    <span class="fl-name">{{ croquis()!.name }}</span>
                    <span class="fl-size">{{ croquis()!.size / 1024 | number: '1.0-0' }} ك.ب</span>
                    <button type="button" class="fl-del" (click)="removeCroquis()" [disabled]="busy()" aria-label="حذف">✕</button>
                  </li>
                </ul>
              }
            </div>

            @if (uploading()) {
              <div class="area-result"><span class="spin"></span> جارٍ رفع الملف…</div>
            }
            @if (uploadError()) {
              <div class="banner err"><span class="banner-mark">!</span>{{ uploadError() }}</div>
            }
          </div>

          <div class="actions">
            @if (errorMsg()) {
              <div class="banner err">
                <span class="banner-mark">!</span>
                {{ errorMsg() }}
              </div>
            }
            <button type="submit" class="btn-primary" [disabled]="!canSubmit() || busy()">
              @if (busy()) {
                <span class="spin"></span>
                <span>جارٍ الإرسال…</span>
              } @else {
                <span>إرسال للمراجعة</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              }
            </button>
          </div>
        </div>

        <!-- Map -->
        <aside class="map-side">
          <div class="card map-card">
            <header class="map-head">
              <div>
                <h2>حدود العقار</h2>
                <p class="hint">اضغط على الخريطة لإضافة نقاط (٣ على الأقل) لرسم المضلع.</p>
              </div>
              <div class="map-actions">
                <button type="button" class="mini-btn" (click)="undoPoint()" [disabled]="points().length === 0 || busy()">تراجع</button>
                <button type="button" class="mini-btn warn" (click)="clearPoints()" [disabled]="points().length === 0 || busy()">مسح</button>
              </div>
            </header>
            <div #mapEl class="map"></div>
            <div class="counter">
              <span class="dot" [class.ok]="points().length >= 3"></span>
              {{ points().length }} نقطة
              @if (points().length >= 3) {
                <span class="ok-text">— جاهز للإرسال</span>
              } @else {
                <span class="muted">— يلزم {{ 3 - points().length }} نقطة بعد</span>
              }
            </div>
          </div>
        </aside>
      </form>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 720px; line-height: 1.6; }

    .layout {
      display: grid; grid-template-columns: 1.05fr 1fr; gap: 20px;
      align-items: flex-start;
    }

    .form { display: flex; flex-direction: column; gap: 16px; }
    .card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 20px 22px;
    }
    .card h2 { font-size: 14px; margin: 0 0 14px; color: var(--ink); padding-bottom: 10px; border-bottom: 1px solid var(--rule); }

    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    .field label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .req { color: var(--warn); }
    .field input, .field select, .field textarea {
      padding: 9px 12px;
      background: #fff;
      border: 1.5px solid var(--rule);
      border-radius: 8px;
      font-size: 13.5px;
      color: var(--ink);
      font-family: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .field textarea { resize: vertical; min-height: 60px; }
    .field input:focus, .field select:focus, .field textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12);
    }
    .field input:disabled, .field select:disabled, .field textarea:disabled { background: #f4f1e8; cursor: not-allowed; }
    .hint { font-size: 11.5px; color: var(--muted); margin: 0; }
    .sub-hint { font-size: 12px; color: var(--muted); margin: -8px 0 14px; line-height: 1.55; }
    /* Uploads ─────────────────────────────────────── */
    .drop {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 16px;
      background: #fff;
      border: 1.5px dashed var(--rule);
      border-radius: 8px;
      font-size: 12.5px; font-weight: 600;
      color: var(--ink);
      cursor: pointer;
      transition: border-color .15s, background .15s;
      align-self: flex-start;
    }
    .drop:hover:not(.disabled) { border-color: var(--accent); background: var(--paper); }
    .drop.disabled { opacity: 0.5; cursor: not-allowed; }
    .drop svg { color: var(--accent); }
    .file-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .file-list li {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 12px;
      background: #f4f1e8;
      border: 1px solid var(--rule);
      border-radius: 7px;
      font-size: 12px;
    }
    .fl-name { flex: 1; color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fl-size { color: var(--muted); font-family: 'Courier New', monospace; flex-shrink: 0; }
    .fl-del {
      flex-shrink: 0; width: 22px; height: 22px; display: grid; place-items: center;
      border: 0; border-radius: 5px; background: transparent; color: var(--muted);
      cursor: pointer; font-size: 13px; font-weight: 700;
    }
    .fl-del:hover:not(:disabled) { background: #fff2f3; color: var(--warn); }
    .fl-del:disabled { opacity: 0.4; cursor: not-allowed; }
    .field label .muted { color: var(--muted); font-weight: 500; }

    .area-result {
      padding: 10px 14px; border-radius: 8px;
      background: #f4f1e8; border: 1px dashed var(--rule);
      font-size: 12.5px; color: var(--muted);
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .area-result.ok { background: rgba(8,145,178,0.08); border-style: solid; border-color: rgba(8,145,178,0.3); color: var(--good); }
    .area-result .ok-mark { font-weight: 800; color: var(--good); }
    .area-result .mono { font-family: 'Courier New', monospace; font-weight: 700; color: var(--ink); }
    .area-result .muted { color: var(--muted); font-weight: 500; }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 540px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

    .actions { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }

    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 11px 22px;
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
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary svg { transition: transform .2s; }
    [dir='rtl'] .btn-primary svg { transform: scaleX(-1); }
    [dir='rtl'] .btn-primary:hover:not(:disabled) svg { transform: scaleX(-1) translateX(-3px); }

    /* Map ─────────────────────────────────────────── */
    .map-side { position: sticky; top: 20px; }
    .map-card { padding: 14px 14px 0; }
    .map-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 12px; margin-bottom: 10px;
    }
    .map-head h2 { font-size: 14px; margin: 0 0 2px; padding: 0; border: 0; color: var(--ink); }
    .map-head .hint { font-size: 11.5px; color: var(--muted); margin: 0; max-width: 240px; line-height: 1.55; }
    .map-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .mini-btn {
      padding: 5px 10px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 6px;
      font-size: 11.5px; font-weight: 600;
      color: var(--ink);
      cursor: pointer;
      font-family: inherit;
    }
    .mini-btn:hover:not(:disabled) { background: var(--paper); border-color: var(--accent); }
    .mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .mini-btn.warn:hover:not(:disabled) { background: #fff2f3; border-color: var(--warn); color: var(--warn); }

    .map {
      width: 100%;
      height: 460px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--rule);
    }
    .counter {
      padding: 10px 6px 14px;
      font-size: 12px;
      color: var(--ink);
      display: flex; align-items: center; gap: 8px;
    }
    .counter .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--rule);
      transition: background .2s;
    }
    .counter .dot.ok { background: var(--good); }
    .counter .ok-text { color: var(--good); font-weight: 600; }
    .counter .muted { color: var(--muted); }

    .banner { padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }
    .spin { width: 16px; height: 16px; border: 2.5px solid rgba(249, 115, 22, 0.3); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 1024px) { .layout { grid-template-columns: 1fr; } .map-side { position: static; } }
  `],
})
export class NewPropertyPage implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly uploads = inject(UploadsService);

  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  // Form state
  propertyType: PropertyType = 'residential';
  regionId: number | null = null;
  addressAr = '';
  parcelNumber = '';
  planNumber = '';
  blockNumber = '';

  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly points = signal<L.LatLng[]>([]);

  // Attachments — both mandatory before submit.
  readonly photos = signal<UploadedDoc[]>([]);
  readonly croquis = signal<UploadedDoc | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);

  readonly regionEntries = Object.entries(REGIONS)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => a[0] - b[0]);

  // Plain method, NOT a computed() signal. propertyType/regionId are
  // non-signal class fields (bound via [(ngModel)]), and `computed` only
  // tracks signals it actually reads. The first call short-circuits at
  // `!!this.regionId` (null on load) before reaching `this.points()`, so the
  // computed records zero dependencies and stays frozen at false — leaving
  // submit permanently disabled even after the user fills every field. A
  // plain method re-evaluates on every change-detection tick.
  canSubmit(): boolean {
    return !!this.propertyType
      && !!this.regionId
      && this.points().length >= 3
      && this.computedArea() != null
      && this.photos().length >= 1
      && this.croquis() != null
      && !this.uploading();
  }

  // Authoritative area is derived from the drawn polygon (the API re-computes
  // it server-side via geography.STArea). No length × width entry.
  readonly computedArea = computed(() => {
    const pts = this.points();
    if (pts.length < 3) return null;
    return this.geographicArea(pts);
  });

  // ----- Uploads -----
  async onPhotosSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow re-selecting the same file later
    for (const file of files) {
      const doc = await this.uploadOne(file);
      if (doc) this.photos.update((list) => [...list, doc]);
    }
  }

  async onCroquisSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const doc = await this.uploadOne(file);
    if (doc) this.croquis.set(doc);
  }

  removePhoto(doc: UploadedDoc): void {
    this.photos.update((list) => list.filter((p) => p !== doc));
  }

  removeCroquis(): void {
    this.croquis.set(null);
  }

  private async uploadOne(file: File): Promise<UploadedDoc | null> {
    this.uploadError.set(null);
    this.uploading.set(true);
    try {
      const r: UploadResult = await this.uploads.uploadPropertyDocument(file);
      return {
        name: file.name,
        storagePath: r.path,
        mimeType: r.mime_type,
        size: r.size,
        sha256: r.sha256,
      };
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.uploadError.set(err.error?.error?.message_ar ?? `تعذّر رفع "${file.name}".`);
      return null;
    } finally {
      this.uploading.set(false);
    }
  }

  private map?: L.Map;
  private polygonLayer?: L.Polygon;
  private markerLayer = L.layerGroup();

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, {
      center: [32.8872, 13.1913], // Tripoli
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.markerLayer.addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.addPoint(e.latlng));
  }

  ngOnDestroy(): void { this.map?.remove(); }

  addPoint(latlng: L.LatLng): void {
    if (this.busy()) return;
    const next = [...this.points(), latlng];
    this.points.set(next);
    this.redraw();
  }

  undoPoint(): void {
    const next = this.points().slice(0, -1);
    this.points.set(next);
    this.redraw();
  }

  clearPoints(): void {
    this.points.set([]);
    this.redraw();
  }

  async submit(): Promise<void> {
    this.errorMsg.set(null);
    if (!this.canSubmit()) {
      this.errorMsg.set('املأ الحقول المطلوبة، ارسم ٣ نقاط على الأقل، وأرفق صور العقار والكروكي.');
      return;
    }
    this.busy.set(true);
    try {
      const ring = [...this.points(), this.points()[0]]
        .map((p) => [p.lng, p.lat]);
      const polygon = { type: 'Polygon', coordinates: [ring] };
      const documents = [
        ...this.photos().map((p) => this.toDocBody('site_photo', p)),
        this.toDocBody('koreky_certificate', this.croquis()!),
      ];
      const body = {
        property_type: this.propertyType,
        region_id: this.regionId,
        address_ar: this.addressAr || undefined,
        parcel_number: this.parcelNumber || undefined,
        plan_number: this.planNumber || undefined,
        block_number: this.blockNumber || undefined,
        boundary_polygon: polygon,
        // Area is the polygon's true area — never length × width.
        area_sqm: this.computedArea(),
        documents,
      };
      await firstValueFrom(this.http.post<SubmitResponse>(`${API_BASE}/properties`, body));
      this.router.navigateByUrl('/app/my/properties');
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.errorMsg.set(err.error?.error?.message_ar ?? 'تعذّر إرسال طلب التسجيل. حاول مجدداً.');
    } finally {
      this.busy.set(false);
    }
  }

  private toDocBody(documentType: 'site_photo' | 'koreky_certificate', doc: UploadedDoc) {
    return {
      document_type: documentType,
      storage_path: doc.storagePath,
      mime_type: doc.mimeType,
      file_size_bytes: doc.size,
      file_hash: doc.sha256,
    };
  }

  private redraw(): void {
    if (!this.map) return;
    this.markerLayer.clearLayers();
    if (this.polygonLayer) {
      this.map.removeLayer(this.polygonLayer);
      this.polygonLayer = undefined;
    }
    const pts = this.points();
    pts.forEach((p, i) => {
      const m = L.circleMarker(p, {
        radius: 7,
        color: '#0F172A',
        weight: 2,
        fillColor: '#F97316',
        fillOpacity: 1,
      });
      m.bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'pt-tip' });
      this.markerLayer.addLayer(m);
    });
    if (pts.length >= 3) {
      this.polygonLayer = L.polygon(pts, {
        color: '#0891B2', weight: 2, fillColor: '#0891B2', fillOpacity: 0.18,
      }).addTo(this.map);
    } else if (pts.length === 2) {
      this.markerLayer.addLayer(L.polyline(pts, { color: '#F97316', weight: 2, dashArray: '6 6' }));
    }
  }

  // Spherical-excess area in m². Good enough for a UX hint; the API
  // re-computes server-side from SQL Server geography and returns the
  // authoritative value.
  private geographicArea(latlngs: L.LatLng[]): number {
    const R = 6378137;
    let area = 0;
    const n = latlngs.length;
    for (let i = 0; i < n; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % n];
      area +=
        ((p2.lng - p1.lng) * Math.PI) / 180 *
        (2 + Math.sin((p1.lat * Math.PI) / 180) + Math.sin((p2.lat * Math.PI) / 180));
    }
    return Math.abs((area * R * R) / 2);
  }
}
