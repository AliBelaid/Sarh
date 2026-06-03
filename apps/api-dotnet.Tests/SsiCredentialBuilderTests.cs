using System.Text.RegularExpressions;
using Sarh.Api.Data.Entities;
using Sarh.Api.Ssi;

namespace Sarh.Api.Tests;

public class SsiCredentialBuilderTests
{
    private static readonly Guid SeedA = Guid.Parse("00000000-0000-0000-0000-000000000101");
    private static readonly Guid SeedB = Guid.Parse("00000000-0000-0000-0000-000000000202");

    private static Citizen NewCitizen() => new()
    {
        Id = SeedA,
        FirstNameAr = "أحمد",
        FatherNameAr = "محمد",
        GrandfatherNameAr = "علي",
        FamilyNameAr = "الطرابلسي",
        BirthDate = new DateTime(1990, 1, 1),
        Gender = "male",
    };

    // ---------------- DID derivation ----------------
    [Fact]
    public void DeriveLocalDid_IsDeterministic()
    {
        Assert.Equal(
            SsiCredentialBuilder.DeriveLocalDid(SeedA),
            SsiCredentialBuilder.DeriveLocalDid(SeedA));
    }

    [Fact]
    public void DeriveLocalDid_HasExpectedShape()
    {
        var did = SsiCredentialBuilder.DeriveLocalDid(SeedA);
        Assert.Matches(new Regex("^did:sov:LY:[0-9a-f]{16}$"), did);
    }

    [Fact]
    public void DeriveLocalDid_DistinguishesPrefixSharingSeedUuids()
    {
        // Demo seed UUIDs all start 00000000-… — the discriminating bytes are
        // at the tail, so the two DIDs must differ.
        Assert.NotEqual(
            SsiCredentialBuilder.DeriveLocalDid(SeedA),
            SsiCredentialBuilder.DeriveLocalDid(SeedB));
    }

    [Fact]
    public void DeriveLocalDid_RespectsDidMethod()
    {
        var did = SsiCredentialBuilder.DeriveLocalDid(SeedA, "key");
        Assert.StartsWith("did:key:LY:", did);
    }

    [Fact]
    public void DeriveLocalVerkey_IsDeterministic64Hex()
    {
        var a = SsiCredentialBuilder.DeriveLocalVerkey(SeedA);
        var b = SsiCredentialBuilder.DeriveLocalVerkey(SeedA);
        Assert.Equal(a, b);
        Assert.Matches(new Regex("^[0-9a-f]{64}$"), a);
    }

    // ---------------- DigitalId attributes ----------------
    [Fact]
    public void DigitalIdAttributes_ContainsSchemaKeys()
    {
        var attrs = SsiCredentialBuilder.DigitalIdAttributes(NewCitizen(), "LY-11-2026-000101-0", "abc");
        Assert.Equal(new[] { "full_name", "dob", "digital_id_number", "photo_hash" }, attrs.Keys.ToArray());
    }

    [Fact]
    public void DigitalIdAttributes_FormatsDob_AsDateOnly_IgnoringTime()
    {
        var withTime = NewCitizen();
        withTime.BirthDate = new DateTime(1990, 1, 1, 13, 45, 0);
        var attrs = SsiCredentialBuilder.DigitalIdAttributes(withTime, "LY-11-2026-000101-0", null);
        Assert.Equal("1990-01-01", attrs["dob"]);
    }

    [Fact]
    public void DigitalIdAttributes_JoinsQuadrupleName()
    {
        var attrs = SsiCredentialBuilder.DigitalIdAttributes(NewCitizen(), "LY-11-2026-000101-0", null);
        Assert.Equal("أحمد محمد علي الطرابلسي", attrs["full_name"]);
    }

    [Fact]
    public void DigitalIdAttributes_NullPhotoHash_BecomesEmptyString()
    {
        var attrs = SsiCredentialBuilder.DigitalIdAttributes(NewCitizen(), "LY-11-2026-000101-0", null);
        Assert.Equal("", attrs["photo_hash"]);
    }

    // ---------------- PropertyDeed attributes ----------------
    [Fact]
    public void PropertyDeedAttributes_ContainsSchemaKeys_AndOwnerDid()
    {
        var prop = new Property { Id = Guid.NewGuid(), PropertyCode = "LY-11-2026-000007", PropertyType = "residential", AreaSqm = 412.5m };
        var attrs = SsiCredentialBuilder.PropertyDeedAttributes(prop, "did:sov:LY:abc", null);
        Assert.Equal(new[] { "property_code", "owner_did", "type", "area_sqm", "polygon_hash" }, attrs.Keys.ToArray());
        Assert.Equal("did:sov:LY:abc", attrs["owner_did"]);
        Assert.Equal("412.50", attrs["area_sqm"]);
    }

    // ---------------- polygon hash ----------------
    [Fact]
    public void PolygonHash_Is64Hex_AndDeterministic()
    {
        var geo = "{\"type\":\"Polygon\",\"coordinates\":[[[13.1,32.8],[13.2,32.8],[13.2,32.9],[13.1,32.8]]]}";
        var a = SsiCredentialBuilder.PolygonHash(geo, Guid.Empty);
        var b = SsiCredentialBuilder.PolygonHash(geo, Guid.Empty);
        Assert.Equal(a, b);
        Assert.Matches(new Regex("^[0-9a-f]{64}$"), a);
    }

    [Fact]
    public void PolygonHash_DiffersForDifferentPolygons()
    {
        var a = SsiCredentialBuilder.PolygonHash("{\"a\":1}", Guid.Empty);
        var b = SsiCredentialBuilder.PolygonHash("{\"a\":2}", Guid.Empty);
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void PolygonHash_FallsBackToPropertyId_WhenGeoJsonNull()
    {
        var byId = SsiCredentialBuilder.PolygonHash(null, SeedA);
        var byOther = SsiCredentialBuilder.PolygonHash(null, SeedB);
        Assert.Matches(new Regex("^[0-9a-f]{64}$"), byId);
        Assert.NotEqual(byId, byOther);
    }
}
