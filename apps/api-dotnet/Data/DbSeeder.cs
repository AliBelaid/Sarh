using Microsoft.EntityFrameworkCore;

namespace Sarh.Api.Data;

/// <summary>
/// Boot-time seeder: probes the DB, then ensures all demo data exists using
/// raw SQL (no sqlcmd dependency). Safe to run on any machine after migrations.
/// </summary>
public sealed class DbSeeder(
    IServiceProvider services,
    IHostEnvironment env,
    ILogger<DbSeeder> logger) : IHostedService
{
    private const string DemoPassword = "Demo!12345";
    private const string DemoCardPin = "123456";
    private const int ConnectRetries = 5;
    private static readonly TimeSpan ConnectRetryDelay = TimeSpan.FromSeconds(2);

    public Task StartAsync(CancellationToken ct)
    {
        _ = Task.Run(() => RunAsync(ct), ct);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            await using var scope = services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<SarhDbContext>();

            if (!await WaitForDatabaseAsync(db, ct))
            {
                logger.LogWarning(
                    "DbSeeder: database unreachable after {N} attempts. " +
                    "Run `pnpm db:reset` to create the sarh DB.",
                    ConnectRetries);
                return;
            }

            if (!env.IsDevelopment()) return;

            var hash = BCrypt.Net.BCrypt.HashPassword(DemoPassword, 12);
            var pinHash = BCrypt.Net.BCrypt.HashPassword(DemoCardPin, 10);

            await SeedAuthUsersAsync(db, hash, ct);
            await SeedCitizensAsync(db, ct);
            await SeedOfficersAsync(db, ct);
            await SeedDigitalIdCardsAsync(db, ct);
            await StampPinHashesAsync(db, pinHash, ct);
            await SeedPropertiesAsync(db, ct);
            await SeedNotificationsAsync(db, ct);

            var cc = await db.Citizens.CountAsync(ct);
            var pc = await db.Properties.CountAsync(ct);
            var ac = await db.AuthUsers.CountAsync(ct);
            logger.LogInformation("DbSeeder: ready. citizens={C}, properties={P}, auth_users={A}.", cc, pc, ac);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "DbSeeder: error during seed.");
        }
    }

    private async Task<bool> WaitForDatabaseAsync(SarhDbContext db, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= ConnectRetries; attempt++)
        {
            if (await db.Database.CanConnectAsync(ct)) return true;
            if (attempt == ConnectRetries) break;
            logger.LogInformation("DbSeeder: database not ready ({A}/{T}), retrying…", attempt, ConnectRetries);
            await Task.Delay(ConnectRetryDelay, ct);
        }
        return false;
    }

    private async Task SeedAuthUsersAsync(SarhDbContext db, string hash, CancellationToken ct)
    {
        var accounts = new[]
        {
            ("00000000-0000-0000-0000-000000000003", "demo@sarh.ly",    "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000001\"}"),
            ("00000000-0000-0000-0000-000000000010", "officer@sarh.ly", "{\"sarh_role\":\"registry_officer\"}"),
            ("00000000-0000-0000-0000-000000000211", "manager@sarh.ly", "{\"sarh_role\":\"department_manager\"}"),
            ("00000000-0000-0000-0000-000000000212", "idissuer@sarh.ly","{\"sarh_role\":\"id_issuer\"}"),
            ("00000000-0000-0000-0000-000000000213", "reviewer@sarh.ly","{\"sarh_role\":\"reviewer\"}"),
            ("00000000-0000-0000-0000-000000000214", "admin@sarh.ly",   "{\"sarh_role\":\"super_admin\"}"),
            ("00000000-0000-0000-0000-000000000111", "ahmed@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000101\"}"),
            ("00000000-0000-0000-0000-000000000112", "fatima@sarh.ly",  "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000102\"}"),
            ("00000000-0000-0000-0000-000000000113", "khaled@sarh.ly",  "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000103\"}"),
            ("00000000-0000-0000-0000-000000000114", "layla@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000104\"}"),
            ("00000000-0000-0000-0000-000000000115", "omar@sarh.ly",    "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000105\"}"),
            ("00000000-0000-0000-0000-000000000116", "amina@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000106\"}"),
            ("00000000-0000-0000-0000-000000000117", "youssef@sarh.ly", "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000107\"}"),
            ("00000000-0000-0000-0000-000000000118", "hanan@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000108\"}"),
            ("00000000-0000-0000-0000-000000000119", "salem@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000109\"}"),
            ("00000000-0000-0000-0000-000000000120", "nadia@sarh.ly",   "{\"sarh_role\":\"citizen\",\"citizen_id\":\"00000000-0000-0000-0000-000000000110\"}"),
        };

        var inserted = 0;
        foreach (var (id, email, meta) in accounts)
        {
            var n = await db.Database.ExecuteSqlRawAsync(
                """
                IF NOT EXISTS (SELECT 1 FROM auth_users WHERE id = @id)
                    INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
                    VALUES (@id, @email, @pw, SYSDATETIMEOFFSET(), @meta, @umeta)
                ELSE
                    UPDATE auth_users SET encrypted_password = @pw, raw_app_meta_data = @meta, updated_at = SYSDATETIMEOFFSET() WHERE id = @id
                """,
                [
                    new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse(id)),
                    new Microsoft.Data.SqlClient.SqlParameter("@email", email),
                    new Microsoft.Data.SqlClient.SqlParameter("@pw", hash),
                    new Microsoft.Data.SqlClient.SqlParameter("@meta", meta),
                    new Microsoft.Data.SqlClient.SqlParameter("@umeta", "{}"),
                ], ct);
            if (n > 0) inserted++;
        }
        if (inserted > 0)
            logger.LogInformation("DbSeeder: seeded/updated {N} auth user(s).", inserted);
    }

    private async Task SeedCitizensAsync(SarhDbContext db, CancellationToken ct)
    {
        // (id, first_ar, father_ar, grand_ar, family_ar, gender, dob, region, phone, email, legacy_no)
        var citizens = new[]
        {
            ("00000000-0000-0000-0000-000000000001", "مستخدم", "تجريبي", "صرح",    "ديمو",     "male",   "1990-01-01", 11, "",               "",                              ""),
            ("00000000-0000-0000-0000-000000000101", "أحمد",   "محمد",   "علي",     "البارودي",  "male",   "1985-03-15", 11, "+218910000101", "ahmed.albaroudi@example.ly",  "118503150001"),
            ("00000000-0000-0000-0000-000000000102", "فاطمة",  "يوسف",   "عبدالله", "الزروق",    "female", "1990-07-22", 11, "+218910000102", "fatima.alzarrouq@example.ly", "119007220002"),
            ("00000000-0000-0000-0000-000000000103", "خالد",   "عمر",    "سالم",    "العبيدي",   "male",   "1978-11-04", 21, "+218910000103", "khaled.alobeidi@example.ly",  "217811040003"),
            ("00000000-0000-0000-0000-000000000104", "ليلى",   "صالح",   "أحمد",    "الترهوني",  "female", "1995-01-30", 15, "+218910000104", "layla.altarhouni@example.ly", "159501300004"),
            ("00000000-0000-0000-0000-000000000105", "عمر",    "سليمان", "محمد",    "الهادي",    "male",   "1982-06-18", 22, "+218920000105", "omar.alhadi@example.ly",      "228206180005"),
            ("00000000-0000-0000-0000-000000000106", "أمينة",  "عبدالرحمن","حسن",   "المجبري",   "female", "1988-12-03", 13, "+218920000106", "amina.almajbari@example.ly",  "138812030006"),
            ("00000000-0000-0000-0000-000000000107", "يوسف",   "إبراهيم","خالد",    "القذافي",   "male",   "1975-04-28", 21, "+218920000107", "youssef.alqaddafi@example.ly","217504280007"),
            ("00000000-0000-0000-0000-000000000108", "حنان",   "مصطفى", "عمار",    "بن عمران",  "female", "1992-09-10", 24, "+218920000108", "hanan.benamran@example.ly",   "249209100008"),
            ("00000000-0000-0000-0000-000000000109", "سالم",   "عبدالسلام","فتحي",  "الجهمي",    "male",   "1980-02-14", 31, "+218920000109", "salem.aljahmi@example.ly",    "318002140009"),
            ("00000000-0000-0000-0000-000000000110", "نادية",  "أحمد",   "علي",     "الشريف",    "female", "1997-08-25", 12, "+218920000110", "nadia.alsharif@example.ly",   "129708250010"),
        };

        var inserted = 0;
        foreach (var c in citizens)
        {
            var n = await db.Database.ExecuteSqlRawAsync(
                """
                IF NOT EXISTS (SELECT 1 FROM citizens WHERE id = @id)
                    INSERT INTO citizens (id, first_name_ar, father_name_ar, grandfather_name_ar, family_name_ar,
                                          gender, birth_date, nationality, region_id, phone, email, legacy_national_no, is_active)
                    VALUES (@id, @f, @fa, @g, @fam, @gen, @dob, N'Libyan', @reg, NULLIF(@ph,N''), NULLIF(@em,N''), NULLIF(@leg,N''), 1)
                """,
                [
                    new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse(c.Item1)),
                    new Microsoft.Data.SqlClient.SqlParameter("@f", c.Item2),
                    new Microsoft.Data.SqlClient.SqlParameter("@fa", c.Item3),
                    new Microsoft.Data.SqlClient.SqlParameter("@g", c.Item4),
                    new Microsoft.Data.SqlClient.SqlParameter("@fam", c.Item5),
                    new Microsoft.Data.SqlClient.SqlParameter("@gen", c.Item6),
                    new Microsoft.Data.SqlClient.SqlParameter("@dob", c.Item7),
                    new Microsoft.Data.SqlClient.SqlParameter("@reg", c.Item8),
                    new Microsoft.Data.SqlClient.SqlParameter("@ph", c.Item9),
                    new Microsoft.Data.SqlClient.SqlParameter("@em", c.Item10),
                    new Microsoft.Data.SqlClient.SqlParameter("@leg", c.Item11),
                ], ct);
            if (n > 0) inserted++;
        }
        if (inserted > 0)
            logger.LogInformation("DbSeeder: created {N} citizen(s).", inserted);
    }

    private async Task SeedOfficersAsync(SarhDbContext db, CancellationToken ct)
    {
        // (id, auth_user_id, emp_no, name_ar, name_en, role, region, email, permissions)
        var officers = new[]
        {
            ("00000000-0000-0000-0000-000000000011", "00000000-0000-0000-0000-000000000010", "EMP-DEMO-1", "موظف ديمو",       "Demo Officer",        "registry_officer",   11, "officer@sarh.ly",  "{\"can_review\":true,\"can_approve\":true}"),
            ("00000000-0000-0000-0000-000000000201", "00000000-0000-0000-0000-000000000211", "EMP-MGR-1",  "مدير القسم",       "Department Manager",  "department_manager", 11, "manager@sarh.ly",  "{\"can_final_approve\":true,\"can_mint_nft\":true}"),
            ("00000000-0000-0000-0000-000000000202", "00000000-0000-0000-0000-000000000212", "EMP-IDI-1",  "مُصدِر الهوية",    "ID Issuer",           "id_issuer",          11, "idissuer@sarh.ly", "{\"can_issue_card\":true,\"can_revoke_card\":true}"),
            ("00000000-0000-0000-0000-000000000203", "00000000-0000-0000-0000-000000000213", "EMP-REV-1",  "مراجع تقني",       "Technical Reviewer",  "reviewer",           11, "reviewer@sarh.ly", "{\"can_review\":true}"),
            ("00000000-0000-0000-0000-000000000204", "00000000-0000-0000-0000-000000000214", "ADM-001",    "المسؤول العام",     "Super Admin",         "super_admin",        11, "admin@sarh.ly",    "{\"can_review\":true,\"can_approve\":true,\"can_final_approve\":true,\"can_issue_card\":true,\"can_revoke_card\":true,\"can_manage_users\":true}"),
        };

        var inserted = 0;
        foreach (var o in officers)
        {
            var n = await db.Database.ExecuteSqlRawAsync(
                """
                IF NOT EXISTS (SELECT 1 FROM officers WHERE id = @id)
                    INSERT INTO officers (id, auth_user_id, employee_no, full_name_ar, full_name_en,
                                          role, region_id, email, permissions, is_active)
                    VALUES (@id, @auth, @emp, @nar, @nen, @role, @reg, @email, @perms, 1)
                """,
                [
                    new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse(o.Item1)),
                    new Microsoft.Data.SqlClient.SqlParameter("@auth", Guid.Parse(o.Item2)),
                    new Microsoft.Data.SqlClient.SqlParameter("@emp", o.Item3),
                    new Microsoft.Data.SqlClient.SqlParameter("@nar", o.Item4),
                    new Microsoft.Data.SqlClient.SqlParameter("@nen", o.Item5),
                    new Microsoft.Data.SqlClient.SqlParameter("@role", o.Item6),
                    new Microsoft.Data.SqlClient.SqlParameter("@reg", o.Item7),
                    new Microsoft.Data.SqlClient.SqlParameter("@email", o.Item8),
                    new Microsoft.Data.SqlClient.SqlParameter("@perms", o.Item9),
                ], ct);
            if (n > 0) inserted++;
        }
        if (inserted > 0)
            logger.LogInformation("DbSeeder: created {N} officer(s).", inserted);
    }

    private async Task SeedDigitalIdCardsAsync(SarhDbContext db, CancellationToken ct)
    {
        // (card_id, citizen_id, did_no, serial, nfc_uid, sov_did, status)
        var cards = new[]
        {
            ("00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000001", "LY-99-2026-000000-0", "DEMO-CARD-0001",  "",                  "",                        "active"),
            ("00000000-0000-0000-0000-000000000301", "00000000-0000-0000-0000-000000000101", "LY-11-2026-000101-0", "CARD-DEMO-0101",  "04A1B2C3D4E5F601",  "did:sov:LY:demo:ahmed",   "active"),
            ("00000000-0000-0000-0000-000000000302", "00000000-0000-0000-0000-000000000102", "LY-11-2026-000102-0", "CARD-DEMO-0102",  "04A1B2C3D4E5F602",  "did:sov:LY:demo:fatima",  "active"),
            ("00000000-0000-0000-0000-000000000303", "00000000-0000-0000-0000-000000000103", "LY-21-2026-000103-0", "CARD-DEMO-0103",  "04A1B2C3D4E5F603",  "did:sov:LY:demo:khaled",  "active"),
            ("00000000-0000-0000-0000-000000000304", "00000000-0000-0000-0000-000000000104", "LY-15-2026-000104-0", "CARD-DEMO-0104",  "04A1B2C3D4E5F604",  "did:sov:LY:demo:layla",   "frozen"),
            ("00000000-0000-0000-0000-000000000305", "00000000-0000-0000-0000-000000000105", "LY-22-2026-000105-0", "CARD-DEMO-0105",  "04A1B2C3D4E5F605",  "did:sov:LY:demo:omar",    "active"),
            ("00000000-0000-0000-0000-000000000306", "00000000-0000-0000-0000-000000000106", "LY-13-2026-000106-0", "CARD-DEMO-0106",  "04A1B2C3D4E5F606",  "did:sov:LY:demo:amina",   "revoked"),
            ("00000000-0000-0000-0000-000000000307", "00000000-0000-0000-0000-000000000107", "LY-21-2026-000107-0", "CARD-DEMO-0107",  "04A1B2C3D4E5F607",  "did:sov:LY:demo:youssef", "active"),
            ("00000000-0000-0000-0000-000000000308", "00000000-0000-0000-0000-000000000108", "LY-24-2026-000108-0", "CARD-DEMO-0108",  "04A1B2C3D4E5F608",  "did:sov:LY:demo:hanan",   "expired"),
            ("00000000-0000-0000-0000-000000000309", "00000000-0000-0000-0000-000000000109", "LY-31-2026-000109-0", "CARD-DEMO-0109",  "04A1B2C3D4E5F609",  "did:sov:LY:demo:salem",   "active"),
            ("00000000-0000-0000-0000-000000000310", "00000000-0000-0000-0000-000000000110", "LY-12-2026-000110-0", "CARD-DEMO-0110",  "04A1B2C3D4E5F610",  "did:sov:LY:demo:nadia",   "lost"),
        };

        var inserted = 0;
        foreach (var c in cards)
        {
            var n = await db.Database.ExecuteSqlRawAsync(
                """
                IF EXISTS (SELECT 1 FROM citizens WHERE id = @cit)
                AND NOT EXISTS (SELECT 1 FROM digital_id_cards WHERE id = @id)
                    INSERT INTO digital_id_cards (id, citizen_id, digital_id_number, card_serial,
                        nfc_uid, did, issued_at, expires_at, status)
                    VALUES (@id, @cit, @did, @ser, NULLIF(@nfc,N''), NULLIF(@sov,N''),
                        SYSDATETIMEOFFSET(), DATEADD(YEAR, 10, SYSDATETIMEOFFSET()), @st)
                """,
                [
                    new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse(c.Item1)),
                    new Microsoft.Data.SqlClient.SqlParameter("@cit", Guid.Parse(c.Item2)),
                    new Microsoft.Data.SqlClient.SqlParameter("@did", c.Item3),
                    new Microsoft.Data.SqlClient.SqlParameter("@ser", c.Item4),
                    new Microsoft.Data.SqlClient.SqlParameter("@nfc", c.Item5),
                    new Microsoft.Data.SqlClient.SqlParameter("@sov", c.Item6),
                    new Microsoft.Data.SqlClient.SqlParameter("@st", c.Item7),
                ], ct);
            if (n > 0) inserted++;
        }
        if (inserted > 0)
            logger.LogInformation("DbSeeder: created {N} digital ID card(s).", inserted);
    }

    private async Task StampPinHashesAsync(SarhDbContext db, string pinHash, CancellationToken ct)
    {
        var stamped = await db.Database.ExecuteSqlRawAsync(
            """
            UPDATE digital_id_cards
            SET pin_hash = @ph, pin_set_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET()
            WHERE pin_hash IS NULL OR pin_hash = N''
            """,
            [new Microsoft.Data.SqlClient.SqlParameter("@ph", pinHash)], ct);
        if (stamped > 0)
            logger.LogInformation("DbSeeder: stamped PIN onto {N} card(s).", stamped);
    }

    private async Task SeedPropertiesAsync(SarhDbContext db, CancellationToken ct)
    {
        // Properties with geography need raw SQL. No polygon for the 034 batch.
        // (id, owner_id, code, parcel, type, region, address, area, status, polygon_wkt_or_null, days_ago)
        var props = new (string Id, string Owner, string Code, string Type, int Region, string Addr, decimal Area, string Status, string? Wkt, int DaysAgo)[]
        {
            ("00000000-0000-0000-0000-000000000401", "00000000-0000-0000-0000-000000000101", "PRP-2026-0101", "residential",  11, "طرابلس - شارع الجمهورية", 12345.67m, "minted",
             "POLYGON((13.1800 32.8800, 13.1810 32.8800, 13.1810 32.8810, 13.1800 32.8810, 13.1800 32.8800))", 30),
            ("00000000-0000-0000-0000-000000000402", "00000000-0000-0000-0000-000000000102", "PRP-2026-0102", "residential",  11, "طرابلس - شارع الفتح", 8910.50m, "approved",
             "POLYGON((13.1700 32.8800, 13.1710 32.8800, 13.1710 32.8810, 13.1700 32.8810, 13.1700 32.8800))", 25),
            ("00000000-0000-0000-0000-000000000403", "00000000-0000-0000-0000-000000000103", "PRP-2026-0103", "commercial",   21, "بنغازي - شارع جمال عبدالناصر", 5500.00m, "under_review",
             "POLYGON((20.0670 32.1190, 20.0680 32.1190, 20.0680 32.1200, 20.0670 32.1200, 20.0670 32.1190))", 8),
            ("00000000-0000-0000-0000-000000000404", "00000000-0000-0000-0000-000000000104", "PRP-2026-0104", "agricultural", 15, "مصراتة - منطقة الغيران", 50000.00m, "pending",
             "POLYGON((15.0900 32.3700, 15.0925 32.3700, 15.0925 32.3725, 15.0900 32.3725, 15.0900 32.3700))", 1),
            ("00000000-0000-0000-0000-000000000405", "00000000-0000-0000-0000-000000000105", "PRP-2026-0105", "residential",  22, "بنغازي، الفويهات", 320.0m, "approved", null, 15),
            ("00000000-0000-0000-0000-000000000406", "00000000-0000-0000-0000-000000000106", "PRP-2026-0106", "commercial",   13, "الزاوية، المركز", 850.0m, "under_review", null, 5),
            ("00000000-0000-0000-0000-000000000407", "00000000-0000-0000-0000-000000000107", "PRP-2026-0107", "agricultural", 21, "بنغازي، قمينس", 12500.0m, "pending", null, 20),
            ("00000000-0000-0000-0000-000000000408", "00000000-0000-0000-0000-000000000108", "PRP-2026-0108", "residential",  24, "درنة، المدينة القديمة", 180.0m, "rejected", null, 30),
            ("00000000-0000-0000-0000-000000000409", "00000000-0000-0000-0000-000000000109", "PRP-2026-0109", "commercial",   31, "سبها، المركز", 600.0m, "pending", null, 2),
            ("00000000-0000-0000-0000-000000000410", "00000000-0000-0000-0000-000000000110", "PRP-2026-0110", "residential",  12, "الجفارة، جنزور", 275.0m, "approved", null, 12),
        };

        var inserted = 0;
        foreach (var p in props)
        {
            var polyExpr = p.Wkt is not null
                ? $"geography::STGeomFromText(N'{p.Wkt}', 4326)"
                : "NULL";
            var sql = $"""
                IF EXISTS (SELECT 1 FROM citizens WHERE id = @owner)
                AND NOT EXISTS (SELECT 1 FROM properties WHERE id = @id)
                    INSERT INTO properties (id, owner_citizen_id, property_code, property_type,
                        region_id, address_ar, area_sqm, status, submitted_at, boundary_polygon)
                    VALUES (@id, @owner, @code, @type, @region, @addr, @area, @status,
                        DATEADD(DAY, -@days, SYSDATETIMEOFFSET()), {polyExpr})
                """;
            var n = await db.Database.ExecuteSqlRawAsync(sql,
                [
                    new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse(p.Id)),
                    new Microsoft.Data.SqlClient.SqlParameter("@owner", Guid.Parse(p.Owner)),
                    new Microsoft.Data.SqlClient.SqlParameter("@code", p.Code),
                    new Microsoft.Data.SqlClient.SqlParameter("@type", p.Type),
                    new Microsoft.Data.SqlClient.SqlParameter("@region", p.Region),
                    new Microsoft.Data.SqlClient.SqlParameter("@addr", p.Addr),
                    new Microsoft.Data.SqlClient.SqlParameter("@area", p.Area),
                    new Microsoft.Data.SqlClient.SqlParameter("@status", p.Status),
                    new Microsoft.Data.SqlClient.SqlParameter("@days", p.DaysAgo),
                ], ct);
            if (n > 0) inserted++;
        }
        if (inserted > 0)
            logger.LogInformation("DbSeeder: created {N} propert(ies).", inserted);
    }

    private async Task SeedNotificationsAsync(SarhDbContext db, CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync(
            """
            IF NOT EXISTS (SELECT 1 FROM notifications WHERE id = @id)
                INSERT INTO notifications (id, recipient_citizen_id, title_ar, body_ar, kind, delivery_status)
                VALUES (@id, @cit, @title, @body, N'in_app', N'queued')
            """,
            [
                new Microsoft.Data.SqlClient.SqlParameter("@id", Guid.Parse("00000000-0000-0000-0000-000000000801")),
                new Microsoft.Data.SqlClient.SqlParameter("@cit", Guid.Parse("00000000-0000-0000-0000-000000000001")),
                new Microsoft.Data.SqlClient.SqlParameter("@title", "مرحبا بك في سجلي"),
                new Microsoft.Data.SqlClient.SqlParameter("@body", "تم إنشاء حسابك بنجاح. يمكنك الآن تقديم طلب تسجيل عقار."),
            ], ct);
    }
}
