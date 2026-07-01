# طبقة البيانات والاستمرارية (Data & Persistence Layer)

تُوثّق هذه الفصل طبقة البيانات في الخدمة الخلفية لمنصّة صَرح، وهي تقع كاملةً تحت المسار `apps/api-dotnet/Data/` (مع سِجلّ الهجرات في `apps/api-dotnet/Migrations/`). تعتمد المنصّة على **EF Core 8** فوق **SQL Server 2019/2022**، لكنّ المصدر المرجعي (source of truth) للمخطّط ليس نموذج EF بل ملفّات **T-SQL المرقّمة** تحت `infra/mssql/migrations/000–048.sql`؛ فنموذج EF هنا يصف الكيانات للقراءة/الكتابة فقط، بينما تُبنى المُحفّزات (triggers) والفهارس المكانية وسياسات RLS والدوال المُخزّنة وبيانات التهيئة عبر الـ T-SQL الخام. هذا الفصل يشرح: كيانات `SarhDbContext` وربطها بالجداول، آليّة الإقلاع (bootstrap) للهجرات كما هي في الشيفرة تماماً، معالجة أعمدة JSON، استخدام `geography`، وتفاعُل EF مع مُحفّزات السجلّ المُلحَق-فقط (append-only).

---

## 1. الاصطلاحات العامة لطبقة البيانات

هذه الاصطلاحات مُطبَّقة عبر جميع الجداول (يُنظر في `infra/mssql/migrations/003_citizens.sql`, `006_properties.sql`, `011_audit.sql`):

| الاصطلاح | التطبيق |
|---|---|
| المفاتيح الأساسية | `UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID()` — عدا `audit_log` الذي يستخدم `BIGINT IDENTITY(1,1)` للترتيب الزمني الصارم |
| أعمدة الزمن | `DATETIMEOFFSET(3)` مع `DEFAULT SYSDATETIMEOFFSET()` |
| تسمية الجداول والأعمدة | `snake_case` (إنجليزيّة، جمع للجداول: `citizens`, `properties`) |
| الحذف الناعم | `is_active BIT NOT NULL DEFAULT 1` (بدل الحذف الفعلي) |
| التعدادات (ENUM) | لا وجود لها في SQL Server — تُحاكى بـ `NVARCHAR(N) CHECK (col IN (…))` |
| أعمدة JSON | `NVARCHAR(MAX)` مع `CHECK (ISJSON(col) = 1)` |
| الطابع الزمني `updated_at` | يُحدَّث آليّاً عبر مُحفّز `AFTER UPDATE` لكل جدول |

في نموذج EF، تُربَط الأعمدة عبر سِمة `[Column("…")]` على كل خاصيّة، والجداول عبر `[Table("…")]` على كل صنف، فتُحافظ الأصناف على أسماء C# بصيغة `PascalCase` بينما تبقى الأعمدة `snake_case` في القاعدة.

---

## 2. سياق قاعدة البيانات `SarhDbContext`

الملف: `apps/api-dotnet/Data/SarhDbContext.cs`

يُعرَّف السياق بنمط الباني الأوّلي (primary constructor) في C# 12:

```csharp
public class SarhDbContext(DbContextOptions<SarhDbContext> options) : DbContext(options)
```

ويُصرّح بسبعة عشر `DbSet<>`. الجدول التالي يربط كل كيان (entity) بجدول SQL المُقابِل وملف الكيان في المستودع:

| كيان EF (`DbSet`) | جدول SQL | ملف الكيان |
|---|---|---|
| `AuthUsers` | `auth_users` | `apps/api-dotnet/Data/Entities/AuthUser.cs` |
| `Officers` | `officers` | `apps/api-dotnet/Data/Entities/Officer.cs` |
| `Citizens` | `citizens` | `apps/api-dotnet/Data/Entities/Citizen.cs` |
| `Properties` | `properties` | `apps/api-dotnet/Data/Entities/Property.cs` |
| `PropertyDocuments` | `property_documents` | `apps/api-dotnet/Data/Entities/PropertyDocument.cs` |
| `Regions` | `regions` | `apps/api-dotnet/Data/Entities/Property.cs` |
| `DigitalIdCards` | `digital_id_cards` | `apps/api-dotnet/Data/Entities/DigitalIdCard.cs` |
| `IdIssuanceHistory` | `id_issuance_history` | `apps/api-dotnet/Data/Entities/DigitalIdCard.cs` |
| `NfcCardSecrets` | `nfc_card_secrets` | `apps/api-dotnet/Data/Entities/DigitalIdCard.cs` |
| `Notifications` | `notifications` | `apps/api-dotnet/Data/Entities/Notification.cs` |
| `PropertyNfts` | `property_nfts` | `apps/api-dotnet/Data/Entities/PropertyNft.cs` |
| `OwnershipHistory` | `ownership_history` | `apps/api-dotnet/Data/Entities/PropertyNft.cs` |
| `PropertyDisputes` | `property_disputes` | `apps/api-dotnet/Data/Entities/PropertyDispute.cs` |
| `Offices` | `offices` | `apps/api-dotnet/Data/Entities/PropertyDispute.cs` |
| `SsiWallets` | `ssi_wallets` | `apps/api-dotnet/Data/Entities/SsiWallet.cs` |
| `SsiCredentials` | `ssi_credentials` | `apps/api-dotnet/Data/Entities/SsiWallet.cs` |
| `AuditLog` | `audit_log` | `apps/api-dotnet/Data/Entities/AuditLogEntry.cs` |

### 2.1 ما يُعرِّفه `OnModelCreating`

يُبقي المخطّط الفعلي في T-SQL، لكنّ `OnModelCreating` يُعرِّف ثلاثة أمور لا يستطيع EF استنتاجها بنفسه، وكلّها ضروريّة لعمل صحيح:

- **تسجيل المُحفّزات (`HasTrigger`)**: لكل جدول عليه مُحفّز، يُصرَّح به داخل `ToTable(…, t => t.HasTrigger("…"))`. هذا لا يُنشئ المُحفّز (المُحفّز موجود في الـ T-SQL)، بل يُخبِر EF Core 8 بوجوده لكي **يتوقّف عن توليد عبارة `OUTPUT … INTO`** عند `INSERT`/`UPDATE`؛ إذ يرفض SQL Server عبارة `OUTPUT` المباشرة على جدول ذي مُحفّز، فيتحوّل EF إلى `SELECT` تالٍ لجلب القيم المُولَّدة. المُحفّزات المُسجَّلة تشمل `tr_*_updated_at` لكل جدول، و`tr_properties_set_centroid`، ومُحفّزات المنع `tr_audit_log_no_update` / `tr_audit_log_no_delete` و`tr_ownership_history_no_update` / `tr_ownership_history_no_delete`.

- **العمود المحسوب `full_name_ar`**: يُعكَس ملفّ `003_citizens.sql` بـ:
```csharp
b.Entity<Citizen>().Property(x => x.FullNameAr).HasComputedColumnSql(
    "[first_name_ar] + N' ' + [father_name_ar] + N' ' + [grandfather_name_ar] + N' ' + [family_name_ar]",
    stored: true);
```
هذا يجعل نموذج EF مكتملاً؛ لكنّ العمود المحسوب المُخزَّن (`PERSISTED`) يظلّ مملوكاً للهجرة الخام.

- **دقّة الأرقام العشريّة**: تُعكَس دقّة `006_properties.sql` + `039_documented_area.sql`:

```csharp
b.Entity<Property>().Property(x => x.AreaSqm).HasPrecision(14, 2);
b.Entity<Property>().Property(x => x.DocumentedAreaSqm).HasPrecision(14, 2);
b.Entity<Property>().Property(x => x.LengthM).HasPrecision(10, 2); // + WidthM, DepthM
```

- **علاقة `OwnershipHistory → PropertyNft`**: تُعرَّف صراحةً كي لا يُعيد مُنظِّم الدفعات في EF ترتيب عبارات `INSERT` بحيث يُدرَج `ownership_history` قبل `property_nfts` ضمن نفس `SaveChanges` (وهو ما يكسر القيد `fk_oh_nft`):

```csharp
b.Entity<OwnershipHistory>()
    .HasOne<PropertyNft>().WithMany()
    .HasForeignKey(x => x.NftId)
    .OnDelete(DeleteBehavior.NoAction);
```

- **قراءة القيم المُولَّدة من القاعدة بدل كتابة `0001-01-01`**: للكيانات التي تعتمد `DEFAULT` + مُحفّز على `created_at`/`updated_at`، تُوسَم الخصائص لتُقرأ من القاعدة (تفادياً لخطأ دفن الصفوف بتاريخ `0001-01-01`):

```csharp
b.Entity<PropertyDispute>().Property(x => x.CreatedAt).ValueGeneratedOnAdd();
b.Entity<PropertyDispute>().Property(x => x.UpdatedAt).ValueGeneratedOnAddOrUpdate();
// وكذلك Office.CreatedAt/UpdatedAt و SsiWallet.CreatedAt
```

- **قيود التفرّد على SSI**: `SsiWallet` مفهرَس فريداً على `CitizenId` و`Did` (محفظة واحدة لكل مواطن)، و`SsiCredential` مفهرَس على `WalletId`.

---

## 3. الكيانات وحقولها

### 3.1 `Citizen` — `citizens`

الملف: `apps/api-dotnet/Data/Entities/Citizen.cs`. يُجسّد المواطن مع الاسم الرباعي والهويّة المدنيّة. أبرز الحقول:

| خاصيّة C# | عمود SQL | ملاحظات |
|---|---|---|
| `Id` | `id` | `Guid`، مفتاح أساسي |
| `FirstNameAr … FamilyNameAr` | `first_name_ar … family_name_ar` | الاسم الرباعي (إلزامي) |
| `FullNameAr` | `full_name_ar` | عمود محسوب مُخزَّن (concatenation) |
| `LegacyNationalNo` | `legacy_national_no` | الرقم الوطني الورقي القديم — قابل لـ null وفريد (شرط قابليّة إعادة إصدار الهويّة الرقميّة) |
| `Gender` | `gender` | `CHECK IN (male, female)` |
| `BirthDate` | `birth_date` | `DateTime` مقابل `DATE` |
| `AuthUserId` | `auth_user_id` | ربط بحساب المصادقة (قابل لـ null للمواطن) |
| `IsActive` | `is_active` | حذف ناعم |
| `CreatedAt`, `UpdatedAt` | `created_at`, `updated_at` | `DateTimeOffset` |

### 3.2 `Officer` — `officers`

الملف: `apps/api-dotnet/Data/Entities/Officer.cs`. يحتوي على `Role` (`CHECK IN (super_admin, registry_officer, id_issuer, auditor, reviewer, department_manager)` بعد الهجرة 028) و`Permissions` (عمود `permissions` كخريطة صلاحيّات JSON — يُفحَص التحقّق من الصلاحيّات عبرها لا عبر نصّ حرّ).

### 3.3 `AuthUser` — `auth_users`

الملف: `apps/api-dotnet/Data/Entities/AuthUser.cs`. حساب مصادقة محلّي بـ `EncryptedPassword` (bcrypt)، وحقل `OfficerId` (رابط عكسي للموظّف — قابل لـ null لحسابات المواطنين، أُضيف في الهجرة 042)، إضافةً إلى عمودَي بيانات-وصفيّة JSON: `raw_app_meta_data` و`raw_user_meta_data`.

### 3.4 `Property` — `properties` و`Region` — `regions`

الملف: `apps/api-dotnet/Data/Entities/Property.cs`. الكيان الأثقل، ويشمل: التعريف (`property_code` فريد، `parcel_number`, `plan_number`, `block_number`, `volume_number`, `page_number` للسجلّ العقاري الورقي القديم)، والمالك (`owner_citizen_id`)، والمساحات (`area_sqm`, `length_m/width_m/depth_m` كبيانات وصفيّة قابلة لـ null فقط، و`documented_area_sqm` مساحة الصكّ الورقي)، وسير العمل (`status` مع `submitted_at/reviewed_at/final_approved_at`…)، والصكّ الرقمي (`deed_pdf_path`, `deed_signed_hash`, `vc_credential_id`).

> ملاحظة مهمّة: كيان `Property` **لا يُصرِّح بعمودَي `location_point` و`boundary_polygon`** (نوعا `geography`)؛ فالتعامل مع الهندسة يجري عبر الدوال المُخزَّنة و`DemoDataService` (يُنظر §7)، لا عبر تتبّع EF المباشر.

كيان `Region` بسيط ومفتاحه `int` (`Id`, `Code`, `NameAr`, `NameEn`).

### 3.5 `DigitalIdCard`, `IdIssuanceHistory`, `NfcCardSecret` — بطاقات الهويّة

الملف: `apps/api-dotnet/Data/Entities/DigitalIdCard.cs`. البطاقة تحمل `NfcUid`, `LastNfcCounter` (العدّاد المتدحرج لمقاومة الاستنساخ)، `Did`/`DidDoc` (وثيقة DID كـ JSON)، `PinHash`/`PinSetAt`، وحالة (`status`, `RevokedAt`…). `NfcCardSecret` يخزّن مفاتيح NTAG 424 DNA مُغلَّفة (`byte[]` مقابل `VARBINARY`: `meta_read_key_enc/iv`, `sdm_file_read_key_enc/iv`) مع `WrapAlg` افتراضيّه `"AES-256-GCM"`.

### 3.6 `PropertyNft` و`OwnershipHistory` — الطبقة على السلسلة (on-chain)

الملف: `apps/api-dotnet/Data/Entities/PropertyNft.cs`. `PropertyNft` هو حلقة الوصل بين العقار وهويّته على السلسلة (`token_id`, `contract_address`, `network`, `standard` افتراضيّه `ERC-721`, `owner_did`, `mint_tx_hash`, `status`)؛ و`MintedByOfficerId` صار قابلاً لـ null منذ الهجرة 038 (سكّ يقوده مواطن بلا موظّف). `OwnershipHistory` سلسلة حيازة مُلحَقة-فقط (`from_did/to_did`, `reason` افتراضيّه `initial_mint`).

### 3.7 `PropertyDispute` و`Office`

الملف: `apps/api-dotnet/Data/Entities/PropertyDispute.cs`. `PropertyDispute` عبء قانوني على العقار (`dispute_type`, `status` افتراضيّه `active`) يمنع البيع والسكّ حتى يُرفَع؛ يستخدم `DateOnly` لحقلَي `start_date`/`end_date`. `Office` فرع تسجيل/إصدار بمفتاح `int` (الهجرة 040).

### 3.8 `SsiWallet` و`SsiCredential`

الملف: `apps/api-dotnet/Data/Entities/SsiWallet.cs`. محفظة SSI واحدة لكل مواطن (`did`, `public_key`, حقول تعدّديّة ACA-Py: `aca_py_wallet_id`, `aca_py_token`)، والاعتماد (`credential_type`: `DigitalId` أو `PropertyDeed`، و`payload` كـ JSON، و`state` افتراضيّه `pending`).

### 3.9 `Notification` — `notifications`

الملف: `apps/api-dotnet/Data/Entities/Notification.cs`. يحتوي `payload` (JSON)، و`sent_at` (يُقرأ افتراضه من القاعدة)، و`delivery_status` افتراضيّه `queued`.

### 3.10 `AuditLogEntry` — `audit_log`

الملف: `apps/api-dotnet/Data/Entities/AuditLogEntry.cs`. الكيان الوحيد بمفتاح `long` (مقابل `BIGINT IDENTITY`). يحمل `actor_kind`, `action`, `entity_table`, `entity_id`, وعمودَي حالة JSON `before_state`/`after_state`، إضافةً إلى `ip_address`/`user_agent`/`occurred_at`.

---

## 4. آليّة الإقلاع للهجرات (EF Migration Bootstrap)

هذا هو محور طبقة الاستمرارية. الفكرة: تُجعَل القاعدة قابلة للبناء بالإطار (framework-driven) على أي حاسوب فيه .NET 8 SDK وخادم SQL Server، **دون أي خطوة `sqlcmd` أو `.sql` يدويّة**، مع الإبقاء على الـ T-SQL المرقّم مصدراً مرجعيّاً.

### 4.1 المكوّنات الثلاثة

| المكوّن | الملف | الدور |
|---|---|---|
| سِجلّ الهجرات | `apps/api-dotnet/Migrations/SarhSchemaMigrations.cs` | 49 صنف `Migration` (000–048)، كلٌّ يربط `[Migration("…")]` بملف `.sql` واحد؛ يعمل كسِجلّ مُرتَّب رسميّ |
| مُشغّل الـ SQL للهجرات | `apps/api-dotnet/Migrations/SqlMigrationRunner.cs` | مُنفّذ مُشترَك يُحمِّل ملف `.sql` مُضمَّناً ويُقسِّمه على `GO` |
| مُقلِع القاعدة | `apps/api-dotnet/Data/EfDatabaseBootstrapper.cs` | يُطبّق الملفّات المُضمَّنة مباشرةً ويختم `__EFMigrationsHistory` |

### 4.2 سِجلّ الهجرات `SarhSchemaMigrations`

كل هجرة صنف `partial class` مُزيَّن بـ `[DbContext(typeof(SarhDbContext))]` و`[Migration("…")]`، ويستدعي `Up` المُشغّل، بينما `Down` **لا يفعل شيئاً** (الهجرات أُحاديّة الاتجاه؛ التراجع الهدّام يجري بـ `pnpm db:reset`):

```csharp
[DbContext(typeof(SarhDbContext))]
[Migration("20240101000002_002_lookup")]
public partial class M002_Lookup : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "002_lookup.sql");
    protected override void Down(MigrationBuilder b) { }
}
```

مُعرِّفات الهجرات تستعمل طابعاً زمنيّاً اصطناعيّاً مكوّناً من 14 رقماً (`yyyyMMddHHmmss`) لكي يُرتّبها EF ويحلّلها، واللاحقة هي اسم الملف الأصلي كي يبقى `dotnet ef migrations list` مقروءاً. السِجلّ الحالي يغطّي `000–048`.

### 4.3 لماذا لا `MigrateAsync`؟

كما يوضّح توثيق `EfDatabaseBootstrapper` و`SqlMigrationRunner`: كل ملف مرقّم هو T-SQL مرجعي يحتوي دفعات `GO` وعبارات لا يمكن تشغيلها داخل معاملة (`CREATE FULLTEXT CATALOG`, `CREATE/ALTER DATABASE`, `SET ALLOW_SNAPSHOT_ISOLATION`). آليّة مُهاجِر EF تغلّف الهجرات في معاملتها الخاصّة، وهذه لا تنجو من إعادة تشغيل نحو 45 دفعة خام (تُجهِض في المنتصف تاركةً مخطّطاً نصف مبني بلا سِجلّ). لذلك:

- في `SqlMigrationRunner.Apply` تُبعَث كل دفعة بـ `migrationBuilder.Sql(batch, suppressTransaction: true)`.
- في `EfDatabaseBootstrapper` تُنفَّذ الدفعات **مباشرةً** (autocommit، دفعة واحدة تلو الأخرى) عبر `SqlCommand`، محاكاةً لمسار `sqlcmd` المُثبَت، ثم يُختَم `__EFMigrationsHistory`. فالمُقلِع **لا يستدعي `Database.MigrateAsync`**، ومن ثمّ فإنّ `dotnet ef database update` ليست مسار التطبيق الفعلي.

### 4.4 معالجة الدفعات: تقسيم `GO` وتجريد العبارات على مستوى القاعدة

يشترك `SqlMigrationRunner` و`EfDatabaseBootstrapper` في ثلاثة تعابير نمطيّة (regex):

```csharp
GoSeparator            = @"^\s*GO\s*$"                 // فاصل الدفعات
UseStatement           = @"^\s*USE\s+\[[^\]]+\]\s*;?\s*$"   // سطر USE [db] مفرد
DatabaseScopedStatement = @"\b(CREATE|ALTER)\s+DATABASE\b"  // عبارات على مستوى القاعدة
```

عند كل ملف: تُقسَّم على `GO`؛ تُتجاوَز أي دفعة تُطابِق `CREATE/ALTER DATABASE` (لأنّ القاعدة مُهيّأة مسبقاً بترميز `Arabic_CI_AS`)؛ وتُنزَع أسطر `USE [<db>]` كي يبقى التطبيق على قاعدة الاتصال أيّاً كان اسمها؛ ثم تُنفَّذ الدفعة الباقية (`ExecAsync` بمهلة 180 ثانية).

### 4.5 تسلسل `EfDatabaseBootstrapper.RunAsync`

التوقيع:

```csharp
public static async Task RunAsync(
    string migrationConnectionString, ILogger logger,
    bool seedDemoViaMigrations = true, CancellationToken ct = default)
```

الخطوات بالترتيب:

1. **كائنات الخادم (`EnsureServerObjectsAsync`)**: عبر اتصال `master` يضمن وجود تسجيل الدخول `sarh_app` (من `bootstrap-login.sql` المُضمَّن) ووجود القاعدة بترميز `Arabic_CI_AS`:
```sql
IF DB_ID(N'{db}') IS NULL CREATE DATABASE [{db}] COLLATE Arabic_CI_AS;
```
هذا يمنع EF من إنشاء القاعدة لاحقاً بالترميز الافتراضي للخادم.
2. **جدول السِجلّ (`EnsureHistoryTableAsync`)**: يُنشئ `__EFMigrationsHistory` إن لم يكن موجوداً.
3. **خطّة الهجرات (`GetMigrationPlan`)**: تُشتَقّ من أصناف `[Migration]` عبر `db.Database.GetMigrations()`، مُرتَّبةً بـ `StringComparer.Ordinal`، ويُحوَّل كل مُعرِّف إلى اسم ملف بأخذ ما بعد أوّل `_` وإلحاق `.sql` (مثال: `"20240101000002_002_lookup"` → `"002_lookup.sql"`). فتبقى الخطّة متزامنةً مع `SarhSchemaMigrations.cs`.
4. **المطبَّق مقابل المعلَّق**: تُقرأ `__EFMigrationsHistory`، ويُحسَب المعلَّق. إن لم يوجد معلَّق، يُسجَّل أنّ القاعدة مُحدَّثة ويُرجَع.
5. **الأساس (Baseline)**: عبر `IsExistingLegacySchemaAsync` (وجود `auth_users` أو `citizens` مع سِجلّ فارغ) يُستدَلّ على قاعدة بُنِيت بمُشغِّل `sqlcmd` القديم. حينها **تُسجَّل كل الهجرات المعلَّقة كمطبَّقة** (عبر `InsertHistoryAsync`) **دون إعادة تشغيل** أي DDL فوق مخطّط قائم — وهذا مسار غير هدّام.
6. **التطبيق**: لكل هجرة معلَّقة، يُطبَّق ملفها بـ `ApplySqlFileAsync` ثم يُختَم بـ `InsertHistoryAsync` (بإصدار مُنتَج `"8.0.10"`).

يُنفَّذ هذا المسار عبر: التهيئة التلقائيّة عند الإقلاع (`Sarh:AutoMigrate`، مُفعَّل افتراضاً)، أو `dotnet run -- --migrate`، أو `pnpm db:migrate:ef` / `pnpm db:reset:ef`.

### 4.6 تخطّي بيانات التهيئة التجريبيّة عبر الهجرات

عندما يكون `seedDemoViaMigrations = false` (مفتاح `Sarh:SeedDemoViaMigrations`)، تُسجَّل ملفّات التهيئة التجريبيّة كمطبَّقة **دون تشغيل عبارات `INSERT`** فيها، فتخرج القاعدة فارغة ليُغذّيها `DbSeeder` أو زرّ "تحميل البيانات التجريبيّة" من صفحة الهبوط. المجموعة المُستثناة مُعرَّفة في `DemoSeedFiles`:

```
024_seed_demo.sql, 026_seed_demo_officer.sql, 029_seed_mock_data.sql,
033_seed_card_pins.sql, 034_seed_expanded_demo.sql, 044_seed_map_demo.sql
```

ملاحظة صريحة في الشيفرة: `016_seed_regions` **ليس** ضمنها لأنّ المناطق بيانات مرجعيّة يحتاجها التطبيق للعمل.

### 4.7 اتصال الهجرات المُميَّز `MigrationConnection`

الملف: `apps/api-dotnet/Data/MigrationConnection.cs`. سِلسلة اتصال الهجرات **متمايزة عمداً** عن اتصال التشغيل: التطبيق يتّصل وقت التشغيل بـ `sarh_app` (صلاحيّة منخفضة لا تستطيع DDL)، بينما تحتاج الهجرات اتصالاً مُميَّزاً (مصادقة Windows، نظير `sqlcmd -E`). ترتيب الحلّ في `Resolve(IConfiguration)`:

1. `Sarh:MigrationConnectionString` (إعداد) أو `SARH_MIGRATION_CONNECTION` (بيئة) — لبيئات الإنتاج.
2. وإلّا اشتقاق اتصال Windows-auth من `Sarh:ConnectionString` بضبط `IntegratedSecurity = true` ونزع `User ID`/`Password` — مسار التطوير بلا إعداد.
3. الاحتياط الأخير: `Server=localhost;Database=sarh;Trusted_Connection=True;…`.

### 4.8 مصنع وقت التصميم `SarhDbContextFactory`

الملف: `apps/api-dotnet/Data/SarhDbContextFactory.cs`. يُنفّذ `IDesignTimeDbContextFactory<SarhDbContext>` لأدوات CLI (`dotnet ef …`). يبني الإعداد كما يفعل `Program` (appsettings + بيئة + جسر `SARH_*`/`MSSQL_*` عبر `EnvBootstrap.ApplyEnvOverrides`)، ثم يحلّ الاتصال المُميَّز عبر `MigrationConnection.Resolve` بمهلة أمر 180 ثانية.

---

## 5. معالجة أعمدة JSON

على مستوى قاعدة البيانات، كل عمود JSON من نوع `NVARCHAR(MAX)` محميّ بقيد `CHECK (ISJSON(col) = 1)` (مثال في `005_officers.sql`: `CONSTRAINT ck_officers_permissions_json CHECK (ISJSON(permissions) = 1)`، وفي `011_audit.sql` لعمودَي `before_state`/`after_state`). على مستوى نموذج EF، تُربَط هذه الأعمدة كخصائص **`string`/`string?` خام** (لا يوجد أي Value Converter لها في `OnModelCreating`)، فتنتقل السلسلة كما هي، ويجري التحليل (parse) والتسليسل (stringify) عند حدود طبقة الخدمة عبر `System.Text.Json`.

الأعمدة المعروفة بأنّها JSON وموقعها في الكيانات:

| عمود SQL | الكيان / الخاصيّة |
|---|---|
| `permissions` | `Officer.Permissions` |
| `did_doc` | `DigitalIdCard.DidDoc` |
| `payload` | `Notification.Payload` و`SsiCredential.Payload` |
| `before_state`, `after_state` | `AuditLogEntry.BeforeState`, `AuditLogEntry.AfterState` |
| `raw_app_meta_data`, `raw_user_meta_data` | `AuthUser.RawAppMetaData`, `AuthUser.RawUserMetaData` |

مثال على الكتابة كسلسلة JSON خام عند حدّ الخدمة (`apps/api-dotnet/Audit/AuditService.cs`) حيث تُمرَّر السلاسل مباشرةً كوسائط `NVARCHAR`:

```csharp
cmd.Parameters.Add(new SqlParameter("@before_state", SqlDbType.NVarChar, -1)
    { Value = (object?)entry.BeforeStateJson ?? DBNull.Value });
cmd.Parameters.Add(new SqlParameter("@after_state", SqlDbType.NVarChar, -1)
    { Value = (object?)entry.AfterStateJson ?? DBNull.Value });
```

وفي `apps/api-dotnet/Officers/OfficersService.cs` تُخزَّن خريطة الصلاحيّات كسلسلة JSON (`Permissions = req.Permissions ?? "{}"`).

---

## 6. استخدام `geography` في SQL Server

يعتمد جدول `properties` (يُنظر `006_properties.sql`) نوع `geography` (SRID 4326 ضمنيّاً) لعمودَي `location_point` و`boundary_polygon`. بما أنّ SQL Server **لا يفهرِس `geography` مباشرةً**، تُبنى فهارس مكانيّة `USING GEOGRAPHY_AUTO_GRID`، ويُحتفَظ بنسخة WKT ثابتة الدقّة `location_point_wkt NVARCHAR(40)` من أجل الفهرس الفريد المُصفّى المانع للازدواج:

```sql
CREATE UNIQUE INDEX ux_properties_unique_approved_point
    ON properties(location_point_wkt)
    WHERE status = N'approved' AND location_point_wkt IS NOT NULL;
```

يُجسِّد هذا قيد "لا يجوز لعقارَين مُعتمَدَين أن يتشاركا المركز (centroid) نفسه". أمّا حساب المساحة والمركز فيجري عبر دوال مُخزَّنة في `019_properties_helpers.sql`:

- `dbo.validate_property_submission(@p_polygon geography, @p_area_sqm)`: يحسب `@p_polygon.STArea()` (تُعيد المتر المربّع مباشرةً على الكرويّ)، ونسبة الفرق عن المساحة المُصرَّح بها، ووجود مركز مُطابِق لعقار مُعتمَد عبر `EnvelopeCenter()` و`STEquals()`.
- المُحفّز `tr_properties_set_centroid` (`AFTER INSERT, UPDATE`): يملأ `location_point` من `boundary_polygon.EnvelopeCenter()` عند غيابه، ويُحدِّث `location_point_wkt` من `.Long`/`.Lat` مُقرَّبَين.
- `dbo.properties_nearby`: بحث الجوار الأقرب عبر `STDistance()`.
- `dbo.fn_geojson_polygon_to_wkt`: مُحوِّل GeoJSON→WKT (لعدم وجود مُحلِّل GeoJSON مُدمَج).

بما أنّ كيان `Property` لا يُصرِّح بأعمدة `geography`، فإنّ التعامل معها من C# يجري عبر هذه الدوال المُخزَّنة، وعبر `DemoDataService` الذي يُدوِّرها كنصّ WKT (يُنظر §7).

---

## 7. المُهيّئات والبيانات التجريبيّة

### 7.1 `DbSeeder`

الملف: `apps/api-dotnet/Data/DbSeeder.cs`. خدمة مُستضافة (`IHostedService`) تُشغَّل عند الإقلاع في مهمّة خلفيّة. تنتظر الاتصال (`WaitForDatabaseAsync`: خمس محاولات بفاصل ثانيتَين)، ثم — إن كان `Sarh:AutoSeedDemo` مُفعَّلاً (افتراضه مُفعَّل في التطوير، مُعطَّل غير ذلك) — تستدعي `DemoDataService.ImportFromFileAsync` لاستيراد `Data/DemoData/seed-data.json` بشكل غير هدّام (idempotent: `IF NOT EXISTS` حسب `id`).

### 7.2 `DemoDataService` و`DemoDataset`

الملفّان: `apps/api-dotnet/Data/DemoData/DemoDataService.cs` و`apps/api-dotnet/Data/DemoData/DemoDataset.cs`. خدمة تصدير/استيراد/تفريغ مدفوعة بالمخطّط (schema-driven): تستبطن أعمدة كل جدول عبر `sys.columns` (متجاوزةً الأعمدة المحسوبة `is_computed`)، فتلتقط كل عمود آليّاً وتصمد أمام هجرات تُضيف أعمدة. أبرز خصائصها:

- **ترتيب FK**: الإدراج يتبع `Order` ثابتاً (`auth_users → citizens → officers → digital_id_cards → properties → property_nfts → notifications`)، والتفريغ يعكسه.
- **الهندسة كـ WKT**: عند التصدير `[{col}].STAsText()`، وعند الاستيراد `geography::STGeomFromText(@p, 4326)`.
- **FK دائري**: `auth_users.officer_id ⇄ officers.auth_user_id` يُدرَج بـ `officer_id = NULL` ثم يُضبَط في تمريرة تصحيح بعد وجود الموظّفين.
- **حفظ حساب المدير**: `AdminAuthUserId`/`AdminOfficerId` مُستثنَيان من التفريغ دائماً.
- **تفريغ آمن على FK**: يُبنى الحارس (guard) من مخطّط FK الحيّ (`GetReferencingFksAsync`)، فلا يُحذَف صفّ إلّا إن لم يعُد أي صفّ يُشير إليه؛ وجدولا `ownership_history` و`audit_log` (مُلحَقان-فقط) مُستثنَيان صراحةً من الحذف.
- تحويل الأنواع بين JSON و`SqlParameter` عبر `MapDbType`/`Coerce`.

يُستخدَم هذا كلّه من واجهة `/api/v1/demo-data` (load/reset/truncate/export).

---

## 8. تفاعُل السجلّ المُلحَق-فقط والمُحفّزات مع EF

القيد #6 في CLAUDE.md: السجلّ مُلحَق-فقط، لا `UPDATE` ولا `DELETE`. يُفرَض هذا على طبقتَين:

**طبقة القاعدة (`011_audit.sql` و`028_…sql`)**: بما أنّ SQL Server لا يملك مُحفّزات `BEFORE`، تُستخدَم مُحفّزات `INSTEAD OF` التي تُلغي العمليّة برمي خطأ ولا تُنفِّذ DML الداخلي:

```sql
CREATE OR ALTER TRIGGER tr_audit_log_no_update ON audit_log
INSTEAD OF UPDATE AS
BEGIN
    THROW 51001, N'audit_log is append-only — UPDATE blocked', 1;
END
```

ونظيراه على `ownership_history` (`tr_ownership_history_no_update`/`no_delete`).

**طبقة EF**: هذه المُحفّزات مُسجَّلة في `OnModelCreating` عبر `HasTrigger` لجدولَي `audit_log` و`ownership_history`. سبب التسجيل ليس إنشاء المُحفّز، بل منع EF من توليد عبارة `OUTPUT` التي تتعارض مع وجود مُحفّز على الجدول. لذلك — ولأنّ `audit_log` مفتاحه `BIGINT IDENTITY` وسلوكه مُلحَق-فقط — تُكتَب سجلّات التدقيق في الغالب عبر SQL خام مُتحكَّم به في `AuditService` (يُنظر §5) لا عبر `SaveChanges` العادي.

---

## 9. أمن مستوى الصفوف واعتراضيّة سياق الجلسة

### 9.1 سياسات RLS

الملف: `infra/mssql/migrations/015_rls.sql`. يُبقي RLS نشِطاً حاليّاً على جدول واحد عالي الخطورة فقط: `audit_log`. كانت `015_rls.sql` قد أنشأت أيضاً سياسة `digital_id_cards` باسم `sec_did_cards`، لكن ترحيل `032_drop_did_cards_rls` (المُسجَّل باسم `M032_DropDidCardsRls`) أسقطها لاحقاً، فصارت رؤية البطاقة تُفرَض في طبقة C# عبر `DigitalIdCardsService` لا عبر مُسنِد RLS. المُسنِد الفاعل يقرأ `SESSION_CONTEXT`:

- `fn_audit_log_predicate`: يكشف صفوف السجلّ فقط حين يكون `SESSION_CONTEXT('officer_role')` من فئة `auditor`/`super_admin`، أو حين تُضبَط `audit_bypass` (التي يضبطها التطبيق لحظة الكتابة من مُعترِضه).
- `fn_did_cards_predicate`: كان يكشف البطاقة لصاحبها فقط عبر `SESSION_CONTEXT('citizen_id')` (أو لأي موظّف)، غير أنّ سياسته `sec_did_cards` أُسقِطت بترحيل `032_drop_did_cards_rls`، فلم يعُد فاعلاً (رؤية البطاقة تُفرَض الآن في C#).

### 9.2 `SessionContextInterceptor`

الملف: `apps/api-dotnet/Data/SessionContextInterceptor.cs`. مُعترِض `DbConnectionInterceptor` يضبط `SESSION_CONTEXT` **عند كل فتح اتصال** انطلاقاً من هويّة الطلب الحالي، وهو ما يجعل سياسات RLS تعمل فعليّاً تحت حزمة .NET. يُنفِّذ:

```csharp
EXEC sys.sp_set_session_context @key = N'officer_role', @value = @role;
EXEC sys.sp_set_session_context @key = N'citizen_id',   @value = @citizen;
```

يقرأ المطالبتَين `sarh_role` و`citizen_id` من `HttpContext.User`؛ ومن ليس مواطناً بسيطاً يُعامَل كموظّف في سياق الجلسة (والمُسنِد يقرّر أي دور يقرأ). الأهمّ: تُضبَط المفاتيح على **كل** فتح (إلى `NULL` عند الغُفليّة) كي لا يُسرِّب اتصال مُجمَّع (pooled) خدَم `super_admin` سابقاً رؤيتَه إلى طلب لاحق غفل/مواطن. يُطبَّق المُعترِض في نسختَيه المتزامنة (`ConnectionOpened`) وغير المتزامنة (`ConnectionOpenedAsync`).
