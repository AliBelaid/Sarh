using System.Text.Json;

namespace Sarh.Api.Common.Errors;

public sealed class SarhExceptionMiddleware(RequestDelegate next, ILogger<SarhExceptionMiddleware> log)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (SarhException ex)
        {
            await WriteEnvelope(ctx, ex.StatusCode, new SarhErrorBody
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
            await WriteEnvelope(ctx, 500, new SarhErrorBody
            {
                Code = "ERR_INTERNAL",
                MessageAr = "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.",
                MessageEn = "Internal server error",
            });
        }
    }

    private static async Task WriteEnvelope(HttpContext ctx, int status, SarhErrorBody body)
    {
        if (ctx.Response.HasStarted) return;
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        var payload = new SarhErrorEnvelope { Error = body };
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
