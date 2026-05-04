import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SijilliRequestUser } from '../auth/types';
import { StorageService, UploadFile } from '../storage/storage.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { ListPropertiesQuery } from './dto/list-properties.dto';
import { OverlapCheckDto } from './dto/overlap-check.dto';
import { NearbyQuery } from './dto/nearby.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { describeGeoJsonError, validateGeoJsonPolygon } from './utils/geojson';

const PROPERTY_DOCS_BUCKET = 'property_documents';
const ALLOWED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX_DOC_BYTES = 20 * 1024 * 1024; // matches infra/supabase/config.toml
const AREA_TOLERANCE_PCT = 5; // CLAUDE.md / spec: ±5%

const PROPERTY_SELECT = `
  id, property_code, parcel_number, plan_number, block_number,
  owner_citizen_id, property_type,
  region_id, municipality_id, address_ar,
  area_sqm, length_m, width_m, depth_m,
  status, submitted_at, reviewed_at, reviewed_by_officer_id,
  rejection_reason, approval_decree_no,
  deed_pdf_path, deed_signed_hash, vc_credential_id,
  created_at, updated_at
`;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly storage: StorageService,
  ) {}

  // --------------------------------------------------------------------
  // Submit a new property registration request.
  // - Citizens submit for themselves; status auto draft → pending.
  // - Polygon must be closed and inside Libya (TS-side fast fail).
  // - Computed area must be within ±5% of the citizen-claimed area.
  // - Reject if an APPROVED parcel already shares the centroid.
  // --------------------------------------------------------------------
  async submit(dto: CreatePropertyDto, actor: SijilliRequestUser) {
    if (!actor.citizen_id) {
      throw SijilliErrors.forbidden('فقط المواطنون يمكنهم تقديم طلبات تسجيل عقار.');
    }

    const polygonCheck = validateGeoJsonPolygon(dto.boundary_polygon);
    if (!polygonCheck.ok) {
      const m = describeGeoJsonError(polygonCheck.error);
      throw SijilliErrors.validation(m.message_ar, m.message_en, polygonCheck.error);
    }

    // Server-side area + centroid check via PostGIS.
    const polygonGeoJson = JSON.stringify(polygonCheck.polygon);
    const validation = await this.supabase.admin.rpc('validate_property_submission', {
      p_polygon: polygonGeoJson,
      p_area_sqm: dto.area_sqm,
    });
    if (validation.error) {
      throw SijilliErrors.upstream(`validate_property_submission failed: ${validation.error.message}`);
    }
    const v = validation.data as
      | {
          computed_area_sqm: number;
          area_diff_pct: number | null;
          has_approved_centroid_match: boolean;
          matched_centroid_property_id: string | null;
          matched_centroid_property_code: string | null;
        }
      | null;
    if (!v) throw SijilliErrors.upstream('validator returned no data');

    if (v.area_diff_pct !== null && v.area_diff_pct > AREA_TOLERANCE_PCT) {
      throw SijilliErrors.validation(
        `الفرق بين المساحة المُدخلة (${dto.area_sqm} م²) والمساحة المحسوبة من الإحداثيات (${v.computed_area_sqm} م²) يتجاوز ±${AREA_TOLERANCE_PCT}%.`,
        `Claimed area ${dto.area_sqm} differs from computed ${v.computed_area_sqm} by ${v.area_diff_pct}% (max ${AREA_TOLERANCE_PCT}%).`,
        { computed_area_sqm: v.computed_area_sqm, area_diff_pct: v.area_diff_pct },
      );
    }

    if (v.has_approved_centroid_match) {
      throw SijilliErrors.conflict(
        `يوجد عقار معتمد مسبقاً بنفس الإحداثيات (الرمز ${v.matched_centroid_property_code}).`,
        `An approved property with the same centroid exists (code ${v.matched_centroid_property_code}).`,
      );
    }

    // Insert via raw SQL so we can use ST_GeomFromGeoJSON. The trigger
    // tr_properties_set_centroid (migration 019) auto-fills location_point.
    const propertyId = await this.insertPropertyWithGeometry(dto, polygonGeoJson, actor.citizen_id);

    // Create the registration_request with a sequential year-based number.
    const reqNo = await this.supabase.admin.rpc('next_registration_request_no', {
      p_year: new Date().getFullYear(),
    });
    if (reqNo.error || typeof reqNo.data !== 'string') {
      throw SijilliErrors.upstream(`next_registration_request_no failed: ${reqNo.error?.message}`);
    }

    const reg = await this.supabase.admin
      .from('registration_requests')
      .insert({
        property_id: propertyId,
        request_no: reqNo.data,
        submitted_by_citizen_id: actor.citizen_id,
        current_status: 'pending',
      })
      .select('id, request_no, property_id, current_status, submitted_at')
      .single();
    if (reg.error || !reg.data) {
      throw SijilliErrors.upstream(`Failed to create registration_request: ${reg.error?.message}`);
    }

    // Read the full property row for the response.
    const property = await this.supabase.admin
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('id', propertyId)
      .single();

    return {
      property: property.data,
      registration_request: reg.data,
      validation: {
        computed_area_sqm: v.computed_area_sqm,
        area_diff_pct: v.area_diff_pct,
      },
    };
  }

  // --------------------------------------------------------------------
  // List — citizens see their own; officers see their region (or all if
  // super_admin / auditor).
  // --------------------------------------------------------------------
  async list(q: ListPropertiesQuery, actor: SijilliRequestUser) {
    let query = this.supabase.admin
      .from('properties')
      .select(PROPERTY_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(q.limit + 1);

    if (q.cursor) query = query.lt('created_at', q.cursor);
    if (q.status) query = query.eq('status', q.status);

    if (actor.role === 'citizen') {
      if (!actor.citizen_id) throw SijilliErrors.forbidden();
      query = query.eq('owner_citizen_id', actor.citizen_id);
    } else if (actor.role === 'super_admin' || actor.role === 'auditor') {
      if (q.region_id !== undefined) query = query.eq('region_id', q.region_id);
    } else {
      // registry_officer / reviewer / id_issuer: scoped to their region.
      if (!actor.region_id) {
        throw SijilliErrors.forbidden('الموظف غير مرتبط بمنطقة محدّدة.');
      }
      if (q.region_id !== undefined && q.region_id !== actor.region_id) {
        throw SijilliErrors.forbidden('لا يمكنك عرض عقارات من خارج منطقتك.');
      }
      query = query.eq('region_id', actor.region_id);
    }

    const { data, error } = await query;
    if (error) throw SijilliErrors.upstream(error.message);
    const items = data ?? [];
    let next_cursor: string | null = null;
    if (items.length > q.limit) {
      const overflow = items.pop()!;
      next_cursor = overflow.created_at as string;
    }
    return { items, next_cursor };
  }

  // --------------------------------------------------------------------
  // Get one — owner or officer.
  // --------------------------------------------------------------------
  async getById(id: string, actor: SijilliRequestUser) {
    const { data, error } = await this.supabase.admin
      .from('properties')
      .select(PROPERTY_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw SijilliErrors.upstream(error.message);
    if (!data) throw SijilliErrors.notFound('العقار');

    if (actor.role === 'citizen' && data.owner_citizen_id !== actor.citizen_id) {
      throw SijilliErrors.forbidden();
    }
    if (
      ['registry_officer', 'reviewer', 'id_issuer'].includes(actor.role) &&
      actor.region_id &&
      data.region_id !== actor.region_id
    ) {
      throw SijilliErrors.forbidden('العقار خارج منطقتك.');
    }
    return data;
  }

  // --------------------------------------------------------------------
  // Document upload (multipart/form-data).
  // --------------------------------------------------------------------
  async uploadDocument(
    propertyId: string,
    dto: UploadDocumentDto,
    file: UploadFile,
    actor: SijilliRequestUser,
  ) {
    // The owner must be the citizen, OR an officer in-region.
    const property = await this.supabase.admin
      .from('properties')
      .select('id, owner_citizen_id, region_id')
      .eq('id', propertyId)
      .maybeSingle();
    if (property.error) throw SijilliErrors.upstream(property.error.message);
    if (!property.data) throw SijilliErrors.notFound('العقار');

    const isOwner = actor.citizen_id && actor.citizen_id === property.data.owner_citizen_id;
    const isOfficer = actor.officer_id && actor.role !== 'citizen';
    if (!isOwner && !isOfficer) throw SijilliErrors.forbidden();

    const upload = await this.storage.upload(file, {
      bucket: PROPERTY_DOCS_BUCKET,
      pathPrefix: propertyId,
      maxBytes: MAX_DOC_BYTES,
      allowedMimeTypes: ALLOWED_DOC_MIME,
    });

    const { data, error } = await this.supabase.admin
      .from('property_documents')
      .insert({
        property_id: propertyId,
        document_type: dto.document_type,
        title_ar: dto.title_ar ?? null,
        storage_path: upload.path,
        mime_type: upload.mimeType,
        file_size_bytes: upload.size,
        file_hash: upload.sha256,
        uploaded_by_citizen_id: isOwner ? actor.citizen_id : null,
      })
      .select(
        'id, property_id, document_type, title_ar, storage_path, mime_type, file_size_bytes, file_hash, uploaded_at',
      )
      .single();

    if (error || !data) throw SijilliErrors.upstream(`Failed to record document: ${error?.message}`);
    return data;
  }

  // --------------------------------------------------------------------
  // Overlap check — returns approved properties whose polygon intersects
  // the candidate. Soft warning only (CLAUDE.md constraint #3).
  // --------------------------------------------------------------------
  async overlapCheck(dto: OverlapCheckDto) {
    const polygonCheck = validateGeoJsonPolygon(dto.polygon);
    if (!polygonCheck.ok) {
      const m = describeGeoJsonError(polygonCheck.error);
      throw SijilliErrors.validation(m.message_ar, m.message_en, polygonCheck.error);
    }

    const { data, error } = await this.supabase.admin.rpc('find_property_overlaps', {
      p_polygon: JSON.stringify(polygonCheck.polygon),
    });
    if (error) throw SijilliErrors.upstream(error.message);
    return { overlaps: data ?? [] };
  }

  // --------------------------------------------------------------------
  // Nearby parcels by distance from a point (metres). Uses ST_DWithin on
  // the geography type for accurate metric distance on WGS84.
  // --------------------------------------------------------------------
  async nearby(q: NearbyQuery) {
    // Build a WKT EWKT string for the search point.
    const wkt = `SRID=4326;POINT(${q.lng} ${q.lat})`;
    const { data, error } = await this.supabase.admin.rpc('properties_nearby', {
      p_point_wkt: wkt,
      p_radius_m: q.radius_m,
      p_limit: q.limit,
    });
    if (error) throw SijilliErrors.upstream(error.message);
    return { items: data ?? [] };
  }

  // --------------------------------------------------------------------
  // Internal: insert a property with PostGIS geometry derived from the
  // GeoJSON polygon. Uses an SQL helper RPC so we don't have to round-trip
  // the polygon as a separate UPDATE.
  // --------------------------------------------------------------------
  private async insertPropertyWithGeometry(
    dto: CreatePropertyDto,
    polygonGeoJson: string,
    ownerCitizenId: string,
  ): Promise<string> {
    const { data, error } = await this.supabase.admin.rpc('insert_property_with_polygon', {
      p_owner_citizen_id: ownerCitizenId,
      p_property_type: dto.property_type,
      p_region_id: dto.region_id,
      p_municipality_id: dto.municipality_id ?? null,
      p_address_ar: dto.address_ar ?? null,
      p_parcel_number: dto.parcel_number ?? null,
      p_plan_number: dto.plan_number ?? null,
      p_block_number: dto.block_number ?? null,
      p_polygon: polygonGeoJson,
      p_area_sqm: dto.area_sqm,
      p_length_m: dto.length_m ?? null,
      p_width_m: dto.width_m ?? null,
      p_depth_m: dto.depth_m ?? null,
    });
    if (error || typeof data !== 'string') {
      throw SijilliErrors.upstream(`insert_property_with_polygon failed: ${error?.message}`);
    }
    return data;
  }
}
