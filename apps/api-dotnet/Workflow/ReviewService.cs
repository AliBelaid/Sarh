using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Auth;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;
using Sijilli.Api.Data.Entities;
using Sijilli.Api.Notifications;
using Sijilli.Api.Properties;

namespace Sijilli.Api.Workflow;

public sealed class ReviewService(SijilliDbContext db, NotificationsService notifications, ILogger<ReviewService> log)
{
    private static readonly HashSet<string> Reviewable = ["pending", "under_review", "needs_clarification"];
    private static readonly HashSet<string> ReviewerRoles = ["registry_officer", "reviewer", "super_admin"];

    public async Task<ReviewResult> ReviewAsync(Guid propertyId, ReviewDecisionDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null || !ReviewerRoles.Contains(actor.Role))
            throw SijilliException.Forbidden("فقط موظّفو السجلّ يمكنهم اعتماد أو رفض الطلبات.");

        if ((dto.Decision is "reject" or "needs_clarification") && string.IsNullOrWhiteSpace(dto.Note))
            throw SijilliException.Validation(
                "الملاحظة إلزامية عند الرفض أو طلب التوضيح.",
                "A note is required when rejecting or requesting clarification.");

        var property = await db.Properties.FirstOrDefaultAsync(p => p.Id == propertyId, ct)
            ?? throw SijilliException.NotFound("العقار", "Property");

        if (actor.Role != "super_admin")
        {
            if (actor.RegionId is null)
                throw SijilliException.Forbidden("الموظف غير مرتبط بمنطقة محدّدة.");
            if (property.RegionId != actor.RegionId)
                throw SijilliException.Forbidden("العقار خارج منطقتك.");
        }

        if (!Reviewable.Contains(property.Status))
            throw SijilliException.Conflict(
                $"لا يمكن مراجعة عقار حالته \"{property.Status}\".",
                $"Property in status \"{property.Status}\" is not reviewable.");

        return dto.Decision switch
        {
            "approve" => await ApproveAsync(property, dto, actor, ct),
            "reject" => await RejectAsync(property, dto, actor, ct),
            _ => await NeedsClarificationAsync(property, dto, actor, ct),
        };
    }

    private async Task<ReviewResult> ApproveAsync(Property property, ReviewDecisionDto dto, CurrentUser actor, CancellationToken ct)
    {
        var region = property.RegionId is int rid
            ? await db.Regions.AsNoTracking().FirstOrDefaultAsync(r => r.Id == rid, ct)
            : null;
        if (region is null)
            throw SijilliException.Validation(
                "لا يمكن اعتماد عقار بدون منطقة.",
                "Cannot approve a property without a region.");

        var propertyCode = await NextPropertyCodeAsync(region.Code, DateTime.UtcNow.Year, ct);

        // Phase 5/6 will replace these placeholders with real PDF + SSI VC.
        var deedPath = $"property_deeds/{property.Id}/deed.pdf";
        var deedHash = "placeholder_sha256";
        var verifyUrl = $"https://verify.sijilli.ly/{propertyCode}";
        var vcId = $"urn:placeholder:vc:property_deed:{Guid.NewGuid()}";

        property.Status = "approved";
        property.PropertyCode = propertyCode;
        property.ReviewedAt = DateTimeOffset.UtcNow;
        property.ReviewedByOfficerId = actor.OfficerId;
        property.ApprovalDecreeNo = dto.ApprovalDecreeNo;
        property.RejectionReason = null;
        property.DeedPdfPath = deedPath;
        property.DeedSignedHash = deedHash;
        property.VcCredentialId = vcId;

        await db.SaveChangesAsync(ct);
        await UpdateRegistrationRequestAsync(property.Id, "approved", ct);
        if (!string.IsNullOrWhiteSpace(dto.Note)) await RecordCommentAsync(property.Id, actor.OfficerId!.Value, dto.Note!, false, ct);

        await notifications.NotifyCitizenAsync(
            property.OwnerCitizenId,
            "تم اعتماد عقارك",
            $"تم اعتماد عقارك ورمزه {propertyCode}. يمكنك الآن تنزيل سند الملكية.",
            new { property_id = property.Id, property_code = propertyCode, verify_url = verifyUrl },
            ct);

        return new ReviewResult
        {
            Property = PropertyView.From(property),
            Deed = new ReviewDeed { Path = deedPath, Sha256 = deedHash, VerifyUrl = verifyUrl },
            Vc = new ReviewVc { CredentialId = vcId, Did = "did:placeholder:LY:demo", IsPlaceholder = true },
        };
    }

    private async Task<ReviewResult> RejectAsync(Property property, ReviewDecisionDto dto, CurrentUser actor, CancellationToken ct)
    {
        property.Status = "rejected";
        property.RejectionReason = dto.Note;
        property.ReviewedAt = DateTimeOffset.UtcNow;
        property.ReviewedByOfficerId = actor.OfficerId;

        await db.SaveChangesAsync(ct);
        await UpdateRegistrationRequestAsync(property.Id, "rejected", ct);
        await RecordCommentAsync(property.Id, actor.OfficerId!.Value, dto.Note!, false, ct);

        await notifications.NotifyCitizenAsync(
            property.OwnerCitizenId,
            "تم رفض طلب تسجيل العقار",
            $"تم رفض طلبك. السبب: {dto.Note}",
            new { property_id = property.Id, reason = dto.Note },
            ct);

        return new ReviewResult { Property = PropertyView.From(property) };
    }

    private async Task<ReviewResult> NeedsClarificationAsync(Property property, ReviewDecisionDto dto, CurrentUser actor, CancellationToken ct)
    {
        property.Status = "needs_clarification";
        property.ReviewedAt = DateTimeOffset.UtcNow;
        property.ReviewedByOfficerId = actor.OfficerId;

        await db.SaveChangesAsync(ct);
        await UpdateRegistrationRequestAsync(property.Id, "needs_clarification", ct);
        await RecordCommentAsync(property.Id, actor.OfficerId!.Value, dto.Note!, false, ct);

        await notifications.NotifyCitizenAsync(
            property.OwnerCitizenId,
            "طلب توضيحات إضافية",
            $"يحتاج طلب تسجيل عقارك إلى توضيحات: {dto.Note}",
            new { property_id = property.Id, reason = dto.Note },
            ct);

        return new ReviewResult { Property = PropertyView.From(property) };
    }

    private async Task<string> NextPropertyCodeAsync(string regionCode, int year, CancellationToken ct)
    {
        var conn = (Microsoft.Data.SqlClient.SqlConnection)db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "EXEC dbo.next_property_code @p_region_code, @p_year;";
        cmd.Parameters.Add(new Microsoft.Data.SqlClient.SqlParameter("@p_region_code", System.Data.SqlDbType.NVarChar, 8) { Value = regionCode });
        cmd.Parameters.Add(new Microsoft.Data.SqlClient.SqlParameter("@p_year", System.Data.SqlDbType.Int) { Value = year });
        var s = (string?)await cmd.ExecuteScalarAsync(ct)
            ?? throw SijilliException.Upstream("next_property_code returned null");
        return s;
    }

    private async Task UpdateRegistrationRequestAsync(Guid propertyId, string status, CancellationToken ct)
    {
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE registration_requests
                SET current_status = {status}
                WHERE property_id = {propertyId};", ct);
        }
        catch (Exception ex) { log.LogWarning(ex, "registration_requests update failed"); }
    }

    private async Task RecordCommentAsync(Guid propertyId, Guid officerId, string body, bool isInternal, CancellationToken ct)
    {
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO review_comments (property_id, officer_id, body, is_internal)
                VALUES ({propertyId}, {officerId}, {body}, {isInternal});", ct);
        }
        catch (Exception ex) { log.LogWarning(ex, "review_comments insert failed"); }
    }
}
