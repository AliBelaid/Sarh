using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Sijilli.Api.Auth;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;

var builder = WebApplication.CreateBuilder(args);

// Map canonical Sijilli env names (SIJILLI_JWT_SECRET, MSSQL_*, KMS_MASTER_KEY,
// STORAGE_ROOT, CORS_ORIGINS, …) onto the .NET "Sijilli:*" config keys before
// the rest of bootstrap reads them.
Sijilli.Api.Common.EnvBootstrap.ApplyEnvOverrides(builder.Configuration);

// JSON: snake_case keys, ignore null on write (parity with NestJS responses).
builder.Services.AddControllers(o =>
    {
        // Audit interceptor — fires on success after every controller method
        // tagged with [Audit]; no-op for untagged methods.
        o.Filters.Add<Sijilli.Api.Audit.AuditActionFilter>();
    })
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
        o.JsonSerializerOptions.DictionaryKeyPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS — same set as NestJS.
var origins = builder.Configuration.GetSection("Sijilli:CorsOrigins").Get<string[]>()
    ?? new[] { "http://localhost:4200", "http://127.0.0.1:4200" };
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// EF Core → SQL Server.
var connStr = builder.Configuration["Sijilli:ConnectionString"]
    ?? throw new InvalidOperationException("Sijilli:ConnectionString is required.");
builder.Services.AddDbContext<SijilliDbContext>(opt => opt.UseSqlServer(connStr));

// JWT bearer — HS256 with the same secret NestJS used.
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<Sijilli.Api.Citizens.CitizensService>();
builder.Services.AddScoped<Sijilli.Api.Properties.PropertiesService>();
builder.Services.AddScoped<Sijilli.Api.Workflow.ReviewService>();
builder.Services.AddScoped<Sijilli.Api.DigitalIdCards.DigitalIdNumberService>();
builder.Services.AddScoped<Sijilli.Api.DigitalIdCards.DigitalIdCardsService>();
builder.Services.AddScoped<Sijilli.Api.Nfc.NfcKeyStoreService>();
builder.Services.AddScoped<Sijilli.Api.Nfc.NfcService>();
builder.Services.AddSingleton<Sijilli.Api.Storage.StorageService>();
builder.Services.AddScoped<Sijilli.Api.Verify.VerifyService>();
builder.Services.AddScoped<Sijilli.Api.Audit.AuditService>();
builder.Services.AddScoped<Sijilli.Api.Audit.AuditActionFilter>();
builder.Services.AddScoped<Sijilli.Api.Notifications.NotificationsService>();

var jwtBootstrap = new JwtTokenService(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.RequireHttpsMetadata = false;
        o.SaveToken = true;
        // Preserve JSON claim names (sub, email, sijilli_role, …) instead of
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
                var body = new SijilliErrorEnvelope
                {
                    Error = new SijilliErrorBody
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
                var body = new SijilliErrorEnvelope
                {
                    Error = new SijilliErrorBody
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

app.UseMiddleware<SijilliExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(o => o.SwaggerEndpoint("/swagger/v1/swagger.json", "Sijilli API"));
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Liveness probe — same shape NestJS exposed; nginx /healthz proxies to it.
app.MapGet("/api/v1/health", () => Results.Ok(new { ok = true, ts = DateTimeOffset.UtcNow }))
   .AllowAnonymous();

app.Run();
