import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { SijilliRequestUser } from '../auth/types';
import { NotificationsService } from '../notifications/notifications.service';
import { SsiService } from '../ssi/ssi.service';
import { AuditService, AuditAction } from '../audit/audit.service';
import { DeedGeneratorService } from './deed-generator.service';
import { ReviewDecisionDto } from './dto/review-decision.dto';

export interface ReviewRequestContext {
  ip: string | null;
  user_agent: string | null;
}

const REVIEWABLE_STATUSES = new Set(['pending', 'under_review', 'needs_clarification']);
const OFFICER_REVIEW_ROLES = new Set(['registry_officer', 'reviewer', 'super_admin']);

interface PropertyForReview {
  id: string;
  property_code: string | null;
  status: string;
  region_id: number | null;
  property_type: string;
  area_sqm: number | null;
  address_ar: string | null;
  parcel_number: string | null;
  owner_citizen_id: string;
  boundary_polygon_geojson: string | null;
}

interface OwnerCitizen {
  id: string;
  full_name_ar: string;
  digital_id_number: string | null;
}

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly ssi: SsiService,
    private readonly deeds: DeedGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async review(
    propertyId: string,
    dto: ReviewDecisionDto,
    actor: SijilliRequestUser,
    ctx: ReviewRequestContext,
  ) {
    if (!actor.officer_id || !OFFICER_REVIEW_ROLES.has(actor.role)) {
      throw SijilliErrors.forbidden('فقط موظّفو السجلّ يمكنهم اعتماد أو رفض الطلبات.');
    }

    if ((dto.decision === 'reject' || dto.decision === 'needs_clarification') && !dto.note) {
      throw SijilliErrors.validation(
        'الملاحظة إلزامية عند الرفض أو طلب التوضيح.',
        'A note is required when rejecting or requesting clarification.',
      );
    }

    const property = await this.loadPropertyForReview(propertyId);

    // Region scope: super_admin can act anywhere; registry_officer/reviewer
    // only on their region.
    if (actor.role !== 'super_admin') {
      if (!actor.region_id) {
        throw SijilliErrors.forbidden('الموظف غير مرتبط بمنطقة محدّدة.');
      }
      if (property.region_id !== actor.region_id) {
        throw SijilliErrors.forbidden('العقار خارج منطقتك.');
      }
    }

    if (!REVIEWABLE_STATUSES.has(property.status)) {
      throw SijilliErrors.conflict(
        `لا يمكن مراجعة عقار حالته "${property.status}".`,
        `Property in status "${property.status}" is not reviewable.`,
      );
    }

    if (dto.decision === 'approve') return this.approve(property, dto, actor, ctx);
    if (dto.decision === 'reject') return this.reject(property, dto, actor, ctx);
    return this.needsClarification(property, dto, actor, ctx);
  }

  // -----------------------------------------------------------------------
  // approve
  // -----------------------------------------------------------------------
  private async approve(
    property: PropertyForReview,
    dto: ReviewDecisionDto,
    actor: SijilliRequestUser,
    ctx: ReviewRequestContext,
  ) {
    const owner = await this.loadOwner(property.owner_citizen_id);
    const region = property.region_id ? await this.loadRegion(property.region_id) : null;
    if (!region) {
      throw SijilliErrors.validation(
        'لا يمكن اعتماد عقار بدون منطقة.',
        'Cannot approve a property without a region.',
      );
    }

    const codeRpc = await this.supabase.admin.rpc('next_property_code', {
      p_region_code: region.code,
      p_year: new Date().getFullYear(),
    });
    if (codeRpc.error || typeof codeRpc.data !== 'string') {
      throw SijilliErrors.upstream(
        `next_property_code failed: ${codeRpc.error?.message ?? 'no data'}`,
      );
    }
    const propertyCode = codeRpc.data;

    const deed = await this.deeds.generateAndStore({
      property_id: property.id,
      property_code: propertyCode,
      property_type: property.property_type,
      area_sqm: property.area_sqm,
      address_ar: property.address_ar,
      parcel_number: property.parcel_number,
      region_name_ar: region.name_ar,
      owner_full_name_ar: owner.full_name_ar,
      owner_digital_id_number: owner.digital_id_number,
      approval_date: new Date(),
      approval_decree_no: dto.approval_decree_no ?? null,
    });

    const vc = await this.ssi.issuePropertyDeedVc({
      property_id: property.id,
      property_code: propertyCode,
      owner_citizen_id: property.owner_citizen_id,
      property_type: property.property_type,
      area_sqm: property.area_sqm,
      polygon_geojson: property.boundary_polygon_geojson,
    });

    const reviewedAt = new Date().toISOString();
    const update = await this.supabase.admin
      .from('properties')
      .update({
        status: 'approved',
        property_code: propertyCode,
        reviewed_at: reviewedAt,
        reviewed_by_officer_id: actor.officer_id,
        approval_decree_no: dto.approval_decree_no ?? null,
        rejection_reason: null,
        deed_pdf_path: `${deed.bucket}/${deed.path}`,
        deed_signed_hash: deed.sha256,
        vc_credential_id: vc.credential_id,
      })
      .eq('id', property.id)
      .select(
        'id, property_code, status, reviewed_at, reviewed_by_officer_id, deed_pdf_path, deed_signed_hash, vc_credential_id',
      )
      .single();
    if (update.error || !update.data) {
      throw SijilliErrors.upstream(`property update failed: ${update.error?.message}`);
    }

    await this.updateRegistrationRequest(property.id, 'approved');
    if (dto.note) await this.recordComment(property.id, actor.officer_id!, dto.note, false);
    await this.notifyApproval(property.owner_citizen_id, propertyCode);
    await this.writeAudit('approve', property.id, actor, dto, update.data, ctx);

    return {
      property: update.data,
      deed: { path: deed.path, sha256: deed.sha256, verify_url: deed.verify_url },
      vc: { credential_id: vc.credential_id, did: vc.did, is_placeholder: vc.is_placeholder },
    };
  }

  // -----------------------------------------------------------------------
  // reject
  // -----------------------------------------------------------------------
  private async reject(
    property: PropertyForReview,
    dto: ReviewDecisionDto,
    actor: SijilliRequestUser,
    ctx: ReviewRequestContext,
  ) {
    const reviewedAt = new Date().toISOString();
    const update = await this.supabase.admin
      .from('properties')
      .update({
        status: 'rejected',
        rejection_reason: dto.note,
        reviewed_at: reviewedAt,
        reviewed_by_officer_id: actor.officer_id,
      })
      .eq('id', property.id)
      .select('id, property_code, status, reviewed_at, reviewed_by_officer_id, rejection_reason')
      .single();
    if (update.error || !update.data) {
      throw SijilliErrors.upstream(`property update failed: ${update.error?.message}`);
    }

    await this.updateRegistrationRequest(property.id, 'rejected');
    await this.recordComment(property.id, actor.officer_id!, dto.note!, false);
    await this.notifyDecision(property.owner_citizen_id, 'rejected', property.id, dto.note!);
    await this.writeAudit('reject', property.id, actor, dto, update.data, ctx);

    return { property: update.data };
  }

  // -----------------------------------------------------------------------
  // needs_clarification
  // -----------------------------------------------------------------------
  private async needsClarification(
    property: PropertyForReview,
    dto: ReviewDecisionDto,
    actor: SijilliRequestUser,
    ctx: ReviewRequestContext,
  ) {
    const reviewedAt = new Date().toISOString();
    const update = await this.supabase.admin
      .from('properties')
      .update({
        status: 'needs_clarification',
        reviewed_at: reviewedAt,
        reviewed_by_officer_id: actor.officer_id,
      })
      .eq('id', property.id)
      .select('id, property_code, status, reviewed_at, reviewed_by_officer_id')
      .single();
    if (update.error || !update.data) {
      throw SijilliErrors.upstream(`property update failed: ${update.error?.message}`);
    }

    await this.updateRegistrationRequest(property.id, 'needs_clarification');
    await this.recordComment(property.id, actor.officer_id!, dto.note!, false);
    await this.notifyDecision(property.owner_citizen_id, 'needs_clarification', property.id, dto.note!);
    // 'needs_clarification' has no dedicated enum value in audit_action_enum
    // so we record it under 'update' with the decision in after_state.
    await this.writeAudit('update', property.id, actor, dto, update.data, ctx);

    return { property: update.data };
  }

  private async writeAudit(
    action: AuditAction,
    propertyId: string,
    actor: SijilliRequestUser,
    dto: ReviewDecisionDto,
    after: unknown,
    ctx: ReviewRequestContext,
  ) {
    await this.audit.record({
      actor_kind: 'officer',
      actor_id: actor.officer_id ?? null,
      action,
      entity_table: 'properties',
      entity_id: propertyId,
      before_state: { decision: dto.decision, note: dto.note ?? null },
      after_state: after,
      ip_address: ctx.ip,
      user_agent: ctx.user_agent,
    });
  }

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------
  private async loadPropertyForReview(id: string): Promise<PropertyForReview> {
    // ST_AsGeoJSON is invoked via the same insert_property_with_polygon
    // sibling helper. Here we want a one-shot read of the polygon as
    // GeoJSON to feed the SSI VC payload — use an RPC.
    const { data, error } = await this.supabase.admin
      .rpc('property_review_view', { p_property_id: id })
      .maybeSingle();

    if (error) throw SijilliErrors.upstream(`property_review_view: ${error.message}`);
    if (!data) throw SijilliErrors.notFound('العقار');
    return data as PropertyForReview;
  }

  private async loadOwner(citizenId: string): Promise<OwnerCitizen> {
    const { data, error } = await this.supabase.admin
      .from('citizens')
      .select(
        'id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar, digital_id_cards:digital_id_cards!citizen_id ( digital_id_number, status )',
      )
      .eq('id', citizenId)
      .maybeSingle();
    if (error) throw SijilliErrors.upstream(`citizen lookup: ${error.message}`);
    if (!data) throw SijilliErrors.notFound('المالك');

    const r = data as {
      id: string;
      first_name_ar: string;
      father_name_ar: string | null;
      grandfather_name_ar: string | null;
      family_name_ar: string;
      digital_id_cards: Array<{ digital_id_number: string; status: string }> | null;
    };
    const fullName = [r.first_name_ar, r.father_name_ar, r.grandfather_name_ar, r.family_name_ar]
      .filter(Boolean)
      .join(' ');
    const activeCard = (r.digital_id_cards ?? []).find((c) => c.status === 'active');
    return {
      id: r.id,
      full_name_ar: fullName,
      digital_id_number: activeCard?.digital_id_number ?? null,
    };
  }

  private async loadRegion(
    regionId: number,
  ): Promise<{ id: number; code: string; name_ar: string } | null> {
    const { data, error } = await this.supabase.admin
      .from('regions')
      .select('id, code, name_ar')
      .eq('id', regionId)
      .maybeSingle();
    if (error) throw SijilliErrors.upstream(`region lookup: ${error.message}`);
    return (data as { id: number; code: string; name_ar: string } | null) ?? null;
  }

  private async updateRegistrationRequest(propertyId: string, status: string) {
    await this.supabase.admin
      .from('registration_requests')
      .update({ current_status: status })
      .eq('property_id', propertyId);
  }

  private async recordComment(
    propertyId: string,
    officerId: string,
    body: string,
    isInternal: boolean,
  ) {
    const { error } = await this.supabase.admin.from('review_comments').insert({
      property_id: propertyId,
      officer_id: officerId,
      body,
      is_internal: isInternal,
    });
    if (error) this.logger.warn(`review_comments insert failed: ${error.message}`);
  }

  private async notifyApproval(citizenId: string, propertyCode: string) {
    await this.notifications.dispatch({
      recipient_citizen_id: citizenId,
      kinds: ['sms', 'in_app'],
      title_ar: 'تم اعتماد طلب تسجيل عقاركم',
      body_ar: `تم اعتماد العقار رقم ${propertyCode}. يمكنكم تنزيل السند الإلكتروني من حسابكم.`,
      payload: { event: 'property_approved', property_code: propertyCode },
    });
  }

  private async notifyDecision(
    citizenId: string,
    decision: 'rejected' | 'needs_clarification',
    propertyId: string,
    note: string,
  ) {
    const titleAr =
      decision === 'rejected' ? 'تم رفض طلب تسجيل عقاركم' : 'طلب تسجيل عقاركم بحاجة إلى توضيح';
    await this.notifications.dispatch({
      recipient_citizen_id: citizenId,
      kinds: ['sms', 'in_app'],
      title_ar: titleAr,
      body_ar: `${titleAr}: ${truncate(note, 140)}`,
      payload: { event: `property_${decision}`, property_id: propertyId },
    });
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
