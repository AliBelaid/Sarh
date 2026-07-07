<div dir="rtl">

# توثيق مشروع منصة صَرح (Sarh)

> **الاسم (عربي):** صَرح — **الاسم (إنجليزي):** Sarh
> **الوصف:** منصّة السجل العقاري الليبي + إصدار الهوية الرقمية.
> **الجهة المالكة:** الرؤية الليبية للاتصالات والتقنية (LVCT).
> **اللغة:** عربية أولاً (RTL) لكل الواجهات.

هذا المجلّد يحتوي التوثيق الكامل للمشروع، مقسّماً إلى فصول. يُنصح بقراءتها بالترتيب.

## ⭐ التوثيق التقني الكامل للنظام (جديد)

توثيق تقني شامل مُولَّد من قراءة الشيفرة المصدرية مباشرةً، يغطّي وصف النظام والفئات ومرجع واجهات API الكامل والواجهة الخلفية والأمامية (Angular + Flutter) وميزة **توقيع سندات PDF للمواطن والتحقّق منها**. المصدر بصيغة Markdown في ملفّات `system-01…10-*.ar.md`، والمُخرجات:

- **PDF:** `Sarh-System-Documentation.pdf` (≈217 صفحة، A4، RTL)
- **Word:** `Sarh-System-Documentation.doc` (يفتح مباشرةً في Microsoft Word مع الحفاظ على الاتجاه RTL)

لإعادة التوليد بعد أي تعديل على فصول `system-*.ar.md`:

```bash
node docs/print-full-system-docs.mjs          # يولّد PDF + DOC
node docs/print-full-system-docs.mjs --shots  # مع لقطات تحقّق
```

| # | الفصل | الملف |
|---|-------|-------|
| ١ | نظرة عامة على النظام والمعمارية | `system-01-overview.ar.md` |
| ٢ | مرجع واجهات API — الهوية والأشخاص | `system-02-api-identity.ar.md` |
| ٣ | مرجع واجهات API — العقارات والخرائط والنزاعات والتقارير | `system-03-api-property.ar.md` |
| ٤ | مرجع واجهات API — البطاقات وNFC وSSI والبلوكتشين | `system-04-api-idcards.ar.md` |
| ٥ | فئات الواجهة الخلفية وخدماتها — الجزء الأول | `system-05-classes-a.ar.md` |
| ٦ | فئات الواجهة الخلفية وخدماتها — الجزء الثاني | `system-06-classes-b.ar.md` |
| ٧ | طبقة البيانات والاستمرارية | `system-07-data.ar.md` |
| ٨ | الواجهة الأمامية — تطبيق الويب (Angular) | `system-08-angular.ar.md` |
| ٩ | تطبيق الجوّال (Flutter) | `system-09-flutter.ar.md` |
| ١٠ | **توقيع ملف PDF — إصدار سند/تصريحة موقّعة للمواطن والتحقّق منها** | `system-10-signing.ar.md` |

## فهرس الفصول (التوثيق السابق)

| # | الفصل | الملف | المحتوى |
|---|-------|-------|---------|
| ١ | المقدمة | [01-introduction.ar.md](01-introduction.ar.md) | الخلفية، المشكلة، الأهداف، النطاق، أصحاب المصلحة، المنهجية. |
| ٢ | تحليل المتطلبات | [02-requirements.ar.md](02-requirements.ar.md) | المتطلبات الوظيفية وغير الوظيفية، الأدوار، حالات الاستخدام، القيود. |
| ٣ | البنية والتصميم | [03-architecture-and-design.ar.md](03-architecture-and-design.ar.md) | المعمارية، الوحدات، قاعدة البيانات، تدفّقات العمل، نموذج الأمان، الخرائط. |
| ٤–٥ | التنفيذ والاختبار | [04-05-implementation-and-testing.ar.md](04-05-implementation-and-testing.ar.md) | بيئة العمل، البنية البرمجية، الخوارزميات، التحديات، خطة وأنواع الاختبارات، UAT. |
| ٦ | النتائج والخاتمة | [06-conclusion.ar.md](06-conclusion.ar.md) | تحقيق الأهداف، التحديات، الأعمال المستقبلية، الخلاصة. |
| ٧ | مراجعة: البلوكتشين والمخططات | [07-blockchain-erd-class-review.ar.md](07-blockchain-erd-class-review.ar.md) | المخطط المفاهيمي + المنطقي (UML) + مخطط الفئات، وشرح ومرجعية كود اعتماد الأرض على البلوكتشين (سكّ NFT). PDF: `Sarh-Blockchain-ERD-Review.pdf`. |
| ٨ | توثيق النمذجة (كامل) | [08-data-and-class-models.ar.md](08-data-and-class-models.ar.md) | المخطط المفاهيمي + المنطقي (UML) + مخطط الفئات + **قاموس بيانات كامل** لكل الجداول + مصفوفة تتبّع. PDF: `Sarh-Data-Class-Models.pdf`. |

## مصادر مرجعية داخل المستودع

- مخطط المعمارية: `docs/architecture-diagram.svg`
- قاموس البيانات: `docs/data-dictionary.md`
- مراجعة الأمان: `docs/security-review.md`
- التصميم وتجربة المستخدم: `docs/ui-ux.md`
- ترحيلات قاعدة البيانات (مصدر الحقيقة للمخطط): `infra/mssql/migrations/000…046.sql`
- تعليمات البناء للمساعد البرمجي: `CLAUDE.md`

## كيفية توليد نسخة PDF (اختياري)

ملفات التوثيق بصيغة Markdown ويمكن تحويلها إلى PDF عبر Pandoc:

```bash
pandoc docs/project/01-introduction.ar.md docs/project/02-requirements.ar.md \
       docs/project/03-architecture-and-design.ar.md \
       docs/project/04-05-implementation-and-testing.ar.md \
       docs/project/06-conclusion.ar.md \
       -o docs/project/Sarh-Documentation.pdf --pdf-engine=xelatex -V dir=rtl -V mainfont="Amiri"
```

</div>
