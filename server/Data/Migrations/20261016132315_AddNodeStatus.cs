using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNodeStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Nodes",
                type: "TEXT",
                nullable: false,
                // Nodes added before pending existed were all registered by hand
                defaultValue: "Accepted");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "Nodes");
        }
    }
}
