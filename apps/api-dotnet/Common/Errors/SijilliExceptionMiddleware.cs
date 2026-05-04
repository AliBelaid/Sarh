using System.Text.Json;

namespace Sijilli.Api.Common.Errors;

public sealed class SijilliExceptionMiddleware(RequestDelegate next, ILogger<SijilliExceptionMiddleware> log)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (SijilliException ex)
        {
            await WriteEnvelope(ctx, ex.StatusCode, new SijilliErrorBody
            {
                Code = ex.Code,
                MessageAr = ex.MessageAr,
                MessageEn = ex.MessageEn,
                Details = ex.Details,
            });
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Unhandled error on {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
            await WriteEnvelope(ctx, 500, new SijilliErrorBody
            {
                Code = "ERR_INTERNAL",
                MessageAr = "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.",
                MessageEn = "Internal server error",
            });
        }
    }

    private static async Task WriteEnvelope(HttpContext ctx, int status, SijilliErrorBody body)
    {
        if (ctx.Response.HasStarted) return;
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        var payload = new SijilliErrorEnvelope { Error = body };
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(payload, JsonDefaults.Options));
    }
}

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower,
    };
}
