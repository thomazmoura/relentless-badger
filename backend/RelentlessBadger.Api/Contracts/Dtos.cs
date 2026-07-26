using RelentlessBadger.Api.Models;

namespace RelentlessBadger.Api.Contracts;

public record GoogleLoginRequest(string IdToken);

public record LoginResponse(string Token, string Email, string? Name, SettingsDto Settings);

// WaitMinutes is the ordered list of snooze options; DefaultWaitIndex picks the
// one the reminder notification offers as its one-tap Wait button. Stored on the
// user as CSV, exposed here as an array.
public record SettingsDto(
    int InitialDelayMinutes,
    int RepeatIntervalMinutes,
    int[] WaitMinutes,
    int DefaultWaitIndex)
{
    public const int MaxWaits = 6;

    public static SettingsDto From(User user) =>
        new(user.InitialDelayMinutes, user.RepeatIntervalMinutes,
            ParseWaits(user.WaitMinutesCsv), user.DefaultWaitIndex);

    public static int[] ParseWaits(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(int.Parse)
            .ToArray();

    public static string ToCsv(int[] waits) => string.Join(',', waits);
}

// Id/CreatedAt/delay overrides let an offline-first client push a task it
// already created locally: the id makes retries idempotent, the rest preserves
// the creation time and settings snapshot the task was actually created under.
public record CreateTaskRequest(
    string Title,
    DateTime? FirstWarningAt = null,
    Guid? Id = null,
    DateTime? CreatedAt = null,
    int? InitialDelayMinutes = null,
    int? RepeatIntervalMinutes = null,
    int? RecurEveryN = null,
    string? RecurUnit = null,
    int? RecurDaysOfWeek = null,
    Guid? SeriesId = null);

// CompletedAt lets an offline-first client report when the task was actually
// completed on the device; omitted (or an empty body) means "now".
public record CompleteTaskRequest(DateTime? CompletedAt = null);

// Full-state update: the client always sends the complete desired schedule,
// so null on a nullable field means "clear it" (no PATCH absent-vs-null games).
public record UpdateTaskScheduleRequest(
    DateTime? FirstWarningAt,
    int RepeatIntervalMinutes,
    int? RecurEveryN,
    string? RecurUnit,
    int? RecurDaysOfWeek,
    Guid? SeriesId);

public record TaskDto(
    Guid Id,
    string Title,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    int InitialDelayMinutes,
    int RepeatIntervalMinutes,
    DateTime? FirstWarningAt,
    int? RecurEveryN,
    string? RecurUnit,
    int? RecurDaysOfWeek,
    Guid? SeriesId)
{
    public static TaskDto From(TaskItem task) => new(
        task.Id, task.Title, task.CreatedAt, task.CompletedAt,
        task.InitialDelayMinutes, task.RepeatIntervalMinutes, task.FirstWarningAt,
        task.RecurEveryN, task.RecurUnit, task.RecurDaysOfWeek, task.SeriesId);
}
