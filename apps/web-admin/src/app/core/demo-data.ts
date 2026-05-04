import type { CitizenSummary, PaginatedItems, Property } from '@sijilli/shared-types';
import type { AuditEntry, DigitalIdCard, Officer } from './api.service';

// Synthetic data served by api.service when AuthService.isDemo() is true.
// Keeps the demo entirely offline — no Supabase, no API process.
//
// Names, phones, and digital-id numbers are arbitrary placeholders. They
// must never collide with a real Sijilli citizen — the LY-99 prefix is
// reserved for demo content (real cards use LY-NN where NN ≤ 22).

const today = new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return iso(d);
};
const yearsFromNow = (n: number) => {
  const d = new Date(today);
  d.setFullYear(d.getFullYear() + n);
  return iso(d);
};

export const MOCK_OFFICERS: Officer[] = [
  {
    id: 'demo-officer-1',
    employee_no: 'EMP-0001',
    full_name_ar: 'عمر بن خالد البلعزي',
    full_name_en: 'Omar Albalazi',
    role: 'super_admin',
    region_id: 11,
    municipality_id: null,
    phone: '+218-91-1000001',
    email: 'omar@sijilli.ly',
    permissions: { reviews: true, audit: true, manage_officers: true },
    is_active: true,
  },
  {
    id: 'demo-officer-2',
    employee_no: 'EMP-0002',
    full_name_ar: 'هدى صالح المغربي',
    full_name_en: 'Huda Almaghrabi',
    role: 'registry_officer',
    region_id: 11,
    municipality_id: null,
    phone: '+218-91-2000002',
    email: 'huda@sijilli.ly',
    permissions: { reviews: true },
    is_active: true,
  },
  {
    id: 'demo-officer-3',
    employee_no: 'EMP-0003',
    full_name_ar: 'إبراهيم محمد الفيتوري',
    full_name_en: 'Ibrahim Alfeituri',
    role: 'id_issuer',
    region_id: 12,
    municipality_id: null,
    phone: '+218-91-3000003',
    email: 'ibrahim@sijilli.ly',
    permissions: { issue_cards: true },
    is_active: true,
  },
  {
    id: 'demo-officer-4',
    employee_no: 'EMP-0004',
    full_name_ar: 'منى عبد القادر الورفلي',
    full_name_en: 'Mona Alwarfalli',
    role: 'auditor',
    region_id: null,
    municipality_id: null,
    phone: '+218-91-4000004',
    email: 'mona@sijilli.ly',
    permissions: { audit: true },
    is_active: true,
  },
];

export const MOCK_CITIZENS: CitizenSummary[] = [
  {
    id: 'demo-citizen-1',
    first_name_ar: 'مستخدم',
    father_name_ar: 'تجريبي',
    grandfather_name_ar: 'صرح',
    family_name_ar: 'ديمو',
    phone: '+218-91-9000001',
    region_id: 11,
    digital_id_number: 'LY-99-2026-000001-0',
  },
  {
    id: 'demo-citizen-2',
    first_name_ar: 'سارة',
    father_name_ar: 'علي',
    grandfather_name_ar: 'محمد',
    family_name_ar: 'القذافي',
    phone: '+218-92-9000002',
    region_id: 11,
    digital_id_number: 'LY-99-2026-000002-7',
  },
  {
    id: 'demo-citizen-3',
    first_name_ar: 'محمد',
    father_name_ar: 'أحمد',
    grandfather_name_ar: 'عمر',
    family_name_ar: 'الزنتاني',
    phone: '+218-93-9000003',
    region_id: 12,
    digital_id_number: 'LY-99-2026-000003-4',
  },
  {
    id: 'demo-citizen-4',
    first_name_ar: 'فاطمة',
    father_name_ar: 'مفتاح',
    grandfather_name_ar: 'إدريس',
    family_name_ar: 'بن سعود',
    phone: '+218-94-9000004',
    region_id: 13,
    digital_id_number: null,
  },
  {
    id: 'demo-citizen-5',
    first_name_ar: 'عبدالله',
    father_name_ar: 'مصطفى',
    grandfather_name_ar: 'عيسى',
    family_name_ar: 'الترهوني',
    phone: '+218-95-9000005',
    region_id: 11,
    digital_id_number: 'LY-99-2025-000099-1',
  },
];

export const MOCK_DIGITAL_IDS: DigitalIdCard[] = [
  {
    id: 'demo-card-1',
    citizen_id: 'demo-citizen-1',
    digital_id_number: 'LY-99-2026-000001-0',
    card_serial: 'DEMO-CARD-0001',
    status: 'active',
    issued_at: daysAgo(2),
    issued_by_officer_id: 'demo-officer-3',
    expires_at: yearsFromNow(10),
    revoked_at: null,
    revoked_reason: null,
    did: 'did:sov:LY:DemoCitizen0001',
    citizen: {
      id: 'demo-citizen-1',
      first_name_ar: 'مستخدم',
      father_name_ar: 'تجريبي',
      family_name_ar: 'ديمو',
      region_id: 11,
      phone: '+218-91-9000001',
    },
  },
  {
    id: 'demo-card-2',
    citizen_id: 'demo-citizen-2',
    digital_id_number: 'LY-99-2026-000002-7',
    card_serial: 'DEMO-CARD-0002',
    status: 'active',
    issued_at: daysAgo(5),
    issued_by_officer_id: 'demo-officer-3',
    expires_at: yearsFromNow(10),
    revoked_at: null,
    revoked_reason: null,
    did: 'did:sov:LY:DemoCitizen0002',
    citizen: {
      id: 'demo-citizen-2',
      first_name_ar: 'سارة',
      father_name_ar: 'علي',
      family_name_ar: 'القذافي',
      region_id: 11,
      phone: '+218-92-9000002',
    },
  },
  {
    id: 'demo-card-3',
    citizen_id: 'demo-citizen-3',
    digital_id_number: 'LY-99-2026-000003-4',
    card_serial: 'DEMO-CARD-0003',
    status: 'frozen',
    issued_at: daysAgo(40),
    issued_by_officer_id: 'demo-officer-3',
    expires_at: yearsFromNow(10),
    revoked_at: null,
    revoked_reason: null,
    did: 'did:sov:LY:DemoCitizen0003',
    citizen: {
      id: 'demo-citizen-3',
      first_name_ar: 'محمد',
      father_name_ar: 'أحمد',
      family_name_ar: 'الزنتاني',
      region_id: 12,
      phone: '+218-93-9000003',
    },
  },
  {
    id: 'demo-card-4',
    citizen_id: 'demo-citizen-5',
    digital_id_number: 'LY-99-2025-000099-1',
    card_serial: 'DEMO-CARD-0099',
    status: 'revoked',
    issued_at: daysAgo(380),
    issued_by_officer_id: 'demo-officer-3',
    expires_at: yearsFromNow(9),
    revoked_at: daysAgo(10),
    revoked_reason: 'تم فقدان البطاقة',
    did: 'did:sov:LY:DemoCitizen0099',
    citizen: {
      id: 'demo-citizen-5',
      first_name_ar: 'عبدالله',
      father_name_ar: 'مصطفى',
      family_name_ar: 'الترهوني',
      region_id: 11,
      phone: '+218-95-9000005',
    },
  },
];

// Property fields are spread from the canonical interface; we cast through
// `unknown` because Property includes ~20 narrow nullable fields we don't
// need for the demo views (templates only render property_code, type,
// status, region, area, address).
export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'demo-prop-1',
    property_code: 'LY-RES-2026-000001',
    parcel_number: '111/2026',
    plan_number: null,
    block_number: null,
    owner_citizen_id: 'demo-citizen-1',
    property_type: 'residential',
    status: 'approved',
    region_id: 11,
    municipality_id: null,
    address_ar: 'طرابلس، أبوسليم، شارع 12',
    area_sqm: 220,
    length_m: null,
    width_m: null,
    depth_m: null,
    submitted_at: daysAgo(60),
    updated_at: daysAgo(45),
    created_at: daysAgo(60),
    is_active: true,
  } as unknown as Property,
  {
    id: 'demo-prop-2',
    property_code: 'LY-COM-2026-000002',
    parcel_number: '222/2026',
    plan_number: null,
    block_number: null,
    owner_citizen_id: 'demo-citizen-2',
    property_type: 'commercial',
    status: 'pending_review',
    region_id: 11,
    municipality_id: null,
    address_ar: 'طرابلس، باب بن غشير، شارع الجمهورية',
    area_sqm: 480,
    length_m: null,
    width_m: null,
    depth_m: null,
    submitted_at: daysAgo(7),
    updated_at: daysAgo(7),
    created_at: daysAgo(7),
    is_active: true,
  } as unknown as Property,
  {
    id: 'demo-prop-3',
    property_code: 'LY-AGR-2026-000003',
    parcel_number: '333/2026',
    plan_number: null,
    block_number: null,
    owner_citizen_id: 'demo-citizen-3',
    property_type: 'agricultural',
    status: 'needs_clarification',
    region_id: 12,
    municipality_id: null,
    address_ar: 'بنغازي، سلوق، مزرعة 7',
    area_sqm: 14000,
    length_m: null,
    width_m: null,
    depth_m: null,
    submitted_at: daysAgo(14),
    updated_at: daysAgo(3),
    created_at: daysAgo(14),
    is_active: true,
  } as unknown as Property,
];

export const MOCK_AUDIT: AuditEntry[] = [
  {
    id: 1011,
    actor_kind: 'officer',
    actor_id: 'demo-officer-1',
    action: 'login',
    entity_table: 'auth.users',
    entity_id: 'demo-officer-1',
    occurred_at: daysAgo(0),
  },
  {
    id: 1010,
    actor_kind: 'officer',
    actor_id: 'demo-officer-3',
    action: 'issue_id',
    entity_table: 'digital_id_cards',
    entity_id: 'demo-card-1',
    occurred_at: daysAgo(2),
  },
  {
    id: 1009,
    actor_kind: 'officer',
    actor_id: 'demo-officer-3',
    action: 'issue_id',
    entity_table: 'digital_id_cards',
    entity_id: 'demo-card-2',
    occurred_at: daysAgo(5),
  },
  {
    id: 1008,
    actor_kind: 'officer',
    actor_id: 'demo-officer-2',
    action: 'approve',
    entity_table: 'properties',
    entity_id: 'demo-prop-1',
    occurred_at: daysAgo(45),
  },
  {
    id: 1007,
    actor_kind: 'officer',
    actor_id: 'demo-officer-3',
    action: 'revoke_id',
    entity_table: 'digital_id_cards',
    entity_id: 'demo-card-4',
    occurred_at: daysAgo(10),
  },
];

export const MOCK_REPORTS_SUMMARY = {
  issuance_today: 3,
  approvals_today: 1,
  rejections_today: 0,
  avg_review_minutes: 28.5,
};

// Re-export so api.service can import without depending on its own
// re-exports (avoids the type-only import cycle).
export type { PaginatedItems };
