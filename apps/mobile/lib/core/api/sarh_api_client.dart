import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show ChangeNotifier;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/api_error.dart';
import 'demo_mock_data.dart';

// Single dio instance, with:
//   - JWT bearer interceptor (reads from secure storage)
//   - Error decoder that turns the SarhException envelope into a
//     SarhApiError so callers can show messageAr directly.
class SarhApiClient {
  final Dio dio;
  final FlutterSecureStorage storage;

  SarhApiClient({required this.dio, required this.storage});

  static SarhApiClient build({
    required String baseUrl,
    void Function()? onUnauthorized,
  }) {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      contentType: 'application/json',
      responseType: ResponseType.json,
    ));
    const storage = FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
    );

    // Order matters: demo interceptor runs first so it can short-circuit
    // requests before the auth/error interceptors touch them.
    dio.interceptors.add(_DemoInterceptor(storage));
    dio.interceptors.add(_AuthInterceptor(storage));
    dio.interceptors.add(_ErrorInterceptor(storage, onUnauthorized));
    return SarhApiClient(dio: dio, storage: storage);
  }

  Future<String?> readToken() => storage.read(key: 'sarh_jwt');
  Future<void> writeToken(String value) =>
      storage.write(key: 'sarh_jwt', value: value);
  Future<void> clearToken() => storage.delete(key: 'sarh_jwt');
}

// Short-circuits every API call when the user is signed in offline as
// the demo citizen. We resolve with canned mock data instead of issuing
// the network request, so screens render without a live backend.
class _DemoInterceptor extends Interceptor {
  static const _demoToken = 'demo-offline';
  final FlutterSecureStorage storage;
  _DemoInterceptor(this.storage);

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await storage.read(key: 'sarh_jwt');
    if (token != _demoToken) {
      return handler.next(options);
    }
    final mock = _route(options);
    if (mock == null) {
      // Path not mocked — return an empty success rather than a network
      // error, so the UI shows an empty state instead of "connection
      // refused".
      return handler.resolve(_okResponse(options, const {'items': []}));
    }
    return handler.resolve(_okResponse(options, mock));
  }

  Map<String, dynamic>? _route(RequestOptions opts) {
    final path = opts.path;
    final method = opts.method.toUpperCase();

    if (method == 'GET') {
      if (path == '/properties') return mockMyProperties();
      if (path.startsWith('/properties/')) {
        final id = path.substring('/properties/'.length).split('/').first;
        return mockProperty(id);
      }
      if (path == '/notifications') return mockNotifications();
      if (path == '/verify/map') return mockCadastralMap();
      if (path == '/ssi/credentials') return mockCredentials();
      if (path == '/auth/me') {
        return {
          'citizen': {
            'id': 'demo-citizen',
            'first_name_ar': 'مستخدم',
            'father_name_ar': 'تجريبي',
            'grandfather_name_ar': 'صرح',
            'family_name_ar': 'ديمو',
            'phone': '+218-91-9000001',
            'region_id': 11,
            'digital_id_number': 'LY-99-2026-000001-0',
          },
        };
      }
    }

    if (method == 'POST') {
      if (path == '/properties' && opts.data is Map) {
        return mockSubmittedProperty((opts.data as Map).cast<String, dynamic>());
      }
      if (path.startsWith('/notifications/') && path.endsWith('/read')) {
        return const {'ok': true};
      }
    }

    return null;
  }

  Response<dynamic> _okResponse(RequestOptions opts, dynamic data) {
    return Response<dynamic>(
      requestOptions: opts,
      statusCode: 200,
      statusMessage: 'OK (demo)',
      data: data,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  final FlutterSecureStorage storage;
  _AuthInterceptor(this.storage);

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await storage.read(key: 'sarh_jwt');
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}

class _ErrorInterceptor extends Interceptor {
  final FlutterSecureStorage storage;
  final void Function()? onUnauthorized;
  _ErrorInterceptor(this.storage, this.onUnauthorized);

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
    // 401 means the JWT is missing, expired, or invalid. The mobile app
    // is citizen-only and there's no refresh-token flow yet, so the only
    // safe response is to wipe the stale credentials and bounce the user
    // back to the login screen. Auth never returns 401 to itself (a bad
    // PIN does), so we skip cleanup when the failing request *is* the
    // sign-in call — otherwise the user sees a "please sign in" reset
    // loop instead of a "wrong PIN" message.
    final isAuthRequest = err.requestOptions.path.contains('/auth/');
    if (response?.statusCode == 401 && !isAuthRequest) {
      // Fire-and-forget; we don't want to delay the error envelope.
      // The router watches the auth controller and will redirect to
      // /login on the next frame.
      Future.microtask(() async {
        await storage.delete(key: 'sarh_jwt');
        await storage.delete(key: 'sarh_citizen');
        onUnauthorized?.call();
      });
    }
    if (response != null && response.data is Map) {
      final mapped = SarhApiError.fromJson(
        response.statusCode ?? 0,
        (response.data as Map).cast<String, dynamic>(),
      );
      return handler.reject(
        DioException(
          requestOptions: err.requestOptions,
          response: response,
          error: mapped,
          type: err.type,
        ),
      );
    }
    handler.next(err);
  }
}

// Compile-time API base URL (…/api/v1). Used as-is when a developer passes an
// explicit --dart-define=SARH_API_URL=http://<host>:3001/api/v1; otherwise it
// is just the first probe candidate. The 10.0.2.2 default is the Android
// *emulator* alias for the host loopback — it does NOT route from a physical
// device, which is why we fall back (see resolveApiBaseUrl).
const sarhApiBaseUrl = String.fromEnvironment(
  'SARH_API_URL',
  defaultValue: 'http://10.0.2.2:3001/api/v1',
);

// The base URL actually in use. Defaults to the compile-time value and is
// replaced once at startup by resolveApiBaseUrl(). Screens that build public
// links (e.g. the verify deed PDF) read this so they track the resolved host.
// Set exactly once in main() before any widget builds, so plain mutation is safe.
String activeApiBaseUrl = sarhApiBaseUrl;

// Picks a reachable API host so the app "just works" on the emulator
// (10.0.2.2), a USB-tethered physical device (localhost via `adb reverse
// tcp:3001`), an iOS simulator / web / desktop (localhost), without anyone
// remembering a --dart-define.
//
//   * An explicit --dart-define=SARH_API_URL wins outright — no probing.
//   * Otherwise every candidate's /health is probed concurrently and the
//     first 200 wins. If none answer (offline / LAN-only / demo mode) we keep
//     the compile-time default, so behaviour is never worse than before.
//
// For a LAN device with no adb tunnel the host IP is unknowable here — pass it
// via --dart-define.
Future<String> resolveApiBaseUrl() async {
  if (bool.hasEnvironment('SARH_API_URL')) return sarhApiBaseUrl;
  const candidates = <String>[
    'http://localhost:3001/api/v1',
    'http://127.0.0.1:3001/api/v1',
    'http://10.0.2.2:3001/api/v1',
  ];
  return await _firstReachable(candidates) ?? sarhApiBaseUrl;
}

Future<String?> _firstReachable(List<String> bases) async {
  final probe = Dio(BaseOptions(
    connectTimeout: const Duration(milliseconds: 1500),
    receiveTimeout: const Duration(milliseconds: 1500),
  ));
  final completer = Completer<String?>();
  var pending = bases.length;
  for (final base in bases) {
    () async {
      var ok = false;
      try {
        final res = await probe.get<dynamic>('$base/health');
        ok = res.statusCode == 200;
      } catch (_) {
        ok = false;
      }
      if (ok) {
        if (!completer.isCompleted) completer.complete(base);
      } else if (--pending == 0 && !completer.isCompleted) {
        completer.complete(null);
      }
    }();
  }
  final result = await completer.future;
  probe.close(force: true);
  return result;
}

// Exposed in the provider tree by the widget bootstrap so screens can
// depend on `apiClientProvider` without each one constructing a dio.
final apiClientProvider = Provider<SarhApiClient>((ref) {
  return SarhApiClient.build(
    baseUrl: activeApiBaseUrl,
    // On a 401 from any non-auth endpoint, flip the auth controller to
    // signed-out so the GoRouter redirect sends the user to /login on
    // the next frame instead of leaving them staring at a raw error.
    onUnauthorized: () {
      ref.read(_authBusProvider).fire();
    },
  );
});

// Tiny pub/sub used only to break the apiClient ↔ authController cycle:
// the api client holds a callback that fires this bus on 401, and the
// auth controller (which depends on the api client) subscribes to it
// in its constructor. Bus has no behavior beyond notifying listeners.
class AuthBus extends ChangeNotifier {
  void fire() => notifyListeners();
}

final _authBusProvider = Provider<AuthBus>((_) => AuthBus());
// Re-exported so AuthController can subscribe without touching internals.
final authBusProvider = _authBusProvider;
