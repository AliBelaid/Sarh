// Sijilli — shared TypeScript types used by web apps and the public API.
// Single source of truth for the wire shapes between frontends and the
// NestJS backend. Keep these in sync with apps/api response shapes.

export type SijilliRole =
  | 'super_admin'
  | 'registry_officer'
  | 'id_issuer'
  | 'auditor'
  | 'reviewer'
  | 'citizen';

export type PropertyType =
  | 'residential'
  | 'agricultural'
  | 'commercial'
  | 'governmental'
  | 'industrial'
  | 'mixed';

export type PropertyStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'needs_clarification'
  | 'frozen';

export type DocumentType =
  | 'koreky_certificate'
  | 'survey_certificate'
  | 'sale_contract'
  | 'inheritance_deed'
  | 'court_order'
  | 'site_photo'
  | 'boundary_map'
  | 'other';

export type ReviewDecision = 'approve' | 'reject' | 'needs_clarification';

export interface Region {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
}

export interface Municipality {
  id: number;
  region_id: number;
  code: string;
  name_ar: string;
  name_en: string;
}

export interface CitizenSummary {
  id: string;
  first_name_ar: string;
  father_name_ar?: string | null;
  grandfather_name_ar?: string | null;
  family_name_ar: string;
  phone?: string | null;
  region_id?: number | null;
  digital_id_number?: string | null;
}

export interface Property {
  id: string;
  property_code: string | null;
  parcel_number: string | null;
  plan_number: string | null;
  block_number: string | null;
  owner_citizen_id: string;
  property_type: PropertyType;
  region_id: number | null;
  municipality_id: number | null;
  address_ar: string | null;
  area_sqm: number | null;
  length_m: number | null;
  width_m: number | null;
  depth_m: number | null;
  status: PropertyStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_officer_id: string | null;
  rejection_reason: string | null;
  approval_decree_no: string | null;
  deed_pdf_path: string | null;
  deed_signed_hash: string | null;
  vc_credential_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyOverlap {
  property_id: string;
  parcel_number: string | null;
  overlap_pct: number;
}

export interface PropertyDocument {
  id: string;
  property_id: string;
  document_type: DocumentType;
  title_ar: string | null;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_hash: string | null;
  uploaded_at: string;
}

export interface ReviewRequest {
  decision: ReviewDecision;
  note?: string;
  approval_decree_no?: string;
}

export interface ReviewResponse {
  property: Pick<
    Property,
    | 'id'
    | 'property_code'
    | 'status'
    | 'reviewed_at'
    | 'reviewed_by_officer_id'
    | 'rejection_reason'
    | 'deed_pdf_path'
    | 'deed_signed_hash'
    | 'vc_credential_id'
  >;
  deed?: { path: string; sha256: string; verify_url: string };
  vc?: { credential_id: string; did: string; is_placeholder: boolean };
}

export interface SijilliNotification {
  id: string;
  recipient_citizen_id: string | null;
  recipient_officer_id: string | null;
  kind: 'sms' | 'push' | 'email' | 'in_app';
  title_ar: string | null;
  body_ar: string | null;
  payload: Record<string, unknown> | null;
  sent_at: string;
  read_at: string | null;
  delivery_status: string | null;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message_ar: string;
    message_en: string;
    details?: unknown;
  };
}

export interface PaginatedItems<T> {
  items: T[];
  next_cursor: string | null;
}
