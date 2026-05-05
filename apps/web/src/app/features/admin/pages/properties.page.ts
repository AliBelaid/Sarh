import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { PropertiesService } from '@core/properties.service';
import type { Property, PropertyStatus } from '@sarh/shared-types';

// Approximate centroids for Libyan governorates (sha'biyat). region_id values
// match infra/mssql/migrations/016_seed_regions.sql. Used for map markers when
// the API doesn't yet return polygon geometry.
const REGION_CENTROIDS: Record<number, { lat: number; lng: number; ar: string }> = {
  10: { lat: 32.8872, lng: 13.1913, ar: 'طرابلس' },
  11: { lat: 32.0833, lng: 20.0667, ar: 'بنغازي' },
  12: { lat: 32.7546, lng: 12.7236, ar: 'الزاوية' },
  13: { lat: 32.5266, lng: 13.6212, ar: 'تاجوراء' },
  14: { lat: 32.3756, lng: 15.0935, ar: 'مصراتة' },
  15: { lat: 32.4500, lng: 14.2500, ar: 'الخمس' },
  16: { lat: 30.7500, lng: 20.2500, ar: 'الواحات' },
  17: { lat: 32.7670, lng: 22.6359, ar: 'المرج' },
  18: { lat: 32.7634, lng: 21.7081, ar: 'الجبل الأخضر' },
  19: { lat: 32.0500, lng: 23.9700, ar: 'درنة' },
  20: { lat: 31.2089, lng: 16.5879, ar: 'سرت' },
  21: { lat: 30.8000, lng: 13.7000, ar: 'الجفارة' },
  22: { lat: 30.1500, lng: 13.0500, ar: 'الجبل الغربي' },
  23: { lat: 31.7500, lng: 12.0500, ar: 'النقاط الخمس' },
  24: { lat: 26.3500, lng: 14.5500, ar: 'سبها' },
  25: { lat: 24.9167, lng: 14.4500, ar: 'مرزق' },
  26: { lat: 27.0333, lng: 11.0167, ar: 'وادي الشاطئ' },
  27: { lat: 27.0500, lng: 12.6500, ar: 'وادي الحياة' },
  28: { lat: 24.1833, lng: 23.2667, ar: 'الكفرة' },
  29: { lat: 25.9167, lng: 10.7333, ar: 'غات' },
  30: { lat: 28.0333, lng: 19.5500, ar: 'الجفرة' },
  31: { lat: 30.6500, lng: 17.6833, ar: 'النوقاط' },
};

const STATUS_LABEL: Record<string, { ar: string; color: string }> = {
  draft:                { ar: 'مسودة',          color: '#94a3b8' },
  pending:              { ar: 'قيد الإرسال',     color: '#3b82f6' },
  under_review:         { ar: 'قيد المراجعة',    color: '#f59e0b' },
  needs_clarification:  { ar: 'يحتاج توضيح',     color: '#f97316' },
  approved:             { ar: 'معتمد',           color: '#0891B2' },
  rejected:             { ar: 'مرفوض',           color: '#DC2626' },
  frozen:               { ar: 'مجمّد',           color: '#6b7280' },
};

const TYPE_LABEL: Record<string, string> = {
  residential:   'سكني',
  agricultural:  'زراعي',
  commercial:    'تجاري',
  governmental:  'حكومي',
  industrial:    'صناعي',
  mixed:         'مختلط',
};

@Component({
  selector: 'app-admin-properties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="layout">

      <aside class="side">
        <header class="side-head">
          <div>
            <h1 class="display">العقارات</h1>
            <p class="cnt mono">{{ properties().length }} عقار</p>
          </div>
          <button class="reload" (click)="reload()" [disabled]="loading()" title="تحديث">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          </button>
        </header>

        <div class="filters">
          <input class="search" type="search" [(ngModel)]="search" (ngModelChange)="onSearch()"
            placeholder="ابحث برقم العقار، القطعة، المنطقة…" />
          <div class="chips">
            <button class="chip" [class.on]="status() === ''" (click)="setStatus('')">الكل</button>
            @for (s of statusOrder; track s) {
              <button class="chip" [class.on]="status() === s"
                      [style.--c]="statusLabel(s).color"
                      (click)="setStatus(s)">{{ statusLabel(s).ar }}</button>
            }
          </div>
        </div>

        <div class="list">
          @if (loading()) {
            <div class="empty">
              <div class="spin"></div>
              <p>جارٍ التحميل…</p>
            </div>
          } @else if (filtered().length === 0) {
            <div class="empty">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
              <p>لا توجد عقارات مطابقة.</p>
            </div>
          } @else {
            @for (p of filtered(); track p.id) {
              <button class="row" [class.active]="selected()?.id === p.id" (click)="select(p)">
                <span class="row-bar" [style.background]="statusLabel(p.status).color"></span>
                <div class="row-main">
                  <div class="row-top">
                    <span class="code mono">{{ p.property_code ?? '—' }}</span>
                    <span class="badge" [style.background]="statusLabel(p.status).color">
                      {{ statusLabel(p.status).ar }}
                    </span>
                  </div>
                  <div class="row-mid">{{ typeLabel(p.property_type) }} · {{ regionLabel(p.region_id) }}</div>
                  <div class="row-bot mono">
                    {{ p.parcel_number ?? '—' }} · {{ areaLabel(p.area_sqm) }}
                  </div>
                </div>
              </button>
            }
          }
        </div>
      </aside>

      <div class="map-area">
        <div #mapEl class="map"></div>

        @if (selected(); as p) {
          <div class="detail">
            <button class="detail-x" (click)="select(null)" title="إغلاق">×</button>
            <div class="detail-head">
              <span class="badge" [style.background]="statusLabel(p.status).color">
                {{ statusLabel(p.status).ar }}
              </span>
              <h2 class="mono">{{ p.property_code ?? '—' }}</h2>
            </div>
            <dl>
              <dt>النوع</dt><dd>{{ typeLabel(p.property_type) }}</dd>
              <dt>المنطقة</dt><dd>{{ regionLabel(p.region_id) }}</dd>
              <dt>رقم القطعة</dt><dd dir="ltr" class="mono">{{ p.parcel_number ?? '—' }}</dd>
              <dt>رقم المخطط</dt><dd dir="ltr" class="mono">{{ p.plan_number ?? '—' }}</dd>
              <dt>المساحة</dt><dd>{{ areaLabel(p.area_sqm) }}</dd>
              <dt>تاريخ الإرسال</dt><dd>{{ dateLabel(p.submitted_at) }}</dd>
              @if (p.reviewed_at) {
                <dt>تاريخ القرار</dt><dd>{{ dateLabel(p.reviewed_at) }}</dd>
              }
              @if (p.rejection_reason) {
                <dt>سبب الرفض</dt><dd>{{ p.rejection_reason }}</dd>
              }
            </dl>
          </div>
        }

        @if (error()) {
          <div class="banner err">
            <span>!</span>
            {{ error() }}
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; height: calc(100vh - 60px - 48px); }

    .layout {
      display: flex;
      height: 100%;
      gap: 18px;
      min-height: 540px;
    }

    /* Sidebar */
    .side {
      width: 360px; min-width: 320px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .side-head {
      display: flex; align-items: flex-end; justify-content: space-between;
      padding: 18px 20px 12px;
      border-bottom: 1px solid var(--rule);
    }
    .side-head h1 { font-size: 20px; margin: 0; color: var(--ink); }
    .cnt { font-size: 11px; color: var(--muted); margin: 2px 0 0; letter-spacing: .04em; }
    .reload {
      width: 34px; height: 34px;
      display: grid; place-items: center;
      background: #fff;
      border: 1px solid var(--rule);
      color: var(--muted);
      border-radius: 8px;
      cursor: pointer;
      transition: all .15s;
    }
    .reload:hover:not(:disabled) { background: var(--paper); color: var(--accent); border-color: var(--accent); }
    .reload:disabled { opacity: .5; }

    .filters { padding: 12px 20px; border-bottom: 1px solid var(--rule); }
    .search {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px;
      font-size: 13px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-family: inherit;
    }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip {
      padding: 5px 10px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 99px;
      font-size: 11.5px;
      color: var(--muted);
      cursor: pointer;
      font-family: inherit;
      transition: all .12s;
    }
    .chip:hover { border-color: var(--c, var(--ink)); color: var(--c, var(--ink)); }
    .chip.on {
      background: var(--c, var(--primary));
      color: #fff;
      border-color: var(--c, var(--primary));
    }

    .list { flex: 1; overflow-y: auto; padding: 8px; }
    .list::-webkit-scrollbar { width: 6px; }
    .list::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 6px; }

    .empty {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; padding: 40px 20px;
      color: var(--muted);
      font-size: 13px;
    }
    .empty svg { opacity: .4; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .row {
      display: flex; align-items: stretch; gap: 0;
      width: 100%;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      text-align: start;
      font-family: inherit;
      transition: all .12s;
      margin-bottom: 4px;
    }
    .row:hover { background: var(--paper); border-color: var(--rule); }
    .row.active {
      background: rgba(249, 115, 22, 0.08);
      border-color: var(--accent);
    }
    .row-bar {
      width: 4px;
      flex-shrink: 0;
      border-radius: 4px 0 0 4px;
    }
    [dir='rtl'] .row-bar { border-radius: 0 4px 4px 0; }
    .row-main { padding: 10px 12px; flex: 1; min-width: 0; }
    .row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .code { font-size: 12.5px; font-weight: 700; color: var(--ink); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 10.5px;
      font-weight: 600;
      color: #fff;
    }
    .row-mid { font-size: 12.5px; color: var(--ink); margin-top: 4px; }
    .row-bot { font-size: 11px; color: var(--muted); margin-top: 3px; }

    /* Map */
    .map-area {
      flex: 1; min-width: 0;
      position: relative;
      background: #f4f1e8;
      border: 1px solid var(--rule);
      border-radius: 14px;
      overflow: hidden;
    }
    .map { width: 100%; height: 100%; }

    .detail {
      position: absolute;
      top: 16px;
      inset-inline-end: 16px;
      width: 320px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
      z-index: 500;
    }
    .detail-x {
      position: absolute;
      top: 8px;
      inset-inline-end: 8px;
      width: 26px; height: 26px;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 18px;
      cursor: pointer;
      border-radius: 6px;
      line-height: 1;
    }
    .detail-x:hover { background: var(--rule); color: var(--ink); }
    .detail-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; align-items: flex-start; }
    .detail-head h2 { font-size: 14px; margin: 0; color: var(--ink); }

    .detail dl {
      margin: 0;
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 6px 12px;
      font-size: 12.5px;
    }
    .detail dt { color: var(--muted); }
    .detail dd { margin: 0; color: var(--ink); word-break: break-word; }

    .banner {
      position: absolute;
      bottom: 16px;
      inset-inline-start: 16px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12.5px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.1);
      z-index: 500;
    }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }

    @media (max-width: 1024px) {
      :host { height: auto; min-height: calc(100vh - 60px - 32px); }
      .layout { flex-direction: column; }
      .side { width: 100%; max-height: 50vh; }
      .map-area { min-height: 50vh; }
      .detail { width: calc(100% - 32px); }
    }
  `],
})
export class AdminPropertiesPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(PropertiesService);

  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  readonly statusOrder: PropertyStatus[] = [
    'pending', 'under_review', 'needs_clarification', 'approved', 'rejected',
  ];

  readonly properties = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal<PropertyStatus | ''>('');
  readonly selected = signal<Property | null>(null);
  search = '';

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const items = this.properties();
    if (!q) return items;
    return items.filter((p) =>
      (p.property_code ?? '').toLowerCase().includes(q) ||
      (p.parcel_number ?? '').toLowerCase().includes(q) ||
      (p.plan_number ?? '').toLowerCase().includes(q) ||
      this.regionLabel(p.region_id).toLowerCase().includes(q),
    );
  });

  private map?: L.Map;
  private markers = new Map<string, L.Marker>();
  private markersLayer?: L.LayerGroup;

  async ngOnInit(): Promise<void> {
    await this.fetch();
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.renderMarkers();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  async reload(): Promise<void> {
    await this.fetch();
    this.renderMarkers();
  }

  setStatus(s: PropertyStatus | ''): void {
    this.status.set(s);
    void this.fetch().then(() => this.renderMarkers());
  }

  onSearch(): void {
    this.renderMarkers();
  }

  select(p: Property | null): void {
    this.selected.set(p);
    if (p && this.map) {
      const c = this.centroidFor(p);
      this.map.flyTo([c.lat, c.lng], 13, { duration: 0.6 });
      this.markers.get(p.id)?.openPopup();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────
  statusLabel(s: string): { ar: string; color: string } {
    return STATUS_LABEL[s] ?? { ar: s, color: '#94a3b8' };
  }

  typeLabel(t: string): string { return TYPE_LABEL[t] ?? t; }

  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGION_CENTROIDS[id]?.ar ?? `منطقة ${id}`;
  }

  areaLabel(a: number | null | undefined): string {
    if (a == null) return '—';
    return `${Number(a).toLocaleString('ar-LY')} م²`;
  }

  dateLabel(iso: string | Date | null | undefined): string {
    if (!iso) return '—';
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── Internals ───────────────────────────────────────────────────
  private async fetch(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.list({ status: this.status() || undefined, limit: 100 });
      this.properties.set(res.items);
    } catch (e) {
      this.error.set('تعذّر تحميل العقارات.');
      this.properties.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private initMap(): void {
    if (this.map) return;
    this.map = L.map(this.mapEl.nativeElement, {
      center: [27.0, 17.0], // Libya center-ish
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
  }

  private renderMarkers(): void {
    if (!this.map || !this.markersLayer) return;
    this.markersLayer.clearLayers();
    this.markers.clear();
    const items = this.filtered();
    if (items.length === 0) return;

    const bounds: L.LatLngExpression[] = [];
    for (const p of items) {
      const c = this.centroidFor(p);
      const color = this.statusLabel(p.status).color;
      const icon = L.divIcon({
        className: 'sj-marker',
        html: `<div style="
          width: 16px; height: 16px;
          background: ${color};
          border: 2.5px solid #fff;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const m = L.marker([c.lat, c.lng], { icon })
        .bindPopup(
          `<div style="font-family: 'IBM Plex Sans Arabic', system-ui; min-width: 180px;">
             <div style="font-weight:700; font-size:13px; color:#0F172A;">${p.property_code ?? '—'}</div>
             <div style="font-size:11.5px; color:#64748B; margin-top:2px;">
               ${this.typeLabel(p.property_type)} · ${this.regionLabel(p.region_id)}
             </div>
             <div style="margin-top:6px;">
               <span style="display:inline-block; padding:2px 8px; border-radius:99px; font-size:10.5px; color:#fff; background:${color};">
                 ${this.statusLabel(p.status).ar}
               </span>
             </div>
           </div>`,
        )
        .on('click', () => this.selected.set(p));
      m.addTo(this.markersLayer);
      this.markers.set(p.id, m);
      bounds.push([c.lat, c.lng]);
    }

    if (bounds.length > 0) {
      try { this.map.fitBounds(bounds as L.LatLngBoundsLiteral, { padding: [40, 40], maxZoom: 8 }); } catch { /* one point */ }
    }
  }

  private centroidFor(p: Property): { lat: number; lng: number } {
    const base = REGION_CENTROIDS[p.region_id ?? 0] ?? REGION_CENTROIDS[10];
    // Deterministic small jitter so markers in the same region don't stack.
    const seed = this.hash(p.id);
    const dx = ((seed % 1000) / 1000 - 0.5) * 0.2; // ~±0.1°
    const dy = (((seed >> 10) % 1000) / 1000 - 0.5) * 0.2;
    return { lat: base.lat + dy, lng: base.lng + dx };
  }

  private hash(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h);
  }
}
