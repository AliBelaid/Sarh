# مرجع واجهات API — الهوية والأشخاص

يوثّق هذا الفصل جميع نقاط النهاية (endpoints) الخاصة بالهوية والأشخاص في الخلفية `apps/api-dotnet/`، والمُعرّفة في وحدات التحكّم الستّ التالية: `AuthController` و`MeController` و`CitizensController` و`OfficersController` و`UploadsController` و`RegionsController`. المسار الأساسي (base path) لكل المسارات هو `/api/v1`.

## اصطلاحات عامة تسري على كل الفصل

قبل تفصيل كل وحدة تحكّم، هذه القواعد المشتركة المستخرجة من الكود الفعلي:

### مغلّف الخطأ (Error Envelope)

كل الأخطاء تُعاد بالشكل الموحّد المُعرّف في `apps/api-dotnet/Common/Errors/SarhError.cs` عبر النوعين `SarhErrorEnvelope` و`SarhErrorBody`:

```json
{
  "error": {
    "code": "ERR_VALIDATION",
    "message_ar": "رسالة عربية للمستخدم",
    "message_en": "English message",
    "details": null
  }
}
```

رموز الأخطاء المُنتَجة من المصنع `SarhException` (في نفس الملف) وأكوادها الـ HTTP:

| `code` | HTTP | الدالة المولّدة | الاستخدام |
|---|---|---|---|
| `ERR_UNAUTHORIZED` | 401 | `SarhException.Unauthorized()` | لا يوجد JWT صالح أو فشل تسجيل الدخول بالبريد/كلمة المرور |
| `ERR_FORBIDDEN` | 403 | `SarhException.Forbidden(reasonAr?)` | الدور لا يسمح، أو خرق نطاق المنطقة (region scoping) |
| `ERR_NOT_FOUND` | 404 | `SarhException.NotFound(entityAr, entityEn)` | كيان غير موجود |
| `ERR_CONFLICT` | 409 | `SarhException.Conflict(ar, en)` | تعارض فريد (بريد/هاتف/رقم موظف مكرّر) |
| `ERR_VALIDATION` | 400 | `SarhException.Validation(ar, en, details?)` | فشل تحقّق مُدخلات |
| `ERR_UPSTREAM` | 502 | `SarhException.Upstream(en, details?)` | خطأ خدمة خارجية |
| `ERR_INVALID_CREDENTIALS` | 401 | خاص بتدفّق PIN في `AuthService` | رقم هوية رقمية أو PIN غير صحيح |
| `ERR_CARD_NOT_ACTIVE` | 403 | خاص بتدفّق PIN في `AuthService` | البطاقة ليست `active` |

### الترقيم بالمؤشّر (Cursor Pagination)

كل نقاط القوائم تُعيد المغلّف `CursorPage<T>` المُعرّف في `apps/api-dotnet/Common/CursorPage.cs`:

```json
{
  "items": [ /* ... */ ],
  "nextCursor": "2026-06-30T12:00:00.0000000+00:00"
}
```

- المعامل `?limit=` مُقيَّد بالنطاق `[1, 100]` (سمة `[Range(1, 100)]`)، والقيمة الافتراضية `20`.
- المعامل `?cursor=` هو طابع زمني بصيغة ISO-8601 (`DateTimeOffset` بتنسيق `"o"`). الصفحة تُرجع سجلّات حيث `CreatedAt < cursor`، مرتّبة تنازليًا حسب `CreatedAt` ثم `Id`. الخوارزمية تجلب `limit + 1` صفًّا، وإن تجاوز العدد `limit` تعيّن `nextCursor` من طابع السجلّ الفائض؛ وإلا يكون `nextCursor = null` (نهاية القائمة).

### طبقة المصادقة والأدوار (Auth Layer)

- لا توجد سياسة تفويض افتراضية شاملة (`AddAuthorization()` تُستدعى دون `FallbackPolicy` في `apps/api-dotnet/Program.cs`)، لذا **الحماية تُفرَض عبر السمات الصريحة** على كل وحدة تحكّم.
- `[Authorize]` (من `apps/api-dotnet/Auth/…` عبر ASP.NET) تتطلّب JWT صالحًا فقط.
- `[OfficerOnly(...)]` مُعرّفة في `apps/api-dotnet/Auth/RequireRoleAttribute.cs` — وهي **بوّابة أدوار وليست بوّابة صلاحيات**: ترث `RequireRoleAttribute` التي تقرأ ادّعاء `sarh_role` من الـ JWT وتتحقّق أنّه ضمن قائمة الأدوار المسموحة، وإلا ترمي `ERR_UNAUTHORIZED` (دور مفقود) أو `ERR_FORBIDDEN` (دور غير مسموح).
- الأدوار المعتمدة (من `OfficersService.ValidRoles`): `super_admin`, `registry_officer`, `id_issuer`, `auditor`, `reviewer`, `department_manager`، بالإضافة إلى دور المواطن `citizen`.
- بنية حمولة الـ JWT مُعرّفة في `apps/api-dotnet/Auth/SarhJwtPayload.cs` بالادّعاءات: `sub`, `email`, `sarh_role`, `citizen_id`, `officer_id`, `region_id`, `municipality_id`, `permissions`. وتُقرأ داخل المتحكّمات كـ `CurrentUser` عبر `User.RequireUser()` (من `apps/api-dotnet/Auth/CurrentUser.cs`).

### التدقيق (Audit)

السمة `[Audit(...)]` (من `apps/api-dotnet/Audit/AuditAttribute.cs`) تكتب في `audit_log` **فقط بعد نجاح المعالج**. الخيارات `CaptureRequestBody`/`CaptureResponseBody` افتراضهما `true`، وتُضبط على `false` في المسارات التي تحمل أسرارًا (كلمات مرور، PIN، رموز JWT). قيم `Action` من `AuditActions`: `create`, `update`, `login`, … إلخ.

---

## AuthController — المصادقة

الملف: `apps/api-dotnet/Controllers/AuthController.cs`. المسار الأساسي `api/v1/auth`. الوحدة **لا تحمل `[Authorize]`** فهي مفتوحة (anonymous)، لكنها محميّة بسياسة تحديد المعدّل `[EnableRateLimiting(RateLimitPolicies.Auth)]` (10 طلبات/دقيقة افتراضيًا، مقسّمة حسب IP العميل — انظر `apps/api-dotnet/Common/RateLimitPolicies.cs`). المنطق يعيش في `AuthService` بالملف `apps/api-dotnet/Auth/AuthService.cs`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `POST` | `/api/v1/auth/sign-in` | anonymous (rate-limited) | تسجيل دخول بالبريد وكلمة المرور (موظّفون + حسابات مواطن) |
| `POST` | `/api/v1/auth/sign-in-with-pin` | anonymous (rate-limited) | تسجيل دخول المواطن عبر رقم الهوية الرقمية + رمز PIN للبطاقة |

كلا المسارين مُدقَّقان بـ `Action = login` مع `CaptureRequestBody = false` و`CaptureResponseBody = false` كي لا تتسرّب كلمات المرور/الـ PIN/الرموز إلى سجلّ التدقيق غير القابل للتعديل.

### POST /api/v1/auth/sign-in

توقيع المعالج:

```csharp
public Task<SignInResponse> SignIn([FromBody] SignInRequest dto, CancellationToken ct)
```

جسم الطلب (`SignInRequest` في `apps/api-dotnet/Auth/AuthService.cs`):

```json
{
  "email": "officer@sarh.ly",
  "password": "••••••••"
}
```

جسم الاستجابة (`SignInResponse`):

```json
{
  "accessToken": "<JWT HS256>",
  "refreshToken": "<opaque base64url 48 bytes>",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "user": {
    "id": "<auth_users.id>",
    "email": "officer@sarh.ly",
    "role": "registry_officer",
    "officerId": "<officers.id | null>",
    "citizenId": "<citizens.id | null>"
  }
}
```

ملاحظات:
- التحقّق: إذا كان `email` أو `password` فارغًا يُرمى `ERR_VALIDATION`. البريد يُطبَّع إلى أحرف صغيرة (`ToLowerInvariant`) قبل البحث.
- فشل العثور على المستخدم أو فشل تحقّق `BCrypt.Verify` يُعيد `ERR_UNAUTHORIZED` (رسالة عامة لا تُفرّق بين الحالتين).
- الدور يُشتقّ عبر `ResolveRoleAndCitizen`: أولوية لدور الـ `Officer` (إن كان `IsActive = true`)، وإلا `sarh_role` من `auth_users.raw_app_meta_data` (JSON). إن تعذّر اشتقاق دور → `ERR_UNAUTHORIZED`.
- `officerId` يُملأ فقط إذا كان الموظّف نشطًا. عند تسجيل دخول موظّف تُضاف الادّعاءات `region_id` و`municipality_id` إلى الـ JWT.
- تأثير جانبي (best-effort): تحديث `auth_users.last_sign_in_at = SYSDATETIMEOFFSET()` عبر SQL خام، ويُتجاهَل أي خطأ فيه.
- `refreshToken` رمز عشوائي 48 بايت مُرمّز base64url؛ و`expiresIn` = `Sarh:JwtAccessTtlSeconds` (افتراضيًا 3600، انظر `apps/api-dotnet/Auth/JwtTokenService.cs`).

### POST /api/v1/auth/sign-in-with-pin

توقيع المعالج:

```csharp
public Task<SignInResponse> SignInWithPin([FromBody] SignInWithPinRequest dto, CancellationToken ct)
```

جسم الطلب (`SignInWithPinRequest`):

```json
{
  "digitalIdNumber": "SARH-...",
  "pin": "••••"
}
```

جسم الاستجابة مطابق لبنية `SignInResponse` أعلاه، لكن `user.role` دائمًا `"citizen"` و`officerId = null`. إن لم يكن للمواطن حساب `auth_users` مرتبط، يُشتقّ `id` من `citizens.id` ويُصطنع بريد `"<digitalIdNumber>@digital-id.sarh.ly"`.

ملاحظات أمنية دقيقة (من `SignInWithPinAsync`):
- إذا كان `digitalIdNumber` أو `pin` فارغًا → `ERR_VALIDATION`.
- الحالات الثلاث «لا توجد بطاقة» و«لا يوجد PIN مضبوط» و«PIN خاطئ» تُعيد **نفس** الخطأ العام `ERR_INVALID_CREDENTIALS` (401) لمنع تعداد الهويات؛ وفي مساري «لا بطاقة/لا PIN» يُنفَّذ تحقّق bcrypt وهمي ضدّ `DummyPinHash` لمعادلة زمن الاستجابة ومنع هجوم توقيت. السبب الحقيقي يُسجَّل عبر `ILogger` جهة الخادم فقط.
- بعد التحقّق الناجح من الـ PIN فقط: إن لم تكن حالة البطاقة `active` يُعاد `ERR_CARD_NOT_ACTIVE` (403) برسالة عربية مخصّصة حسب الحالة (`frozen`/`revoked`/`expired`/`lost`/غير ذلك).

---

## MeController — البيانات المرتبطة بالمستخدم الحالي

الملف: `apps/api-dotnet/Controllers/MeController.cs`. المسار الأساسي `api/v1/me`، والوحدة كاملةً محميّة بـ `[Authorize]`. الغرض من بادئة `me` هو تجنّب تمرير مُعرّف المواطن في المسار (footgun) — فالجهة المصادَق عليها في الـ JWT هي المصدر الموثوق دائمًا. المُعرّف يُستخرج داخليًا عبر `User.RequireUser()`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `GET` | `/api/v1/me/nft-licences` | `[Authorize]` | رخص NFT العقارية العائدة للمستخدم |
| `GET` | `/api/v1/me/credentials` | `[Authorize]` | بيانات الاعتماد القابلة للتحقّق (SSI VCs) في محفظة المواطن |
| `GET` | `/api/v1/me/notifications` | `[Authorize]` | إشعارات المستخدم (مواطن أو موظّف) بترقيم مؤشّر |
| `GET` | `/api/v1/me/notifications/unread-count` | `[Authorize]` | عدد الإشعارات غير المقروءة |
| `POST` | `/api/v1/me/notifications/{id:guid}/read` | `[Authorize]` | تعليم إشعار واحد كمقروء |
| `POST` | `/api/v1/me/notifications/read-all` | `[Authorize]` | تعليم كل الإشعارات كمقروءة |

توقيعات المعالجات:

```csharp
public Task<List<NftLicenseView>>              MyLicences(CancellationToken ct);
public Task<List<SsiCredentialView>>           MyCredentials(CancellationToken ct);
public Task<CursorPage<NotificationView>>      Notifications([FromQuery] ListNotificationsQuery q, CancellationToken ct);
public async Task<UnreadCountResult>           UnreadCount(CancellationToken ct);
public Task<NotificationView>                  MarkRead(Guid id, CancellationToken ct);
public async Task<MarkAllReadResult>           MarkAllRead(CancellationToken ct);
```

ملاحظات على الأشكال:
- `nft-licences` يخدمها `NftsService`، و`credentials` يخدمها `Ssi.ISsiService`، و`notifications*` يخدمها `NotificationsService`؛ والأنواع `NftLicenseView` و`SsiCredentialView` و`NotificationView` و`ListNotificationsQuery` تعود لوحداتها الخاصّة (تُوثَّق في فصولها) وليست ضمن نطاق DTOs الهوية.
- `notifications` تُعيد مغلّف `CursorPage<NotificationView>` (نفس اصطلاح `cursor`/`limit` الموصوف في الاصطلاحات العامة).
- النوعان `UnreadCountResult` و`MarkAllReadResult` **مُعرَّفان مضمّنًا** في نهاية `apps/api-dotnet/Controllers/MeController.cs`، وشكلاهما:

```json
// GET /api/v1/me/notifications/unread-count
{ "count": 3 }
```

```json
// POST /api/v1/me/notifications/read-all
{ "updated": 3 }
```

---

## CitizensController — المواطنون

الملف: `apps/api-dotnet/Controllers/CitizensController.cs`. المسار الأساسي `api/v1/citizens`، والوحدة محميّة بـ `[Authorize]`. المنطق في `CitizensService` (`apps/api-dotnet/Citizens/CitizensService.cs`) وأنواع البيانات في `apps/api-dotnet/Citizens/CitizenDtos.cs`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `POST` | `/api/v1/citizens` | `[OfficerOnly("id_issuer","registry_officer","super_admin")]` | إنشاء سجلّ مواطن جديد |
| `GET` | `/api/v1/citizens` | `[OfficerOnly("id_issuer","registry_officer","super_admin","auditor","reviewer","department_manager")]` | قائمة المواطنين (بحث + ترقيم مؤشّر + نطاق منطقة) |
| `GET` | `/api/v1/citizens/{id:guid}` | `[Authorize]` (مواطن يرى نفسه فقط) | جلب مواطن بالمُعرّف |
| `PATCH` | `/api/v1/citizens/{id:guid}` | `[OfficerOnly("id_issuer","registry_officer","super_admin")]` | تعديل جزئي لبيانات مواطن |
| `GET` | `/api/v1/citizens/{id:guid}/photo` | `[Authorize]` (مواطن يرى صورته فقط) | بثّ صورة المواطن الشخصية |

التدقيق: `POST` بـ `Action = create`، و`PATCH` بـ `Action = update`، كلاهما على الكيان `citizens` مع التقاط جسم الطلب الافتراضي.

### POST /api/v1/citizens

توقيع المعالج:

```csharp
public Task<CitizenView> Create([FromBody] CreateCitizenDto dto, CancellationToken ct)
```

جسم الطلب (`CreateCitizenDto`) — قواعد التحقّق مأخوذة من سمات DataAnnotations:

```json
{
  "firstNameAr": "محمد",        // Required, 2..64
  "fatherNameAr": "علي",         // Required, ≤64
  "grandfatherNameAr": "سالم",   // Required, ≤64
  "familyNameAr": "بلعيد",       // Required, ≤64
  "firstNameEn": "Mohamed",      // ≤64, اختياري
  "fatherNameEn": "Ali",         // ≤64, اختياري
  "grandfatherNameEn": "Salem",  // ≤64, اختياري
  "familyNameEn": "Belaid",      // ≤64, اختياري
  "motherNameAr": "فاطمة",       // ≤192, اختياري
  "legacyNationalNo": "1234567", // ≤20, اختياري
  "familyBookNo": "8899",        // ≤20, اختياري
  "gender": "male",              // Required, ^(male|female)$
  "birthDate": "1990-05-01",     // Required, DateOnly
  "birthPlace": "طرابلس",         // ≤96, اختياري
  "maritalStatus": "single",     // ^(single|married|divorced|widowed)$, اختياري
  "phone": "+218911234567",      // ^\+?[0-9]{8,15}$, اختياري
  "email": "c@example.ly",       // EmailAddress, اختياري
  "regionId": 3,                 // Required
  "municipalityId": 12,          // اختياري
  "addressAr": "...",            // اختياري
  "photoPath": "citizen-photos/2026/07/....jpg", // اختياري
  "signaturePath": "..."         // اختياري
}
```

جسم الاستجابة (`CitizenView.From(Citizen)`):

```json
{
  "id": "…", "firstNameAr": "محمد", "fatherNameAr": "علي",
  "grandfatherNameAr": "سالم", "familyNameAr": "بلعيد",
  "firstNameEn": null, "fatherNameEn": null, "grandfatherNameEn": null, "familyNameEn": null,
  "motherNameAr": null, "legacyNationalNo": null, "familyBookNo": null,
  "gender": "male", "birthDate": "1990-05-01T00:00:00",
  "birthPlace": "طرابلس", "nationality": "Libyan", "maritalStatus": "single",
  "phone": "+218911234567", "email": "c@example.ly",
  "regionId": 3, "municipalityId": 12, "addressAr": "...",
  "photoPath": "...", "signaturePath": "...",
  "isActive": true,
  "createdAt": "2026-07-01T10:00:00+00:00",
  "updatedAt": "2026-07-01T10:00:00+00:00"
}
```

ملاحظات:
- يتطلّب المعالج أن يكون للمُنفِّذ `OfficerId` (وإلا `ERR_FORBIDDEN`).
- `nationality` يُضبط صراحةً إلى `"Libyan"` (لأنّ EF يُدرج العمود في جملة `INSERT` وبدون قيمة صريحة يُخالف قيد `NOT NULL DEFAULT`).
- `birthDate` (نوعه `DateOnly`) يُحوَّل داخليًا إلى `DateTime` بمنتصف الليل.
- تعارض الفهارس الفريدة (رقم وطني/هاتف/بريد) يُلتقط عبر رقمي خطأ SQL Server `2627`/`2601` ويُعاد كـ `ERR_CONFLICT` (409).
- تأثير جانبي: إرسال إشعار ترحيبي للمواطن عبر `NotifyCitizenAsync` مع `alsoSms: true`.

### GET /api/v1/citizens

توقيع المعالج:

```csharp
public Task<CursorPage<CitizenView>> List([FromQuery] ListCitizensQuery filters, CancellationToken ct)
```

معاملات الاستعلام (`ListCitizensQuery`):

| المعامل | الاسم في الطلب | النوع | ملاحظات |
|---|---|---|---|
| `Cursor` | `cursor` | string? | طابع زمني ISO للصفحة التالية |
| `Limit` | `limit` | int | `[Range(1,100)]`، افتراضي 20 |
| `Q` | `q` | string? | بحث نصّي؛ يُطبَّق فقط إذا كان طوله ≥ 2 |
| `RegionId` | `region_id` | int? | تصفية حسب المنطقة |

ملاحظات:
- يُعاد المواطنون النشطون فقط (`IsActive = true`).
- **نطاق المنطقة (region scoping)**: للأدوار غير `super_admin`/`auditor`، إن طلب المُنفِّذ `region_id` مخالفًا لمنطقته يُرمى `ERR_FORBIDDEN`؛ وإلا تُقيَّد النتائج تلقائيًا بمنطقة المُنفِّذ. أمّا `super_admin`/`auditor` فيُمكنهما التصفية بأي `region_id`.
- البحث `q` يجري بـ `LIKE` (مع تهريب الأحرف `[`, `%`, `_`) عبر الحقول: الاسم الرباعي العربي + `email` + `phone` + `legacyNationalNo`.
- ضمّ الدور `department_manager` هنا مقصود ليتمكّن مسار «تسجيل عقار» من جهة الموظّف من البحث عن المالك.

### GET /api/v1/citizens/{id:guid}

توقيع المعالج:

```csharp
public Task<CitizenView> Get(Guid id, CancellationToken ct)
```

يُعيد `CitizenView`. القاعدة الأمنية (في `GetByIdAsync`): إذا كان دور المُنفِّذ `citizen` و`CitizenId != id` → `ERR_FORBIDDEN`. عدم وجود المواطن → `ERR_NOT_FOUND` (`المواطن`/`Citizen`). لاحظ أنّ هذا المسار محمي بـ `[Authorize]` فقط (لا `[OfficerOnly]`) كي يتمكّن المواطن من قراءة سجلّه.

### PATCH /api/v1/citizens/{id:guid}

توقيع المعالج:

```csharp
public Task<CitizenView> Update(Guid id, [FromBody] UpdateCitizenDto dto, CancellationToken ct)
```

جسم الطلب (`UpdateCitizenDto`): كل الحقول اختيارية (nullable). **دلالة القيمة null = «اترك الحقل دون تغيير»** لأنّه لا يمكن التمييز بين null الصريح والغياب مع System.Text.Json. الحقول ونفس قواعد التحقّق كما في الإنشاء (مثلًا `firstNameAr` ‏`[MinLength(2),MaxLength(64)]`، `maritalStatus` ‏`^(single|married|divorced|widowed)$`، `phone` ‏`^\+?[0-9]{8,15}$`، `email` ‏`EmailAddress`). الحقول القابلة للتعديل: كامل الاسم العربي/الإنجليزي، `birthDate`, `motherNameAr`, `legacyNationalNo`, `familyBookNo`, `birthPlace`, `maritalStatus`, `phone`, `email`, `regionId`, `municipalityId`, `addressAr`, `photoPath`, `signaturePath`.

يُعيد `CitizenView`. ملاحظات مهمّة (من `UpdateAsync`):
- يتطلّب `OfficerId` وإلا `ERR_FORBIDDEN`؛ وعدم وجود المواطن → `ERR_NOT_FOUND`.
- تغيير أيٍّ من **حقول الهوية المدنية الجوهرية** (الاسم الرباعي العربي، `birthDate`، `legacyNationalNo`) يرفع علم `identityChanged`، فيُعاد احتساب `digital_id_cards.data_hash` لكل بطاقة حيّة (غير `revoked`/`expired`) عبر `RefreshCardIdentityHashesAsync`، وتُسجَّل حركة `identity-updated` في `id_issuance_history`، ويُرسَل إشعار للمواطن (‏`alsoSms: true`) بأنّ إعادة الإصدار قد تلزم.
- التعارضات الفريدة → `ERR_CONFLICT`. البريد يُخزَّن بأحرف صغيرة.

### GET /api/v1/citizens/{id:guid}/photo

توقيع المعالج (يُعيد ملفًّا مبثوثًا، لا JSON):

```csharp
public async Task<IActionResult> GetPhoto(Guid id, CancellationToken ct)
```

ملاحظات:
- الصلاحية: `[Authorize]`؛ إذا كان الدور `citizen` و`CitizenId != id` → `ERR_FORBIDDEN`. الموظّفون قد يجلبون أي صورة.
- عدم وجود المواطن أو خلوّ `PhotoPath` أو غياب فاصل المسار `/` → `ERR_NOT_FOUND`.
- `photo_path` مخزّن بصيغة `"<bucket>/<path>"`؛ يُفصَل عند أول `/` ويُبثّ عبر `StorageService.OpenRead`.
- نوع المحتوى يُشتقّ من الامتداد: `.png` → `image/png`، `.webp` → `image/webp`، وإلا `image/jpeg`. الترويسة `Cache-Control: private, max-age=300`.

---

## OfficersController — الموظّفون

الملف: `apps/api-dotnet/Controllers/OfficersController.cs`. المسار الأساسي `api/v1/officers`، والوحدة محميّة بـ `[Authorize]`. المنطق في `OfficersService` (`apps/api-dotnet/Officers/OfficersService.cs`) والأنواع في `apps/api-dotnet/Officers/OfficerDtos.cs`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `GET` | `/api/v1/officers` | `[OfficerOnly("super_admin","auditor","registry_officer","reviewer")]` | قائمة الموظّفين (بحث + تصفية + ترقيم مؤشّر) |
| `GET` | `/api/v1/officers/{id:guid}` | `[OfficerOnly("super_admin","auditor","registry_officer","reviewer")]` | جلب موظّف بالمُعرّف |
| `POST` | `/api/v1/officers` | `[OfficerOnly("super_admin")]` | إنشاء موظّف (ينشئ حساب `auth_users` + `officers`) |
| `PATCH` | `/api/v1/officers/{id:guid}` | `[OfficerOnly("super_admin")]` | تعديل جزئي لموظّف |
| `POST` | `/api/v1/officers/{id:guid}/set-active` | `[OfficerOnly("super_admin")]` | تفعيل/إيقاف حساب موظّف |
| `POST` | `/api/v1/officers/{id:guid}/reset-password` | `[OfficerOnly("super_admin")]` | إعادة تعيين كلمة مرور موظّف |

التدقيق: `POST` (create)، `PATCH` (update)، `set-active` (update)، `reset-password` (update بـ `CaptureRequestBody = false` كي لا تُسجَّل كلمة المرور الجديدة)، كلّها على الكيان `officers`.

### GET /api/v1/officers

توقيع المعالج:

```csharp
public Task<CursorPage<OfficerView>> List([FromQuery] ListOfficersQuery q, CancellationToken ct)
```

معاملات الاستعلام (`ListOfficersQuery`):

| المعامل | الاسم في الطلب | النوع | ملاحظات |
|---|---|---|---|
| `Cursor` | `cursor` | string? | طابع زمني ISO |
| `Limit` | `limit` | int | `[Range(1,100)]`، افتراضي 20 |
| `Q` | `q` | string? | بحث؛ يُطبَّق إذا كان طوله ≥ 2 |
| `Role` | `role` | string? | تصفية بالدور |
| `RegionId` | `region_id` | int? | تصفية بالمنطقة |
| `IsActive` | `is_active` | bool? | تصفية بالحالة |

ملاحظات: نفس منطق نطاق المنطقة كما في المواطنين (خرقه → `ERR_FORBIDDEN`). البحث `q` عبر `LIKE` على `FullNameAr`, `FullNameEn`, `EmployeeNo`, `Email`, `Phone`. يتطلّب `OfficerId` وإلا `ERR_FORBIDDEN`.

### GET /api/v1/officers/{id:guid}

يُعيد `OfficerView` عبر `GetByIdAsync`. عدم الوجود → `ERR_NOT_FOUND` (`الموظف`/`Officer`). للأدوار غير `super_admin`/`auditor` ذات منطقة محدّدة: إن كان الموظّف من منطقة أخرى → `ERR_FORBIDDEN`.

بنية `OfficerView` (من `OfficerDtos.cs`):

```json
{
  "id": "…", "authUserId": "…", "employeeNo": "EMP-001",
  "fullNameAr": "…", "fullNameEn": null, "role": "registry_officer",
  "regionId": 3, "municipalityId": 12, "phone": null, "email": "o@sarh.ly",
  "isActive": true,
  "createdAt": "…", "updatedAt": "…"
}
```

### POST /api/v1/officers

توقيع المعالج:

```csharp
public Task<OfficerView> Create([FromBody] CreateOfficerRequest req, CancellationToken ct)
```

جسم الطلب (`CreateOfficerRequest`):

```json
{
  "email": "o@sarh.ly",       // Required, EmailAddress
  "password": "••••••••",     // Required, MinLength(8)
  "fullNameAr": "اسم كامل",    // Required, MinLength(2)
  "fullNameEn": "Full Name",  // اختياري
  "employeeNo": "EMP-001",    // Required
  "role": "registry_officer", // Required — ضمن ValidRoles
  "regionId": 3,              // اختياري
  "municipalityId": 12,       // اختياري
  "phone": "+218...",         // اختياري
  "permissions": "{}"         // اختياري — سلسلة JSON، افتراضها "{}"
}
```

يُعيد `OfficerView`. ملاحظات (من `CreateAsync`):
- الدور يجب أن يكون ضمن `ValidRoles` (`super_admin`, `registry_officer`, `id_issuer`, `auditor`, `reviewer`, `department_manager`) وإلا `ERR_VALIDATION`.
- تكرار البريد → `ERR_CONFLICT` («البريد الإلكتروني مستخدم بالفعل»)؛ تكرار `employeeNo` → `ERR_CONFLICT` («رقم الموظف مستخدم بالفعل»).
- يُنشأ `AuthUser` بكلمة مرور مُجزّأة بـ `BCrypt.HashPassword(..., 12)` و`raw_app_meta_data = {"sarh_role":"<role>"}`، ثم يُنشأ `Officer` مرتبط به (بحفظين متتاليين). ويُرسَل إشعار ترحيبي للموظّف بدون كلمة المرور.

### PATCH /api/v1/officers/{id:guid}

توقيع المعالج:

```csharp
public Task<OfficerView> Update(Guid id, [FromBody] UpdateOfficerRequest req, CancellationToken ct)
```

جسم الطلب (`UpdateOfficerRequest`) — كل الحقول اختيارية (null = دون تغيير): `fullNameAr`, `fullNameEn`, `employeeNo`, `role`, `regionId`, `municipalityId`, `phone`, `email`, `permissions`.

يُعيد `OfficerView`. ملاحظات (من `UpdateAsync`):
- عدم الوجود → `ERR_NOT_FOUND`؛ دور غير صالح → `ERR_VALIDATION`.
- تغيير `email`: يُتحقّق من عدم التعارض مع مستخدم آخر (`ERR_CONFLICT`)، ويُحدَّث على `officers` و`auth_users` معًا. تغيير `role` يحدّث كذلك `auth_users.raw_app_meta_data`. تغيير `employeeNo` يُتحقّق من عدم تعارضه.
- التغييرات المؤثّرة على الوصول (`role`/`regionId`/`permissions`) ترفع علم `accessChanged` وتُرسِل إشعارًا للموظّف؛ أمّا تعديلات التواصل فقط فتبقى صامتة.

### POST /api/v1/officers/{id:guid}/set-active

```csharp
public Task<OfficerView> SetActive(Guid id, [FromBody] SetOfficerActiveRequest req, CancellationToken ct)
```

جسم الطلب (`SetOfficerActiveRequest`):

```json
{ "isActive": false }
```

يُعيد `OfficerView`. عدم الوجود → `ERR_NOT_FOUND`. يُحدِّث `IsActive` ويُرسِل إشعارًا مناسبًا للموظّف (تفعيل/إيقاف).

### POST /api/v1/officers/{id:guid}/reset-password

```csharp
public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetPasswordRequest req, CancellationToken ct)
```

جسم الطلب (`ResetPasswordRequest`):

```json
{ "newPassword": "••••••••" }  // Required, MinLength(8)
```

جسم الاستجابة:

```json
{ "success": true }
```

ملاحظات (من `ResetPasswordAsync`): طول أقل من 8 → `ERR_VALIDATION`. عدم وجود الموظّف → `ERR_NOT_FOUND` (`الموظف`)؛ عدم وجود حساب `auth_users` المرتبط → `ERR_NOT_FOUND` (`الحساب`). تُجزّأ كلمة المرور الجديدة بـ `BCrypt.HashPassword(..., 12)`، ويُرسَل إشعار للموظّف بأنّ المسؤول أعاد تعيين كلمته دون تضمين الكلمة الجديدة. المسار مُدقَّق بـ `CaptureRequestBody = false`.

---

## UploadsController — رفع الملفّات

الملف: `apps/api-dotnet/Controllers/UploadsController.cs`. المسار الأساسي `api/v1/uploads`، والوحدة محميّة بـ `[Authorize]`. يستخدم `StorageService`. الرفع بصيغة `multipart/form-data` عبر حقل `IFormFile file`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `POST` | `/api/v1/uploads/citizen-photo` | `[OfficerOnly("id_issuer","registry_officer","super_admin")]` | رفع صورة مواطن شخصية |
| `POST` | `/api/v1/uploads/property-document` | `[Authorize]` (أي مستخدم مصادَق) | رفع مستند عقار (صورة موقع/مخطّط كروكي) |

بنية الاستجابة الموحّدة (`UploadResponse`، مُعرَّفة داخل الوحدة):

```json
{
  "bucket": "citizen-photos",
  "path": "2026/07/<uuid>.jpg",
  "size": 204800,
  "mimeType": "image/jpeg",
  "sha256": "<hex>"
}
```

### POST /api/v1/uploads/citizen-photo

توقيع المعالج:

```csharp
public async Task<UploadResponse> UploadCitizenPhoto(IFormFile file, CancellationToken ct)
```

ملاحظات:
- ملف فارغ/غير مُرسل → `ERR_VALIDATION` («لم يتم اختيار ملف»).
- الأنواع المقبولة `PhotoMimes = ["image/jpeg","image/png","image/webp"]`، والحدّ الأقصى `MaxPhotoBytes = 5 MB` (مع `[RequestSizeLimit(MaxPhotoBytes + 1024)]`).
- الوجهة: bucket = `citizen-photos`، وبادئة المسار `yyyy/MM` (UTC). `path` يُعاد **دون** بادئة الـ bucket.

### POST /api/v1/uploads/property-document

توقيع المعالج:

```csharp
public async Task<UploadResponse> UploadPropertyDocument(IFormFile file, CancellationToken ct)
```

ملاحظات:
- مفتوح لأي مستخدم مصادَق عليه (مواطن يسجّل عقاره يرفع هنا قبل أن يشير إليه `POST /properties`).
- الأنواع المقبولة `PropertyDocMimes = ["image/jpeg","image/png","image/webp","application/pdf"]` (لأن مخطّط الكروكي قد يكون PDF ممسوحًا)، والحدّ الأقصى `MaxPropertyDocBytes = 10 MB` (مع `[RequestSizeLimit(MaxPropertyDocBytes + 1024)]`).
- الوجهة: bucket = `property-documents`، بادئة المسار `yyyy/MM`. **خلافًا لمسار الصورة**، يُعاد `path` بالصيغة المدمجة `"<bucket>/<path>"` لتُخزَّن حرفيًا في `property_documents.storage_path` عند الإرسال اللاحق.

---

## RegionsController — المناطق

الملف: `apps/api-dotnet/Controllers/RegionsController.cs`. المسار الأساسي `api/v1/regions`، والوحدة **مفتوحة** عبر `[AllowAnonymous]` صراحةً (لتغذية قوائم المناطق في شاشات تسجيل الدخول/التسجيل قبل المصادقة). يقرأ مباشرةً من `SarhDbContext`.

| الطريقة | المسار | الصلاحية/الدور | الوصف |
|---|---|---|---|
| `GET` | `/api/v1/regions` | anonymous | قائمة كل المناطق مرتّبة تصاعديًا حسب `code` |

توقيع المعالج:

```csharp
public async Task<IReadOnlyList<RegionView>> List(CancellationToken ct)
```

بنية العنصر (`RegionView`، سجلّ مُعرَّف في نفس الملف: `record RegionView(int Id, string Code, string NameAr, string? NameEn)`). الاستجابة مصفوفة مباشرة (بلا مغلّف ترقيم):

```json
[
  { "id": 1, "code": "TR", "nameAr": "طرابلس", "nameEn": "Tripoli" },
  { "id": 2, "code": "BN", "nameAr": "بنغازي", "nameEn": "Benghazi" }
]
```

ملاحظة: الترتيب `OrderBy(r => r.Code)` والقراءة `AsNoTracking`؛ لا معاملات استعلام ولا ترقيم.
