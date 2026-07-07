# مرجع واجهات API — البطاقات و NFC و SSI والبلوكتشين وواجهات النظام

هذا الفصل يوثّق مجموعة واجهات API الخاصة بإصدار الهوية الرقمية، وترميز شرائح NFC والتحقق منها، وبطاقات الائتمان اللامركزية (SSI/VC)، وسكّ رخص الملكية على البلوكتشين (NFT)، إضافةً إلى واجهات النظام (سجل التدقيق، البيانات التجريبية، الفحص الصحي). كل ما يرد أدناه مُستخرَج حرفياً من الشيفرة المصدرية في `apps/api-dotnet/`، وقد جرى توثيق ما هو موجود فقط.

جميع المسارات تحت البادئة `/api/v1/`. سياسة تسلسل JSON العامة تُحوِّل خصائص C# من PascalCase إلى `snake_case` (كما هو موثّق في `apps/api-dotnet/Ssi/SsiDtos.cs`)، لذا تظهر الحقول في أمثلة الطلب/الاستجابة بصيغة `snake_case`. غلاف الأخطاء الموحّد هو:

```json
{ "error": { "code": "ERR_X", "message_ar": "...", "message_en": "..." } }
```

التحكم بالوصول يمرّ عبر السمة `[OfficerOnly(...)]` (خريطة الصلاحيات على `officers.permissions`) وليس عبر فحص أدوار نصّي، وكل مسار كتابة يُسجَّل في `audit_log` عبر السمة `[Audit(...)]`.

---

## 1. بطاقات الهوية الرقمية — DigitalIdCardsController

الملف: `apps/api-dotnet/Controllers/DigitalIdCardsController.cs` — البادئة `api/v1/digital-id-cards`، والمتحكّم كامله محميّ بـ `[Authorize]`.

| Verb & Path | الطريقة | الصلاحيات (`[OfficerOnly]`) | Audit Action | الوصف |
|---|---|---|---|---|
| `GET /digital-id-cards` | `List` | أي مستخدم مُصادَق | — | ترقيم بالمؤشر عبر `IssuedAt`. المواطن يرى بطاقته فقط؛ الموظّف يرى ما يستعلم عنه |
| `POST /digital-id-cards/issue` | `Issue` | `id_issuer`, `super_admin` | `IssueId` | إصدار بطاقة جديدة + توليد مفاتيح NFC + PIN + إصدار VC |
| `POST /digital-id-cards/{id}/freeze` | `Freeze` | `id_issuer`, `super_admin`, `registry_officer` | `Update` | تجميد مؤقّت |
| `POST /digital-id-cards/{id}/revoke` | `Revoke` | `id_issuer`, `super_admin` | `RevokeId` | إلغاء نهائي |
| `POST /digital-id-cards/{id}/reissue` | `Reissue` | `id_issuer`, `super_admin` | `IssueId` | إلغاء القديمة + سكّ بطاقة بديلة برقم جديد |
| `POST /digital-id-cards/{id}/reset-pin` | `ResetPin` | `id_issuer`, `super_admin` | `Update` | إعادة تعيين رمز PIN |
| `PATCH /digital-id-cards/{id}` | `Update` | `id_issuer`, `super_admin` | `Update` | تعديل نافذة الصلاحية و/أو تصحيح بيانات الهوية |
| `DELETE /digital-id-cards/{id}` | `Delete` | `super_admin` | `Delete` | حذف مادّي كامل (Hard delete) |

المنطق كلّه في `apps/api-dotnet/DigitalIdCards/DigitalIdCardsService.cs` وملفاته الجزئية (`.Pin.cs`, `.Update.cs`, `.Delete.cs`). لاحظ أن جميع مسارات إصدار PIN تضبط علم `CaptureResponseBody = false` في السمة `[Audit]` كي لا تتسرّب المفاتيح/الـPIN إلى السجل الملحق-فقط.

### 1.1 الإصدار — `POST /issue`

جسم الطلب `IssueCardDto` (`apps/api-dotnet/DigitalIdCards/DigitalIdDtos.cs`):

| الحقل | النوع | إلزامي | ملاحظات |
|---|---|---|---|
| `citizen_id` | `Guid` | نعم | يجب أن يكون المواطن نشطاً (`is_active`) |
| `region_code` | `string` | نعم | رمز الشعبية (2–4 أرقام) |
| `year` | `int?` | لا | 2024–2100؛ الافتراضي السنة الحالية |
| `validity_years` | `int?` | لا | 1–20؛ الافتراضي 5 سنوات |
| `photo_bucket` / `photo_path` / `photo_sha256` | `string?` | لا | مصدر بصمة الصورة (`photo_hash`) |

التوقيع:

```csharp
public async Task<IssueCardResult> IssueAsync(IssueCardDto dto, CurrentUser actor, CancellationToken ct)
```

سلوك مُتحقَّق منه في الشيفرة:
- يُرفَض الإصدار إن كان للمواطن بطاقة `active` قائمة (`409` مع رسالة توجّه لاستخدام `/reissue`).
- يُولَّد `digital_id_number` عبر `DigitalIdNumberService.NextAsync` بصيغة `LY-RR-YYYY-SSSSSS-C` مع رقم تحقّق Luhn حقيقي يُعاد احتسابه فوق ناتج دالة SQL `dbo.generate_digital_id` (انظر `apps/api-dotnet/DigitalIdCards/DigitalIdNumberService.cs`).
- `card_serial` = `"LY-" + 12 بايت عشوائية Hex`.
- `data_hash` يُحسَب عبر `IdentityHash.Compute` (§1.6).
- تُسكّ مفاتيح NFC عبر `NfcKeyStoreService.MintForCardAsync` وتُعاد **مرّة واحدة** فقط.
- يُضاف صفّ إلى `id_issuance_history` بالإجراء `"issued"`.
- تُصدَر شهادة DigitalId VC داخل محفظة SSI للمواطن (`IssueDigitalIdVcAsync`) — بأفضل جهد؛ فشل SSI يسقط إلى `did:placeholder:LY:<guid>` ولا يُفشل الإصدار.
- يُخطَر المواطن (مع SMS) بعنوان «تم إصدار بطاقة الهوية الرقمية».

مثال طلب:

```json
POST /api/v1/digital-id-cards/issue
{
  "citizen_id": "8f2c...",
  "region_code": "12",
  "validity_years": 5,
  "photo_path": "id-photos/8f2c/front.jpg",
  "photo_sha256": "3b1f...64hex"
}
```

الاستجابة `IssueCardResult`:

```json
{
  "card": {
    "id": "d41...",
    "citizen_id": "8f2c...",
    "digital_id_number": "LY-12-2026-000042-7",
    "card_serial": "LY-9F3A1C...",
    "nfc_uid": null,
    "nfc_signature_key_id": "local:v1",
    "did": "did:sov:LY:a1b2c3d4e5f60718",
    "issued_at": "2026-07-01T09:00:00.000+00:00",
    "issued_by_officer_id": "0aa...",
    "expires_at": "2031-07-01T09:00:00.000+00:00",
    "status": "active",
    "photo_hash": "…",
    "data_hash": "…",
    "last_nfc_counter": 0,
    "created_at": "…",
    "updated_at": "…"
  },
  "nfc_keys": {
    "meta_read_key_hex": "0123…32hex-bytes",
    "sdm_file_read_key_hex": "ABCD…32hex-bytes",
    "kms_key_id": "local:v1"
  },
  "sun_url_template": "https://verify.sarh.ly/v?p={picc}&c={cmac}",
  "pin": "042318"
}
```

الحقول `pin` و`nfc_keys` تُعرَض لمرّة واحدة على موظّف الإصدار لتسليمها للمواطن وكتابتها على الشريحة؛ لا يُخزَّن سوى `bcrypt(pin)` والمفاتيح المُغلَّفة.

### 1.2 إعادة الإصدار — `POST /{id}/reissue`

جسم `ReissueCardDto`: `reason` (إلزامي، ≤500)، و`keep_digital_id_number` (اختياري). يُلغى القديم (`revoked`) بلا إشعار «إلغاء» (كي لا يُربك المواطن)، ثم تُسكّ بطاقة جديدة بمفاتيح ووَسم `"re-issued"` في `id_issuance_history`، ورقم رقمي جديد افتراضياً لأن `digital_id_number` فريد على مستوى قاعدة البيانات. الاستجابة من نوع `IssueCardResult` نفسه (بـ PIN جديد).

نقطة دقيقة مُتحقَّق منها (`IssueDigitalIdVcAsync`): بما أن SSI DID للمواطن ثابت لكن العمود `digital_id_cards.did` فريد (`ux_did_cards_did`)، يُحرَّر الـDID من أي بطاقة سابقة قبل حفظه على البطاقة الحالية:

```sql
UPDATE digital_id_cards SET did = NULL WHERE citizen_id = {0} AND id <> {1} AND did = {2}
```

### 1.3 التجميد / الإلغاء — `POST /{id}/freeze` و `POST /{id}/revoke`

كلاهما يمرّ عبر `TransitionAsync`. القيود المُتحقَّقة:
- بطاقة `revoked` لا تقبل أي انتقال (`409`).
- لا يمكن تجميد بطاقة `frozen` مسبقاً (`409`).
- عند الإلغاء تُضبط `revoked_at` و`revoked_reason`.
- يُضاف صفّ في `id_issuance_history`، ويُخطَر المواطن؛ الإلغاء حدث أمني حرج فيُرسَل معه SMS.

الجسم `FreezeCardDto` / `RevokeCardDto`: حقل واحد `reason` (إلزامي، ≤500).

### 1.4 التعديل — `PATCH /{id}`

الملف: `apps/api-dotnet/DigitalIdCards/DigitalIdCardsService.Update.cs`. جسم `UpdateCardDto`:

| الحقل | النوع | ملاحظات |
|---|---|---|
| `expires_at` | `DateTimeOffset?` | نافذة صلاحية مطلقة |
| `validity_years` | `int?` (1–20) | بديل: `issued_at + N` |
| `reason` | `string?` (≤500) | — |
| `first_name_ar` / `father_name_ar` / `grandfather_name_ar` / `family_name_ar` | `string?` (≤100) | تصحيح اسم |
| `birth_date` | `DateOnly?` | تصحيح تاريخ ميلاد |

نوعان من التغيير مسموحان فقط: (1) نافذة الصلاحية (`expires_at` لا تغذّي أي تجزئة، فتتحرّك بحرّية)؛ (2) تصحيحات الهوية المدنية التي تعيش على سجلّ المواطن وتُعيد اشتقاق `data_hash` **لكل بطاقة حيّة** يملكها المواطن (`ApplyIdentityEditsAsync`). القيود المُتحقَّقة: التعديل مسموح فقط والبطاقة `active`؛ يجب أن يُنتج تغيير حقيقي وإلا `400`؛ `expires_at` يجب أن يكون مستقبلاً وبعد `issued_at`. `digital_id_number` و`card_serial` والمفاتيح تبقى ثابتة. تُسجَّل الأفعال `"updated"` / `"identity-updated"` في `id_issuance_history`.

### 1.5 دورة حياة رمز PIN — `POST /{id}/reset-pin`

الملف: `apps/api-dotnet/DigitalIdCards/DigitalIdCardsService.Pin.cs`. المصدر الوحيد لتعيين PIN هو `AssignNewPin` المُستخدَم في الإصدار وإعادة الإصدار وإعادة التعيين:

```csharp
internal static string AssignNewPin(DigitalIdCard card)
{
    var pin = GenerateNumericPin(6);                       // 6 أرقام عشوائية (RandomNumberGenerator)
    card.PinHash = BCrypt.Net.BCrypt.HashPassword(pin, 10); // تخزين bcrypt فقط (work=10)
    card.PinSetAt = DateTimeOffset.UtcNow;
    return pin;                                            // النصّ الصريح يُعاد مرّة واحدة
}
```

`ResetPinAsync` يرفض إعادة التعيين لبطاقة `revoked` أو `expired` (`400`)، ويُخطِر المواطن (مع SMS) بأن الرمز أُعيد تعيينه — **دون** وضع الرمز في نص الرسالة (إشارة احتيال). الاستجابة `ResetPinResult`:

```json
{ "card_id": "d41...", "pin": "915042", "set_at": "2026-07-01T10:00:00.000+00:00" }
```

الأهمية التشغيلية (مُتحقَّق منها): بطاقة حديثة الإصدار بلا PIN يبقى `PinHash` فيها `null` ويفشل تسجيل الدخول بالـ PIN من تطبيق الجوال — لذلك يُسند PIN فور الإصدار وإعادة الإصدار.

### 1.6 بصمة الهوية — `IdentityHash`

الملف: `apps/api-dotnet/DigitalIdCards/IdentityHash.cs`. تُنتِج `digital_id_cards.data_hash` كـ SHA-256 فوق إسقاط قانوني مفصول بـ `|` بترتيب ثابت (لا يُعاد ترتيبه؛ تُضاف الحقول في الذيل فقط):

```
digitalIdNumber | citizen.Id("N") | FirstNameAr | FatherNameAr |
GrandfatherNameAr | FamilyNameAr | BirthDate(yyyy-MM-dd) | Gender | LegacyNationalNo
```

### 1.7 الحذف المادّي — `DELETE /{id}`

الملف: `apps/api-dotnet/DigitalIdCards/DigitalIdCardsService.Delete.cs`. `super_admin` فقط. حذف مادّي داخل معاملة واحدة: (1) `DELETE FROM id_issuance_history` (مفتاح خارجي غير متتالٍ يجب مسحه أولاً)؛ (2) `DELETE FROM nfc_card_secrets` (متتالٍ، لكن يُحذف صراحةً لإحصاء الصفوف)؛ (3) حذف صفّ البطاقة. الجسم اختياري (`DeleteCardDto.reason`). يبقى الحذف مُسجَّلاً في `audit_log`. الاستجابة `DeleteCardResult`:

```json
{ "card_id": "d41...", "digital_id_number": "LY-12-2026-000042-7",
  "citizen_id": "8f2c...", "deleted": true, "nfc_secrets_purged": 1 }
```

---

## 2. شرائح NFC — NfcController والقيد رقم 4

الملف: `apps/api-dotnet/Controllers/NfcController.cs` — البادئة `api/v1/nfc`.

| Verb & Path | الطريقة | الوصول | Audit | الوصف |
|---|---|---|---|---|
| `POST /nfc/encode` | `Encode` | `[Authorize]` + `[OfficerOnly("id_issuer","super_admin")]` | `Update` على `digital_id_cards` | ردّ نداء بعد كتابة المفاتيح والـURL على الشريحة؛ يربط UID بالبطاقة |
| `POST /nfc/verify` | `Verify` | `[AllowAnonymous]` | — | تحقّق عام من نقرة SUN (تحديد المعدّل عند البوّابة) |

المنطق في `apps/api-dotnet/Nfc/NfcService.cs`. هذا القسم يحقّق القيد غير القابل للتفاوض رقم 4 في `CLAUDE.md`: مقاومة الاستنساخ عبر **NTAG 424 DNA** ورسالة **SUN** بعدّاد متدحرج يُتحقَّق منه على الخادم — لا يكفي UID الثابت.

### 2.1 الترميز — `POST /nfc/encode`

جسم `EncodeCardDto` (`apps/api-dotnet/Nfc/NfcDtos.cs`):

| الحقل | النوع | تحقّق |
|---|---|---|
| `card_id` | `Guid` | إلزامي |
| `nfc_uid` | `string` | نمط `^[0-9a-fA-F]{14}$` (7 بايت) |

`RecordEncodedAsync` يرفض ربط البطاقة بـ UID مختلف عن المسجَّل مسبقاً (`409`)، ويصفّر `last_nfc_counter`، ويلتقط تعارض تفرّد UID (`409`). الاستجابة `EncodeCardResult`:

```json
{ "ok": true, "card": { "id": "d41...", "citizen_id": "8f2c...", "nfc_uid": "04A1B2C3D4E5F6", "status": "active" } }
```

### 2.2 التحقّق — `POST /nfc/verify`

جسم `VerifySunDto`: إمّا `url` كاملة، أو زوج `p` (PICC data) + `c` (CMAC). التوقيع:

```csharp
public async Task<VerifySunResult> VerifyTapAsync(VerifySunDto dto, CancellationToken ct)
```

خوارزمية SUN كما هي في `apps/api-dotnet/Nfc/SunMessage.cs` (مرجع NXP AN12196 §11، ومتطابقة بايت-ببايت مع نسخة NestJS القديمة):

1. **فك تعمية PICC**: 16 بايت تُفكّ بـ `MetaReadKey` عبر AES-128-CBC، `IV=0`، بلا حشو. يجب أن يكون البايت الأول الوسم `0xC7` (`PiccDataTagUidAndCounter`)، وإلا `bad_picc_tag`.
2. **استخراج UID والعدّاد**: `uid` = 7 بايت (الإزاحة 1)، و`counter` = 3 بايت Little-Endian من `plaintext[8..10]`.
3. **اشتقاق مفتاح جلسة CMAC**: `SV2 = 3C C3 00 01 00 80 (6) || UID(7) || Counter(3 LE)` (= 16 بايت)، ثم `AES-CMAC(SdmFileReadKey, SV2)`.
4. **حساب CMAC**: `AES-CMAC(sessionKey, ∅)` على مدخل فارغ، ثم أخذ CMAC القصير (8 بايت من البايتات فردية الفهرس `fullCmac[i*2+1]`)، ومقارنته بمقاومة توقيت ثابتة `CryptographicOperations.FixedTimeEquals` مع `c` المُقدَّم؛ الاختلاف → `cmac_mismatch`.

`AesCmac` (RFC 4493، AES-128، `Rb=0x87`) مُنفَّذ يدوياً في `apps/api-dotnet/Nfc/AesCmac.cs`.

**التحقّق من العدّاد المتدحرج (جوهر القيد 4)**، من `VerifyTapAsync`:
- المرشّحون: بطاقات `active` أو `frozen` فقط. مسار O(1) عند تمرير UID في الـURL؛ وإلا مسح بالقوّة الغاشمة للشرائح القديمة بلا `SDMUIDOffset`.
- أي فشل تشفيري يُلتقَط ويُتجاوَز المرشّح؛ عند نفاد المرشّحين تُرمى `401` عامّة كي لا يتسرّب أي فحص فشل.
- بعد نجاح التشفير: `revoked` → `403` «البطاقة ملغاة»، `frozen` → `403` «البطاقة مجمّدة»، منتهية الصلاحية → `403`.
- الحماية من إعادة التشغيل: `if (decoded.Counter <= candidate.LastNfcCounter) → 401`، ثم تحديث شبه-ذرّي:

```sql
UPDATE digital_id_cards
SET last_nfc_counter = {counter}, last_nfc_tap_at = SYSDATETIMEOFFSET()
WHERE id = {candidateId} AND last_nfc_counter < {counter};
```

إن كان عدد الصفوف المتأثّرة `0` (سبقنا طلبٌ متزامن) → `401`.

الاستجابة `VerifySunResult`:

```json
{
  "card_id": "d41...",
  "digital_id_number": "LY-12-2026-000042-7",
  "status": "active",
  "counter": 17,
  "citizen": { "id": "8f2c...", "full_name_ar": "محمد أحمد جدّه العائلة",
               "photo_path": "id-photos/…", "region_id": 12 }
}
```

### 2.3 خزينة المفاتيح — `NfcKeyStoreService`

الملف: `apps/api-dotnet/Nfc/NfcKeyStoreService.cs`. لكل بطاقة مفتاحان (`MetaReadKey` و`SdmFileReadKey`، 16 بايت لكلٍّ)، يُغلَّفان عند التخزين بـ **AES-256-GCM** باستخدام `KMS_MASTER_KEY` (32 بايت Hex من الإعدادات/البيئة، مُتحقَّق من طوله ونمطه عند الإقلاع)، ويُخزَّنان في `nfc_card_secrets`. ثابتان: `LocalKmsKeyId = "local:v1"` و`WrapAlg = "AES-256-GCM"` (طول IV = 12، طول Tag = 16). `MintForCardAsync` يُعيد المفاتيح صريحةً مرّة واحدة ويَسِم البطاقة بـ `nfc_signature_key_id`؛ `LoadForCardAsync` يفكّ التغليف عند التحقّق ويرفض أي `wrap_alg`/`kms_key_id` غير مدعوم.

قالب الرابط (`DigitalIdCardsService.SunUrlTemplate`): `{Sarh:NfcSunBaseUrl | NFC_SUN_BASE_URL | https://verify.sarh.ly/v}?p={picc}&c={cmac}`.

---

## 3. الهوية اللامركزية والشهادات القابلة للتحقّق — SSI / VC

الطبقة معرّفة عبر الواجهة `ISsiService` (`apps/api-dotnet/Ssi/ISsiService.cs`) ولها تنفيذان يُنتجان الأشكال نفسها فلا يتفرّع المتصل على الوضع:

| التنفيذ | الملف | `IsLive` | الوصف |
|---|---|---|---|
| `AcaPySsiService` | `apps/api-dotnet/Ssi/AcaPySsiService.cs` | `true` | وكيل Hyperledger Aries (ACA-Py) بمحافظ فرعية متعدّدة المستأجرين، وبروتوكول `issue-credential-2.0`، وطريقة `did:sov` |
| `PlaceholderSsiService` | `apps/api-dotnet/Ssi/PlaceholderSsiService.cs` | `false` | مُصدِر حتمي داخل العملية (الافتراضي في dev/CI)، DID مشتقّ من معرّف المواطن، الحالة `issued` |

المنطق المشترك (المحافظ، الحفظ، منع التكرار، الإلغاء، القوائم) في `apps/api-dotnet/Ssi/SsiServiceBase.cs`. الإعدادات في `apps/api-dotnet/Ssi/SsiOptions.cs` (المقطع `Sarh:Ssi`، الأوضاع `auto`/`acapy`/`placeholder`، `DidMethod` الافتراضي `sov`). عميل الوكيل الصمود-مرن في `apps/api-dotnet/Ssi/AcaPyClient.cs` (يعيد `null` عند أي فشل نقل/غير-2xx).

### 3.1 نقطة النهاية العامّة لقراءة المحفظة

لا يوجد متحكّم SSI مخصّص؛ إصدار الشهادات يجري داخلياً كأثر جانبي لإصدار البطاقة (§1.1) والموافقة على العقار. الواجهة الوحيدة المكشوفة للقراءة موجودة في `apps/api-dotnet/Controllers/MeController.cs` (البادئة `api/v1/me`، `[Authorize]`):

| Verb & Path | الطريقة | المصدر | الوصف |
|---|---|---|---|
| `GET /me/credentials` | `MyCredentials` | `ISsiService.ListMineAsync` | شهادات المواطن في محفظته (DigitalId + أي PropertyDeed) |
| `GET /me/nft-licences` | `MyLicences` | `NftsService.ListMyAsync` | رخص NFT التي يملكها المواطن (§4.6) |

`ListMineAsync` يُرجِع قائمة `SsiCredentialView` (`apps/api-dotnet/Ssi/SsiDtos.cs`) بحقول `id`, `credential_type`, `schema_id`, `cred_def_id`, `payload` (JSON), `state`, `issued_at`, `expires_at`, `revoked_at` — مطابقة 1:1 لنموذج `VerifiableCredential` في Flutter.

مثال استجابة:

```json
[
  {
    "id": "b7e...",
    "credential_type": "DigitalId",
    "schema_id": "did:sov:LY:placeholder:2:DigitalIdSchema:1.0",
    "cred_def_id": "did:sov:LY:placeholder:3:CL:sarh-digital-id-v1",
    "payload": {
      "full_name": "محمد أحمد جدّه العائلة",
      "dob": "1990-05-01",
      "digital_id_number": "LY-12-2026-000042-7",
      "photo_hash": "…"
    },
    "state": "issued",
    "issued_at": "2026-07-01T09:00:00.000+00:00",
    "expires_at": "2031-07-01T09:00:00.000+00:00",
    "revoked_at": null
  }
]
```

### 3.2 بناء الشهادات وإصدارها

`apps/api-dotnet/Ssi/SsiCredentialBuilder.cs` (دوال نقية):
- `DeriveLocalDid(citizenId)` = `did:{method}:LY:{آخر 16 خانة hex من معرّف المواطن}` — يستخدم الذيل لأن UUIDs بيانات العرض تبدأ كلّها بـ `00000000-…`، ويتوافق مع `LicenseService.OwnerDidFor` فيتطابق DID الشهادة وDID الـNFT.
- سمات `DigitalId` VC: `full_name`, `dob`, `digital_id_number`, `photo_hash`.
- سمات `PropertyDeed` VC: `property_code`, `owner_did`, `type`, `area_sqm`, `polygon_hash` (SHA-256 لحدود GeoJSON — المرساة المقاومة للعبث التي تربط الشهادة بشكل القطعة تحديداً).

الإصدار في `SsiServiceBase.IssueInternalAsync` **حتمي التكرار (idempotent)**: شهادة حيّة بنفس المفتاح المنطقي (`digital_id_number` / `property_code`) تُعاد كما هي؛ وأي فشل للوكيل يُسجِّل الشهادة بحالة `offline` (في الوضع الحيّ) أو `issued` (placeholder) دون أن يُفشل التدفّق. `RevokeAsync` يضبط `revoked_at`/`revoked_reason`/`state="revoked"` (ويستدعي الوكيل في وضع ACA-Py).

`AcaPyClient` يترجم ذلك إلى نداءات: `POST /multitenancy/wallet` (محفظة فرعية `askar` مُدارة)، `POST /wallet/did/create` (طريقة من `DidMethod`، `ed25519`)، `POST /issue-credential-2.0/create` (`auto_issue=true`)، و`POST /revocation/revoke`. مفتاح الإدارة `x-api-key` على كل طلب، ورمز المحفظة الفرعية `Bearer` على نداءاتها.

---

## 4. البلوكتشين ورخص NFT

### 4.1 تشخيص الشبكة — BlockchainController

الملف: `apps/api-dotnet/Controllers/BlockchainController.cs` — البادئة `api/v1/blockchain`، `[Authorize]`.

| Verb & Path | الطريقة | الصلاحيات | الوصف |
|---|---|---|---|
| `GET /blockchain/status` | `Status` | `super_admin`, `auditor`, `registry_officer`, `reviewer`, `department_manager` | لقطة صحّة الشبكة المُهيّأة (مستقلّة عن أي NFT) |

يُنفَّذ عبر `IBlockchainService.GetStatusAsync` (`apps/api-dotnet/Blockchain/IBlockchainService.cs`) الذي **لا يرمي أبداً** — الأعطال تُوضَع في `ChainStatus.Error` كي تعرض الواجهة شريطاً أحمر بدل `500`. للطبقة تنفيذان: `StubBlockchainService` (حتمي، الافتراضي في dev) و`EthereumBlockchainService` (Nethereum الحقيقي)، وكلاهما يُنتج شكل `MintReceipt` ذاته. الإعدادات في `apps/api-dotnet/Blockchain/BlockchainOptions.cs` (المقطع `Sarh:Blockchain`؛ `Mode` = `stub`/`ethereum`؛ `Network` الافتراضي `ethereum-sepolia`؛ `CanSign` صحيح فقط عند وجود عقد + مفتاح توقيع).

استجابة `ChainStatus`:

```json
{
  "mode": "stub",
  "network": "ethereum-sepolia",
  "standard": "ERC-721",
  "contract_address": "0x…",
  "contract_configured": true,
  "can_sign": false,
  "connected": true,
  "chain_id": 11155111,
  "latest_block": 6123456,
  "gas_price_gwei": "1.20",
  "rpc_host": "sepolia.infura.io",
  "error": null
}
```

مفهوم أساسي مُتحقَّق منه (`IsSimulatedMint`): الرخصة «مُحاكاة» إذا تعذّر التوقيع، أو لا عقد حقيقي مُهيّأ، أو سُكّت على عقد مختلف عن العقد الحالي — فحص **لكل NFT** كي تبقى الروابط الميتة مخفيّة حتى بعد التحوّل لسلسلة حقيقية.

### 4.2 رخص NFT — NftsController

الملف: `apps/api-dotnet/Controllers/NftsController.cs` — البادئة `api/v1/property-nfts`، `[Authorize]`.

| Verb & Path | الطريقة | الصلاحيات | Audit | الوصف |
|---|---|---|---|---|
| `GET /property-nfts` | `List` | `super_admin`, `auditor`, `registry_officer`, `reviewer`, `department_manager` | — | سجلّ الرخص (ترقيم بالمؤشر) مع تحجيم إقليمي |
| `GET /property-nfts/{id}` | `Get` | نفس المجموعة | — | رخصة واحدة |
| `GET /property-nfts/{id}/history` | `History` | نفس المجموعة | — | خطّ زمني للملكية (`ownership_history`) |
| `GET /property-nfts/{id}/chain-check` | `ChainCheck` | نفس المجموعة | — | تحقّق حيّ على السلسلة (قراءة فقط) |
| `POST /property-nfts/{id}/transfer` | `Transfer` | `super_admin`, `department_manager`, `registry_officer` | `Update` على `property_nfts` | إعادة إسناد الملكية لمواطن آخر |

القراءة في `apps/api-dotnet/Workflow/NftsService.cs`، والنقل في `apps/api-dotnet/Workflow/TransferService.cs`. لا يوجد مسار سكّ (mint) في هذا المتحكّم — السكّ مسؤولية `LicenseService` ضمن تدفّق الموافقة على العقار.

### 4.3 قائمة الرخص — `GET /property-nfts`

مُعاملات `ListNftsQuery`: `cursor`, `limit` (1–100، افتراضي 20)، `status`, `network`, `property_id`, `owner_did`. غير الـ`super_admin`/`auditor` يُحجَّمون إقليمياً (`p.RegionId == actor.RegionId`). عناصر الاستجابة من نوع `NftLicenseView`:

```json
{
  "id": "c9a...",
  "property_id": "77b...",
  "token_id": "10423",
  "contract_address": "0x…",
  "network": "ethereum-sepolia",
  "standard": "ERC-721",
  "owner_did": "did:sov:LY:a1b2c3d4e5f60718",
  "owner_address": "0x…",
  "metadata_uri": "ipfs://…",
  "metadata_sha256": "…",
  "mint_tx_hash": "0x…",
  "mint_block_number": 6120001,
  "minted_by_officer_id": "0aa...",
  "minted_at": "2026-06-20T12:00:00.000+00:00",
  "status": "minted",
  "property_code": "P-12-000042",
  "owner_citizen_id": "8f2c...",
  "simulated": true
}
```

### 4.4 التحقّق على السلسلة — `GET /property-nfts/{id}/chain-check`

يجمع صحّة RPC مع قراءات على مستوى الرمز (`ownerOf` + إيصال معاملة السكّ) دون أي تعديل للحالة. في وضع stub تكون حقول RPC اصطناعية و`token_exists_on_chain` تساوي `false`. النموذج `ChainCheckResult` (`apps/api-dotnet/Workflow/ChainCheckResult.cs`) يتضمّن، إضافةً لحقول الشبكة/العقد: `token_id`, `recorded_owner_address`, `on_chain_owner`, `token_exists_on_chain`, `owner_matches`, `mint_tx_hash`, `tx_found`, `tx_block_number`, `tx_succeeded`, `explorer_tx_url`, `explorer_token_url`, `metadata_uri`, `checked_at`.

### 4.5 نقل الملكية — `POST /property-nfts/{id}/transfer`

جسم `TransferNftDto` (`apps/api-dotnet/Workflow/TransferService.cs`):

| الحقل | النوع | ملاحظات |
|---|---|---|
| `to_citizen_id` | `Guid` | إلزامي |
| `reason` | `string` | إلزامي؛ ضمن `{sale, inheritance, gift, court_order, correction}`؛ يُرفض `initial_mint` |
| `notes_ar` | `string?` | إلزامي عندما يكون السبب `court_order` أو `correction` |

القيود المُتحقَّقة: الأدوار `{super_admin, department_manager, registry_officer}`؛ حالة الرخصة قابلة للنقل `{minted, transferred}`؛ تحجيم إقليمي؛ **منع النقل على قطعة مثقلة** عبر `disputes.AssertNoActiveDisputeAsync`؛ المستلِم نشط وليس المالك الحالي. التسلسل: (1) نداء السلسلة `chain.TransferAsync`؛ (2) كتابة ثلاث جداول في `SaveChanges` واحد (`property_nfts` → `status="transferred"`؛ صفّ جديد في `ownership_history`؛ `properties.owner_citizen_id`/`status`)؛ (3) إخطار الطرفين (بأفضل جهد). عند نجاح السلسلة وفشل SQL يُسجَّل خطأ يستدعي مطابقة يدوية. الاستجابة `TransferResult` تحوي `nft`, `property`, `event`, `explorer_tx_url`.

### 4.6 خطّ الملكية ورخصي — `GET /property-nfts/{id}/history` و `GET /me/nft-licences`

`ListHistoryAsync` يُرجِع `OwnershipEventView[]` (الأقدم أولاً) مع ربط خارجي للمواطنين كي تصمد الصفوف حتى بعد حذفهم ناعماً: `id`, `from_did`, `to_did`, `from_citizen_name`, `to_citizen_name`, `reason`, `notes_ar`, `transfer_tx_hash`, `transfer_block_number`, `transferred_at`. أمّا `ListMyAsync` (المكشوف عبر `/me/nft-licences`) فيصفّي على المالك المُسجَّل في السجل (`properties.owner_citizen_id`) لا المالك على السلسلة، وللحالات `{minted, transferred, pending}`.

---

## 5. سجل التدقيق — AuditController

الملف: `apps/api-dotnet/Controllers/AuditController.cs` — البادئة `api/v1/audit`، محميّ بـ `[Authorize]` و`[OfficerOnly("super_admin","auditor")]` على مستوى المتحكّم. القراءة فقط (السجل ملحق-فقط بموجب القيد 6).

| Verb & Path | الطريقة | الوصف |
|---|---|---|
| `GET /audit` | `List` | قائمة مصفّاة بترقيم تنازلي عبر `before_id` |
| `GET /audit/stats` | `Stats` | تجميعة للوحة (إجماليات + توزيعات) |
| `GET /audit/{id}` | `Get` | صفّ تفصيلي بما فيه `before_state`/`after_state` |

### 5.1 القائمة — `GET /audit`

مُعاملات الاستعلام: `action`, `entity_table`, `actor_kind`, `q`, `limit` (1–200، افتراضي 50 عند تجاوز النطاق)، `before_id`. الترتيب `OrderByDescending(Id)` ويُجلب `limit+1` لكشف وجود المزيد. اسم الفاعل يُحلّ عبر استعلامات فرعية مترابطة على `Officers`/`Citizens` حسب `actor_kind` (وقد يكون `null` للنظام أو لصفّ محذوف مادّياً). البحث `q` يطابق `entity_table`/`action`/`ip_address` **واسم الفاعل** (موظّف أو مواطن).

استجابة `AuditListResponse` (عناصر `AuditRow`):

```json
{
  "items": [
    {
      "id": 90231,
      "actor_kind": "officer",
      "actor_id": "0aa...",
      "actor_name": "سالم قسم الإصدار",
      "action": "issue_id",
      "entity_table": "digital_id_cards",
      "entity_id": "d41...",
      "ip_address": "10.0.0.5",
      "occurred_at": "2026-07-01T09:00:00.000+00:00"
    }
  ],
  "next_before_id": 90230
}
```

### 5.2 الإحصاءات — `GET /audit/stats`

`AuditStats`: `total`, `last24h`, `last7d`, `latest_id`، إضافةً إلى `by_action` و`by_entity` (كلٌّ قائمة `AuditBreakdown { key, count }` مرتّبة تنازلياً بالعدد).

### 5.3 التفصيل — `GET /audit/{id}`

`AuditDetailRow` يرث حقول `AuditRow` ويضيف `before_state`, `after_state`, `user_agent`. يُعيد `404` إن لم يوجد الصفّ.

---

## 6. البيانات التجريبية — DemoDataController

الملف: `apps/api-dotnet/Controllers/DemoDataController.cs` — البادئة `api/v1/demo-data`، `[Authorize]` مع استثناءات صريحة.

| Verb & Path | الطريقة | الوصول | Audit | الوصف |
|---|---|---|---|---|
| `GET /demo-data/status` | `Status` | `[AllowAnonymous]` | — | يقود ظهور زرّ «تحميل البيانات» في صفحة الهبوط |
| `POST /demo-data/load` | `Load` | `[AllowAnonymous]` | `Create` (بلا جسم طلب) | تحميل يعمل فقط والقاعدة فارغة (تشغيل أوّل) |
| `GET /demo-data/export` | `Export` | `super_admin` | — | إعادة توليد ملف البذور من الحالة الحيّة |
| `POST /demo-data/truncate` | `Truncate` | `super_admin` | `Delete` | مسح المجموعة التجريبية (المدير محفوظ) |
| `POST /demo-data/reset` | `Reset` | `super_admin` | `Update` | مسح ثم إعادة استيراد |

المنطق في `DemoDataService` (فضاء `Sarh.Api.Data.DemoData`). `Status` يُرجِع:

```json
{ "empty": true, "seed_file_available": true, "can_load": true,
  "counts": { "citizens": 0, "properties": 0 } }
```

`Load` حارس عدم-تشغيل: إن لم تكن القاعدة فارغة يرمي `409` («تحتوي القاعدة على بيانات بالفعل»)، وإن غاب ملف البذور يرمي `404`. عند النجاح يُرجِع `{ "loaded": true, "inserted": {...}, "total": N }`. `Truncate`/`Reset` يُرجعان تعدادات المحذوف/المُدرَج.

---

## 7. الفحص الصحّي — HealthController

الملف: `apps/api-dotnet/Controllers/HealthController.cs` — البادئة `api/v1/health`، بلا مصادقة.

| Verb & Path | الطريقة | الوصف |
|---|---|---|
| `GET /health` | `Get` | فحص حيوية بسيط |

الاستجابة:

```json
{ "status": "ok", "service": "sarh-api-dotnet", "timestamp": "2026-07-01T09:00:00.000+00:00" }
```

---

## 8. خلاصة الثوابت الأمنية المُتحقَّق منها في الشيفرة

- **القيد 4 (مقاومة الاستنساخ)**: NTAG 424 DNA + رسالة SUN بعدّاد متدحرج يُتحقَّق منه خادمياً عبر `SunMessage.Verify` وتحديث ذرّي مشروط بـ `last_nfc_counter < counter` (§2.2). لا اعتماد على UID الثابت وحده.
- **دورة PIN**: توليد 6 أرقام، تخزين `bcrypt` فقط، عرض النصّ مرّة واحدة، إسناد عند الإصدار/إعادة الإصدار/إعادة التعيين، ورفض إعادة التعيين لبطاقة ملغاة/منتهية (§1.5). لا يتسرّب PIN/مفاتيح إلى `audit_log` (`CaptureResponseBody=false`).
- **SSI/VC**: `did:sov` عبر ACA-Py أو المُصدِر الحتمي البديل، إصدار حتمي التكرار وأفضل-جهد لا يُفشل التدفّق، وقراءة عبر `GET /me/credentials` (§3).
- **البلوكتشين/NFT**: طبقة مجرّدة stub/real، تشخيص عبر `GET /blockchain/status`، تحقّق حيّ لكل رخصة عبر `chain-check`، ونقل ملكية ذرّي (DB) مع علم `simulated` لكل NFT (§4).
- **سجل التدقيق ملحق-فقط**: `AuditController` للقراءة فقط، مقصور على `super_admin`/`auditor` (§5).

الملفات المرجعية الرئيسية: `apps/api-dotnet/Controllers/{DigitalIdCardsController,NfcController,NftsController,BlockchainController,AuditController,DemoDataController,HealthController,MeController}.cs`، و`apps/api-dotnet/DigitalIdCards/*`، و`apps/api-dotnet/Nfc/*`، و`apps/api-dotnet/Ssi/*`، و`apps/api-dotnet/Blockchain/*`، و`apps/api-dotnet/Workflow/{NftsService,TransferService,ChainCheckResult}.cs`.
