import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/api_error.dart';
import '../models/notification.dart';
import '../models/property.dart';
import '../models/verifiable_credential.dart';

// All repositories now read/write Supabase directly. The NestJS API
// stays the eventual source of truth for business logic, but the
// mobile app no longer depends on it being reachable from a phone.
// Demo users (mobile-demo@sarh.ly) operate on the seeded demo citizen
// id; real users need a `citizens` row keyed by their auth UID — we
// look that up at write time.

const _demoEmail = 'mobile-demo@sarh.ly';

Future<String?> _resolveCitizenId(SupabaseClient s) async {
  final user = s.auth.currentUser;
  if (user == null) return null;
  // Demo flow seeds a citizens row keyed by the auth user's UID, so
  // we just trust that and return the UID. Same for real citizens
  // once the issuance station is wired to do the same.
  if (user.email == _demoEmail) return user.id;
  // Real users: prefer a citizens row keyed by auth_user_id, fall
  // back to one keyed by id (matching auth.uid()).
  try {
    final byAuth = await s
        .from('citizens')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
    if (byAuth != null && byAuth['id'] != null) return byAuth['id'] as String;
  } catch (_) {
    // auth_user_id column may not exist on this schema.
  }
  try {
    final byId = await s
        .from('citizens')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
    if (byId != null && byId['id'] != null) return byId['id'] as String;
  } catch (_) {
    // ignore
  }
  return null;
}

class PropertiesRepository {
  final SupabaseClient _supabase;
  PropertiesRepository(this._supabase);

  Future<List<Property>> myProperties() async {
    final citizenId = await _resolveCitizenId(_supabase);
    try {
      var filter = _supabase.from('properties').select();
      if (citizenId != null) {
        filter = filter.eq('owner_citizen_id', citizenId);
      }
      final rows = await filter
          .order('submitted_at', ascending: false)
          .limit(50);
      return (rows as List)
          .cast<Map>()
          .map((m) => Property.fromJson(m.cast<String, dynamic>()))
          .toList();
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }

  Future<Property> get(String id) async {
    try {
      final row = await _supabase
          .from('properties')
          .select()
          .eq('id', id)
          .single();
      return Property.fromJson((row).cast<String, dynamic>());
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
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
    final citizenId = await _resolveCitizenId(_supabase);
    if (citizenId == null) {
      throw SarhApiError.unknown(
        'تعذّر إيجاد ملف المواطن المرتبط بحسابك. سجّل دخولاً تجريبياً أو من محطّة الإصدار.',
      );
    }
    try {
      // NOTE: boundary_polygon is geometry(Polygon, 4326) — PostgREST
      // can't insert geometry directly from JSON, so we skip it from
      // the mobile path. The wizard's GeoJSON is preserved on-device
      // and could be persisted via an RPC (e.g. submit_property_v1)
      // that calls ST_GeomFromGeoJSON internally — Phase 12 task.
      final row = await _supabase
          .from('properties')
          .insert({
            'owner_citizen_id': citizenId,
            'property_type': type.name,
            'region_id': regionId,
            if (municipalityId != null) 'municipality_id': municipalityId,
            if (addressAr != null) 'address_ar': addressAr,
            if (parcelNumber != null) 'parcel_number': parcelNumber,
            'area_sqm': areaSqm,
            if (lengthM != null) 'length_m': lengthM,
            if (widthM != null) 'width_m': widthM,
            if (depthM != null) 'depth_m': depthM,
            'status': 'pending',
            'submitted_at': DateTime.now().toUtc().toIso8601String(),
          })
          .select()
          .single();
      return Property.fromJson((row).cast<String, dynamic>());
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }

  Future<void> uploadDocument({
    required String propertyId,
    required String filePath,
    required String documentType,
    String? titleAr,
  }) async {
    try {
      final file = File(filePath);
      final bytes = await file.readAsBytes();
      final ext = filePath.split('.').last;
      final objectKey =
          'properties/$propertyId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      // Upload to the `property-documents` storage bucket. If the
      // bucket doesn't exist, create one in Supabase Dashboard →
      // Storage with private access.
      await _supabase.storage
          .from('property-documents')
          .uploadBinary(objectKey, bytes);
      await _supabase.from('property_documents').insert({
        'property_id': propertyId,
        'document_type': documentType,
        if (titleAr != null) 'title_ar': titleAr,
        'storage_path': objectKey,
      });
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }
}

class NotificationsRepository {
  final SupabaseClient _supabase;
  NotificationsRepository(this._supabase);

  Future<List<SarhNotification>> inbox() async {
    final citizenId = await _resolveCitizenId(_supabase);
    try {
      var filter = _supabase.from('notifications').select();
      if (citizenId != null) {
        filter = filter.eq('recipient_citizen_id', citizenId);
      }
      final rows = await filter
          .order('sent_at', ascending: false)
          .limit(50);
      return (rows as List)
          .cast<Map>()
          .map((m) => SarhNotification.fromJson(m.cast<String, dynamic>()))
          .toList();
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _supabase
          .from('notifications')
          .update({'read_at': DateTime.now().toUtc().toIso8601String()})
          .eq('id', id);
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }
}

class WalletRepository {
  final SupabaseClient _supabase;
  WalletRepository(this._supabase);

  Future<List<VerifiableCredential>> myCredentials() async {
    final citizenId = await _resolveCitizenId(_supabase);
    try {
      // Credentials are joined to a wallet which is keyed by citizen_id.
      // Use embedded select with !inner to filter by the wallet's owner.
      var filter = _supabase
          .from('ssi_credentials')
          .select('*, wallet:ssi_wallets!inner(citizen_id)');
      if (citizenId != null) {
        filter = filter.eq('wallet.citizen_id', citizenId);
      }
      final rows = await filter
          .order('issued_at', ascending: false)
          .limit(50);
      return (rows as List)
          .cast<Map>()
          .map((m) => VerifiableCredential.fromJson(m.cast<String, dynamic>()))
          .toList();
    } catch (e) {
      throw SarhApiError.unknown(_supabaseErrorMessage(e));
    }
  }
}

String _supabaseErrorMessage(Object e) {
  if (e is PostgrestException) {
    // RLS denials surface here — give a hint instead of leaking the
    // raw SQLSTATE.
    if (e.code == '42501' || (e.message).toLowerCase().contains('row-level')) {
      return 'تعذّر الحفظ — صلاحيات قاعدة البيانات (RLS) لا تسمح. أضف سياسة insert/select للمستخدمين المسجَّلين.';
    }
    return e.message;
  }
  if (e is StorageException) return e.message;
  if (e is DioException) return e.message ?? 'خطأ في الشبكة.';
  return e.toString();
}

// Dio is still wired up in case any screen needs raw HTTP later — but
// repositories no longer route through it. apiClientProvider is kept
// because auth_controller still uses client.writeToken / clearToken.
final propertiesRepoProvider = Provider<PropertiesRepository>(
  (ref) => PropertiesRepository(Supabase.instance.client),
);
final notificationsRepoProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(Supabase.instance.client),
);
final walletRepoProvider = Provider<WalletRepository>(
  (ref) => WalletRepository(Supabase.instance.client),
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
