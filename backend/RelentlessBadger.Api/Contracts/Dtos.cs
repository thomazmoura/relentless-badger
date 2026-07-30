using RelentlessBadger.Api.Models;

namespace RelentlessBadger.Api.Contracts;

public record GoogleLoginRequest(string IdToken);

public record LoginResponse(string Token, string Email, string? Name, SettingsDto Settings);

// WaitMinutes is the ordered list of snooze options; DefaultWaitIndex picks the
// one the reminder notification offers as its one-tap Wait button. QuietHours
// holds "HH:mm-HH:mm" windows in which the client holds reminders back; an empty
// array means quiet hours are off. Both are stored on the user as CSV and
// exposed here as arrays. QuietHours is defaulted so a client that predates the
// field can still PUT settings.
public record SettingsDto(
    int InitialDelayMinutes,
    int RepeatIntervalMinutes,
    int[] WaitMinutes,
    int DefaultWaitIndex,
    string[]? QuietHours = null)
{
    public const int MaxWaits = 6;
    public const int MaxQuietRanges = 6;

    public static SettingsDto From(User user) =>
        new(user.InitialDelayMinutes, user.RepeatIntervalMinutes,
            ParseWaits(user.WaitMinutesCsv), user.DefaultWaitIndex,
            SplitCsv(user.QuietHoursCsv));

    public static int[] ParseWaits(string csv) =>
        SplitCsv(csv).Select(int.Parse).ToArray();

    public static string ToCsv(int[] waits) => string.Join(',', waits);

    public static string ToCsv(string[] quietHours) => string.Join(',', quietHours);

    private static string[] SplitCsv(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>An "HH:mm-HH:mm" window whose two ends are valid and differ.</summary>
    public static bool IsValidQuietRange(string range)
    {
        var ends = range.Split('-');
        return ends.Length == 2 &&
            TimeOnly.TryParseExact(ends[0].Trim(), "HH:mm", out var start) &&
            TimeOnly.TryParseExact(ends[1].Trim(), "HH:mm", out var end) &&
            start != end;
    }
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
// completed on the device; omitted (or an empty body) means "now". Cancelled
// closes the task without crediting it as done.
public record CompleteTaskRequest(DateTime? CompletedAt = null, bool Cancelled = false);

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
    Guid? SeriesId,
    bool Cancelled)
{
    public static TaskDto From(TaskItem task) => new(
        task.Id, task.Title, task.CreatedAt, task.CompletedAt,
        task.InitialDelayMinutes, task.RepeatIntervalMinutes, task.FirstWarningAt,
        task.RecurEveryN, task.RecurUnit, task.RecurDaysOfWeek, task.SeriesId,
        task.Cancelled);
}
