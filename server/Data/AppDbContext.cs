using Microsoft.EntityFrameworkCore;
using Klippyface.Server.Models;

namespace Klippyface.Server.Data;

public class KlippyfaceDbContext : DbContext
{
    public KlippyfaceDbContext(DbContextOptions<KlippyfaceDbContext> options) : base(options) { }

    public DbSet<Node> Nodes => Set<Node>();
    public DbSet<NodeDisplay> NodeDisplays => Set<NodeDisplay>();
    public DbSet<Assignment> Assignments => Set<Assignment>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Set> Sets => Set<Set>();
    public DbSet<Frame> Frames => Set<Frame>();
    public DbSet<FrameElement> FrameElements => Set<FrameElement>();
    public DbSet<Sprite> Sprites => Set<Sprite>();
    public DbSet<Preset> Presets => Set<Preset>();
    public DbSet<NodePreset> NodePresets => Set<NodePreset>();
    public DbSet<MoonrakerSettings> MoonrakerSettings => Set<MoonrakerSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Node>(entity =>
        {
            entity.HasIndex(e => e.MacAddress).IsUnique();
        });

        modelBuilder.Entity<NodeDisplay>(entity =>
        {
            entity.HasOne(e => e.Node)
                  .WithMany(n => n.Displays)
                  .HasForeignKey(e => e.NodeId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Assignment>(entity =>
        {
            entity.HasIndex(e => new { e.NodeId, e.DisplayId }).IsUnique();

            entity.HasOne(e => e.Node)
                  .WithMany(n => n.Assignments)
                  .HasForeignKey(e => e.NodeId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Display)
                  .WithOne(d => d.Assignment)
                  .HasForeignKey<Assignment>(e => e.DisplayId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Preset)
                  .WithMany()
                  .HasForeignKey(e => e.ActivePreset)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Group>(entity =>
        {
            entity.HasMany(e => e.Sets)
                  .WithOne(s => s.Group)
                  .HasForeignKey(s => s.GroupId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Set>(entity =>
        {
            entity.HasMany(e => e.Frames)
                  .WithOne(f => f.Set)
                  .HasForeignKey(f => f.SetId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Frame>(entity =>
        {
            entity.HasMany(e => e.Elements)
                  .WithOne(el => el.Frame)
                  .HasForeignKey(el => el.FrameId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MoonrakerSettings>(entity =>
        {
            entity.Ignore(e => e.IsConfigured);
            entity.Ignore(e => e.WebSocketUri);
        });

        modelBuilder.Entity<NodePreset>(entity =>
        {
            entity.HasKey(e => new { e.NodeId, e.PresetId });

            entity.HasOne(e => e.Node)
                  .WithMany(n => n.NodePresets)
                  .HasForeignKey(e => e.NodeId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Preset)
                  .WithMany(p => p.NodePresets)
                  .HasForeignKey(e => e.PresetId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
