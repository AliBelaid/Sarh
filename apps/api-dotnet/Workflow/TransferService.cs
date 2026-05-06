using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Blockchain;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;
using Sarh.Api.Notifications;

namespace Sarh.Api.Workflow;

// Body for POST /api/v1/property-nfts/:id/transfer.
public sealed class TransferNftDto
{
    [Required] public Guid ToCitizenId { get; init; }

    // Constrained client-side via the dropdown; backend re-validates against
    // ck_oh_reason in migration 028. 'initial_mint' is rejected — that's
    // LicenseService's responsibility, not a transfer reason.
    [Required] public string Reason { get; init; } = "";

    public string? NotesAr { get; init; }
}

public sealed class TransferResult
{
    public required NftLicenseView Nft { get; init; }
    public required Properties.PropertyView Property { get; init; }
    public required OwnershipEventView Event { get; init; }
    public required string ExplorerTxUrl { get; init; }
}

// Re-assigns ownership of a minted property to a different citizen. Updates
// three places atomically (best-effort: chain call is non-transactional with
// SQL):
//   1. property_nfts: owner_did, owner_address, status='transferred'
//   2. ownership_history: append new row
//   3. properties: status='transferred', owner_citizen_id (the *legal* owner)
//
// On chain success / SQL failure: the chain has the new owner but the
// registry hasn't recorded it. The verify endpoint's on_chain_owner_matches
// flag will surface the divergence on the next read; manual reconciliation
// inserts the missing ownership_history row.
public sealed class TransferService(
    SarhDbContext db,
    IBlockchainService chain,
    NotificationsService notifications,
    ILogger<TransferService> log)
{
    private static readonly HashSet<string> ManagerRoles = ["super_admin", "department_manager", "registry_officer"];
    private static readonly HashSet<string> ValidReasons = ["sale", "inheritance", "gift", "court_order", "correction"];
    private static readonly HashSet<string> TransferableStatuses = ["minted", "transferred"];

    public async Task<TransferResult> TransferAsync(Guid nftId, TransferNftDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null || !ManagerRoles.Contains(actor.Role))
            throw SarhException.Forbidden("نقل ملكية الرخصة مقصور على موظفي السجل والإدارة.");

        if (!ValidReasons.Contains(dto.Reason))
            throw SarhException.Validation(
                "سبب النقل غير صالح.",
                $"Invalid transfer reason '{dto.Reason}'.");

        if (string.IsNullOrWhiteSpace(dto.NotesAr) && dto.Reason is "court_order" or "correction")
            throw SarhException.Validation(
                "الملاحظة إلزامية للنقل بقرار محكمة أو تصحيح إداري.",
                "A note is required for court_order or correction transfers.");

        var nft = await db.PropertyNfts.FirstOrDefaultAsync(n => n.Id == nftId, ct)
            ?? throw SarhException.NotFound("الرخصة", "NFT licence");

        if (!TransferableStatuses.Contains(nft.Status))
            throw SarhException.Conflict(
                $"لا يمكن نقل رخصة حالتها \"{nft.Status}\".",
                $"NFT in status '{nft.Status}' is not transferable.");

        var property = await db.Properties.FirstOrDefaultAsync(p => p.Id == nft.PropertyId, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        // Region scope: managers + officers can only act in their own region.
        if (actor.Role != "super_admin"
            && actor.RegionId is int aRegion
            && property.RegionId is int pRegion
            && aRegion != pRegion)
        {
            throw SarhException.Forbidden("العقار خارج منطقتك.");
        }

        var toCitizen = await db.Citizens.FirstOrDefaultAsync(c => c.Id == dto.ToCitizenId, ct)
            ?? throw SarhException.NotFound("المالك الجديد", "Recipient citizen");

        if (!toCitizen.IsActive)
            throw SarhException.Validation(
                "لا يمكن النقل إلى مواطن غير نشط.",
                "Cannot transfer to an inactive citizen.");

        if (toCitizen.Id == property.OwnerCitizenId)
            throw SarhException.Validation(
                "هذا المواطن هو المالك الحالي بالفعل.",
                "Recipient is already the current owner.");

        var fromDid = nft.OwnerDid;
        var toDid = OwnerDidFor(toCitizen);

        // 1) Chain call.
        var receipt = await chain.TransferAsync(new TransferRequest
        {
            TokenId = nft.TokenId,
            FromDid = fromDid,
            ToDid = toDid,
            FromAddress = nft.OwnerAddress,
        }, ct);

        // 2) DB writes — all three tables in one SaveChanges to keep the
        // local view consistent. Chain rollback isn't attempted; on SQL
        // failure the registry is divergent (see class-level comment).
        var historyId = Guid.NewGuid();
        var fromCitizenId = property.OwnerCitizenId;

        nft.OwnerDid = toDid;
        nft.OwnerAddress = receipt.ToAddress;
        nft.Status = "transferred";

        property.OwnerCitizenId = toCitizen.Id;
        property.Status = "transferred";

        db.OwnershipHistory.Add(new OwnershipHistory
        {
            Id = historyId,
            PropertyId = property.Id,
            NftId = nft.Id,
            FromDid = fromDid,
            ToDid = toDid,
            FromCitizenId = fromCitizenId,
            ToCitizenId = toCitizen.Id,
            TransferTxHash = receipt.TxHash,
            TransferBlockNumber = receipt.BlockNumber,
            Reason = dto.Reason,
            NotesAr = dto.NotesAr,
            RecordedByOfficerId = actor.OfficerId,
            TransferredAt = receipt.TransferredAt,
        });

        try { await db.SaveChangesAsync(ct); }
        catch
        {
            log.LogError(
                "DB save failed AFTER successful chain transfer. tx={Tx} token={Token}. Manual reconciliation required.",
                receipt.TxHash, nft.TokenId);
            throw;
        }

        // 3) Notify both parties (best-effort; failures don't break the call).
        var reasonAr = ReasonAr(dto.Reason);
        try
        {
            await notifications.NotifyCitizenAsync(
                toCitizen.Id,
                "تم نقل ملكية عقار إليك",
                $"تم نقل ملكية عقار ({property.PropertyCode}) إليك بسبب {reasonAr}. رقم المعاملة على السلسلة: {receipt.TxHash}.",
                new { property_id = property.Id, nft_id = nft.Id, tx_hash = receipt.TxHash, reason = dto.Reason },
                ct);

            if (fromCitizenId != Guid.Empty)
            {
                await notifications.NotifyCitizenAsync(
                    fromCitizenId,
                    "تم نقل ملكية عقارك",
                    $"تم نقل ملكية عقار ({property.PropertyCode}) من سجلّك بسبب {reasonAr}.",
                    new { property_id = property.Id, nft_id = nft.Id, tx_hash = receipt.TxHash, reason = dto.Reason },
                    ct);
            }
        }
        catch (Exception ex) { log.LogWarning(ex, "Transfer notifications failed"); }

        return new TransferResult
        {
            Nft = NftLicenseView.From(nft, property.PropertyCode, property.OwnerCitizenId),
            Property = Properties.PropertyView.From(property),
            Event = new OwnershipEventView
            {
                Id = historyId,
                FromDid = fromDid,
                ToDid = toDid,
                FromCitizenName = null, // Display layer joins on demand.
                ToCitizenName = $"{toCitizen.FirstNameAr} {toCitizen.FamilyNameAr}",
                Reason = dto.Reason,
                NotesAr = dto.NotesAr,
                TransferTxHash = receipt.TxHash,
                TransferBlockNumber = receipt.BlockNumber,
                TransferredAt = receipt.TransferredAt,
            },
            ExplorerTxUrl = chain.ExplorerTxUrl(receipt.TxHash),
        };
    }

    private static string OwnerDidFor(Citizen c)
    {
        var shortId = c.Id.ToString("N")[..16];
        return $"did:sov:LY:{shortId}";
    }

    private static string ReasonAr(string r) => r switch
    {
        "sale"        => "بيع",
        "inheritance" => "إرث",
        "gift"        => "هبة",
        "court_order" => "قرار محكمة",
        "correction"  => "تصحيح إداري",
        _             => r,
    };
}
