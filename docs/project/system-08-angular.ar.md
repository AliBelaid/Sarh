# الواجهة الأمامية — تطبيق الويب (Angular)

يوثّق هذا الفصل تطبيق الويب الموحّد لمنصّة **صَرح** المبنيّ بإطار **Angular 21** (تطبيق واحد قائم على المكوّنات المستقلّة `standalone`)، والذي يخدم جميع الأدوار — المواطن، موظف التسجيل، المراجع، مصدر الهويّات، مدير الإدارة، المدقّق، المسؤول العام، بالإضافة إلى واجهة التحقّق العامّة — من خلال قاعدة شيفرة واحدة محكومة بالأدوار (`role-based routing`). يقع التطبيق في المسار `apps/web/` ويستهلك واجهة ASP.NET Core 8 عبر REST تحت `/api/v1`.

جميع الواجهات الموجّهة للمستخدم عربيّة أولاً بتخطيط RTL، ولا يُستخدم Angular Material إطلاقاً؛ بل تعتمد الأنماط على رموز SCSS للعلامة (`brand SCSS tokens`) معرّفة في `apps/web/src/styles.scss`.

---

## 1. الإقلاع والتهيئة (Bootstrap & App Config)

### 1.1 المكوّن الجذر

المكوّن الجذر بسيط للغاية ولا يحمل سوى `router-outlet`، إذ يتم التخطيط الكامل داخل غلاف مستقلّ (`LayoutComponent`) — الملف `apps/web/src/app/app.ts`:

```ts
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {}
```

### 1.2 مزوّدات التطبيق

تُعرّف كل مزوّدات التطبيق في `apps/web/src/app/app.config.ts` عبر الكائن `appConfig: ApplicationConfig`:

| المزوّد | الوظيفة |
| --- | --- |
| `provideBrowserGlobalErrorListeners()` | التقاط أخطاء المتصفح العامّة |
| `provideRouter(APP_ROUTES, withComponentInputBinding())` | التوجيه؛ `withComponentInputBinding` يربط بارامترات المسار مباشرةً بمدخلات `@Input()` (مثل `code`, `id`, `propertyId`) |
| `provideAnimationsAsync()` | الرسوم المتحرّكة بتحميل غير متزامن |
| `provideHttpClient(withInterceptors([authInterceptor]))` | عميل HTTP مع اعتراض المصادقة |
| `provideTransloco({...}, TranslocoHttpLoader)` | التدويل i18n |

إعداد Transloco: اللغات المتاحة `['ar', 'en']`، اللغة الافتراضيّة والاحتياطيّة `ar`، و`reRenderOnLangChange: true`. المحمّل `TranslocoHttpLoader` (في `apps/web/src/app/core/transloco-loader.ts`) يجلب ملفّات الترجمة من `/assets/i18n/{lang}.json`. تجدر الإشارة إلى أنّ غالبيّة نصوص الشاشات مكتوبة عربيّةً مباشرةً داخل القوالب، بينما يُستخدم زرّ اللغة في الشريط العلوي لقلب اتجاه المستند `dir`/`lang` وحفظه في `localStorage` تحت المفتاح `sarh.lang`.

### 1.3 البيئات (Environments) و proxy التطوير

يُحقن عنوان الـ API في زمن البناء من ملفّات البيئة. الملف `apps/web/src/environments/environment.ts` (الإنتاج):

```ts
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
};
```

والملف `apps/web/src/environments/environment.development.ts` يستخدم المسار النسبي نفسه `'/api/v1'` بحيث تمرّ الطلبات عبر بروكسي التطوير. تعريف البروكسي في `apps/web/proxy.conf.json` يوجّه `/api` و`/hubs` (بدعم WebSocket عبر `"ws": true`) إلى `http://localhost:3001` حيث تعمل واجهة .NET.

يُحلّ العنوان في نقطة واحدة عبر `apps/web/src/app/core/api-config.ts`:

```ts
export const API_BASE = environment.apiBaseUrl;
```

### 1.4 أسماء المسارات المختصرة (Path Aliases)

في `apps/web/tsconfig.json`:

```json
"paths": {
  "@core/*":   ["app/core/*"],
  "@shared/*": ["app/shared/*"],
  "@features/*": ["app/features/*"]
}
```

كما يُستورد `@sarh/shared-types` (حزمة العمل المشتركة `packages/shared-types`) للأنواع المشتركة مثل `Property` و`PropertyStatus` و`ReviewDecision` و`FinalApproveRequest` و`LicenseResult` و`PropertyNft`.

---

## 2. خريطة التوجيه المحكومة بالأدوار (Role-based Routing)

تُعرّف كل المسارات في `apps/web/src/app/app.routes.ts`. تُجمّع الأدوار في ثوابت أعلى الملف:

```ts
const OFFICER_ROLES  = ['registry_officer', 'reviewer', 'super_admin'] as const;
const ID_ISSUER_ROLES = ['id_issuer', 'super_admin'] as const;
const ADMIN_ROLES    = ['super_admin', 'auditor'] as const;
const MANAGER_ROLES  = ['department_manager', 'super_admin'] as const;
```

### 2.1 المسارات العامّة (بدون مصادقة)

| المسار | المكوّن (تحميل كسول) |
| --- | --- |
| `''` | `LandingPage` (`features/landing/landing.page`) |
| `login` | `LoginPage` (`features/auth/login.page`) |
| `forbidden` | `ForbiddenPage` (`features/auth/forbidden.page`) |
| `verify` | `VERIFY_ROUTES` (`features/verify/routes`) |
| `map` | `PublicMapPage` (`features/map/public-map.page`) |

### 2.2 الغلاف المصادَق عليه `/app`

المسار الأب `/app` محميّ بـ `[authGuard]` ويحمّل `LayoutComponent`، وكل الشاشات أبناؤه. الجدول التالي يوثّق كل مسار ابن وحارسه الدوري:

| المسار | الحارس الدوري (`roleGuard`) | المكوّن |
| --- | --- | --- |
| `dashboard` | — (كل مصادَق) | `DashboardPage` |
| `profile` | — | `ProfilePage` |
| `notifications` | — | `NotificationsPage` |
| `my/properties` | `['citizen']` | `CitizenPropertiesPage` |
| `my/properties/new` | `['citizen']` | `NewPropertyPage` |
| `my/digital-id` | `['citizen']` | `DigitalIdPage` |
| `my/wallet` | `['citizen']` | `CitizenWalletPage` |
| `properties/new` | `OFFICER_ROLES + MANAGER_ROLES` | `OfficerNewPropertyPage` |
| `queue` | `OFFICER_ROLES` | `OfficerQueuePage` |
| `map` | — (كل مصادَق) | `OfficerMapPage` |
| `properties/:id/boundary` | `OFFICER_ROLES + MANAGER_ROLES` | `OfficerBoundaryEditPage` |
| `approvals` | `OFFICER_ROLES` | `OfficerApprovalsPage` |
| `review/:id` | `OFFICER_ROLES` | `OfficerReviewPage` |
| `disputes/:propertyId` | `OFFICER_ROLES + MANAGER_ROLES` | `OfficerDisputesPage` |
| `manager/queue` | `MANAGER_ROLES` | `ManagerQueuePage` |
| `manager/approve/:id` | `MANAGER_ROLES` | `ManagerApprovePage` |
| `issue` | `ID_ISSUER_ROLES` | `IdIssuerHomePage` |
| `issue/produce/step1..step5`, `.../finalize` | `ID_ISSUER_ROLES` | `IdIssuerStep1..5Page`, `ProducePage` |
| `issue/reissue` | `ID_ISSUER_ROLES` | `ReissuePage` |
| `properties` | `ADMIN_ROLES` | `AdminPropertiesPage` |
| `citizens` | `ADMIN_ROLES` | `AdminCitizensPage` |
| `citizens/:id/edit` | `['super_admin']` | `AdminCitizenEditPage` |
| `digital-ids` | `ADMIN_ROLES + 'id_issuer'` | `AdminDigitalIdsPage` |
| `digital-ids/new` | `ADMIN_ROLES + 'id_issuer'` | `AdminDigitalIdNewPage` |
| `digital-ids/:id` | `ADMIN_ROLES + 'id_issuer'` | `AdminDigitalIdDetailPage` |
| `users` | `['super_admin']` | `AdminOfficersPage` |
| `nft-licences` | `ADMIN_ROLES + 'department_manager'` | `AdminNftLicencesPage` |
| `nft-licences/:id` | `ADMIN_ROLES + 'department_manager'` | `AdminNftLicenceDetailPage` |
| `audit` | `ADMIN_ROLES` | `AdminAuditPage` |
| `reports` | `ADMIN_ROLES` | `AdminReportsPage` |

يحتوي الملف أيضاً على إعادة توجيهات قديمة (`Legacy redirects`) تحافظ على الإشارات المرجعيّة القديمة (مثل `citizen/properties → /app/my/properties`, `admin/officers → /app/users`)، وتوجيه شامل `{ path: '**', redirectTo: '' }`.

### 2.3 جدول: الدور ← مناطق الميزات المتاحة

| الدور | المناطق المتاحة |
| --- | --- |
| `citizen` | Dashboard، Profile، Notifications، عقاراتي + تسجيل عقار + تعديل الحدود (للطلبات في مجرى العمل)، هويتي الرقمية، محفظتي، خريطة العقارات، التحقّق العام |
| `registry_officer` | Dashboard، Profile، Notifications، تسجيل عقار، قائمة المراجعة (`queue`)، مراجعة طلب (`review/:id`)، الاعتمادات، الخريطة، تعديل الحدود، الحجوزات (`disputes`) |
| `reviewer` | نفس صلاحيات `registry_officer` |
| `department_manager` | Dashboard، Profile، Notifications، الاعتمادات النهائيّة (`manager/queue` + `manager/approve/:id`)، تسجيل عقار، تعديل الحدود، الحجوزات، سجل رخص NFT، الخريطة |
| `id_issuer` | Dashboard، Profile، Notifications، محطّة الإصدار (`issue` + المعالج)، إعادة الإصدار، الهويّات الرقميّة (قائمة/إنشاء/تفصيل)، الخريطة |
| `auditor` | Dashboard، Profile، Notifications، العقارات، المواطنون (قراءة فقط)، الهويّات الرقميّة، سجل رخص NFT، سجل التدقيق، التقارير، الخريطة |
| `super_admin` | كل ما سبق (يظهر في كل قوائم الأدوار تقريباً) + المستخدمون (`users`) + تعديل بيانات المواطن + حذف البطاقات |

---

## 3. الخدمات الأساسيّة (Core Services)

تقع كلّها في `apps/web/src/app/core/`، وكلّها مُقدَّمة على مستوى الجذر `@Injectable({ providedIn: 'root' })` وتستخدم `HttpClient` + `firstValueFrom` لإرجاع Promises.

### 3.1 المصادقة وتخزين الرمز

**`AuthService`** — الملف `apps/web/src/app/core/auth.service.ts`. تحتفظ بحالة المستخدم في إشارة `signal<AuthUser | null>` مقروءة عبر `user`، وتخزّن الرمز والمستخدم في `localStorage` تحت المفاتيح `sarh.access_token` و`sarh.user`.

| العضو | HTTP | نقطة النهاية | ملاحظة |
| --- | --- | --- | --- |
| `signIn(email, password)` | POST | `/auth/sign-in` | دخول الموظّف بالبريد + كلمة المرور |
| `signInWithPin(digitalIdNumber, pin)` | POST | `/auth/sign-in-with-pin` | دخول المواطن برقم الهويّة الرقميّة + PIN من 6 أرقام |
| `token()` | — | — | يقرأ `sarh.access_token` من `localStorage` |
| `isAuthenticated()` | — | — | صحيح عند وجود رمز ومستخدم معاً |
| `hasRole(...roles)` | — | — | فحص عضويّة الدور |
| `homeFor(role)` | — | — | يرجع مسار البداية من `ROLE_HOME` |
| `signOut()` | — | — | يمسح `localStorage` ويصفّر الإشارة |

الأنواع في `apps/web/src/app/core/auth.types.ts`: النوع `SarhRole` يعدّد الأدوار السبعة، و`AuthUser` يحمل `{ id, email, role, officer_id, citizen_id }`، و`SignInResponse` يحمل `{ access_token, refresh_token, expires_in, user }`. الخريطة `ROLE_HOME` توجّه كلّ الأدوار إلى `/app/dashboard` (غلاف موحّد يعرض بطاقات خاصّة بكلّ دور).

### 3.2 الحرّاس والمعترِض (Guards & Interceptor)

**`authGuard`** (`apps/web/src/app/core/auth.guard.ts`): يسمح عند `isAuthenticated()`، وإلّا يعيد التوجيه إلى `/login` مع `queryParams: { next: state.url }`.

**`roleGuard(allowed)`** (`apps/web/src/app/core/role.guard.ts`): مصنع حرّاس يسمح فقط للأدوار المحدّدة؛ عند دخول مستخدم بدور خاطئ يُعاد توجيهه إلى صفحته الرئيسيّة (لا إلى `/forbidden`)، و`/forbidden` محجوز للحالة النادرة بلا مستخدم.

**`authInterceptor`** (`apps/web/src/app/core/auth.interceptor.ts`): معترِض دالّي (`HttpInterceptorFn`) يضيف ترويسة `Authorization: Bearer <token>` لكلّ طلب يحمل رمزاً، وعند استجابة `401` (باستثناء `/auth/sign-in`) ينفّذ `signOut()` ويوجّه إلى `/login`:

```ts
if (err?.status === 401 && !req.url.includes('/auth/sign-in')) {
  auth.signOut();
  router.navigate(['/login']);
}
```

### 3.3 خدمات النطاق (Domain Services)

**`CitizensService`** — `apps/web/src/app/core/citizens.service.ts`

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/citizens` (`q, region_id, limit, cursor`) |
| `get(id)` | GET | `/citizens/{id}` |
| `update(id, payload)` | PATCH | `/citizens/{id}` |

**`PropertiesService`** — `apps/web/src/app/core/properties.service.ts`

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/properties` (`q, status, limit, cursor, region_id`) |
| `get(id)` | GET | `/properties/{id}` |
| `listDocuments(id)` | GET | `/properties/{id}/documents` |
| `documentBlob(id, docId)` | GET | `/properties/{id}/documents/{docId}/file` (`responseType: 'blob'`) |
| `review(id, body)` | POST | `/properties/{id}/review` |
| `updateBoundary(id, polygon)` | PATCH | `/properties/{id}/boundary` |
| `finalApprove(id, body)` | POST | `/properties/{id}/final-approve` |
| `bulkReview(ids, decision, note, decree)` | POST | `/properties/bulk-review` |
| `bulkFinalApprove(ids, note)` | POST | `/properties/bulk-final-approve` |

**`DigitalIdCardsService`** — `apps/web/src/app/core/digital-id-cards.service.ts`

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/digital-id-cards` (`citizen_id, status, q, limit, cursor`) |
| `issue(payload)` | POST | `/digital-id-cards/issue` |
| `freeze(id, reason)` | POST | `/digital-id-cards/{id}/freeze` |
| `revoke(id, reason)` | POST | `/digital-id-cards/{id}/revoke` |
| `reissue(id, reason, keepDigitalIdNumber)` | POST | `/digital-id-cards/{id}/reissue` |
| `resetPin(id)` | POST | `/digital-id-cards/{id}/reset-pin` |
| `update(id, payload)` | PATCH | `/digital-id-cards/{id}` |
| `delete(id, reason?)` | DELETE | `/digital-id-cards/{id}` (super_admin فقط) |

الردّ `IssueCardResult` يحمل البطاقة و`nfc_keys` (`meta_read_key_hex, sdm_file_read_key_hex, kms_key_id`) و`sun_url_template`.

**`MapService`** — `apps/web/src/app/core/map.service.ts` — يرجع `ParcelFeatureCollection` بشكل GeoJSON. الخصائص `ParcelProps` لا تحمل أبداً اسم المالك أو رقمه الوطني، وتتضمّن `map_status`، و`has_location_conflict`، و`conflict_kind` (`'none' | 'location_conflict' | 'ownership_conflict'`).

| العضو | HTTP | المسار |
| --- | --- | --- |
| `publicMap(regionId?)` | GET | `/verify/map` (بدون مصادقة، عقارات ذات سند مُصدَر فقط) |
| `officerMap(regionId?)` | GET | `/properties/map` (كلّ القطع الحيّة في نطاق الموظّف) |

**`NftsService`** — `apps/web/src/app/core/nfts.service.ts`

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/property-nfts` |
| `get(id)` | GET | `/property-nfts/{id}` |
| `history(id)` | GET | `/property-nfts/{id}/history` |
| `chainCheck(id)` | GET | `/property-nfts/{id}/chain-check` |
| `mine()` | GET | `/me/nft-licences` (المواطن المصادَق) |
| `transfer(id, body)` | POST | `/property-nfts/{id}/transfer` |

**`NotificationsService`** — `apps/web/src/app/core/notifications.service.ts` — يحمل إشارة عدّاد غير المقروء `unread` مشتركة عبر التطبيق، ويدير اتصال SignalR.

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/me/notifications` |
| `refreshUnread()` | GET | `/me/notifications/unread-count` |
| `markRead(id)` | POST | `/me/notifications/{id}/read` |
| `markAllRead()` | POST | `/me/notifications/read-all` |
| `connect()` | WebSocket | `hubUrl = API_BASE.replace('/api/v1', '/hubs/notifications')` عبر `@microsoft/signalr` مع `accessTokenFactory` وإعادة اتصال تلقائيّة `[0, 2000, 5000, 10000, 30000]`؛ حدث `notification` يزيد العدّاد |

**`OfficersService`** — `apps/web/src/app/core/officers.service.ts`

| العضو | HTTP | المسار |
| --- | --- | --- |
| `list(params)` | GET | `/officers` |
| `get(id)` | GET | `/officers/{id}` |
| `create(payload)` | POST | `/officers` |
| `update(id, payload)` | PATCH | `/officers/{id}` |
| `setActive(id, isActive)` | POST | `/officers/{id}/set-active` |
| `resetPassword(id, newPassword)` | POST | `/officers/{id}/reset-password` |

**`UploadsService`** — `apps/web/src/app/core/uploads.service.ts` — يرفع عبر `FormData`:

| العضو | HTTP | المسار |
| --- | --- | --- |
| `uploadCitizenPhoto(file)` | POST | `/uploads/citizen-photo` |
| `uploadPropertyDocument(file)` | POST | `/uploads/property-document` |

الردّ `UploadResult` يحمل `{ bucket, path, size, mime_type, sha256 }`؛ يُخزَّن `path` (بصيغة `"<bucket>/<path>"`) حرفيّاً في `documents[].storage_path` عند إرسال العقار.

**`DemoDataService`** — `apps/web/src/app/core/demo-data.service.ts` — يقود تدفّق «تحميل البيانات التجريبيّة» في صفحة الهبوط وأدوات المسؤول.

| العضو | HTTP | المسار |
| --- | --- | --- |
| `status()` | GET | `/demo-data/status` |
| `load()` | POST | `/demo-data/load` |
| `reset()` | POST | `/demo-data/reset` |
| `truncate()` | POST | `/demo-data/truncate` |
| `export()` | GET | `/demo-data/export` |

---

## 4. الغلاف والطبقة المشتركة (Shell & Shared)

### 4.1 غلاف التطبيق `LayoutComponent`

الملف `apps/web/src/app/shell/layout.component.ts`، المُحدِّد `app-layout`. غلاف كامل بشريط جانبيّ + شريط علويّ + `router-outlet`، مبنيّ بإشارات (`signal`/`computed`) واستراتيجيّة `OnPush`. أهمّ خصائصه:

- **قائمة تنقّل محكومة بالدور**: مصفوفة `NAV` تعرّف كلّ عنصر بـ `{ ar, en, path, icon, roles, group }`؛ ويُبنى `groupedNav` عبر `computed` بترشيح العناصر بحسب `auth.user()?.role` إلى مجموعتين: `main` و`admin` (بعنوان «الإدارة»).
- **شارة الإشعارات**: الإشارة `unread` مربوطة بـ `NotificationsService.unread`؛ في `ngOnInit` يستدعي `refreshUnread()` و`connect()` (SignalR) ويشغّل استطلاعاً كلّ 120 ثانية، ويوقفها في `ngOnDestroy`.
- **العلامة والهويّة**: ختم «ص» + «صَرح / SARH»، وروابط علويّة للخريطة العامّة `/map` والتحقّق `/verify`، وزرّ تبديل اللغة، وزرّ خروج.
- **الاستجابة (Responsive)**: طيّ الشريط الجانبي على سطح المكتب، وقائمة منزلقة مع خلفيّة معتِمة على الجوّال.
- **تسميات الأدوار العربيّة** عبر `roleLabel()`، وأيقونات SVG مضمّنة عبر `iconSvg()`.

### 4.2 المكوّنات المشتركة `apps/web/src/app/shared/`

**`ParcelMapComponent`** (`shared/parcel-map.component.ts`, المُحدِّد `app-parcel-map`): لوحة Leaflet مشتركة تلوّن مضلّعات القطع بحسب `map_status` مع علامة عند كلّ مركز، وتُصدِر `parcelClick`. مدخلاته: `features`, `showLabels`, `selectedId`, `popupLink`. يدعم `focus(id)` للطيران إلى قطعة، ويرسم القطع المتعارضة بحدّ أحمر متقطّع (`conflict_kind === 'ownership_conflict'` أو `location_conflict`). يُعيد الاحتواء (`fitBounds`) فقط عند تغيّر مجموعة القطع لتجنّب سرقة تكبير المستخدم.

**`StatusChipComponent`** (`shared/status-chip.component.ts`, المُحدِّد `app-status-chip`): شريحة حالة العقار (`PropertyStatus`) مع تسمية عربيّة ونبرة لونيّة (`success/warn/accent/neutral`).

**`status-pills.ts`**: خرائط مركزيّة للتسميات والألوان — `PROPERTY_STATUS`, `NFT_STATUS`, `PROPERTY_TYPE`, `CARD_STATUS`, بالإضافة إلى `REGIONS` (رموز الشعبيّات) و`REGION_CENTROIDS` و`LIBYA_CENTER`.

**`map-status.ts`**: النوع `MapStatus` (`'clear' | 'disputed' | 'pending' | 'public' | 'frozen'`) وبياناته الوصفيّة `MAP_STATUS` (لون ولون تعبئة وتلميح عربيّ) والدالّة `mapStatusMeta()` و`MAP_STATUS_ORDER`.

**`base-tile-layer.ts`**: الدالّة `addBaseTileLayer(map)` تضيف طبقة بلاطات ذاتيّة الإصلاح بترتيب مزوّدين: OpenStreetMap → Esri World Street Map → CARTO Voyager، وتتبدّل تلقائيّاً عند فشل عدد كافٍ من البلاطات (تُعالج حجب OSM في بعض شبكات ليبيا).

---

## 5. مناطق الميزات (Feature Areas)

### 5.1 المصادقة (`features/auth/`)

**`LoginPage`** (`auth/login.page.ts`, `app-login`): شاشة دخول ذات لسانين — «موظف · بريد + كلمة مرور» و«مواطن · هويّة رقميّة + PIN». تستدعي `AuthService.signIn` أو `signInWithPin`، ثمّ توجّه إلى `next` (بعد التحقّق منه بدالّة `canRoleAccess`) أو إلى صفحة بداية الدور. تعرض رسائل الخطأ العربيّة القادمة من مغلّف الخطأ (`error.error.message_ar`) وتمييز 401 برسالة مناسبة.

**`ForbiddenPage`** (`auth/forbidden.page.ts`, `app-forbidden`): بطاقة «غير مصرّح» مع رابط العودة للرئيسيّة.

### 5.2 الهبوط (`features/landing/`)

**`LandingPage`** (`landing/landing.page.ts`, `app-landing`): صفحة تعريفيّة عامّة. تستعلم عن `DemoDataService.status()` في `ngOnInit` لإظهار شريط «تحميل البيانات التجريبيّة» (`can_load`)، ويستدعي `loadDemo()` نقطة `demo-data/load`.

### 5.3 التحقّق العام (`features/verify/`)

المسارات في `verify/routes.ts` (`VERIFY_ROUTES`): الجذر → `VerifyHomePage`، و`:code` → `VerifyDeedPage`.

**`VerifyHomePage`** (`app-verify-home`): صفحة إدخال رمز السند (`PRP-…`) توجّه إلى `/verify/{code}`.

**`VerifyDeedPage`** (`app-verify-deed`): تجلب `GET /verify/{code}` مباشرةً عبر `HttpClient`، وتعرض شهادة معتمدة تحوي معلومات العقار، وتنبيه الحجز/النزاع القائم، وبطاقة رخصة NFT (مع تمييز وضع «المحاكاة» `simulated`)، ورمز QR (مولّد عبر `api.qrserver.com`)، ورابط تحميل صحيفة الملكيّة الموقَّعة `deed_pdf_signed_url`. البارامتر `code` مربوط عبر `@Input()` (بفضل `withComponentInputBinding`).

### 5.4 الخريطة العامّة (`features/map/`)

**`PublicMapPage`** (`map/public-map.page.ts`, `app-public-map`): خريطة عقاريّة عامّة تستهلك `MapService.publicMap(regionId?)` (نقطة `/verify/map`)، مع مرشّح شعبيّة ولوحة تفصيل للقطعة المختارة. تستخدم `ParcelMapComponent` وأسطورة `MAP_STATUS_ORDER`.

### 5.5 لوحة القيادة (`features/dashboard/`)

**`DashboardPage`** (`dashboard/dashboard.page.ts`, `app-dashboard`): غلاف موحّد لكلّ الأدوار. يبني بطاقات (`TILES`) ومؤشّرات (`KPIs`) بحسب الدور عبر `computed`. يجلب العدّادات (مواطنون/عقارات/بطاقات/قيد المراجعة) بـ `Promise.all` واستدعاءات `list({ limit: 1 })` على `CitizensService`/`PropertiesService`/`DigitalIdCardsService`. لِـ `super_admin` يعرض أدوات البيانات التجريبيّة (`demoReset`/`demoTruncate`/`demoExport`) عبر `DemoDataService`.

### 5.6 الملف الشخصي (`features/profile/`)

**`ProfilePage`** (`profile/profile.page.ts`, `app-profile`): عرض للقراءة فقط لبيانات المستخدم من `AuthService.user()` (الاسم من البريد، تسمية الدور العربيّة، المتصفّح، اللغة)، وزرّ خروج. لا يستدعي أيّ نقطة API.

### 5.7 الإشعارات (`features/notifications/`)

**`NotificationsPage`** (`notifications/notifications.page.ts`, `app-notifications`): صندوق وارد بلسانين (الكلّ / غير المقروء). يستخدم `NotificationsService` لِـ `list({ limit: 50 })` والتحميل بالمزيد عبر المؤشّر (`cursor`)، و`markRead`, `markAllRead`, `refreshUnread`. الدالّة `linkFor(n)` تشتقّ روابط قفز من حمولة الإشعار (`payload.property_code` → رابط تحقّق).

### 5.8 المواطن (`features/citizen/`)

- **`CitizenPropertiesPage`** (`app-citizen-properties`): قائمة عقارات المواطن عبر `PropertiesService.list({ limit: 50 })`؛ ورابط صحيفة الملكيّة العامّة `deedUrl(code) = ${API_BASE}/verify/{code}/deed.pdf`.
- **`NewPropertyPage`** (`app-new-property`): معالج تسجيل عقار برسم مضلّع الحدود على Leaflet. المساحة تُشتقّ من المضلّع (`computedArea`) لا من طول×عرض، وتُقارَن اختياريّاً بـ `documented_area_sqm` (تحذير عند تباين >10%). المرفقات إلزاميّة (صورة موقع + كروكي) تُرفع أوّلاً عبر `UploadsService.uploadPropertyDocument` ثمّ تُرسل مضمّنة. الإرسال `POST /properties` مباشرةً عبر `HttpClient` بجسم يحوي `boundary_polygon` (GeoJSON) و`area_sqm` و`documents[]` (بنوعَي `site_photo`/`koreky_certificate`). يرسم خلفيّة القطع المسجّلة عبر `MapService.publicMap()`.
- **`DigitalIdPage`** (`app-digital-id`): بطاقة الهويّة الرقميّة للمواطن؛ يجلب البطاقة عبر `DigitalIdCardsService.list({ citizen_id, limit: 1 })` وبيانات المواطن عبر `CitizensService.get`، والصورة عبر `GET /citizens/{id}/photo` (blob). يبرز قرب انتهاء الصلاحيّة (<90 يوماً) ويدعم الطباعة.
- **`CitizenWalletPage`** (`app-citizen-wallet`): محفظة رخص NFT عبر `NftsService.mine()` (نقطة `/me/nft-licences`)، مع روابط مستكشف السلسلة حسب الشبكة وروابط تحقّق.

### 5.9 الموظّف/المراجع (`features/officer/`)

- **`OfficerQueuePage`** (`app-officer-queue`): طابور المراجعة بمرشّح حالة (`pending` افتراضاً) ونوع، وتحديد جماعي وعمليّات `bulkApprove`/`bulkReject` عبر `PropertiesService.bulkReview`. يفتح المراجعة على `/app/review/:id`.
- **`OfficerReviewPage`** (`app-officer-review`): شاشة المراجعة التفصيليّة. تجلب العقار ومستنداته (كـ blobs لعرضها) والحجوزات (`DisputesService.list`) وقطع الجوار في الشعبيّة (`MapService.officerMap(region_id)`) لإبراز التداخلات المحسوبة على الخادم (`location_conflicts`). القرار (`approve`/غيره) يُرسل عبر `PropertiesService.review` مع `note` و`approval_decree_no`.
- **`OfficerApprovalsPage`** (`app-officer-approvals`): سجلّ الاعتمادات بلسانين (معتمد/مرفوض) عبر استدعاءي `list` بحالتَي `approved` و`rejected`.
- **`OfficerNewPropertyPage`** (`app-officer-new-property`): تسجيل عقار نيابةً عن مواطن؛ يضيف مُنتقي مواطن بحثيّ (`CitizensService.list({ q })` بتأخير 300ms) ويضيف `owner_citizen_id` إلى جسم الإرسال `POST /properties`. بقيّة منطق الرسم/المرفقات مطابق لشاشة المواطن.
- **`OfficerMapPage`** (`app-officer-map`): الخريطة الكاملة للقطع في نطاق الموظّف عبر `MapService.officerMap`، مع مرشّح حالة الخريطة والشعبيّة والبحث. لأدوار `department_manager`/`super_admin` تظهر وصلة «الاعتماد النهائي» في نافذة القطعة.
- **`OfficerBoundaryEditPage`** (`app-boundary-edit`): إعادة رسم حدود القطعة عبر `PropertiesService.updateBoundary` (`PATCH /properties/{id}/boundary`)؛ يقرأ `returnTo` من query params للعودة لشاشة المراجعة.
- **`OfficerDisputesPage`** (`app-officer-disputes`): تسجيل/رفع الحجوزات القانونيّة. يستخدم `DisputesService` (في `features/officer/disputes.service.ts`): `list` (`GET /property-disputes?property_id`)، `record` (`POST /property-disputes`)، `lift` (`POST /property-disputes/{id}/lift`). التسجيل مقصور على `super_admin/department_manager/registry_officer`، والرفع على `super_admin/department_manager`. أنواع الحجز في الثابت `DISPUTE_TYPES`.

### 5.10 مدير الإدارة (`features/manager/`)

- **`ManagerQueuePage`** (`app-manager-queue`): طابور العقارات المعتمَدة الجاهزة للاعتماد النهائي عبر `PropertiesService.list({ status: 'approved', limit: 100 })`.
- **`ManagerApprovePage`** (`app-manager-approve`): شاشة سكّ رخصة NFT. تعرض شريط تقدّم بخطوات (`pades → ssi → ipfs → mint → record`) وتستدعي `PropertiesService.finalApprove(id, { approval_decree_no })` (`POST /properties/{id}/final-approve`)، مع خريطة حدود القطعة وبيانات المالك (`CitizensService.get`).

### 5.11 مصدر الهويّات (`features/id-issuer/`)

الخدمات المحليّة:
- **`IdIssuerApiService`** (`id-issuer-api.service.ts`): `createCitizen` (`POST /citizens`)، `issueCard` (`POST /digital-id-cards/issue`؛ الردّ يحوي `pin`)، و`encodeNfc` الذي يستهدف مساعِد NFC خارجيّاً على `NFC_HELPER_URL` (افتراضاً `http://localhost:8081`) بالمسار `/nfc/encode` — وليس واجهة صَرح.
- **`IdIssuerWizardService`** (`wizard.service.ts`): حالة المعالج المشتركة بإشارات (`identity`, `photoBlob`, `photoDataUrl`, `signaturePngDataUrl`, `fingerprintCaptured`, `createdCitizenId`, `createdCardId`, `createdDigitalIdNumber`) مع `reset()`.

الشاشات:
- **`IdIssuerHomePage`** (`app-id-issuer-home`): بطاقتان تقودان إلى المعالج `/app/issue/produce/step1` وإلى إعادة الإصدار.
- **معالج الإصدار (5 خطوات)**: `IdIssuerStep1Page` (بيانات الهويّة والاسم الرباعيّ العربيّ والشعبيّة) → `IdIssuerStep2Page` (التقاط الصورة عبر `getUserMedia` و`canvas` إلى `photoBlob`) → `IdIssuerStep3Page` (التوقيع رسماً على `canvas`) → `IdIssuerStep4Page` (البصمة، تُضبط `fingerprintCaptured`) → `IdIssuerStep5Page` (المراجعة والإرسال عبر `IdIssuerApiService.createCitizen`).
- **`ProducePage`** (`app-id-issuer-produce`, المسار `finalize`): يصدر البطاقة عبر `issueCard` ثمّ يشفّر شريحة NFC عبر `encodeNfc`، ويعرض `card_serial` ورمز `pin` الأوّلي مرّةً واحدة، مع أطوار (`idle → issuing → awaiting_card → encoding → printing → done/error`).
- **`ReissuePage`** (`app-reissue`): بحث عن مواطن (`CitizensService.list`)، عرض بطاقته الحاليّة (`DigitalIdCardsService.list`)، ثمّ إعادة الإصدار عبر `POST /digital-id-cards/{id}/reissue` (مباشرةً بـ `HttpClient`) بسبب (`lost/damaged/expiring/data_change/other`)، وعرض الـ `pin` الجديد.

### 5.12 الإدارة والتدقيق (`features/admin/`)

- **`AdminCitizensPage`** (`app-admin-citizens`): سجلّ المواطنين عبر `CitizensService.list`؛ التعديل مقصور على `super_admin` (المدقّق للقراءة).
- **`AdminCitizenEditPage`** (`app-admin-citizen-edit`): تعديل بيانات الهويّة المدنيّة؛ يبني حمولة PATCH فارقيّة (يرسل الحقل المتغيّر فقط) عبر `CitizensService.update`.
- **`AdminDigitalIdsPage`** (`app-admin-digital-ids`): قائمة البطاقات مع مرشّح حالة وعدّادات؛ إجراءات الصفّ تعمّق الرابط إلى صفحة التفصيل بنوافذ التعديل/الحذف (`?edit=1`/`?delete=1`). التعديل لـ `super_admin`/`id_issuer`، والحذف لـ `super_admin`.
- **`AdminDigitalIdNewPage`** (`app-digital-id-new`): إصدار بطاقة إداريّاً؛ مُنتقي مواطن + رفع صورة (`UploadsService.uploadCitizenPhoto`) + `DigitalIdCardsService.issue` (بتمرير `photo_bucket/photo_path/photo_sha256`).
- **`AdminDigitalIdDetailPage`** (`app-digital-id-detail`): تفصيل البطاقة وإدارتها عبر `DigitalIdCardsService`: `freeze`, `revoke`, `reissue`, `resetPin`, `update`, `delete`. الحذف لـ `super_admin`، والتعديل لـ `super_admin`/`id_issuer`. الصورة عبر `GET /citizens/{id}/photo`. (لا توجد نقطة GET-by-id للبطاقة، فيُجلب عبر `list({ limit: 200 })` ويُبحَث بالمعرّف.)
- **`AdminNftLicencesPage`** (`app-nft-licences`): سجلّ رخص NFT بألسنة حالة عبر `NftsService.list` مع تحميل بالمزيد ومرشّح `owner_did`.
- **`AdminNftLicenceDetailPage`** (`app-nft-licence-detail`): تفصيل الرخصة وسِجلّ الملكيّة (`get`+`history`)، والتحقّق الحيّ من السلسلة (`chainCheck`)، ونقل الملكيّة (`transfer`) — النقل مقصور على `super_admin/department_manager/registry_officer` (`TRANSFERABLE_ROLES`)، مع إلزام `notes_ar` لأسباب `court_order/correction`.
- **`AdminOfficersPage`** (`app-admin-users`, المسار `users`): إدارة المستخدمين بلسانين (مواطنون/موظفون). CRUD الموظّف عبر `OfficersService`: `create`, `update`, `setActive`, `resetPassword`.
- **`AdminPropertiesPage`** (`app-admin-properties`): الخريطة الكاملة + القائمة؛ يجمع `PropertiesService.list` مع `MapService.officerMap` (هندسة القطع) ويبقيهما متزامنَين عبر `mapFeatures` المشتقّة، مع تحديد متبادل بين القائمة والمضلّعات.
- **`AdminReportsPage`** (`app-admin-reports`): مؤشّرات وتوجّهات؛ يجلب بـ `Promise.all`: `GET /reports/summary`، و`PropertiesService.list({ limit: 100 })` (السقف الخادميّ 100)، و`GET /reports/trends?days=30`. يبني تفصيلات حسب النوع/الحالة/الشعبيّة ورسماً بيانيّاً للتوجّهات.
- **`AdminAuditPage`** (`app-admin-audit`): سجلّ التدقيق (غير قابل للتعديل) عبر `HttpClient` مباشرةً: `GET /audit` (بمرشّحات `action`, `entity_table`, `actor_kind`, `q`, `before_id`, `limit`)، و`GET /audit/stats`، و`GET /audit/{id}` للتفصيل. يدعم الوضع الحيّ (استطلاع دوريّ)، وتصدير CSV محليّاً.

---

## 6. العربيّة أوّلاً، RTL، ورموز العلامة

- المستند عربيّ RTL افتراضاً: `apps/web/src/index.html` يحمل `<html lang="ar" dir="rtl">`، ويُقلَب الاتجاه عند تبديل اللغة في `LayoutComponent`/`LoginPage`.
- لا يُستخدم Angular Material نهائيّاً؛ الأنماط مبنيّة على رموز SCSS للعلامة في `apps/web/src/styles.scss`:

```scss
:root {
  --primary: #0F172A;  /* slate-900 */
  --accent:  #F97316;  /* orange-500 */
  --warn:    #DC2626;  /* red-600 */
  --good:    #0891B2;  /* cyan-600 (بديل الأخضر) */
  --paper:   #FAFAF9;
  --ink:     #0F172A;
  --muted:   #64748B;
  --rule:    #E5E7EB;
  --font-ar: 'IBM Plex Sans Arabic', system-ui, sans-serif;
  --font-en: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- خطّ الواجهة الافتراضيّ عربيّ (`--font-ar`)، ويُبدَّل إلى `--font-en` عند `dir='ltr'`. تُبقى المعرّفات والرموز التقنيّة (رموز السند، أرقام الهويّة، عناوين السلسلة، `tx hash`) بخطّ أحاديّ لاتينيّ عبر الصنف `.mono`.
- كلّ رسائل التحقّق والأخطاء في النماذج عربيّة، وتُشتقّ رسائل الخادم من مغلّف الخطأ الموحّد `{ error: { message_ar, message_en } }`.
- Leaflet محمّل عالميّاً مرّةً واحدة (`@import 'leaflet/dist/leaflet.css'` في `styles.scss`)، وكلّ الخرائط تستخدم `addBaseTileLayer` لضمان عدم بقاء الخريطة فارغةً عند حجب مزوّد البلاطات.
