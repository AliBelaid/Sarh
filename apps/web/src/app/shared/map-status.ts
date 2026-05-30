// Derived "map status" colour buckets for the property maps (public +
// officer). These four colours are a deliberate, product-mandated palette for
// the cadastral map ONLY — distinct from the workflow status pills in
// status-pills.ts. The server computes `map_status` authoritatively
// (043_property_map.sql); the client only paints it.
//
//   🟢 clear     — deed issued, no encumbrance, privately owned → transferable
//   🔴 disputed  — active court seizure / lien / waqf → no dealing allowed
//   🟡 pending   — still in the registration workflow (officer map only)
//   🔵 public    — deed issued, governmental / public-utility ownership
export type MapStatus = 'clear' | 'disputed' | 'pending' | 'public';

export interface MapStatusMeta {
  ar: string;
  /** Solid colour for the polygon stroke + marker dot. */
  color: string;
  /** Translucent fill for the polygon interior. */
  fill: string;
  /** One-line meaning shown in the legend. */
  hint: string;
}

export const MAP_STATUS: Record<MapStatus, MapStatusMeta> = {
  clear: {
    ar: 'سليم — قابل للتصرّف',
    color: '#16A34A',
    fill: 'rgba(22, 163, 74, 0.28)',
    hint: 'العقار معتمد وخالٍ من النزاعات.',
  },
  disputed: {
    ar: 'نزاع / حجز قانوني',
    color: '#DC2626',
    fill: 'rgba(220, 38, 38, 0.28)',
    hint: 'عليه نزاع قضائي أو حجز أو منع تصرّف.',
  },
  pending: {
    ar: 'قيد المراجعة',
    color: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.28)',
    hint: 'لم يكتمل التحقّق أو ما زال طلب التسجيل قائماً.',
  },
  public: {
    ar: 'ملكية عامة',
    color: '#2563EB',
    fill: 'rgba(37, 99, 235, 0.28)',
    hint: 'ملكية حكومية أو مرفق عام.',
  },
};

export function mapStatusMeta(s: string): MapStatusMeta {
  return MAP_STATUS[s as MapStatus] ?? MAP_STATUS.pending;
}

// Order the legend / filter chips are rendered in.
export const MAP_STATUS_ORDER: MapStatus[] = ['clear', 'disputed', 'pending', 'public'];
