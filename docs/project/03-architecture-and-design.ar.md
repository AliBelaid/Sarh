<div dir="rtl">

# الفصل الثالث — البنية والتصميم

## 3.1 المعمارية العامة (System Architecture)

يتبع النظام نمط **«وحدات مترابطة في خدمة واحدة» (Modular Monolith)** للخلفية، مع عملاء متعددين:

```text
                    ┌──────────────────────────────────────────┐
   عملاء (Clients)  │  ويب Angular 21   │   موبايل Flutter      │
                    └───────────┬──────────────────┬───────────┘
                                │ HTTPS / REST (JWT)│
                    ┌───────────▼──────────────────▼───────────┐
   الخدمة الخلفية   │        ASP.NET Core 8 — REST /api/v1       │
   (Backend)        │  Auth · Citizens · DigitalIdCards · Nfc   │
                    │  Properties · Map · Disputes · Workflow   │
                    │  Verify · Ssi · Blockchain · Audit · …    │
                    └───────────┬───────────────┬──────────────┘
                                │ EF Core 8     │ تكاملات
                    ┌───────────▼─────┐   ┌─────▼──────────────┐
   التخزين/الخدمات  │ SQL Server      │   │ ACA-Py (SSI)       │
                    │ (geography +    │   │ تخزين ملفات محلي    │
                    │  full-text +    │   │ Blockchain (Stub)  │
                    │  audit triggers)│   └────────────────────┘
                    └─────────────────┘
```

## 3.2 وحدات النظام (Modules)

| الوحدة | المسؤولية |
|--------|-----------|
| `Auth` | توقيع/تحقق JWT (HS256)، bcrypt، الصلاحيات. |
| `Citizens` | بيانات المواطنين. |
| `DigitalIdCards` + `Nfc` | إصدار الهوية الرقمية وتشفير بطاقات NTAG 424 DNA (SUN/AES-CMAC). |
| `Properties` | تقديم/مراجعة العقارات، التحقق المكاني، كشف التداخل، تعديل الحدود. |
| `Map` | تغذية الخرائط (الموظف/العامة) كـ GeoJSON. |
| `Disputes` | الحجوزات والنزاعات القانونية على العقارات. |
| `Workflow` | سير الاعتماد وإصدار/توقيع الصكوك (PAdES) وسكّ الرخصة. |
| `Verify` | التحقق العام + بثّ صكّ PDF. |
| `Ssi` | تكامل ACA-Py لإصدار الاعتمادات القابلة للتحقق. |
| `Blockchain` | طبقة بديلة (Stub) لسكّ سجل الملكية + IPFS، قابلة للاستبدال. |
| `Audit` | اعتراض عمليات الكتابة وتسجيلها. |
| `Notifications` | الإشعارات الداخلية. |

## 3.3 تصميم قاعدة البيانات (Database Design)

اصطلاحات: أسماء snake_case، مفاتيح أولية `UNIQUEIDENTIFIER DEFAULT NEWID()` (عدا `audit_log` فهو `BIGINT IDENTITY` للترتيب)، أعمدة الوقت `DATETIMEOFFSET(3)`، الحذف الناعم عبر `is_active = 0`، والـ ENUM عبر `CHECK (col IN (...))`.

### أبرز الكيانات والعلاقات

```text
citizens 1───* properties           (owner_citizen_id)
citizens 1───* digital_id_cards      (citizen_id)
digital_id_cards 1───1 nfc_card_secrets
properties 1───* property_documents  (صور + كروكي — دليل إلزامي)
properties 1───* registration_requests
properties 1───* property_disputes   (حجز/نزاع نشط يمنع البيع/السكّ)
properties 1───* property_nfts       (سجل الملكية المسكوك)
regions (الشعبيات) 1───* properties
officers *───1 offices / regions
* جميع عمليات الكتابة ───> audit_log (إلحاقي فقط)
```

### حالات العقار (Property Status)
`draft → pending → under_review → (approved | rejected | needs_clarification)`، ثم `approved → minted → transferred`، مع `frozen` للتجميد الإداري. بالإضافة إلى **حالة تضارب مشتقّة** (غير مخزّنة) تُحسب جغرافياً: «خلل في الملكية» أو «تضارب في الموقع».

## 3.4 تدفّقات العمل (Workflows)

### مسار تسجيل عقار (Submit → Verify)
```text
المواطن يرسم المضلّع ويرفق الدليل
        │
        ▼
POST /properties ── تحقق المساحة (±5%) + رفض تطابق المركز + كشف التداخل
        │
        ▼
registration_requests = pending  ──>  إشعار مراجعي المنطقة
        │
        ▼
الموظف يراجع (خريطة كل القطع + المستندات + تحذير التضارب)
        │
   ┌────┴─────────────┬─────────────────┐
 اعتماد            طلب توضيح            رفض
   │
   ▼
مدير الإدارة: اعتماد نهائي ──> توقيع الصكّ (PAdES) + QR ──> سكّ الرخصة (NFT)
   │
   ▼
verify.sarh.ly/{deed_id} ── تحقق عام
```

## 3.5 نموذج الأمان (Security Design)

| الطبقة | الآلية |
|--------|--------|
| المصادقة | JWT موقّع HS256؛ لا يحمل سوى `sub`, `role`, `citizen_id`/`officer_id`, `exp` — بلا بيانات شخصية. |
| كلمات المرور | bcrypt (BCrypt.Net-Next) بمعامل تكلفة. |
| الصلاحيات | خريطة JSON على `officers.permissions` + سِمة `[OfficerOnly]` لكل دالة. |
| عزل البيانات | RLS على الجداول الحسّاسة، ونطاق المنطقة للموظفين. |
| بطاقات NFC | NTAG 424 DNA: رسالة SUN، فكّ PICC بـ AES-CBC، اشتقاق مفتاح جلسة، تحقق CMAC بزمن ثابت، **عدّاد متدحرج** يمنع إعادة التشغيل. |
| الصكوك | توقيع PAdES (PKCS#7) + رمز QR للتحقق؛ أي عبث يُبطل التوقيع. |
| التدقيق | `audit_log` إلحاقي عبر مُحفّزات `INSTEAD OF UPDATE/DELETE`. |
| الحدود | `geography`: رفض تطابق المركز (فهرس فريد مُرشَّح)، وكشف التداخل بمساحة التقاطع. |
| الشبكة | CORS مقيّد بالواجهات المعروفة، وتحديد معدّل على المسارات الحسّاسة. |

## 3.6 تصميم الواجهات (UI/UX Design)

- تطبيق Angular **موحّد** يضم كل الأدوار خلف توجيه قائم على الصلاحيات.
- **رموز تصميم (Design Tokens)** للهوية البصرية بدل مكتبة جاهزة، مع دعم RTL كامل.
- ألوان الهوية: الأساسي `#0F172A`، الذهبي `#F97316`، الأحمر `#DC2626`، الأخضر `#0891B2`.
- مكوّنات مستقلّة (`standalone`) مع `OnPush` و**Signals** للحالة التفاعلية.
- ألوان الخريطة المساحية المشتقّة: 🟢 سليم · 🔴 نزاع · 🟡 قيد المراجعة · 🔵 ملكية عامة، مع **حدّ أحمر متقطّع** لحالات التضارب.

## 3.7 الطبقة الجغرافية (Geospatial Design)

- النوع `geography` (SRID 4326) لتخزين المضلّعات.
- **المساحة** عبر `STArea()` على الخادم (لا الطول×العرض)، وتقدير على العميل بصيغة الفائض الكروي.
- **المركز** عبر `EnvelopeCenter()` ومقارنته بـ `STEquals` لمنع التكرار.
- **التداخل** عبر `STIntersects` + قياس **مساحة التقاطع** `STIntersection().STArea()`، باعتبار العتبة > 1م² لتجاهل الأراضي المتجاورة التي تتشارك حدّاً فقط (مساحة تقاطعها = صفر).

</div>
