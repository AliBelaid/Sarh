<div dir="rtl">

# توثيق مشروع منصة صَرح (Sarh)

> **الاسم (عربي):** صَرح — **الاسم (إنجليزي):** Sarh
> **الوصف:** منصّة السجل العقاري الليبي + إصدار الهوية الرقمية.
> **الجهة المالكة:** الرؤية الليبية للاتصالات والتقنية (LVCT).
> **اللغة:** عربية أولاً (RTL) لكل الواجهات.

هذا المجلّد يحتوي التوثيق الكامل للمشروع، مقسّماً إلى فصول. يُنصح بقراءتها بالترتيب.

## فهرس الفصول

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
