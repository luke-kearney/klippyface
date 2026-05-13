using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNodeOnlineTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<uint>(
                name: "LastConfigVersion",
                table: "Nodes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeen",
                table: "Nodes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Nodes",
                keyColumn: "Id",
                keyValue: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                columns: new[] { "LastConfigVersion", "LastSeen" },
                values: new object[] { 1u, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastConfigVersion",
                table: "Nodes");

            migrationBuilder.DropColumn(
                name: "LastSeen",
                table: "Nodes");
        }
    }
}
