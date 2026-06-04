// Libyan administrative regions, mirroring the web app's REGIONS map
// (apps/web/src/app/shared/status-pills.ts). The numeric id is what the API
// stores on citizens/properties (region_id); the Arabic label is shown in the
// property wizard's region picker. Keep the two lists in sync.
const Map<int, String> kRegions = {
  11: 'طرابلس',
  12: 'الجفارة',
  13: 'الزاوية',
  14: 'النقاط الخمس',
  15: 'مصراتة',
  16: 'المرقب',
  21: 'بنغازي',
  22: 'الجبل الأخضر',
  23: 'المرج',
  24: 'درنة',
  25: 'طبرق',
  31: 'سبها',
  32: 'مرزق',
  33: 'وادي الحياة',
  34: 'غات',
};

String regionLabel(int? id) =>
    id == null ? '—' : (kRegions[id] ?? 'منطقة $id');
