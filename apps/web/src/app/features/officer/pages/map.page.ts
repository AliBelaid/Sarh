import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MapService, type ParcelFeature } from '@core/map.service';
import { MAP_STATUS_ORDER, mapStatusMeta, type MapStatus } from '../../../shared/map-status';
import { PROPERTY_TYPE, PROPERTY_STATUS, REGIONS } from '../../../shared/status-pills';
import { ParcelMapComponent } from '../../../shared/parcel-map.component';

// Officer cadastral map ("خريطة العقارات"). Unlike the public map it includes
// parcels still in the workflow (pending → yellow) so a registry officer can
// see the full picture of their region. Each parcel links through to its
// review screen and its legal-disputes (encumbrance) screen. Backend scopes
// the feed to the officer's region automatically.
@Component({
  selector: 'app-officer-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, ParcelMapComponent],
  template: `
    <div class="layout">
      <aside class="side">
        <header class="side-head">
          <div>
            <h1 class="display">خريطة العقارات</h1>
            <p class="cnt mono">{{ filtered().length }} / {{ features().length }} عقار</p>
          </div>
          <button class="reload" (click)="reload()" [disabled]="loading()" title="تحديث">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><polyline points="1 20 1 14 7 14"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          </button>
        </header>

        <div class="filters">
          <input class="search" type="search" [ngModel]="search()" (ngModelChange)="search.set($event)"
            placeholder="ابحث برقم العقار أو القطعة…" />
          <div class="chips">
            <button class="chip" [class.on]="filter() === ''" (click)="setFilter('')">الكل</button>
            @for (s of statusOrder; track s) {
              <button class="chip" [class.on]="filter() === s" [style.--c]="meta(s).color" (click)="setFilter(s)">
                <span class="cdot" [style.background]="meta(s).color"></span>{{ meta(s).ar }}
              </button>
            }
          </div>
        </div>

        <div class="list">
          @if (loading()) {
            <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
          } @else if (filtered().length === 0) {
            <div class="empty">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
              <p>لا توجد عقارات مطابقة.</p>
            </div>
          } @else {
            @for (f of filtered(); track f.properties.id) {
              <button class="row" [class.active]="selected()?.properties?.id === f.properties.id" (click)="select(f)">
                <span class="row-bar" [style.background]="meta(f.properties.map_status).color"></span>
                <div class="row-main">
                  <div class="row-top">
                    <span class="code mono">{{ f.properties.property_code ?? '—' }}</span>
                    <span class="badge" [style.background]="meta(f.properties.map_status).color">{{ meta(f.properties.map_status).ar }}</span>
                  </div>
                  <div class="row-mid">{{ typeLabel(f.properties.property_type) }} · {{ areaLabel(f.properties.area_sqm) }}</div>
                  <div class="row-bot mono">{{ f.properties.parcel_number ?? '—' }} · {{ workflowLabel(f.properties.status) }}</div>
                </div>
              </button>
            }
          }
        </div>
      </aside>

      <div class="map-area">
        <app-parcel-map
          #parcelMap
          [features]="filtered()"
          [selectedId]="selected()?.properties?.id ?? null"
          (parcelClick)="select($event)"
        ></app-parcel-map>

        @if (error()) { <div class="banner err"><span>!</span>{{ error() }}</div> }

        @if (selected(); as f) {
          <div class="detail">
            <button class="detail-x" (click)="select(null)" title="إغلاق">×</button>
            <div class="detail-head">
              <span class="badge" [style.background]="meta(f.properties.map_status).color">{{ meta(f.properties.map_status).ar }}</span>
              <h2 class="mono">{{ f.properties.property_code ?? '—' }}</h2>
            </div>
            <dl>
              <dt>الحالة القانونية</dt>
              <dd>{{ meta(f.properties.map_status).ar }}</dd>
              <dt>حالة الطلب</dt>
              <dd><span class="wf" [style.color]="workflowColor(f.properties.status)">{{ workflowLabel(f.properties.status) }}</span></dd>
              <dt>النوع</dt><dd>{{ typeLabel(f.properties.property_type) }}</dd>
              <dt>المنطقة</dt><dd>{{ regionLabel(f.properties.region_id) }}</dd>
              <dt>رقم القطعة</dt><dd dir="ltr" class="mono">{{ f.properties.parcel_number ?? '—' }}</dd>
              <dt>المساحة</dt><dd>{{ areaLabel(f.properties.area_sqm) }}</dd>
              <dt>آخر تحديث</dt><dd>{{ dateLabel(f.properties.updated_at) }}</dd>
            </dl>
            @if (f.properties.has_active_dispute) {
              <p class="warn-note">⚠ هذا العقار عليه حجز/نزاع قانوني قائم.</p>
            }
            <div class="actions">
              <a class="act" [routerLink]="['/app/review', f.properties.id]">فتح المراجعة</a>
              <a class="act ghost" [routerLink]="['/app/properties', f.properties.id, 'boundary']">تعديل الحدود</a>
            </div>
            <a class="dispute-link" [routerLink]="['/app/disputes', f.properties.id]">إدارة النزاعات القانونية ←</a>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: calc(100vh - 60px - 48px); }
    .layout { display: flex; height: 100%; gap: 18px; min-height: 540px; }

    .side {
      width: 360px; min-width: 320px;
      background: var(--paper); border: 1px solid var(--rule); border-radius: 14px;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .side-head { display: flex; align-items: flex-end; justify-content: space-between; padding: 18px 20px 12px; border-bottom: 1px solid var(--rule); }
    .side-head h1 { font-size: 20px; margin: 0; color: var(--ink); }
    .cnt { font-size: 11px; color: var(--muted); margin: 2px 0 0; letter-spacing: .04em; }
    .reload { width: 34px; height: 34px; display: grid; place-items: center; background: #fff; border: 1px solid var(--rule); color: var(--muted); border-radius: 8px; cursor: pointer; transition: all .15s; }
    .reload:hover:not(:disabled) { background: var(--paper); color: var(--accent); border-color: var(--accent); }
    .reload:disabled { opacity: .5; }

    .filters { padding: 12px 20px; border-bottom: 1px solid var(--rule); }
    .search { width: 100%; box-sizing: border-box; padding: 9px 12px; font-size: 13px; background: #fff; border: 1px solid var(--rule); border-radius: 8px; font-family: inherit; }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,.12); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: #fff; border: 1px solid var(--rule); border-radius: 99px; font-size: 11.5px; color: var(--muted); cursor: pointer; font-family: inherit; transition: all .12s; }
    .chip:hover { border-color: var(--c, var(--ink)); color: var(--c, var(--ink)); }
    .chip.on { background: var(--c, var(--primary)); color: #fff; border-color: var(--c, var(--primary)); }
    .chip.on .cdot { background: #fff !important; }
    .cdot { width: 9px; height: 9px; border-radius: 3px; }

    .list { flex: 1; overflow-y: auto; padding: 8px; }
    .list::-webkit-scrollbar { width: 6px; }
    .list::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 6px; }
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 20px; color: var(--muted); font-size: 13px; }
    .empty svg { opacity: .4; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .row { display: flex; width: 100%; padding: 0; background: transparent; border: 1px solid transparent; border-radius: 10px; cursor: pointer; text-align: start; font-family: inherit; transition: all .12s; margin-bottom: 4px; }
    .row:hover { background: var(--paper); border-color: var(--rule); }
    .row.active { background: rgba(249,115,22,.08); border-color: var(--accent); }
    .row-bar { width: 4px; flex-shrink: 0; border-radius: 0 4px 4px 0; }
    [dir='rtl'] .row-bar { border-radius: 4px 0 0 4px; }
    .row-main { padding: 10px 12px; flex: 1; min-width: 0; }
    .row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .code { font-size: 12.5px; font-weight: 700; color: var(--ink); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 600; color: #fff; }
    .row-mid { font-size: 12.5px; color: var(--ink); margin-top: 4px; }
    .row-bot { font-size: 11px; color: var(--muted); margin-top: 3px; }

    .map-area { flex: 1; min-width: 0; position: relative; background: #eef2f3; border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }

    .detail { position: absolute; top: 16px; inset-inline-end: 16px; width: 320px; background: var(--paper); border: 1px solid var(--rule); border-radius: 12px; padding: 16px 18px; box-shadow: 0 12px 32px rgba(15,23,42,.12); z-index: 600; }
    .detail-x { position: absolute; top: 8px; inset-inline-end: 8px; width: 26px; height: 26px; border: 0; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; border-radius: 6px; line-height: 1; }
    .detail-x:hover { background: var(--rule); color: var(--ink); }
    .detail-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; align-items: flex-start; }
    .detail-head h2 { font-size: 14px; margin: 0; color: var(--ink); }
    .detail dl { margin: 0; display: grid; grid-template-columns: 104px 1fr; gap: 6px 12px; font-size: 12.5px; }
    .detail dt { color: var(--muted); }
    .detail dd { margin: 0; color: var(--ink); word-break: break-word; }
    .wf { font-weight: 700; }
    .warn-note { margin: 12px 0 0; font-size: 11.5px; color: var(--warn); background: rgba(220,38,38,.07); padding: 8px 10px; border-radius: 8px; }
    .actions { display: flex; gap: 8px; margin-top: 14px; }
    .act { flex: 1; text-align: center; padding: 8px 10px; background: var(--primary); color: var(--accent); border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; }
    .act:hover { background: var(--accent); color: var(--primary); }
    .act.ghost { background: transparent; border: 1px solid var(--rule); color: var(--ink); }
    .act.ghost:hover { border-color: var(--accent); color: var(--accent); }
    .dispute-link { display: inline-block; margin-top: 10px; font-size: 12px; font-weight: 600; color: var(--warn); text-decoration: none; }
    .dispute-link:hover { text-decoration: underline; }

    .banner { position: absolute; bottom: 16px; inset-inline-start: 16px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 6px 16px rgba(0,0,0,.1); z-index: 600; }
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
export class OfficerMapPage implements OnInit {
  private readonly api = inject(MapService);
  @ViewChild('parcelMap') parcelMap?: ParcelMapComponent;

  readonly features = signal<ParcelFeature[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selected = signal<ParcelFeature | null>(null);
  readonly filter = signal<MapStatus | ''>('');
  readonly search = signal('');

  readonly statusOrder = MAP_STATUS_ORDER;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.features().filter((x) => {
      if (f && x.properties.map_status !== f) return false;
      if (!q) return true;
      return (
        (x.properties.property_code ?? '').toLowerCase().includes(q) ||
        (x.properties.parcel_number ?? '').toLowerCase().includes(q)
      );
    });
  });

  async ngOnInit(): Promise<void> {
    await this.fetch();
  }

  async reload(): Promise<void> { await this.fetch(); }
  setFilter(s: MapStatus | ''): void { this.filter.set(s); }

  select(f: ParcelFeature | null): void {
    this.selected.set(f);
    if (f) this.parcelMap?.focus(f.properties.id);
  }

  meta = mapStatusMeta;
  typeLabel(t: string): string { return PROPERTY_TYPE[t] ?? t; }
  regionLabel(id: number | null): string { return id == null ? '—' : (REGIONS[id] ?? `منطقة ${id}`); }
  areaLabel(a: number | null): string { return a == null ? '—' : `${Number(a).toLocaleString('ar-LY')} م²`; }
  workflowLabel(s: string): string { return PROPERTY_STATUS[s]?.ar ?? s; }
  workflowColor(s: string): string { return PROPERTY_STATUS[s]?.color ?? '#94a3b8'; }
  dateLabel(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private async fetch(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.officerMap();
      this.features.set(res.features ?? []);
    } catch {
      this.error.set('تعذّر تحميل الخريطة.');
      this.features.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
