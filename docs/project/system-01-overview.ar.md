# نظرة عامة على النظام والمعمارية

## 1. هوية النظام والغرض والمستخدمون

**صَرح (Sarh)** هي منصّة ليبية موحّدة تجمع بين **سجل العقارات (Real Estate Registry)** و**إصدار الهوية الرقمية (Digital Identity Issuance)**. الجهة المالكة هي **LVCT (Libya Vision for Communication & Technology)**. تُبنى الواجهة الخلفية على **ASP.NET Core 8 / C# 12 / EF Core 8** فوق **SQL Server**، بينما تُبنى الواجهة الأمامية على **Angular 21** والتطبيق المحمول على **Flutter**. مرجع السياق الكامل هو `CLAUDE.md`.

النظام مصمَّم وفق قيود غير قابلة للتفاوض (من `CLAUDE.md`)، أهمّها للمعمارية: العربية أولاً واتجاه RTL، إعادة إصدار الهوية الرقمية دون فقدان بيانات (حقل `legacy_national_no`)، سجل تدقيق **append-only**، ومنع فحص الأدوار بنصوص حرّة مبعثرة في الشيفرة.

### فئات المستخدمين

| المستخدم | الدور (`sarh_role`) | الوصف |
|---|---|---|
| المواطن | `citizen` | يقدّم طلبات العقارات، يملك بطاقة هوية رقمية، يسجّل الدخول بالبريد+كلمة المرور أو برقم الهوية الرقمية + PIN |
| ضابط السجل العقاري | `registry_officer` | يستقبل ويعالج طلبات العقارات والمستندات |
| المراجِع | `reviewer` | يراجع الطلبات ويرصد التحذيرات (تداخل، انحراف المساحة) |
| مدير الإدارة | `department_manager` | يعتمد/يرفض الطلبات ويصدر الرخص والنقل |
| ضابط إصدار الهوية | `id_issuer` | يصدر بطاقات الهوية الرقمية، يبرمج NFC، يعيد ضبط الـ PIN |
| المدقّق | `auditor` | يقرأ سجل التدقيق والتقارير |
| المدير الأعلى | `super_admin` | صلاحيات كاملة على جميع الوحدات |
| المُحقِّق العام | (بدون مصادقة) | يتحقّق من سند/رخصة عبر مسارات `[AllowAnonymous]` العامة |

أسماء الأدوار المعتمدة فعلياً في الشيفرة (من سمات `[OfficerOnly(...)]`): `super_admin` و`auditor` و`registry_officer` و`reviewer` و`department_manager` و`id_issuer`، إضافةً إلى `citizen`.

---

## 2. حزمة التقنيات (Tech Stack)

### حزم NuGet الحقيقية (من `apps/api-dotnet/Sarh.Api.csproj`)

| الحزمة | الإصدار | الاستخدام |
|---|---|---|
| `BCrypt.Net-Next` | 4.0.3 | تجزئة كلمات المرور ورموز الـ PIN والتحقق منها |
| `Microsoft.AspNetCore.Authentication.JwtBearer` | 8.0.10 | التحقق من رموز JWT الحاملة (Bearer) |
| `Microsoft.EntityFrameworkCore.Design` | 8.0.10 | أدوات تصميم EF Core (PrivateAssets) |
| `Microsoft.EntityFrameworkCore.SqlServer` | 8.0.10 | مزوّد EF Core لـ SQL Server |
| `Nethereum.Web3` | 4.29.0 | المسار الحقيقي على السلسلة (mint/transfer/read) على Sepolia/EVM |
| `QuestPDF` | 2024.7.3 | توليد سند الملكية بصيغة PDF |
| `QRCoder` | 1.6.0 | توليد رمز QR للتحقق داخل السند |
| `System.Security.Cryptography.Pkcs` | 8.0.1 | توقيع CMS/PKCS#7 المنفصل للسند (`SignedCms`/`CmsSigner`) |
| `Swashbuckle.AspNetCore` | 6.6.2 | توليد OpenAPI/Swagger |

بالإضافة إلى حزم البنية المثبّتة في `CLAUDE.md`: قاعدة البيانات **SQL Server 2019/2022** بنوع `geography` وكتالوج بحث نصّي عربي ومشغّلات `INSTEAD OF`؛ الهوية الذاتية السيادية عبر **Hyperledger Aries / ACA-Py v0.12+** بطريقة `did:sov`؛ التطبيق المحمول **Flutter 3.22+ / Dart 3.4 / Riverpod / go_router / flutter_nfc_kit / mapbox_maps_flutter**.

### تفاصيل مبيّتة في `csproj`
- تُضمَّن ملفات T-SQL المرقّمة تحت `infra/mssql/migrations/*.sql` و`bootstrap-login.sql` كـ `<EmbeddedResource>` ببادئة منطقية `SarhSql.` لتشغيلها من الأصل (assembly) على أي جهاز.
- تُنسخ `Data\DemoData\seed-data.json` بجانب الملف التنفيذي (`PreserveNewest`) لتحميل بيانات العرض.

---

## 3. المعمارية عالية المستوى — خريطة الوحدات

الواجهة الخلفية مقسّمة إلى مجلدات-وحدات تحت `apps/api-dotnet/`، سُجّلت خدماتها في حاوية الحقن (DI) داخل `apps/api-dotnet/Program.cs`. الجدول التالي يعدّد كل مجلد ومسؤوليته:

| الوحدة (المجلد) | المسؤولية |
|---|---|
| `Citizens/` | إدارة سجلّات المواطنين (`CitizensService`) وربطهم بحساب المصادقة والهوية الرقمية |
| `Properties/` | استقبال ومعالجة طلبات العقارات وحساب المساحة من المضلّع عبر `geography.STArea()` (`PropertiesService`) |
| `DigitalIdCards/` | إصدار وإدارة بطاقات الهوية الرقمية وتوليد أرقامها (`DigitalIdCardsService` + `DigitalIdNumberService`) |
| `Nfc/` | تشفير/تخزين مفاتيح NTAG 424 DNA والتحقق من رسائل SUN (`NfcService` + `NfcKeyStoreService`) |
| `Ssi/` | الهوية الذاتية السيادية وإصدار الشهادات القابلة للتحقق عبر ACA-Py أو مُصدِر بديل (`ISsiService`) |
| `Blockchain/` | سكّ/نقل/قراءة رخص الملكية على السلسلة (Nethereum) أو نسخة stub، وخدمة IPFS (`IBlockchainService` + `IIpfsService` + `KmsCrypto`) |
| `Verify/` | التحقق العام من السندات والرخص وبثّ ملف السند PDF (`VerifyService`) — مسارات مفتوحة |
| `Workflow/` | مراجعة/اعتماد الطلبات، بناء وتوقيع السند PDF، الرخص، NFTs، ونقل الملكية (`ReviewService`، `LicenseService`، `NftsService`، `TransferService`، `DeedPdfBuilder`، `DeedSigningService`) |
| `Notifications/` | الإشعارات داخل التطبيق وبثّها عبر SignalR وإرسال SMS (`NotificationsService`، `NotificationsHub`، `ISmsSender`) |
| `Disputes/` | تسجيل ومعالجة النزاعات على العقارات (`DisputesService`) |
| `Officers/` | إدارة الضباط وأدوارهم ونطاقاتهم الجغرافية وصلاحياتهم (`OfficersService`) |
| `Auth/` | المصادقة وإصدار/تحقق JWT وحلّ الدور والصلاحيات (`AuthService`، `JwtTokenService`، `CurrentUser`، `OfficerOnly`) |
| `Audit/` | كتابة سجل التدقيق غير القابل للتعديل عبر فلتر عام (`AuditService`، `AuditActionFilter`، `AuditAttribute`) |
| `Map/` | استعلامات الخرائط والهندسة الجغرافية (`MapService`) |
| `Storage/` | تخزين الملفات على نظام الملفات المحلي تحت `STORAGE_ROOT` (`StorageService`) |
| `Common/` | المكوّنات العرضية: مغلّف الأخطاء، ترقيم الصفحات بالمؤشّر، جسر متغيّرات البيئة، سياسات تحديد المعدّل |
| `Data/` | سياق EF Core، الكيانات، مقاطعة سياق الجلسة، بذر البيانات، أدوات ترحيل EF (`SarhDbContext`، `SessionContextInterceptor`، `DbSeeder`، `EfDatabaseBootstrapper`) |

وحدات إضافية داعمة: `Controllers/` (طبقة REST) و`Migrations/` (سجلّ ترحيلات EF المرتّب). ملاحظة: المرجعية الجغرافية العامة تُخدَم عبر `RegionsController` (لا يوجد مجلد `Regions/` مستقلّ)، وهو يقرأ مباشرةً من `SarhDbContext` على المسار `GET /api/v1/regions`.

---

## 4. دورة حياة الطلب — ترتيب خط الأنابيب (Pipeline)

يُبنى التطبيق ويُهيّأ في `apps/api-dotnet/Program.cs`. الترتيب الفعلي كما هو مكتوب:

### أ. مرحلة التهيئة (قبل `builder.Build()`)
1. **جسر متغيّرات البيئة** — `Sarh.Api.Common.EnvBootstrap.ApplyEnvOverrides(...)` يترجم الأسماء القانونية (`SARH_JWT_SECRET`، `MSSQL_*`، `STORAGE_ROOT`، `CORS_ORIGINS`، …) إلى مفاتيح `Sarh:*`.
2. **أوامر لمرة واحدة** — أعلام سطر الأوامر مثل `--encrypt-minter-key` و`--new-minter-wallet` و`--deploy-contract` تُنفَّذ ثم تنهي العملية قبل تشغيل الويب.
3. **Controllers + الفلتر العام** — يُضاف `Sarh.Api.Audit.AuditActionFilter` كفلتر عام على كل المتحكّمات، وتُضبط سياسة JSON على `snake_case`.
4. **Swagger / CORS / SignalR / RateLimiter** — تُسجَّل CORS بقائمة أصول من `Sarh:CorsOrigins` (افتراضياً `localhost:4200` و`127.0.0.1:4200`) مع `AllowCredentials()`؛ ويُسجَّل مُحدِّد المعدّل بسياستَي `auth` و`write` اللتين تُصدران مغلّف خطأ `ERR_RATE_LIMITED` عند الرفض.
5. **EF Core + مقاطعة سياق الجلسة** — يُضاف `SarhDbContext` على `UseSqlServer(connStr)` مع `AddInterceptors(SessionContextInterceptor)` و`AddHttpContextAccessor()` لتفعيل RLS.
6. **المصادقة JWT** — `AddAuthentication(JwtBearerDefaults...).AddJwtBearer(...)`: HS256 بمفتاح `JwtTokenService.SigningKey`، مع `MapInboundClaims = false` و`NameClaimType = "sub"`، والتحقق من العمر والتوقيع فقط (بدون `Issuer`/`Audience`). أحداث `OnMessageReceived` تسحب `?access_token=` لمسارات `/hubs`، و`OnChallenge`/`OnForbidden` تُرجعان مغلّف `ERR_UNAUTHORIZED`/`ERR_FORBIDDEN`.
7. **حقن الخدمات** — تُسجَّل خدمات كل وحدة (`CitizensService`، `PropertiesService`، `ReviewService`، `NfcService`، `StorageService`، `AuditService`، `NotificationsService`، …) وتُختار تنفيذات مشروطة: `EthereumBlockchainService` مقابل `StubBlockchainService`، و`AcaPySsiService` مقابل `PlaceholderSsiService`، و`LibyanaSmsSender` مقابل `LogSmsSender`، حسب الإعدادات.

### ب. تزويد قاعدة البيانات
بعد `app.Build()`، إذا كان `--migrate` أو `Sarh:AutoMigrate` (مفعّل افتراضياً) يشغّل `EfDatabaseBootstrapper.RunAsync(...)` على اتصال ترحيل مميّز (Windows-auth). في وضع `--migrate` يخرج بعدها دون تشغيل خادم الويب.

### ج. خط أنابيب معالجة الطلب (بعد `app.Build()`) — الترتيب الحرفي

```
app.UseMiddleware<SarhExceptionMiddleware>();   // 1) التقاط الأخطاء وتغليفها
if (IsDevelopment) { app.UseSwagger(); app.UseSwaggerUI(...); }  // 2) التوثيق (تطوير فقط)
app.UseCors();                                  // 3) CORS
app.UseAuthentication();                        // 4) قراءة/تحقق JWT
app.UseAuthorization();                          // 5) تطبيق [Authorize] و[OfficerOnly]
if (rateLimitOptions.Enabled) app.UseRateLimiter(); // 6) تحديد المعدّل (بعد المصادقة)
app.MapControllers();                            // 7) توجيه المتحكّمات
app.MapHub<NotificationsHub>("/hubs/notifications"); // 8) SignalR
```

الترتيب مقصود: `SarhExceptionMiddleware` هو الأخارجي فيلتقط أي `SarhException` أو استثناء غير متوقّع؛ ثم CORS؛ ثم المصادقة قبل الترخيص؛ ثم مُحدِّد المعدّل **بعد** المصادقة كي تُقسِّم سياسة `write` حسب مُعرِّف الموضوع (`sub`) في JWT وليس الـ IP فقط.

### د. الشؤون العرضية داخل المتحكّم
عند الوصول إلى الـ action:
- تتحقّق سمة `[Authorize]` (على مستوى المتحكّم) من وجود مستخدم مصادَق، ما لم تُستثنَ بـ `[AllowAnonymous]`.
- تتحقّق سمة `[OfficerOnly(...)]` من أن `sarh_role` ضمن القائمة المسموحة.
- بعد **نجاح** الـ action، يُشغَّل `AuditActionFilter` فيكتب سجل التدقيق إن كانت الطريقة موسومة بـ `[Audit]`.

---

## 5. المصادقة (Authentication & Authorization)

### إصدار الرمز — `JwtTokenService`
الملف `apps/api-dotnet/Auth/JwtTokenService.cs`. يقرأ `Sarh:JwtSecret` (المصدر `SARH_JWT_SECRET`) ويشترط طوله ≥ 32 محرفاً، ومدّة الصلاحية `Sarh:JwtAccessTtlSeconds` (افتراضياً 3600 ثانية). التوقيع HS256:

```csharp
public (string token, int expiresIn) SignAccessToken(SarhJwtPayload payload)
public static SarhJwtPayload FromClaimsPrincipal(ClaimsPrincipal user)
public SecurityKey SigningKey => new SymmetricSecurityKey(_secretBytes);
```

يُسلسل الحمولة إلى JSON ويحوّل كل خاصية إلى `Claim` (والكائنات/المصفوفات إلى `JsonClaimValueTypes.Json`) مع `notBefore` و`expires`.

### بنية الحمولة — `SarhJwtPayload`
الملف `apps/api-dotnet/Auth/SarhJwtPayload.cs`:

| الحقل (claim) | النوع | ملاحظة |
|---|---|---|
| `sub` | `string` (required) | مُعرِّف المستخدم في `auth_users` |
| `email` | `string?` | |
| `sarh_role` | `string` (required) | الدور المعتمد للفحص |
| `citizen_id` | `string?` | |
| `officer_id` | `string?` | |
| `region_id` | `int?` | نطاق جغرافي للضابط |
| `municipality_id` | `int?` | |
| `permissions` | `Dictionary<string, object?>?` | خريطة صلاحيات JSON (اختيارية في الحمولة) |

### تسجيل الدخول — `AuthService`
الملف `apps/api-dotnet/Auth/AuthService.cs` عبر المتحكّم `apps/api-dotnet/Controllers/AuthController.cs`:

| المسار | الطريقة | التدفّق |
|---|---|---|
| `POST /api/v1/auth/sign-in` | `SignInAsync` | بريد+كلمة مرور؛ يتحقق من `auth_users.encrypted_password` عبر bcrypt، يحلّ الدور من الضابط أو من `raw_app_meta_data`، ويصدر JWT + refresh token عشوائي، ويحدّث `last_sign_in_at` |
| `POST /api/v1/auth/sign-in-with-pin` | `SignInWithPinAsync` | رقم الهوية الرقمية + PIN؛ يتحقق من `digital_id_cards.pin_hash` عبر bcrypt للمواطن |

يعتمد `sarh_auth_claims` (وفق `CLAUDE.md`) لإخراج نفس شكل `citizen_id`/`officer_id`/`role`/`permissions`. جدول `auth_users` هو مصدر بيانات الاعتماد.

**مقاومة تعداد المستخدمين**: في مسار الـ PIN، حالات "لا بطاقة" و"لا PIN" و"PIN خاطئ" تُرجِع جميعها نفس الرسالة العامة `ERR_INVALID_CREDENTIALS`، مع تشغيل `BCrypt.Verify` على تجزئة وهمية (`DummyPinHash`) لمساواة زمن الاستجابة ومنع هجمات التوقيت. تفاصيل حالة البطاقة (`frozen`/`revoked`/`expired`/`lost`) لا تُكشف إلا **بعد** التحقق من الـ PIN عبر `ERR_CARD_NOT_ACTIVE`.

### التحقّق المحلي بلا رحلة قاعدة بيانات
`Program.cs` يضبط `AddJwtBearer` بحيث يُتحقّق من التوقيع والعمر محلياً؛ ثم يُستخرج المستخدم من المطالبات عبر `CurrentUserExtensions.RequireUser(...)` في `apps/api-dotnet/Auth/CurrentUser.cs`:

```csharp
public sealed record CurrentUser(
    Guid AuthUserId, string? Email, string Role,
    Guid? OfficerId, Guid? CitizenId, int? RegionId, int? MunicipalityId);
```

### بوّابة الترخيص — `[OfficerOnly]` وخريطة الصلاحيات
الملف `apps/api-dotnet/Auth/RequireRoleAttribute.cs`. الفلتر `RequireRoleAttribute` (وامتداده `OfficerOnlyAttribute`) هو `IAsyncActionFilter` يقرأ مطالبة `sarh_role` ويرفض بـ `Unauthorized()` عند غيابها أو `Forbidden()` عند عدم انتمائها للقائمة المسموحة:

```csharp
public sealed class OfficerOnlyAttribute(params string[] allowed) : RequireRoleAttribute(allowed);
```

**الحالة الفعلية مقابل القيد #7**: القيد رقم 7 في `CLAUDE.md` ينصّ على «عدم فحص الأدوار بنصوص حرّة — المرور دائماً عبر خريطة الصلاحيات JSON على `officers.permissions`». في الشيفرة الحالية، البوّابة المُنفَّذة فعلياً قائمة على **الدور** (`sarh_role`) عبر قوائم `[OfficerOnly(...)]` المركزية على المتحكّمات (مثال: `[OfficerOnly("id_issuer", "super_admin")]` على `DigitalIdCardsController`)، وليست على قراءة خريطة `permissions`. عمود `permissions` (نوع `NVARCHAR(MAX)` كـ JSON) موجود على الكيان `Officer` في `apps/api-dotnet/Data/Entities/Officer.cs` ويُخزَّن/يُحدَّث عبر `OfficersService` (`apps/api-dotnet/Officers/OfficersService.cs`)، ويُحمَل ضمن `SarhJwtPayload.Permissions`، لكنه غير مستهلَك في أي بوّابة ترخيص وجدتُها في الشيفرة. أي أن التطبيق يوحّد فحص الدور في سمات مركزية (يتجنّب النصوص المبعثرة)، لكنه لا يعتمد بعدُ خريطة الصلاحيات التفصيلية كمصدر قرار الترخيص.

توزيع الأدوار على المتحكّمات كما هو في الشيفرة:

| المتحكّم | الأدوار المسموحة |
|---|---|
| `AuditController` | `super_admin`, `auditor` |
| `ReportsController` | `super_admin`, `auditor`, `department_manager` |
| `DigitalIdCardsController` | `id_issuer`, `super_admin` (وبعض العمليات `registry_officer`) |
| `NfcController` (encode) | `id_issuer`, `super_admin` |
| `PropertiesController` (approve) | `department_manager`, `super_admin` |
| `PropertiesController` (review) | `registry_officer`, `reviewer`, `super_admin` |
| `OfficersController` (كتابة) | `super_admin` |
| `DemoDataController` (reset/truncate) | `super_admin` |

### المسارات العامة (`[AllowAnonymous]`)
- `VerifyController` بالكامل — التحقّق العام من السندات والرخص وبثّ `GET /api/v1/verify/:code/deed.pdf`.
- `RegionsController` بالكامل — المرجعية الجغرافية.
- عمليات محدّدة في `DemoDataController` و`NfcController`.

---

## 6. سجل التدقيق غير القابل للتعديل (Append-only Audit Log)

### طبقة قاعدة البيانات — `infra/mssql/migrations/011_audit.sql`
جدول `audit_log` مفتاحه `BIGINT IDENTITY(1,1)` (للترتيب، خلافاً لبقية الجداول ذات `UNIQUEIDENTIFIER`)، وأعمدته: `actor_kind`، `actor_id`، `action` (بقيد `CHECK` على قيم `create/update/delete/approve/reject/issue_id/revoke_id/view/login`)، `entity_table`، `entity_id`، `before_state`/`after_state` (JSON مع `ISJSON`)، `ip_address`، `user_agent`، `occurred_at`. يفرض المنع مشغّلان `INSTEAD OF`:

```sql
CREATE OR ALTER TRIGGER tr_audit_log_no_update ON audit_log
INSTEAD OF UPDATE AS BEGIN THROW 51001, N'audit_log is append-only — UPDATE blocked', 1; END
CREATE OR ALTER TRIGGER tr_audit_log_no_delete ON audit_log
INSTEAD OF DELETE AS BEGIN THROW 51002, N'audit_log is append-only — DELETE blocked', 1; END
```

بما أن SQL Server لا يملك مشغّل `BEFORE`، يلغي مشغّل `INSTEAD OF` العملية برمي خطأ دون تنفيذ الـ DML الداخلي، فيتحقّق المنع عند طبقة القاعدة بغضّ النظر عن الشيفرة.

### الكتابة — `AuditService`
الملف `apps/api-dotnet/Audit/AuditService.cs`. يكتب `AuditEntry` عبر أمر SQL خام مُعلَّم (parameterised) على اتصال `SqlConnection` وليس عبر تتبّع كيانات EF (لأن `audit_log` يستخدم `IDENTITY` ولا يشارك في `DbContext`). فشل الكتابة **لا يُصعّد أبداً**: يُلتقط ويُسجَّل فقط، إذ خسارة صفّ تدقيق أهون من خسارة الطلب.

### الفلتر العام — `AuditActionFilter` + `AuditAttribute`
الملفان `apps/api-dotnet/Audit/AuditActionFilter.cs` و`apps/api-dotnet/Audit/AuditAttribute.cs`. مُسجَّل عالمياً في `Program.cs`، ويعمل فقط على الطرق الموسومة بـ `[Audit]` (لا يفعل شيئاً لغيرها). آلية العمل:
1. يلتقط جسم الطلب الوارد (DTO) **قبل** تنفيذ الـ action إن كان `CaptureRequestBody = true`.
2. ينفّذ الـ action؛ وإذا وقع استثناء غير مُعالَج يخرج دون كتابة (الطلبات الفاشلة لا تُدوَّن).
3. يستخرج جسم الاستجابة، ويحلّ الفاعل (`officer`/`citizen`/`system`) من المطالبات (`ResolveActor`)، ويستنتج فاعل تسجيل الدخول من جسم الاستجابة عند الحاجة (`ResolveLoginActorFromBody`).
4. يلتقط `entity_id` من مسار منقّط قابل للضبط (`EntityIdFrom`، افتراضياً `id`).
5. يكتب الصفّ عبر `AuditService.RecordAsync`.

خصائص `[Audit]`: `Action`، `Entity`، `EntityIdFrom`، `CaptureRequestBody`، `CaptureResponseBody`. **حماية الأسرار**: في `AuthController` تُضبط `CaptureRequestBody = false` و`CaptureResponseBody = false` على تسجيل الدخول كي لا تتسرّب كلمات المرور أو رموز الـ PIN أو الـ JWT إلى السجل الذي لا يُمحى.

### الرؤية عبر RLS — `SessionContextInterceptor`
الملف `apps/api-dotnet/Data/SessionContextInterceptor.cs`. بعد التحوّل إلى اتصال `sarh_app` واحد مميّز، تُفقَد ربط الهوية بالاتصال، فتصبح صفوف التدقيق مرئية للجميع أو لا أحد. هذا المقاطِع يضبط `SESSION_CONTEXT` عند **كل** فتح اتصال من هوية الطلب (`officer_role` و`citizen_id`)، ويعيده إلى `NULL` عند الطلب المجهول، حتى لا يسرّب اتصال مُجمَّع (pooled) رؤيةَ `super_admin` سابقة إلى طلب لاحق. بهذا تعمل سياسات RLS في `infra/mssql/migrations/015_rls.sql` تحت طبقة .NET.

---

## 7. التخزين (Storage)

### `StorageService`
الملف `apps/api-dotnet/Storage/StorageService.cs` (مُسجَّل كـ Singleton). يستبدل Supabase Storage بنظام ملفات محلي تحت الجذر المحدَّد بترتيب: `Sarh:StorageRoot` ← متغيّر البيئة `STORAGE_ROOT` ← `./storage`. تُخزَّن الملفات بالنمط `STORAGE_ROOT/<bucket>/<pathPrefix>/<uuid><ext>`، والسلسلة المُعادة `"<bucket>/<prefix>/<uuid>.ext"` تطابق أعمدة `*_path` في القاعدة فلا تتغيّر بنية الجداول.

### الأعضاء العامة

```csharp
Task<UploadResult> UploadAsync(UploadFile file, UploadOptions opts, CancellationToken ct);
Task<byte[]>       ReadAsync(string bucket, string path, CancellationToken ct);
Stream             OpenRead(string bucket, string path);
Task<UploadResult> WriteRawAsync(string bucket, string path, byte[] data, string mime, CancellationToken ct);
```

| العضو | الدور |
|---|---|
| `UploadAsync` | يتحقق من حجم الملف (`MaxBytes`) ونوع MIME المسموح، ينقّي الامتداد، يكتب بـ `FileMode.CreateNew` (يرفض الكتابة فوق ملف قائم)، ويُعيد `UploadResult` مع `Sha256` |
| `ReadAsync` | يقرأ كامل البايتات؛ يرمي `NotFound` إن غاب الملف |
| `OpenRead` | تدفّق ملائم للسندات الكبيرة (PDF) دون تحميلها في الذاكرة — يستخدمه بثّ السند في `Verify` |
| `WriteRawAsync` | كتابة خام لبايتات مولّدة (مثل السند) |

**الحماية من عبور المسار (Path Traversal)**: الدالّة الخاصّة `AbsoluteFor` تُطبِّع البُكِت وتُطبِّع المسار المرشّح ثم ترفضه إن خرج عن `<root>/<bucket>`، وتُنقّى أسماء البُكِت والامتدادات بتعابير نمطية آمنة (`SafeBucketRe`، `SafeExtRe`). يُحسَب `SHA-256` لكل ملف لدعم كشف العبث.

### كيف تلتفّ هذه الشؤون العرضية حول كل طلب
- **المصادقة** تسبق كل شيء عبر `UseAuthentication`/`UseAuthorization`، فيصل كل طلب إلى المتحكّم إما مصادَقاً (JWT صحيح) أو مرفوضاً بمغلّف `ERR_UNAUTHORIZED`/`ERR_FORBIDDEN`.
- **الترخيص** يُطبَّق مركزياً بسمات `[OfficerOnly(...)]` على مستوى المتحكّم/الطريقة.
- **التدقيق** يلتفّ حول كل طريقة موسومة بـ `[Audit]` عبر الفلتر العام، فيُدوَّن كل مسار كتابة دون أن يُصعِّد فشلُه الطلب.
- **سياق الجلسة** يُحقَن عند كل فتح اتصال قاعدة بيانات فيُفعّل RLS وفق هوية الطلب.
- **الأخطاء** يلتقطها `SarhExceptionMiddleware` الخارجي فيوحّد شكل الاستجابة في مغلّف `{ "error": { "code", "message_ar", "message_en", "details" } }` (`apps/api-dotnet/Common/Errors/SarhError.cs`).
- **تحديد المعدّل** (عند التفعيل) يلتفّ بعد المصادقة على مسارات الاعتماد والكتابة.

بهذا تُشكّل هذه الطبقات غلافاً موحّداً يمرّ عبره كل طلب: بيئة → CORS → مصادقة → ترخيص → تحديد معدّل → منطق الوحدة → تدقيق → تغليف الخطأ.
