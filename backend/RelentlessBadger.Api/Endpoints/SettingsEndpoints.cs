using System.Security.Claims;
using RelentlessBadger.Api.Contracts;
using RelentlessBadger.Api.Data;

namespace RelentlessBadger.Api.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/me").RequireAuthorization();

        group.MapGet("/settings", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var user = await principal.GetUserAsync(db);
            return user is null ? Results.Unauthorized() : Results.Ok(SettingsDto.From(user));
        });

        group.MapPut("/settings", async (SettingsDto settings, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (settings.InitialDelayMinutes < 1 || settings.RepeatIntervalMinutes < 1 ||
                settings.WaitMinutes is null || settings.WaitMinutes.Any(w => w < 1))
            {
                return Results.BadRequest(new { error = "Delays must be at least 1 minute." });
            }

            if (settings.WaitMinutes.Length is 0 || settings.WaitMinutes.Length > SettingsDto.MaxWaits)
            {
                return Results.BadRequest(
                    new { error = $"Pick between 1 and {SettingsDto.MaxWaits} waits." });
            }

            if (settings.DefaultWaitIndex < 0 || settings.DefaultWaitIndex >= settings.WaitMinutes.Length)
            {
                return Results.BadRequest(new { error = "The default wait must be one of the waits." });
            }

            var quietHours = settings.QuietHours ?? [];
            if (quietHours.Length > SettingsDto.MaxQuietRanges)
            {
                return Results.BadRequest(
                    new { error = $"Pick at most {SettingsDto.MaxQuietRanges} quiet hour ranges." });
            }

            if (quietHours.Any(range => !SettingsDto.IsValidQuietRange(range)))
            {
                return Results.BadRequest(
                    new { error = "Quiet hours must look like \"HH:mm-HH:mm\" and not start and end at the same time." });
            }

            var user = await principal.GetUserAsync(db);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            user.InitialDelayMinutes = settings.InitialDelayMinutes;
            user.RepeatIntervalMinutes = settings.RepeatIntervalMinutes;
            user.WaitMinutesCsv = SettingsDto.ToCsv(settings.WaitMinutes);
            user.DefaultWaitIndex = settings.DefaultWaitIndex;
            user.QuietHoursCsv = SettingsDto.ToCsv(quietHours);
            await db.SaveChangesAsync();

            return Results.Ok(SettingsDto.From(user));
        });
    }
}
