using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Klippyface.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddElementColorKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ColorKey",
                table: "FrameElements",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ColorKey",
                table: "FrameElements");
        }
    }
}
