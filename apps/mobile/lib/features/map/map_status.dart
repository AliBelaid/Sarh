import 'package:flutter/material.dart';

// Derived "map status" colour buckets for the cadastral map — the exact
// product-mandated palette mirrored from the web app
// (apps/web/src/app/shared/map-status.ts). The server computes `map_status`
// authoritatively; the client only paints it.
//
//   🟢 clear     — deed issued, no encumbrance, privately owned → transferable
//   🔴 disputed  — active court seizure / lien / waqf → no dealing allowed
//   🟡 pending   — still in the registration workflow
//   🔵 public    — deed issued, governmental / public-utility ownership
class MapStatusMeta {
  final String ar;
  final Color color;
  final String hint;
  const MapStatusMeta(this.ar, this.color, this.hint);
}

const Map<String, MapStatusMeta> kMapStatus = {
  'clear': MapStatusMeta(
    'سليم — قابل للتصرّف',
    Color(0xFF16A34A),
    'العقار معتمد وخالٍ من النزاعات.',
  ),
  'disputed': MapStatusMeta(
    'نزاع / حجز قانوني',
    Color(0xFFDC2626),
    'عليه نزاع قضائي أو حجز أو منع تصرّف.',
  ),
  'pending': MapStatusMeta(
    'قيد المراجعة',
    Color(0xFFF59E0B),
    'لم يكتمل التحقّق أو ما زال طلب التسجيل قائماً.',
  ),
  'public': MapStatusMeta(
    'ملكية عامة',
    Color(0xFF2563EB),
    'ملكية حكومية أو مرفق عام.',
  ),
};

MapStatusMeta mapStatusMeta(String s) => kMapStatus[s] ?? kMapStatus['pending']!;

const List<String> kMapStatusOrder = ['clear', 'disputed', 'pending', 'public'];

// Arabic property-type labels (mirrors PROPERTY_TYPE on the web).
const Map<String, String> kPropertyTypeAr = {
  'residential': 'سكني',
  'agricultural': 'زراعي',
  'commercial': 'تجاري',
  'governmental': 'حكومي',
  'industrial': 'صناعي',
  'mixed': 'مختلط',
};

String propertyTypeAr(String t) => kPropertyTypeAr[t] ?? t;
