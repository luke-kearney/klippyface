using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNodeSleepAfter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SleepAfterSeconds",
                table: "Nodes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 300);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SleepAfterSeconds",
                table: "Nodes");
        }
    }
}
