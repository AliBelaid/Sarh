import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { addBaseTileLayer } from './base-tile-layer';
import type { ParcelFeature, ParcelProps } from '@core/map.service';
import { mapStatusMeta } from './map-status';
import { PROPERTY_TYPE } from './status-pills';

// Outline colour for a conflicting parcel, or null when it has no conflict.
// Product decision: ANY overlap with an existing parcel — whether that parcel
// is already issued (ownership_conflict, خلل في الملكية) or still pending
// (location_conflict, تضارب في الموقع) — is painted RED so a clash with an
// existing property always reads as a problem at a glance. The popup text still
// distinguishes which of the two kinds it is.
function conflictOutline(p: ParcelProps): string | null {
  if (
    p.conflict_kind === 'ownership_conflict' ||
    p.conflict_kind === 'location_conflict' ||
    p.has_location_conflict
  ) {
    return '#DC2626';
  }
  return null;
}

// Shared Leaflet canvas that paints parcel polygons coloured by their derived
// map_status, drops a matching marker dot at each centroid, and emits the
// clicked parcel. Reused by the public cadastral map and the officer map so
// the rendering stays identical across both surfaces.
@Component({
  selector: 'app-parcel-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `<div #mapEl class="parcel-map"></div>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .parcel-map { width: 100%; height: 100%; background: #eef2f3; }
    /* Leaflet popup tuned to the Sarh look. */
    :host ::ng-deep .leaflet-popup-content-wrapper { border-radius: 10px; }
    :host ::ng-deep .leaflet-popup-content { margin: 12px 14px; font-family: 'IBM Plex Sans Arabic', system-ui; }
  `],
})
export class ParcelMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  // Parcels to draw. Re-renders whenever the array reference changes.
  @Input() features: ParcelFeature[] = [];
  // Show the small Latin/Arabic code label pinned above each parcel.
  @Input() showLabels = true;
  // The currently-selected parcel id (highlights its polygon).
  @Input() selectedId: string | null = null;

  @Output() readonly parcelClick = new EventEmitter<ParcelFeature>();

  private map?: L.Map;
  private layer?: L.LayerGroup;
  private polygons = new Map<string, L.Polygon>();
  private viewReady = false;
  // The parcel-id set the map last auto-fitted to. We only re-fit when this
  // changes, so a reload/re-render doesn't yank the user's pan/zoom or a
  // focus()-driven fly-to away.
  private lastFitKey = '';

  ngAfterViewInit(): void {
    this.initMap();
    this.viewReady = true;
    this.render();
    // The flex/grid host can finish sizing a tick after init; without this
    // Leaflet keeps a 0-height canvas and the map paints blank/grey.
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;
    if (changes['features']) this.render();
    if (changes['selectedId'] && !changes['features']) this.applySelection();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // Pan/zoom to a parcel and pop its tooltip — used when a host list row is
  // clicked rather than the polygon itself.
  focus(id: string): void {
    const poly = this.polygons.get(id);
    if (!poly || !this.map) return;
    this.map.flyToBounds(poly.getBounds(), { padding: [60, 60], maxZoom: 17, duration: 0.5 });
    poly.openPopup();
  }

  private initMap(): void {
    if (this.map) return;
    this.map = L.map(this.mapEl.nativeElement, {
      center: [27.0, 17.0], // Libya-ish
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });
    addBaseTileLayer(this.map);
    this.layer = L.layerGroup().addTo(this.map);
  }

  private render(): void {
    if (!this.map || !this.layer) return;
    this.layer.clearLayers();
    this.polygons.clear();

    const allBounds: L.LatLngExpression[] = [];

    for (const f of this.features) {
      const ring = f.geometry?.coordinates?.[0];
      if (!ring || ring.length < 3) continue;
      // GeoJSON is [lng,lat]; Leaflet wants [lat,lng].
      const latlngs = ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
      const meta = mapStatusMeta(f.properties.map_status);

      // A conflict overrides the normal outline with a bold dashed stroke so it
      // reads as a problem at a glance, regardless of the map_status colour:
      // red for an ownership conflict (overlaps an issued parcel), orange for a
      // location conflict (two not-yet-approved parcels overlapping).
      const conflictColor = conflictOutline(f.properties);
      const conflict = conflictColor !== null;
      const poly = L.polygon(latlngs, {
        color: conflict ? conflictColor! : meta.color,
        weight: conflict ? 3 : 2,
        dashArray: conflict ? '6 5' : undefined,
        fillColor: conflict ? conflictColor! : meta.color,
        fillOpacity: 0.28,
      })
        .bindPopup(this.popupHtml(f))
        .on('click', () => this.parcelClick.emit(f));
      poly.addTo(this.layer);
      this.polygons.set(f.properties.id, poly);
      latlngs.forEach((p) => allBounds.push(p));

      if (this.showLabels && f.properties.property_code) {
        const label = L.marker([f.properties.lat, f.properties.lng], {
          interactive: true,
          icon: L.divIcon({
            className: 'parcel-label',
            html: `<span style="
              display:inline-block; transform:translate(-50%,-50%);
              padding:1px 6px; border-radius:6px;
              background:${meta.color}; color:#fff;
              font:600 10px/1.4 'JetBrains Mono', monospace;
              white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,.3);">
              ${f.properties.property_code}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
        })
          .bindPopup(this.popupHtml(f))
          .on('click', () => this.parcelClick.emit(f));
        label.addTo(this.layer);
      }
    }

    if (allBounds.length > 0) {
      // Only auto-fit when the SET of parcels changes; re-fitting on every
      // render would override a user's pan/zoom or a focus() fly-to.
      const fitKey = this.features.map((f) => f.properties.id).sort().join(',');
      if (fitKey !== this.lastFitKey) {
        this.lastFitKey = fitKey;
        const bounds = L.latLngBounds(allBounds as L.LatLngTuple[]);
        if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
    this.applySelection();
  }

  private applySelection(): void {
    for (const [id, poly] of this.polygons) {
      const props = this.features.find((f) => f.properties.id === id)?.properties;
      const meta = mapStatusMeta(props?.map_status ?? 'pending');
      const conflictColor = props ? conflictOutline(props) : null;
      const conflict = conflictColor !== null;
      const on = id === this.selectedId;
      poly.setStyle({
        weight: on ? 4 : conflict ? 3 : 2,
        fillOpacity: on ? 0.45 : 0.28,
        dashArray: conflict ? '6 5' : undefined,
        color: conflict ? conflictColor! : meta.color,
      });
      if (on || conflict) poly.bringToFront();
    }
  }

  private popupHtml(f: ParcelFeature): string {
    const p = f.properties;
    const meta = mapStatusMeta(p.map_status);
    const type = PROPERTY_TYPE[p.property_type] ?? p.property_type;
    const area = p.area_sqm != null ? `${Number(p.area_sqm).toLocaleString('ar-LY')} م²` : '—';
    const updated = p.updated_at
      ? new Date(p.updated_at).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' })
      : '—';
    return `<div style="min-width:190px; font-family:'IBM Plex Sans Arabic',system-ui; direction:rtl; text-align:right;">
        <div style="font-weight:700; font-size:13px; color:#0F172A; font-family:'JetBrains Mono',monospace;">
          ${p.property_code ?? '—'}</div>
        <div style="font-size:11.5px; color:#64748B; margin-top:2px;">${type} · ${area}</div>
        <div style="margin-top:7px;">
          <span style="display:inline-block; padding:2px 9px; border-radius:99px; font-size:10.5px; color:#fff; background:${meta.color};">
            ${meta.ar}</span>
        </div>
        ${p.conflict_kind === 'ownership_conflict'
          ? `<div style="margin-top:7px; padding:4px 8px; border-radius:7px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; font-size:10.5px; font-weight:600;">⚠ خلل في الملكية — تتعارض مع عقار معتمد</div>`
          : p.has_location_conflict
          ? `<div style="margin-top:7px; padding:4px 8px; border-radius:7px; background:#fff7ed; border:1px solid #fed7aa; color:#b45309; font-size:10.5px; font-weight:600;">⚠ تضارب في الموقع — تتداخل مع قطعة غير معتمدة</div>`
          : ''}
        <div style="font-size:10px; color:#94a3b8; margin-top:7px;">آخر تحديث: ${updated}</div>
      </div>`;
  }
}
