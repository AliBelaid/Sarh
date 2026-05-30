using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Audit;
using Sarh.Api.Auth;
using Sarh.Api.Disputes;

namespace Sarh.Api.Controllers;

// Officer-facing surface for legal encumbrances (court seizures, mortgages,
// inheritance disputes, waqf). An active record blocks sale + mint of the
// parcel (enforced in DisputesService, called by Transfer/LicenseService).
[ApiController]
[Route("api/v1/property-disputes")]
[Authorize]
public class DisputesController(DisputesService svc) : ControllerBase
{
    // All disputes (active + historical) for a parcel.
    [HttpGet]
    [OfficerOnly("super_admin", "auditor", "registry_officer", "reviewer", "department_manager")]
    public Task<List<DisputeView>> List([FromQuery(Name = "property_id")] Guid propertyId, CancellationToken ct)
        => svc.ListByPropertyAsync(propertyId, User.RequireUser(), ct);

    // Record a new encumbrance.
    [HttpPost]
    [OfficerOnly("super_admin", "department_manager", "registry_officer")]
    [Audit(Action = AuditActions.Create, Entity = "property_disputes", EntityIdFrom = "id")]
    public Task<DisputeView> Record([FromBody] RecordDisputeDto dto, CancellationToken ct)
        => svc.RecordAsync(dto, User.RequireUser(), ct);

    // Lift (release) an active encumbrance — re-opens the parcel for sale/mint.
    [HttpPost("{id:guid}/lift")]
    [OfficerOnly("super_admin", "department_manager")]
    [Audit(Action = AuditActions.Update, Entity = "property_disputes", EntityIdFrom = "id")]
    public Task<DisputeView> Lift(Guid id, [FromBody] LiftDisputeDto dto, CancellationToken ct)
        => svc.LiftAsync(id, dto, User.RequireUser(), ct);
}
