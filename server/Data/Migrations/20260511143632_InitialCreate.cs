using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Groups",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Groups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Nodes",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    MacAddress = table.Column<string>(type: "TEXT", nullable: false),
                    FriendlyName = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Nodes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Presets",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    ConditionsJson = table.Column<string>(type: "TEXT", nullable: false),
                    OverridesJson = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Presets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sprites",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    DataBase64 = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sprites", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sets",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    GroupId = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    LoopCount = table.Column<int>(type: "INTEGER", nullable: false),
                    FrameTime = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sets_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NodeDisplays",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    NodeId = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    DriverType = table.Column<string>(type: "TEXT", nullable: false),
                    BusType = table.Column<string>(type: "TEXT", nullable: false),
                    BusConfig = table.Column<string>(type: "TEXT", nullable: false),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    Rotation = table.Column<int>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NodeDisplays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NodeDisplays_Nodes_NodeId",
                        column: x => x.NodeId,
                        principalTable: "Nodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NodePresets",
                columns: table => new
                {
                    NodeId = table.Column<string>(type: "TEXT", nullable: false),
                    PresetId = table.Column<string>(type: "TEXT", nullable: false),
                    Enabled = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NodePresets", x => new { x.NodeId, x.PresetId });
                    table.ForeignKey(
                        name: "FK_NodePresets_Nodes_NodeId",
                        column: x => x.NodeId,
                        principalTable: "Nodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_NodePresets_Presets_PresetId",
                        column: x => x.PresetId,
                        principalTable: "Presets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Frames",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    SetId = table.Column<string>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    DurationMs = table.Column<int>(type: "INTEGER", nullable: false),
                    BgColor = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Frames", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Frames_Sets_SetId",
                        column: x => x.SetId,
                        principalTable: "Sets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Assignments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    NodeId = table.Column<string>(type: "TEXT", nullable: false),
                    DisplayId = table.Column<string>(type: "TEXT", nullable: false),
                    DefaultGroup = table.Column<string>(type: "TEXT", nullable: false),
                    TriggersJson = table.Column<string>(type: "TEXT", nullable: false),
                    ActivePreset = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Assignments_NodeDisplays_DisplayId",
                        column: x => x.DisplayId,
                        principalTable: "NodeDisplays",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Assignments_Nodes_NodeId",
                        column: x => x.NodeId,
                        principalTable: "Nodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Assignments_Presets_ActivePreset",
                        column: x => x.ActivePreset,
                        principalTable: "Presets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "FrameElements",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    FrameId = table.Column<string>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Type = table.Column<string>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: false),
                    Color = table.Column<string>(type: "TEXT", nullable: false),
                    X = table.Column<int>(type: "INTEGER", nullable: false),
                    Y = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FrameElements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FrameElements_Frames_FrameId",
                        column: x => x.FrameId,
                        principalTable: "Frames",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "Groups",
                columns: new[] { "Id", "CreatedAt", "Label", "SortOrder", "UpdatedAt" },
                values: new object[,]
                {
                    { "idle_faces", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Idle Faces", 0, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { "printing_faces", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Printing Faces", 1, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) }
                });

            migrationBuilder.InsertData(
                table: "Nodes",
                columns: new[] { "Id", "CreatedAt", "Description", "FriendlyName", "MacAddress", "UpdatedAt" },
                values: new object[] { "a1b2c3d4-e5f6-7890-abcd-ef1234567890", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Main 3D printer display", "Printer Face", "AA:BB:CC:DD:EE:01", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });

            migrationBuilder.InsertData(
                table: "Sprites",
                columns: new[] { "Id", "CreatedAt", "DataBase64", "Height", "Label", "Width" },
                values: new object[,]
                {
                    { "blink", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "", 16, "Blink", 16 },
                    { "face_excited", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "", 64, "Face Excited", 64 },
                    { "face_happy", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "", 64, "Face Happy", 64 },
                    { "face_wow", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "", 64, "Face Wow", 64 }
                });

            migrationBuilder.InsertData(
                table: "NodeDisplays",
                columns: new[] { "Id", "BusConfig", "BusType", "DriverType", "Height", "Label", "NodeId", "Rotation", "SortOrder", "Width" },
                values: new object[,]
                {
                    { "b2c3d4e5-f6a7-8901-bcde-f12345678901", "{\"address\":\"0x3C\"}", "i2c", "sh1106", 64, "Front Face", "a1b2c3d4-e5f6-7890-abcd-ef1234567890", 0, 0, 128 },
                    { "c3d4e5f6-a7b8-9012-cdef-123456789012", "{\"address\":\"0x3D\"}", "i2c", "sh1106", 64, "Info Panel", "a1b2c3d4-e5f6-7890-abcd-ef1234567890", 0, 1, 128 }
                });

            migrationBuilder.InsertData(
                table: "Sets",
                columns: new[] { "Id", "FrameTime", "GroupId", "Label", "LoopCount", "SortOrder" },
                values: new object[,]
                {
                    { "a7b8c9d0-e1f2-3456-abcd-567890123456", 600, "printing_faces", "Excited", 0, 0 },
                    { "f6a7b8c9-d0e1-2345-fabc-456789012345", 0, "idle_faces", "Sleepy", 0, 0 }
                });

            migrationBuilder.InsertData(
                table: "Assignments",
                columns: new[] { "Id", "ActivePreset", "DefaultGroup", "DisplayId", "NodeId", "TriggersJson" },
                values: new object[,]
                {
                    { "d4e5f6a7-b8c9-0123-defa-234567890123", null, "idle_faces", "b2c3d4e5-f6a7-8901-bcde-f12345678901", "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "{\"state:printing\":\"printing_faces\",\"state:complete\":\"celebration_faces\",\"state:error\":\"error_faces\",\"state:idle\":\"idle_faces\",\"state:paused\":\"paused_faces\",\"state:waiting\":\"waiting_faces\",\"macro:print_start\":\"printing_faces\",\"macro:print_end\":\"celebration_faces\"}" },
                    { "e5f6a7b8-c9d0-1234-efab-345678901234", null, "stats_idle", "c3d4e5f6-a7b8-9012-cdef-123456789012", "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "{\"state:printing\":\"stats_progress\",\"state:complete\":\"stats_done\",\"state:idle\":\"stats_idle\"}" }
                });

            migrationBuilder.InsertData(
                table: "Frames",
                columns: new[] { "Id", "BgColor", "DurationMs", "SetId", "SortOrder" },
                values: new object[,]
                {
                    { "b8c9d0e1-f2a3-4567-bcde-678901234567", "#000000", 3000, "f6a7b8c9-d0e1-2345-fabc-456789012345", 0 },
                    { "c9d0e1f2-a3b4-5678-cdef-789012345678", "#000000", 200, "f6a7b8c9-d0e1-2345-fabc-456789012345", 1 },
                    { "d0e1f2a3-b4c5-6789-defa-890123456789", "#000000", 600, "a7b8c9d0-e1f2-3456-abcd-567890123456", 0 },
                    { "e1f2a3b4-c5d6-7890-efab-901234567890", "#000000", 600, "a7b8c9d0-e1f2-3456-abcd-567890123456", 1 },
                    { "f2a3b4c5-d6e7-8901-fabc-012345678901", "#000000", 600, "a7b8c9d0-e1f2-3456-abcd-567890123456", 2 }
                });

            migrationBuilder.InsertData(
                table: "FrameElements",
                columns: new[] { "Id", "Color", "FrameId", "Label", "SortOrder", "Type", "Value", "X", "Y" },
                values: new object[,]
                {
                    { "a3b4c5d6-e7f8-9012-abcd-123456789012", "#FFFFFF", "b8c9d0e1-f2a3-4567-bcde-678901234567", "", 0, "text", "zzz", 64, 32 },
                    { "b4c5d6e7-f8a9-0123-bcde-234567890123", "#FFFFFF", "c9d0e1f2-a3b4-5678-cdef-789012345678", "", 0, "sprite", "blink", 64, 32 },
                    { "c5d6e7f8-a9b0-1234-cdef-345678901234", "#FFFFFF", "d0e1f2a3-b4c5-6789-defa-890123456789", "", 0, "sprite", "face_happy", 64, 32 },
                    { "d6e7f8a9-b0c1-2345-defa-456789012345", "#FFFFFF", "e1f2a3b4-c5d6-7890-efab-901234567890", "", 0, "sprite", "face_excited", 64, 32 },
                    { "e7f8a9b0-c1d2-3456-efab-567890123456", "#FFFFFF", "f2a3b4c5-d6e7-8901-fabc-012345678901", "", 0, "sprite", "face_wow", 64, 32 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_ActivePreset",
                table: "Assignments",
                column: "ActivePreset");

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_DisplayId",
                table: "Assignments",
                column: "DisplayId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assignments_NodeId_DisplayId",
                table: "Assignments",
                columns: new[] { "NodeId", "DisplayId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FrameElements_FrameId",
                table: "FrameElements",
                column: "FrameId");

            migrationBuilder.CreateIndex(
                name: "IX_Frames_SetId",
                table: "Frames",
                column: "SetId");

            migrationBuilder.CreateIndex(
                name: "IX_NodeDisplays_NodeId",
                table: "NodeDisplays",
                column: "NodeId");

            migrationBuilder.CreateIndex(
                name: "IX_NodePresets_PresetId",
                table: "NodePresets",
                column: "PresetId");

            migrationBuilder.CreateIndex(
                name: "IX_Nodes_MacAddress",
                table: "Nodes",
                column: "MacAddress",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Sets_GroupId",
                table: "Sets",
                column: "GroupId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Assignments");

            migrationBuilder.DropTable(
                name: "FrameElements");

            migrationBuilder.DropTable(
                name: "NodePresets");

            migrationBuilder.DropTable(
                name: "Sprites");

            migrationBuilder.DropTable(
                name: "NodeDisplays");

            migrationBuilder.DropTable(
                name: "Frames");

            migrationBuilder.DropTable(
                name: "Presets");

            migrationBuilder.DropTable(
                name: "Nodes");

            migrationBuilder.DropTable(
                name: "Sets");

            migrationBuilder.DropTable(
                name: "Groups");
        }
    }
}
