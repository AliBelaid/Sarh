using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Sarh.Api.Auth;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Map canonical Sarh env names (SARH_JWT_SECRET, MSSQL_*, KMS_MASTER_KEY,
// STORAGE_ROOT, CORS_ORIGINS, …) onto the .NET "Sarh:*" config keys before
// the rest of bootstrap reads them.
Sarh.Api.Common.EnvBootstrap.ApplyEnvOverrides(builder.Configuration);

// JSON: snake_case keys, ignore null on write (parity with NestJS responses).
builder.Services.AddControllers(o =>
    {
        // Audit interceptor — fires on success after every controller method
        // tagged with [Audit]; no-op for untagged methods.
        o.Filters.Add<Sarh.Api.Audit.AuditActionFilter>();
    })
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
        o.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS — same set as NestJS.
var origins = builder.Configuration.GetSection("Sarh:CorsOrigins").Get<string[]>()
    ?? new[] { "http://localhost:4200", "http://127.0.0.1:4200" };
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// EF Core → SQL Server.
var connStr = builder.Configuration["Sarh:ConnectionString"]
    ?? throw new InvalidOperationException("Sarh:ConnectionString is required.");
builder.Services.AddDbContext<SarhDbContext>(opt => opt.UseSqlServer(connStr));

// JWT bearer — HS256 with the same secret NestJS used.
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<Sarh.Api.Citizens.CitizensService>();
builder.Services.AddScoped<Sarh.Api.Properties.PropertiesService>();
builder.Services.AddSingleton<Sarh.Api.Workflow.DeedPdfBuilder>();
builder.Services.AddScoped<Sarh.Api.Workflow.ReviewService>();
builder.Services.AddScoped<Sarh.Api.DigitalIdCards.DigitalIdNumberService>();
builder.Services.AddScoped<Sarh.Api.DigitalIdCards.DigitalIdCardsService>();
builder.Services.AddScoped<Sarh.Api.Nfc.NfcKeyStoreService>();
builder.Services.AddScoped<Sarh.Api.Nfc.NfcService>();
builder.Services.AddSingleton<Sarh.Api.Storage.StorageService>();
builder.Services.AddScoped<Sarh.Api.Verify.VerifyService>();
builder.Services.AddScoped<Sarh.Api.Audit.AuditService>();
builder.Services.AddScoped<Sarh.Api.Audit.AuditActionFilter>();
builder.Services.AddScoped<Sarh.Api.Notifications.NotificationsService>();

var jwtBootstrap = new JwtTokenService(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = false;
        o.SaveToken = true;
        // Preserve JSON claim names (sub, email, sarh_role, …) instead of
        // letting Microsoft.IdentityModel remap "sub" to ClaimTypes.NameIdentifier.
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtBootstrap.SigningKey,
            // NestJS payload uses `sub` directly as the user id; don't let
            // ASP.NET remap it to ClaimTypes.NameIdentifier.
            NameClaimType = "sub",
        };
        o.Events = new JwtBearerEvents
        {
            OnChallenge = ctx =>
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = 401;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                var body = new SarhErrorEnvelope
                {
                    Error = new SarhErrorBody
                    {
                        Code = "ERR_UNAUTHORIZED",
                        MessageAr = "غير مصرّح بالوصول. يرجى تسجيل الدخول.",
                        MessageEn = "Unauthorized — please sign in.",
                    },
                };
                return ctx.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(body, JsonDefaults.Options));
            },
            OnForbidden = ctx =>
            {
                ctx.Response.StatusCode = 403;
                ctx.Response.ContentType = "application/json; charset=utf-8";
                var body = new SarhErrorEnvelope
                {
                    Error = new SarhErrorBody
                    {
                        Code = "ERR_FORBIDDEN",
                        MessageAr = "صلاحياتك لا تسمح بهذه العملية.",
                        MessageEn = "Forbidden",
                    },
                };
                return ctx.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(body, JsonDefaults.Options));
            },
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseMiddleware<SarhExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(o => o.SwaggerEndpoint("/swagger/v1/swagger.json", "Sarh API"));
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Liveness probe lives on HealthController (controllers route table) so nginx
// /healthz hits it without the inline endpoint causing AmbiguousMatchException.

app.Run();
