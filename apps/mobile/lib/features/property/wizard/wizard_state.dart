import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/property.dart';

// Shared state for the property submission wizard. Each step screen
// reads what it needs and writes back via copyWith. Cleared on submit.

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
  final double? areaSqm;
  final double? lengthM;
  final double? widthM;
  final double? depthM;
  final int? regionId;
  final int? municipalityId;
  final String? addressAr;
  final String? parcelNumber;
  final List<PickedDocument> documents;

  const WizardState({
    this.type,
    this.polygonRing = const [],
    this.areaSqm,
    this.lengthM,
    this.widthM,
    this.depthM,
    this.regionId,
    this.municipalityId,
    this.addressAr,
    this.parcelNumber,
    this.documents = const [],
  });

  bool get hasPolygon => polygonRing.length >= 3;

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
    double? areaSqm,
    double? lengthM,
    double? widthM,
    double? depthM,
    int? regionId,
    int? municipalityId,
    String? addressAr,
    String? parcelNumber,
    List<PickedDocument>? documents,
  }) {
    return WizardState(
      type: type ?? this.type,
      polygonRing: polygonRing ?? this.polygonRing,
      areaSqm: areaSqm ?? this.areaSqm,
      lengthM: lengthM ?? this.lengthM,
      widthM: widthM ?? this.widthM,
      depthM: depthM ?? this.depthM,
      regionId: regionId ?? this.regionId,
      municipalityId: municipalityId ?? this.municipalityId,
      addressAr: addressAr ?? this.addressAr,
      parcelNumber: parcelNumber ?? this.parcelNumber,
      documents: documents ?? this.documents,
    );
  }
}

class WizardController extends StateNotifier<WizardState> {
  WizardController() : super(const WizardState());

  void setType(PropertyType type) => state = state.copyWith(type: type);

  void setPolygon(List<List<double>> ring) =>
      state = state.copyWith(polygonRing: ring);

  void setRegion({required int regionId, int? municipalityId, String? addressAr}) {
    state = state.copyWith(
      regionId: regionId,
      municipalityId: municipalityId,
      addressAr: addressAr,
    );
  }

  void setDimensions({
    required double areaSqm,
    double? lengthM,
    double? widthM,
    double? depthM,
  }) {
    state = state.copyWith(
      areaSqm: areaSqm,
      lengthM: lengthM,
      widthM: widthM,
      depthM: depthM,
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
