using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RelentlessBadger.Api.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceWaitPairWithWaitList : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "WaitMinutesCsv",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "60,240");

            migrationBuilder.AddColumn<int>(
                name: "DefaultWaitIndex",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Fold each user's existing pair into the list rather than letting them
            // fall back to the default, so nobody's configured waits are lost.
            migrationBuilder.Sql(
                """
                UPDATE "Users"
                SET "WaitMinutesCsv" = "MediumWaitMinutes" || ',' || "LongWaitMinutes"
                """);

            migrationBuilder.DropColumn(
                name: "MediumWaitMinutes",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LongWaitMinutes",
                table: "Users");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MediumWaitMinutes",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.AddColumn<int>(
                name: "LongWaitMinutes",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 240);

            // Recover the first two waits; any extras are lost, which is the
            // unavoidable cost of going back to a fixed pair.
            migrationBuilder.Sql(
                """
                UPDATE "Users"
                SET "MediumWaitMinutes" =
                        COALESCE(NULLIF(split_part("WaitMinutesCsv", ',', 1), '')::int, 60),
                    "LongWaitMinutes" =
                        COALESCE(NULLIF(split_part("WaitMinutesCsv", ',', 2), '')::int, 240)
                """);

            migrationBuilder.DropColumn(
                name: "WaitMinutesCsv",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DefaultWaitIndex",
                table: "Users");
        }
    }
}
