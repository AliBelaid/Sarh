using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Common;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Workflow;

public sealed class ListNftsQuery
{
    public string? Cursor { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 20;
    public string? Status { get; set; }
    public string? Network { get; set; }
    [FromQuery(Name = "property_id")] public Guid? PropertyId { get; set; }
    [FromQuery(Name = "owner_did")] public string? OwnerDid { get; set; }
}

public sealed class NftLicenseView
{
    public Guid Id { get; init; }
    public Guid PropertyId { get; init; }
    public string TokenId { get; init; } = "";
    public string ContractAddress { get; init; } = "";
    public string Network { get; init; } = "";
    public string Standard { get; init; } = "";
    public string OwnerDid { get; init; } = "";
    public string OwnerAddress { get; init; } = "";
    public string MetadataUri { get; init; } = "";
    public string MetadataSha256 { get; init; } = "";
    public string MintTxHash { get; init; } = "";
    public long? MintBlockNumber { get; init; }
    public Guid MintedByOfficerId { get; init; }
    public DateTimeOffset MintedAt { get; init; }
    public string Status { get; init; } = "";

    // Joined columns from properties — saves the UI a round-trip per row.
    public string? PropertyCode { get; init; }
    public Guid? OwnerCitizenId { get; init; }

    public static NftLicenseView From(PropertyNft n, string? propertyCode, Guid? ownerCitizenId) => new()
    {
        Id = n.Id,
        PropertyId = n.PropertyId,
        TokenId = n.TokenId,
        ContractAddress = n.ContractAddress,
        Network = n.Network,
        Standard = n.Standard,
        OwnerDid = n.OwnerDid,
        OwnerAddress = n.OwnerAddress ?? "",
        MetadataUri = n.MetadataUri,
        MetadataSha256 = n.MetadataSha256,
        MintTxHash = n.MintTxHash,
        MintBlockNumber = n.MintBlockNumber,
        MintedByOfficerId = n.MintedByOfficerId,
        MintedAt = n.MintedAt,
        Status = n.Status,
        PropertyCode = propertyCode,
        OwnerCitizenId = ownerCitizenId,
    };
}

// Read-only ledger of NFT licences. Writes go through LicenseService
// (mint) or the future TransferService; this surface is for admin /
// auditor browsing.
public sealed class NftsService(SarhDbContext db)
{
    public async Task<CursorPage<NftLicenseView>> ListAsync(ListNftsQuery q, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var query = from n in db.PropertyNfts.AsNoTracking()
                    join p in db.Properties.AsNoTracking() on n.PropertyId equals p.Id
                    select new { n, p };

        if (!string.IsNullOrWhiteSpace(q.Status))
            query = query.Where(x => x.n.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Network))
            query = query.Where(x => x.n.Network == q.Network);
        if (q.PropertyId is Guid pid)
            query = query.Where(x => x.n.PropertyId == pid);
        if (!string.IsNullOrWhiteSpace(q.OwnerDid))
            query = query.Where(x => x.n.OwnerDid == q.OwnerDid);

        // Region scoping for non-super-admin / non-auditor: only NFTs whose
        // underlying property is in the actor's region.
        if (actor.Role is not ("super_admin" or "auditor")
            && actor.RegionId is int aRegion)
        {
            query = query.Where(x => x.p.RegionId == aRegion);
        }

        if (!string.IsNullOrWhiteSpace(q.Cursor)
            && DateTimeOffset.TryParse(q.Cursor, out var cursorTs))
        {
            query = query.Where(x => x.n.MintedAt < cursorTs);
        }

        var rows = await query
            .OrderByDescending(x => x.n.MintedAt)
            .ThenByDescending(x => x.n.Id)
            .Take(q.Limit + 1)
            .ToListAsync(ct);

        string? nextCursor = null;
        if (rows.Count > q.Limit)
        {
            nextCursor = rows[q.Limit].n.MintedAt.ToString("o");
            rows = rows.Take(q.Limit).ToList();
        }

        return new CursorPage<NftLicenseView>
        {
            Items = rows.Select(x => NftLicenseView.From(x.n, x.p.PropertyCode, x.p.OwnerCitizenId)).ToList(),
            NextCursor = nextCursor,
        };
    }

    public async Task<NftLicenseView> GetByIdAsync(Guid id, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        var row = await (from n in db.PropertyNfts.AsNoTracking()
                         join p in db.Properties.AsNoTracking() on n.PropertyId equals p.Id
                         where n.Id == id
                         select new { n, p }).FirstOrDefaultAsync(ct)
            ?? throw SarhException.NotFound("الرخصة", "NFT licence");

        if (actor.Role is not ("super_admin" or "auditor")
            && actor.RegionId is int aRegion
            && row.p.RegionId != aRegion)
        {
            throw SarhException.Forbidden("الرخصة خارج منطقتك.");
        }

        return NftLicenseView.From(row.n, row.p.PropertyCode, row.p.OwnerCitizenId);
    }

    // Ownership timeline for a single NFT — append-only chain from the
    // initial_mint row through every transfer. Rows come back oldest-first
    // (chain ordering); the UI renders them as a vertical timeline.
    public async Task<List<OwnershipEventView>> ListHistoryAsync(Guid nftId, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null) throw SarhException.Forbidden();

        // Region scope check: load nft + property once, reject early.
        var nft = await (from n in db.PropertyNfts.AsNoTracking()
                         join p in db.Properties.AsNoTracking() on n.PropertyId equals p.Id
                         where n.Id == nftId
                         select new { n, p.RegionId }).FirstOrDefaultAsync(ct)
            ?? throw SarhException.NotFound("الرخصة", "NFT licence");

        if (actor.Role is not ("super_admin" or "auditor")
            && actor.RegionId is int aRegion
            && nft.RegionId != aRegion)
        {
            throw SarhException.Forbidden("الرخصة خارج منطقتك.");
        }

        var rows = await (from h in db.OwnershipHistory.AsNoTracking()
                          where h.NftId == nftId
                          // Outer-join citizens to keep history rows whose
                          // referenced citizen has been soft-deleted.
                          from fc in db.Citizens.AsNoTracking().Where(c => c.Id == h.FromCitizenId).DefaultIfEmpty()
                          from tc in db.Citizens.AsNoTracking().Where(c => c.Id == h.ToCitizenId).DefaultIfEmpty()
                          orderby h.TransferredAt
                          select new OwnershipEventView
                          {
                              Id = h.Id,
                              FromDid = h.FromDid,
                              ToDid = h.ToDid,
                              FromCitizenName = fc != null ? (fc.FirstNameAr + " " + fc.FamilyNameAr) : null,
                              ToCitizenName   = tc != null ? (tc.FirstNameAr + " " + tc.FamilyNameAr) : null,
                              Reason = h.Reason,
                              NotesAr = h.NotesAr,
                              TransferTxHash = h.TransferTxHash,
                              TransferBlockNumber = h.TransferBlockNumber,
                              TransferredAt = h.TransferredAt,
                          }).ToListAsync(ct);

        return rows;
    }
}

public sealed class OwnershipEventView
{
    public required Guid Id { get; init; }
    public string? FromDid { get; init; }
    public required string ToDid { get; init; }
    public string? FromCitizenName { get; init; }
    public string? ToCitizenName { get; init; }
    public required string Reason { get; init; }
    public string? NotesAr { get; init; }
    public string? TransferTxHash { get; init; }
    public long? TransferBlockNumber { get; init; }
    public required DateTimeOffset TransferredAt { get; init; }
}
