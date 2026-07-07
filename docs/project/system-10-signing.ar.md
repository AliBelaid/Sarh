# توقيع ملف PDF — إصدار سند/تصريحة موقّعة للمواطن والتحقّق منها

يوثّق هذا الفصل المسار الكامل لإصدار **صحيفة الملكيّة العقاريّة** (سند المواطن) الموقّعة رقمياً في منصّة صَرح، من لحظة اعتماد الموظّف للطلب، مروراً ببناء ملف الـ PDF بالعربية RTL وتضمين رمز QR للتحقّق، ثم التوقيع بـ CMS/PKCS#7 المنفصل، وحتى التحقّق العام غير المُوثَّق (unauthenticated) واكتشاف العبث. كلّ ما يرد هنا مُستخرَج حرفياً من الشيفرة المصدرية؛ وحيثما كان تطبيق PAdES تقريبياً عبر توقيع CMS منفصل، يُذكر ذلك بدقّة.

الفصل مرتبط مباشرةً بقيدين من `CLAUDE.md`:
- **القيد رقم 5** (مستندات مقاومة للعبث): كل سند PDF صادر يجب أن يكون موقّعاً بأسلوب PAdES ويحمل QR قابلاً للتحقّق يشير إلى `verify.sarh.ly/{deed_id}`.
- **القيد رقم 6** (سجلّ تدقيق append-only): كل مسار كتابة يُسجَّل في `audit_log`، والجدول محميّ بمُشغِّلات `INSTEAD OF UPDATE/DELETE`.

---

## 1. متى وكيف يُصدَر السند: خطوة سير العمل المُطلِقة للإصدار

السند لا يُنشأ عند التقديم ولا عند سكّ رخصة البلوكتشين، بل **عند اعتماد موظّف السجلّ للطلب** (`decision = "approve"`). نقطة الدخول هي مسار مراجعة واحد:

| المكوّن | القيمة | الملف |
|---|---|---|
| النقطة الطرفية | `POST /api/v1/properties/{id:guid}/review` | `apps/api-dotnet/Controllers/PropertiesController.cs` (السطر 80–87) |
| الـ Controller method | `Task<ReviewResult> Review(Guid id, [FromBody] ReviewDecisionDto dto, CancellationToken ct)` | `apps/api-dotnet/Controllers/PropertiesController.cs` |
| منطق العمل | `ReviewService.ReviewAsync(...)` → فرع `"approve"` → `ApproveAsync(...)` | `apps/api-dotnet/Workflow/ReviewService.cs` |

الـ `ReviewDecisionDto` يقيّد القرار إلى ثلاث قيم فقط عبر تعبير نمطي، ويُعرَّف في `apps/api-dotnet/Properties/PropertyDtos.cs` (السطر 94):

```csharp
public sealed class ReviewDecisionDto
{
    [Required, RegularExpression("^(approve|reject|needs_clarification)$")]
    public string Decision { get; set; } = "";
    public string? Note { get; set; }
    public string? ApprovalDecreeNo { get; set; }
}
```

### حَرَس الصلاحية والحالة قبل الإصدار

قبل أن يُبنى أي PDF، يفرض `ReviewAsync` عدّة بوّابات (في `apps/api-dotnet/Workflow/ReviewService.cs`):

| الشرط | السلوك عند الفشل |
|---|---|
| `actor.OfficerId is null` أو الدور خارج `{registry_officer, reviewer, super_admin}` | `SarhException.Forbidden` — فقط موظّفو السجلّ يعتمدون |
| قرار `reject`/`needs_clarification` بلا `Note` | `SarhException.Validation` — الملاحظة إلزامية |
| الدور ليس `super_admin` والعقار خارج `actor.RegionId` | `SarhException.Forbidden` — العقار خارج منطقتك |
| حالة العقار ليست ضمن `{pending, under_review, needs_clarification}` | `SarhException.Conflict` — غير قابل للمراجعة |

وداخل `ApproveAsync` تحديداً، قبل توليد السند:
- **حَرَس خلل الملكية** `IssuedOverlapClashAsync`: يرفض الاعتماد إذا تقاطع مضلّع الحدود مع عقار **مُصدَر سابقاً** (`approved`/`minted`/`transferred`) بمساحة تقاطع حقيقية `STIntersection(...).STArea() > 1.0` م²، فيُرمى `SarhException.Conflict`.
- **وجود المنطقة**: لا يُعتمد عقار بلا `Region` (يُرمى `Validation`).

عند اجتياز البوّابات يُنفَّذ التسلسل الآتي داخل `ApproveAsync`:
1. توليد رمز العقار `propertyCode` عبر الإجراء المخزَّن `dbo.next_property_code` (بادئة رمز المنطقة + السنة).
2. حساب `verifyUrl = BuildVerifyUrl(propertyCode)`.
3. جلب `owner` (المالك) و`officerName` (اسم الموظّف المُعتمِد).
4. **بناء بايتات الـ PDF** عبر `DeedPdfBuilder.Render(...)`.
5. **كتابة الـ PDF** إلى التخزين وحساب بصمته SHA-256.
6. **توقيع الـ PDF** عبر `SignDeedAsync(...)` (توقيع CMS منفصل بجانب الملف).
7. تحديث سطر العقار: `Status="approved"`، `PropertyCode`، `ReviewedAt`، `ReviewedByOfficerId`، `ApprovalDecreeNo`، `DeedPdfPath`، `DeedSignedHash`، ثم `SaveChangesAsync`.
8. إصدار شهادة `PropertyDeed VC` في محفظة SSI للمالك (best-effort).
9. إخطار المواطن ("تم اعتماد عقارك … يمكنك الآن تنزيل سند الملكية").

> ملاحظة تمييزية مهمّة: مسار **الاعتماد النهائي** `POST /api/v1/properties/{id:guid}/final-approve` (المُنفَّذ في `apps/api-dotnet/Workflow/LicenseService.cs`) **لا يبني ولا يوقّع** أي PDF؛ فهو خطوة سكّ الـ NFT على البلوكتشين لاحقاً، وهو يقرأ فقط بصمة السند المُخزَّنة مسبقاً `p.DeedSignedHash` ويُدرجها في بيانات وصف الرخصة (`DeedSha256`). إذاً الإصدار والتوقيع يحدثان **حصراً عند اعتماد الموظّف** في `ReviewService.ApproveAsync`.

### بناء رابط التحقّق `verifyUrl`

كِلا `ReviewService` و`LicenseService` يستخدمان نفس الدالّة:

```csharp
private string BuildVerifyUrl(string propertyCode)
{
    var baseUrl = (config["Sarh:VerifyBaseUrl"]
        ?? Environment.GetEnvironmentVariable("VERIFY_BASE_URL")
        ?? "https://verify.sarh.ly").TrimEnd('/');
    return $"{baseUrl}/{propertyCode}";
}
```

القاعدة الافتراضية `https://verify.sarh.ly` (تحقيقاً للقيد رقم 5). مفتاح `Sarh:VerifyBaseUrl` غير مُعرَّف في `apps/api-dotnet/appsettings.json`، لذا يُستخدم الافتراض ما لم يُضبط متغيّر البيئة `VERIFY_BASE_URL`. الرابط يصبح مثلاً `https://verify.sarh.ly/11-2026-000001`.

### التدقيق (القيد رقم 6)

الـ Controller لا يعتمد على مُرشِّح `[Audit]` ثابت هنا، لأن المسار الواحد يتفرّع على القرار؛ فيسجّل صراحةً بالفعل الصحيح:

```csharp
await audit.RecordAsync(ReviewAuditEntry(actor, ReviewDecisionToAction(dto.Decision), id, dto.Note, bulk: false), ct);
```

حيث `ReviewDecisionToAction` تُطابِق `approve→approve`، `reject→reject`، وأي شيء آخر `→update`. الـ `AfterStateJson` يخزّن `{ bulk, note }` فقط (لا أسرار). يوجد مسار جماعي مماثل `POST /api/v1/properties/bulk-review` يسجّل صفّ تدقيق لكل عقار على حدة.

---

## 2. بناء ملف الـ PDF: مخطّط QuestPDF في `DeedPdfBuilder`

الملف: `apps/api-dotnet/Workflow/DeedPdfBuilder.cs`. الصنف `public sealed class DeedPdfBuilder` مسجَّل كـ `Singleton` في `apps/api-dotnet/Program.cs` (السطر 164). المُنشئ الساكن يضبط ترخيص QuestPDF المجتمعي مرّة واحدة لكل عملية:

```csharp
static DeedPdfBuilder()
{
    QuestPDF.Settings.License = LicenseType.Community;
}
```

### المدخلات: `DeedInputs`

```csharp
public sealed class DeedInputs
{
    public required Property Property { get; init; }
    public required Citizen Owner { get; init; }
    public required Region Region { get; init; }
    public required string PropertyCode { get; init; }
    public required string DecreeNumber { get; init; }
    public required string OfficerName { get; init; }
    public required DateTimeOffset ApprovedAt { get; init; }
    public required string VerifyUrl { get; init; }
}
```

### التوقيع والدالّة الرئيسة

```csharp
public byte[] Render(DeedInputs input)
```

تُرجِع بايتات PDF (`GeneratePdf()`). إعدادات الصفحة الجوهرية:

| الخاصيّة | القيمة | الأثر |
|---|---|---|
| `page.Size(PageSizes.A4)` | A4 | صفحة واحدة |
| `page.Margin(18, Unit.Millimetre)` | 18 مم | هوامش موحّدة |
| `page.PageColor(ColPaper)` | `#FAFAF9` | خلفية ورقية |
| `page.ContentFromRightToLeft()` | RTL | تحقيق العربية-أولاً |
| `page.DefaultTextStyle(...)` | خطوط `Segoe UI`, `Tahoma`, `Arial`؛ لون `#0F172A`؛ حجم 11 | دعم عربي |

لوحة الألوان (ثوابت خاصّة) مطابقة لهويّة صَرح: `ColPrimary=#0F172A`، `ColAccent=#F97316`، `ColMuted=#64748B`، `ColRule=#E5E7EB`، `ColPaper=#FAFAF9`، `ColGood=#0891B2`.

الصفحة مقسومة إلى ثلاث مناطق: `Header` و`Content (Body)` و`Footer`.

### الترويسة `Header`

- شريط ثلاثي الألوان مستوحى من العلم الليبي بارتفاع 4 (`#DC2626` / `#F97316` / `#0891B2`).
- اسم المنصّة **صَرح** (حجم 20، غامق) + **سجلّ العقارات الليبي** + **LVCT — الرؤية الليبية للاتصالات والتقنية**.
- عنوان المستند **صحيفة ملكيّة عقاريّة** + `PropertyCode` بلون Accent.
- خط أفقي بلون Accent يفصل الترويسة.

### المتن `Body` — الحقول المعروضة

يتكوّن من أربع بطاقات محاطة بإطار، كلّها عبر مساعد `KeyValueGrid` (عمود تسمية 150 نقطة + قيمة غامقة):

**بطاقة "بيانات العقار"**

| التسمية (عربي) | مصدر القيمة |
|---|---|
| نوع العقار | `PropertyTypeAr(input.Property.PropertyType)` — تحويل `residential→سكني`، `agricultural→زراعي`، `commercial→تجاري`، `governmental→حكومي`، `industrial→صناعي`، `mixed→مختلط` |
| المنطقة | `{Region.NameAr} ({Region.Code})` |
| العنوان | `Property.AddressAr ?? "—"` |
| رقم القطعة | `Property.ParcelNumber ?? "—"` |
| رقم المخطّط | `Property.PlanNumber ?? "—"` |
| رقم البلوك | `Property.BlockNumber ?? "—"` |
| المساحة (م²) | `FormatArea(Property.AreaSqm)` — `ToString("N2")` أو `"—"` |

**بطاقة "بيانات المالك"**

| التسمية | مصدر القيمة |
|---|---|
| الاسم الكامل | `FullNameAr(Owner)` — دمج `FirstNameAr + FatherNameAr + GrandfatherNameAr + FamilyNameAr` |
| اسم الأم | `Owner.MotherNameAr ?? "—"` |
| الرقم الوطني القديم | `Owner.LegacyNationalNo ?? "—"` — تحقيقاً للقيد رقم 2 (قابلية إعادة الإصدار) |

**بطاقة "الاعتماد" + صندوق التحقّق**

| التسمية | مصدر القيمة |
|---|---|
| رقم القرار | `input.DecreeNumber` |
| الموظّف المعتِمد | `input.OfficerName` |
| تاريخ الاعتماد | `input.ApprovedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm")` |

إلى جانبها صندوق **"التحقّق العام"** (عرض 150، صورة QR بعرض 110) يظهر فيه رمز الـ QR ثم `PropertyCode` ثم الرابط منزوع البروتوكول عبر `StripScheme(input.VerifyUrl)` (إزالة `https://` أو `http://`).

**بطاقة "ملاحظات قانونيّة"** (خلفية `#F8F2DD`، إطار Accent):
> «هذه الصحيفة صادرة آليّاً من نظام صَرح. تُعتمد رقمياً عبر خانة QR أعلاه. أي تعديل يدوي على هذا المستند يُبطل صلاحيته. السجل الإلكتروني المركزي هو المرجع.»

### التذييل `Footer`

خط أفقي رفيع، ثم سطر يعرض `صحيفة ملكية #{PropertyCode}` يساراً و`صفحة {CurrentPageNumber} / {TotalPages}` يميناً.

> يوضّح تعليق رأس الملف بدقّة أن هذا المُنشئ **يولّد بايتات PDF فقط**، وأنّ الضمانات التي يقدّمها هي: (1) بايتات حقيقية قابلة للتجزئة SHA-256، (2) حَمْل الحقول القانونية الأساسية، (3) تضمين QR يشير إلى `verify.sarh.ly/{code}`.

---

## 3. رمز QR: كيف يشفّر QRCoder رابط التحقّق

التوليد داخل `DeedPdfBuilder.RenderQrPng` (المكتبة `QRCoder`، الحزمة `QRCoder` نسخة `1.6.0` في `apps/api-dotnet/Sarh.Api.csproj` السطر 22):

```csharp
private static byte[] RenderQrPng(string text)
{
    using var generator = new QRCodeGenerator();
    using var data = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
    var png = new PngByteQRCode(data);
    return png.GetGraphic(8);
}
```

| العنصر | القيمة |
|---|---|
| المحتوى المُشفَّر | `input.VerifyUrl` بالكامل، أي `https://verify.sarh.ly/{propertyCode}` |
| مستوى تصحيح الخطأ | `ECCLevel.M` (متوسط ~15%) |
| صيغة الإخراج | PNG عبر `PngByteQRCode` |
| حجم الوحدة (pixels-per-module) | `GetGraphic(8)` |

تُستدعى مرّة واحدة في بداية `Render` (`var qrPng = RenderQrPng(input.VerifyUrl);`) ثم تُمرَّر إلى `Body` وتُدرَج كصورة `Image(qrPng)`. أي أن نصّ الـ QR هو **رابط التحقّق العام الكامل** الذي يفتح صفحة `verify.sarh.ly` للرمز، محقّقاً حرفياً القيد رقم 5.

---

## 4. التوقيع الرقمي: آليّة `DeedSigningService` و`DeedSignature`

### 4.1 خدمة التوقيع `DeedSigningService`

الملف: `apps/api-dotnet/Workflow/DeedSigningService.cs`. الصنف `public sealed class DeedSigningService : IDisposable` مسجَّل `Singleton` في `apps/api-dotnet/Program.cs` (السطر 169) — تُحمَّل/تُولَّد الشهادة مرّة واحدة.

الأعضاء العامّون:

| العضو | التوقيع | الوصف |
|---|---|---|
| `IsProductionCert` | `bool { get; }` | `true` عند تحميل PFX حقيقي، `false` للسلطة التطويرية |
| `SignerSubject` | `string => _cert.Subject` | الاسم المميّز للموقّع |
| `SignerThumbprint` | `string => _cert.Thumbprint` | بصمة الشهادة |
| `Sign` | `byte[] Sign(byte[] content)` | يُفوّض إلى `DeedSignature.Sign(_cert, content)` |
| `Verify` | `DeedSignatureResult Verify(byte[] content, byte[] signature)` | يُفوّض إلى `DeedSignature.Verify(...)` |

### 4.2 مصدر الشهادة والإعدادات

الإعدادات في `DeedSigningOptions` (القسم `Sarh:DeedSigning`):

```csharp
public sealed class DeedSigningOptions
{
    public const string SectionName = "Sarh:DeedSigning";
    public string CertPath { get; set; } = "";       // مسار PKCS#12 (.pfx)
    public string CertPassphrase { get; set; } = "";
    public string SignerSubject { get; set; } = "CN=Sarh Deed Authority, O=LVCT, C=LY";
}
```

منطق اختيار الشهادة في المُنشئ:

| الحالة | السلوك |
|---|---|
| `CertPath` مضبوط والملف موجود | تحميل PFX: `new X509Certificate2(CertPath, CertPassphrase, X509KeyStorageFlags.EphemeralKeySet)`؛ `IsProductionCert = true` |
| `CertPath` مضبوط لكن الملف مفقود | تحذير في السجلّ + توليد سلطة تطويرية موقّعة ذاتياً |
| `CertPath` فارغ | معلومة في السجلّ + توليد سلطة تطويرية؛ `IsProductionCert = false` |

القسم `Sarh:DeedSigning` **غير موجود** في `apps/api-dotnet/appsettings.json`، لذا في التطوير الافتراضي تُولَّد **سلطة موقّعة ذاتياً** فوراً، بحيث يعمل خطّ الأنابيب كاملاً (approve → sign → verify) دون إعداد. في الإنتاج يُضبط `Sarh:DeedSigning:CertPath` (أو المتغيّر `DEED_SIGNING_CERT_PATH`) إلى PFX صادر عن جهة/سلطة حكومية.

توليد السلطة التطويرية في `DeedSigningCertificate.CreateSelfSigned` (ضمن `apps/api-dotnet/Workflow/DeedSignature.cs`):

```csharp
public static X509Certificate2 CreateSelfSigned(string subject, DateTimeOffset notBefore, DateTimeOffset notAfter)
{
    using var rsa = RSA.Create(2048);
    var req = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    req.CertificateExtensions.Add(new X509KeyUsageExtension(
        X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.NonRepudiation, critical: true));
    using var ephemeral = req.CreateSelfSigned(notBefore, notAfter);
    var pfx = ephemeral.Export(X509ContentType.Pfx);
    return new X509Certificate2(pfx, (string?)null, X509KeyStorageFlags.EphemeralKeySet);
}
```

خصائص السلطة التطويرية: مفتاح RSA بطول 2048، تجزئة SHA-256، استخدام مفتاح `DigitalSignature | NonRepudiation` (حرِج)، صلاحية من `now.AddDays(-1)` إلى `now.AddYears(10)` (كما يُمرَّرها المُنشئ). يُعاد ربط المفتاح الخاصّ عبر تصدير/استيراد PFX ليعمل `SignedCms` بثبات عبر المنصّات، مع `EphemeralKeySet` لإبقاء المفتاح خارج أي مخزن على القرص.

### 4.3 جوهر التوقيع: `DeedSignature.Sign` (البايتات الموقّعة والآليّة)

الملف: `apps/api-dotnet/Workflow/DeedSignature.cs`. الآليّة هي **CMS منفصل (detached) من نوع PKCS#7 SignedData** فوق **بايتات الـ PDF كاملةً**:

```csharp
private static readonly Oid Sha256 = new("2.16.840.1.101.3.4.2.1");

public static byte[] Sign(X509Certificate2 signerCert, byte[] content)
{
    var signedCms = new SignedCms(new ContentInfo(content), detached: true);
    var signer = new CmsSigner(signerCert)
    {
        DigestAlgorithm = Sha256,
        IncludeOption = X509IncludeOption.EndCertOnly,
    };
    signer.SignedAttributes.Add(new Pkcs9SigningTime(DateTime.UtcNow));
    signedCms.ComputeSignature(signer);
    return signedCms.Encode();
}
```

| العنصر | القيمة | الأثر |
|---|---|---|
| البنية | `SignedCms` بوضع `detached: true` | التوقيع لا يحتوي المحتوى؛ يعيش بجانب الـ PDF |
| **البايتات الموقّعة** | `ContentInfo(content)` حيث `content` = بايتات الـ PDF بالكامل | أي تعديل ولو بِتّة واحدة يُبطل التوقيع |
| خوارزمية التجزئة | SHA-256 (`OID 2.16.840.1.101.3.4.2.1`) | تحقيق تجزئة قوية |
| تضمين الشهادة | `X509IncludeOption.EndCertOnly` | يُضمَّن شهادة الموقّع نفسها داخل التوقيع → التوقيع ذاتيّ-التحقّق |
| سمة موقّعة | `Pkcs9SigningTime(DateTime.UtcNow)` (`OID 1.2.840.113549.1.9.5`) | ختم زمن التوقيع |
| الإخراج | `signedCms.Encode()` — DER مُرمَّز | يُخزَّن كملف `.p7s` |

### 4.4 كيف يُخزَّن التوقيع ويُرفَق: نموذج التخزين

**لا يُخزَّن التوقيع في قاعدة البيانات إطلاقاً**؛ يُكتب كملفٍّ شقيق للـ PDF. المسار في `ReviewService.SignDeedAsync`:

```csharp
private async Task SignDeedAsync(Guid propertyId, string deedRel, byte[] pdfBytes, CancellationToken ct)
{
    try
    {
        var signature = deedSigning.Sign(pdfBytes);
        await storage.WriteRawAsync(
            "property_deeds", $"{deedRel}.p7s", signature, "application/pkcs7-signature", ct);
    }
    catch (Exception ex)
    {
        log.LogWarning(ex, "Deed signing failed for property {PropertyId}; deed stored unsigned.", propertyId);
    }
}
```

تخطيط التخزين (الحاوية `property_deeds` عبر `StorageService.WriteRawAsync` في `apps/api-dotnet/Storage/StorageService.cs`):

| المُصنَع | المسار النسبي | نوع MIME |
|---|---|---|
| السند | `property_deeds/{propertyId}/deed.pdf` | `application/pdf` |
| التوقيع المنفصل | `property_deeds/{propertyId}/deed.pdf.p7s` | `application/pkcs7-signature` |

وفي جدول `properties` يُخزَّن فقط (من `apps/api-dotnet/Data/Entities/Property.cs`):

| العمود | الخاصيّة | المحتوى |
|---|---|---|
| `deed_pdf_path` | `DeedPdfPath` | `"property_deeds/{path}"` (بصيغة `<bucket>/<rest>`) |
| `deed_signed_hash` | `DeedSignedHash` | بصمة SHA-256 لبايتات الـ PDF (`written.Sha256`) |

> **best-effort**: فشل التوقيع لا يوقف الاعتماد — يُخزَّن السند غير موقّع ويُحذَّر في السجلّ، ويبقى فحص SHA-256 عند التنزيل ساري المفعول.

### 4.5 نيّة PAdES وعلاقتها بالـ CMS المنفصل (بدقّة)

تعليقات الشيفرة صريحة، ويجب توثيقها كما هي دون مبالغة:

- توقيع صَرح هو **الجوهر التعمويّ (cryptographic substance) لتوقيع PAdES-B**: CMS/PKCS#7 SignedData بخوارزمية SHA-256 مع سمة زمن التوقيع.
- **ليس** PAdES كامل بمعنى ISO 32000: التوقيع **غير مُضمَّن** داخل `/ByteRange` في الـ PDF نفسه. تضمينه يتطلّب كاتب PDF بأسلوب incremental-update (مثل iText/PDFBox)، وهذا **متروك ومُتتبَّع كعمل منفصل**.
- الصيغة المنفصلة تحقّق **نفس ضمان مقاومة العبث + هويّة الموقّع** باستخدام مكتبة الأساس (BCL) فقط، دون اعتماديّات خارجية.

بعبارة أخرى: **PAdES مُقارَب هنا بتوقيع CMS منفصل (deed.pdf.p7s)**، وهذا ما تنفّذه الشيفرة فعلياً — لا يوجد تضمين توقيع داخل PDF.

---

## 5. التحقّق العام: مسار `VerifyController` غير المُوثَّق

الملف: `apps/api-dotnet/Controllers/VerifyController.cs`. الـ Controller مُعلَّم `[AllowAnonymous]` بالكامل على المسار `api/v1/verify`، والتقييد بالمعدّل (rate limiting) يُطبَّق على بوّابة nginx وفق قائمة الأمان في `CLAUDE.md` (لا خنق على مستوى التطبيق). منطق العمل في `apps/api-dotnet/Verify/VerifyService.cs` (مسجَّل `Scoped` في `Program.cs` السطر 218).

النقاط الطرفية العامّة:

| الفعل | المسار | الطريقة | المُرجَع |
|---|---|---|---|
| GET | `/api/v1/verify/map` | `Map(int? region_id, ...)` → `MapService.PublicMapAsync` | `MapFeatureCollection` (GeoJSON للعقارات المُصدَرة فقط، دون بيانات المالك) |
| GET | `/api/v1/verify/{code}` | `ByCode` → `VerifyService.ByPropertyCodeAsync` | `PublicDeedView` |
| GET | `/api/v1/verify/{code}/deed.pdf` | `DownloadDeed` | ملف PDF (مع فحص عبث) |
| GET | `/api/v1/verify/{code}/deed.p7s` | `DownloadDeedSignature` | ملف التوقيع المنفصل |

### 5.1 `GET /api/v1/verify/{code}` — العرض العام المُعقَّم

`ByPropertyCodeAsync` يقصر النتائج على الحالات القابلة للتحقّق العام:

```csharp
private static readonly string[] PublicStatuses = ["approved", "minted", "transferred"];
```

ثم يبني `PublicDeedView` (من `apps/api-dotnet/Verify/VerifyDtos.cs`). أبرز الحقول المتعلّقة بالسند والتوقيع:

| الحقل | المصدر/المنطق |
|---|---|
| `OwnerDisplayName` | اسم مُعقَّم: الاسم الأول والعائلة كاملان، والأوسط مُقنَّع عبر `MaskName` (يستبدل ما بعد الحرف الأول بنقاط `•`) — تحقيقاً لعدم تسريب PII |
| `DeedPdfSignedUrl` | `"/api/v1/verify/{code}/deed.pdf"` إن وُجد `DeedPdfPath`، وإلا `null` |
| `DeedSignedHash` | بصمة SHA-256 المُخزَّنة |
| `DeedSignature` | `DeedSignatureView` مُحسوبة آنياً (انظر أدناه) |
| `BoundaryPolygonGeojson` | عبر الإجراء `dbo.property_polygon_geojson` |
| `Nft` | عرض NFT العلني إن وُجد سكّ نشط |
| `HasActiveDispute` / `ActiveDisputes` | الأعباء القانونية النشطة (حجز، رهن، وقف…) تُعرض للعموم |

التحقّق من التوقيع يجري داخل `LoadDeedSignatureAsync`: يقرأ الـ PDF ثم ملف `.p7s` من التخزين، ويستدعي `deedSigning.Verify(pdf, sig)`، فيُنتج `DeedSignatureView`:

```csharp
public sealed class DeedSignatureView
{
    public required bool Valid { get; init; }
    public string? SignerSubject { get; init; }
    public string? SignerThumbprint { get; init; }
    public DateTimeOffset? SignedAt { get; init; }
    public required string SignatureUrl { get; init; }   // "/api/v1/verify/{code}/deed.p7s"
}
```

التحقّق **إعلاميّ لا قاتل**: غياب ملف `.p7s` (سندات أقدم غير موقّعة) أو أي خطأ قراءة يُرجِع `null` بدل الفشل.

### 5.2 `GET /api/v1/verify/{code}/deed.pdf` — بثّ السند مع إعادة فحص السلامة

الطريقة `DownloadDeed` تنفّذ إعادة فحص السلامة قبل تسليم الملف:

```csharp
var (propertyCode, deedPath, expectedHash) = await verify.ResolveDeedPathAsync(code, ct);
var slash = deedPath.IndexOf('/');
if (slash <= 0) return NotFound();
var bucket = deedPath[..slash];
var path = deedPath[(slash + 1)..];

var bytes = await storage.ReadAsync(bucket, path, ct);
if (!string.IsNullOrEmpty(expectedHash))
{
    var actualHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    if (!string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase))
    {
        log.LogWarning("Deed tamper check failed for {Code}: expected {Expected}, got {Actual}",
            propertyCode, expectedHash, actualHash);
        throw SarhException.Conflict(
            "تعذّر التحقّق من سلامة سند الملكية. تواصل مع الجهة المختصّة.",
            "Deed integrity check failed.");
    }
}

Response.Headers["Content-Disposition"] = $"inline; filename=\"{propertyCode}.pdf\"";
Response.Headers["X-Deed-SHA256"] = expectedHash ?? "";
return File(bytes, "application/pdf");
```

الآليّة: يقرأ البايتات مرّةً واحدة، يحسب SHA-256 لها، يقارنها بالقيمة المُسجَّلة وقت الاعتماد (`deed_signed_hash`). عند التطابق يبثّ الملف مضمّناً (`inline`) ويُظهِر البصمة في ترويسة `X-Deed-SHA256`. عند عدم التطابق **يرفض التسليم** برمي `SarhException.Conflict` — فيُخفِق ضمان التحقّق بدل تقديم مستند مزوّر بصمت. (`ResolveDeedPathAsync` يقصر أيضاً على `PublicStatuses` ويرمي `NotFound` عند غياب `DeedPdfPath`.)

### 5.3 `GET /api/v1/verify/{code}/deed.p7s` — التوقيع المنفصل للتحقّق خارج النطاق

```csharp
var (propertyCode, signature) = await verify.ResolveDeedSignatureAsync(code, ct);
Response.Headers["Content-Disposition"] = $"attachment; filename=\"{propertyCode}.pdf.p7s\"";
return File(signature, "application/pkcs7-signature");
```

يقرأ `ResolveDeedSignatureAsync` بايتات `.p7s` من التخزين (يرمي `NotFound` إن غابت). هذا يتيح لأي مُتحقِّق أن يفحص السند مقابل توقيع سلطة صَرح **خارج النطاق (out-of-band)** بأدوات PKCS#7 قياسية.

### 5.4 ما يراه المُتحقِّق العام

من `PublicDeedView`: رمز العقار، رقم القطعة، نوع العقار، المساحة، الحالة، رقم قرار الاعتماد، تاريخ المراجعة، معرّف شهادة الـ VC، **اسم المالك مُعقَّماً**، مضلّع الحدود GeoJSON، رابط تنزيل السند الموقّع، بصمة السند، **حالة التوقيع** (`Valid`، `SignerSubject`، `SignerThumbprint`، `SignedAt`)، ورقة الـ NFT إن وُجدت، وأي **أعباء قانونية نشطة**. لا تظهر بيانات PII الحسّاسة (هاتف، تاريخ ميلاد…).

### 5.5 مسار التحقّق الداخلي: `DeedSignature.Verify`

```csharp
public static DeedSignatureResult Verify(byte[] content, byte[] signature)
{
    try
    {
        var signedCms = new SignedCms(new ContentInfo(content), detached: true);
        signedCms.Decode(signature);
        signedCms.CheckSignature(verifySignatureOnly: true);
        // ... استخراج الموقّع من SignerInfos[0].Certificate وزمن التوقيع من السمة 1.2.840.113549.1.9.5
        return new DeedSignatureResult { Valid = true, SignerSubject = ..., SignerThumbprint = ..., SignedAt = ... };
    }
    catch (CryptographicException)
    {
        return new DeedSignatureResult { Valid = false };
    }
}
```

المعامل `verifySignatureOnly: true` يفحص **التوقيع التعمويّ فقط دون بناء سلسلة ثقة** — وهو الخيار الصحيح لسلطة موقّعة ذاتياً، ويبقى صالحاً لشهادة إنتاج صادرة عن CA (ثقة السلسلة سياسة منفصلة اختيارية). أي فشل تعمويّ يُلتقط كـ `CryptographicException` ويُرجِع `Valid=false`.

---

## 6. مقاومة العبث: طبقتان مستقلّتان لاكتشاف التلاعب

يجمع النظام بين حاجزين متكاملين، بحيث يفشل التحقّق لا أن يُسلَّم مستند مزوّر:

| الطبقة | الآليّة | نقطة الفشل |
|---|---|---|
| 1. بصمة SHA-256 عند التنزيل | تُسجَّل `deed_signed_hash` وقت الاعتماد؛ يُعاد حساب البصمة عند كل تنزيل عبر `/deed.pdf` وتُقارَن | عدم التطابق → `SarhException.Conflict`، رفض البثّ + تحذير في السجلّ |
| 2. توقيع CMS المنفصل | `DeedSignature.Verify` يربط بايتات الـ PDF بتوقيع الموقّع؛ تعديل الـ PDF أو التوقيع يُبطل `CheckSignature` | `CryptographicException` → `Valid=false` في `DeedSignatureView` |

هويّة الموقّع مضمَّنة داخل التوقيع (`EndCertOnly`)، فيُظهِر التحقّق `SignerSubject` و`SignerThumbprint`، ما يمنع انتحال جهة الإصدار. ملف الاختبارات `apps/api-dotnet.Tests/DeedSignatureTests.cs` يثبت هذه الضمانات:

| الاختبار | ما يؤكّده |
|---|---|
| `SignThenVerify_RoundTrips` | التوقيع ثم التحقّق ينجحان (`Valid=true`) |
| `Verify_ExposesSignerAndSigningTime` | التحقّق يكشف الموقّع والبصمة وزمن التوقيع |
| `Verify_FailsWhenContentTampered` | قلب بِتّة في آخر بايت من المحتوى → `Valid=false` |
| `Verify_FailsForGarbageSignature` | توقيع عشوائي `{1,2,3,4,5}` → `Valid=false` |
| `Verify_FailsWhenSignedByDifferentContent` | التحقّق بمحتوى مختلف عن الموقّع → `Valid=false` |
| `GeneratedCert_HasUsablePrivateKeyForSigning` | الشهادة المُولَّدة تملك مفتاحاً خاصاً صالحاً |

كما أن `StorageService.AbsoluteFor` يرفض اجتياز المسار (path traversal) بالتأكّد أنّ المسار بعد التطبيع يبقى داخل `<root>/<bucket>`، فلا يُقرأ/يُكتب سند خارج الحاوية. وبما أن كل مسار كتابة يسجّل في `audit_log` غير القابل للتعديل (القيد رقم 6)، يبقى أثر الإصدار قابلاً للتدقيق دائماً.

---

## 7. التسلسل الكامل (إصدار → توقيع → QR → تخزين → تحقّق)

1. يرسل موظّف السجلّ `POST /api/v1/properties/{id}/review` بـ `{ "decision": "approve", "approvalDecreeNo": "...", "note": "..." }`.
2. `ReviewService.ReviewAsync` يفرض الدور والمنطقة والحالة القابلة للمراجعة، ثم يستدعي `ApproveAsync`.
3. `ApproveAsync` يفرض حَرَس خلل الملكية `IssuedOverlapClashAsync` (رفض التقاطع مع عقار مُصدَر) ووجود المنطقة.
4. يُولَّد `propertyCode` عبر `dbo.next_property_code`، ويُبنى `verifyUrl = https://verify.sarh.ly/{propertyCode}`.
5. **بناء الـ PDF**: `DeedPdfBuilder.Render(DeedInputs{...})` ينتج صفحة A4 عربية RTL بحقول العقار والمالك والاعتماد، مع **QR** يشفّر `verifyUrl` (QRCoder، `ECCLevel.M`، PNG).
6. **التخزين**: `storage.WriteRawAsync("property_deeds", "{id}/deed.pdf", pdfBytes, "application/pdf")` يكتب الـ PDF ويُرجِع بصمة SHA-256 = `deedHash`.
7. **التوقيع**: `SignDeedAsync` → `deedSigning.Sign(pdfBytes)` → CMS/PKCS#7 منفصل (SHA-256، `EndCertOnly`، سمة زمن التوقيع) → يُكتب `property_deeds/{id}/deed.pdf.p7s` (best-effort).
8. **الثبات**: تحديث سطر العقار (`Status="approved"`, `PropertyCode`, `DeedPdfPath="property_deeds/{id}/deed.pdf"`, `DeedSignedHash=deedHash`, …) ثم `SaveChangesAsync`؛ إصدار شهادة `PropertyDeed VC` (best-effort)؛ إخطار المواطن.
9. **التدقيق**: الـ Controller يسجّل صفّاً في `audit_log` بالفعل `approve` (القيد رقم 6، append-only).
10. **التحقّق العام**: يمسح المُتحقِّق الـ QR فيصل إلى `verify.sarh.ly/{code}`؛ الواجهة تستدعي `GET /api/v1/verify/{code}` → عرض مُعقَّم + حالة توقيع (`DeedSignatureView`)، و`GET /api/v1/verify/{code}/deed.pdf` → إعادة فحص SHA-256 قبل البثّ (رفض عند العبث)، و`GET /api/v1/verify/{code}/deed.p7s` → تنزيل التوقيع للفحص خارج النطاق.

### مقتطف نداء التوقيع (حقيقي، من الشيفرة)

```csharp
// apps/api-dotnet/Workflow/ReviewService.cs — داخل ApproveAsync
var deedRel = $"{property.Id}/deed.pdf";
var written  = await storage.WriteRawAsync("property_deeds", deedRel, pdfBytes, "application/pdf", ct);
var deedPath = $"property_deeds/{written.Path}";
var deedHash = written.Sha256;               // == properties.deed_signed_hash

await SignDeedAsync(property.Id, deedRel, pdfBytes, ct);   // يكتب deed.pdf.p7s

// ... داخل SignDeedAsync:
var signature = deedSigning.Sign(pdfBytes);  // DeedSigningService.Sign → DeedSignature.Sign(cert, content)
await storage.WriteRawAsync(
    "property_deeds", $"{deedRel}.p7s", signature, "application/pkcs7-signature", ct);

// ... جوهر التوقيع في apps/api-dotnet/Workflow/DeedSignature.cs:
var signedCms = new SignedCms(new ContentInfo(content), detached: true);
var signer = new CmsSigner(signerCert)
{
    DigestAlgorithm = new Oid("2.16.840.1.101.3.4.2.1"),  // SHA-256
    IncludeOption = X509IncludeOption.EndCertOnly,
};
signer.SignedAttributes.Add(new Pkcs9SigningTime(DateTime.UtcNow));
signedCms.ComputeSignature(signer);
byte[] der = signedCms.Encode();             // DER منفصل → deed.pdf.p7s
```

---

## 8. مرجع سريع للملفات والحزم

| المكوّن | الملف |
|---|---|
| بناء الـ PDF + QR | `apps/api-dotnet/Workflow/DeedPdfBuilder.cs` |
| خدمة التوقيع + الإعدادات | `apps/api-dotnet/Workflow/DeedSigningService.cs` |
| جوهر التوقيع/التحقّق + توليد الشهادة | `apps/api-dotnet/Workflow/DeedSignature.cs` |
| موضع الإصدار (اعتماد الموظّف) | `apps/api-dotnet/Workflow/ReviewService.cs` |
| نقطة المراجعة الطرفية + التدقيق | `apps/api-dotnet/Controllers/PropertiesController.cs` |
| Controller التحقّق العام | `apps/api-dotnet/Controllers/VerifyController.cs` |
| منطق التحقّق العام | `apps/api-dotnet/Verify/VerifyService.cs` |
| نماذج العرض العام | `apps/api-dotnet/Verify/VerifyDtos.cs` |
| التخزين على الملفّات | `apps/api-dotnet/Storage/StorageService.cs` |
| أعمدة السند في الكيان | `apps/api-dotnet/Data/Entities/Property.cs` (`deed_pdf_path`, `deed_signed_hash`) |
| تسجيل الخدمات (DI) | `apps/api-dotnet/Program.cs` (السطور 164, 167–169, 218) |
| اختبارات التوقيع | `apps/api-dotnet.Tests/DeedSignatureTests.cs` |

| الحزمة | النسخة | الغرض | الموضع |
|---|---|---|---|
| `QuestPDF` | `2024.7.3` | توليد الـ PDF (A4، RTL) | `apps/api-dotnet/Sarh.Api.csproj` (السطر 21) |
| `QRCoder` | `1.6.0` | توليد رمز QR للرابط | `apps/api-dotnet/Sarh.Api.csproj` (السطر 22) |

> خلاصة الدقّة: التوقيع المُطبَّق فعلياً هو **CMS/PKCS#7 منفصل (deed.pdf.p7s)** فوق بايتات الـ PDF بخوارزمية SHA-256 وسمة زمن توقيع؛ وهو الجوهر التعمويّ لـ PAdES-B لكنه **ليس** PAdES مُضمَّناً داخل الـ PDF (لا `/ByteRange`). ومقاومة العبث مضمونة بطبقتين: بصمة SHA-256 المُعاد فحصها عند التنزيل + التحقّق التعمويّ من التوقيع المنفصل.
