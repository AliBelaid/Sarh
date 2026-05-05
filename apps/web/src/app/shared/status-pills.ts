// Centralised status → label/colour maps, reused by every list/detail page so
// the new look stays consistent. Hex values come from the Sarh brand
// palette plus a few neutral steps; do NOT introduce blue/purple shades here.

export const PROPERTY_STATUS: Record<string, { ar: string; color: string }> = {
  draft:                { ar: 'مسودة',          color: '#94a3b8' },
  pending:              { ar: 'قيد الإرسال',     color: '#3b82f6' },
  under_review:         { ar: 'قيد المراجعة',    color: '#f59e0b' },
  needs_clarification:  { ar: 'يحتاج توضيح',     color: '#f97316' },
  approved:             { ar: 'معتمد',           color: '#0891B2' },
  rejected:             { ar: 'مرفوض',           color: '#DC2626' },
  frozen:               { ar: 'مجمّد',           color: '#6b7280' },
};

export const PROPERTY_TYPE: Record<string, string> = {
  residential:   'سكني',
  agricultural:  'زراعي',
  commercial:    'تجاري',
  governmental:  'حكومي',
  industrial:    'صناعي',
  mixed:         'مختلط',
};

export const CARD_STATUS: Record<string, { ar: string; color: string }> = {
  active:  { ar: 'نشطة',     color: '#0891B2' },
  frozen:  { ar: 'مجمّدة',    color: '#f59e0b' },
  revoked: { ar: 'ملغاة',     color: '#DC2626' },
  expired: { ar: 'منتهية',    color: '#6b7280' },
  lost:    { ar: 'مفقودة',    color: '#dc2626' },
};

// Keys are the Shabiyah codes used as regions.id in SQL Server (see
// infra/mssql/migrations/016_seed_regions.sql). The set must match the
// DB exactly — anything missing here will fall back to "منطقة {id}".
// For the canonical list at runtime, prefer GET /api/v1/regions.
export const REGIONS: Record<number, string> = {
  11: 'طرابلس',           12: 'الجفارة',     13: 'الزاوية',
  14: 'النقاط الخمس',     15: 'مصراتة',     16: 'المرقب',
  21: 'بنغازي',           22: 'الجبل الأخضر', 23: 'المرج',
  24: 'درنة',             25: 'طبرق',
  31: 'سبها',             32: 'مرزق',       33: 'وادي الحياة',
  34: 'غات',
};
