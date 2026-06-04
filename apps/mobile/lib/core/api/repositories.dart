import 'dart:io';
import 'dart:typed_data';
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

  // Attached evidence (site photos + koreky sketch) for a property.
  Future<List<PropertyDocumentInfo>> documents(String propertyId) async {
    try {
      final res = await client.dio.get('/properties/$propertyId/documents');
      return _items(res.data)
          .map((m) => PropertyDocumentInfo.fromJson(m))
          .toList();
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  // Raw bytes of a single attachment, for in-app preview (the dio interceptor
  // attaches the JWT). Used by the property detail document viewer.
  Future<Uint8List> documentBytes(String propertyId, String docId) async {
    try {
      final res = await client.dio.get<List<int>>(
        '/properties/$propertyId/documents/$docId/file',
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data ?? const []);
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }

  // Documents are attached inline at create time (the API requires a site
  // photo + koreky sketch and rejects the submit otherwise). Each entry is
  // a map: { document_type, storage_path, mime_type?, file_size_bytes?,
  // file_hash?, title_ar? } built from uploadFile() results.
  Future<Property> submit({
    required PropertyType type,
    required int regionId,
    int? municipalityId,
    String? addressAr,
    String? parcelNumber,
    String? planNumber,
    String? blockNumber,
    required Map<String, dynamic> boundaryPolygonGeoJson,
    required double areaSqm,
    double? documentedAreaSqm,
    required List<Map<String, dynamic>> documents,
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
          if (planNumber != null) 'plan_number': planNumber,
          if (blockNumber != null) 'block_number': blockNumber,
          'boundary_polygon': boundaryPolygonGeoJson,
          // Authoritative area is the polygon's — never length × width.
          'area_sqm': areaSqm,
          if (documentedAreaSqm != null) 'documented_area_sqm': documentedAreaSqm,
          'documents': documents,
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

  // Stores a single file and returns its metadata. The `storage_path`
  // ("<bucket>/<path>") feeds the documents[] array on submit().
  Future<UploadedFile> uploadFile(String filePath) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          filePath,
          filename: filePath.split(Platform.pathSeparator).last,
        ),
      });
      final res = await client.dio.post('/uploads/property-document', data: formData);
      final body = (res.data as Map).cast<String, dynamic>();
      return UploadedFile(
        storagePath: body['path'] as String,
        mimeType: body['mime_type'] as String?,
        sizeBytes: (body['size'] as num?)?.toInt(),
        sha256: body['sha256'] as String?,
      );
    } on DioException catch (e) {
      throw _toSarhError(e);
    }
  }
}

class UploadedFile {
  final String storagePath;
  final String? mimeType;
  final int? sizeBytes;
  final String? sha256;
  UploadedFile({
    required this.storagePath,
    this.mimeType,
    this.sizeBytes,
    this.sha256,
  });
}

class PropertyDocumentInfo {
  final String id;
  final String documentType;
  final String? titleAr;
  final String? mimeType;
  final int? fileSizeBytes;
  PropertyDocumentInfo({
    required this.id,
    required this.documentType,
    this.titleAr,
    this.mimeType,
    this.fileSizeBytes,
  });

  factory PropertyDocumentInfo.fromJson(Map<String, dynamic> m) =>
      PropertyDocumentInfo(
        id: m['id'] as String,
        documentType: (m['document_type'] as String?) ?? 'other',
        titleAr: m['title_ar'] as String?,
        mimeType: m['mime_type'] as String?,
        fileSizeBytes: (m['file_size_bytes'] as num?)?.toInt(),
      );
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

  // SSI verifiable credentials in the citizen's wallet. The .NET API returns
  // a bare JSON array of credential views (DigitalId + PropertyDeed); a 401/404
  // or transport error degrades to an empty wallet rather than an error screen.
  Future<List<VerifiableCredential>> myCredentials() async {
    try {
      final res = await client.dio.get('/me/credentials');
      return _items(res.data)
          .map((m) => VerifiableCredential.fromJson(m))
          .toList();
    } on DioException catch (_) {
      return const [];
    }
  }
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

final propertyDocumentsProvider =
    FutureProvider.autoDispose.family<List<PropertyDocumentInfo>, String>(
        (ref, id) async {
  return ref.watch(propertiesRepoProvider).documents(id);
});

final propertyDocumentBytesProvider = FutureProvider.autoDispose
    .family<Uint8List, ({String propertyId, String docId})>((ref, k) async {
  return ref.watch(propertiesRepoProvider).documentBytes(k.propertyId, k.docId);
});

final myNotificationsProvider =
    FutureProvider.autoDispose<List<SarhNotification>>((ref) async {
  return ref.watch(notificationsRepoProvider).inbox();
});

final myCredentialsProvider =
    FutureProvider.autoDispose<List<VerifiableCredential>>((ref) async {
  return ref.watch(walletRepoProvider).myCredentials();
});
