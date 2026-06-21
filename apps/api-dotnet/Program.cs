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

// One-off helper: wrap a raw minter private key with KMS_MASTER_KEY so the
// blob can be pasted into Sarh:Blockchain:MinterPrivateKeyEnc. Usage:
//   dotnet run -- --encrypt-minter-key 0x<rawhex>
if (args.Length >= 2 && args[0] == "--encrypt-minter-key")
{
    var master = Sarh.Api.Blockchain.KmsCrypto.MasterKeyFromConfig(builder.Configuration);
    Console.WriteLine(Sarh.Api.Blockchain.KmsCrypto.Encrypt(master, args[1].Trim()));
    return;
}

// Generate a fresh EVM keypair for the minter wallet. Fund the printed
// ADDRESS from a Sepolia faucet, then use PRIVATE_KEY in Sarh:Blockchain.
//   dotnet run -- --new-minter-wallet
if (args.Length >= 1 && args[0] == "--new-minter-wallet")
{
    var key = Nethereum.Signer.EthECKey.GenerateKey();
    Console.WriteLine("ADDRESS=" + key.GetPublicAddress());
    Console.WriteLine("PRIVATE_KEY=0x" + Convert.ToHexString(key.GetPrivateKeyAsBytes()).ToLowerInvariant());
    return;
}

// Deploy the SarhPropertyLicense contract using the configured minter key +
// RpcUrl, then print the address to paste into Sarh:Blockchain:ContractAddress.
// Requires the wallet to be funded with gas.
//   dotnet run -- --deploy-contract [path-to-.bin]
if (args.Length >= 1 && args[0] == "--deploy-contract")
{
    var bc = builder.Configuration.GetSection(Sarh.Api.Blockchain.BlockchainOptions.SectionName)
        .Get<Sarh.Api.Blockchain.BlockchainOptions>() ?? new Sarh.Api.Blockchain.BlockchainOptions();
    var pk = !string.IsNullOrWhiteSpace(bc.MinterPrivateKey)
        ? bc.MinterPrivateKey.Trim()
        : (!string.IsNullOrWhiteSpace(bc.MinterPrivateKeyEnc)
            ? Sarh.Api.Blockchain.KmsCrypto.Decrypt(Sarh.Api.Blockchain.KmsCrypto.MasterKeyFromConfig(builder.Configuration), bc.MinterPrivateKeyEnc)
            : "");
    if (string.IsNullOrWhiteSpace(pk)) { Console.WriteLine("ERROR: set Sarh:Blockchain:MinterPrivateKey (or ...Enc) first."); return; }

    var binPath = args.Length >= 2 ? args[1]
        : Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "infra", "blockchain", "build", "SarhPropertyLicense_sol_SarhPropertyLicense.bin");
    if (!File.Exists(binPath)) { Console.WriteLine($"ERROR: bytecode not found at {binPath}. Compile first (see infra/blockchain)."); return; }
    var bytecode = File.ReadAllText(binPath).Trim();
    if (!bytecode.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) bytecode = "0x" + bytecode;
    var abiPath = binPath[..^4] + ".abi";
    var abi = File.Exists(abiPath) ? File.ReadAllText(abiPath).Trim() : "[]";

    var account = new Nethereum.Web3.Accounts.Account(pk, bc.EffectiveChainId);
    var web3 = new Nethereum.Web3.Web3(account, bc.RpcUrl);
    var bal = await web3.Eth.GetBalance.SendRequestAsync(account.Address);
    Console.WriteLine($"Deploying from {account.Address} (balance {Nethereum.Util.UnitConversion.Convert.FromWei(bal.Value):0.######} ETH) to {bc.Network} chainId {bc.EffectiveChainId}…");
    if (bal.Value == 0) { Console.WriteLine($"ERROR: wallet {account.Address} has 0 ETH — fund it from a Sepolia faucet first."); return; }
    var receipt = await web3.Eth.DeployContract.SendRequestAndWaitForReceiptAsync(abi, bytecode, account.Address, new Nethereum.Hex.HexTypes.HexBigInteger(2_000_000));
    Console.WriteLine("CONTRACT_ADDRESS=" + receipt.ContractAddress);
    Console.WriteLine("DEPLOY_TX=" + receipt.TransactionHash);
    return;
}

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

builder.Services.AddSignalR();

// Rate limiting (defense in depth — see Sarh.Api.Common.RateLimitPolicies).
// Always registered so [EnableRateLimiting] attributes resolve; the middleware
// is only wired into the pipeline when Sarh:RateLimit:Enabled is true.
var rateLimitOptions = builder.Configuration.GetSection(Sarh.Api.Common.RateLimitOptions.SectionName)
    .Get<Sarh.Api.Common.RateLimitOptions>() ?? new Sarh.Api.Common.RateLimitOptions();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    o.AddPolicy(Sarh.Api.Common.RateLimitPolicies.Auth, ctx =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: Sarh.Api.Common.RateLimitPolicies.ClientKey(
                ctx.Request.Headers["X-Forwarded-For"], ctx.Connection.RemoteIpAddress?.ToString()),
            _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.AuthPermitPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    o.AddPolicy(Sarh.Api.Common.RateLimitPolicies.Write, ctx =>
        System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: Sarh.Api.Common.RateLimitPolicies.WriteKey(
                ctx.User.FindFirst("sub")?.Value,
                ctx.Request.Headers["X-Forwarded-For"], ctx.Connection.RemoteIpAddress?.ToString()),
            _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = rateLimitOptions.WritePermitPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    // Emit the standard Sarh error envelope (not an empty 429 body).
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        ctx.HttpContext.Response.ContentType = "application/json; charset=utf-8";
        var body = new SarhErrorEnvelope
        {
            Error = new SarhErrorBody
            {
                Code = "ERR_RATE_LIMITED",
                MessageAr = "عدد كبير من الطلبات. يرجى المحاولة بعد قليل.",
                MessageEn = "Too many requests. Please try again shortly.",
            },
        };
        await ctx.HttpContext.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(body, JsonDefaults.Options), ct);
    };
});

// EF Core → SQL Server.
var connStr = builder.Configuration["Sarh:ConnectionString"]
    ?? throw new InvalidOperationException("Sarh:ConnectionString is required.");
// IHttpContextAccessor + the session-context interceptor drive SQL Server
// Row-Level Security (audit_log / digital_id_cards) from each request's
// identity. Without it, RLS hides every audited row and the audit log reads
// empty. See Data/SessionContextInterceptor.cs.
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<Sarh.Api.Data.SessionContextInterceptor>();
builder.Services.AddDbContext<SarhDbContext>((sp, opt) =>
    opt.UseSqlServer(connStr)
       .AddInterceptors(sp.GetRequiredService<Sarh.Api.Data.SessionContextInterceptor>()));

// JWT bearer — HS256 with the same secret NestJS used.
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<Sarh.Api.Citizens.CitizensService>();
builder.Services.AddScoped<Sarh.Api.Officers.OfficersService>();
builder.Services.AddScoped<Sarh.Api.Properties.PropertiesService>();
builder.Services.AddSingleton<Sarh.Api.Workflow.DeedPdfBuilder>();
// Deed signing — detached CMS/PKCS#7 over the deed PDF. Self-signed dev
// authority by default; set DEED_SIGNING_CERT_PATH to a real PFX in production.
builder.Services.Configure<Sarh.Api.Workflow.DeedSigningOptions>(
    builder.Configuration.GetSection(Sarh.Api.Workflow.DeedSigningOptions.SectionName));
builder.Services.AddSingleton<Sarh.Api.Workflow.DeedSigningService>();
builder.Services.AddScoped<Sarh.Api.Workflow.ReviewService>();
builder.Services.AddScoped<Sarh.Api.Workflow.LicenseService>();
builder.Services.AddScoped<Sarh.Api.Workflow.NftsService>();
builder.Services.AddScoped<Sarh.Api.Workflow.TransferService>();
builder.Services.AddScoped<Sarh.Api.Disputes.DisputesService>();
builder.Services.AddScoped<Sarh.Api.DigitalIdCards.DigitalIdNumberService>();
builder.Services.AddScoped<Sarh.Api.DigitalIdCards.DigitalIdCardsService>();
builder.Services.AddScoped<Sarh.Api.Nfc.NfcKeyStoreService>();
builder.Services.AddScoped<Sarh.Api.Nfc.NfcService>();
builder.Services.AddSingleton<Sarh.Api.Storage.StorageService>();

// Blockchain + IPFS. Mode "stub" → deterministic in-process fake (default).
// Mode "real"/"ethereum" → EthereumBlockchainService (Nethereum) against the
// configured RpcUrl; reads work with just the URL, writes also need
// ContractAddress + a minter key. IPFS stays stubbed (local-FS) for now.
builder.Services.Configure<Sarh.Api.Blockchain.BlockchainOptions>(
    builder.Configuration.GetSection(Sarh.Api.Blockchain.BlockchainOptions.SectionName));
builder.Services.Configure<Sarh.Api.Blockchain.IpfsOptions>(
    builder.Configuration.GetSection(Sarh.Api.Blockchain.IpfsOptions.SectionName));

var blockchainOptions = builder.Configuration
    .GetSection(Sarh.Api.Blockchain.BlockchainOptions.SectionName)
    .Get<Sarh.Api.Blockchain.BlockchainOptions>() ?? new Sarh.Api.Blockchain.BlockchainOptions();
if (blockchainOptions.IsReal)
    builder.Services.AddSingleton<Sarh.Api.Blockchain.IBlockchainService, Sarh.Api.Blockchain.EthereumBlockchainService>();
else
    builder.Services.AddSingleton<Sarh.Api.Blockchain.IBlockchainService, Sarh.Api.Blockchain.StubBlockchainService>();
builder.Services.AddSingleton<Sarh.Api.Blockchain.IIpfsService, Sarh.Api.Blockchain.StubIpfsService>();

// SSI (Hyperledger Aries / ACA-Py) — placeholder issuer by default. Set
// ACA_PY_ADMIN_URL (or Sarh:Ssi:Mode=acapy) to talk to a real agent; see
// infra/docker/aca-py/README.md.
var ssiSection = builder.Configuration.GetSection(Sarh.Api.Ssi.SsiOptions.SectionName);
builder.Services.Configure<Sarh.Api.Ssi.SsiOptions>(ssiSection);
var ssiOptions = ssiSection.Get<Sarh.Api.Ssi.SsiOptions>() ?? new Sarh.Api.Ssi.SsiOptions();
if (ssiOptions.UseAcaPy)
{
    builder.Services.AddHttpClient<Sarh.Api.Ssi.AcaPyClient>(c =>
        c.Timeout = TimeSpan.FromSeconds(15));
    builder.Services.AddScoped<Sarh.Api.Ssi.ISsiService, Sarh.Api.Ssi.AcaPySsiService>();
}
else
{
    builder.Services.AddScoped<Sarh.Api.Ssi.ISsiService, Sarh.Api.Ssi.PlaceholderSsiService>();
}

builder.Services.AddScoped<Sarh.Api.Map.MapService>();
builder.Services.AddScoped<Sarh.Api.Data.DemoData.DemoDataService>();
builder.Services.AddScoped<Sarh.Api.Verify.VerifyService>();
builder.Services.AddScoped<Sarh.Api.Audit.AuditService>();
builder.Services.AddScoped<Sarh.Api.Audit.AuditActionFilter>();
builder.Services.AddScoped<Sarh.Api.Notifications.NotificationsService>();

// SMS — log-only by default. Set SMS_GATEWAY_URL (or Sarh:Sms:Mode=libyana)
// to send approval/rejection/issuance alerts through the Libyana gateway.
var smsSection = builder.Configuration.GetSection(Sarh.Api.Notifications.SmsOptions.SectionName);
builder.Services.Configure<Sarh.Api.Notifications.SmsOptions>(smsSection);
var smsOptions = smsSection.Get<Sarh.Api.Notifications.SmsOptions>() ?? new Sarh.Api.Notifications.SmsOptions();
if (smsOptions.UseGateway)
{
    builder.Services.AddHttpClient<Sarh.Api.Notifications.ISmsSender, Sarh.Api.Notifications.LibyanaSmsSender>(c =>
        c.Timeout = TimeSpan.FromSeconds(15));
}
else
{
    builder.Services.AddScoped<Sarh.Api.Notifications.ISmsSender, Sarh.Api.Notifications.LogSmsSender>();
}

// Boot-time seed: re-stamps demo bcrypt hashes and warns if 029 didn't run.
builder.Services.AddHostedService<Sarh.Api.Data.DbSeeder>();

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
            // SignalR can't set the Authorization header on the WebSocket/SSE
            // handshake, so its JS client passes the JWT as ?access_token=…
            // Pull it in for /hubs requests so hub auth works like REST.
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken)
                    && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    ctx.Token = accessToken;
                }
                return Task.CompletedTask;
            },
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

// ---- Database provisioning (EF Core migrations) ----
// Builds/updates the schema through the framework so a fresh PC needs no manual .sql/.ps1
// step. Runs on the privileged migration connection (Windows auth by default — the runtime
// sarh_app login cannot run DDL). Turn off with "Sarh:AutoMigrate": false (recommended in
// production, where you instead run `dotnet run -- --migrate` or `dotnet ef database update`
// during deploy with a privileged account).
{
    var migrateOnly = args.Contains("--migrate");
    var autoMigrate = app.Configuration.GetValue("Sarh:AutoMigrate", true);
    if (migrateOnly || autoMigrate)
    {
        var migrationLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Sarh.Migrations");
        try
        {
            var migrationConn = Sarh.Api.Data.MigrationConnection.Resolve(app.Configuration);
            // When false, the demo-seed migrations are skipped on a fresh build so the
            // DB comes up empty (data then comes from the DbSeeder / landing load button).
            var seedDemoViaMigrations = app.Configuration.GetValue("Sarh:SeedDemoViaMigrations", true);
            await Sarh.Api.Data.EfDatabaseBootstrapper.RunAsync(migrationConn, migrationLogger, seedDemoViaMigrations);
        }
        catch (Exception ex)
        {
            migrationLogger.LogError(ex,
                "Database provisioning failed — the schema was NOT created. " +
                "The migration runs DDL (CREATE DATABASE/LOGIN) which the low-privilege runtime " +
                "login 'sarh_app' cannot do, so it uses a privileged connection. On this machine " +
                "that connection has no rights. Fix it one of two ways: (1) set " +
                "'Sarh:MigrationConnectionString' (appsettings) or SARH_MIGRATION_CONNECTION (env) " +
                "to a privileged SQL login, e.g. \"Server=localhost,1433;Database=sarh;User Id=sa;" +
                "Password=<sa-pwd>;TrustServerCertificate=True;Encrypt=True;\"; or (2) make your " +
                "Windows account a SQL sysadmin. Then re-run `dotnet run -- --migrate`.");
            if (migrateOnly)
            {
                throw; // surface the failure to CI / the operator
            }
        }

        if (migrateOnly)
        {
            return; // provisioning command — don't start the web host
        }
    }
}

// One-off: snapshot the live DB into Data/DemoData/seed-data.json so the file
// committed to the repo reflects the current dataset. Run with:
//   dotnet run -- --export-demo-data
if (args.Contains("--export-demo-data"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var demo = scope.ServiceProvider.GetRequiredService<Sarh.Api.Data.DemoData.DemoDataService>();
    var total = await demo.ExportToFileAsync(CancellationToken.None);
    Console.WriteLine($"Exported {total} row(s) to {demo.SeedFilePath()}");
    return;
}

app.UseMiddleware<SarhExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(o => o.SwaggerEndpoint("/swagger/v1/swagger.json", "Sarh API"));
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// Wire the limiter after auth so the write policy can partition by JWT subject.
if (rateLimitOptions.Enabled)
{
    app.UseRateLimiter();
}

app.MapControllers();
app.MapHub<Sarh.Api.Notifications.NotificationsHub>("/hubs/notifications");

app.Run();
