using System.Text.Json.Serialization;

namespace Sijilli.Api.Common.Errors;

public sealed class SijilliErrorBody
{
    [JsonPropertyName("code")] public required string Code { get; init; }
    [JsonPropertyName("message_ar")] public required string MessageAr { get; init; }
    [JsonPropertyName("message_en")] public required string MessageEn { get; init; }
    [JsonPropertyName("details")] public object? Details { get; init; }
}

public sealed class SijilliErrorEnvelope
{
    [JsonPropertyName("error")] public required SijilliErrorBody Error { get; init; }
}

public sealed class SijilliException : Exception
{
    public int StatusCode { get; }
    public string Code { get; }
    public string MessageAr { get; }
    public string MessageEn { get; }
    public object? Details { get; }

    public SijilliException(int statusCode, string code, string messageAr, string messageEn, object? details = null)
        : base(messageEn)
    {
        StatusCode = statusCode;
        Code = code;
        MessageAr = messageAr;
        MessageEn = messageEn;
        Details = details;
    }

    public static SijilliException Unauthorized() =>
        new(401, "ERR_UNAUTHORIZED",
            "غير مصرّح بالوصول. يرجى تسجيل الدخول.",
            "Unauthorized — please sign in.");

    public static SijilliException Forbidden(string reasonAr = "صلاحياتك لا تسمح بهذه العملية.") =>
        new(403, "ERR_FORBIDDEN", reasonAr, "Forbidden");

    public static SijilliException NotFound(string entityAr, string entityEn) =>
        new(404, "ERR_NOT_FOUND",
            $"لم يتم العثور على {entityAr}.",
            $"{entityEn} not found");

    public static SijilliException Conflict(string messageAr, string messageEn) =>
        new(409, "ERR_CONFLICT", messageAr, messageEn);

    public static SijilliException Validation(string messageAr, string messageEn, object? details = null) =>
        new(400, "ERR_VALIDATION", messageAr, messageEn, details);

    public static SijilliException Upstream(string messageEn, object? details = null) =>
        new(502, "ERR_UPSTREAM",
            "خطأ من خدمة خارجية، يرجى المحاولة لاحقاً.",
            messageEn, details);
}
