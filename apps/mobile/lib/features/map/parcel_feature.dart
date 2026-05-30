import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api/sarh_api_client.dart';
import '../../core/models/api_error.dart';

// One parcel on the public cadastral map. Carries PUBLIC attributes only —
// never an owner name or national number (the /verify/map feed omits them by
// design). Shape matches MapFeatureProps on the .NET side.
class ParcelFeature {
  final String id;
  final String? propertyCode;
  final String? parcelNumber;
  final String propertyType;
  final String status;
  final String mapStatus;
  final int? regionId;
  final double? areaSqm;
  final DateTime? updatedAt;
  final bool hasActiveDispute;
  final double lng;
  final double lat;
  // Outer boundary ring as [lng,lat] pairs (GeoJSON order).
  final List<List<double>> ring;

  ParcelFeature({
    required this.id,
    required this.propertyCode,
    required this.parcelNumber,
    required this.propertyType,
    required this.status,
    required this.mapStatus,
    required this.regionId,
    required this.areaSqm,
    required this.updatedAt,
    required this.hasActiveDispute,
    required this.lng,
    required this.lat,
    required this.ring,
  });

  // [lng,lat] ring → LatLng list for flutter_map's PolygonLayer.
  List<LatLng> get latLngRing =>
      ring.map((p) => LatLng(p[1], p[0])).toList(growable: false);

  LatLng get center => LatLng(lat, lng);

  static ParcelFeature? fromGeoJson(Map<String, dynamic> f) {
    final props = (f['properties'] as Map?)?.cast<String, dynamic>();
    final geom = (f['geometry'] as Map?)?.cast<String, dynamic>();
    if (props == null) return null;

    final ring = <List<double>>[];
    final coords = geom?['coordinates'];
    if (coords is List && coords.isNotEmpty && coords.first is List) {
      for (final pt in coords.first as List) {
        if (pt is List && pt.length >= 2) {
          ring.add([(pt[0] as num).toDouble(), (pt[1] as num).toDouble()]);
        }
      }
    }
    if (ring.length < 3) return null; // nothing to draw

    DateTime? updated;
    final u = props['updated_at'];
    if (u is String) updated = DateTime.tryParse(u);

    return ParcelFeature(
      id: props['id'] as String? ?? '',
      propertyCode: props['property_code'] as String?,
      parcelNumber: props['parcel_number'] as String?,
      propertyType: props['property_type'] as String? ?? 'residential',
      status: props['status'] as String? ?? 'approved',
      mapStatus: props['map_status'] as String? ?? 'pending',
      regionId: (props['region_id'] as num?)?.toInt(),
      areaSqm: (props['area_sqm'] as num?)?.toDouble(),
      updatedAt: updated,
      hasActiveDispute: props['has_active_dispute'] as bool? ?? false,
      lng: (props['lng'] as num?)?.toDouble() ?? 0,
      lat: (props['lat'] as num?)?.toDouble() ?? 0,
      ring: ring,
    );
  }
}

// Talks to the PUBLIC map feed. No auth required (verify.sarh.ly is public),
// but the shared dio client attaches the JWT if one is present — harmless.
class MapRepository {
  final SarhApiClient client;
  MapRepository(this.client);

  Future<List<ParcelFeature>> publicMap({int? regionId}) async {
    try {
      final res = await client.dio.get(
        '/verify/map',
        queryParameters: regionId != null ? {'region_id': regionId} : null,
      );
      final data = res.data;
      final feats = (data is Map && data['features'] is List)
          ? (data['features'] as List)
          : const [];
      return feats
          .cast<Map>()
          .map((m) => ParcelFeature.fromGeoJson(m.cast<String, dynamic>()))
          .whereType<ParcelFeature>()
          .toList();
    } on DioException catch (e) {
      if (e.error is SarhApiError) throw e.error as SarhApiError;
      throw SarhApiError.unknown(e.message ?? 'تعذّر تحميل الخريطة العقارية.');
    }
  }
}

final mapRepoProvider = Provider<MapRepository>(
  (ref) => MapRepository(ref.watch(apiClientProvider)),
);

final cadastralMapProvider =
    FutureProvider.autoDispose<List<ParcelFeature>>((ref) async {
  return ref.watch(mapRepoProvider).publicMap();
});
