using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Sarh.Api.Data;

// =============================================================================
//  EF Core migrations for the Sarh database.
//
//  Each class maps 1:1 to a T-SQL file in infra/mssql/migrations (000–044). The
//  SQL is embedded into this assembly (see <EmbeddedResource> in Sarh.Api.csproj)
//  and replayed by SqlMigrationRunner.Apply. The .sql files remain the single
//  source of truth — they carry triggers, full-text catalogs, RLS policies,
//  stored procs, geography indexes and seed data that an EF model can't express.
//
//  This makes the schema buildable by the framework on any PC:
//      dotnet ef database update         (CLI)
//      dotnet run -- --migrate           (provision then exit)
//      app startup                       (auto-migrate, see Program.cs)
//  …with no manual .sql / .ps1 step. Applied steps are tracked in
//  __EFMigrationsHistory.
//
//  Migration Ids use a synthetic but correctly-formatted 14-digit timestamp
//  (yyyyMMddHHmmss) so EF orders and parses them; the suffix is the original
//  file name so `dotnet ef migrations list` stays readable.
//
//  Migrations are one-way (Down() is a no-op): the schema is delivered as
//  authoritative T-SQL; a destructive rollback is done with `pnpm db:reset`.
// =============================================================================

namespace Sarh.Api.Migrations;

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000000_000_database")]
public partial class M000_Database : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "000_database.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000001_001_extensions")]
public partial class M001_Extensions : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "001_extensions.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000002_002_lookup")]
public partial class M002_Lookup : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "002_lookup.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000003_003_citizens")]
public partial class M003_Citizens : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "003_citizens.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000004_004_digital_id")]
public partial class M004_DigitalId : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "004_digital_id.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000005_005_officers")]
public partial class M005_Officers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "005_officers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000006_006_properties")]
public partial class M006_Properties : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "006_properties.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000007_007_documents")]
public partial class M007_Documents : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "007_documents.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000008_008_workflow")]
public partial class M008_Workflow : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "008_workflow.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000009_009_ssi")]
public partial class M009_Ssi : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "009_ssi.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000010_010_notifications")]
public partial class M010_Notifications : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "010_notifications.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000011_011_audit")]
public partial class M011_Audit : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "011_audit.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000012_012_views")]
public partial class M012_Views : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "012_views.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000013_013_functions")]
public partial class M013_Functions : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "013_functions.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000014_014_triggers")]
public partial class M014_Triggers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "014_triggers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000015_015_rls")]
public partial class M015_Rls : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "015_rls.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000016_016_seed_regions")]
public partial class M016_SeedRegions : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "016_seed_regions.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000017_017_auth_helpers")]
public partial class M017_AuthHelpers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "017_auth_helpers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000018_018_nfc_card_secrets")]
public partial class M018_NfcCardSecrets : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "018_nfc_card_secrets.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000019_019_properties_helpers")]
public partial class M019_PropertiesHelpers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "019_properties_helpers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000020_020_workflow_helpers")]
public partial class M020_WorkflowHelpers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "020_workflow_helpers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000021_021_workflow_review_view")]
public partial class M021_WorkflowReviewView : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "021_workflow_review_view.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000022_022_ssi_extras")]
public partial class M022_SsiExtras : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "022_ssi_extras.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000023_023_verify_helpers")]
public partial class M023_VerifyHelpers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "023_verify_helpers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000024_024_seed_demo")]
public partial class M024_SeedDemo : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "024_seed_demo.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000025_025_demo_open_rls")]
public partial class M025_DemoOpenRls : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "025_demo_open_rls.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000026_026_seed_demo_officer")]
public partial class M026_SeedDemoOfficer : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "026_seed_demo_officer.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000027_027_fix_property_triggers")]
public partial class M027_FixPropertyTriggers : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "027_fix_property_triggers.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000028_028_property_nfts_ownership_history")]
public partial class M028_PropertyNftsOwnershipHistory : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "028_property_nfts_ownership_history.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000029_029_seed_mock_data")]
public partial class M029_SeedMockData : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "029_seed_mock_data.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000030_030_app_user_grant")]
public partial class M030_AppUserGrant : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "030_app_user_grant.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000031_031_digital_id_pin")]
public partial class M031_DigitalIdPin : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "031_digital_id_pin.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000032_032_drop_did_cards_rls")]
public partial class M032_DropDidCardsRls : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "032_drop_did_cards_rls.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000033_033_seed_card_pins")]
public partial class M033_SeedCardPins : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "033_seed_card_pins.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000034_034_seed_expanded_demo")]
public partial class M034_SeedExpandedDemo : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "034_seed_expanded_demo.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000035_035_properties_fulltext")]
public partial class M035_PropertiesFulltext : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "035_properties_fulltext.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000036_036_citizens_filtered_unique")]
public partial class M036_CitizensFilteredUnique : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "036_citizens_filtered_unique.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000037_037_more_filtered_unique")]
public partial class M037_MoreFilteredUnique : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "037_more_filtered_unique.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000038_038_property_nfts_minter_nullable")]
public partial class M038_PropertyNftsMinterNullable : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "038_property_nfts_minter_nullable.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000039_039_documented_area")]
public partial class M039_DocumentedArea : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "039_documented_area.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000040_040_offices")]
public partial class M040_Offices : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "040_offices.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000041_041_property_disputes")]
public partial class M041_PropertyDisputes : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "041_property_disputes.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000042_042_registry_links")]
public partial class M042_RegistryLinks : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "042_registry_links.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000043_043_property_map")]
public partial class M043_PropertyMap : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "043_property_map.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000044_044_seed_map_demo")]
public partial class M044_SeedMapDemo : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "044_seed_map_demo.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000045_045_property_location_conflict")]
public partial class M045_PropertyLocationConflict : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "045_property_location_conflict.sql");
    protected override void Down(MigrationBuilder b) { }
}

[DbContext(typeof(SarhDbContext))]
[Migration("20240101000046_046_property_conflict_kind")]
public partial class M046_PropertyConflictKind : Migration
{
    protected override void Up(MigrationBuilder b) => SqlMigrationRunner.Apply(b, "046_property_conflict_kind.sql");
    protected override void Down(MigrationBuilder b) { }
}
