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

        SeedData(modelBuilder);
    }

    private static void SeedData(ModelBuilder modelBuilder)
    {
        var nodeId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
        var displayFaceId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
        var displayInfoId = "c3d4e5f6-a7b8-9012-cdef-123456789012";
        var assignmentFaceId = "d4e5f6a7-b8c9-0123-defa-234567890123";
        var assignmentInfoId = "e5f6a7b8-c9d0-1234-efab-345678901234";
        var setIdleSleepy = "f6a7b8c9-d0e1-2345-fabc-456789012345";
        var setExcited = "a7b8c9d0-e1f2-3456-abcd-567890123456";
        var frameZzz = "b8c9d0e1-f2a3-4567-bcde-678901234567";
        var frameBlink = "c9d0e1f2-a3b4-5678-cdef-789012345678";
        var frameHappy = "d0e1f2a3-b4c5-6789-defa-890123456789";
        var frameExcited = "e1f2a3b4-c5d6-7890-efab-901234567890";
        var frameWow = "f2a3b4c5-d6e7-8901-fabc-012345678901";
        var elemZzz = "a3b4c5d6-e7f8-9012-abcd-123456789012";
        var elemBlinkSprite = "b4c5d6e7-f8a9-0123-bcde-234567890123";
        var elemHappy = "c5d6e7f8-a9b0-1234-cdef-345678901234";
        var elemExcited = "d6e7f8a9-b0c1-2345-defa-456789012345";
        var elemWow = "e7f8a9b0-c1d2-3456-efab-567890123456";

        modelBuilder.Entity<Node>().HasData(new Node
        {
            Id = nodeId,
            MacAddress = "AA:BB:CC:DD:EE:01",
            FriendlyName = "Printer Face",
            Description = "Main 3D printer display",
            CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
        });

        modelBuilder.Entity<NodeDisplay>().HasData(
            new NodeDisplay
            {
                Id = displayFaceId,
                NodeId = nodeId,
                Label = "Front Face",
                DriverType = "sh1106",
                BusType = "i2c",
                BusConfig = "{\"address\":\"0x3C\"}",
                Width = 128,
                Height = 64,
                Rotation = 0,
                SortOrder = 0
            },
            new NodeDisplay
            {
                Id = displayInfoId,
                NodeId = nodeId,
                Label = "Info Panel",
                DriverType = "sh1106",
                BusType = "i2c",
                BusConfig = "{\"address\":\"0x3D\"}",
                Width = 128,
                Height = 64,
                Rotation = 0,
                SortOrder = 1
            }
        );

        modelBuilder.Entity<Assignment>().HasData(
            new Assignment
            {
                Id = assignmentFaceId,
                NodeId = nodeId,
                DisplayId = displayFaceId,
                DefaultGroup = "idle_faces",
                TriggersJson = "{\"state:printing\":\"printing_faces\",\"state:complete\":\"celebration_faces\",\"state:error\":\"error_faces\",\"state:idle\":\"idle_faces\",\"state:paused\":\"paused_faces\",\"state:waiting\":\"waiting_faces\",\"macro:print_start\":\"printing_faces\",\"macro:print_end\":\"celebration_faces\"}",
                ActivePreset = null
            },
            new Assignment
            {
                Id = assignmentInfoId,
                NodeId = nodeId,
                DisplayId = displayInfoId,
                DefaultGroup = "stats_idle",
                TriggersJson = "{\"state:printing\":\"stats_progress\",\"state:complete\":\"stats_done\",\"state:idle\":\"stats_idle\"}",
                ActivePreset = null
            }
        );

        modelBuilder.Entity<Group>().HasData(
            new Group
            {
                Id = "idle_faces",
                Label = "Idle Faces",
                SortOrder = 0,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            },
            new Group
            {
                Id = "printing_faces",
                Label = "Printing Faces",
                SortOrder = 1,
                CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            }
        );

        modelBuilder.Entity<Set>().HasData(
            new Set
            {
                Id = setIdleSleepy,
                GroupId = "idle_faces",
                Label = "Sleepy",
                SortOrder = 0,
                LoopCount = 0,
                FrameTime = 0
            },
            new Set
            {
                Id = setExcited,
                GroupId = "printing_faces",
                Label = "Excited",
                SortOrder = 0,
                LoopCount = 0,
                FrameTime = 600
            }
        );

        modelBuilder.Entity<Frame>().HasData(
            new Frame { Id = frameZzz, SetId = setIdleSleepy, SortOrder = 0, DurationMs = 3000, BgColor = "#000000" },
            new Frame { Id = frameBlink, SetId = setIdleSleepy, SortOrder = 1, DurationMs = 200, BgColor = "#000000" },
            new Frame { Id = frameHappy, SetId = setExcited, SortOrder = 0, DurationMs = 600, BgColor = "#000000" },
            new Frame { Id = frameExcited, SetId = setExcited, SortOrder = 1, DurationMs = 600, BgColor = "#000000" },
            new Frame { Id = frameWow, SetId = setExcited, SortOrder = 2, DurationMs = 600, BgColor = "#000000" }
        );

        modelBuilder.Entity<FrameElement>().HasData(
            new FrameElement { Id = elemZzz, FrameId = frameZzz, SortOrder = 0, Type = "text", Value = "zzz", Color = "#FFFFFF", X = 64, Y = 32 },
            new FrameElement { Id = elemBlinkSprite, FrameId = frameBlink, SortOrder = 0, Type = "sprite", Value = "blink", Color = "#FFFFFF", X = 64, Y = 32 },
            new FrameElement { Id = elemHappy, FrameId = frameHappy, SortOrder = 0, Type = "sprite", Value = "face_happy", Color = "#FFFFFF", X = 64, Y = 32 },
            new FrameElement { Id = elemExcited, FrameId = frameExcited, SortOrder = 0, Type = "sprite", Value = "face_excited", Color = "#FFFFFF", X = 64, Y = 32 },
            new FrameElement { Id = elemWow, FrameId = frameWow, SortOrder = 0, Type = "sprite", Value = "face_wow", Color = "#FFFFFF", X = 64, Y = 32 }
        );

        modelBuilder.Entity<Sprite>().HasData(
            new Sprite { Id = "blink", Label = "Blink", Width = 16, Height = 16, DataBase64 = "", CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Sprite { Id = "face_happy", Label = "Face Happy", Width = 64, Height = 64, DataBase64 = "", CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Sprite { Id = "face_excited", Label = "Face Excited", Width = 64, Height = 64, DataBase64 = "", CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) },
            new Sprite { Id = "face_wow", Label = "Face Wow", Width = 64, Height = 64, DataBase64 = "", CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) }
        );
    }
}
