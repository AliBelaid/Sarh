using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Workflow;

// Generates the official Sarh "صحيفة ملكية عقاريّة" PDF on approval. Output is a
// single A4 page rendered with QuestPDF in Arabic-RTL using the brand palette.
//
// PAdES envelope signing (CMS over CAdES) is intentionally NOT included here —
// that requires a CA-issued cert + iText/BouncyCastle; tracked separately.
// What this DOES guarantee:
//   1. The PDF is real bytes (callers can SHA-256 the result).
//   2. It carries the canonical fields a verifier needs.
//   3. It embeds the verify-URL QR pointing at verify.sarh.ly/{code}.
public sealed class DeedPdfBuilder
{
    static DeedPdfBuilder()
    {
        // QuestPDF Community License: free for projects under $1M annual revenue —
        // see https://www.questpdf.com/license.html. Set once per process.
        QuestPDF.Settings.License = LicenseType.Community;
    }

    private const string ColPrimary = "#0F172A";
    private const string ColAccent  = "#F97316";
    private const string ColInk     = "#0F172A";
    private const string ColMuted   = "#64748B";
    private const string ColRule    = "#E5E7EB";
    private const string ColPaper   = "#FAFAF9";
    private const string ColGood    = "#0891B2";

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

    public byte[] Render(DeedInputs input)
    {
        var qrPng = RenderQrPng(input.VerifyUrl);

        return Document.Create(doc =>
        {
            doc.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(18, Unit.Millimetre);
                page.PageColor(ColPaper);
                page.ContentFromRightToLeft();
                page.DefaultTextStyle(t => t
                    .FontFamily("Segoe UI", "Tahoma", "Arial")
                    .FontColor(ColInk)
                    .FontSize(11));

                page.Header().Element(c => Header(c, input));
                page.Content().Element(c => Body(c, input, qrPng));
                page.Footer().Element(c => Footer(c, input));
            });
        }).GeneratePdf();
    }

    private static void Header(IContainer container, DeedInputs input)
    {
        container.Column(col =>
        {
            // Tri-colour band (Libyan flag inspired)
            col.Item().Height(4).Row(r =>
            {
                r.RelativeItem().Background("#DC2626");
                r.RelativeItem().Background(ColAccent);
                r.RelativeItem().Background(ColGood);
            });

            col.Item().PaddingTop(12).PaddingBottom(10).Row(row =>
            {
                row.RelativeItem().Column(c =>
                {
                    c.Item().Text("صَرح").FontSize(20).Bold().FontColor(ColPrimary);
                    c.Item().Text("سجلّ العقارات الليبي").FontSize(10).FontColor(ColMuted);
                    c.Item().Text("LVCT — الرؤية الليبية للاتصالات والتقنية").FontSize(8).FontColor(ColMuted);
                });

                row.AutoItem().AlignRight().Column(c =>
                {
                    c.Item().AlignRight().Text("صحيفة ملكيّة عقاريّة").FontSize(15).Bold().FontColor(ColPrimary);
                    c.Item().AlignRight().PaddingTop(4)
                        .Text(input.PropertyCode).FontSize(13).Bold().FontColor(ColAccent);
                });
            });

            col.Item().PaddingBottom(6).LineHorizontal(1).LineColor(ColAccent);
        });
    }

    private static void Body(IContainer container, DeedInputs input, byte[] qrPng)
    {
        container.PaddingVertical(10).Column(col =>
        {
            col.Spacing(14);

            col.Item().Background(ColPaper).Border(1).BorderColor(ColRule).Padding(14).Column(c =>
            {
                c.Item().Text("بيانات العقار").Bold().FontColor(ColPrimary).FontSize(13);
                c.Item().PaddingTop(8).Element(KeyValueGrid(new (string, string)[]
                {
                    ("نوع العقار",       PropertyTypeAr(input.Property.PropertyType)),
                    ("المنطقة",          $"{input.Region.NameAr} ({input.Region.Code})"),
                    ("العنوان",          input.Property.AddressAr ?? "—"),
                    ("رقم القطعة",       input.Property.ParcelNumber ?? "—"),
                    ("رقم المخطّط",      input.Property.PlanNumber ?? "—"),
                    ("رقم البلوك",       input.Property.BlockNumber ?? "—"),
                    ("المساحة (م²)",     FormatArea(input.Property.AreaSqm)),
                }));
            });

            col.Item().Background(ColPaper).Border(1).BorderColor(ColRule).Padding(14).Column(c =>
            {
                c.Item().Text("بيانات المالك").Bold().FontColor(ColPrimary).FontSize(13);
                c.Item().PaddingTop(8).Element(KeyValueGrid(new (string, string)[]
                {
                    ("الاسم الكامل", FullNameAr(input.Owner)),
                    ("اسم الأم",     input.Owner.MotherNameAr ?? "—"),
                    ("الرقم الوطني القديم", input.Owner.LegacyNationalNo ?? "—"),
                }));
            });

            col.Item().Row(row =>
            {
                row.RelativeItem().Background(ColPaper).Border(1).BorderColor(ColRule).Padding(14).Column(c =>
                {
                    c.Item().Text("الاعتماد").Bold().FontColor(ColPrimary).FontSize(13);
                    c.Item().PaddingTop(8).Element(KeyValueGrid(new (string, string)[]
                    {
                        ("رقم القرار",         input.DecreeNumber),
                        ("الموظّف المعتِمد",   input.OfficerName),
                        ("تاريخ الاعتماد",     input.ApprovedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm")),
                    }));
                });

                row.ConstantItem(150).PaddingLeft(12).Column(c =>
                {
                    c.Item().AlignCenter().Text("التحقّق العام").Bold().FontColor(ColPrimary).FontSize(11);
                    c.Item().AlignCenter().PaddingTop(6).Width(110).Image(qrPng);
                    c.Item().AlignCenter().PaddingTop(6).Text(input.PropertyCode)
                        .FontSize(8).FontColor(ColMuted);
                    c.Item().AlignCenter().Text(StripScheme(input.VerifyUrl))
                        .FontSize(7).FontColor(ColMuted);
                });
            });

            col.Item().Background("#F8F2DD").Border(1).BorderColor(ColAccent).Padding(12).Column(c =>
            {
                c.Item().Text("ملاحظات قانونيّة").Bold().FontColor(ColPrimary).FontSize(11);
                c.Item().PaddingTop(4).Text(
                    "هذه الصحيفة صادرة آليّاً من نظام صَرح. تُعتمد رقمياً عبر خانة QR أعلاه. " +
                    "أي تعديل يدوي على هذا المستند يُبطل صلاحيته. السجل الإلكتروني المركزي هو المرجع.")
                    .FontSize(9).FontColor(ColMuted).LineHeight(1.5f);
            });
        });
    }

    private static Action<IContainer> KeyValueGrid((string Label, string Value)[] rows) => container =>
    {
        container.Column(col =>
        {
            col.Spacing(6);
            foreach (var (label, value) in rows)
            {
                col.Item().Row(r =>
                {
                    r.ConstantItem(150).Text(label).FontColor(ColMuted).FontSize(10);
                    r.RelativeItem().Text(value).Bold().FontColor(ColInk).FontSize(10.5f);
                });
            }
        });
    };

    private static void Footer(IContainer container, DeedInputs input)
    {
        container.Column(col =>
        {
            col.Item().PaddingTop(6).LineHorizontal(0.5f).LineColor(ColRule);
            col.Item().PaddingTop(4).Row(r =>
            {
                r.RelativeItem().Text(t =>
                {
                    t.Span("صحيفة ملكية #").FontColor(ColMuted).FontSize(8);
                    t.Span(input.PropertyCode).FontColor(ColPrimary).FontSize(8).Bold();
                });
                r.AutoItem().Text(t =>
                {
                    t.Span("صفحة ").FontColor(ColMuted).FontSize(8);
                    t.CurrentPageNumber().FontColor(ColPrimary).FontSize(8).Bold();
                    t.Span(" / ").FontColor(ColMuted).FontSize(8);
                    t.TotalPages().FontColor(ColPrimary).FontSize(8).Bold();
                });
            });
        });
    }

    private static byte[] RenderQrPng(string text)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        var png = new PngByteQRCode(data);
        return png.GetGraphic(8);
    }

    private static string FullNameAr(Citizen c)
    {
        var parts = new[] { c.FirstNameAr, c.FatherNameAr, c.GrandfatherNameAr, c.FamilyNameAr }
            .Where(p => !string.IsNullOrWhiteSpace(p));
        return string.Join(' ', parts).Trim();
    }

    private static string FormatArea(decimal? sqm) =>
        sqm.HasValue ? sqm.Value.ToString("N2") : "—";

    private static string PropertyTypeAr(string t) => t switch
    {
        "residential"  => "سكني",
        "agricultural" => "زراعي",
        "commercial"   => "تجاري",
        "governmental" => "حكومي",
        "industrial"   => "صناعي",
        "mixed"        => "مختلط",
        _ => t,
    };

    private static string StripScheme(string url) =>
        url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? url[8..] :
        url.StartsWith("http://",  StringComparison.OrdinalIgnoreCase) ? url[7..] : url;
}
