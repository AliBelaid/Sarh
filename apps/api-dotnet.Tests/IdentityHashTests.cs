using System.Text.RegularExpressions;
using Sarh.Api.Data.Entities;
using Sarh.Api.DigitalIdCards;

namespace Sarh.Api.Tests;

public class IdentityHashTests
{
    private const string DigitalIdNumber = "LY-11-2026-000101-0";
    private static readonly Guid FixedId = Guid.Parse("00000000-0000-0000-0000-000000000101");

    private static Citizen NewCitizen() => new()
    {
        Id = FixedId,
        FirstNameAr = "أحمد",
        FatherNameAr = "محمد",
        GrandfatherNameAr = "علي",
        FamilyNameAr = "الطرابلسي",
        BirthDate = new DateTime(1990, 1, 1),
        Gender = "male",
        LegacyNationalNo = "1199001010001",
    };

    [Fact]
    public void Compute_IsDeterministic_ForSameInputs()
    {
        var a = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);
        var b = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        Assert.Equal(a, b);
    }

    [Fact]
    public void Compute_Returns64LowercaseHexChars()
    {
        var hash = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        Assert.Matches(new Regex("^[0-9a-f]{64}$"), hash);
    }

    [Fact]
    public void Compute_ChangesWhen_BirthDateChanges()
    {
        var before = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        var c = NewCitizen();
        c.BirthDate = new DateTime(1990, 1, 2);
        var after = IdentityHash.Compute(c, DigitalIdNumber);

        Assert.NotEqual(before, after);
    }

    [Fact]
    public void Compute_IgnoresTimeComponent_OfBirthDate()
    {
        // The hash canonicalises birth date to yyyy-MM-dd, so a stray time
        // component must not change the fingerprint.
        var midnight = NewCitizen();
        var withTime = NewCitizen();
        withTime.BirthDate = new DateTime(1990, 1, 1, 13, 45, 0);

        Assert.Equal(
            IdentityHash.Compute(midnight, DigitalIdNumber),
            IdentityHash.Compute(withTime, DigitalIdNumber));
    }

    [Fact]
    public void Compute_ChangesWhen_FamilyNameChanges()
    {
        var before = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        var c = NewCitizen();
        c.FamilyNameAr = "المصراتي";
        var after = IdentityHash.Compute(c, DigitalIdNumber);

        Assert.NotEqual(before, after);
    }

    [Fact]
    public void Compute_ChangesWhen_DigitalIdNumberChanges()
    {
        var before = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);
        var after = IdentityHash.Compute(NewCitizen(), "LY-11-2026-000999-0");

        Assert.NotEqual(before, after);
    }

    [Fact]
    public void Compute_ChangesWhen_LegacyNationalNoChanges()
    {
        var before = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        var c = NewCitizen();
        c.LegacyNationalNo = "1199001010002";
        var after = IdentityHash.Compute(c, DigitalIdNumber);

        Assert.NotEqual(before, after);
    }

    [Fact]
    public void Compute_ChangesWhen_CitizenIdChanges()
    {
        var before = IdentityHash.Compute(NewCitizen(), DigitalIdNumber);

        var c = NewCitizen();
        c.Id = Guid.Parse("00000000-0000-0000-0000-000000000202");
        var after = IdentityHash.Compute(c, DigitalIdNumber);

        Assert.NotEqual(before, after);
    }

    [Fact]
    public void Compute_HandlesNullLegacyNationalNo_WithoutThrowing()
    {
        var c = NewCitizen();
        c.LegacyNationalNo = null;

        var hash = IdentityHash.Compute(c, DigitalIdNumber);

        Assert.Matches(new Regex("^[0-9a-f]{64}$"), hash);
    }

    [Fact]
    public void Compute_DistinguishesNullFromEmptyLegacyNationalNo_ConsistentlyHashable()
    {
        // Null is canonicalised to "" — so a null and an explicit "" must hash
        // identically, and both must differ from a populated value.
        var nullNo = NewCitizen();
        nullNo.LegacyNationalNo = null;
        var emptyNo = NewCitizen();
        emptyNo.LegacyNationalNo = "";

        Assert.Equal(
            IdentityHash.Compute(nullNo, DigitalIdNumber),
            IdentityHash.Compute(emptyNo, DigitalIdNumber));
        Assert.NotEqual(
            IdentityHash.Compute(nullNo, DigitalIdNumber),
            IdentityHash.Compute(NewCitizen(), DigitalIdNumber));
    }
}
