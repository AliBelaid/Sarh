# تطبيق الجوّال (Flutter)

يوثّق هذا الفصل تطبيق الجوّال الخاص بمنصّة **صَرح** — تطبيق المواطن المكتوب بـ Flutter، والموجود بالكامل تحت `apps/mobile/`. التطبيق موجَّه للمواطن الليبي فقط (citizen-only)، ويتيح له تسجيل الدخول بالهوية الرقمية، واستعراض بطاقته الرقمية، وتسجيل عقاراته على الخريطة، ومتابعة حالة الطلبات، وحمل شهاداته الرقمية (VC) في محفظة، والتحقّق من بطاقة NFC، وتصفّح الخريطة العقارية العامّة.

## نظرة عامة على الحزمة والاعتماديات

المصدر: `apps/mobile/pubspec.yaml`. اسم الحزمة `sarh_mobile`، الإصدار `1.0.1+2`، وبيئة `sdk: ^3.4.0` مع `flutter: ">=3.22.0"`.

| المجال | الحزمة (Pinned) | الاستخدام في صَرح |
| --- | --- | --- |
| إدارة الحالة | `flutter_riverpod: ^2.5.1` | كل مزوّدات الحالة (providers) |
| التوجيه | `go_router: ^14.6.0` | جدول المسارات + حارس المصادقة |
| HTTP | `dio: ^5.7.0` | عميل الـ API الموحّد + الـ interceptors |
| تخزين آمن | `flutter_secure_storage: ^9.2.2` | حفظ الـ JWT وبيانات المواطن |
| NFC | `flutter_nfc_kit: ^3.5.2` | قراءة NTAG 424 DNA (تسجيل الدخول + التحقّق) |
| الخرائط/الهندسة | `mapbox_maps_flutter: ^2.3.0`، `latlong2: ^0.9.1`، `flutter_map: ^7.0.2`، `geolocator: ^13.0.1` | رسم مضلّع الحدود + التتبّع بالمشي + الخريطة العامّة |
| الكاميرا/الملفات | `image_picker: ^1.1.2`، `file_picker: ^8.1.4` | إرفاق صور الموقع/الكروكي وملفات PDF |
| رموز QR | `qr_flutter: ^4.1.0`، `mobile_scanner: ^5.2.3` | مشاركة الشهادات عبر QR |
| متفرّقات | `intl: ^0.20.2`، `flutter_svg: ^2.0.10+1`، `url_launcher: ^6.3.1`، `shared_preferences: ^2.3.3` | التنسيق، فتح سند PDF، حالة الـ onboarding |

الخط المرفق هو **Cairo** (متغيّر، وزنَا 400 و700) من `assets/fonts/Cairo-Variable.ttf`، ويُستخدم لدعم العربية واللاتينية معاً.

يُلاحَظ أنّ رغم إدراج `mapbox_maps_flutter` في الاعتماديات، فإنّ كل الخرائط الفعلية في الشيفرة تُرسَم عبر `flutter_map` فوق بلاطات OpenStreetMap؛ لا يوجد استخدام لـ Mapbox في الشيفرة المقروءة.

## نقطة الدخول والتهيئة العامّة

المصدر: `apps/mobile/lib/main.dart`.

```dart
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // اختيار مضيف API قابل للوصول قبل بناء أول Widget
  activeApiBaseUrl = await resolveApiBaseUrl();
  runApp(const ProviderScope(child: SarhApp()));
}
```

تتم تهيئة التطبيق على النحو التالي:

- استدعاء `resolveApiBaseUrl()` **قبل** بناء أوّل Widget لاختيار مضيف الـ API الأنسب (محاكي مقابل جهاز فعلي)، وتخزين النتيجة في المتغيّر العام `activeApiBaseUrl`.
- تغليف الشجرة بـ `ProviderScope` (Riverpod).
- الجذر `SarhApp` هو `ConsumerWidget` يبني `MaterialApp.router`:
  - العنوان `'صرح'`، السمة `SarhTheme.light()`.
  - اللغة الافتراضية `Locale('ar', 'LY')`، مع دعم `Locale('en', 'US')`.
  - مندوبات التعريب: `GlobalMaterialLocalizations`، `GlobalWidgetsLocalizations`، `GlobalCupertinoLocalizations`.
  - **فرض RTL عالمياً**: عبر `builder` يُغلَّف كل التطبيق داخل `Directionality(textDirection: TextDirection.rtl)` (القيد غير القابل للتفاوض رقم 1 في CLAUDE.md).
  - `routerConfig` يُقرأ من `routerProvider`.

## التوجيه (go_router)

المصدر: `apps/mobile/lib/app/router.dart`.

### جدول المسارات

تُعرَّف كل المسارات كثوابت في الصنف `AppRoutes`، وتُبنى داخل `routerProvider` (وهو `Provider<GoRouter>`). المسار الابتدائي هو `AppRoutes.splash`.

| ثابت المسار | المسار | الشاشة (builder) | الملف |
| --- | --- | --- | --- |
| `AppRoutes.splash` | `/` | `SplashScreen` | `features/splash/splash_screen.dart` |
| `AppRoutes.onboarding` | `/onboarding` | `OnboardingScreen` | `features/onboarding/onboarding_screen.dart` |
| `AppRoutes.login` | `/login` | `LoginScreen` | `features/auth/login_screen.dart` |
| `AppRoutes.home` | `/home` | `HomeScreen` | `features/home/home_screen.dart` |
| `AppRoutes.wizard` | `/property/new` | `WizardStepType` | `features/property/wizard/step_type.dart` |
| `AppRoutes.wizardLocation` | `/property/new/location` | `WizardStepLocation` | `features/property/wizard/step_location.dart` |
| `AppRoutes.wizardDocuments` | `/property/new/documents` | `WizardStepDocuments` | `features/property/wizard/step_documents.dart` |
| `AppRoutes.wizardReview` | `/property/new/review` | `WizardStepReview` | `features/property/wizard/step_review.dart` |
| — | `/property/:id` | `PropertyDetailScreen(id:)` | `features/property/property_detail_screen.dart` |
| `AppRoutes.wallet` | `/wallet` | `WalletScreen` | `features/wallet/wallet_screen.dart` |
| `AppRoutes.notifications` | `/notifications` | `NotificationsScreen` | `features/notifications/notifications_screen.dart` |
| `AppRoutes.profile` | `/profile` | `ProfileScreen` | `features/profile/profile_screen.dart` |
| `AppRoutes.nfcVerify` | `/nfc-verify` | `NfcVerifyScreen` | `features/nfc/nfc_verify_screen.dart` |
| `AppRoutes.cadastralMap` | `/cadastral-map` | `CadastralMapScreen` | `features/map/cadastral_map_screen.dart` |

يوفّر `AppRoutes` كذلك دالّة مساعدة لبناء مسار التفاصيل: `static String propertyDetail(String id) => '/property/$id';`.

### حارس المصادقة (redirect)

يراقب `routerProvider` حالة `authControllerProvider`، فيُعاد بناء الـ `GoRouter` كلّما انقلبت حالة الدخول لتُعاد الحُرّاس تقييمها فوراً. منطق إعادة التوجيه:

```dart
redirect: (ctx, state) {
  if (auth.initializing) return null;               // انتظر حتى ينتهي فحص التوكن
  final loggedIn = auth.isAuthenticated;
  final isAuthRoute = state.matchedLocation == AppRoutes.login ||
      state.matchedLocation == AppRoutes.onboarding ||
      state.matchedLocation == AppRoutes.splash;
  if (!loggedIn && !isAuthRoute) return AppRoutes.login;          // غير مصادَق → /login
  if (loggedIn && isAuthRoute && state.matchedLocation != AppRoutes.splash) {
    return AppRoutes.home;                                        // مصادَق على شاشة دخول → /home
  }
  return null;
}
```

عند خطأ في المسار يُعرَض `Scaffold` بسيط برسالة عربية `'خطأ: ...'` عبر `errorBuilder`.

## إدارة الحالة (Riverpod)

يعتمد التطبيق على Riverpod حصراً. الجدول التالي يوثّق المزوّدات الرئيسية بأسمائها الحقيقية:

| المزوّد | النوع | ما يوفّره | الملف |
| --- | --- | --- | --- |
| `routerProvider` | `Provider<GoRouter>` | جدول المسارات + حارس المصادقة | `app/router.dart` |
| `apiClientProvider` | `Provider<SarhApiClient>` | عميل dio مشترك مبني على `activeApiBaseUrl` | `core/api/sarh_api_client.dart` |
| `authBusProvider` | `Provider<AuthBus>` | ناقل نشر/اشتراك لكسر دورة عميل الـ API ↔ متحكّم المصادقة على 401 | `core/api/sarh_api_client.dart` |
| `authControllerProvider` | `StateNotifierProvider<AuthController, AuthState>` | حالة المصادقة (المواطن + التوكن) + دوال login/signOut | `core/auth/auth_controller.dart` |
| `propertiesRepoProvider` | `Provider<PropertiesRepository>` | مستودع العقارات | `core/api/repositories.dart` |
| `notificationsRepoProvider` | `Provider<NotificationsRepository>` | مستودع الإشعارات | `core/api/repositories.dart` |
| `walletRepoProvider` | `Provider<WalletRepository>` | مستودع الشهادات الرقمية | `core/api/repositories.dart` |
| `myPropertiesProvider` | `FutureProvider.autoDispose<List<Property>>` | قائمة عقارات المواطن | `core/api/repositories.dart` |
| `propertyDetailProvider` | `FutureProvider.autoDispose.family<Property, String>` | تفاصيل عقار بالمعرّف | `core/api/repositories.dart` |
| `propertyDocumentsProvider` | `FutureProvider.autoDispose.family<List<PropertyDocumentInfo>, String>` | مرفقات عقار | `core/api/repositories.dart` |
| `propertyDocumentBytesProvider` | `FutureProvider.autoDispose.family<Uint8List, ({String propertyId, String docId})>` | بايتات مرفق واحد للمعاينة | `core/api/repositories.dart` |
| `myNotificationsProvider` | `FutureProvider.autoDispose<List<SarhNotification>>` | صندوق الإشعارات | `core/api/repositories.dart` |
| `myCredentialsProvider` | `FutureProvider.autoDispose<List<VerifiableCredential>>` | شهادات المحفظة | `core/api/repositories.dart` |
| `mapRepoProvider` | `Provider<MapRepository>` | مستودع الخريطة العامّة | `features/map/parcel_feature.dart` |
| `cadastralMapProvider` | `FutureProvider.autoDispose<List<ParcelFeature>>` | قِطع الخريطة العقارية المعتمدة | `features/map/parcel_feature.dart` |
| `wizardStateProvider` | `StateNotifierProvider<WizardController, WizardState>` | حالة معالج تسجيل العقار عبر خطواته الأربع | `features/property/wizard/wizard_state.dart` |

## عميل الـ API وحلّ مضيف الخادم

المصدر: `apps/mobile/lib/core/api/sarh_api_client.dart`.

### الصنف `SarhApiClient`

يغلّف نسخة واحدة من `Dio` مع `FlutterSecureStorage`. تُبنى النسخة عبر المصنع الساكن `SarhApiClient.build`:

```dart
static SarhApiClient build({
  required String baseUrl,
  void Function()? onUnauthorized,
});
```

إعدادات `BaseOptions`: `connectTimeout` = 10 ثوانٍ، `receiveTimeout` = 30 ثانية، `contentType: 'application/json'`. تُضاف interceptorان: `_AuthInterceptor` ثم `_ErrorInterceptor`. التخزين الآمن يستخدم `AndroidOptions(encryptedSharedPreferences: true)`.

دوال إدارة التوكن (المفتاح `sarh_jwt`):

| الدالّة | الوصف |
| --- | --- |
| `Future<String?> readToken()` | قراءة الـ JWT من التخزين الآمن |
| `Future<void> writeToken(String value)` | كتابة الـ JWT |
| `Future<void> clearToken()` | حذف الـ JWT |

### الـ Interceptors

- **`_AuthInterceptor`**: يقرأ التوكن من التخزين في كل طلب، وإن وُجد أضاف الترويسة `Authorization: Bearer <token>`. بذلك لا يُرسَل `citizen_id` من الجوّال أبداً؛ نطاق المواطن يُفرَض من الـ JWT في الخادم.
- **`_ErrorInterceptor`**: عند استجابة 401 من أي مسار **لا يحوي** `/auth/` يمسح المفاتيح `sarh_jwt` و`sarh_citizen` (عبر `Future.microtask`) ويستدعي `onUnauthorized`، فيُعيد الحارس المستخدم إلى `/login`. أمّا طلبات `/auth/` (كإدخال PIN خاطئ) فتُستثنى لتجنّب حلقة "أعد تسجيل الدخول". كما يحوّل مغلّف الخطأ إلى `SarhApiError` عبر `SarhApiError.fromJson` حتى يعرض المتّصلون `messageAr` مباشرة.

### حلّ مضيف الخادم (localhost / 127.0.0.1 / 10.0.2.2)

القيمة الافتراضية زمن التصريف:

```dart
const sarhApiBaseUrl = String.fromEnvironment(
  'SARH_API_URL',
  defaultValue: 'http://10.0.2.2:3001/api/v1',
);
String activeApiBaseUrl = sarhApiBaseUrl; // يُضبط مرّة واحدة في main()
```

الدالّة `resolveApiBaseUrl()` تختار مضيفاً قابلاً للوصول بحيث "يعمل التطبيق ببساطة" على المحاكي أو الجهاز الفعلي أو المحاكي iOS/الويب/سطح المكتب:

- إذا مُرِّر `--dart-define=SARH_API_URL` صراحةً، يُستخدم كما هو دون أي فحص.
- وإلّا يُفحَص `/health` لكل مرشّح على التوازي، ويفوز أوّل مَن يُرجع 200 عبر `_firstReachable` (مهلة فحص 1500ms). المرشّحون بالترتيب:

```dart
const candidates = <String>[
  'http://localhost:3001/api/v1',
  'http://127.0.0.1:3001/api/v1',
  'http://10.0.2.2:3001/api/v1',
];
```

- إن لم يُجب أحد (بلا اتصال / LAN فقط / وضع عرض) يُحتفَظ بالافتراضي زمن التصريف.

الملاحظات الجوهرية الموثّقة في الشيفرة:
- `10.0.2.2` هو اسم مستعار لِلوبباك المضيف على **محاكي أندرويد فقط**، ولا يُوجَّه من جهاز فعلي.
- الجهاز الموصول عبر USB يصل عبر `localhost` بشرط تشغيل `adb reverse tcp:3001`.
- الجهاز على شبكة Wi‑Fi يحتاج تمرير IP الخاص بالحاسب عبر `--dart-define=SARH_API_URL` لأنّ عنوانه غير معروف داخل التطبيق.

### كسر دورة الاعتماد عبر `AuthBus`

`AuthBus extends ChangeNotifier` مع دالّة واحدة `fire() => notifyListeners()`. يحمل عميل الـ API نداءً يطلق هذا الناقل عند 401، ويشترك فيه `AuthController` في مُنشئه. عند تهيئة `apiClientProvider` يُمرَّر `onUnauthorized` الذي يستدعي `ref.read(_authBusProvider).fire()`.

### السماح بالنص الصريح على أندرويد (Cleartext HTTP)

المصدر: `apps/mobile/android/app/src/main/AndroidManifest.xml` و`apps/mobile/android/app/src/main/res/xml/network_security_config.xml`.

يعلن الـ Manifest صلاحيات `NFC` و`ACCESS_FINE_LOCATION` و`ACCESS_COARSE_LOCATION` و`INTERNET`، ويشير عنصر `<application>` إلى `android:networkSecurityConfig="@xml/network_security_config"`.

بما أنّ أندرويد 9+ (targetSdk ≥ 28) يحجب HTTP الصريح افتراضياً — ما كان يُفشل كل نداءات الـ API بصمت بدءاً من فحص الدخول — يسمح ملف الإعدادات بالنص الصريح لمضيفات التطوير:

```xml
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
```

يوثّق الملف صراحةً أنّ الإنتاج يجب أن يقدّم الـ API عبر HTTPS، مع ضبط `base-config cleartextTrafficPermitted="false"` أو حذف الملف والمرجع في الـ Manifest.

## المستودعات (Repositories) ونقاط النهاية

المصدر: `apps/mobile/lib/core/api/repositories.dart`. جميع المستودعات تمرّ عبر عميل dio المشترك، ويُفرَض نطاق المواطن من الخادم عبر الـ JWT.

الدالّة المساعدة `_items(dynamic raw)` تفكّ شكل `CursorPage<T>` أي `{ items: [...], next_cursor: ... }`، وتقبل دفاعياً قائمة عارية.

### `PropertiesRepository`

| الدالّة | الفعل والمسار | ملاحظات |
| --- | --- | --- |
| `myProperties()` | `GET /properties?limit=50` | تُرجع `List<Property>` |
| `get(id)` | `GET /properties/{id}` | تفاصيل عقار |
| `documents(propertyId)` | `GET /properties/{propertyId}/documents` | قائمة `PropertyDocumentInfo` |
| `documentBytes(propertyId, docId)` | `GET /properties/{propertyId}/documents/{docId}/file` | بايتات المرفق للمعاينة (`ResponseType.bytes`) |
| `submit({...})` | `POST /properties` | إنشاء عقار مع المستندات inline |
| `uploadFile(filePath)` | `POST /uploads/property-document` | رفع ملف عبر `FormData`، يُرجع `UploadedFile` (بحقول `storagePath`، `mimeType`، `sizeBytes`، `sha256` من `path`/`mime_type`/`size`/`sha256`) |

جسم `submit` المُرسَل (المساحة تُشتق من المضلّع لا من طول×عرض، وفق القيد رقم 8):

```dart
{
  'property_type': type.name,
  'region_id': regionId,
  if (municipalityId != null) 'municipality_id': municipalityId,
  if (addressAr != null) 'address_ar': addressAr,
  if (parcelNumber != null) 'parcel_number': parcelNumber,
  if (planNumber != null) 'plan_number': planNumber,
  if (blockNumber != null) 'block_number': blockNumber,
  'boundary_polygon': boundaryPolygonGeoJson,
  'area_sqm': areaSqm,
  if (documentedAreaSqm != null) 'documented_area_sqm': documentedAreaSqm,
  'documents': documents,
}
```

الاستجابة المتوقّعة `{ property: {...}, request: {...} }`، مع رجوع احتياطي للجسم الخام. الأصناف المساعدة: `UploadedFile` و`PropertyDocumentInfo` (بالحقول `id`, `documentType`, `titleAr`, `mimeType`, `fileSizeBytes` من `document_type`/`title_ar`/`mime_type`/`file_size_bytes`).

### `NotificationsRepository`

| الدالّة | الفعل والمسار |
| --- | --- |
| `inbox()` | `GET /me/notifications?limit=50` |
| `markRead(id)` | `POST /me/notifications/{id}/read` |

### `WalletRepository`

| الدالّة | الفعل والمسار | ملاحظات |
| --- | --- | --- |
| `myCredentials()` | `GET /me/credentials` | عند 401/404 أو خطأ نقل يتدهور بلطف إلى محفظة فارغة (`return const []`) بدل شاشة خطأ |

تحوّل الدالّة `_toSarhError(DioException e)` أي استثناء إلى `SarhApiError`، مستخدمةً `SarhApiError.unknown('تعذّر الاتصال بالخادم.')` عند غياب مغلّف مترجَم.

## تدفّق المصادقة (PIN + الهوية الرقمية)

المصدر: `apps/mobile/lib/core/auth/auth_controller.dart`.

### `AuthState`

صنف غير قابل للتغيير بالحقول `bool initializing`، `Citizen? citizen`، `String? token`. الخصائص:
- `bool get isAuthenticated => citizen != null && token != null;`
- `AuthState signedOut()` يعيد حالة خارج التهيئة بلا مواطن ولا توكن.

### `AuthController extends StateNotifier<AuthState>`

يتعامل مع الـ API مباشرة. في المُنشئ يشترك في `AuthBus` (لتسجيل خروج فوري عند 401 عبر `_onUnauthorized → signOut`) ويستدعي `_restore()`.

- **`_restore()`**: يقرأ التوكن؛ إن غاب يضبط الحالة "خارج التهيئة" بلا مصادقة. وإلّا يقرأ المواطن المخزّن مؤقتاً بالمفتاح `sarh_citizen` (`_citizenStorageKey`) — لأنّ الـ API لا يوفّر `/auth/me` — ويبني الحالة من الـ JWT المخزّن دون رحلة شبكة على البدء البارد. عند فشل فكّ الترميز يُمسح كل شيء ويُعتبر المستخدم خارج الدخول.

- **`login({...})`**:

```dart
Future<void> login({
  required String digitalIdNumber,
  required String pin,
  String? nfcPicc,
  String? nfcCmac,
});
```

يرسل `POST /auth/sign-in-with-pin` بالجسم:

```dart
{
  'digital_id_number': digitalIdNumber,
  'pin': pin,
  if (nfcPicc != null) 'nfc_picc': nfcPicc,
  if (nfcCmac != null) 'nfc_cmac': nfcCmac,
}
```

لمسة NFC جزءٌ من تجربة الاستخدام (مقاومة إعادة التشغيل)، والبرهان الخادمي هو رابط SUN المُرسَل كـ `nfc_picc` + `nfc_cmac` عند وجودهما، ويُتجاهَل في مسار العرض القائم على PIN وحده.

- **`_persistSignInResponse`**: يقرأ `access_token` (وإلّا يرمي `'لم يصل رمز الدخول.'`)، ثم `user.citizen_id` (أو `user.id`). يكتب التوكن أوّلاً، ثم يجلب السجل الكامل عبر `GET /citizens/{citizenId}` لعرض بطاقة الهوية والتحية. إن أغفلت الاستجابة `digital_id_number` (لأنه يعيش على `digital_id_cards`) يُبقي ما أدخله المستخدم عبر `copyWith`. وعند فشل الجلب يُبنى سجل مواطن مصغّر من المعرّف والرقم المُدخَل. أخيراً يُخزَّن المواطن مؤقتاً في `sarh_citizen` بشكل JSON مصغّر ويُحدَّث الحالة.

- **`signOut()`**: يمسح التوكن والمواطن المخزّن ويضبط الحالة خارج الدخول.

### شاشة تسجيل الدخول

المصدر: `apps/mobile/lib/features/auth/login_screen.dart`. الصنف `LoginScreen` هو `ConsumerStatefulWidget`.

- **الحقول**: `_idController` لرقم الهوية الرقمية (LTR، يقبل `[A-Za-z0-9-]` فقط، مثال placeholder `LY-11-2026-000101-0`)، و`_pinController` لـ PIN (مخفي، أرقام فقط، `maxLength: 6`).
- **`_tapNfc()`**: يفحص توفّر NFC عبر `FlutterNfcKit.nfcAvailability`؛ ثم `poll` بمهلة 12 ثانية، ويقرأ سجلات NDEF لاستخراج `p/picc` و`c/cmac` من رابط SUN؛ عند النجاح يحفظ `_nfcPicc/_nfcCmac` ويعرض معرّف البطاقة المقتطع. الرسائل كلّها عربية.
- **`_submit()`**: يتحقّق من امتلاء الرقم وطول PIN = 6، ثم يستدعي `authControllerProvider.notifier.login(...)`، وعند النجاح ينتقل إلى `AppRoutes.home`. عند `SarhApiError` يعرض `messageAr`.
- التصميم بطاقة بيضاء فوق تدرّج من ألوان العلامة، مع شعار الحرف "ص" وحقوق `© 2026 LVCT`.

## طبقة NFC (NTAG 424 DNA)

المصدر: `apps/mobile/lib/core/nfc/nfc_service.dart`.

### `NfcReadResult`

بالحقول `String tagId`، `String? picc`، `String? cmac`، `String? digitalIdNumber`، والخاصية `bool get hasProof => picc != null && cmac != null;`.

### `NfcService`

| الدالّة | الوصف |
| --- | --- |
| `static Future<bool> isAvailable()` | يُرجع true إذا كانت `FlutterNfcKit.nfcAvailability == NFCAvailability.available` |
| `static Future<NfcReadResult> readCard({timeout = 15s, iosMessage})` | استطلاع البطاقة وقراءة NDEF واستخراج البرهان والمعرّف |
| `static Future<void> finish({iosMessage})` | إنهاء جلسة NFC بأمان |

منطق `readCard`: بعد `FlutterNfcKit.poll` يقرأ `readNDEFRecords`، ولكل سجل يفكّ الحمولة كنص، ثم:
- يحاول تحليل النص كرابط SUN (صيغة NTAG 424 DNA)، مستخرجاً `p`/`picc` و`c`/`cmac` من معاملات الاستعلام.
- يستخرج رقم الهوية من مقاطع المسار إذا بدأ بـ `LY-` واحتوى `-2`.
- كخيار احتياطي، يبحث في النص الصِّرف عن نمط `RegExp(r'LY-\d{2}-\d{4}-\d{6}-\d')`.

ثم `FlutterNfcKit.finish()` ويُرجع `NfcReadResult`. الرسائل الموجّهة لـ iOS عربية (مثال `'قرّب بطاقة صرح للقراءة'`).

## رموز السمة (Theme Tokens)

المصدر: `apps/mobile/lib/core/theme/sarh_colors.dart` و`apps/mobile/lib/core/theme/sarh_theme.dart`.

### `SarhColors`

ثوابت الألوان يجب أن تبقى متطابقة مع `packages/ui-kit` وتطبيقات Angular:

| الرمز | القيمة | المقابل في الويب |
| --- | --- | --- |
| `primary` | `#0F172A` | `--primary` (أسود ليبي) |
| `accent` | `#F97316` | `--accent` (ذهبي) |
| `warn` | `#DC2626` | `--warn` (أحمر) |
| `success` | `#0891B2` | `--good` (أخضر) |
| `surface` | `#FAFAF9` | `--paper` |
| `onSurface` | `#0F172A` | — |
| `outline` | `#E5E7EB` | `--rule` |
| `muted` | `#64748B` | `--muted` |

كما يوفّر دالّتين لحالة العقار: `statusBackground(String status)` و`statusForeground(String status)` تغطّيان `approved`, `rejected`, `needs_clarification`, `minted`, `frozen`, و`pending`/`under_review` كافتراضي.

### `SarhTheme.light()`

يبني `ThemeData` بـ `useMaterial3: true` و`ColorScheme.fromSeed(seedColor: SarhColors.primary)`. يخصّص: خلفية `surface`، `AppBar` بخلفية `primary` ونص أبيض وخط `Cairo`، نصوص كلّها بخط `Cairo`، `ElevatedButton` بخلفية `primary` ونص `accent` وارتفاع 52 وحواف 12، `OutlinedButton`، `InputDecoration` (حواف 12، حدّ مركّز `accent`)، `Card` أبيض بحدّ `outline` وحواف 16، `FloatingActionButton` بخلفية `accent`، و`BottomNavigationBar` (محدَّد `accent`، غير محدَّد `muted`).

## النماذج (Models)

المصدر: `apps/mobile/lib/core/models/`.

| النموذج | الملف | أبرز الحقول |
| --- | --- | --- |
| `Citizen` | `citizen.dart` | `id`, `firstNameAr`, `fatherNameAr`, `grandfatherNameAr`, `familyNameAr`, `phone`, `legacyNationalNo`, `regionId`, `digitalIdNumber`, `photoPath`؛ خاصية `fullNameAr` + `copyWith` + `fromJson` |
| `Property` | `property.dart` | `id`, `propertyCode`, `parcelNumber`, `planNumber`, `blockNumber`, `type`, `status`, `regionId`, `addressAr`, `areaSqm`, `lengthM/widthM/depthM`, `submittedAt`, `reviewedAt`, `rejectionReason`, `deedPdfPath`, `vcCredentialId`, `hasActiveDispute` |
| `PropertyType` (enum) | `property.dart` | `residential/agricultural/commercial/governmental/industrial/mixed` مع `arLabel` و`tryParse` |
| `PropertyStatus` (enum) | `property.dart` | `draft/pending/underReview/approved/rejected/needsClarification/frozen` مع `arLabel`, `apiKey`, `parse` |
| `SarhNotification` | `notification.dart` | `id`, `kind` (sms/push/in_app/email), `titleAr`, `bodyAr`, `payload`, `sentAt`, `readAt`؛ خاصية `isUnread` |
| `VerifiableCredential` | `verifiable_credential.dart` | `id`, `credentialType` (`DigitalId`/`PropertyDeed`), `schemaId`, `credDefId`, `payload`, `issuedAt`, `revokedAt`؛ خاصيتا `isActive` و`arLabel` |
| `SarhApiError` | `api_error.dart` | `statusCode`, `code`, `messageAr`, `messageEn`, `details` مع `fromJson` و`unknown` — يعكس مغلّف `SarhException` |

الثوابت: `apps/mobile/lib/core/constants/regions.dart` يوفّر `kRegions` (خريطة `region_id` → اسم عربي، 15 منطقة ليبية) والدالّة `regionLabel(int? id)`.

## توثيق الميزات (Features)

### الميزة: splash

- **الغرض**: شاشة إقلاع تقرّر الوجهة التالية بعد استعادة المصادقة.
- **الشاشة**: `SplashScreen` (`apps/mobile/lib/features/splash/splash_screen.dart`). تنتظر ~800ms ثم تُبقى منتظرة حتى ينتهي `authControllerProvider.initializing`. إن كان المستخدم مصادَقاً تنتقل إلى `AppRoutes.home`؛ وإلّا تقرأ `SharedPreferences` المفتاح `seen_onboarding` وتنتقل إلى `login` أو `onboarding`.
- **نقاط النهاية**: لا تستدعي الـ API مباشرة (تعتمد على حالة المصادقة المستعادة).

### الميزة: onboarding

- **الغرض**: تقديم التطبيق في ثلاث شرائح تعريفية عند أوّل تشغيل.
- **الشاشة**: `OnboardingScreen` (`apps/mobile/lib/features/onboarding/onboarding_screen.dart`)، `StatefulWidget` يستخدم `PageController` وثلاث شرائح `_Slide` (الترحيب، تسجيل العقارات، محفظة الهوية). عند الإنهاء عبر `_finish()` يضبط `seen_onboarding = true` في `SharedPreferences` وينتقل إلى `login`.
- **نقاط النهاية**: لا شيء.

### الميزة: auth

- **الغرض**: تسجيل دخول المواطن بالرقم الرقمي + PIN مع لمسة NFC اختيارية.
- **الشاشة**: `LoginScreen` (موثّقة أعلاه في قسم المصادقة).
- **نقاط النهاية**: `POST /auth/sign-in-with-pin` (عبر `AuthController.login`)، ثم `GET /citizens/{id}` لجلب سجل المواطن.

### الميزة: home

- **الغرض**: لوحة المواطن الرئيسية — تحية، بطاقة الهوية الرقمية، قائمة "عقاراتي"، وشريط تنقّل سفلي.
- **الشاشة**: `HomeScreen` (`apps/mobile/lib/features/home/home_screen.dart`)، `ConsumerStatefulWidget`. مكوّناتها الداخلية: `_Greeting` (تحية زمنية عربية)، `_DigitalIdCard` (تعرض `digitalIdNumber` وزرّ "تحقّق من البطاقة عبر NFC" → `nfcVerify`)، `_PropertyCard`، `_EmptyState`، `_ErrorView`. يقرأ `myPropertiesProvider` مع `RefreshIndicator`. الودجت `StatusChip` (`features/home/widgets/status_chip.dart`) يعرض حالة العقار بألوان `SarhColors.statusBackground/statusForeground` بمفتاح `status.apiKey`.
- **شريط التنقّل السفلي**: الرئيسية / المحفظة (`wallet`) / تسجيل (`wizard`) / الإشعارات (`notifications`) / حسابي (`profile`). وفي شريط التطبيق أيقونتان: الخريطة العقارية (`cadastralMap`) والإشعارات.
- **نقاط النهاية**: `GET /properties?limit=50` (عبر `myPropertiesProvider`).

### الميزة: property

تشمل معالج تسجيل العقار (أربع خطوات) وشاشة التفاصيل.

#### حالة المعالج المشتركة

المصدر: `apps/mobile/lib/features/property/wizard/wizard_state.dart`. الصنف `WizardState` غير قابل للتغيير يحمل: `type`, `polygonRing` (نقاط `[lng, lat]`), `regionId`, `municipalityId`, `addressAr`, `parcelNumber`, `planNumber`, `blockNumber`, `documentedAreaSqm`, وقائمة `documents` من `PickedDocument`. أبرز الخصائص المحسوبة:

- `hasPolygon` (≥ 3 نقاط).
- `polygonAreaSqm`: مساحة بالفائض الكروي (Spherical-excess) من الحلقة المرسومة، تعكس `geographicArea` في الويب، ويعيد الخادم حسابها عبر `STArea` عند الإرسال.
- `documentedAreaDiffPct`: فرق نسبي بين المساحة المستندية والمقيسة.
- `hasRequiredDocuments`: تتطلّب سياسة السجلّ صورة موقع واحدة (`site_photo`) وكروكي واحد (`koreky_certificate`) على الأقل.
- `boundaryPolygonGeoJson`: يبني `Polygon` GeoJSON مع إغلاق الحلقة.

`WizardController extends StateNotifier<WizardState>` يوفّر `setType`, `setPolygon`, `setRegion`, `setAddress`, `setParcelNumber`, `setPlanNumber`, `setBlockNumber`, `setDocumentedArea`, `addDocument`, `removeDocument`, و`reset`. يستخدم قيمة حارسة `_keep` عبر `_patch` للتمييز بين "اترك الحقل" و"اضبطه على null".

#### الخطوة 1 — نوع العقار

- **الشاشة**: `WizardStepType` (`step_type.dart`). قائمة `RadioListTile` بأربعة أنواع (سكني، زراعي، تجاري، حكومي). زر "التالي" مُعطَّل حتى يُختار نوع، وينتقل إلى `wizardLocation`.

#### الخطوة 2 — الموقع

- **الشاشة**: `WizardStepLocation` (`step_location.dart`)، `ConsumerStatefulWidget`. تلتقط حدود القطعة على خريطة `flutter_map` فوق بلاطات OSM بطريقتين:
  1. النقر على الخريطة لإسقاط رؤوس المضلّع.
  2. "ارسم بالمشي" (`_startTracing`): يتحقّق من تفعيل GPS وإذن الموقع عبر `Geolocator`، ثم يبثّ المواقع (`getPositionStream`, دقّة عالية، `distanceFilter: 4`) ليُضاف كل موقع رأساً ويُعاين المضلّع حيّاً.
- عناصر التحكّم: منتقي المنطقة (`kRegions`)، حقل العنوان الاختياري، أزرار Undo/Clear العائمة، وعرض حيّ لعدد النقاط والمساحة. المركز الافتراضي طرابلس `LatLng(32.8872, 13.1913)` والمنطقة الافتراضية 11. زر "التالي" مُعطَّل حتى يُرسَم مضلّع صالح ويُوقَف التتبّع، وينتقل إلى `wizardDocuments`.
- **نقاط النهاية**: لا شيء (الرسم محلي؛ الرفع يقع لاحقاً).

#### الخطوة 3 — المستندات

- **الشاشة**: `WizardStepDocuments` (`step_documents.dart`)، `ConsumerStatefulWidget`. منتقي نوع المستند (`_docTypes`: `koreky_certificate`, `survey_certificate`, `sale_contract`, `inheritance_deed`, `court_order`, `site_photo`, `boundary_map`, `other`)، مع الإرفاق من الكاميرا (`ImagePicker` camera) أو المعرض (gallery) أو ملف PDF (`FilePicker`، الامتدادات `pdf/jpg/jpeg/png`). تُضاف الملفات إلى `wizardStateProvider` عبر `addDocument`. زر "التالي" مُعطَّل حتى تتحقّق `hasRequiredDocuments` (صورة موقع + شهادة كوريكي)، مع بطاقة إلزامية توضّح الشرط.
- **نقاط النهاية**: لا شيء (الرفع يتمّ في خطوة المراجعة).

#### الخطوة 4 — المراجعة والإرسال

- **الشاشة**: `WizardStepReview` (`step_review.dart`)، `ConsumerStatefulWidget`. تعرض ملخّص النوع/المنطقة/الإحداثيات/المساحة/عدد المستندات، وحقول السجل الاختيارية (رقم القطعة/المخطط/البلوك)، والمساحة حسب الأوراق (`documentedAreaSqm`) مع تحذير عند تجاوز الفرق 10%. في `_submit()`: يرفع كل ملف عبر `repo.uploadFile` ثم يبني مصفوفة `documents[]` (بالحقول `document_type`, `storage_path`, وعند توفّرها `mime_type`, `file_size_bytes`, `file_hash`, `title_ar`)، ثم يستدعي `repo.submit(...)`. عند النجاح يعيد ضبط المعالج (`reset`)، يُبطل `myPropertiesProvider`، وينتقل إلى تفاصيل العقار المُنشأ.
- **نقاط النهاية**: `POST /uploads/property-document` (لكل ملف) ثم `POST /properties`.

#### شاشة تفاصيل العقار

- **الغرض**: عرض تفاصيل عقار واحد، خطّه الزمني، مرفقاته، سند ملكيته، وأي نزاع قانوني.
- **الشاشة**: `PropertyDetailScreen` (`apps/mobile/lib/features/property/property_detail_screen.dart`)، `ConsumerWidget`. يقرأ `propertyDetailProvider(id)`. المكوّنات: `_DisputeBanner` (عند `hasActiveDispute` — يمنع الخادم البيع/الإصدار)، `_DeedCard` (عند `approved` ووجود `propertyCode` — يفتح سند PDF العام)، `_Timeline` (أحداث الإرسال والمراجعة)، و`_Documents`/`_DocTile` (معاينة المرفقات؛ الصور مصغّرات قابلة للفتح بملء الشاشة عبر `propertyDocumentBytesProvider`). خريطة تسميات أنواع المستندات في `_docTypeLabels`.
- **فتح السند**: يبني `_DeedCard._open` الرابط `Uri.parse('$activeApiBaseUrl/verify/$propertyCode/deed.pdf')` ويفتحه عبر `launchUrl(..., mode: LaunchMode.externalApplication)`.
- **نقاط النهاية**: `GET /properties/{id}`، `GET /properties/{propertyId}/documents`، `GET /properties/{propertyId}/documents/{docId}/file`، و`GET /verify/{code}/deed.pdf` (متصفّح خارجي).

### الميزة: map

- **الغرض**: الخريطة العقارية العامّة "الخريطة العقارية" التي تحاكي خريطة الزائر في الويب — قِطع معتمدة كمضلّعات ملوّنة، والنقر يكشف معلومات **عامّة فقط** (الرمز، المساحة، النوع، الحالة، آخر تحديث). لا يُعرَض اسم المالك ولا الرقم الوطني ولا يُجلبان.
- **الشاشات/الملفات**:
  - `CadastralMapScreen` (`features/map/cadastral_map_screen.dart`): `ConsumerStatefulWidget` بخريطة `flutter_map` فوق بلاطات `https://tile.openstreetmap.org/{z}/{x}/{y}.png`، طبقات `PolygonLayer` و`MarkerLayer`، ورقة سفلية `_showInfo` بمعلومات القطعة، ومكوّنات `_Legend` و`_StatusPill`. يقرأ `cadastralMapProvider`.
  - `map_status.dart`: `MapStatusMeta` وخريطة `kMapStatus` (أربع دلاءات لونية: `clear` أخضر، `disputed` أحمر، `pending` أصفر، `public` أزرق) مع `mapStatusMeta` و`kMapStatusOrder`، وخريطة `kPropertyTypeAr` والدالّة `propertyTypeAr`.
  - `parcel_feature.dart`: النموذج `ParcelFeature` (سمات عامّة فقط) مع `fromGeoJson`، والمستودع `MapRepository.publicMap({int? regionId})` والمزوّدان `mapRepoProvider` و`cadastralMapProvider`.
- **نقاط النهاية**: `GET /verify/map` (مع `?region_id=` اختيارياً). لا يتطلّب مصادقة (خلاصة عامّة)، لكن عميل dio المشترك يُرفق الـ JWT إن وُجد وهو غير مؤذٍ.

### الميزة: nfc

- **الغرض**: التحقّق من صلاحية بطاقة الهوية الرقمية عبر NFC.
- **الشاشة**: `NfcVerifyScreen` (`apps/mobile/lib/features/nfc/nfc_verify_screen.dart`)، `ConsumerStatefulWidget` بآلة حالة `_VerifyState` (idle/scanning/verifying/success/error). في `_scan()`: يتحقّق من التوفّر عبر `NfcService.isAvailable`، يقرأ البطاقة عبر `NfcService.readCard`، وإن توفّر البرهان (`hasProof`) يرسل الطلب للتحقّق. يعرض `owner_name_ar` عند الصلاحية و`reason_ar` عند الرفض، ويعرض `UID` ورقم البطاقة عند القراءة.
- **نقاط النهاية**: `POST /nfc/verify` بالجسم `{ 'picc': ..., 'cmac': ... }`؛ الاستجابة `{ valid, owner_name_ar, reason_ar }`.

### الميزة: wallet

- **الغرض**: محفظة الشهادات الرقمية القابلة للتحقّق (SSI VC) للمواطن — الهوية الرقمية والسندات العقارية.
- **الشاشة**: `WalletScreen` (`apps/mobile/lib/features/wallet/wallet_screen.dart`)، `ConsumerWidget` يقرأ `myCredentialsProvider`. لكل شهادة `_CredentialCard` تعرض النوع (أيقونة `badge`/`description`) وتاريخ الإصدار وحالة الإلغاء، وزرّ "مشاركة عبر QR" الذي يفتح `showModalBottomSheet` برمز `QrImageView(data: c.id)` ونصّ المعرّف. عند الفراغ تُعرَض حالة فارغة عربية.
- **نقاط النهاية**: `GET /me/credentials`.

### الميزة: notifications

- **الغرض**: صندوق إشعارات المواطن مع تمييز غير المقروء وتعليمه مقروءاً عند النقر.
- **الشاشة**: `NotificationsScreen` (`apps/mobile/lib/features/notifications/notifications_screen.dart`)، `ConsumerWidget` يقرأ `myNotificationsProvider`. يعرض قائمة `ListTile` بالعنوان والنصّ والوقت (LTR بتنسيق `yyyy-MM-dd HH:mm`)، وعند النقر على إشعار غير مقروء يستدعي `markRead` ثم يُحدِّث القائمة. `RefreshIndicator` للتحديث.
- **نقاط النهاية**: `GET /me/notifications?limit=50` و`POST /me/notifications/{id}/read`.

### الميزة: profile

- **الغرض**: الملف الشخصي وبيانات الحساب والأمان وتسجيل الخروج.
- **الشاشة**: `ProfileScreen` (`apps/mobile/lib/features/profile/profile_screen.dart`)، `ConsumerWidget` يقرأ `authControllerProvider`. يعرض بطاقة هوية (الاسم الكامل + شارة "مواطن")، بطاقة "بيانات الحساب" (رقم الهوية، الهاتف، المنطقة عبر `_InfoRow`)، بطاقة "الأمان" (بنود ثابتة: JWT مؤقت، PIN مشفّر bcrypt، بطاقة NFC مقاومة للنسخ)، عنصر "طلب إعادة إصدار البطاقة" (حوار محلي فقط، بلا نداء API)، وعنصر "تسجيل الخروج" الذي يستدعي `authControllerProvider.notifier.signOut()` ثم ينتقل إلى `login`.
- **نقاط النهاية**: لا شيء (كل البيانات من حالة المصادقة المخزّنة).

## ملاحظات ختامية على الاتساق

- الرسائل الموجّهة للمستخدم كلّها بالعربية؛ المعرّفات التقنية (رقم الهوية، UID، الرموز) تُعرَض LTR بخط `monospace`.
- تُفرَض RTL عالمياً من الجذر `SarhApp`، وتُعاد فرضها في الأوراق السفلية (مثل `CadastralMapScreen._showInfo`).
- المساحة تُشتق دائماً من المضلّع المرسوم لا من الطول×العرض، ويعاد حسابها خادمياً — تماشياً مع القيد رقم 8 في CLAUDE.md.
- يُبقى `legacy_national_no` حاضراً في نموذج `Citizen` دعماً لإعادة إصدار الهوية مستقبلاً.
