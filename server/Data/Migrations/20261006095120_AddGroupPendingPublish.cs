using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupPendingPublish : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PendingPublish",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PendingPublish",
                table: "Groups");
        }
    }
}
