import 'dart:math' as math;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/property.dart';

// Shared state for the property submission wizard. Each step screen
// reads what it needs and writes back via copyWith. Cleared on submit.
//
// The area is NOT typed in: parcels are rarely clean rectangles, so we
// derive it from the drawn boundary polygon (see polygonAreaSqm) — the
// API re-computes it authoritatively via geography.STArea. The registry
// instead requires real evidence: a site photo + a koreky (croquis)
// sketch, both enforced before submit (see hasRequiredDocuments).

class PickedDocument {
  final String path;
  final String documentType;
  final String? titleAr;
  PickedDocument({
    required this.path,
    required this.documentType,
    this.titleAr,
  });
}

class WizardState {
  final PropertyType? type;
  final List<List<double>> polygonRing; // [lng, lat] points; closed ring on submit
  final int? regionId;
  final int? municipalityId;
  final String? addressAr;
  final String? parcelNumber; // رقم القطعة
  final String? planNumber; // رقم المخطط
  final String? blockNumber; // رقم البلوك
  final double? documentedAreaSqm; // area stated on the paper deed (optional)
  final List<PickedDocument> documents;

  const WizardState({
    this.type,
    this.polygonRing = const [],
    this.regionId,
    this.municipalityId,
    this.addressAr,
    this.parcelNumber,
    this.planNumber,
    this.blockNumber,
    this.documentedAreaSqm,
    this.documents = const [],
  });

  bool get hasPolygon => polygonRing.length >= 3;

  // Spherical-excess area in m² from the drawn ring. Mirrors the web
  // wizard's geographicArea; the server recomputes via STArea on submit.
  double? get polygonAreaSqm {
    final pts = polygonRing;
    if (pts.length < 3) return null;
    const r = 6378137.0;
    var area = 0.0;
    final n = pts.length;
    for (var i = 0; i < n; i++) {
      final p1 = pts[i];
      final p2 = pts[(i + 1) % n];
      area += (p2[0] - p1[0]) * math.pi / 180 *
          (2 + math.sin(p1[1] * math.pi / 180) + math.sin(p2[1] * math.pi / 180));
    }
    return (area * r * r / 2).abs();
  }

  // |documented − measured| / measured × 100, or null if either is missing.
  double? get documentedAreaDiffPct {
    final m = polygonAreaSqm;
    final d = documentedAreaSqm;
    if (m == null || m <= 0 || d == null || d <= 0) return null;
    return (d - m).abs() / m * 100;
  }

  // Registry policy: at least one site photo and one koreky sketch.
  bool get hasRequiredDocuments {
    final hasPhoto = documents.any((d) => d.documentType == 'site_photo');
    final hasKoreky = documents.any((d) => d.documentType == 'koreky_certificate');
    return hasPhoto && hasKoreky;
  }

  Map<String, dynamic>? get boundaryPolygonGeoJson {
    if (!hasPolygon) return null;
    final ring = [...polygonRing];
    final first = ring.first;
    final last = ring.last;
    if (first[0] != last[0] || first[1] != last[1]) {
      ring.add([first[0], first[1]]);
    }
    return {
      'type': 'Polygon',
      'coordinates': [ring],
    };
  }

  WizardState copyWith({
    PropertyType? type,
    List<List<double>>? polygonRing,
    int? regionId,
    int? municipalityId,
    String? addressAr,
    String? parcelNumber,
    String? planNumber,
    String? blockNumber,
    double? documentedAreaSqm,
    List<PickedDocument>? documents,
  }) {
    return WizardState(
      type: type ?? this.type,
      polygonRing: polygonRing ?? this.polygonRing,
      regionId: regionId ?? this.regionId,
      municipalityId: municipalityId ?? this.municipalityId,
      addressAr: addressAr ?? this.addressAr,
      parcelNumber: parcelNumber ?? this.parcelNumber,
      planNumber: planNumber ?? this.planNumber,
      blockNumber: blockNumber ?? this.blockNumber,
      documentedAreaSqm: documentedAreaSqm ?? this.documentedAreaSqm,
      documents: documents ?? this.documents,
    );
  }
}

// Sentinel marking "leave this field untouched" in _patch (so a real null
// can clear a value, which copyWith's `?? this.x` cannot express).
const Object _keep = Object();

class WizardController extends StateNotifier<WizardState> {
  WizardController() : super(const WizardState());

  void setType(PropertyType type) => state = state.copyWith(type: type);

  void setPolygon(List<List<double>> ring) =>
      state = state.copyWith(polygonRing: ring);

  void setRegion(int regionId) => state = state.copyWith(regionId: regionId);

  // Optional text fields — empty input clears back to null.
  void setAddress(String? v) => state = _patch(addressAr: _nz(v));
  void setParcelNumber(String? v) => state = _patch(parcelNumber: _nz(v));
  void setPlanNumber(String? v) => state = _patch(planNumber: _nz(v));
  void setBlockNumber(String? v) => state = _patch(blockNumber: _nz(v));
  void setDocumentedArea(double? v) => state = _patch(documentedAreaSqm: v);

  // Trim and collapse blank input to null.
  static String? _nz(String? v) {
    final t = v?.trim();
    return (t == null || t.isEmpty) ? null : t;
  }

  // Field-level patch that can set a value to null. Pass `_keep` (the default)
  // to leave a field as-is; pass any other value (including null) to set it.
  WizardState _patch({
    Object? addressAr = _keep,
    Object? parcelNumber = _keep,
    Object? planNumber = _keep,
    Object? blockNumber = _keep,
    Object? documentedAreaSqm = _keep,
  }) {
    final s = state;
    return WizardState(
      type: s.type,
      polygonRing: s.polygonRing,
      regionId: s.regionId,
      municipalityId: s.municipalityId,
      addressAr: identical(addressAr, _keep) ? s.addressAr : addressAr as String?,
      parcelNumber:
          identical(parcelNumber, _keep) ? s.parcelNumber : parcelNumber as String?,
      planNumber: identical(planNumber, _keep) ? s.planNumber : planNumber as String?,
      blockNumber:
          identical(blockNumber, _keep) ? s.blockNumber : blockNumber as String?,
      documentedAreaSqm: identical(documentedAreaSqm, _keep)
          ? s.documentedAreaSqm
          : documentedAreaSqm as double?,
      documents: s.documents,
    );
  }

  void addDocument(PickedDocument doc) =>
      state = state.copyWith(documents: [...state.documents, doc]);

  void removeDocument(int index) {
    final list = [...state.documents];
    list.removeAt(index);
    state = state.copyWith(documents: list);
  }

  void reset() => state = const WizardState();
}

final wizardStateProvider =
    StateNotifierProvider<WizardController, WizardState>((ref) {
  return WizardController();
});
