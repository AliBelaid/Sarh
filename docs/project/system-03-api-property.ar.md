# مرجع واجهات API — العقارات والخرائط والنزاعات والتقارير

يوثّق هذا الفصل الواجهات البرمجية (REST) الخاصة بوحدات العقارات (Properties)، والخرائط العقارية (Map)، والحجوزات/النزاعات القانونية (Disputes)، والتقارير الإدارية (Reports)، إضافةً إلى نقطة رفع مستندات العقار المرتبطة بمسار التسجيل. جميع النقاط المذكورة هنا مُتحقَّق منها مباشرةً من الشيفرة المصدرية في `apps/api-dotnet/`، ولا يُذكر أي سلوك غير مُنفَّذ فعلياً في الكود.

جميع المسارات مُثبَّتة تحت البادئة `/api/v1/`. المعرّفات التقنية (المسارات، الأفعال، أسماء الحقول، قيم enum) مكتوبة باللاتينية كما وردت حرفياً في الكود.

## اصطلاحات مشتركة (Cross-Cutting Conventions)

### مظروف الأخطاء (Error Envelope)

تصدر كل الأخطاء عبر `SarhException` في `apps/api-dotnet/Common/Errors/SarhError.cs` بالشكل الموحّد التالي:

```json
{
  "error": {
    "code": "ERR_VALIDATION",
    "message_ar": "…",
    "message_en": "…",
    "details": { }
  }
}
```

| المُنشئ (factory) | HTTP | `code` |
|---|---|---|
| `SarhException.Validation(...)` | 400 | `ERR_VALIDATION` |
| `SarhException.Unauthorized()` | 401 | `ERR_UNAUTHORIZED` |
| `SarhException.Forbidden(...)` | 403 | `ERR_FORBIDDEN` |
| `SarhException.NotFound(...)` | 404 | `ERR_NOT_FOUND` |
| `SarhException.Conflict(...)` | 409 | `ERR_CONFLICT` |
| `SarhException.Upstream(...)` | 502 | `ERR_UPSTREAM` |

### المصادقة والصلاحيات (Auth)

- `PropertiesController` و`DisputesController` و`ReportsController` مُزيَّنة جميعها بـ `[Authorize]` على مستوى الصنف؛ لا مرور بدون JWT صالح.
- التحقق من الأدوار يتم عبر السمة `[OfficerOnly(...)]` (خريطة صلاحيات JSON، لا فحص أدوار بنصوص حرة). النطاق الجغرافي (region scope) يُفرَض داخل طبقة الخدمة.
- `RegionsController` و`VerifyController` (خريطة عامة) مُزيَّنان بـ `[AllowAnonymous]`.

---

## 1. وحدة العقارات — `PropertiesController`

الملف: `apps/api-dotnet/Controllers/PropertiesController.cs` — الجذر `[Route("api/v1/properties")]`، `[Authorize]`.

| الفعل | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/api/v1/properties/map` | أي مستخدم مُصادَق (`[Authorize]` فقط) | تغذية GeoJSON لكل القطع الحيّة عبر كل المناطق؛ سمات عامة فقط. `?region_id=` تضييق اختياري |
| POST | `/api/v1/properties` | أي مستخدم مُصادَق؛ حدّ كتابة (`RateLimitPolicies.Write`) | تقديم طلب تسجيل عقار جديد |
| GET | `/api/v1/properties` | أي مستخدم مُصادَق (منظور مُقيَّد بالدور) | قائمة العقارات بترقيم مؤشّري (cursor) |
| GET | `/api/v1/properties/nearby` | أي مستخدم مُصادَق | العقارات ضمن نصف قطر من نقطة |
| POST | `/api/v1/properties/overlap-check` | أي مستخدم مُصادَق | فحص تداخل مضلّع مقترح مع القطع المعتمدة |
| GET | `/api/v1/properties/{id:guid}` | مالك أو موظف داخل المنطقة | تفاصيل قطعة مع المضلّع وحالات التضارب |
| GET | `/api/v1/properties/{id:guid}/documents` | مالك أو موظف داخل المنطقة | قائمة الأدلّة المرفقة (صور + كروكي) |
| GET | `/api/v1/properties/{id:guid}/documents/{docId:guid}/file` | مالك أو موظف داخل المنطقة | بثّ ملف مستند مفرد |
| PATCH | `/api/v1/properties/{id:guid}/boundary` | super_admin / موظف داخل المنطقة / المالك أثناء سير الطلب | إعادة رسم مضلّع الحدود (تُعاد المساحة والمركز حسابياً) |
| POST | `/api/v1/properties/{id:guid}/review` | يُفرَض في الخدمة | قرار مراجعة (approve / reject / needs_clarification) |
| POST | `/api/v1/properties/{id:guid}/final-approve` | `department_manager`, `super_admin` | الاعتماد النهائي وسكّ رخصة NFT |
| POST | `/api/v1/properties/bulk-review` | `registry_officer`, `reviewer`, `super_admin` | مراجعة جماعية (حتى 50 قطعة) |
| POST | `/api/v1/properties/bulk-final-approve` | `department_manager`, `super_admin` | اعتماد نهائي جماعي (حتى 20 قطعة) |

### 1.1 تقديم عقار — `POST /api/v1/properties`

المُعالِج `Submit` يفوّض إلى `PropertiesService.SubmitAsync` في `apps/api-dotnet/Properties/PropertiesService.cs`. النقطة مُزيَّنة بـ `[EnableRateLimiting(RateLimitPolicies.Write)]` و`[Audit(Action = AuditActions.Create, Entity = "properties", EntityIdFrom = "property.id")]`.

جسم الطلب هو `CreatePropertyDto` (`apps/api-dotnet/Properties/PropertyDtos.cs`):

| الحقل | النوع | إلزامي | قيود التحقق |
|---|---|---|---|
| `property_type` | string | نعم | ضمن `residential\|agricultural\|commercial\|governmental\|industrial\|mixed` |
| `region_id` | int | نعم | رمز شعبية معتمد (FK إلى `regions`) |
| `municipality_id` | int? | لا | — |
| `address_ar` | string? | لا | — |
| `parcel_number` | string? | لا | حتى 32 حرفاً |
| `plan_number` | string? | لا | حتى 32 حرفاً |
| `block_number` | string? | لا | حتى 32 حرفاً |
| `boundary_polygon` | JsonElement | نعم | GeoJSON Polygon صالح |
| `area_sqm` | decimal | نعم | `Range(0.01, ...)` — **قيمة استرشادية تُتحقَّق مقابل المحسوبة** |
| `length_m` / `width_m` / `depth_m` | decimal? | لا | بيانات وصفية فقط — لا تُشتق منها المساحة |
| `documented_area_sqm` | decimal? | لا | `Range(0.01, ...)` — مساحة السند الورقي (للمقارنة) |
| `documents` | `PropertyDocumentDto[]?` | نعم فعلياً | يلزم `site_photo` و`koreky_certificate` (يُفرَض في الخدمة) |
| `owner_citizen_id` | Guid? | لا | يُملأ فقط عند تسجيل موظف نيابةً عن مواطن |

مثال طلب:

```json
{
  "property_type": "residential",
  "region_id": 12,
  "municipality_id": 34,
  "address_ar": "طرابلس - حي الأندلس",
  "parcel_number": "P-2211",
  "plan_number": "PL-88",
  "block_number": "B-4",
  "boundary_polygon": {
    "type": "Polygon",
    "coordinates": [[[13.18,32.88],[13.181,32.88],[13.181,32.881],[13.18,32.881],[13.18,32.88]]]
  },
  "area_sqm": 512.40,
  "documented_area_sqm": 500.00,
  "documents": [
    { "document_type": "site_photo", "storage_path": "property-documents/2026/07/ab12.jpg", "mime_type": "image/jpeg" },
    { "document_type": "koreky_certificate", "storage_path": "property-documents/2026/07/cd34.pdf", "mime_type": "application/pdf" }
  ]
}
```

الاستجابة `SubmitResult`:

```json
{
  "property": { "...": "PropertyView" },
  "registrationRequest": {
    "id": "…", "requestNo": "REG-2026-000123",
    "propertyId": "…", "currentStatus": "pending", "submittedAt": "2026-07-01T09:00:00Z"
  },
  "validation": {
    "computedAreaSqm": 511.90,
    "areaDiffPct": 0.10,
    "locationConflicts": []
  }
}
```

سلسلة التحقق في `SubmitAsync` بالترتيب الفعلي:

1. `ResolveOwnerAsync` — المواطن لا يسجّل باسم غيره (403)؛ الموظف يلزمه `owner_citizen_id` يشير إلى مواطن نشِط.
2. `EnforceOfficerRegionScope` — الموظف (عدا super_admin/auditor) لا يسجّل خارج منطقته.
3. التحقق من `region_id` مقابل جدول `regions` (وإلا 400 `ERR_VALIDATION`).
4. `ValidateDocuments` — إلزام صورة وكروكي (انظر §4).
5. `GeoJsonPolygon.ValidateAndConvert` — تحويل ومطابقة الحدود (انظر §1.11).
6. `ComputeValidationAsync` — حساب المساحة والمركز والتحقق من التطابق (انظر §4).
7. فحص التداخل الناعم `LocationConflictsForWktAsync`.
8. `CallInsertPropertyAsync` عبر الإجراء المخزّن `dbo.insert_property_with_polygon`.
9. إدراج المستندات، ثم تحديث `documented_area_sqm`، ثم توليد `request_no` عبر `dbo.next_registration_request_no`، ثم إنشاء صف `registration_requests` بحالة `pending`.
10. إشعار المراجعين في المنطقة (مع تنبيه تضارب موقع إن وُجد) وإشعار المالك باستلام الطلب.

### 1.2 قائمة العقارات — `GET /api/v1/properties`

يفوّض إلى `PropertiesService.ListAsync`. معامِلات `ListPropertiesQuery`:

| المعامِل | النوع | ملاحظات |
|---|---|---|
| `cursor` | string? | طابع زمني ISO؛ يُرجع صفوفاً `CreatedAt < cursor` |
| `limit` | int | `Range(1,100)`، الافتراضي 20 |
| `q` | string? | بحث `LIKE` (يُفعَّل عند طول ≥ 2) على `property_code`, `parcel_number`, `address_ar`, `plan_number` |
| `status` | string? | ضمن `draft\|pending\|under_review\|approved\|rejected\|needs_clarification\|frozen\|minted\|transferred` |
| `region_id` | int? | تضييق (يُفرَض النطاق حسب الدور) |

منطق النطاق: المواطن يرى عقاراته فقط؛ `super_admin`/`auditor` بلا تقييد منطقة (مع تضييق اختياري)؛ باقي الموظفين مُقيَّدون بمنطقتهم (`RegionId`) — ومحاولة عرض منطقة أخرى ترفع 403. الاستجابة `CursorPage<PropertyView>` (`apps/api-dotnet/Common/CursorPage.cs`) بحقول `items` و`nextCursor`. ملاحظة: في القائمة يبقى `boundaryPolygon` و`hasActiveDispute` و`hasLocationConflict` غير مُعبّأة (تُملأ فقط في قراءة التفصيل).

### 1.3 القريبة — `GET /api/v1/properties/nearby`

`NearbyQuery`: `lng` (`Range(-180,180)`), `lat` (`Range(-90,90)`), `radius_m` (`Range(1,50000)`)، `limit` (`Range(1,100)`، الافتراضي 20). يستعلم عبر `location_point.STDistance` ويعيد `NearbyResult { items: PropertyNearby[] }` مرتبةً تصاعدياً بالمسافة، مع `distanceM` بالمتر.

### 1.4 فحص التداخل — `POST /api/v1/properties/overlap-check`

جسم `OverlapCheckDto { polygon: GeoJSON }`. يعيد `OverlapResult { overlaps: PropertyOverlap[] }`. يقارن المضلّع المقترح **فقط مع القطع بحالة `approved`** عبر `boundary_polygon.STIntersects` ويحسب `overlap_pct` نسبةً إلى مساحة المضلّع المُدخَل.

### 1.5 تفاصيل قطعة — `GET /api/v1/properties/{id}`

`GetByIdAsync`: يتحقق من الوصول (المواطن مالكاً فقط؛ الموظف داخل منطقته)، ثم يملأ إضافةً إلى حقول `PropertyView`:
- `boundaryPolygon` — يُقرأ WKT من `boundary_polygon.STAsText()` ويُحوَّل إلى GeoJSON Polygon.
- `hasActiveDispute` — وجود حجز نشِط.
- `locationConflicts` / `hasLocationConflict` / `conflictKind` — تضارب الموقع الهندسي (انظر §4).

### 1.6 مستندات القطعة — `GET .../documents` و `.../documents/{docId}/file`

- `Documents` → `DocumentsResult { items: PropertyDocumentView[] }` مرتبة بـ `UploadedAt`. يعيد استخدام قواعد وصول `GetByIdAsync`.
- `DocumentFile` → يستدعي `ResolveDocumentFileAsync` لتحليل `storage_path` إلى `(bucket, path, mime)` ثم يبثّ الملف عبر `StorageService.OpenRead` مع ترويسة `Cache-Control: private, max-age=300`.

### 1.7 إعادة رسم الحدود — `PATCH /api/v1/properties/{id}/boundary`

جسم `UpdateBoundaryDto { boundary_polygon: GeoJSON }` (لا يُرسل المُستخدِم مساحةً؛ تُحسب دائماً من المضلّع). مُزيَّن بـ `[Audit(Action = AuditActions.Update, ...)]`. صلاحيات التحرير في `AuthorizeBoundaryEdit`:

| الدور | الصلاحية |
|---|---|
| `super_admin` | أي قطعة |
| `registry_officer` / `reviewer` / `department_manager` | منطقته فقط |
| `citizen` (المالك) | فقط ما دامت الحالة ليست `approved`/`minted`/`transferred` |
| `auditor` / `id_issuer` | ممنوع |

عند الحالة `approved` يُجرى فحص `ApprovedCentroidClashAsync` مسبقاً (409 إن اصطدم المركز بمعتمد آخر). ثم `ExecUpdateBoundaryAsync` يحدّث `boundary_polygon` و`location_point = @poly.EnvelopeCenter()` و`area_sqm = CAST(@poly.STArea() AS DECIMAL(14,2))`. يُعاد `PropertyView` مُحدَّث مع إعادة حساب التضارب، ويُشعَر المالك إذا كان المُحرِّر موظفاً (لا إشعار ذاتي).

### 1.8 المراجعة — `POST /api/v1/properties/{id}/review`

جسم `ReviewDecisionDto`: `decision` (ضمن `approve\|reject\|needs_clarification`)، `note?`، `approval_decree_no?`. لا توجد سمة `[Audit]` ثابتة هنا؛ يُسجَّل صف التدقيق يدوياً بالفعل الصحيح عبر `ReviewDecisionToAction`: `approve→approve`, `reject→reject`, غير ذلك `→update` (كي لا يُصنَّف الرفض خطأً كاعتماد). الاستجابة `ReviewResult`:

```json
{
  "property": { "...": "PropertyView" },
  "deed": { "path": "…", "sha256": "…", "verifyUrl": "https://verify.sarh.ly/…" },
  "vc":   { "credentialId": "…", "did": "…", "isPlaceholder": false }
}
```

`deed` و`vc` اختياريان (nullable) بحسب مسار المراجعة.

### 1.9 الاعتماد النهائي — `POST /api/v1/properties/{id}/final-approve`

مُقيَّد بـ `[OfficerOnly("department_manager", "super_admin")]` و`[Audit(Action = AuditActions.Approve, ...)]`. يفوّض إلى `LicenseService.FinalApproveAsync` لسكّ رخصة NFT فوق عقار سبق اعتماده من موظف. جسم الطلب `FinalApproveDto` (يقع في `apps/api-dotnet/Workflow/LicenseDtos.cs`): `approval_decree_no?`، `note?`. الاستجابة `LicenseResult` بحقول `property`, `nft`, `explorerTxUrl`, `explorerTokenUrl`, `metadataGatewayUrl`, و`simulated` (true حين يكون السكّ محاكىً بلا عقد/مفتاح).

### 1.10 العمليات الجماعية

- `POST /api/v1/properties/bulk-review` — `BulkReviewRequest { propertyIds, decision, note?, approvalDecreeNo? }`؛ يعالج `Distinct().Take(50)`، ويسجّل صف تدقيق لكل قطعة على حِدة، ويعيد `BulkResultResponse { results, successCount, failedCount }`.
- `POST /api/v1/properties/bulk-final-approve` — `BulkFinalApproveRequest { propertyIds, note? }`؛ يعالج `Distinct().Take(20)`، نفس شكل الاستجابة. الأخطاء الفردية تُلتقط في `BulkItemResult.error` دون إسقاط الدفعة.

### 1.11 التحقق من مضلّع GeoJSON — `GeoJsonPolygon`

الملف `apps/api-dotnet/Properties/GeoJsonPolygon.cs`. القواعد المُنفَّذة في `ValidateAndConvert`:
- يجب أن يكون كائناً بـ `type = "Polygon"` و`coordinates` مصفوفة بحلقة واحدة على الأقل.
- الحلقة الخارجية ≥ `MIN_RING_POINTS = 4` نقطة؛ كل نقطة `[lng, lat]`.
- رفض `NaN`/`Infinity`، ورفض أي إحداثية خارج صندوق ليبيا التقريبي: `lng ∈ [9.0, 26.0]`, `lat ∈ [19.0, 34.0]`.
- الحلقة يجب أن تكون مغلقة (النقطة الأولى = الأخيرة، تسامح `1e-9`).
- ضبط اتجاه الحلقة الخارجية إلى CCW (بحساب المساحة الموقّعة وعكسها عند اللزوم) قبل توليد WKT `POLYGON((...))` لتمريره إلى `geography::STGeomFromText(@wkt, 4326)`.

---

## 2. الوحدة العقارية على الخريطة (Map)

الملفات: `apps/api-dotnet/Map/MapService.cs` و`apps/api-dotnet/Map/MapDtos.cs`. يوجد سطحان لنفس البنية `MapFeatureCollection` (GeoJSON `FeatureCollection`) لكن يختلف نطاق القطع:

| الفعل | المسار | الصلاحية | الدالة |
|---|---|---|---|
| GET | `/api/v1/properties/map` | أي مستخدم مُصادَق | `OfficerMapAsync` — كل القطع الحيّة عبر كل المناطق |
| GET | `/api/v1/verify/map` | `[AllowAnonymous]` (في `VerifyController`) | `PublicMapAsync` — القطع الصادر لها سند فقط |

كلاهما يفوّض إلى `BuildAsync` الذي ينفّذ الإجراء المخزّن `dbo.property_map_features @p_public, @p_region_id`. القطع بلا مضلّع قابل للرسم تُتجاهَل. الأعمدة المُشتقّة المتأخّرة (`has_active_dispute`, `has_location_conflict`, `conflict_kind`, `map_status`) تُقرأ عبر `SafeOrdinal` بحيث تتدهور بأمان (dispute/conflict→false، kind→`none`، status→`pending`) على قاعدة بيانات مُهاجَرة جزئياً بدل رمي 500 وخريطة فارغة.

بنية `MapFeatureProps` (سمات عامة حصراً — لا اسم مالك ولا رقم وطني):

| الحقل | النوع | ملاحظة |
|---|---|---|
| `id` | Guid | |
| `propertyCode` / `parcelNumber` | string? | |
| `propertyType` | string | |
| `status` | string | حالة سير العمل الخام |
| `mapStatus` | string | دلو لوني مُشتق: `clear \| disputed \| pending \| public` |
| `regionId` | int? | |
| `areaSqm` | decimal? | |
| `updatedAt` | DateTimeOffset | |
| `hasActiveDispute` | bool | |
| `hasLocationConflict` | bool | تداخل هندسي مع قطعة حيّة أخرى |
| `conflictKind` | string | `ownership_conflict \| location_conflict \| none` |
| `lng` / `lat` | double | مركز (centroid) لتثبيت العلامة |

مثال مقتطف من الاستجابة:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[13.18,32.88], "…"]] },
      "properties": {
        "id": "…", "propertyCode": "TRP-000045", "propertyType": "residential",
        "status": "approved", "mapStatus": "clear", "regionId": 12,
        "areaSqm": 511.90, "hasActiveDispute": false,
        "hasLocationConflict": false, "conflictKind": "none",
        "lng": 13.1805, "lat": 32.8805
      }
    }
  ]
}
```

---

## 3. وحدة المناطق — `RegionsController`

الملف `apps/api-dotnet/Controllers/RegionsController.cs`، `[AllowAnonymous]`.

| الفعل | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/api/v1/regions` | عام | قائمة الشعبيات مرتبةً بـ `code` |

الاستجابة `RegionView[]`: `record RegionView(int Id, string Code, string NameAr, string? NameEn)`.

---

## 4. قواعد تقديم العقار كما هي مُنفَّذة في الكود (تأكيد)

هذا القسم يوثّق حرفياً القواعد الحرجة الواردة في CLAUDE.md، **كما تُنفَّذ فعلاً** في `apps/api-dotnet/Properties/PropertiesService.cs` و`PropertyDtos.cs`.

### 4.1 المساحة تُشتق من المضلّع عبر `geography.STArea()` — لا من الطول×العرض

- الثابت `AREA_TOLERANCE_PCT = 5m` في `PropertiesService`.
- `ComputeValidationAsync` ينفّذ في SQL Server:
  ```sql
  DECLARE @poly geography = geography::STGeomFromText(@wkt, 4326);
  DECLARE @computed DECIMAL(14,2) = CAST(@poly.STArea() AS DECIMAL(14,2));
  ```
  ثم يحسب `@diff = ABS(@computed - @area) / @area * 100`.
- إذا تجاوز الفرق `±5%` يُرمى 400 `ERR_VALIDATION` مع `details = { computed_area_sqm, area_diff_pct }`. أي أن `area_sqm` المُرسَلة قيمة استرشادية تُتحقَّق مقابل المساحة المحسوبة سلطوياً من الحدود، ولا تُشتق المساحة من `length_m`/`width_m`/`depth_m` (المُصرَّح في DTO أنها «بيانات وصفية اختيارية فقط»). عند إعادة الرسم في `ExecUpdateBoundaryAsync`، تُكتب المساحة دوماً كـ `CAST(@poly.STArea() AS DECIMAL(14,2))` ولا يملي العميل قيمتها.

### 4.2 مقارنة `documented_area_sqm` — تحذير لا حظر

- `documented_area_sqm` (مساحة السند الورقي) يُخزَّن عبر `UPDATE properties SET documented_area_sqm = ...` بعد الإدراج.
- في `PropertyView.From` يُحسب `documentedAreaDiffPct = round(|doc − measured| / measured × 100, 2)` (null إن غابت إحدى القيمتين). الخادم يُبرز هذه النسبة فقط؛ لا يوجد أي حظر صلب عند التباعد — عتبة التحذير (>10%) تُطبَّق من جهة العميل حسب CLAUDE.md، ولا يفرضها الكود الخادمي.

### 4.3 الأدلّة الإلزامية: `site_photo` + `koreky_certificate`

- `ValidateDocuments` في `PropertiesService` يُلزم وجود مستند واحد على الأقل من النوع `site_photo` وواحد من `koreky_certificate`، وإلا يُرمى 400 `ERR_VALIDATION` مع `details = { has_site_photo, has_koreky }`.
- كل مُدخل في `documents[]` هو `PropertyDocumentDto` بحقلي `document_type` (ضمن `koreky_certificate|survey_certificate|sale_contract|inheritance_deed|court_order|site_photo|boundary_map|other`) و`storage_path` (بصيغة `"<bucket>/<path>"`، حتى 255 حرفاً)، إضافةً إلى `mime_type?`, `file_size_bytes?`, `file_hash?`, `title_ar?`.
- المسار: يُرفع الملف أولاً عبر `POST /api/v1/uploads/property-document` (`apps/api-dotnet/Controllers/UploadsController.cs`) الذي يعيد `path` مُركّباً `"<bucket>/<path>"`، ثم تُمرَّر مرجعيته **مضمّنة inline** داخل `documents[]` في `POST /properties`. نقطة الرفع `[Authorize]` (أي مستخدم مُصادَق)، دلو `property-documents`، تقبل `image/jpeg|png|webp|application/pdf` وحدّ 10MB (`MaxPropertyDocBytes`).

### 4.4 تفرّد المركز (centroid) — حظر صلب 409

- في `ComputeValidationAsync`: يُحسب `@centroid = @poly.EnvelopeCenter()` ويُبحث عن قطعة `status = N'approved'` بـ `location_point.STEquals(@centroid) = 1`.
- عند التطابق يُرمى 409 `ERR_CONFLICT` («يوجد عقار معتمد مسبقاً بنفس الإحداثيات»). هذا هو الحظر الصلب الوحيد المتعلق بالموقع، ويُطبَّق أيضاً في `UpdateBoundaryAsync` (عبر `ApprovedCentroidClashAsync`) للقطع المعتمدة.

### 4.5 تداخل المضلّعات — تحذير مراجِع ناعم لا حظر

- `LocationConflictsForWktAsync` يبحث عن القطع الحيّة (`pending, under_review, needs_clarification, approved, minted, transferred, frozen`) التي يتقاطع مضلّعها مع المُقدَّم بمساحة **حقيقية `> 1.0 m²`** (فمشاركة خط حدّ بمساحة صفر لا تُبلَّغ)، مرتبةً تنازلياً بـ `overlap_pct`.
- النتيجة تُعاد ضمن `ValidationResult.locationConflicts` (قائمة `PropertyOverlap`) ولا تُسقِط الطلب؛ يُنشأ الطلب ويُنبَّه المراجعون. يُصنَّف نوع التضارب في `ClassifyConflict`:
  - `ownership_conflict` — يتداخل مع قطعة صادرة (`approved`/`minted`/`transferred`) → «خلل في الملكية».
  - `location_conflict` — يتداخل مع قطع غير معتمدة فقط → «تضارب في الموقع».
  - `none` — لا تداخل.
- `PropertyOverlap`: `propertyId`, `propertyCode?`, `parcelNumber?`, `overlapPct?`, `otherStatus?`.

---

## 5. وحدة الحجوزات والنزاعات — `DisputesController`

الملفات: `apps/api-dotnet/Controllers/DisputesController.cs`, `apps/api-dotnet/Disputes/DisputesService.cs`, `apps/api-dotnet/Disputes/DisputeDtos.cs`. الجذر `[Route("api/v1/property-disputes")]`, `[Authorize]`. الحجز القائم (`active`) هو حظر صلب على البيع والسكّ (يُفرَض عبر `AssertNoActiveDisputeAsync` التي يستدعيها `LicenseService`/`TransferService`).

| الفعل | المسار | الصلاحية (`[OfficerOnly]`) | الوصف |
|---|---|---|---|
| GET | `/api/v1/property-disputes?property_id={guid}` | `super_admin`, `auditor`, `registry_officer`, `reviewer`, `department_manager` | كل حجوزات القطعة (قائمة + تاريخية) الأحدث أولاً |
| POST | `/api/v1/property-disputes` | `super_admin`, `department_manager`, `registry_officer` | تسجيل حجز/نزاع جديد |
| POST | `/api/v1/property-disputes/{id:guid}/lift` | `super_admin`, `department_manager` | رفع (تحرير) حجز قائم |

- `POST` مُزيَّن بـ `[Audit(Action = AuditActions.Create, Entity = "property_disputes", EntityIdFrom = "id")]`؛ و`lift` بـ `[Audit(Action = AuditActions.Update, ...)]`.
- النطاق الجغرافي يُفرَض في `EnsureRegionScope` (super_admin/auditor بلا تقييد؛ غيرهم داخل منطقة القطعة فقط).

جسم `RecordDisputeDto`:

| الحقل | النوع | إلزامي |
|---|---|---|
| `property_id` | Guid | نعم |
| `dispute_type` | string | نعم (يجب أن يكون مفتاحاً في `DisputeLabels.Types`) |
| `case_number` | string? | لا |
| `issuing_authority` | string | نعم (غير فارغ) |
| `start_date` | DateOnly | نعم |
| `end_date` | DateOnly? | لا (يجب ألّا يسبق `start_date`) |
| `notes` | string? | لا |

جسم `LiftDisputeDto`: `notes?` (ملاحظة رفع تُلحَق بالملاحظات القائمة). الحجز المرفوع مسبقاً يرفع 409.

قيم `dispute_type` وترجماتها (`DisputeLabels.Types` في `DisputeDtos.cs`):

| القيمة (Latin) | العربية |
|---|---|
| `judicial_seizure` | حجز قضائي |
| `certified_mortgage` | رهن مصدّق |
| `inheritance_dispute` | نزاع ورثة |
| `waqf` | وقف |
| `precautionary_seizure` | حجز تحفظي |
| `other` | أخرى |

الحالة `status`: `active` → «قائم ومقيد»، `lifted` → «مرفوع».

الاستجابة `DisputeView` تتضمّن الحقول الخام (`disputeType`, `status`) مع نسخة عربية للعرض (`disputeTypeAr`, `statusAr`)، إضافةً إلى `propertyCode`, `caseNumber`, `issuingAuthority`, `startDate`, `endDate`, `notes`, `recordedByOfficerId`, `liftedByOfficerId`, `liftedAt`, `createdAt`. عند التسجيل والرفع يُشعَر المالك (`alsoSms: true`).

---

## 6. وحدة التقارير — `ReportsController`

الملف `apps/api-dotnet/Controllers/ReportsController.cs`. الجذر `[Route("api/v1/reports")]`، ومُقيَّد على مستوى الصنف بـ `[OfficerOnly("super_admin", "auditor", "department_manager")]`.

| الفعل | المسار | الصلاحية | الوصف |
|---|---|---|---|
| GET | `/api/v1/reports/trends?days={n}` | super_admin / auditor / department_manager | سلاسل يومية للتقديمات والاعتمادات والبطاقات المُصدَرة |
| GET | `/api/v1/reports/summary` | super_admin / auditor / department_manager | إجماليات لوحة التحكم |

- `Trends`: المعامِل `days` يُثبَّت في المدى `[7, 90]` (خارجه يُعاد إلى 30). يجمّع `Properties.SubmittedAt` و`Properties.FinalApprovedAt` و`DigitalIdCards.IssuedAt` منذ `since`، ويُنسّق التواريخ في الذاكرة (`yyyy-MM-dd`) لأن EF لا يترجم `ToString`. الاستجابة `TrendsResponse { days, submitted[], approved[], cardsIssued[] }` حيث كل عنصر `DayCount { date, count }`.
- `Summary`: يعيد `SummaryResponse`:

| الحقل | المصدر |
|---|---|
| `totalProperties` | `COUNT(Properties)` |
| `approvedProperties` | حالة `approved` أو `minted` |
| `pendingProperties` | حالة `pending` أو `under_review` |
| `rejectedProperties` | حالة `rejected` |
| `totalCitizens` | `COUNT(Citizens)` |
| `activeCards` | بطاقات `status = active` |
| `activeOfficers` | موظفون `IsActive` |

---

## 7. مرجع كائن `PropertyView`

الكائن الأساسي المُعاد في معظم نقاط العقارات (`apps/api-dotnet/Properties/PropertyDtos.cs`، الدالة `From(Property)`):

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | Guid | |
| `propertyCode` | string? | |
| `parcelNumber` / `planNumber` / `blockNumber` | string? | |
| `ownerCitizenId` | Guid | |
| `propertyType` | string | |
| `regionId` / `municipalityId` | int? | |
| `addressAr` | string? | |
| `areaSqm` | decimal? | المساحة السلطوية المحسوبة من المضلّع |
| `lengthM` / `widthM` / `depthM` | decimal? | بيانات وصفية فقط |
| `documentedAreaSqm` | decimal? | مساحة السند الورقي |
| `documentedAreaDiffPct` | decimal? | نسبة التباعد المحسوبة (2 منازل) |
| `status` | string | حالة سير العمل |
| `submittedAt` / `reviewedAt` | DateTimeOffset? | |
| `reviewedByOfficerId` | Guid? | |
| `rejectionReason` / `approvalDecreeNo` | string? | |
| `deedPdfPath` / `deedSignedHash` / `vcCredentialId` | string? | |
| `createdAt` / `updatedAt` | DateTimeOffset | |
| `boundaryPolygon` | object? | GeoJSON — يُملأ في قراءة التفصيل فقط |
| `hasActiveDispute` | bool | قراءة التفصيل فقط |
| `hasLocationConflict` | bool | قراءة التفصيل فقط |
| `conflictKind` | string | `ownership_conflict \| location_conflict \| none` |
| `locationConflicts` | `PropertyOverlap[]` | القطع المتداخلة |

المسارات ذات الصلة في المستودع:
- `apps/api-dotnet/Controllers/PropertiesController.cs`
- `apps/api-dotnet/Controllers/DisputesController.cs`
- `apps/api-dotnet/Controllers/ReportsController.cs`
- `apps/api-dotnet/Controllers/RegionsController.cs`
- `apps/api-dotnet/Controllers/VerifyController.cs` (خريطة عامة)
- `apps/api-dotnet/Controllers/UploadsController.cs` (رفع مستند العقار)
- `apps/api-dotnet/Properties/PropertiesService.cs` · `PropertyDtos.cs` · `GeoJsonPolygon.cs`
- `apps/api-dotnet/Disputes/DisputesService.cs` · `DisputeDtos.cs`
- `apps/api-dotnet/Map/MapService.cs` · `MapDtos.cs`
- `apps/api-dotnet/Common/CursorPage.cs` · `apps/api-dotnet/Common/Errors/SarhError.cs`
