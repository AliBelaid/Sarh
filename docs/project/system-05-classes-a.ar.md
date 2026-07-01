# فئات الواجهة الخلفية وخدماتها — الجزء الأول

يوثّق هذا الفصل الفئات الخلفية (C# / .NET 8) لخمس وحدات نطاقية أساسية في منصّة **صَرح**: وحدة المواطنين (`Citizens`)، وحدة العقارات (`Properties`)، وحدة بطاقات الهوية الرقمية (`DigitalIdCards`)، وحدة الاتصال قريب المدى (`Nfc`)، ووحدة الموظفين (`Officers`). جميع هذه الوحدات تتبع النمط ذاته: فئة خدمة (`*Service`) تحمل منطق العمل وتتلقّى تبعياتها عبر الحقن (constructor injection)، ومجموعة من كائنات نقل البيانات (DTOs) وكائنات العرض (`*View`) المعرّفة في ملف `*Dtos.cs` مجاور. تُستدعى الخدمات من متحكّمات (Controllers) خارج نطاق هذه الوحدات (في `apps/api-dotnet/Controllers/`)، ويُشار إلى مساراتها عند اللزوم فقط لتوضيح كيفية استهلاك كل دالة.

القواعد المشتركة المرصودة في الشيفرة:

- التحقّق من الصلاحية يتم عبر `CurrentUser actor` الممرَّر من المتحكّم، حيث يُميَّز الموظف عن المواطن بحقلي `actor.OfficerId` و`actor.CitizenId`، والدور عبر `actor.Role`، ونطاق المنطقة عبر `actor.RegionId`.
- الترقيم يعتمد المؤشّر (cursor) على عمود زمني تنازلي مع نمط `Take(limit + 1)` لاستخلاص المؤشّر التالي.
- البحث النصّي يهرّب محارف `LIKE` الخاصّة (`[`، `%`، `_`) قبل تكوين النمط.
- الأخطاء تُرمى عبر `SarhException` (‏`Forbidden` / `NotFound` / `Validation` / `Conflict` / `Unauthorized` / `Upstream`)، وتصادم القيود الفريدة في SQL Server يُلتقط برقمي الخطأ `2627` و`2601`.
- الإشعارات تُرسَل عبر `NotificationsService`.

---

## وحدة المواطنين — Citizens

مسؤولية هذه الوحدة إدارة السجل المدني للمواطن: الإنشاء، والاستعراض المُرقَّم مع تحجيم النطاق الجغرافي، والاطّلاع، والتعديل الجزئي (patch). أبرز منطقها هو ربط تعديل بيانات الهوية المدنية الأساسية (الاسم الرباعي وتاريخ الميلاد) بإعادة احتساب بصمة `data_hash` لكلّ بطاقة هوية رقمية حيّة يملكها المواطن، حفاظاً على تزامن السجل الخادمي مع ما هو مطبوع/مكتوب على الشريحة.

### CitizensService

`apps/api-dotnet/Citizens/CitizensService.cs`

الغرض: كامل منطق العمل الخاص بالمواطنين. تُحقَن التبعيتان `SarhDbContext db` و`NotificationsService notifications`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `CreateAsync` | `Task<CitizenView> CreateAsync(CreateCitizenDto dto, CurrentUser actor, CancellationToken ct)` | إنشاء مواطن جديد. حصريّ للموظف (`actor.OfficerId` غير `null` وإلا `Forbidden`). يبني كيان `Citizen` جديداً، يحوّل `BirthDate` إلى `DateTime` عند منتصف الليل، ويُصغّر البريد (`ToLowerInvariant`). يضبط `Nationality = "Libyan"` صراحةً لأن العمود `NOT NULL DEFAULT N'Libyan'` وEF يرسل الخاصية في جملة `INSERT`. عند تصادم قيد فريد يُرمى `Conflict`. يُرسِل إشعار تأكيد تسجيل (‏`alsoSms: true`). |
| `ListAsync` | `Task<CursorPage<CitizenView>> ListAsync(ListCitizensQuery q, CurrentUser actor, CancellationToken ct)` | استعراض مُرقَّم للمواطنين النشطين (`IsActive`). حصريّ للموظف. يحجّم النطاق للمناطق: من ليس `super_admin` أو `auditor` يُقصر على `actor.RegionId` (ومحاولة طلب منطقة أخرى تُرمى `Forbidden`)؛ أما هما فيمكنهما التصفية بأيّ `RegionId`. يدعم مؤشّراً على `CreatedAt`، وبحثاً نصّياً (‏≥ حرفين) عبر `LIKE` على الاسم الرباعي والبريد والهاتف و`LegacyNationalNo`. |
| `GetByIdAsync` | `Task<CitizenView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)` | جلب مواطن بالمعرّف. المواطن لا يرى إلا نفسه (`actor.Role == "citizen" && actor.CitizenId != id` ⇐ `Forbidden`). يرمي `NotFound` عند الغياب. |
| `UpdateAsync` | `Task<CitizenView> UpdateAsync(Guid id, UpdateCitizenDto dto, CurrentUser actor, CancellationToken ct)` | تعديل جزئي حصريّ للموظف. دلالة `null = دون تغيير`. يرصد تغيّر حقول الهوية الأساسية (`FirstNameAr`, `FatherNameAr`, `GrandfatherNameAr`, `FamilyNameAr`, `BirthDate`, و`LegacyNationalNo`) في راية `identityChanged`؛ فإن تغيّرت أيّ منها استدعى `RefreshCardIdentityHashesAsync`. عند التصادم الفريد يُرمى `Conflict`. إذا تغيّرت الهوية أُرسِل إشعار (‏`alsoSms: true`) بأنّ إعادة الإصدار قد تلزم. |

منطق مهم — تزامن بصمة البطاقة عند تغيّر الهوية:

الدالة الخاصّة `RefreshCardIdentityHashesAsync(Citizen c, CurrentUser actor, CancellationToken ct)` تجلب كلّ البطاقات التي حالتها ليست `revoked` ولا `expired`، وتعيد لكلٍّ منها احتساب `DataHash` عبر `IdentityHash.Compute(c, card.DigitalIdNumber)`، ثمّ تُضيف سجلّاً في `IdIssuanceHistory` من نوع `Action = "identity-updated"` يوثّق أنّ تحديث الهوية أعاد احتساب البصمة. البطاقات الملغاة/المنتهية تُترك على بصمتها التاريخية.

الدالة المساعدة الخاصّة `IsUnique(DbUpdateException ex)` تُرجِع `true` إذا كان `InnerException` من نوع `SqlException` برقم `2627` أو `2601`.

المتحكّم المستهلك: `apps/api-dotnet/Controllers/CitizensController.cs` (المسار الأساسي `api/v1/citizens`).

| الطريقة والمسار | الدور المسموح | يستدعي |
|---|---|---|
| `POST /api/v1/citizens` | `id_issuer`, `registry_officer`, `super_admin` | `CreateAsync` |
| `GET /api/v1/citizens` | الأدوار الموظّفية + `department_manager` | `ListAsync` |
| `GET /api/v1/citizens/{id}` | أيّ مستخدم موثَّق (المواطن نفسه فقط) | `GetByIdAsync` |
| `PATCH /api/v1/citizens/{id}` | `id_issuer`, `registry_officer`, `super_admin` | `UpdateAsync` |

### كائنات نقل البيانات والعرض — Citizens

`apps/api-dotnet/Citizens/CitizenDtos.cs`

`CreateCitizenDto`: حمولة الإنشاء. يفرض التحقّق: الاسم الأول العربي `MinLength(2)`، والأسماء العربية الرباعية مطلوبة، والجنس `^(male|female)$`، وتاريخ الميلاد مطلوب، والحالة الاجتماعية (اختيارية) ضمن `^(single|married|divorced|widowed)$`، والهاتف `^\+?[0-9]{8,15}$`، والبريد صيغة `EmailAddress`، و`RegionId` مطلوب.

`UpdateCitizenDto`: حمولة التعديل — كلّ الحقول nullable، حيث `null` تعني «اتركه دون تغيير» لتعذّر التمييز بين «null صريحة» و«غائبة» في `System.Text.Json`. توثّق تعليقات الشيفرة أنّ تعديل حقول الهوية الأساسية يعيد اشتقاق `data_hash` للبطاقة.

`ListCitizensQuery`: `Cursor`، و`Limit` مقيّد `Range(1, 100)` بقيمة افتراضية 20، و`Q` (مُربَط من `q`)، و`RegionId` (مُربَط من `region_id`).

`CitizenView`: كائن العرض المُعاد. يحمل الدالة الساكنة `From(Citizen c)` التي تُسقِط الكيان إلى العرض. يتضمّن `Nationality` و`IsActive` وطابعي `CreatedAt`/`UpdatedAt`.

```csharp
public sealed class CreateCitizenDto
{
    [Required, MinLength(2), MaxLength(64)] public string FirstNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string FatherNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string GrandfatherNameAr { get; set; } = "";
    [Required, MaxLength(64)] public string FamilyNameAr { get; set; } = "";
    [Required, RegularExpression("^(male|female)$")] public string Gender { get; set; } = "";
    [Required] public DateOnly BirthDate { get; set; }
    [Required] public int RegionId { get; set; }
    // ... حقول اختيارية: أسماء إنجليزية، MotherNameAr، LegacyNationalNo،
    //     FamilyBookNo، BirthPlace، MaritalStatus، Phone، Email،
    //     MunicipalityId، AddressAr، PhotoPath، SignaturePath
}
```

---

## وحدة العقارات — Properties

مسؤولية هذه الوحدة تسجيل قطع الأراضي والعقارات والتحقّق الهندسي منها. المبدأ الحاكم (قاعدة CLAUDE.md رقم 8): **المساحة تُشتقّ من المضلّع المرسوم، لا من الطول × العرض**؛ يُعيد الخادم احتساب المساحة سلطويّاً عبر `geography.STArea()` ويتحقّق ضمن ‏±5٪. تتعامل الوحدة كذلك مع منع تكرار المركز (centroid) بين العقارات المعتمدة (حجب صارم)، وتنبيه المُراجِع إلى تداخل المضلّعات (تحذير ناعم، لا حجب — قاعدة رقم 3)، وفرض الأدلّة الإلزامية (صورة موقع + كروكي) عند الإرسال.

### GeoJsonPolygon

`apps/api-dotnet/Properties/GeoJsonPolygon.cs`

الغرض: تحقّق خفيف من مضلّع GeoJSON وتحويله إلى صيغة WKT الخاصّة بـ SQL Server. فئة ساكنة تعالج فقط الشكل الذي تُصدره صَرح: `{ "type":"Polygon", "coordinates":[ [ [lng,lat], … ] ] }`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `ValidateAndConvert` | `static (string Wkt, string GeoJson) ValidateAndConvert(JsonElement input)` | يتحقّق ثمّ يُحوِّل. يُرجِع زوجاً من نصّ WKT والنصّ الخام لـ GeoJSON. |

منطق التحقّق بالتفصيل الفعلي:

- يجب أن يكون الإدخال كائناً، ونوعه `"Polygon"`، وأن تكون `coordinates` مصفوفة بحلقة واحدة على الأقل.
- الحلقة الخارجية يجب أن تحوي `MIN_RING_POINTS = 4` نقاط على الأقل، وكلّ نقطة `[lng, lat]`.
- تُرفَض الإحداثيات `NaN`/`Infinity`، وكذلك ما يخرج عن صندوق ليبيا التقريبي: خط الطول `[9.0, 26.0]`، خط العرض `[19.0, 34.0]`.
- يجب أن تكون الحلقة مُغلَقة (النقطة الأولى تساوي الأخيرة ضمن هامش `1e-9`).
- تُحسَب المساحة الموقّعة (signed area)؛ فإن كانت سالبة عُكِس ترتيب النقاط لضمان اتجاه عكس عقارب الساعة (CCW) الذي يتوقّعه `STGeomFromText` للحلقة الخارجية في SQL Server geography.
- يُبنى نصّ `POLYGON((lng lat, …))` باستخدام `InvariantCulture`.

### PropertiesService

`apps/api-dotnet/Properties/PropertiesService.cs`

الغرض: منطق تسجيل العقار واستعراضه والتحقّق الهندسي والمكاني. التبعيتان `SarhDbContext db` و`NotificationsService notifications`. الثابت `AREA_TOLERANCE_PCT = 5m`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `SubmitAsync` | `Task<SubmitResult> SubmitAsync(CreatePropertyDto dto, CurrentUser actor, CancellationToken ct)` | مسار الإرسال الكامل (انظر الشرح أدناه). |
| `ListAsync` | `Task<CursorPage<PropertyView>> ListAsync(ListPropertiesQuery q, CurrentUser actor, CancellationToken ct)` | استعراض مُرقَّم مع تحجيم نطاق حسب الدور: المواطن يرى ما يملك فقط؛ `super_admin`/`auditor` بأيّ منطقة؛ باقي الأدوار الموظّفية تُقصر على `actor.RegionId` (ومحاولة الخروج عنها `Forbidden`). يدعم تصفية `Status`، وبحثاً على `PropertyCode`/`ParcelNumber`/`AddressAr`/`PlanNumber`، ومؤشّراً على `CreatedAt`. |
| `GetByIdAsync` | `Task<PropertyView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)` | جلب عقار مع إثراء تفصيلي: المواطن لا يرى إلا ملكه، والموظف الإقليمي لا يرى خارج منطقته. يملأ `BoundaryPolygon` (قراءة مكانية منفصلة)، و`HasActiveDispute` (نزاع نشط)، و`LocationConflicts` + `HasLocationConflict` + `ConflictKind`. |
| `UpdateBoundaryAsync` | `Task<PropertyView> UpdateBoundaryAsync(Guid id, UpdateBoundaryDto dto, CurrentUser actor, CancellationToken ct)` | إعادة رسم حدود القطعة. المساحة والمركز يُعاد احتسابهما سلطويّاً من المضلّع الجديد. يفرض الصلاحية عبر `AuthorizeBoundaryEdit`، ويمنع نقل عقار معتمد فوق مركز عقار معتمد آخر، ثمّ ينفّذ التحديث ويعيد الإثراء ويُشعِر المالك إن كان المُعدِّل موظفاً. |
| `OverlapCheckAsync` | `Task<IReadOnlyList<PropertyOverlap>> OverlapCheckAsync(OverlapCheckDto dto, CancellationToken ct)` | فحص تداخل مضلّع وارد مع العقارات المعتمدة (`status = N'approved'`) عبر `STIntersects`، وحساب نسبة التداخل `overlap_pct` نسبةً إلى مساحة المضلّع الوارد. |
| `NearbyAsync` | `Task<IReadOnlyList<PropertyNearby>> NearbyAsync(NearbyQuery q, CancellationToken ct)` | إرجاع العقارات ضمن نصف قطر (متر) حول نقطة، مرتّبةً تصاعديّاً بالمسافة عبر `STDistance` على `location_point`. |
| `ListDocumentsAsync` | `Task<IReadOnlyList<PropertyDocumentView>> ListDocumentsAsync(Guid propertyId, CurrentUser actor, CancellationToken ct)` | سرد مستندات العقار بعد فرض قواعد الوصول ذاتها لـ `GetByIdAsync` (يعيد استخدامها). |
| `ResolveDocumentFileAsync` | `Task<(string Bucket, string Path, string? MimeType)> ResolveDocumentFileAsync(Guid propertyId, Guid documentId, CurrentUser actor, CancellationToken ct)` | تحديد موقع ملف مستند واحد للبثّ، بعد فرض قواعد الوصول، وتفكيك `StoragePath` بصيغة `"<bucket>/<path>"`. |

منطق مهم — مسار `SubmitAsync` خطوةً بخطوة:

1. `ResolveOwnerAsync`: إذا كان الفاعل مواطناً فالمالك هو نفسه؛ وأيّ `OwnerCitizenId` مختلف يُرمى `Forbidden` (منع الوكالة/proxy). إذا كان موظفاً فـ`OwnerCitizenId` مطلوب ويجب أن يشير إلى مواطن نشط موجود.
2. `EnforceOfficerRegionScope`: نطاق المنطقة يُطبَّق على الموظف فقط (المواطن يسجّل في أيّ منطقة). `super_admin`/`auditor` مُستثنَيان؛ وغيرهما يجب أن تطابق `actor.RegionId` قيمة `dto.RegionId`.
3. التحقّق من وجود `region_id` في جدول `Regions` مسبقاً لإرجاع `422` نظيف بدلاً من خطأ FK خام.
4. `ValidateDocuments`: يجب توفّر مستند `site_photo` واحد و`koreky_certificate` واحد على الأقل، وإلا `Validation`.
5. `GeoJsonPolygon.ValidateAndConvert` للحصول على WKT.
6. `ComputeValidationAsync`: يحسب `computed_area` عبر `STArea`، والفرق النسبي `@diff`، ويتحقّق من تطابق المركز (`EnvelopeCenter().STEquals`) مع عقار معتمد. **إن تجاوز الفرق ‏5٪ يُرمى `Validation`** برسالة توضّح المساحتين. **وإن وُجد تطابق مركز مع عقار معتمد يُرمى `Conflict`** (الحجب الصارم الوحيد).
7. `LocationConflictsForWktAsync`: تداخل ناعم (تحذير) لا يمنع الإنشاء.
8. `CallInsertPropertyAsync`: استدعاء الإجراء المخزَّن `dbo.insert_property_with_polygon` (مع `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON` اللازمين للمثلّثات المكانية) الذي يُرجِع معرّف العقار.
9. `InsertDocumentsAsync`: إدراج المستندات (مع ضبط `UploadedAt` صراحةً تفادياً لكتابة `default(DateTimeOffset)`).
10. إن وُجدت `DocumentedAreaSqm` تُحدَّث بجملة منفصلة (خارج توقيع الإجراء المخزَّن) لغرض تقاطع المُراجِع.
11. `NextRequestNoAsync` (‏`dbo.next_registration_request_no`) ثمّ إدراج صفّ في `registration_requests` بحالة `pending`؛ حيث `submitted_by_citizen_id` هو **المالك** لا الفاعل.
12. إشعار المُراجِعين في المنطقة (مع تنبيه خاص عند وجود تضارب موقع) وإشعار المالك باستلام الطلب.

منطق مهم — تصنيف التضارب المكاني:

- `LocationConflictsForWktAsync(wkt, excludeId, ct)`: يعكس `dbo.find_property_location_conflicts` — يُرجِع العقارات الحيّة (بالحالات `pending`, `under_review`, `needs_clarification`, `approved`, `minted`, `transferred`, `frozen`) التي يتقاطع مضلّعها بمساحة **حقيقية > 1 م²** (تجاور خطّ الحدود بمساحة صفر لا يُبلَّغ عنه)، ونسبة التداخل نسبةً إلى المضلّع المُرسَل.
- `ClassifyConflict(conflicts)` (‏`internal static`): يعيد `"ownership_conflict"` إذا تداخل مع عقار مُصدَر (‏`approved`/`minted`/`transferred` عبر المجموعة `IssuedStatuses`)، وإلا `"location_conflict"`، وإلا `"none"`.

منطق مهم — صلاحية إعادة رسم الحدود (`AuthorizeBoundaryEdit`، `private static`):

| الدور | الصلاحية |
|---|---|
| `super_admin` | أيّ قطعة |
| `registry_officer` / `reviewer` / `department_manager` | منطقته فقط |
| `citizen` (المالك) | ما دامت القطعة في المسار فقط؛ الحالات `approved`/`minted`/`transferred` تُمنع |
| غير ذلك (‏`auditor` / `id_issuer` …) | ممنوع دائماً |

دوال خاصّة داعمة: `GetBoundaryPolygonGeoJsonAsync` (قراءة `STAsText()` وتحويلها إلى GeoJSON دون تبديل محاور)، `ApprovedCentroidClashAsync`، `ExecUpdateBoundaryAsync` (يحدّث `boundary_polygon`, `location_point`, `area_sqm` من STArea), `ComputeValidationAsync`, `CallInsertPropertyAsync`, `NextRequestNoAsync`, `ValidateDocuments`, `InsertDocumentsAsync`, `LocationConflictsForPropertyAsync`, والسجلّ الداخلي `ValidationRow`.

المتحكّم المستهلك: `apps/api-dotnet/Controllers/PropertiesController.cs` (المسار الأساسي `api/v1/properties`) يُوجِّه إلى هذه الخدمة عبر: `POST /` (‏`Submit`، بحدّ معدّل للكتابة)، `GET /`، `GET /nearby`، `POST /overlap-check`، `GET /{id}`، `GET /{id}/documents`، `GET /{id}/documents/{docId}/file`، `PATCH /{id}/boundary`. (مسارات المراجعة والاعتماد النهائي تستدعي خدمات `ReviewService`/`LicenseService` خارج نطاق هذا الفصل.)

### كائنات نقل البيانات والعرض — Properties

`apps/api-dotnet/Properties/PropertyDtos.cs`

`CreatePropertyDto`: حمولة الإرسال. `PropertyType` ضمن `^(residential|agricultural|commercial|governmental|industrial|mixed)$`، و`BoundaryPolygon` من نوع `JsonElement`، و`AreaSqm` مطلوب `Range(0.01, …)` (لكنه للتقاطع فقط — المرجع هو المضلّع)، و`LengthM`/`WidthM`/`DepthM` بيانات وصفية اختيارية، و`DocumentedAreaSqm` اختياري لتقاطع المُراجِع، و`Documents` قائمة أدلّة، و`OwnerCitizenId` اختياري (للموظف عند التسجيل نيابةً).

`PropertyDocumentDto`: `DocumentType` ضمن `^(koreky_certificate|survey_certificate|sale_contract|inheritance_deed|court_order|site_photo|boundary_map|other)$`، و`StoragePath` بصيغة `"<bucket>/<path>"`، مع `MimeType`, `FileSizeBytes`, `FileHash`, `TitleAr`.

`UpdateBoundaryDto`: يحمل `BoundaryPolygon` فقط (المساحة تُعاد حسابياً دائماً؛ التعليق يوضّح أنّ العميل لا يُملي المساحة).

`PropertyView`: كائن العرض الرئيسي مع الدالة الساكنة `From(Property p)`. أبرز حقوله المحسوبة: `DocumentedAreaDiffPct = |documented − measured| / measured × 100` مقرّبة لخانتين (‏`null` عند غياب أحدهما)؛ وحقول الإثراء التفصيلي التي تُملأ في القراءة المفردة فقط: `BoundaryPolygon`, `HasActiveDispute`, `HasLocationConflict`, `ConflictKind`, `LocationConflicts`.

كائنات أخرى في الملف: `ListPropertiesQuery`, `OverlapCheckDto`, `NearbyQuery`, `SubmitResult`, `RegistrationRequestView`, `ValidationResult` (يحمل `ComputedAreaSqm`, `AreaDiffPct`, `LocationConflicts`), `NearbyResult`, `OverlapResult`, `PropertyOverlap` (يحمل `OverlapPct` و`OtherStatus`), `PropertyNearby`, `PropertyDocumentView`. كما تُعرّف هنا كائنات المراجعة `ReviewDecisionDto` (‏`Decision` ضمن `^(approve|reject|needs_clarification)$`)، و`ReviewResult`, `ReviewDeed`, `ReviewVc` — وتستهلكها خدمة المراجعة خارج نطاق هذا الفصل.

```csharp
public sealed class ValidationResult
{
    public decimal ComputedAreaSqm { get; init; }
    public decimal? AreaDiffPct { get; init; }
    public IReadOnlyList<PropertyOverlap> LocationConflicts { get; init; } = Array.Empty<PropertyOverlap>();
}
```

---

## وحدة بطاقات الهوية الرقمية — DigitalIdCards

مسؤولية هذه الوحدة إصدار بطاقات الهوية الرقمية وإدارة دورة حياتها (إصدار، تجميد، إلغاء، إعادة إصدار، تعديل، إعادة تعيين PIN، حذف). تتكامل مع وحدة `Nfc` لسكّ مفاتيح الشريحة، ومع خدمة SSI لإصدار بيان (VC) وربط DID المحفظة، ومع `IdentityHash` لبصمة الهوية المقاومة للعبث. فئة الخدمة `DigitalIdCardsService` مُجزَّأة (`partial`) عبر أربعة ملفات.

### DigitalIdNumberService

`apps/api-dotnet/DigitalIdCards/DigitalIdNumberService.cs`

الغرض: توليد رقم الهوية الرقمية بصيغة `LY-RR-YYYY-SSSSSS-C` مع رقم تحقّق Luhn حقيقي. تُحقَن التبعية `SarhDbContext db`. ملاحظة مهمّة موثّقة في الشيفرة: دالة SQL ‏`dbo.generate_digital_id()` تُصدر حالياً رقم تحقّق منحلّاً (`(LEN(base) * 7) % 10`)، لذا تستدعيها هذه الخدمة لتخصيص التسلسل والتنسيق ثمّ **تستبدل رقم التحقّق بخانة Luhn حقيقية** قبل الإرجاع.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `NextAsync` | `Task<string> NextAsync(string regionCode, int year, CancellationToken ct)` | يتحقّق من `regionCode` (`^[0-9]{2,4}$`) و`year` ضمن `[2024, 2100]`، يستدعي `dbo.generate_digital_id`، يفكّ الرقم عبر `Parse`، ويعيد تنسيقه بعد استبدال خانة التحقّق بـ `ComputeLuhn`. |
| `Parse` | `static Parts? Parse(string id)` | يطابق النمط `^LY-([0-9]{2,4})-([0-9]{4})-([0-9]{6})-([0-9])$` ويعيد `Parts` أو `null`. |
| `Format` | `static string Format(Parts p)` | يبني السلسلة `LY-{Region}-{Year}-{Serial:D6}-{Check}`. |
| `ComputeLuhn` | `static int ComputeLuhn(Parts p)` | يحسب خانة Luhn على الحمولة `Region + Year + Serial(6)`. |
| `IsValid` | `static bool IsValid(string id)` | يتحقّق من صحّة رقم كامل بمطابقة `ComputeLuhn` مع خانة التحقّق المخزّنة. |

السجلّ العام: `public sealed record Parts(string Region, int Year, int Serial, int Check)`. الدالة الخاصّة `LuhnOf(string digits)` تطبّق خوارزمية Luhn القياسية.

### IdentityHash

`apps/api-dotnet/DigitalIdCards/IdentityHash.cs`

الغرض: بصمة SHA-256 مقاومة للعبث لبيانات الهوية المدنية المرتبطة بالبطاقة (`digital_id_cards.data_hash`)، تُعاد حسابياً كلّما تغيّر أيّ حقل هوية لمطابقتها مع ما كُتب على الشريحة/طُبع.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `Compute` | `static string Compute(Citizen c, string digitalIdNumber)` | يبني إسقاطاً قانونياً مفصولاً بـ `|` بالترتيب: `digitalIdNumber`, `c.Id("N")`, الاسم الرباعي العربي, `BirthDate("yyyy-MM-dd")`, `Gender`, `LegacyNationalNo ?? ""`؛ ثمّ يُرجِع SHA-256 بصيغة hex صغيرة. الترتيب جزء من العقد ولا يُعاد ترتيبه. |

### DigitalIdCardsService

مُعرَّفة عبر: `apps/api-dotnet/DigitalIdCards/DigitalIdCardsService.cs` (الرئيسي)، و`DigitalIdCardsService.Delete.cs`، و`DigitalIdCardsService.Pin.cs`، و`DigitalIdCardsService.Update.cs`.

التبعيات المحقونة: `SarhDbContext db`, `DigitalIdNumberService numbers`, `NfcKeyStoreService keyStore`, `NotificationsService notifications`, `Sarh.Api.Ssi.ISsiService ssi`, `IConfiguration config`, `ILogger log`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `ListAsync` | `Task<CursorPage<CardView>> ListAsync(ListCardsQuery q, CurrentUser actor, CancellationToken ct)` | استعراض مُرقَّم: المواطن يرى بطاقته فقط؛ الموظف يرى ما يستعلم عنه (‏`q.CitizenId`). تصفية بالحالة والبحث على `DigitalIdNumber`، ومؤشّر على `IssuedAt`. يُثري كلّ صفحة بملخّص المواطن `CardCitizenSummary` في جولة واحدة. |
| `IssueAsync` | `Task<IssueCardResult> IssueAsync(IssueCardDto dto, CurrentUser actor, CancellationToken ct)` | إصدار بطاقة جديدة (انظر آلة الحالة أدناه). |
| `FreezeAsync` | `Task<CardView> FreezeAsync(Guid cardId, FreezeCardDto dto, CurrentUser actor, CancellationToken ct)` | تجميد؛ غلاف حول `TransitionAsync(…, "frozen", …)`. |
| `RevokeAsync` | `Task<CardView> RevokeAsync(Guid cardId, RevokeCardDto dto, CurrentUser actor, CancellationToken ct)` | إلغاء؛ غلاف حول `TransitionAsync(…, "revoked", …)`. |
| `ReissueAsync` | `Task<IssueCardResult> ReissueAsync(Guid cardId, ReissueCardDto dto, CurrentUser actor, CancellationToken ct)` | إعادة إصدار: يُلغي البطاقة القديمة (دون إشعار الإلغاء) ثمّ يسكّ بطاقة جديدة. |
| `ResetPinAsync` | `Task<ResetPinResult> ResetPinAsync(Guid cardId, CurrentUser actor, CancellationToken ct)` | إعادة تعيين PIN (‏`Pin.cs`). |
| `UpdateAsync` | `Task<CardView> UpdateAsync(Guid cardId, UpdateCardDto dto, CurrentUser actor, CancellationToken ct)` | تعديل نافذة الصلاحية و/أو تصحيح الهوية (‏`Update.cs`). |
| `DeleteAsync` | `Task<DeleteCardResult> DeleteAsync(Guid cardId, DeleteCardDto dto, CurrentUser actor, CancellationToken ct)` | حذف صلب للمسؤول العام فقط (‏`Delete.cs`). |

منطق مهم — آلة حالة الإصدار (`IssueAsync`):

- حصريّ للموظف. يجب أن يكون المواطن موجوداً ونشطاً، وألّا تكون له بطاقة `active` (وإلا `Conflict` يوجّه لاستخدام `/reissue`).
- يُثبِّت مسار الصورة على المواطن إن وُرِّد، ثمّ يحلّ `photoHash` عبر `ResolvePhotoHash` (يقبل `PhotoSha256` بصيغة 64 hex، وإلا يشتقّ بصمة من مسار التخزين مؤقتاً حتى المرحلة 5).
- يُخصّص `digitalIdNumber` عبر `numbers.NextAsync`، ويحسب `expiresAt = now + (ValidityYears ?? 5)`، ويولّد `cardSerial = "LY-" + 12 بايت hex`، ويحسب `DataHash` عبر `IdentityHash.Compute`، ويضبط الحالة `active` و`LastNfcCounter = 0`.
- يمنح البطاقة **رمز PIN ابتدائيّاً** عبر `AssignNewPin` (وإلا يفشل الدخول المبني على PIN دائماً لبطاقة حديثة). يُخزَّن hash فقط ويُعاد النصّ مرّة واحدة.
- يحفظ البطاقة (مع التقاط تصادم `card_serial`/`digital_id_number`)، ثمّ يسكّ مفاتيح NFC عبر `keyStore.MintForCardAsync`، ويُضيف سجلّ `IdIssuanceHistory` من نوع `issued`.
- يصدر بيان الهوية (VC) عبر `IssueDigitalIdVcAsync` (أفضل-جهد: انقطاع SSI يُنزِل إلى DID بديل ولا يُفشل الإصدار)، ويُشعِر المواطن (‏`alsoSms: true`).
- يُرجِع `IssueCardResult` حاوياً `CardView`، ومفاتيح NFC بصيغة hex (‏`MetaReadKeyHex`, `SdmFileReadKeyHex`, `KmsKeyId`)، وقالب رابط SUN، والـ PIN.

منطق مهم — الانتقالات (`TransitionAsync`، خاصّة):

حصريّ للموظف. تُمنَع أيّ عملية على بطاقة `revoked` (‏`Conflict`)، ويُمنَع تجميد بطاقة `frozen` أصلاً. عند `revoked` تُختم `RevokedAt` و`RevokedReason`. يُضاف سجلّ في `IdIssuanceHistory`، ثمّ يُشعَر المواطن بتغيّر الحالة (الإلغاء يُرفَق بـ SMS). معامل `notify` يسمح لإعادة الإصدار بكتم رسالة «الإلغاء» المخيفة.

منطق مهم — إعادة الإصدار (`ReissueAsync`): تُلغي القديمة بـ `TransitionAsync(…, notify: false)`، وتشتقّ المنطقة من الرقم القديم عبر `ParseRegionFromDigitalId`. **افتراضيّاً تسكّ رقماً جديداً** لأن `digital_id_number` فريد `NOT NULL` والصفّ القديم يبقى للتدقيق؛ ولا تُبقي الرقم القديم إلا إذا كان `KeepDigitalIdNumber == true`. تمنح البطاقة الجديدة PIN جديداً وتُشعِر بـ SMS.

منطق مهم — ربط DID المحفظة (`IssueDigitalIdVcAsync`، خاصّة): يستدعي `ssi.IssueDigitalIdVcAsync`؛ ولأن DID المحفظة ثابت للمواطن بينما عمود `did` فريد (‏`ux_did_cards_did`)، يُفرِغ الـ DID من أيّ بطاقة سابقة للمواطن قبل الحفظ حتى لا تصطدم إعادة الإصدار. عند الفشل يُرفَق DID بديل عبر `AttachPlaceholderVc` (‏`did:placeholder:LY:{guid}`).

منطق مهم — التعديل (`UpdateAsync` في `Update.cs`): حصريّ للموظف، ولا يُسمح إلا والبطاقة `active` (وإلا `Conflict`). نوعان من التغيير: (1) نافذة الصلاحية — `ExpiresAt` المطلقة تسبق `ValidityYears` (‏= `IssuedAt + N`)، ويجب أن تكون في المستقبل وبعد الإصدار؛ يُسجَّل التغيير كـ `updated`. (2) تصحيح الهوية عبر `ApplyIdentityEditsAsync` الذي يطبّق الأسماء/تاريخ الميلاد على المواطن (قيمة فارغة = دون تغيير حمايةً من مسح اسم)، يُزامِن `FullNameAr`، ويعيد احتساب `DataHash` لكلّ بطاقة حيّة مع سجلّ `identity-updated`. يجب أن يُحدِث أحد النوعين تغييراً فعليّاً (وإلا `Validation` أو لا-عمل).

منطق مهم — إعادة تعيين PIN (`Pin.cs`): `ResetPinAsync` حصريّ للموظف، يُمنَع لبطاقة `revoked`/`expired`، يمنح PIN جديداً عبر `AssignNewPin`، ويُشعِر بـ SMS **دون** تضمين الرمز. الدالة `AssignNewPin(DigitalIdCard card)` (‏`internal static`) هي المصدر الوحيد لمنح PIN (إصدار/إعادة إصدار/إعادة تعيين): تولّد رمزاً رقميّاً من 6 خانات عبر `GenerateNumericPin`، وتخزّن bcrypt (‏cost 10) في `PinHash` مع `PinSetAt`، وتعيد النصّ مرّة واحدة.

منطق مهم — الحذف الصلب (`Delete.cs`): `DeleteAsync` للمسؤول العام فقط (‏`super_admin`)، يزيل فيزيائيّاً ضمن معاملة واحدة: أولاً سجلّات `id_issuance_history` (FK غير متتالٍ)، ثمّ `nfc_card_secrets` (‏`ON DELETE CASCADE` لكن يُحذف صراحةً لعدّ الصفوف)، ثمّ صفّ البطاقة. يُشعِر المواطن إن كانت البطاقة حيّة (`active`/`frozen`)، ويسجّل الحذف في `audit_log` عبر مرشّح المتحكّم.

الدوال المساعدة الخاصّة: `ResolvePhotoHash`, `AttachPlaceholderVc`, `SunUrlTemplate` (يقرأ `Sarh:NfcSunBaseUrl` أو المتغيّر البيئي أو الافتراضي `https://verify.sarh.ly/v`)، `RandomHexUpper`, `ParseRegionFromDigitalId`, `IsUnique`, والثابتان `UNIQUE_VIOLATION`/`UNIQUE_VIOLATION_INDEX`.

المتحكّم المستهلك: `apps/api-dotnet/Controllers/DigitalIdCardsController.cs` (المسار `api/v1/digital-id-cards`):

| الطريقة والمسار | الدور المسموح | يستدعي |
|---|---|---|
| `GET /` | أيّ مستخدم موثَّق | `ListAsync` |
| `POST /issue` | `id_issuer`, `super_admin` | `IssueAsync` |
| `POST /{id}/freeze` | `id_issuer`, `super_admin`, `registry_officer` | `FreezeAsync` |
| `POST /{id}/revoke` | `id_issuer`, `super_admin` | `RevokeAsync` |
| `POST /{id}/reissue` | `id_issuer`, `super_admin` | `ReissueAsync` |
| `POST /{id}/reset-pin` | `id_issuer`, `super_admin` | `ResetPinAsync` |
| `PATCH /{id}` | `id_issuer`, `super_admin` | `UpdateAsync` |
| `DELETE /{id}` | `super_admin` | `DeleteAsync` |

### كائنات نقل البيانات والعرض — DigitalIdCards

`apps/api-dotnet/DigitalIdCards/DigitalIdDtos.cs` (بالإضافة إلى `DeleteCardDto`/`DeleteCardResult` في `…Delete.cs` و`ResetPinResult` في `…Pin.cs`).

`IssueCardDto`: `CitizenId` و`RegionCode` مطلوبان، مع `Year` و`ValidityYears` و`PhotoBucket`/`PhotoPath`/`PhotoSha256` اختيارية. `FreezeCardDto`/`RevokeCardDto`: `Reason` مطلوب. `ReissueCardDto`: `Reason` + `KeepDigitalIdNumber?`.

`UpdateCardDto`: يحمل `ExpiresAt?`, `ValidityYears?`, `Reason?` وحقول تصحيح الهوية الاختيارية، مع الخاصّية المحسوبة `HasIdentityEdits` (صحيحة إن ورد أيّ اسم أو تاريخ ميلاد).

`CardView`: كائن العرض مع `From(DigitalIdCard c, CardCitizenSummary? citizen)`؛ يتضمّن `LastNfcCounter`, `LastNfcTapAt`, `DataHash`, `PhotoHash`, `Did`, وملخّص المواطن.

`IssueCardResult`: يحمل `Card`, و`NfcKeys` (‏`IssueCardNfcKeys`: مفاتيح hex + `KmsKeyId`)، و`SunUrlTemplate`, و`Pin` (يُعرَض مرّة واحدة للموظف المُصدِر).

```csharp
public sealed class UpdateCardDto
{
    public DateTimeOffset? ExpiresAt { get; set; }
    [Range(1, 20)] public int? ValidityYears { get; set; }
    [MaxLength(500)] public string? Reason { get; set; }
    [MaxLength(100)] public string? FirstNameAr { get; set; }
    // ... FatherNameAr, GrandfatherNameAr, FamilyNameAr, BirthDate
    public bool HasIdentityEdits =>
        FirstNameAr is not null || FatherNameAr is not null ||
        GrandfatherNameAr is not null || FamilyNameAr is not null ||
        BirthDate is not null;
}
```

---

## وحدة الاتصال قريب المدى — Nfc

مسؤولية هذه الوحدة كامل تشفير بطاقات NTAG 424 DNA وفق آلية SUN (Secure Unique NFC): سكّ مفاتيح لكلّ بطاقة وتغليفها عند السكون، وترميز/فكّ رسالة SUN والتحقّق منها بمقاومة إعادة التشغيل (rolling counter) وفق قاعدة CLAUDE.md رقم 4. التنفيذ يعكس نظيره في NestJS «بايتاً ببايت» لضمان التشغيل البيني.

### AesCmac

`apps/api-dotnet/Nfc/AesCmac.cs`

الغرض: تنفيذ AES-CMAC (‏RFC 4493) يدويّاً بمفاتيح AES-128 فقط (التي تستعملها رسائل SUN). فئة `internal static`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `Compute` | `static byte[] Compute(byte[] key, byte[] message)` | يحسب CMAC لرسالة برمز مفتاح 16 بايت (وإلا `ArgumentException`). يستعمل AES في وضع ECB بلا حشو، يولّد المفتاحين الفرعيين `K1`/`K2`، ويعالج الكتلة الأخيرة (مكتملة أو مبطّنة بـ `0x80`) بثابت `Rb = 0x87`. |

### SunMessage

`apps/api-dotnet/Nfc/SunMessage.cs`

الغرض: ترميز وفكّ والتحقّق من رسالة SUN وفق NXP AN12196 §11. فئة `static`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `Verify` | `static DecodedSun Verify(SunKeys keys, string piccDataHex, string cmacHex)` | يفكّ بيانات PICC (16 بايت) بـ `MetaReadKey` عبر AES-128-CBC بمتّجه تهيئة صفري، يتحقّق من وسم `0xC7` (‏`PiccDataTagUidAndCounter`)، يستخرج `uid` (7 بايت) و`counter` (3 بايت LE)، يشتقّ مفتاح جلسة CMAC، يحسب CMAC على مدخل فارغ ويأخذ نصفه القصير، ثمّ يقارن بـ `FixedTimeEquals`. أيّ فشل يرمي `SunDecodeException`. |
| `Encode` | `static (string PiccDataHex, string CmacHex) Encode(SunKeys keys, byte[] uid, int counter, byte[]? padding = null)` | يبني نصّ PICC العكسي: كتلة 16 بايت (وسم + UID + عدّاد + حشو 5 بايت عشوائي)، يشفّرها بـ CBC، ويشتقّ CMAC القصير. يتحقّق من طول UID (7) ونطاق العدّاد (‏≤ `0xFFFFFF`). |
| `ParseUrl` | `static ParsedUrl ParseUrl(string input)` | يستخرج معاملي الاستعلام `p`/`picc_data` و`c`/`cmac` (وتلميح `u`/`uid` اختياريّاً)؛ يرمي `SunDecodeException` عند غياب `p`/`c`. تلميح UID المشوّه يُطرح بصمت. |

منطق مهم — اشتقاق مفتاح الجلسة (`DeriveSessionCmacKey`، خاصّة): يبني `SV2 = SV2_PREFIX(6) || UID(7) || Counter(3 LE)` بطول 16 بايت (البادئة `3C C3 00 01 00 80`)، ثمّ يحسب `AesCmac.Compute(masterKey, sv2)`. والدالة `TakeShortCmac` تأخذ البايتات الفردية (‏`i*2+1`) لتكوين 8 بايت.

الكائنات المصاحبة: `SunKeys` (‏`MetaReadKey`, `SdmFileReadKey`)، `DecodedSun` (‏`Uid`, `Counter`)، `SunDecodeException` (يحمل `Reason`)، و`ParsedUrl` (‏`PiccDataHex`, `CmacHex`, `UidHex?`).

### NfcKeyStoreService

`apps/api-dotnet/Nfc/NfcKeyStoreService.cs`

الغرض: تغليف مفاتيح NFC لكلّ بطاقة عند السكون بـ AES-256-GCM باستعمال `KMS_MASTER_KEY` (32 بايت hex من الإعدادات/البيئة). الثوابت: `LocalKmsKeyId = "local:v1"`, `WrapAlg = "AES-256-GCM"`. يتحقّق المُنشئ من طول المفتاح (64 hex) وإلا يرمي `InvalidOperationException`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `MintForCardAsync` | `Task<SunKeys> MintForCardAsync(Guid cardId, CancellationToken ct)` | يولّد مفتاحي `meta`/`sdm` عشوائيَّين (16 بايت لكلٍّ)، يغلّفهما ويخزّنهما في `nfc_card_secrets`، يُثبِّت `NfcSignatureKeyId` على البطاقة، ويعيد المفاتيح **بنصّها الصريح مرّة واحدة** لتكتبها محطّة الإصدار على الشريحة. |
| `LoadForCardAsync` | `Task<SunKeys> LoadForCardAsync(Guid cardId, CancellationToken ct)` | يجلب السرّ للبطاقة (‏`NotFound` عند الغياب)، يتحقّق من `WrapAlg` و`KmsKeyId` (وإلا `Upstream`)، ويفكّ التغليف ليعيد `SunKeys`. |

الدالتان الخاصّتان `Wrap`/`Unwrap` تستعملان `AesGcm` بمتّجه تهيئة 12 بايت ووسم 16 بايت مُلحَق بالنصّ المشفّر.

### NfcService

`apps/api-dotnet/Nfc/NfcService.cs`

الغرض: منطق تسجيل ترميز الشريحة والتحقّق من النقرة (tap). التبعيتان `SarhDbContext db` و`NfcKeyStoreService keyStore`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `RecordEncodedAsync` | `Task<EncodeCardResult> RecordEncodedAsync(EncodeCardDto dto, CurrentUser actor, CancellationToken ct)` | نداء استرجاعي من محطّة الإصدار بعد كتابة الشريحة. حصريّ للموظف. يربط `NfcUid` (بالأحرف الكبيرة) بالبطاقة، ويصفّر `LastNfcCounter`. يرفض ربط شريحة مختلفة ببطاقة مربوطة سلفاً، أو ربط UID مستعمل في بطاقة أخرى (‏`Conflict`). |
| `VerifyTapAsync` | `Task<VerifySunResult> VerifyTapAsync(VerifySunDto dto, CancellationToken ct)` | التحقّق العلني من نقرة SUN (انظر أدناه). |

منطق مهم — التحقّق من النقرة (`VerifyTapAsync`):

- عام (بلا مصادقة) — مفاتيح الشريحة هي السرّ. `ExtractParts` يستخرج `piccDataHex`/`cmacHex`/`uidHex?` من `Url` أو من `P`/`C`، وأيّ فشل استخراج يرمي `Unauthorized`.
- المرشّحون: البطاقات `active` أو `frozen`. مسار سريع O(1) حين تُطابق `NfcUid` التلميح؛ وإلا يفحص المرشّحين بالقوّة الغاشمة (يغطّي الشرائح القديمة دون `SDMUIDOffset`).
- لكلّ مرشّح: يُحمِّل مفاتيحه، يتحقّق عبر `SunMessage.Verify` (فشل التشفير ⇐ المرشّح التالي)، ويطابق UID المفكوك مع المسجَّل.
- **فحوص الحالة**: `revoked`/`frozen` ⇐ `Forbidden`، ومنتهية الصلاحية ⇐ `Forbidden`.
- **مقاومة إعادة التشغيل**: يُرفَض `decoded.Counter <= LastNfcCounter` (‏`Unauthorized`). ثمّ تحديث شبه-ذرّي مشروط `WHERE last_nfc_counter < {counter}`؛ فإن لم يتأثّر صفّ (سباق) رُمي `Unauthorized`.
- عند النجاح يُرجِع `VerifySunResult` مع بيانات المواطن العلنية (الاسم الكامل، الصورة، المنطقة). كلّ الإخفاقات النهائية تُرمى `Unauthorized` بعمومية لعدم تسريب أيّ فحص فشل.

المتحكّم المستهلك: `apps/api-dotnet/Controllers/NfcController.cs` (المسار `api/v1/nfc`): `POST /encode` (موظّف `id_issuer`/`super_admin`) ⇐ `RecordEncodedAsync`، و`POST /verify` (‏`AllowAnonymous`) ⇐ `VerifyTapAsync`.

### كائنات نقل البيانات — Nfc

`apps/api-dotnet/Nfc/NfcDtos.cs`

`EncodeCardDto`: `CardId` مطلوب، و`NfcUid` بنمط `^[0-9a-fA-F]{14}$`. `EncodeCardResult`/`EncodedCardSummary`: تأكيد الربط. `VerifySunDto`: `Url?` أو `P?`/`C?`. `VerifySunResult`: `CardId`, `DigitalIdNumber`, `Status`, `Counter`, و`VerifySunCitizen` (‏`Id`, `FullNameAr`, `PhotoPath?`, `RegionId?`).

---

## وحدة الموظفين — Officers

مسؤولية هذه الوحدة إدارة حسابات الموظفين: الاستعراض، والاطّلاع، والإنشاء، والتعديل، والتفعيل/الإيقاف، وإعادة تعيين كلمة المرور. تربط كلّ موظف بحساب مصادقة (`AuthUser`) وتُبقي دور الموظف متزامناً في `raw_app_meta_data`.

### OfficersService

`apps/api-dotnet/Officers/OfficersService.cs`

الغرض: منطق حسابات الموظفين. التبعيتان `SarhDbContext db` و`NotificationsService notifications`. المجموعة `ValidRoles` تضبط الأدوار المسموحة: `super_admin`, `registry_officer`, `id_issuer`, `auditor`, `reviewer`, `department_manager`.

| الدالة | التوقيع (C#) | الوصف |
|---|---|---|
| `ListAsync` | `Task<CursorPage<OfficerView>> ListAsync(ListOfficersQuery q, CurrentUser actor, CancellationToken ct)` | استعراض مُرقَّم حصريّ للموظف. تحجيم النطاق: من ليس `super_admin`/`auditor` يُقصر على منطقته. تصفية بـ `IsActive` و`Role`، ومؤشّر على `CreatedAt`، وبحث على الاسم/رقم الموظف/البريد/الهاتف. |
| `GetByIdAsync` | `Task<OfficerView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)` | جلب موظف؛ حصريّ للموظف، ومن ليس `super_admin`/`auditor` لا يرى خارج منطقته (‏`Forbidden`). |
| `CreateAsync` | `Task<OfficerView> CreateAsync(CreateOfficerRequest req, CancellationToken ct)` | إنشاء موظف: يتحقّق من صحّة الدور، ومن عدم تكرار البريد ورقم الموظف (‏`Conflict`). ينشئ `AuthUser` بكلمة مرور bcrypt (‏cost 12) مع `raw_app_meta_data = {"sarh_role": "…"}`، ثمّ صفّ `Officer` بصلاحيات `Permissions ?? "{}"` ونشط، ويُرسِل إشعار ترحيب (دون كلمة المرور). |
| `UpdateAsync` | `Task<OfficerView> UpdateAsync(Guid id, UpdateOfficerRequest req, CancellationToken ct)` | تعديل جزئي؛ يتحقّق من الدور، ويعالج تعارض البريد/رقم الموظف، ويُزامِن البريد والدور مع `AuthUser` (‏`raw_app_meta_data`). يُشعِر الموظف فقط عند تغيّر مؤثّر في الوصول (دور/منطقة/صلاحيات). |
| `SetActiveAsync` | `Task<OfficerView> SetActiveAsync(Guid id, bool isActive, CancellationToken ct)` | تفعيل/إيقاف الحساب، مع إشعار مناسب. |
| `ResetPasswordAsync` | `Task ResetPasswordAsync(Guid id, string newPassword, CancellationToken ct)` | إعادة تعيين كلمة المرور (‏≥ 8 أحرف) على `AuthUser` بـ bcrypt (‏cost 12)، ويُشعِر الموظف (دون تضمين الكلمة الجديدة). |

المتحكّم المستهلك: `apps/api-dotnet/Controllers/OfficersController.cs` (المسار `api/v1/officers`):

| الطريقة والمسار | الدور المسموح | يستدعي |
|---|---|---|
| `GET /` | `super_admin`, `auditor`, `registry_officer`, `reviewer` | `ListAsync` |
| `GET /{id}` | `super_admin`, `auditor`, `registry_officer`, `reviewer` | `GetByIdAsync` |
| `POST /` | `super_admin` | `CreateAsync` |
| `PATCH /{id}` | `super_admin` | `UpdateAsync` |
| `POST /{id}/set-active` | `super_admin` | `SetActiveAsync` |
| `POST /{id}/reset-password` | `super_admin` | `ResetPasswordAsync` |

### كائنات نقل البيانات والعرض — Officers

`apps/api-dotnet/Officers/OfficerDtos.cs`

`ListOfficersQuery`: `Cursor`, `Limit` (‏`Range(1, 100)`، افتراضي 20), `Q` (من `q`), `Role`, `RegionId` (من `region_id`), `IsActive` (من `is_active`).

`CreateOfficerRequest`: `Email` (‏`EmailAddress`)، و`Password` (‏`MinLength(8)`)، و`FullNameAr` (‏`MinLength(2)`)، و`EmployeeNo` و`Role` مطلوبان، مع حقول اختيارية للمنطقة/البلدية/الهاتف/الصلاحيات.

`UpdateOfficerRequest`: كلّ الحقول اختيارية للتعديل الجزئي. `SetOfficerActiveRequest`: `IsActive` مطلوب. `ResetPasswordRequest`: `NewPassword` (‏`MinLength(8)`).

`OfficerView`: كائن العرض مع `From(Officer o)`؛ لا يتضمّن كلمة المرور ولا مادّة الصلاحيات الخام في هذا الإسقاط، بل: `AuthUserId`, `EmployeeNo`, `FullNameAr`/`FullNameEn`, `Role`, `RegionId`/`MunicipalityId`, `Phone`/`Email`, `IsActive`, وطابعي الوقت.
