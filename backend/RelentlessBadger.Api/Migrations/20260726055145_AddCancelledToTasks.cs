using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RelentlessBadger.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCancelledToTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Cancelled",
                table: "Tasks",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Cancelled",
                table: "Tasks");
        }
    }
}
