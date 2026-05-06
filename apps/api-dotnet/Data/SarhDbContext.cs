using Microsoft.EntityFrameworkCore;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Data;

public class SarhDbContext(DbContextOptions<SarhDbContext> options) : DbContext(options)
{
    public DbSet<AuthUser> AuthUsers => Set<AuthUser>();
    public DbSet<Officer> Officers => Set<Officer>();
    public DbSet<Citizen> Citizens => Set<Citizen>();
    public DbSet<Property> Properties => Set<Property>();
    public DbSet<Region> Regions => Set<Region>();
    public DbSet<DigitalIdCard> DigitalIdCards => Set<DigitalIdCard>();
    public DbSet<IdIssuanceHistory> IdIssuanceHistory => Set<IdIssuanceHistory>();
    public DbSet<NfcCardSecret> NfcCardSecrets => Set<NfcCardSecret>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<PropertyNft> PropertyNfts => Set<PropertyNft>();
    public DbSet<OwnershipHistory> OwnershipHistory => Set<OwnershipHistory>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AuthUser>().HasKey(x => x.Id);
        b.Entity<AuthUser>().ToTable("auth_users", t => t.HasTrigger("tr_auth_users_updated_at"));
        b.Entity<Officer>().HasKey(x => x.Id);
        b.Entity<Officer>().HasIndex(x => x.AuthUserId);
        b.Entity<Officer>().ToTable("officers", t => t.HasTrigger("tr_officers_updated_at"));
        b.Entity<Citizen>().HasKey(x => x.Id);
        b.Entity<Citizen>().ToTable("citizens", t => t.HasTrigger("tr_citizens_updated_at"));
        b.Entity<Property>().HasKey(x => x.Id);
        b.Entity<Property>().ToTable("properties", t =>
        {
            t.HasTrigger("tr_properties_set_centroid");
            t.HasTrigger("tr_properties_updated_at");
        });
        b.Entity<Region>().HasKey(x => x.Id);
        b.Entity<DigitalIdCard>().HasKey(x => x.Id);
        b.Entity<DigitalIdCard>().ToTable("digital_id_cards", t => t.HasTrigger("tr_digital_id_cards_updated_at"));
        b.Entity<IdIssuanceHistory>().HasKey(x => x.Id);
        b.Entity<NfcCardSecret>().HasKey(x => x.Id);
        b.Entity<Notification>().HasKey(x => x.Id);
        b.Entity<PropertyNft>().HasKey(x => x.Id);
        b.Entity<PropertyNft>().HasIndex(x => x.PropertyId);
        b.Entity<PropertyNft>().ToTable("property_nfts", t => t.HasTrigger("tr_property_nfts_updated_at"));
        b.Entity<OwnershipHistory>().HasKey(x => x.Id);
        b.Entity<OwnershipHistory>().HasIndex(x => x.PropertyId);
        // FK relationship to property_nfts is essential — without it EF Core's
        // batch reorderer can issue INSERT INTO ownership_history BEFORE
        // INSERT INTO property_nfts within the same SaveChanges call, which
        // trips fk_oh_nft. Smoke test caught this on first mint attempt.
        b.Entity<OwnershipHistory>()
            .HasOne<PropertyNft>()
            .WithMany()
            .HasForeignKey(x => x.NftId)
            .OnDelete(DeleteBehavior.NoAction);
        // ownership_history blocks UPDATE / DELETE via INSTEAD OF triggers in
        // migration 028 — flag the table so EF doesn't generate OUTPUT clauses
        // that would conflict.
        b.Entity<OwnershipHistory>().ToTable("ownership_history", t =>
        {
            t.HasTrigger("tr_ownership_history_no_update");
            t.HasTrigger("tr_ownership_history_no_delete");
        });
    }
}
