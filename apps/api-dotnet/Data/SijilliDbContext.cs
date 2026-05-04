using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Data.Entities;

namespace Sijilli.Api.Data;

public class SijilliDbContext(DbContextOptions<SijilliDbContext> options) : DbContext(options)
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
    }
}
