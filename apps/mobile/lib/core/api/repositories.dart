import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'sarh_api_client.dart';
import '../models/api_error.dart';
import '../models/notification.dart';
import '../models/property.dart';
import '../models/verifiable_credential.dart';

// Repositories now route through the .NET 8 API directly via the shared
// dio client (sarh_api_client.dart). Citizen scope is enforced server-side
// from the JWT, so we never have to send `citizen_id` from the mobile app.
//
// Three repos:
//   - PropertiesRepository  → /api/v1/properties
//   - NotificationsRepository → /api/v1/me/notifications
//   - WalletRepository      → returns [] until /api/v1/me/credentials lands

List<Map<String, dynamic>> _items(dynamic raw) {
  // CursorPage<T> serialises as { items: [...], next_cursor: string|null }.
  // Defensive: also accept a bare list, in case some endpoint changes.
  if (raw is Map && raw['items'] is List) {
    return (raw['items'] as List)
        .cast<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
  }
  if (raw is List) {
    return raw
        .cast<Map>()
        .map((m) => m.cast<String, dynamic>())
        .toList();
  }
  return const [];
}

class PropertiesRepository {
  final SarhApiClient client;
  PropertiesRepository(this.client);

  Future<List<Property>> myProperties() async {
    try {
      final res = await client.dio.get(
        '/properties',
        queryParameters: const {'limit': 50},
      );
      return _items(res.data)
          .map((m) => Property.fromJson(m))
          .toList();
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  Future<Property> get(String id) async {
    try {
      final res = await client.dio.get('/properties/$id');
      return Property.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  Future<Property> submit({
    required PropertyType type,
    required int regionId,
    int? municipalityId,
    String? addressAr,
    String? parcelNumber,
    required Map<String, dynamic> boundaryPolygonGeoJson,
    required double areaSqm,
    double? lengthM,
    double? widthM,
    double? depthM,
  }) async {
    try {
      final res = await client.dio.post(
        '/properties',
        data: {
          'property_type': type.name,
          'region_id': regionId,
          if (municipalityId != null) 'municipality_id': municipalityId,
          if (addressAr != null) 'address_ar': addressAr,
          if (parcelNumber != null) 'parcel_number': parcelNumber,
          'boundary_polygon': boundaryPolygonGeoJson,
          'area_sqm': areaSqm,
          if (lengthM != null) 'length_m': lengthM,
          if (widthM != null) 'width_m': widthM,
          if (depthM != null) 'depth_m': depthM,
        },
      );
      // SubmitResult shape: { property: {...}, request: {...} }.
      // Fall back to the raw body if the API ever inlines the property.
      final body = (res.data as Map).cast<String, dynamic>();
      final property = (body['property'] as Map?)?.cast<String, dynamic>() ?? body;
      return Property.fromJson(property);
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  Future<void> uploadDocument({
    required String propertyId,
    required String filePath,
    required String documentType,
    String? titleAr,
  }) async {
    try {
      final formData = FormData.fromMap({
        'property_id': propertyId,
        'document_type': documentType,
        if (titleAr != null) 'title_ar': titleAr,
        'file': await MultipartFile.fromFile(
          filePath,
          filename: filePath.split(Platform.pathSeparator).last,
        ),
      });
      await client.dio.post('/uploads/property-document', data: formData);
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }
}

class NotificationsRepository {
  final SarhApiClient client;
  NotificationsRepository(this.client);

  Future<List<SarhNotification>> inbox() async {
    try {
      final res = await client.dio.get(
        '/me/notifications',
        queryParameters: const {'limit': 50},
      );
      return _items(res.data)
          .map((m) => SarhNotification.fromJson(m))
          .toList();
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await client.dio.post('/me/notifications/$id/read');
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }
}

class WalletRepository {
  final SarhApiClient client;
  WalletRepository(this.client);

  // The .NET API does not yet expose /api/v1/me/credentials — return
  // an empty list so the wallet screen renders cleanly. Wire this up
  // when the SSI credentials endpoint lands.
  Future<List<VerifiableCredential>> myCredentials() async => const [];
}

SarhApiError _toSarhError(DioException e) {
  if (e.error is SarhApiError) return e.error as SarhApiError;
  return SarhApiError.unknown(e.message ?? 'تعذّر الاتصال بالخادم.');
}

final propertiesRepoProvider = Provider<PropertiesRepository>(
  (ref) => PropertiesRepository(ref.watch(apiClientProvider)),
);
final notificationsRepoProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);
final walletRepoProvider = Provider<WalletRepository>(
  (ref) => WalletRepository(ref.watch(apiClientProvider)),
);

final myPropertiesProvider =
    FutureProvider.autoDispose<List<Property>>((ref) async {
  return ref.watch(propertiesRepoProvider).myProperties();
});

final propertyDetailProvider =
    FutureProvider.autoDispose.family<Property, String>((ref, id) async {
  return ref.watch(propertiesRepoProvider).get(id);
});

final myNotificationsProvider =
    FutureProvider.autoDispose<List<SarhNotification>>((ref) async {
  return ref.watch(notificationsRepoProvider).inbox();
});

final myCredentialsProvider =
    FutureProvider.autoDispose<List<VerifiableCredential>>((ref) async {
  return ref.watch(walletRepoProvider).myCredentials();
});
