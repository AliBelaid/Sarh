import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StorageService } from '../storage/storage.service';
import { SijilliErrors } from '../common/errors/error-envelope';

// Public verification of a deed by property_code. The response is a
// SANITIZED view: only the citizen's first and family names are
// returned, middle names are masked, and PII like phone/dob never
// leaves the API. The endpoint is unauthenticated by design — verify
// QR codes are public.

export interface PublicDeedView {
  property_code: string;
  parcel_number: string | null;
  property_type: string;
  area_sqm: number | null;
  status: 'active' | 'revoked';
  approval_decree_no: string | null;
  reviewed_at: string | null;
  vc_credential_id: string | null;
  // Owner display: only first + family. Middle names masked as bullets.
  owner_display_name: string;
  // Polygon as GeoJSON for the verify map; null on legacy deeds without a polygon.
  boundary_polygon_geojson: Record<string, unknown> | null;
  // Public deed PDF link if the deed is configured as publicly downloadable.
  deed_pdf_signed_url: string | null;
}

@Injectable()
export class VerifyService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly storage: StorageService,
  ) {}

  async byPropertyCode(code: string): Promise<PublicDeedView> {
    const propertyCode = code.trim();
    if (!propertyCode) throw SijilliErrors.notFound('السند العقاري');

    const { data, error } = await this.supabase.admin
      .rpc('property_review_view', { p_property_id: null })
      .maybeSingle();
    // The Phase-5 RPC takes a UUID, not a property_code, so for the
    // public path we do a plain table read by code instead.
    if (error && error.code !== 'PGRST116') {
      throw SijilliErrors.upstream(error.message);
    }
    if (data) {
      // unreachable (we passed null) — kept to silence unused warning
    }

    const property = await this.supabase.admin
      .from('properties')
      .select(
        'id, property_code, parcel_number, property_type, area_sqm, status, ' +
          'approval_decree_no, reviewed_at, vc_credential_id, deed_pdf_path, owner_citizen_id',
      )
      .eq('property_code', propertyCode)
      .eq('status', 'approved')
      .maybeSingle();
    if (property.error) throw SijilliErrors.upstream(property.error.message);
    if (!property.data) throw SijilliErrors.notFound('السند العقاري');
    const p = property.data as unknown as {
      id: string;
      property_code: string;
      parcel_number: string | null;
      property_type: string;
      area_sqm: number | null;
      status: string;
      approval_decree_no: string | null;
      reviewed_at: string | null;
      vc_credential_id: string | null;
      deed_pdf_path: string | null;
      owner_citizen_id: string;
    };

    // Owner display: first + family only.
    const owner = await this.supabase.admin
      .from('citizens')
      .select('first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar')
      .eq('id', p.owner_citizen_id)
      .maybeSingle();
    if (owner.error) throw SijilliErrors.upstream(owner.error.message);
    const o = (owner.data ?? {}) as {
      first_name_ar?: string;
      father_name_ar?: string | null;
      grandfather_name_ar?: string | null;
      family_name_ar?: string;
    };
    const ownerDisplay = [
      o.first_name_ar ?? '—',
      maskName(o.father_name_ar),
      maskName(o.grandfather_name_ar),
      o.family_name_ar ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    // Polygon for the public map. We use a separate RPC so we don't
    // expose internal columns from properties.
    const polygon = await this.supabase.admin
      .rpc('property_polygon_geojson', { p_property_id: p.id })
      .maybeSingle();
    const polygonGeoJson =
      polygon.data && typeof polygon.data === 'object'
        ? (polygon.data as Record<string, unknown>)
        : null;

    // Public deed download path. The verify controller exposes a streaming
    // GET /verify/:code/deed.pdf endpoint that proxies through StorageService;
    // signed URLs (Supabase) are no longer in play under local SQL Server.
    const deedSignedUrl = p.deed_pdf_path ? `/api/v1/verify/${p.property_code}/deed.pdf` : null;

    return {
      property_code: p.property_code,
      parcel_number: p.parcel_number,
      property_type: p.property_type,
      area_sqm: p.area_sqm,
      status: 'active',
      approval_decree_no: p.approval_decree_no,
      reviewed_at: p.reviewed_at,
      vc_credential_id: p.vc_credential_id,
      owner_display_name: ownerDisplay,
      boundary_polygon_geojson: polygonGeoJson,
      deed_pdf_signed_url: deedSignedUrl,
    };
  }
}

// Replace each character of a middle name with a bullet so the deed
// cannot be used to recover full names. Empty strings stay empty.
function maskName(s: string | null | undefined): string {
  if (!s || s.length === 0) return '';
  // Keep first character, mask the rest with bullets.
  return s.charAt(0) + '•'.repeat(Math.max(0, s.length - 1));
}
