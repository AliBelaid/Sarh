# فئات الواجهة الخلفية وخدماتها — الجزء الثاني (وحدات الهوية الرقمية السيادية، البلوكتشين، سير العمل، الإشعارات، النزاعات، التدقيق، الخرائط، والمشتركات)

يوثّق هذا الفصل الطبقة الخدمية الخلفية لمنصة «صَرح» في ثماني وحدات مجالية: `Ssi/` (الهوية السيادية والاعتمادات القابلة للتحقق)، `Blockchain/` (سكّ رخص NFT العقارية على السلسلة)، `Workflow/` (آلة حالة المراجعة والاعتماد والنقل)، `Notifications/` (تسليم الإشعارات والرسائل النصية)، `Disputes/` (الحجوزات والأعباء القانونية)، `Audit/` (سجل التدقيق غير القابل للتعديل)، `Map/` (تغذية GeoJSON للخرائط)، و`Common/` (المساعِدات المشتركة). تُستثنى من هذا الفصل ملفات توقيع السند الثلاثة `DeedPdfBuilder.cs` و`DeedSigningService.cs` و`DeedSignature.cs` (يغطّيها فصل التوقيع المخصّص)، ويُكتفى هنا بالإشارة إليها عند الارتباط المتبادل.

جميع الخدمات تتبع أنماطاً متكرّرة: **تسليم أفضل-جهد** (best-effort) بحيث لا يُسقِط عطلٌ في خدمة خارجية (وكيل SSI، عقدة RPC، بوابة SMS) مسارَ الاعتماد أو الإصدار؛ **الحياد بين الوضعين** (placeholder/stub مقابل الحيّ) عبر واجهات مشتركة تُنتج نفس الأشكال حتى لا يتفرّع المُستدعي على النمط؛ و**الحوكمة الإقليمية** (region scope) الموحّدة عبر خدمات سير العمل.

---

## 1. وحدة الهوية السيادية `Ssi/`

توفّر إصدار الاعتمادات القابلة للتحقق (Verifiable Credentials) وإدارة محافظ DID للمواطنين. تقف خلف الواجهة `ISsiService` نسختان تُنتجان نفس الأشكال: `AcaPySsiService` (وكيل Hyperledger Aries حيّ) و`PlaceholderSsiService` (مُصدِر حتمي داخل-العملية للتطوير).

### 1.1 الواجهة `ISsiService`

`apps/api-dotnet/Ssi/ISsiService.cs`

الغرض: السطح الذي تعتمد عليه بقية المنصة لإصدار اعتمادات الهوية الرقمية وسند الملكية. جميع دوال الإصدار أفضل-جهد ومتكافئة الاستدعاء (idempotent): الاستدعاء الثاني لنفس البطاقة/العقار يُعيد الاعتماد القائم بدل التكرار، وعطلٌ عابر في الوكيل لا يُلقى إلى مسار الإصدار/الاعتماد.

| العضو | التوقيع | الوصف |
|---|---|---|
| `IsLive` | `bool IsLive { get; }` | صحيح عندما يكون المُصدِر وكيل ACA-Py حيّاً لا بديلاً حتمياً. |
| `EnsureWalletAsync` | `Task<SsiWalletInfo> EnsureWalletAsync(Guid citizenId, CancellationToken ct)` | يُعيد محفظة المواطن، منشئاً إياها عند أول استخدام. |
| `IssueDigitalIdVcAsync` | `Task<SsiCredentialInfo?> IssueDigitalIdVcAsync(Guid cardId, CancellationToken ct)` | يُصدر اعتماد `DigitalId` لبطاقة نشطة؛ `null` فقط إن انتفى وجود البطاقة أو صاحبها. |
| `IssuePropertyDeedVcAsync` | `Task<SsiCredentialInfo?> IssuePropertyDeedVcAsync(Guid propertyId, CancellationToken ct)` | يُصدر اعتماد `PropertyDeed` لعقار معتمد؛ `null` فقط إن انتفى وجود العقار أو مالكه. |
| `RevokeAsync` | `Task<bool> RevokeAsync(Guid credentialId, string reason, CancellationToken ct)` | يُبطل اعتماداً بمعرّف صفّه؛ `false` إن لم يوجد. |
| `ListMineAsync` | `Task<List<SsiCredentialView>> ListMineAsync(CurrentUser actor, CancellationToken ct)` | يسرد اعتمادات المواطن المُصادَق عليه لواجهة المحفظة. |

### 1.2 نماذج نقل البيانات `SsiDtos`

`apps/api-dotnet/Ssi/SsiDtos.cs`

| الصنف | الحقول الرئيسية | الغرض |
|---|---|---|
| `SsiWalletInfo` | `Id`, `CitizenId`, `Did`, `PublicKey`, `IsLive` | ناتج `EnsureWalletAsync`؛ يزوّد المُستدعي بـ `owner_did` لحمولة اعتماد سند الملكية. |
| `SsiCredentialInfo` | `Id`, `CredentialId` (الـ urn المخزّن)، `CredentialType`, `Did`, `SchemaId?`, `CredDefId?`, `State`, `IsPlaceholder` | ناتج دوال الإصدار؛ يسمح للمُستدعي بختم معرّف الاعتماد/DID على صفّه (مثل `card.did`، `property.vc_credential_id`) بلا إعادة استعلام. |
| `SsiCredentialView` | `Id`, `CredentialType`, `SchemaId?`, `CredDefId?`, `Payload` (JsonElement)، `State`, `IssuedAt`, `ExpiresAt?`, `RevokedAt?` | نموذج قراءة موجّه للمحفظة؛ يُطابق snake_case نموذج Flutter `VerifiableCredential` واحداً لواحد. |

### 1.3 الإعدادات `SsiOptions`

`apps/api-dotnet/Ssi/SsiOptions.cs` — مربوطة بالقسم `Sarh:Ssi`.

| المفتاح | الافتراضي | الوصف |
|---|---|---|
| `Mode` | `"auto"` | `auto` = ACA-Py عند ضبط `AdminUrl` وإلا البديل؛ `acapy` = فرض الوكيل الحيّ (يتراجع بلطف عند الفشل)؛ `placeholder` = فرض المُصدِر الحتمي. |
| `AdminUrl` / `AdminApiKey` | `""` | قاعدة واجهة إدارة ACA-Py؛ فارغة ⇐ البديل. |
| `DidMethod` | `"sov"` | طريقة DID المضمّنة في DIDs البديلة والمطلوبة من الوكيل. |
| `DigitalIdSchemaId` / `DigitalIdCredDefId` / `PropertyDeedSchemaId` / `PropertyDeedCredDefId` | `""` | معرّفات المخطط/تعريف الاعتماد التي يُنتجها `bootstrap-schemas.ts`؛ اختيارية (يُصنّع البديل بدائل مستقرّة). |
| `UseAcaPy` (مشتقّة) | — | `true` عند `Mode=acapy`، أو `Mode=auto` مع `AdminUrl` غير فارغ. |

### 1.4 القاعدة المجرّدة `SsiServiceBase`

`apps/api-dotnet/Ssi/SsiServiceBase.cs`

الغرض: تجميع منطق الحفظ والتكافؤ (idempotency) والإبطال والسرد المشترك بين النسختين. تتباعد النسختان فقط عند الخطّافين المجرّدين، أما بقية المنطق (صفوف قاعدة البيانات، منع التكرار، الإبطال، السرد) فمُوحّد هنا.

الأنواع الداخلية:
- `record WalletProvision(string Did, string PublicKey, string? EncryptedSeed, string? AgentEndpoint, string? AcaPyWalletId, string? AcaPyToken)` — كيفية تجسيد المحفظة.
- `record AgentIssue(string State, string? CredExId, string? RevocationRegId, string? SchemaId, string? CredDefId)` — رؤية الوكيل لاعتماد مُصدَر.

| العضو | التوقيع | المنطق الرئيسي |
|---|---|---|
| `IsLive` | `abstract bool IsLive { get; }` | تُنفّذها النسختان. |
| `Options` | `protected abstract SsiOptions Options { get; }` | إعدادات النسخة. |
| `ProvisionWalletAsync` | `protected abstract Task<WalletProvision> ProvisionWalletAsync(Citizen citizen, CancellationToken ct)` | خطّاف تجهيز المحفظة. |
| `IssueOnAgentAsync` | `protected abstract Task<AgentIssue?> IssueOnAgentAsync(SsiWallet wallet, string credentialType, IReadOnlyDictionary<string,string> attributes, CancellationToken ct)` | خطّاف الإصدار على الوكيل. |
| `EnsureWalletAsync` | `Task<SsiWalletInfo> EnsureWalletAsync(Guid citizenId, CancellationToken ct)` | يستدعي `GetOrCreateWalletAsync` ويحوّله إلى `SsiWalletInfo`؛ `IsLive` مشتقّ من وجود `AcaPyWalletId`. |
| `GetOrCreateWalletAsync` | `protected Task<SsiWallet> GetOrCreateWalletAsync(Guid citizenId, CancellationToken ct)` | يُعيد المحفظة القائمة أو يُنشئها؛ يعالج التزامن بالتقاط `DbUpdateException` عند انتهاك القيد الفريد (`2627`/`2601`) ويُعيد تحميل الفائز. |
| `IssueDigitalIdVcAsync` | `Task<SsiCredentialInfo?> IssueDigitalIdVcAsync(Guid cardId, …)` | يحمّل البطاقة والمواطن، يبني السمات عبر `SsiCredentialBuilder.DigitalIdAttributes`، ثم `IssueInternalAsync` بمفتاح منطقي `digital_id_number`. |
| `IssuePropertyDeedVcAsync` | `Task<SsiCredentialInfo?> IssuePropertyDeedVcAsync(Guid propertyId, …)` | يحمّل العقار والمالك ومضلّع الحدود (GeoJSON عبر SP)، يبني السمات، ثم `IssueInternalAsync` بمفتاح منطقي `property_code`. |
| `RevokeAsync` | `Task<bool> RevokeAsync(Guid credentialId, string reason, …)` | إن كان مُبطلاً مسبقاً يُعيد `true`؛ يستدعي `RevokeOnAgentAsync` ثم يختم `RevokedAt`/`RevokedReason`/`State="revoked"`. |
| `RevokeOnAgentAsync` | `protected virtual Task RevokeOnAgentAsync(SsiCredential cred, …)` | افتراضياً لا شيء (البديل)؛ تتجاوزه ACA-Py. |
| `ListMineAsync` | `Task<List<SsiCredentialView>> ListMineAsync(CurrentUser actor, …)` | يسرد اعتمادات محفظة المواطن مرتّبة تنازلياً بـ `IssuedAt`. |

منطق `IssueInternalAsync` (خاص): يبحث أولاً عن اعتماد حيّ من نفس النوع يحمل نفس المفتاح المنطقي (مطابقة حقل الحمولة عبر `PayloadFieldEquals`) ويُعيده كما هو عند وجوده؛ وإلا يستدعي `IssueOnAgentAsync` داخل `try/catch` (فشل الوكيل يُسجَّل تحذيراً فقط)، ثم يُدرِج صفّ `SsiCredential` بحالة `agent?.State ?? (IsLive ? "offline" : "issued")`. يُبنى `CredentialId` بالنمط `urn:sarh:vc:{type}:{id}`، و`IsPlaceholder` يُشتقّ من خلوّ `CredExId`.

### 1.5 المُصدِر البديل `PlaceholderSsiService`

`apps/api-dotnet/Ssi/PlaceholderSsiService.cs`

مُصدِر حتمي داخل-العملية عند غياب وكيل ACA-Py (الافتراضي في التطوير و CI). `IsLive => false`. تُشتقّ المحافظ من معرّف المواطن (`DeriveLocalDid`/`DeriveLocalVerkey`) فينحلّ المواطن نفسه دائماً إلى نفس DID لثبات بيانات العرض عبر `pnpm db:reset`. `AcaPyWalletId=null` يُعلِّم المحفظة كبديلة.

- `IssueOnAgentAsync` يُصنّع بدائل مخطط/تعريف اعتماد مستقرّة (`Fallback`/`FallbackCredDef` بنمط `did:{method}:LY:placeholder:2:{name}:{version}`) ويُعلِّم الاعتماد `issued` مع `CredExId=null` (⇐ `IsPlaceholder=true`).

### 1.6 مُصدِر ACA-Py الحيّ `AcaPySsiService`

`apps/api-dotnet/Ssi/AcaPySsiService.cs`

مُصدِر حقيقي على وكيل Hyperledger Aries. المحافظ محافظ فرعية متعدّدة المستأجرين، والاعتمادات تُصدَر عبر بروتوكول `issue-credential-2.0`. كل نداء أفضل-جهد: عند تعذّر الوصول، يتراجع تجهيز المحفظة إلى DID محلّي حتمي وتُسجَّل الاعتمادات بحالة `offline`. `IsLive => true`.

| العضو | المنطق |
|---|---|
| `ProvisionWalletAsync` | يُنشئ محفظة فرعية باسم `sarh-citizen-{id:N}` ومفتاح عشوائي 16 بايت؛ عند فشل الإنشاء ⇒ `LocalFallback`؛ ثم `CreateDidAsync`؛ عند فشل الـ DID يحتفظ بربط المحفظة الفرعية مع DID محلّي. |
| `IssueOnAgentAsync` | يختار `credDefId` حسب النوع؛ إن غاب أو خلا رمز المحفظة يُعيد `null` (تسجيل offline)؛ وإلا `CreateCredentialOfferAsync` ويُعيد `AgentIssue`. |
| `RevokeOnAgentAsync` | إن وُجد `CredExId` ورمز المحفظة يستدعي `RevokeCredentialAsync`. |
| `LocalFallback` (ساكن خاص) | يبني `WalletProvision` بـ DID/verkey محلّيين. |

### 1.7 عميل الوكيل `AcaPyClient`

`apps/api-dotnet/Ssi/AcaPyClient.cs`

غلاف رفيع صامد فوق واجهة إدارة ACA-Py. كل دالة تُعيد `null`/`false` عند أي خطأ نقل أو استجابة غير 2xx بعد التسجيل، فتتراجع المُستدعِيات بلطف. يُرفَق مفتاح الإدارة (`x-api-key`) بكل طلب، وتُضيف نداءات المحافظ الفرعية رمز الحامل (Bearer).

| الدالة | التوقيع | المسار |
|---|---|---|
| `PingAsync` | `Task<bool> PingAsync(CancellationToken ct)` | `GET /status` |
| `CreateSubWalletAsync` | `Task<SubWallet?> CreateSubWalletAsync(string walletName, string walletKey, string label, …)` | `POST /multitenancy/wallet` (نوع `askar`, إدارة `managed`) |
| `CreateDidAsync` | `Task<AgentDid?> CreateDidAsync(string token, …)` | `POST /wallet/did/create` (`key_type=ed25519`) |
| `CreateCredentialOfferAsync` | `Task<CredExchange?> CreateCredentialOfferAsync(string token, string credDefId, IReadOnlyDictionary<string,string> attributes, …)` | `POST /issue-credential-2.0/create` (`auto_issue=true`) |
| `RevokeCredentialAsync` | `Task<bool> RevokeCredentialAsync(string token, string credExId, string? comment, …)` | `POST /revocation/revoke` (`publish=true`) |

النقل المشترك `SendAsync` يقتطع القاعدة، يُرفق المفاتيح، ويعالج الأخطاء بالتسجيل تحذيراً وإرجاع `null`. سجلّات فرعية: `record SubWallet(string WalletId, string Token)`، `record AgentDid(string Did, string Verkey)`، `record CredExchange(string CredExId, string State)`.

### 1.8 بنّاء الاعتمادات `SsiCredentialBuilder`

`apps/api-dotnet/Ssi/SsiCredentialBuilder.cs` — مساعِدات نقيّة بلا آثار جانبية، مشتركة بين النسختين.

| الدالة | التوقيع | المنطق |
|---|---|---|
| `DeriveLocalDid` | `static string DeriveLocalDid(Guid citizenId, string didMethod = "sov")` | DID محلّي حتمي بالنمط `did:{method}:LY:{hex[^16..]}` — يستخدم **لاحقة** المعرّف السداسي حتى لا تنهار UUIDs العرض (تبدأ كلها بـ `00000000-…`) على نفس DID؛ يُطابق صيغة `LicenseService.OwnerDidFor`. |
| `DeriveLocalVerkey` | `static string DeriveLocalVerkey(Guid citizenId)` | مفتاح عام مزيّف مستقر = SHA-256 لسلسلة `sarh-ssi-verkey:{id:N}`. |
| `DigitalIdAttributes` | `static Dictionary<string,string> DigitalIdAttributes(Citizen citizen, string digitalIdNumber, string? photoHash)` | سمات `DigitalIdSchema` 1.0: `full_name`, `dob`, `digital_id_number`, `photo_hash`. |
| `PropertyDeedAttributes` | `static Dictionary<string,string> PropertyDeedAttributes(Property property, string ownerDid, string? polygonGeoJson)` | سمات `PropertyDeedSchema` 1.0: `property_code`, `owner_did`, `type`, `area_sqm`, `polygon_hash`. |
| `PolygonHash` | `static string PolygonHash(string? polygonGeoJson, Guid propertyId)` | SHA-256 لـ GeoJSON الحدود — المرساة المقاومة للعبث الرابطة بين الاعتماد وشكل القطعة؛ يتراجع إلى تجزئة معرّف العقار عند غياب المضلّع. |
| `FullName` | `static string FullName(Citizen c)` | يجمع الأسماء العربية الأربعة متجاهلاً الفارغة. |

---

## 2. وحدة البلوكتشين `Blockchain/`

تُدير سكّ رخص NFT العقارية وتثبيت البيانات الوصفية على IPFS. تقف خلف `IBlockchainService` نسختان: `StubBlockchainService` (مزيّف حتمي، افتراضي في التطوير) و`EthereumBlockchainService` (عميل Nethereum حقيقي).

### 2.1 الواجهة `IBlockchainService` والنماذج المرافقة

`apps/api-dotnet/Blockchain/IBlockchainService.cs`

| العضو | التوقيع | الوصف |
|---|---|---|
| `Mode` | `string Mode { get; }` | `"stub"` أو `"real"`. |
| `CanSign` | `bool CanSign { get; }` | صحيح عندما تُمكِن كتابة حقيقية على السلسلة (عقد + مفتاح مضبوطان). |
| `Network` / `Standard` / `ContractAddress` | `string { get; }` | تسميات الشبكة/المعيار/العقد المُختومة على `property_nfts`. |
| `GetStatusAsync` | `Task<ChainStatus> GetStatusAsync(CancellationToken ct)` | صحة RPC الحيّة (معرّف السلسلة، آخر كتلة، سعر الغاز)؛ لا يُلقي أبداً. |
| `GetTxStatusAsync` | `Task<ChainTxStatus?> GetTxStatusAsync(string txHash, …)` | إيصال معاملة؛ `null` عند جهل العقدة بالتجزئة. |
| `MintAsync` | `Task<MintReceipt> MintAsync(MintRequest request, …)` | سكّ رخصة جديدة. |
| `TransferAsync` | `Task<TransferReceipt> TransferAsync(TransferRequest request, …)` | نقل رمز قائم إلى DID مالك جديد. |
| `OwnerOfAsync` | `Task<string?> OwnerOfAsync(string tokenId, …)` | يقرأ المالك الحالي من `ownerOf(tokenId)`. |
| `ExplorerTxUrl` / `ExplorerTokenUrl` | `string (string)` | مساعِدات روابط مستكشف الكتل. |
| `IsSimulatedMint` | `bool IsSimulatedMint(string? mintContractAddress)` | (دالة افتراضية على الواجهة) الرخصة «محاكاة» إذا `!CanSign` أو `ContractAddress` فارغ أو `mintContractAddress != ContractAddress` — فحص **لكل NFT** حتى تبقى الرخص القديمة المسكوكة على عقد stub/أقدم مُعلَّمة محاكاة بعد التحويل لسلسلة حقيقية، فتُخفي الواجهة روابط مستكشفها الميتة. |

نماذج الحمولة: `ChainStatus` (لقطة الشبكة الحيّة: `Mode`, `Network`, `ContractConfigured`, `CanSign`, `Connected`, `ChainId?`, `LatestBlock?`, `GasPriceGwei?`, `RpcHost?`, `Error?`)، `ChainTxStatus` (`TxHash`, `Found`, `BlockNumber?`, `Succeeded?`)، `MintRequest` (`PropertyId`, `OwnerDid`, `OwnerAddress?`, `TokenUri`, `MetadataSha256`)، `MintReceipt`، `TransferRequest`، `TransferReceipt`. وواجهة `IIpfsService` مع `PinJsonAsync`/`GatewayUrlFor` ونموذج `IpfsPinResult` (`IpfsUri`, `Cid`, `Sha256`).

### 2.2 الإعدادات `BlockchainOptions` و`IpfsOptions`

`apps/api-dotnet/Blockchain/BlockchainOptions.cs` — القسم `Sarh:Blockchain`.

| المفتاح | الافتراضي | الوصف |
|---|---|---|
| `Mode` | `"stub"` | `stub` مزيّف داخل-العملية؛ `ethereum`/`real` عميل Web3 حقيقي. |
| `IsReal` (مشتقّة) | — | صحيح عند `real` أو `ethereum`. |
| `Network` | `"ethereum-sepolia"` | تسمية العرض؛ يجب أن تطابق `ck_nft_network` (الهجرة 028). |
| `Standard` | `"ERC-721"` | معيار الرمز. |
| `ContractAddress` / `RpcUrl` / `ApiKey` | `""` | عنوان العقد ونقطة JSON-RPC ومفتاح المزوّد. |
| `ChainId` | `0` | `0` ⇐ يُشتقّ من الشبكة عبر `EffectiveChainId`. |
| `MinterPrivateKeyEnc` | `""` | مفتاح الساكّ الخاص المُغلَّف (AES-256-GCM عبر `KmsCrypto`) — الشكل المفضّل للتخزين. |
| `MinterPrivateKey` | `""` | مفتاح خام نصّي (تطوير/شبكة اختبار فقط)؛ يُسجّل تحذيراً عند البدء. |
| `CanSign` (مشتقّة) | — | صحيح عند وجود عقد + أحد مفتاحي الساكّ. |
| `EffectiveChainId` (مشتقّة) | — | خريطة الشبكات المدمجة (mainnet=1، sepolia=11155111، hoodi=560048، polygon-mainnet=137، amoy=80002، linea-mainnet=59144، linea-sepolia=59141، والافتراضي sepolia). |
| `ExplorerTxUrlTemplate` / `ExplorerTokenUrlTemplate` | قوالب etherscan | تُستبدل فيها `{tx}`/`{token}`/`{contract}`. |

`IpfsOptions` (القسم `Sarh:Ipfs`): `Mode` افتراضياً `"stub"` (يخزّن `metadata.json` محلياً)، و`GatewayUrl` افتراضياً `https://w3s.link/ipfs/`.

### 2.3 المُنفِّذ المزيّف `StubBlockchainService`

`apps/api-dotnet/Blockchain/StubBlockchainService.cs`

بديل حتمي داخل-العملية: نفس `{tokenId, txHash}` يعود لنفس العقار، فتنتج إعادة السكّ بعد `pnpm db:reset` قيماً متوقّعة. `Mode="stub"`, `CanSign=false`. `ContractAddress` مزيّف حتمي عند غيابه. يشتقّ `tokenId` كـ uint256 عشري من SHA-256 لبذرة `{PropertyId}|{OwnerDid}|{MetadataSha256}`، و`txHash` بنمط `0x…` 64 خانة. `GetStatusAsync` يبلّغ حالة «متّصل» صناعية برقم كتلة يتتبّع كتلاً بـ 12 ثانية. `GetTxStatusAsync` دائماً `Found=false` (تجزئات الـ stub لا توجد على عقدة حقيقية). `OwnerOfAsync` يُعيد `null`. في `TransferAsync` تتضمّن بذرة التجزئة الوقت الحالي فتُنتج كل إعادة نقل تجزئة جديدة محاكاةً للسلوك الحقيقي.

### 2.4 المُنفِّذ الحقيقي `EthereumBlockchainService`

`apps/api-dotnet/Blockchain/EthereumBlockchainService.cs`

عميل EVM حقيقي عبر Nethereum. القراءات (`status`/`ownerOf`/الإيصال) تحتاج `RpcUrl` فقط، أما الكتابة (mint/transfer) فتحتاج عقداً منشوراً + مفتاح ساكّ مموَّل. تُشتقّ معرّفات الرمز/العنوان بنفس صيغ الـ stub فتبقى القطعة المسكوكة تجريبياً محتفظة بمعرّفاتها عند إعادة السكّ الحقيقي.

نقطة تصميمية مهمّة: `ReadTimeout = 6s` يُطبَّق على كل قراءة عبر `WaitAsync` — لأن بعض الشبكات في ليبيا تحجب/تخنق مضيف RPC (نفس سبب حجب بلاطات OSM)، فبدون السقف يتجمّد HttpClient نحو 100 ثانية ويُجمّد طلب «تحقّق من السلسلة» وصفحة NFT.

| العضو | المنطق |
|---|---|
| `GetStatusAsync` | يجمع `ChainId`/`GetBlockNumber`/`GasPrice` ضمن السقف؛ عند الفشل يُعيد `Connected=false` مع `Error` بدل رمي استثناء. |
| `GetTxStatusAsync` | يجلب إيصال المعاملة؛ `Succeeded = receipt.Status?.Value == 1`. |
| `OwnerOfAsync` | يستعلم `OwnerOfFunction`؛ ارتداد العقد لرمز غير موجود يُسجَّل Debug ويُعيد `null` (أي «ليس على السلسلة»). |
| `MintAsync` | عند `!CanSign` يُحاكي عبر `_simFallback` ليكتمل سير الاعتماد النهائي؛ وإلا يستدعي `SafeMintFunction` عبر `SendRequestAndWaitForReceiptAsync`؛ يرمي `SarhException.Upstream` إن ارتدّت المعاملة. |
| `TransferAsync` | عند `!CanSign` يُحاكي؛ وإلا `AdminTransferFunction` (يتيح للسجل بصفته مالك العقد إعادة تعيين رموز محتجزة بعناوين لا يملكها مواطن — نموذج النقل القانوني). |
| `ResolvePrivateKey` (ساكن خاص) | يُفضّل النصّي وإلا يفكّ `MinterPrivateKeyEnc` عبر `KmsCrypto`؛ يرمي `Upstream` عند غياب المفتاحين. |

ربط دوال العقد (تسميات ABC مطابقة لـ `infra/blockchain/SarhPropertyLicense.sol`): `SafeMintFunction` (`safeMint(address to, uint256 tokenId, string uri)`)، `AdminTransferFunction` (`adminTransfer(address from, address to, uint256 tokenId)`)، `OwnerOfFunction` (`ownerOf(uint256) → address`).

### 2.5 التشفير `KmsCrypto`

`apps/api-dotnet/Blockchain/KmsCrypto.cs`

تغليف/فكّ AES-256-GCM قائم بذاته حول `KMS_MASTER_KEY` (`Sarh:KmsMasterKey`، 32 بايت سداسي). يحزم كل شيء في سلسلة base64 واحدة `[IV 12][ciphertext][tag 16]` — وهي ما يحمله `MinterPrivateKeyEnc`، فيعيش مفتاح الساكّ في الإعدادات بلا صفّ قاعدة بيانات. يُطابق شكل التغليف المستخدم لمفاتيح NFC ليغطّي تبديل KMS مشترك مستقبلاً كليهما.

| الدالة | التوقيع |
|---|---|
| `MasterKeyFromConfig` | `static byte[] MasterKeyFromConfig(IConfiguration config)` — يتحقّق من 64 خانة سداسية. |
| `Encrypt` | `static string Encrypt(byte[] masterKey, string plaintext)` — نصّ صريح ⇐ كتلة base64. |
| `Decrypt` | `static string Decrypt(byte[] masterKey, string base64Blob)` — يرمي `CryptographicException` عند مفتاح خاطئ/كتلة معبوثة. |

### 2.6 البيانات الوصفية `PropertyLicenseMetadata`

`apps/api-dotnet/Blockchain/PropertyLicenseMetadata.cs`

مستند JSON خارج-السلسلة المثبَّت على IPFS؛ يُشير إليه `tokenURI` ويرسيه `metadata_sha256` بشكل مقاوم للعبث. تتبع التسمية اصطلاح OpenSea/EIP-721 لتُصيّره المحافظ والمستكشفات بشكل سليم.

- الحقول العليا: `name`, `description`, `image`, `external_url`, `attributes` (قائمة `MetadataAttribute` بـ `trait_type`/`value`)، و`sarh` (امتداد مُسمّى تحت مفتاح لحفظ التوافق مع EIP-721).
- `SarhExtension`: `property_id`, `property_code`, `owner_did`, `decree_no`, `approved_at`, `deed_sha256`, `polygon_geojson` (كائن GeoJSON مضلّع حقيقي RFC 7946، nullable)، `verify_url`.

### 2.7 خدمة IPFS المزيّفة `StubIpfsService`

`apps/api-dotnet/Blockchain/StubIpfsService.cs`

بديل نظام-ملفات محلّي لخدمة تثبيت IPFS. الـ«CID» هو SHA-256 للبايتات (`bafk` + 52 خانة)، ويُركن الـ JSON تحت الحاوية `ipfs-stub` عبر `StorageService.WriteRawAsync` ليخدمه التحقّق بلا عقدة حقيقية.

| الدالة | التوقيع |
|---|---|
| `PinJsonAsync` | `Task<IpfsPinResult> PinJsonAsync(string json, CancellationToken ct)` — يكتب `{cid}.json` ويُعيد `ipfs://{cid}`. |
| `GatewayUrlFor` | `string GatewayUrlFor(string ipfsUri)` — يحوّل `ipfs://<cid>` إلى رابط البوابة العام. |

---

## 3. وحدة سير العمل `Workflow/`

قلب آلة الحالة: مراجعة الطلبات واعتمادها، الاعتماد النهائي وسكّ الرخصة، نقل الملكية، وسرد الرخص والتحقّق منها على السلسلة. (توثّق ملفات التوقيع `DeedPdfBuilder`/`DeedSigningService`/`DeedSignature` في فصل التوقيع؛ يستهلكها `ReviewService` عبر `deedBuilder.Render(...)` و`deedSigning.Sign(...)`.)

### 3.1 خدمة المراجعة `ReviewService` — آلة حالة المراجعة

`apps/api-dotnet/Workflow/ReviewService.cs`

الغرض: القرار الأوّل لموظف السجل على عقار قيد المراجعة. الحالات القابلة للمراجعة `Reviewable = { pending, under_review, needs_clarification }`، وأدوار المراجِعين `ReviewerRoles = { registry_officer, reviewer, super_admin }`.

| العضو (عام) | التوقيع |
|---|---|
| `ReviewAsync` | `Task<ReviewResult> ReviewAsync(Guid propertyId, ReviewDecisionDto dto, CurrentUser actor, CancellationToken ct)` |

منطق `ReviewAsync` (البوّابة والتفريع):
1. يتطلّب `OfficerId` ودوراً مراجِعاً وإلا `Forbidden`.
2. الملاحظة إلزامية عند `reject`/`needs_clarification` وإلا `Validation`.
3. حوكمة إقليمية: غير `super_admin` يجب أن يملك `RegionId` مطابقاً لمنطقة العقار وإلا `Forbidden`.
4. يجب أن تكون الحالة ضمن `Reviewable` وإلا `Conflict`.
5. يتفرّع على `dto.Decision`: `approve → ApproveAsync`، `reject → RejectAsync`، وإلا `NeedsClarificationAsync`.

مسار الاعتماد `ApproveAsync` (خاص) — أعقد فرع:
- **حارس الملكية**: `IssuedOverlapClashAsync` يفحص عبر SQL خام تقاطع مضلّع العقار مع أي قطعة **مُصدَرة سلفاً** (`approved`/`minted`/`transferred`) بمساحة تقاطع فعلية `> 1.0 م²`؛ عند التصادم يرمي `Conflict` («خلل في الملكية»). (التصادم مع قطعة معلّقة لا يُحجَب هنا.)
- يتطلّب منطقة، يُولّد `propertyCode` عبر SP `next_property_code`، يبني `verifyUrl`.
- يُصيّر PDF السند عبر `deedBuilder.Render(...)`، يكتبه عبر `storage.WriteRawAsync("property_deeds", …)`، ويلتقط `Sha256` كـ `DeedSignedHash`.
- `SignDeedAsync` (خاص، أفضل-جهد): يُوقّع البايتات عبر `deedSigning.Sign` ويكتب `deed.pdf.p7s` (توقيع PKCS#7 منفصل)؛ فشل التوقيع لا يحجب الاعتماد.
- يختم العقار `Status="approved"` والحقول المرتبطة، يحفظ، ثم يُصدر اعتماد سند الملكية عبر `IssuePropertyDeedVcAsync` (خاص) الذي يختم `VcCredentialId` ويتراجع إلى معرّف بديل `urn:placeholder:vc:property_deed:{guid}` عند فشل SSI.
- يُحدّث `registration_requests` ويُسجّل تعليقاً، ثم يُشعر المالك (`alsoSms: true`)، ويُعيد `ReviewResult` مع `ReviewDeed` و`ReviewVc`.

مساران آخران: `RejectAsync` (يختم `rejected` + `RejectionReason`، يُشعر بـ SMS) و`NeedsClarificationAsync` (يختم `needs_clarification`، يُشعر بلا SMS). مساعِدات خاصة: `IssuedOverlapClashAsync`, `BuildVerifyUrl`, `NextPropertyCodeAsync`, `UpdateRegistrationRequestAsync`, `RecordCommentAsync` (كلها أفضل-جهد مع تسجيل التحذيرات).

### 3.2 خدمة الرخصة `LicenseService` — الاعتماد النهائي وسكّ NFT

`apps/api-dotnet/Workflow/LicenseService.cs`

الغرض: الاعتماد النهائي (مدير الإدارة): يأخذ عقاراً `approved`، يثبّت بياناته الوصفية على IPFS، يسكّ NFT، يُسجّل صفوف `property_nfts` + `ownership_history`، ويقلب الحالة إلى `minted`. متكافئ الاستدعاء: عند وجود NFT غير فاشل مسبقاً يُعيده بدل التكرار.

| العضو (عام) | التوقيع |
|---|---|
| `FinalApproveAsync` | `Task<LicenseResult> FinalApproveAsync(Guid propertyId, FinalApproveDto dto, CurrentUser actor, CancellationToken ct)` |

منطق `FinalApproveAsync`:
1. **بوّابة الدور مفتوحة عمداً**: أي مستخدم مُصادَق عليه يقود الاعتماد النهائي، لكن تُصان الحدود بقواعد النطاق: الموظف مقيّد بمنطقته (غير `super_admin`)، والمواطن يُنهي **عقاره فقط** وإلا `Forbidden`.
2. **فحص التكافؤ أولاً**: عند وجود NFT `Status != "failed"` يُعيد الموجود عبر `BuildResultAsync`.
3. يجب أن يكون العقار `approved` وإلا `Conflict`.
4. **بوّابة أمنية**: `disputes.AssertNoActiveDisputeAsync` — لا سكّ لقطعة عليها عبء نشط.
5. القرار الفعّال: تجاوز اختياري لرقم القرار، وإلا `property.ApprovalDecreeNo`؛ إلزامي وإلا `Validation`.
6. يشتقّ `ownerDid` عبر `OwnerDidFor`، يحمّل المضلّع (`LoadPolygonGeoJsonAsync`)، يبني البيانات الوصفية (`BuildMetadata`)، يثبّتها (`ipfs.PinJsonAsync`)، ثم يسكّ (`chain.MintAsync`).
7. يُدرِج `PropertyNft` (بحالة `minted`) و`OwnershipHistory` (بسبب `initial_mint`) في `SaveChanges` واحد، يقلب `property.Status="minted"`، ثم يُشعر المالك ويُعيد `BuildResultAsync`.

مساعِدات خاصة: `BuildResultAsync` (يُعيد تحميل `PropertyView` طازج ويحسب `Simulated = chain.IsSimulatedMint(nft.ContractAddress)`)، `OwnerDidFor` (نمط `did:sov:LY:{hex[^16..]}` باللاحقة)، `BuildVerifyUrl`, `LoadPolygonGeoJsonAsync`, `BuildMetadata` (يجمع الاسم العربي والسمات وامتداد `SarhExtension`).

### 3.3 خدمة النقل `TransferService`

`apps/api-dotnet/Workflow/TransferService.cs`

الغرض: إعادة تعيين ملكية عقار مسكوك لمواطن آخر، مُحدِّثاً ثلاثة مواضع (أفضل-جهد؛ نداء السلسلة غير معاملاتي مع SQL): `property_nfts` (المالك + `status=transferred`)، `ownership_history` (صفّ جديد)، و`properties` (`status=transferred` + `owner_citizen_id` المالك القانوني). الأدوار `ManagerRoles = { super_admin, department_manager, registry_officer }`، الأسباب الصالحة `{ sale, inheritance, gift, court_order, correction }`، والحالات القابلة للنقل `{ minted, transferred }`.

| العضو (عام) | التوقيع |
|---|---|
| `TransferAsync` | `Task<TransferResult> TransferAsync(Guid nftId, TransferNftDto dto, CurrentUser actor, CancellationToken ct)` |

منطق `TransferAsync`: يتحقّق من الدور والسبب (الملاحظة إلزامية لـ `court_order`/`correction`)، يحمّل NFT ويتحقّق من قابلية النقل، يفرض النطاق الإقليمي، يستدعي **البوّابة الأمنية** `AssertNoActiveDisputeAsync`، يتحقّق من المستلِم (نشط، وليس المالك الحالي)، ثم: (1) نداء السلسلة `chain.TransferAsync`، (2) كتابة الجداول الثلاثة في `SaveChanges` واحد داخل `try/catch` يُسجّل خطأ الحاجة للمصالحة اليدوية عند فشل SQL بعد نجاح السلسلة، (3) إشعار الطرفين (أفضل-جهد). النماذج المرافقة في نفس الملف: `TransferNftDto` (`ToCitizenId`, `Reason`, `NotesAr?`)، `TransferResult`. مساعِدات ساكنة: `OwnerDidFor`, `ReasonAr` (خريطة السبب إلى العربية).

### 3.4 خدمة الرخص `NftsService` — السرد والتحقّق على السلسلة

`apps/api-dotnet/Workflow/NftsService.cs`

الغرض: سطح القراءة على دفتر رخص NFT (تصفّح إداري/تدقيقي)؛ الكتابة عبر `LicenseService`/`TransferService`.

| العضو (عام) | التوقيع | الوصف |
|---|---|---|
| `ListAsync` | `Task<CursorPage<NftLicenseView>> ListAsync(ListNftsQuery q, CurrentUser actor, CancellationToken ct)` | سرد بترقيم مؤشّري (`MintedAt` تنازلياً)؛ مرشّحات `status`/`network`/`property_id`/`owner_did`؛ نطاق إقليمي لغير `super_admin`/`auditor`. |
| `ListMyAsync` | `Task<List<NftLicenseView>> ListMyAsync(CurrentUser actor, …)` | رخص المواطن المُصادَق عليه (حسب `owner_citizen_id` في السجل لا المالك على السلسلة)، بحالات `minted`/`transferred`/`pending`. |
| `GetByIdAsync` | `Task<NftLicenseView> GetByIdAsync(Guid id, CurrentUser actor, …)` | رخصة واحدة مع فحص النطاق. |
| `ChainCheckAsync` | `Task<ChainCheckResult> ChainCheckAsync(Guid id, CurrentUser actor, …)` | «تحقّق حيّ على السلسلة»: صحة RPC + `ownerOf` + إيصال معاملة السكّ؛ يحسب `OwnerMatches` بمقارنة المالك على السلسلة بـ `nft.OwnerAddress`؛ لا يعدّل الحالة. |
| `ListHistoryAsync` | `Task<List<OwnershipEventView>> ListHistoryAsync(Guid nftId, CurrentUser actor, …)` | خطّ زمن الملكية (من `initial_mint` عبر كل نقل)، أقدم-أولاً، بربط خارجي للمواطنين للحفاظ على الصفوف رغم الحذف الناعم. |

النماذج المرافقة: `ListNftsQuery` (`Cursor`, `Limit` بحدّ 1–100، `Status`, `Network`, `property_id`, `owner_did`)، `NftLicenseView` (يتضمّن `PropertyCode`/`OwnerCitizenId` المربوطة و`Simulated`)، `OwnershipEventView`.

### 3.5 نماذج الرخصة `LicenseDtos` ونتيجة الفحص `ChainCheckResult`

`apps/api-dotnet/Workflow/LicenseDtos.cs`: `FinalApproveDto` (`ApprovalDecreeNo?`, `Note?`)، `LicenseResult` (`Property`, `Nft`, `ExplorerTxUrl`, `ExplorerTokenUrl`, `MetadataGatewayUrl`, `Simulated`)، `NftView` (لقطة NFT كاملة مع مصنع `From(PropertyNft)`).

`apps/api-dotnet/Workflow/ChainCheckResult.cs`: حمولة «تحقّق على السلسلة» لرخصة واحدة تدمج لقطة RPC (`Mode`, `Network`, `ChainId?`, `RpcConnected`, `RpcHost?`, `RpcError?`, `LatestBlock?`, `GasPriceGwei?`)، والعقد (`ContractAddress`, `ContractConfigured`, `CanSign`)، والرمز (`TokenId`, `RecordedOwnerAddress`, `OnChainOwner?`, `TokenExistsOnChain?`, `OwnerMatches?`)، ومعاملة السكّ (`MintTxHash`, `TxFound?`, `TxBlockNumber?`, `TxSucceeded?`)، مع روابط المستكشف و`CheckedAt`. تُسلسَل snake_case بالسياسة العامّة.

---

## 4. وحدة الإشعارات `Notifications/`

تسليم الإشعارات داخل التطبيق (مع بثّ SignalR الفوري) والرسائل النصية للأحداث الحرجة.

### 4.1 خدمة الإشعارات `NotificationsService`

`apps/api-dotnet/Notifications/NotificationsService.cs`

تعتمد على `IHubContext<NotificationsHub>` (البثّ) و`ISmsSender` (الرسائل).

| العضو (عام) | التوقيع | المنطق |
|---|---|---|
| `NotifyCitizenAsync` | `Task NotifyCitizenAsync(Guid citizenId, string titleAr, string bodyAr, object? payload, CancellationToken ct, bool alsoSms = false)` | يُدرِج صفّ `in_app` عبر `TryInsertAsync`؛ عند `alsoSms` يُرسل نصّاً عبر `TrySendSmsAsync`. |
| `NotifyOfficerAsync` | `Task NotifyOfficerAsync(Guid officerId, string titleAr, string bodyAr, object? payload, CancellationToken ct)` | إشعار داخل-التطبيق لموظف. |
| `NotifyReviewersInRegionAsync` | `Task NotifyReviewersInRegionAsync(int regionId, string titleAr, string bodyAr, object? payload, CancellationToken ct)` | يُشعر كل موظف مراجِع نشط (`registry_officer`/`reviewer`) في منطقة. |
| `ListMineAsync` | `Task<CursorPage<NotificationView>> ListMineAsync(CurrentUser actor, ListNotificationsQuery q, …)` | صندوق الوارد بترقيم مؤشّري (`SentAt` تنازلياً)؛ مرشّح `unread_only`. |
| `UnreadCountAsync` | `Task<int> UnreadCountAsync(CurrentUser actor, …)` | عدّاد غير المقروء. |
| `MarkReadAsync` | `Task<NotificationView> MarkReadAsync(Guid notificationId, CurrentUser actor, …)` | يختم `ReadAt` إن كان فارغاً. |
| `MarkAllReadAsync` | `Task<int> MarkAllReadAsync(CurrentUser actor, …)` | يختم كل غير المقروء عبر `ExecuteUpdateAsync`. |

المساعِدات الخاصة: `MyQueryFor` (مرشّح النطاق: المواطن حسب `citizen_id`، الموظف حسب `officer_id`، وإلا `Forbidden`)؛ `TrySendSmsAsync` (يُطبّع الهاتف عبر `LibyanPhone.Normalize`، يُدرِج صفّ `kind='sms'`، يُرسل عبر `sms.SendAsync(SmsText.Compose(...))`، ويختم `delivery_status = sent/failed` — أفضل-جهد كامل)؛ `TryInsertAsync` (**يختم `SentAt` صراحةً** لأن EF يرسل `0001-01-01` فوق قيمة قاعدة البيانات الافتراضية فيدفن الإشعار أسفل الصندوق، ثم يبثّ)؛ `BroadcastAsync` (بثّ SignalR إلى المجموعة `citizen:{id}` أو `officer:{id}` بحدث `"notification"`).

### 4.2 محور SignalR `NotificationsHub`

`apps/api-dotnet/Notifications/NotificationsHub.cs`

محور `[Authorize]`. عند `OnConnectedAsync` يستخرج المستخدم عبر `RequireUserOrNull()` (يُجهض الاتصال عند غيابه) ويضمّه إلى المجموعات `citizen:{id}` و`officer:{id}` و`region:{id}` حسب المتاح من ادّعاءاته.

### 4.3 نماذج الإشعارات `NotificationDtos`

`apps/api-dotnet/Notifications/NotificationDtos.cs`: `ListNotificationsQuery` (`Cursor`, `Limit` بحدّ 1–100 افتراضي 30، `unread_only`)؛ `NotificationView` (`Id`, `Kind`, `TitleAr?`, `BodyAr?`, `Payload` كـ JsonElement مُحلَّل، `SentAt`, `ReadAt?`, `DeliveryStatus`) مع مصنع `From(Notification)` يحلّل الحمولة بأمان.

### 4.4 مجرّد الرسائل `ISmsSender` والمنفّذون

`apps/api-dotnet/Notifications/ISmsSender.cs`: الواجهة (`Provider`, `SendAsync(string toE164, string message, …)`)؛ لا تُلقي أبداً — الفشل يُعيد `SmsResult.Fail`. سجلّ `SmsResult(bool Success, string? ProviderMessageId, string? Error)` بمصنعين `Ok`/`Fail`. مساعِد `SmsText.Compose(titleAr, bodyAr)` (نقيّ، يقتطع عند 480 حرفاً ≈ 3 مقاطع GSM).

| المنفّذ | الملف | الوصف |
|---|---|---|
| `LibyanaSmsSender` | `apps/api-dotnet/Notifications/LibyanaSmsSender.cs` | يُرسل عبر بوابة Libyana بمغلّف JSON `{to, from, text}` مع مصادقة `x-api-key` و/أو Basic؛ صامد (أي استجابة غير 2xx ⇐ `Fail`)؛ يستخرج معرّف الرسالة من مفاتيح `message_id`/`messageId`/`id`/`sid`. |
| `LogSmsSender` | `apps/api-dotnet/Notifications/LogSmsSender.cs` | مُرسِل التطوير الافتراضي: يكتب الرسالة للسجل وينجح دائماً بمعرّف صناعي `log-…`. |

### 4.5 تطبيع الهاتف `LibyanPhone` والإعدادات `SmsOptions`

`apps/api-dotnet/Notifications/LibyanPhone.cs`: `static string? Normalize(string? raw)` — يُطبّع الأرقام الليبية إلى E.164 (`+218XXXXXXXXX`): يُبقي الأرقام فقط، يجرّد البادئات (`00218`/`218`/`0`)، ويقبل فقط 9 خانات تبدأ بـ `9` (الجوّال؛ الثابت غير قابل لـ SMS) وإلا `null`.

`apps/api-dotnet/Notifications/SmsOptions.cs` (القسم `Sarh:Sms`): `Mode` افتراضياً `"auto"` (libyana عند ضبط `GatewayUrl` وإلا log)، `GatewayUrl`, `ApiKey`, `Username`, `Password`, `SenderId` افتراضياً `"SARH"`، والمشتقّة `UseGateway`.

---

## 5. وحدة النزاعات `Disputes/`

تسجيل ورفع الأعباء القانونية (حجز قضائي، رهن، وقف…) على القطع، وبوّابة «هل القطعة مُعبّأة؟» التي تستدعيها `LicenseService` و`TransferService`.

### 5.1 خدمة النزاعات `DisputesService`

`apps/api-dotnet/Disputes/DisputesService.cs`

الأدوار: التسجيل `RecordRoles = { super_admin, department_manager, registry_officer }`، والرفع (الأخطر، لأنه يُعيد فتح البيع/السكّ) `LiftRoles = { super_admin, department_manager }`.

| العضو (عام) | التوقيع | المنطق |
|---|---|---|
| `HasActiveDisputeAsync` | `Task<bool> HasActiveDisputeAsync(Guid propertyId, CancellationToken ct)` | هل توجد نزاعات `status='active'`. |
| `AssertNoActiveDisputeAsync` | `Task AssertNoActiveDisputeAsync(Guid propertyId, …)` | **البوّابة الأمنية**: يرمي `Conflict` إن وُجد عبء نشط (يستدعيها مسار السكّ والنقل). |
| `RecordAsync` | `Task<DisputeView> RecordAsync(RecordDisputeDto dto, CurrentUser actor, …)` | يتحقّق من الدور والنوع (`DisputeLabels.Types`) والجهة والتواريخ، يفرض النطاق الإقليمي، يُدرِج بحالة `active`، ويُشعر المالك (`alsoSms: true`). |
| `LiftAsync` | `Task<DisputeView> LiftAsync(Guid id, LiftDisputeDto dto, CurrentUser actor, …)` | يختم `lifted` + `LiftedByOfficerId`/`LiftedAt`، يُلحِق ملاحظة الرفع، ويُشعر المالك بأن النقل/السكّ صار ممكناً. |
| `ListByPropertyAsync` | `Task<List<DisputeView>> ListByPropertyAsync(Guid propertyId, CurrentUser actor, …)` | كل نزاعات القطعة (نشطة وتاريخية) الأحدث أولاً. |

مساعِد ساكن `EnsureRegionScope`: يُعفي `super_admin`/`auditor`، ويرمي `Forbidden` عند اختلاف منطقة الموظف عن العقار.

### 5.2 نماذج النزاعات `DisputeDtos`

`apps/api-dotnet/Disputes/DisputeDtos.cs`: `RecordDisputeDto` (`PropertyId`, `DisputeType`, `CaseNumber?`, `IssuingAuthority`, `StartDate`, `EndDate?`, `Notes?`)؛ `LiftDisputeDto` (`Notes?`)؛ `DisputeView` (لقطة كاملة مع تسميات عربية ومصنع `From`). وخريطة `DisputeLabels` (Latin ⇐⇒ عربي؛ الرمز مصدر الحقيقة عبر DB CHECK): الأنواع `judicial_seizure`=حجز قضائي، `certified_mortgage`=رهن مصدّق، `inheritance_dispute`=نزاع ورثة، `waqf`=وقف، `precautionary_seizure`=حجز تحفظي، `other`=أخرى؛ ودالتا `TypeAr`/`StatusAr` (`active`=قائم ومقيد، `lifted`=مرفوع).

---

## 6. وحدة التدقيق `Audit/`

سجل تدقيق إلحاقي فقط (append-only) يلتقط كل عملية كتابة ناجحة عبر مرشّح إجراء عالمي.

### 6.1 كاتب السجل `AuditService`

`apps/api-dotnet/Audit/AuditService.cs`

نموذج `AuditEntry` (`ActorKind` = officer/citizen/system، `ActorId?`, `Action`, `EntityTable`, `EntityId?`, `BeforeStateJson?`, `AfterStateJson?`, `IpAddress?`, `UserAgent?`).

| العضو (عام) | التوقيع | المنطق |
|---|---|---|
| `RecordAsync` | `Task RecordAsync(AuditEntry entry, CancellationToken ct)` | إدراج `INSERT` مُعامَل خام في `audit_log` (لا تتبّع كيانات EF، لأن الجدول `BIGINT IDENTITY` للترتيب ولا يشارك في `DbContext` الطلب). **فشل التدقيق لا يتصاعد أبداً** — يُسجَّل خطأ ويُبتلع (فقدان صفّ تدقيق أهون من فقدان الطلب). |

### 6.2 السمة `AuditAttribute` والثوابت `AuditActions`

`apps/api-dotnet/Audit/AuditAttribute.cs`

سمة على دوال المتحكّمات تُصرّح بما يُدقَّق (يُطلَق المرشّح **بعد نجاح** المُعالِج فقط):

| الخاصية | الافتراضي | الوصف |
|---|---|---|
| `Action` | (إلزامي) | نوع الفعل. |
| `Entity` | (إلزامي) | اسم الجدول. |
| `EntityIdFrom` | `"id"` | مسار منقوط لموضع معرّف الكيان في الاستجابة (مثل `card.id`). |
| `CaptureRequestBody` | `true` | حفظ جسم الطلب في `before_state`؛ يُضبَط `false` على `/auth/sign-in` كي لا تُحفَظ كلمات المرور. |
| `CaptureResponseBody` | `true` | حفظ جسم الاستجابة في `after_state`؛ يُضبَط `false` حيث تحمل الاستجابة أسراراً (PINs، مفاتيح NFC، رموز JWT) كي لا تصل السجل الإلحاقي. |

الثوابت `AuditActions`: `Create`, `Update`, `Delete`, `Approve`, `Reject`, `IssueId`, `RevokeId`, `View`, `Login`.

### 6.3 مرشّح الإجراء `AuditActionFilter` — المُعترِض

`apps/api-dotnet/Audit/AuditActionFilter.cs`

مرشّح إجراء عالمي `IAsyncActionFilter` ينفّذ بعد نجاح المُعالِج.

| العضو (عام) | التوقيع |
|---|---|
| `OnActionExecutionAsync` | `Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)` |

المنطق: يبحث عن `[Audit]` على الدالة (وإلا يمرّر)؛ يلتقط الـ DTO الوارد قبل تشغيل الإجراء (عند `CaptureRequestBody`) عبر `IsLikelyDto`؛ ينفّذ الإجراء ويتوقّف عند وجود استثناء غير مُعالَج (فالطلبات الفاشلة لا تُدقَّق)؛ يستخرج جسم الاستجابة من `ObjectResult` أو عبر انعكاس؛ يحلّ الفاعل من ادّعاءات JWT عبر `ResolveActor` (officer_id ثم citizen_id ثم sub/system). حالة خاصّة: طلبات `Login` مجهولة (لا JWT بعد)، فإن كان الفاعل `system` والفعل `Login` يُستعاد الفاعل من جسم الاستجابة عبر `ResolveLoginActorFromBody` (كائن `user` مع `officer_id`/`citizen_id`) فتُنسَب عملية الدخول للمواطن/الموظف بالاسم بدل «system». ثم يستخرج `entity_id` عبر `PickEntityId` (يمشي مساراً منقوطاً عبر JSON)، يبني `AuditEntry` (يُسلسِل الحالتين بـ `JsonDefaults.Options`)، ويستدعي `AuditService.RecordAsync`. مساعِدات IP: `RequestIp` (يُفضّل أول قفزة في `X-Forwarded-For`).

---

## 7. وحدة الخرائط `Map/`

تجمّع تغذيات GeoJSON للقطع خلف سطحَي الخريطة — كلاهما يكشف سمات **عامّة فقط** (لا مالك ولا رقم وطني).

### 7.1 خدمة الخرائط `MapService`

`apps/api-dotnet/Map/MapService.cs`

| العضو (عام) | التوقيع | الوصف |
|---|---|---|
| `PublicMapAsync` | `Task<MapFeatureCollection> PublicMapAsync(int? regionId, CancellationToken ct)` | القطع المُصدَرة السند، بلا مصادقة (خريطة verify.sarh.ly). |
| `OfficerMapAsync` | `Task<MapFeatureCollection> OfficerMapAsync(CurrentUser actor, int? regionId, CancellationToken ct)` | **قرار منتَج**: تُظهر كل قطعة حيّة عبر كل المناطق لأي مستخدم مُصادَق عليه (سمات عامّة فقط)؛ `region_id` مرشّح تضييق اختياري لا نطاق مفروض بالدور، فيرى حتى المراجِع غير المُخصَّص لمنطقة خريطة البلد كاملة بدل خطأ Forbidden. |

المنطق المشترك `BuildAsync` (خاص): ينفّذ SP `dbo.property_map_features @p_public, @p_region_id`؛ يقرأ الأعمدة عبر `GetOrdinal`، والأعمدة المشتقّة المُضافة في هجرات لاحقة (`has_active_dispute`=043، `has_location_conflict`=045، `conflict_kind`=046، `map_status`=043) عبر **`SafeOrdinal`** (يُعيد −1 بدل رمي `IndexOutOfRangeException` عند إجراء مُهاجَر جزئياً — فتتدهور التغذية بلطف: نزاع/تعارض→false، النوع→"none"، الحالة→"pending" بدل خريطة فارغة كلياً). القطعة بلا مضلّع قابل للتصيير تُتخطّى.

### 7.2 نماذج الخرائط `MapDtos`

`apps/api-dotnet/Map/MapDtos.cs`: بنية GeoJSON قياسية تستهلكها Leaflet/mapbox مباشرة. `MapFeatureCollection` (`Type="FeatureCollection"`, `Features`)؛ `MapFeature` (`Type="Feature"`, `Geometry` مضلّع GeoJSON بترتيب [lng,lat]، `Properties`)؛ `MapFeatureProps` — سمات عامّة صارمة: `Id`, `PropertyCode?`, `ParcelNumber?`, `PropertyType`, `Status` (خام)، `MapStatus` (دلو لون مشتقّ: clear/disputed/pending/public)، `RegionId?`, `AreaSqm?`, `UpdatedAt`, `HasActiveDispute`, `HasLocationConflict` (تداخل مساحي مع قطعة حيّة — احتمال تسجيل مزدوج)، `ConflictKind` (`ownership_conflict`/`location_conflict`/`none`)، و`Lng`/`Lat` (المركز، مرساة العلامة).

---

## 8. وحدة المشتركات `Common/`

مساعِدات أفقية: ترقيم الصفحات، جسر متغيّرات البيئة، سياسات تحديد المعدّل، ومغلّف الأخطاء ووسيطته.

### 8.1 مغلّف الترقيم `CursorPage<T>`

`apps/api-dotnet/Common/CursorPage.cs`: `CursorPage<T>` بحقلين `Items` و`NextCursor?` — مغلّف الترقيم المؤشّري القياسي عبر كل نقاط السرد.

### 8.2 جسر البيئة `EnvBootstrap`

`apps/api-dotnet/Common/EnvBootstrap.cs`: يجسر أسماء متغيّرات البيئة القانونية على مفاتيح `Sarh:*`، فلا يصون المستخدم نسختين متوازيتين.

| العضو (عام) | التوقيع | المنطق |
|---|---|---|
| `ApplyEnvOverrides` | `static void ApplyEnvOverrides(IConfigurationBuilder cfg)` | يربط أزواجاً: JWT (`SARH_JWT_SECRET`، `SARH_JWT_TTL_SECONDS`)، التخزين/KMS (`STORAGE_ROOT`، `KMS_MASTER_KEY`، `NFC_SUN_BASE_URL`)، SSI (`ACA_PY_*`)، توقيع السند (`DEED_SIGNING_*`)، تحديد المعدّل (`RATE_LIMIT_ENABLED`)، SMS (`SMS_*`)، CORS (`CORS_ORIGINS` مفصولة بفواصل ⇐ مفاتيح مفهرسة `Sarh:CorsOrigins:i`)، وسلسلة الاتصال (يُفضّل `Sarh__ConnectionString`/`DATABASE_URL`، وإلا يبنيها من تقسيم `MSSQL_*`). يُسقط القيم الفارغة كي لا تطمس قيم appsettings الحقيقية. |

### 8.3 سياسات تحديد المعدّل `RateLimitPolicies` و`RateLimitOptions`

`apps/api-dotnet/Common/RateLimitPolicies.cs`: تحديد المعدّل على مستوى التطبيق دفاعٌ في العمق (nginx الطبقة الأولى). ثوابت السياسات `Auth = "auth"` (قبل المصادقة: تقسيم حسب IP) و`Write = "write"` (كتابات مُصادَقة: حسب الموضوع وإلا IP). محلّلات المفاتيح نقيّة: `ClientKey(string? xForwardedFor, string? remoteIp)` (أول قفزة في X-Forwarded-For وإلا العنوان البعيد وإلا `"unknown"`)، و`WriteKey(string? sub, string? xForwardedFor, string? remoteIp)` (يُفضّل `sub:{sub}` كي لا يُخنَق مكتب موظفين خلف NAT كعميل واحد). الإعدادات `RateLimitOptions` (القسم `Sarh:RateLimit`): `Enabled=true`, `AuthPermitPerMinute=10`, `WritePermitPerMinute=30` (تُطابق مناطق nginx).

### 8.4 مغلّف الأخطاء `SarhError` و`SarhException`

`apps/api-dotnet/Common/Errors/SarhError.cs`: `SarhErrorBody` (`code`, `message_ar`, `message_en`, `details?`) و`SarhErrorEnvelope` (`error`) — مغلّف الأخطاء الموحّد. الاستثناء `SarhException` يحمل `StatusCode`/`Code`/`MessageAr`/`MessageEn`/`Details` مع مصانع ساكنة:

| المصنع | الرمز/الحالة |
|---|---|
| `Unauthorized()` | 401 `ERR_UNAUTHORIZED` |
| `Forbidden(reasonAr = …)` | 403 `ERR_FORBIDDEN` |
| `NotFound(entityAr, entityEn)` | 404 `ERR_NOT_FOUND` |
| `Conflict(messageAr, messageEn)` | 409 `ERR_CONFLICT` |
| `Validation(messageAr, messageEn, details?)` | 400 `ERR_VALIDATION` |
| `Upstream(messageEn, details?)` | 502 `ERR_UPSTREAM` (بعربية عامّة لخدمة خارجية) |

### 8.5 الوسيطة `SarhExceptionMiddleware` والمُفتراضات `JsonDefaults`

`apps/api-dotnet/Common/Errors/SarhExceptionMiddleware.cs`: `InvokeAsync(HttpContext ctx)` يلتقط `SarhException` (فيكتب مغلّفها بحالتها) وأي استثناء آخر (فيُسجّل خطأً ويكتب 500 `ERR_INTERNAL` بعربية عامّة). `WriteEnvelope` (ساكن خاص) لا يكتب إن بدأت الاستجابة، ويُسلسِل بـ `JsonDefaults.Options`. والصنف `JsonDefaults` يعرّض `Options` (سياسة تسمية snake_case للخصائص ومفاتيح القواميس) المستخدمة عبر المنصة لتوليد أشكال JSON بـ snake_case.

---

## 9. الخيوط الجامعة عبر الوحدات

- **الحياد بين الوضعين**: `ISsiService` (ACA-Py/placeholder)، `IBlockchainService` (real/stub)، `IIpfsService` (stub)، `ISmsSender` (libyana/log) — كلها تُنتج نفس الأشكال فلا يتفرّع المُستدعي، ويعمل خطّ الإصدار كاملاً في التطوير بلا بنية تحتية خارجية.
- **الأمان أفضل-جهد**: كل عطل خارجي (وكيل SSI، RPC، IPFS، بوابة SMS، توقيع السند، كتابة التدقيق) يُسجَّل ويُبتلع أو يُسجَّل كحالة `offline`/`failed`/محاكاة بدل إسقاط مسار الاعتماد/الإصدار.
- **البوّابة الأمنية الموحّدة**: `DisputesService.AssertNoActiveDisputeAsync` تحرس كلاً من `LicenseService.FinalApproveAsync` و`TransferService.TransferAsync` — لا سكّ ولا نقل لقطعة عليها عبء نشط.
- **حارس الملكية**: `ReviewService.IssuedOverlapClashAsync` (تداخل مساحي `> 1 م²` مع قطعة مُصدَرة) يمنع الاعتماد المزدوج، وتُبرز خدمة الخرائط نفس التعارض عبر `ConflictKind`.
- **اشتقاق DID المتّسق**: `SsiCredentialBuilder.DeriveLocalDid` و`LicenseService.OwnerDidFor` و`TransferService.OwnerDidFor` تستخدم جميعها لاحقة المعرّف السداسي (`{hex[^16..]}`) فيتطابق DID الاعتماد ورخصة NFT للمواطن نفسه.
- **الحوكمة الإقليمية**: قاعدة النطاق (`super_admin`/`auditor` غير مقيّدين؛ غيرهم مقيّد بـ `RegionId`) مكرّرة عبر المراجعة والرخص والنقل والنزاعات (استثناء: خريطة الموظف أزالت التقييد عمداً).
