import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
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

class AuthController extends StateNotifier<AuthState> {
  final SarhApiClient client;

  AuthController(this.client) : super(const AuthState()) {
    _restore();
  }

  Future<void> _restore() async {
    // Prefer Supabase's persisted session. If present, use it as the
    // source of truth and refresh secure-storage to match.
    final supaSession = Supabase.instance.client.auth.currentSession;
    if (supaSession != null) {
      await client.writeToken(supaSession.accessToken);
      state = AuthState(
        initializing: false,
        token: supaSession.accessToken,
        citizen: await _loadCitizen(supaSession.user),
      );
      return;
    }

    final token = await client.readToken();
    if (token == null || token.isEmpty) {
      state = const AuthState(initializing: false);
      return;
    }
    // Stale legacy sentinel from earlier offline-only mode.
    if (token == 'demo-offline') {
      await client.clearToken();
      state = const AuthState(initializing: false);
      return;
    }
    try {
      final me = await client.dio.get('/auth/me');
      final data = (me.data as Map).cast<String, dynamic>();
      final citizenJson =
          (data['citizen'] as Map?)?.cast<String, dynamic>() ?? data;
      state = AuthState(
        initializing: false,
        citizen: Citizen.fromJson(citizenJson),
        token: token,
      );
    } on DioException catch (e) {
      // Token rejected — clear it.
      if (e.response?.statusCode == 401) {
        await client.clearToken();
      }
      state = const AuthState(initializing: false);
    } catch (_) {
      state = const AuthState(initializing: false);
    }
  }

  // Try to load the citizen row matching the auth user. Returns a
  // synthetic stub (email prefix) if no row exists yet — usually the
  // case for staff/admin users that don't have a citizens entry.
  Future<Citizen> _loadCitizen(User user) async {
    final supabase = Supabase.instance.client;
    final email = user.email ?? '';
    Map<String, dynamic>? row;
    // Try id = auth.uid() first (the demo flow keys citizens this way).
    try {
      row = await supabase
          .from('citizens')
          .select()
          .eq('id', user.id)
          .maybeSingle();
    } catch (_) {
      // ignore — RLS or schema issue
    }
    // Fall back to auth_user_id column (if the schema uses that).
    if (row == null) {
      try {
        row = await supabase
            .from('citizens')
            .select()
            .eq('auth_user_id', user.id)
            .maybeSingle();
      } catch (_) {
        // ignore
      }
    }
    if (row != null) {
      // Optionally pick up the active digital ID number.
      String? digitalIdNumber;
      try {
        final card = await supabase
            .from('digital_id_cards')
            .select('digital_id_number')
            .eq('citizen_id', row['id'] as String)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        digitalIdNumber = card?['digital_id_number'] as String?;
      } catch (_) {
        // ignore
      }
      return Citizen(
        id: row['id'] as String,
        firstNameAr: row['first_name_ar'] as String? ?? '',
        fatherNameAr: row['father_name_ar'] as String?,
        grandfatherNameAr: row['grandfather_name_ar'] as String?,
        familyNameAr: row['family_name_ar'] as String? ?? '',
        phone: row['phone'] as String?,
        regionId: (row['region_id'] as num?)?.toInt(),
        digitalIdNumber: digitalIdNumber,
      );
    }
    return Citizen(
      id: user.id,
      firstNameAr: email.split('@').first,
      familyNameAr: '',
    );
  }

  // Citizen login: digital ID number + 6-digit PIN. The NFC tap is part
  // of the UX (anti-replay) but the server-side proof is the SUN URL —
  // which is sent as `nfc_picc` + `nfc_cmac` when present.
  Future<void> login({
    required String digitalIdNumber,
    required String pin,
    String? nfcPicc,
    String? nfcCmac,
  }) async {
    try {
      final res = await client.dio.post(
        '/auth/citizen/login',
        data: {
          'digital_id_number': digitalIdNumber,
          'pin': pin,
          if (nfcPicc != null) 'nfc_picc': nfcPicc,
          if (nfcCmac != null) 'nfc_cmac': nfcCmac,
        },
      );
      final data = (res.data as Map).cast<String, dynamic>();
      final token = data['access_token'] as String?;
      final citizenJson =
          (data['citizen'] as Map?)?.cast<String, dynamic>() ?? const {};
      if (token == null) {
        throw SarhApiError.unknown('لم يصل رمز الدخول.');
      }
      await client.writeToken(token);
      state = AuthState(
        initializing: false,
        citizen: Citizen.fromJson(citizenJson),
        token: token,
      );
    } on DioException catch (e) {
      if (e.error is SarhApiError) {
        throw e.error as SarhApiError;
      }
      throw SarhApiError.unknown(e.message);
    }
  }

  // Demo login — signs into Supabase with a shared mobile-demo account
  // so the admin web sees the demo user live. Falls back to creating
  // the account on first run. Also upserts the demo citizen row + an
  // active digital_id_card so issuance is "as if" the demo user had
  // already visited a station.
  //
  // Cross-surface: web admin uses `demo@sarh.ly`; the mobile app uses
  // `mobile-demo@sarh.ly` so both sessions can be live simultaneously
  // without one signing the other out. Both land in the same Supabase
  // project, so the admin sees the mobile demo user appear in realtime.
  static const _demoEmail = 'mobile-demo@sarh.ly';
  static const _demoPassword = 'Sarh!Demo2026';
  static const _demoDigitalIdNumber = 'LY-99-2026-000001-0';

  Future<void> loginAsDemo() async {
    final supabase = Supabase.instance.client;

    AuthResponse auth;
    try {
      auth = await supabase.auth.signInWithPassword(
        email: _demoEmail,
        password: _demoPassword,
      );
    } on AuthException catch (e) {
      final msg = e.message.toLowerCase();
      final missingUser =
          msg.contains('invalid login credentials') || msg.contains('user not found');
      if (!missingUser) rethrow;
      await supabase.auth.signUp(email: _demoEmail, password: _demoPassword);
      auth = await supabase.auth.signInWithPassword(
        email: _demoEmail,
        password: _demoPassword,
      );
    }
    final session = auth.session;
    final user = auth.user;
    if (session == null || user == null) {
      throw SarhApiError.unknown(
        'تمّ إنشاء الحساب التجريبي لكن المشروع يطلب تأكيد البريد. '
        'افتح Supabase → Authentication → Providers → Email وعطّل '
        '"Confirm email"، ثم أعد المحاولة.',
      );
    }

    await client.writeToken(session.accessToken);

    // Use the auth user's UID as the citizen primary key so a default
    // "auth.uid() = id" RLS policy works without extra wiring. Same
    // for the digital ID card — keyed off the user UID with a known
    // suffix so reruns are idempotent.
    final citizenId = user.id;
    final cardId = user.id;
    final citizen = Citizen(
      id: citizenId,
      firstNameAr: 'مستخدم',
      fatherNameAr: 'تجريبي',
      grandfatherNameAr: 'صرح',
      familyNameAr: 'ديمو',
      phone: '+218-91-9000001',
      regionId: 11,
      digitalIdNumber: _demoDigitalIdNumber,
    );

    // Surface upsert failures (RLS / schema mismatch) so the user can
    // act — silent failure here is what made property submit blow up
    // with a foreign-key violation on owner_citizen_id.
    try {
      await supabase.from('citizens').upsert({
        'id': citizenId,
        'auth_user_id': citizenId,
        'first_name_ar': 'مستخدم',
        'father_name_ar': 'تجريبي',
        'grandfather_name_ar': 'صرح',
        'family_name_ar': 'ديمو',
        'phone': '+218-91-9000001',
        'region_id': 11,
        'is_active': true,
      }, onConflict: 'id');
      await supabase.from('digital_id_cards').upsert({
        'id': cardId,
        'citizen_id': citizenId,
        'digital_id_number': _demoDigitalIdNumber,
        'status': 'active',
        'issued_at': DateTime.now().toUtc().toIso8601String(),
      }, onConflict: 'id');
    } on PostgrestException catch (e) {
      final isRls = e.code == '42501' ||
          e.message.toLowerCase().contains('row-level') ||
          e.message.toLowerCase().contains('policy');
      if (isRls) {
        throw SarhApiError.unknown(
          'تمّ تسجيل الدخول لكن لا تتوفّر صلاحيات لإنشاء ملفّ المواطن. '
          'افتح Supabase → SQL Editor والصق محتوى الملف '
          'infra/supabase/migrations/025_demo_open_rls.sql ثم أعد المحاولة.',
        );
      }
      throw SarhApiError.unknown('تعذّر إنشاء ملفّ المواطن: ${e.message}');
    }

    state = AuthState(
      initializing: false,
      token: session.accessToken,
      citizen: citizen,
    );
  }

  // Generic email + password sign-in. Used by the "admin login" path on
  // the mobile login screen so a super_admin / officer can sign into
  // the same Supabase project from a phone for testing or remote work.
  Future<void> loginWithEmail({
    required String email,
    required String password,
  }) async {
    final supabase = Supabase.instance.client;
    try {
      final auth = await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );
      final session = auth.session;
      if (session == null) {
        throw SarhApiError.unknown('لم يصل رمز الدخول.');
      }
      await client.writeToken(session.accessToken);
      final citizen = auth.user != null
          ? await _loadCitizen(auth.user!)
          : Citizen(id: 'admin', firstNameAr: email.split('@').first, familyNameAr: '');
      state = AuthState(
        initializing: false,
        token: session.accessToken,
        citizen: citizen,
      );
    } on AuthException catch (e) {
      final m = e.message.toLowerCase();
      if (m.contains('invalid login credentials')) {
        throw SarhApiError.unknown('بيانات الدخول غير صحيحة.');
      }
      if (m.contains('email not confirmed')) {
        throw SarhApiError.unknown('يجب تأكيد البريد الإلكتروني أولاً.');
      }
      throw SarhApiError.unknown(e.message);
    }
  }

  Future<void> signOut() async {
    try {
      await Supabase.instance.client.auth.signOut();
    } catch (_) {
      // ignore — even if Supabase is unreachable, clear local state
    }
    await client.clearToken();
    state = const AuthState(initializing: false);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref.watch(apiClientProvider));
});
