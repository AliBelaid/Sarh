import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/sarh_api_client.dart';
import '../models/api_error.dart';
import '../models/citizen.dart';

class AuthState {
  final bool initializing;
  final Citizen? citizen;
  final String? token;

  const AuthState({this.initializing = true, this.citizen, this.token});

  bool get isAuthenticated => citizen != null && token != null;

  AuthState copyWith({bool? initializing, Citizen? citizen, String? token}) {
    return AuthState(
      initializing: initializing ?? this.initializing,
      citizen: citizen ?? this.citizen,
      token: token ?? this.token,
    );
  }

  AuthState signedOut() => const AuthState(initializing: false);
}

// AuthController talks to the .NET API directly. Mobile is citizen-only —
// the only entry points are POST /auth/sign-in-with-pin (digital_id_number
// + 6-digit PIN, optionally backed by an NFC tap proof) and a built-in
// demo path that uses Ahmed's seeded card so a fresh checkout works
// without manual data entry.
class AuthController extends StateNotifier<AuthState> {
  final SarhApiClient client;

  AuthController(this.client) : super(const AuthState()) {
    _restore();
  }

  // Cached citizen JSON from the last successful login. The .NET API has
  // no /auth/me endpoint — we trust the JWT until it expires, and the
  // cached citizen lets us render the home screen instantly without a
  // network round-trip on cold start.
  static const _citizenStorageKey = 'sarh_citizen';

  Future<void> _restore() async {
    final token = await client.readToken();
    if (token == null || token.isEmpty || token == 'demo-offline') {
      if (token == 'demo-offline') await client.clearToken();
      state = const AuthState(initializing: false);
      return;
    }
    final citizenJson = await client.storage.read(key: _citizenStorageKey);
    if (citizenJson == null) {
      // Token without cached citizen — nothing useful to render. Treat as
      // signed out and let the user re-enter their PIN.
      await client.clearToken();
      state = const AuthState(initializing: false);
      return;
    }
    try {
      final citizen = Citizen.fromJson(
        (jsonDecode(citizenJson) as Map).cast<String, dynamic>(),
      );
      state = AuthState(initializing: false, token: token, citizen: citizen);
    } catch (_) {
      await client.clearToken();
      await client.storage.delete(key: _citizenStorageKey);
      state = const AuthState(initializing: false);
    }
  }

  // Citizen login: digital_id_number + 6-digit PIN. The NFC tap is part
  // of the UX (anti-replay) but the server-side proof is the SUN URL —
  // sent as `nfc_picc` + `nfc_cmac` when present, ignored by the demo
  // PIN-only path.
  Future<void> login({
    required String digitalIdNumber,
    required String pin,
    String? nfcPicc,
    String? nfcCmac,
  }) async {
    try {
      final res = await client.dio.post(
        '/auth/sign-in-with-pin',
        data: {
          'digital_id_number': digitalIdNumber,
          'pin': pin,
          if (nfcPicc != null) 'nfc_picc': nfcPicc,
          if (nfcCmac != null) 'nfc_cmac': nfcCmac,
        },
      );
      await _persistSignInResponse(res.data);
    } on DioException catch (e) {
      if (e.error is SarhApiError) throw e.error as SarhApiError;
      throw SarhApiError.unknown(e.message ?? 'تعذّر الاتصال بالخادم.');
    }
  }

  // Demo login — uses Ahmed's seeded card. The DbSeeder hosted service in
  // the .NET API stamps PIN `123456` onto cards 301/302 on every boot, so
  // this works without any manual setup. If the seed isn't present (e.g.
  // a fresh DB without 029), the API returns 401 and we surface it.
  static const _demoDigitalIdNumber = 'LY-11-2026-000101-0';
  static const _demoPin = '123456';

  Future<void> loginAsDemo() => login(
        digitalIdNumber: _demoDigitalIdNumber,
        pin: _demoPin,
      );

  Future<void> signOut() async {
    await client.clearToken();
    await client.storage.delete(key: _citizenStorageKey);
    state = const AuthState(initializing: false);
  }

  Future<void> _persistSignInResponse(dynamic raw) async {
    final data = (raw as Map).cast<String, dynamic>();
    final token = data['access_token'] as String?;
    if (token == null) {
      throw SarhApiError.unknown('لم يصل رمز الدخول.');
    }
    final user = (data['user'] as Map?)?.cast<String, dynamic>() ?? const {};
    // Build a minimal Citizen from the JWT user payload. The full citizen
    // record (names, region, photo) gets fetched lazily by the home page
    // — keeping this small avoids a /citizens/{id} round-trip on login.
    final citizen = Citizen(
      id: (user['citizen_id'] as String?) ?? (user['id'] as String? ?? ''),
      firstNameAr: '',
      familyNameAr: '',
      digitalIdNumber: user['email'] is String && (user['email'] as String).startsWith('LY-')
          ? user['email'] as String
          : null,
    );
    await client.writeToken(token);
    await client.storage.write(
      key: _citizenStorageKey,
      value: jsonEncode({
        'id': citizen.id,
        'first_name_ar': citizen.firstNameAr,
        'father_name_ar': citizen.fatherNameAr,
        'grandfather_name_ar': citizen.grandfatherNameAr,
        'family_name_ar': citizen.familyNameAr,
        'phone': citizen.phone,
        'region_id': citizen.regionId,
        'digital_id_number': citizen.digitalIdNumber,
      }),
    );
    state = AuthState(initializing: false, token: token, citizen: citizen);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref.watch(apiClientProvider));
});
