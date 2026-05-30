import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapService, type ParcelFeature } from '@core/map.service';
import { MAP_STATUS_ORDER, MAP_STATUS, mapStatusMeta } from '../../shared/map-status';
import { PROPERTY_TYPE, REGIONS } from '../../shared/status-pills';
import { ParcelMapComponent } from '../../shared/parcel-map.component';

// Public "الخريطة العقارية" — unauthenticated. Shows ONLY parcels whose deed
// has been issued, drawn as colour-coded polygons. Clicking a parcel reveals
// PUBLIC attributes only (code, area, type, status, last-update). Owner name
// and national number are never fetched nor shown — by design.
@Component({
  selector: 'app-public-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ParcelMapComponent],
  template: `
    <div class="shell">
      <header class="brand">
        <div class="band"></div>
        <div class="brand-row">
          <a class="back" href="/">← الرئيسية</a>
          <div class="title-wrap">
            <h1 class="title">الخريطة العقارية</h1>
            <p class="sub">العقارات المعتمدة في السجل العقاري الليبي — معلومات عامة فقط.</p>
          </div>
          <div class="brand-text">
            <span class="brand-ar">صَرح</span>
            <span class="brand-en">sarh.ly</span>
          </div>
        </div>
      </header>

      <div class="toolbar">
        <div class="legend">
          @for (s of statusOrder; track s) {
            <span class="leg" [title]="meta(s).hint">
              <span class="dot" [style.background]="meta(s).color"></span>{{ meta(s).ar }}
            </span>
          }
        </div>
        <div class="tools">
          <select class="region" [(ngModel)]="region" (ngModelChange)="onRegion()">
            <option [ngValue]="null">كل المناطق</option>
            @for (r of regionList; track r.id) {
              <option [ngValue]="r.id">{{ r.ar }}</option>
            }
          </select>
          <span class="count mono">{{ features().length }} عقار</span>
        </div>
      </div>

      <div class="body">
        <div class="map-wrap">
          <app-parcel-map
            [features]="features()"
            [selectedId]="selected()?.properties?.id ?? null"
            (parcelClick)="select($event)"
          ></app-parcel-map>

          @if (loading()) {
            <div class="overlay"><div class="spin"></div><p>جارٍ تحميل الخريطة…</p></div>
          } @else if (error()) {
            <div class="banner err">{{ error() }}</div>
          } @else if (features().length === 0) {
            <div class="banner">لا توجد عقارات معتمدة لعرضها بعد.</div>
          }
        </div>

        @if (selected(); as f) {
          <aside class="panel">
            <button class="x" (click)="select(null)" title="إغلاق">×</button>
            <div class="p-head">
              <span class="pill" [style.background]="meta(f.properties.map_status).color">
                {{ meta(f.properties.map_status).ar }}
              </span>
              <h2 class="mono">{{ f.properties.property_code ?? '—' }}</h2>
            </div>
            <dl>
              <dt>رقم العقار</dt><dd class="mono">{{ f.properties.property_code ?? '—' }}</dd>
              <dt>رقم القطعة</dt><dd class="mono" dir="ltr">{{ f.properties.parcel_number ?? '—' }}</dd>
              <dt>المساحة</dt><dd>{{ areaLabel(f.properties.area_sqm) }}</dd>
              <dt>نوع العقار</dt><dd>{{ typeLabel(f.properties.property_type) }}</dd>
              <dt>المنطقة</dt><dd>{{ regionLabel(f.properties.region_id) }}</dd>
              <dt>حالة العقار</dt>
              <dd>
                <span class="pill sm" [style.background]="meta(f.properties.map_status).color">
                  {{ meta(f.properties.map_status).ar }}
                </span>
              </dd>
              <dt>آخر تحديث</dt><dd>{{ dateLabel(f.properties.updated_at) }}</dd>
            </dl>
            <p class="note">{{ meta(f.properties.map_status).hint }}</p>
            @if (f.properties.property_code) {
              <a class="verify-link" [href]="'/verify/' + f.properties.property_code">
                التحقّق من السند ↗
              </a>
            }
            <p class="privacy">لا تُعرض بيانات المالك أو الرقم الوطني في الخريطة العامة.</p>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; height: 100dvh; background: var(--paper); }
    .shell { height: 100%; display: flex; flex-direction: column; }

    .brand { background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%); color: #FAFAF9; flex-shrink: 0; }
    .band { height: 4px; background: linear-gradient(90deg, var(--warn), var(--accent), var(--good)); }
    .brand-row { display: flex; align-items: center; gap: 16px; padding: 12px 24px; }
    .back { color: rgba(249,115,22,.85); text-decoration: none; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .back:hover { color: var(--accent); }
    .title-wrap { flex: 1; min-width: 0; }
    .title { font-size: 18px; margin: 0; color: #fff; }
    .sub { font-size: 11.5px; color: #cbd5c8; margin: 2px 0 0; }
    .brand-text { display: flex; flex-direction: column; text-align: end; }
    .brand-ar { font-size: 16px; font-weight: 700; color: var(--accent); }
    .brand-en { font-size: 9px; letter-spacing: .2em; color: rgba(249,115,22,.6); direction: ltr; }

    .toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      flex-wrap: wrap;
      padding: 10px 24px; background: var(--paper); border-bottom: 1px solid var(--rule);
      flex-shrink: 0;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; }
    .leg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink); }
    .dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
    .tools { display: flex; align-items: center; gap: 12px; }
    .region {
      padding: 7px 12px; font-family: inherit; font-size: 12.5px;
      background: #fff; border: 1px solid var(--rule); border-radius: 8px; color: var(--ink);
    }
    .count { font-size: 11.5px; color: var(--muted); }

    .body { flex: 1; min-height: 0; display: flex; position: relative; }
    .map-wrap { flex: 1; min-width: 0; position: relative; }

    .overlay {
      position: absolute; inset: 0; z-index: 600;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
      background: rgba(244,241,232,.7); color: var(--muted); font-size: 13px;
    }
    .spin { width: 28px; height: 28px; border: 3px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .banner {
      position: absolute; bottom: 18px; inset-inline-start: 50%; transform: translateX(50%);
      z-index: 600; padding: 9px 16px; border-radius: 8px; font-size: 12.5px;
      background: #fff; border: 1px solid var(--rule); color: var(--muted);
      box-shadow: 0 6px 16px rgba(0,0,0,.1);
    }
    .banner.err { background: #fff5f5; color: var(--warn); border-color: #fecaca; }

    .panel {
      width: 340px; flex-shrink: 0;
      background: var(--paper); border-inline-start: 1px solid var(--rule);
      padding: 20px 22px; overflow-y: auto; position: relative;
    }
    .x { position: absolute; top: 12px; inset-inline-end: 12px; width: 28px; height: 28px; border: 0; background: transparent; color: var(--muted); font-size: 20px; cursor: pointer; border-radius: 6px; line-height: 1; }
    .x:hover { background: var(--rule); color: var(--ink); }
    .p-head { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 16px; }
    .p-head h2 { font-size: 16px; margin: 0; color: var(--ink); }
    .pill { display: inline-block; padding: 3px 12px; border-radius: 99px; color: #fff; font-size: 11px; font-weight: 600; }
    .pill.sm { font-size: 10.5px; padding: 2px 10px; }

    dl { display: grid; grid-template-columns: 96px 1fr; gap: 10px 14px; margin: 0; }
    dt { font-size: 12px; color: var(--muted); align-self: center; }
    dd { font-size: 13px; font-weight: 600; color: var(--ink); margin: 0; align-self: center; word-break: break-word; }

    .note { margin: 16px 0 0; font-size: 11.5px; color: var(--muted); line-height: 1.7; background: rgba(15,23,42,.03); padding: 10px 12px; border-radius: 8px; }
    .verify-link {
      display: inline-block; margin-top: 14px; padding: 9px 16px;
      background: var(--primary); color: var(--accent); border-radius: 8px;
      font-size: 12.5px; font-weight: 700; text-decoration: none;
    }
    .verify-link:hover { background: var(--accent); color: var(--primary); }
    .privacy { margin: 16px 0 0; font-size: 10.5px; color: var(--muted); border-top: 1px solid var(--rule); padding-top: 12px; }

    @media (max-width: 760px) {
      .panel { position: absolute; inset-block: 0; inset-inline-end: 0; width: min(340px, 90%); box-shadow: -8px 0 28px rgba(0,0,0,.18); z-index: 700; }
    }
  `],
})
export class PublicMapPage implements OnInit {
  private readonly api = inject(MapService);

  readonly features = signal<ParcelFeature[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selected = signal<ParcelFeature | null>(null);
  region: number | null = null;

  readonly statusOrder = MAP_STATUS_ORDER;
  readonly regionList = Object.entries(REGIONS)
    .map(([id, ar]) => ({ id: Number(id), ar }))
    .sort((a, b) => a.ar.localeCompare(b.ar, 'ar'));

  async ngOnInit(): Promise<void> {
    await this.fetch();
  }

  async onRegion(): Promise<void> {
    this.selected.set(null);
    await this.fetch();
  }

  select(f: ParcelFeature | null): void {
    this.selected.set(f);
  }

  meta = mapStatusMeta;
  typeLabel(t: string): string { return PROPERTY_TYPE[t] ?? t; }
  regionLabel(id: number | null): string { return id == null ? '—' : (REGIONS[id] ?? `منطقة ${id}`); }
  areaLabel(a: number | null): string { return a == null ? '—' : `${Number(a).toLocaleString('ar-LY')} م²`; }
  dateLabel(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private async fetch(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.publicMap(this.region ?? undefined);
      this.features.set(res.features ?? []);
    } catch {
      this.error.set('تعذّر تحميل الخريطة العقارية. حاول مرة أخرى.');
      this.features.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
