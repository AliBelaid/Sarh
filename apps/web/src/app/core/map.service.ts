import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';
import type { MapStatus } from '../shared/map-status';

// Public, non-sensitive attributes of one parcel on the map. NEVER carries an
// owner name or national number — the backend feeds (verify/map,
// properties/map) emit this exact shape.
export interface ParcelProps {
  id: string;
  property_code: string | null;
  parcel_number: string | null;
  property_type: string;
  status: string;
  map_status: MapStatus;
  region_id: number | null;
  area_sqm: number | null;
  updated_at: string;
  has_active_dispute: boolean;
  // Polygon overlaps another live parcel by a real area (possible double-sell).
  // Painted as a distinct red hatch on top of map_status. Derived server-side.
  has_location_conflict: boolean;
  // 'ownership_conflict' (overlaps an issued parcel) | 'location_conflict'
  // (overlaps only pending) | 'none'. Refines has_location_conflict.
  conflict_kind?: 'none' | 'location_conflict' | 'ownership_conflict';
  lng: number;
  lat: number;
}

export interface ParcelGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface ParcelFeature {
  type: 'Feature';
  geometry: ParcelGeometry | null;
  properties: ParcelProps;
}

export interface ParcelFeatureCollection {
  type: 'FeatureCollection';
  features: ParcelFeature[];
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private readonly http = inject(HttpClient);

  // Public cadastral map — deed-issued parcels only, no auth required.
  publicMap(regionId?: number): Promise<ParcelFeatureCollection> {
    let p = new HttpParams();
    if (regionId !== undefined) p = p.set('region_id', String(regionId));
    return firstValueFrom(
      this.http.get<ParcelFeatureCollection>(`${API_BASE}/verify/map`, { params: p }),
    );
  }

  // Officer map — every live parcel in the officer's region scope (includes
  // parcels still in the workflow). Auth interceptor attaches the JWT.
  officerMap(regionId?: number): Promise<ParcelFeatureCollection> {
    let p = new HttpParams();
    if (regionId !== undefined) p = p.set('region_id', String(regionId));
    return firstValueFrom(
      this.http.get<ParcelFeatureCollection>(`${API_BASE}/properties/map`, { params: p }),
    );
  }
}
