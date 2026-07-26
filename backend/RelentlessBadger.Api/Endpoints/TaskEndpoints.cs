using System.Security.Claims;
using RelentlessBadger.Api.Contracts;
using RelentlessBadger.Api.Data;
using RelentlessBadger.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;

namespace RelentlessBadger.Api.Endpoints;

public static class TaskEndpoints
{
    public static void MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/tasks").RequireAuthorization();

        group.MapGet("/", async (string? status, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.GetUserId();
            var query = db.Tasks.Where(t => t.UserId == userId);
            query = status switch
            {
                "open" or null => query.Where(t => t.CompletedAt == null),
                "done" => query.Where(t => t.CompletedAt != null),
                "all" => query,
                _ => query.Where(t => t.CompletedAt == null),
            };

            var tasks = await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
            return Results.Ok(tasks.Select(TaskDto.From));
        });

        group.MapPost("/", async (CreateTaskRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var title = request.Title?.Trim();
            if (string.IsNullOrEmpty(title))
            {
                return Results.BadRequest(new { error = "Title is required." });
            }

            if (ValidateRecurrence(request.RecurEveryN, request.RecurUnit, request.RecurDaysOfWeek) is { } recurrenceError)
            {
                return Results.BadRequest(new { error = recurrenceError });
            }

            var user = await principal.GetUserAsync(db);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            if (request.Id is { } id)
            {
                var existing = await db.Tasks.SingleOrDefaultAsync(t => t.Id == id);
                if (existing is not null)
                {
                    // Idempotent retry from a client re-pushing an offline create.
                    return existing.UserId == user.Id
                        ? Results.Ok(TaskDto.From(existing))
                        : Results.Conflict(new { error = "Id already in use." });
                }
            }

            var task = new TaskItem
            {
                Id = request.Id ?? Guid.NewGuid(),
                UserId = user.Id,
                Title = title,
                CreatedAt = request.CreatedAt?.ToUniversalTime() ?? DateTime.UtcNow,
                InitialDelayMinutes = Math.Max(1, request.InitialDelayMinutes ?? user.InitialDelayMinutes),
                RepeatIntervalMinutes = Math.Max(1, request.RepeatIntervalMinutes ?? user.RepeatIntervalMinutes),
                FirstWarningAt = request.FirstWarningAt?.ToUniversalTime(),
                RecurEveryN = request.RecurEveryN,
                RecurUnit = request.RecurUnit,
                RecurDaysOfWeek = request.RecurDaysOfWeek,
                SeriesId = request.SeriesId,
            };
            db.Tasks.Add(task);
            await db.SaveChangesAsync();

            return Results.Created($"/tasks/{task.Id}", TaskDto.From(task));
        });

        group.MapPut("/{id:guid}/schedule", async (
            Guid id, UpdateTaskScheduleRequest request, ClaimsPrincipal principal, AppDbContext db) =>
        {
            if (request.RepeatIntervalMinutes < 1)
            {
                return Results.BadRequest(new { error = "RepeatIntervalMinutes must be at least 1." });
            }

            if (ValidateRecurrence(request.RecurEveryN, request.RecurUnit, request.RecurDaysOfWeek) is { } recurrenceError)
            {
                return Results.BadRequest(new { error = recurrenceError });
            }

            var userId = principal.GetUserId();
            var task = await db.Tasks.SingleOrDefaultAsync(t => t.Id == id && t.UserId == userId);
            if (task is null)
            {
                return Results.NotFound();
            }

            task.FirstWarningAt = request.FirstWarningAt?.ToUniversalTime();
            task.RepeatIntervalMinutes = request.RepeatIntervalMinutes;
            task.RecurEveryN = request.RecurEveryN;
            task.RecurUnit = request.RecurUnit;
            task.RecurDaysOfWeek = request.RecurDaysOfWeek;
            task.SeriesId = request.SeriesId;
            await db.SaveChangesAsync();
            return Results.Ok(TaskDto.From(task));
        });

        group.MapPost("/{id:guid}/complete", async (
            Guid id,
            [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] CompleteTaskRequest? request,
            ClaimsPrincipal principal,
            AppDbContext db) =>
        {
            var userId = principal.GetUserId();
            var task = await db.Tasks.SingleOrDefaultAsync(t => t.Id == id && t.UserId == userId);
            if (task is null)
            {
                return Results.NotFound();
            }

            // Idempotent: a re-pushed close (or a cancel racing a complete) must
            // neither move the completion time nor rewrite how it was closed.
            if (task.CompletedAt is null)
            {
                task.CompletedAt = request?.CompletedAt?.ToUniversalTime() ?? DateTime.UtcNow;
                task.Cancelled = request?.Cancelled ?? false;
            }

            await db.SaveChangesAsync();
            return Results.Ok(TaskDto.From(task));
        });

        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.GetUserId();
            var deleted = await db.Tasks
                .Where(t => t.Id == id && t.UserId == userId)
                .ExecuteDeleteAsync();
            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });

        // Distinct historical titles, most frequent first (recency breaks ties).
        // Feeds the client-side fuzzy autocomplete.
        group.MapGet("/titles", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var userId = principal.GetUserId();
            var titles = await db.Tasks
                .Where(t => t.UserId == userId)
                .GroupBy(t => t.Title)
                .Select(g => new { Title = g.Key, Count = g.Count(), Latest = g.Max(t => t.CreatedAt) })
                .OrderByDescending(g => g.Count)
                .ThenByDescending(g => g.Latest)
                .Take(500)
                .Select(g => g.Title)
                .ToListAsync();
            return Results.Ok(titles);
        });
    }

    // The client interprets the rule; the server only guards structural sanity.
    private static string? ValidateRecurrence(int? everyN, string? unit, int? daysOfWeek)
    {
        if (everyN is null)
        {
            return unit is null && daysOfWeek is null
                ? null
                : "RecurUnit and RecurDaysOfWeek require RecurEveryN.";
        }

        if (everyN < 1)
        {
            return "RecurEveryN must be at least 1.";
        }

        return unit switch
        {
            "days" => daysOfWeek is null ? null : "RecurDaysOfWeek only applies to weekly recurrence.",
            "weeks" => daysOfWeek is >= 1 and <= 127 ? null : "RecurDaysOfWeek must be a bitmask between 1 and 127.",
            _ => "RecurUnit must be \"days\" or \"weeks\".",
        };
    }
}
