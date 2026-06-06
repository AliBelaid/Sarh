import {
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { PropertiesService } from '@core/properties.service';
import type { Property } from '@sarh/shared-types';
import { PROPERTY_TYPE, REGIONS } from '../../../shared/status-pills';

// Officer tool to redraw an existing parcel's boundary on the map. The current
// polygon is loaded and shown; vertices are draggable, the map is click-to-add,
// and Save PATCHes /properties/:id/boundary (the server recomputes area +
// centroid). Reachable from the officer parcel map's detail panel.
@Component({
  selector: 'app-boundary-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">{{ hasOriginal() ? 'تعديل حدود العقار' : 'رسم حدود العقار' }}</h1>
          <p class="sub">اضغط على الخريطة لإضافة نقاط الحدود، واسحب أي نقطة لتحريكها. تُحتسب المساحة تلقائياً عند الحفظ.</p>
        </div>
        <a class="back" [routerLink]="returnTo">← {{ backLabel }}</a>
      </header>

      @if (loading()) {
        <div class="state"><div class="spin"></div><p>جارٍ تحميل العقار…</p></div>
      } @else if (loadError()) {
        <div class="banner err">{{ loadError() }}</div>
      } @else if (prop(); as p) {
        <div class="meta">
          <span class="code mono">{{ p.property_code ?? '—' }}</span>
          <span class="dot">·</span>
          <span>{{ typeLabel(p.property_type) }}</span>
          <span class="dot">·</span>
          <span>{{ regionLabel(p.region_id) }}</span>
          <span class="dot">·</span>
          <span class="chip">{{ p.status }}</span>
        </div>

        <div class="edit-wrap">
          <div #mapEl class="map"></div>
          <div class="toolbar">
            <span class="pts mono">{{ points().length }} نقطة</span>
            <div class="grow"></div>
            <button class="mini" (click)="undo()" [disabled]="points().length === 0 || saving()">تراجع</button>
            <button class="mini" (click)="reset()" [disabled]="saving() || !hasOriginal()">استرجاع الأصل</button>
            <button class="mini warn" (click)="clear()" [disabled]="points().length === 0 || saving()">مسح</button>
          </div>
        </div>

        @if (saveError()) { <div class="banner err">{{ saveError() }}</div> }
        @if (saved()) { <div class="banner ok">تم حفظ الحدود الجديدة وإعادة احتساب المساحة.</div> }

        <div class="actions">
          <button class="btn ghost" [routerLink]="returnTo" [disabled]="saving()">إلغاء</button>
          <button class="btn" (click)="save()" [disabled]="points().length < 3 || saving()">
            {{ saving() ? 'جارٍ الحفظ…' : 'حفظ الحدود' }}
          </button>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 1100px; margin: 0 auto; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .head h1 { font-size: 22px; margin: 0; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 4px 0 0; max-width: 620px; line-height: 1.7; }
    .back { color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600; white-space: nowrap; }

    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--ink); margin-bottom: 12px; }
    .meta .code { font-weight: 700; color: var(--primary); }
    .meta .dot { color: var(--muted); }
    .chip { padding: 2px 9px; border-radius: 99px; background: rgba(15,23,42,.06); font-size: 11.5px; color: var(--muted); }

    .edit-wrap { border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; background: var(--paper); }
    .map { height: 460px; width: 100%; background: #eef2f3; }
    .toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--rule); }
    .toolbar .grow { flex: 1; }
    .pts { font-size: 12px; color: var(--muted); }
    .mini { padding: 6px 12px; border: 1px solid var(--rule); background: #fff; color: var(--ink); border-radius: 8px; font-size: 12px; font-family: inherit; cursor: pointer; }
    .mini:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .mini.warn:hover:not(:disabled) { border-color: var(--warn); color: var(--warn); }
    .mini:disabled { opacity: .5; cursor: default; }

    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
    .btn { padding: 10px 22px; border: 0; border-radius: 9px; background: var(--primary); color: var(--accent); font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; }
    .btn:hover:not(:disabled) { background: var(--accent); color: var(--primary); }
    .btn:disabled { opacity: .5; cursor: default; }
    .btn.ghost { background: transparent; border: 1px solid var(--rule); color: var(--ink); }

    .state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: var(--muted); }
    .spin { width: 26px; height: 26px; border: 3px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { margin-top: 12px; padding: 9px 14px; border-radius: 8px; font-size: 12.5px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok { background: rgba(8,145,178,.08); color: var(--good); border: 1px solid rgba(8,145,178,.3); }
  `],
})
export class OfficerBoundaryEditPage implements OnInit, OnDestroy {
  private readonly api = inject(PropertiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // The map div lives inside an @if, so it only exists once the property has
  // loaded. A setter boots the map exactly when the element appears (by then
  // `points` is already seeded from the loaded boundary). The boot is deferred
  // one macrotask so the just-revealed container is laid out before Leaflet
  // measures it — otherwise recenter()'s fitBounds runs against a 0-size map.
  private mapEl?: ElementRef<HTMLDivElement>;
  @ViewChild('mapEl') set mapElRef(el: ElementRef<HTMLDivElement> | undefined) {
    this.mapEl = el;
    if (el) setTimeout(() => this.bootMap(), 0);
  }

  readonly prop = signal<Property | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly points = signal<L.LatLng[]>([]);
  // True when the parcel already had a boundary on load (edit vs. draw-new).
  readonly hasOriginal = signal(false);

  // Where "back"/"cancel"/post-save go. Defaults to the officer map; the
  // review screen passes ?returnTo=/app/review/:id so the reviewer lands back
  // on the request after drawing/fixing the boundary.
  returnTo = '/app/map';
  backLabel = 'الخريطة';

  private id = '';
  private original: L.LatLng[] = [];
  private map?: L.Map;
  private markerLayer = L.layerGroup();
  private polygonLayer?: L.Polygon;

  readonly canSave = computed(() => this.points().length >= 3);

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    const ret = this.route.snapshot.queryParamMap.get('returnTo');
    if (ret) {
      this.returnTo = ret;
      this.backLabel = ret.includes('/review') ? 'المراجعة' : 'الخريطة';
    }
    try {
      const p = await this.api.get(this.id);
      this.prop.set(p);
      this.original = this.ringFromProperty(p);
      this.hasOriginal.set(this.original.length > 0);
      this.points.set([...this.original]);
    } catch {
      this.loadError.set('تعذّر تحميل العقار أو ليس لديك صلاحية تعديله.');
    } finally {
      this.loading.set(false);
    }
    // The @if reveals the map div now; the ViewChild setter boots the map.
  }

  ngOnDestroy(): void { this.map?.remove(); }

  // ── Editing ──────────────────────────────────────────────
  undo(): void { this.points.set(this.points().slice(0, -1)); this.redraw(); }
  clear(): void { this.points.set([]); this.redraw(); }
  reset(): void { this.points.set([...this.original]); this.redraw(); this.recenter(); }

  async save(): Promise<void> {
    if (this.points().length < 3) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);
    try {
      const ring = [...this.points(), this.points()[0]].map((p) => [p.lng, p.lat]);
      const polygon = { type: 'Polygon', coordinates: [ring] };
      const updated = await this.api.updateBoundary(this.id, polygon);
      this.prop.set(updated);
      this.saved.set(true);
      this.original = [...this.points()];
      this.hasOriginal.set(true);
      setTimeout(() => this.router.navigateByUrl(this.returnTo), 900);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.saveError.set(err.error?.error?.message_ar ?? 'تعذّر حفظ الحدود. حاول مجدداً.');
    } finally {
      this.saving.set(false);
    }
  }

  typeLabel(t: string): string { return PROPERTY_TYPE[t] ?? t; }
  regionLabel(id: number | null | undefined): string { return id == null ? '—' : (REGIONS[id] ?? `منطقة ${id}`); }

  // ── Map internals ────────────────────────────────────────
  private bootMap(): void {
    if (this.map || !this.mapEl) return;
    this.map = L.map(this.mapEl.nativeElement, { center: [32.8872, 13.1913], zoom: 13, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.markerLayer.addTo(this.map);
    this.map.on('click', (e: L.LeafletMouseEvent) => this.addPoint(e.latlng));
    // Container is laid out by now (boot is deferred a tick), but invalidate
    // once more so a tab/resize that happened mid-load can't leave a 0-size map.
    this.map.invalidateSize();
    this.redraw();
    this.recenter();
  }

  private addPoint(latlng: L.LatLng): void {
    if (this.saving()) return;
    this.points.set([...this.points(), latlng]);
    this.redraw();
  }

  private redraw(): void {
    if (!this.map) return;
    this.markerLayer.clearLayers();
    if (this.polygonLayer) { this.map.removeLayer(this.polygonLayer); this.polygonLayer = undefined; }

    const pts = this.points();
    pts.forEach((p, i) => {
      const m = L.marker(p, {
        draggable: !this.saving(),
        icon: L.divIcon({
          className: 'vtx',
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#F97316;border:2.5px solid #0F172A;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      });
      m.on('drag', (ev: L.LeafletEvent) => {
        const ll = (ev.target as L.Marker).getLatLng();
        const next = [...this.points()];
        next[i] = ll;
        this.points.set(next);
        this.drawPolygonOnly();
      });
      m.on('dragend', () => this.redraw());
      this.markerLayer.addLayer(m);
    });

    this.drawPolygonOnly();
  }

  private drawPolygonOnly(): void {
    if (!this.map) return;
    if (this.polygonLayer) { this.map.removeLayer(this.polygonLayer); this.polygonLayer = undefined; }
    const pts = this.points();
    if (pts.length >= 3) {
      this.polygonLayer = L.polygon(pts, {
        color: '#0891B2', weight: 2, fillColor: '#0891B2', fillOpacity: 0.18,
      }).addTo(this.map);
    } else if (pts.length === 2) {
      this.polygonLayer = L.polyline(pts, { color: '#F97316', weight: 2, dashArray: '6 6' }) as unknown as L.Polygon;
      (this.polygonLayer as unknown as L.Polyline).addTo(this.map);
    }
  }

  private recenter(): void {
    if (!this.map) return;
    const pts = this.points();
    if (pts.length >= 2) {
      try { this.map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 18 }); } catch { /* noop */ }
    } else if (pts.length === 1) {
      this.map.setView(pts[0], 17);
    }
  }

  // boundary_polygon is { type:'Polygon', coordinates:[[[lng,lat],…]] }; drop
  // the duplicated closing vertex so editing doesn't show two stacked points.
  private ringFromProperty(p: Property): L.LatLng[] {
    const geo = (p as unknown as { boundary_polygon?: { coordinates?: number[][][] } }).boundary_polygon;
    const ring = geo?.coordinates?.[0];
    if (!ring || ring.length < 4) return [];
    const open = ring.slice(0, ring.length - 1);
    return open.map(([lng, lat]) => L.latLng(lat, lng));
  }
}
