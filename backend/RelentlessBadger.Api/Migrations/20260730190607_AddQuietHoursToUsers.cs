using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RelentlessBadger.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddQuietHoursToUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "QuietHoursCsv",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "QuietHoursCsv",
                table: "Users");
        }
    }
}
