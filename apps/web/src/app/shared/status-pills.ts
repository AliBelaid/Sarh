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
  minted:               { ar: 'رخصة NFT',        color: '#F97316' },
  transferred:          { ar: 'منقول',           color: '#7c3aed' },
};

export const NFT_STATUS: Record<string, { ar: string; color: string }> = {
  pending:     { ar: 'قيد السكّ',  color: '#94a3b8' },
  minted:      { ar: 'معتمدة',     color: '#0891B2' },
  transferred: { ar: 'محوَّلة',    color: '#F97316' },
  burned:      { ar: 'ملغاة',      color: '#DC2626' },
  failed:      { ar: 'فشل السكّ',  color: '#DC2626' },
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

// Approximate centroid (capital city) of each Shabiyah region, keyed by the
// SAME regions.id Shabiyah codes as REGIONS / the DB (016_seed_regions.sql).
// Used only as a fallback map marker when a parcel has no drawn polygon —
// labels always come from REGIONS, never from here.
export const REGION_CENTROIDS: Record<number, { lat: number; lng: number }> = {
  11: { lat: 32.8872, lng: 13.1913 }, // طرابلس
  12: { lat: 32.5300, lng: 13.0200 }, // الجفارة (العزيزية)
  13: { lat: 32.7522, lng: 12.7278 }, // الزاوية
  14: { lat: 32.9312, lng: 12.0800 }, // النقاط الخمس (زوارة)
  15: { lat: 32.3754, lng: 15.0925 }, // مصراتة
  16: { lat: 32.6486, lng: 14.2619 }, // المرقب (الخمس)
  21: { lat: 32.1167, lng: 20.0686 }, // بنغازي
  22: { lat: 32.7627, lng: 21.7551 }, // الجبل الأخضر (البيضاء)
  23: { lat: 32.4925, lng: 20.8306 }, // المرج
  24: { lat: 32.7561, lng: 22.6378 }, // درنة
  25: { lat: 32.0836, lng: 23.9764 }, // طبرق
  31: { lat: 27.0377, lng: 14.4283 }, // سبها
  32: { lat: 25.9155, lng: 13.9184 }, // مرزق
  33: { lat: 26.5921, lng: 12.7762 }, // وادي الحياة (أوباري)
  34: { lat: 24.9647, lng: 10.1728 }, // غات
};

// Geographic centre of Libya — last-resort fallback when a parcel has neither
// a polygon nor a recognised region code.
export const LIBYA_CENTER = { lat: 27.0, lng: 17.0 };
