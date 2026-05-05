import 'package:dio/dio.dart';
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

  static SarhApiClient build({required String baseUrl}) {
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
    dio.interceptors.add(_ErrorInterceptor());
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
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final response = err.response;
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

// Exposed in the provider tree by the widget bootstrap so screens can
// depend on `apiClientProvider` without each one constructing a dio.
final apiClientProvider = Provider<SarhApiClient>((ref) {
  // The actual baseUrl comes from --dart-define=SARH_API_URL=...
  // Fallback is the local dev API.
  const fallback = 'http://10.0.2.2:3000/api/v1';
  const baseUrl = String.fromEnvironment('SARH_API_URL', defaultValue: fallback);
  return SarhApiClient.build(baseUrl: baseUrl);
});
