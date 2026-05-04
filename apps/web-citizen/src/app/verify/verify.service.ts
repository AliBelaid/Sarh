import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface PublicDeedView {
  property_code: string;
  parcel_number: string | null;
  property_type: string;
  area_sqm: number | null;
  status: 'active' | 'revoked';
  approval_decree_no: string | null;
  reviewed_at: string | null;
  vc_credential_id: string | null;
  owner_display_name: string;
  boundary_polygon_geojson: Record<string, unknown> | null;
  deed_pdf_signed_url: string | null;
}

@Injectable({ providedIn: 'root' })
export class VerifyService {
  private http = inject(HttpClient);

  fetch(code: string) {
    return this.http.get<PublicDeedView>(
      `${environment.apiBaseUrl}/verify/${encodeURIComponent(code.trim())}`,
    );
  }
}
