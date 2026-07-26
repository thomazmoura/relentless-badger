namespace RelentlessBadger.Api.Models;

public class TaskItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    // How the task was closed: cancelled means "closed without doing it", so
    // reports can leave it out. Only meaningful once CompletedAt is set.
    public bool Cancelled { get; set; }

    // Snapshotted from the user's defaults at creation time so that changing
    // the defaults later does not affect tasks already being nagged about.
    public int InitialDelayMinutes { get; set; }
    public int RepeatIntervalMinutes { get; set; }

    // When set, the first reminder fires at this absolute (UTC) time instead of
    // CreatedAt + InitialDelayMinutes. Subsequent reminders still use the interval.
    public DateTime? FirstWarningAt { get; set; }

    // Recurrence rule; the client owns its interpretation and spawns the next
    // occurrence as a new task on completion. RecurEveryN null means not
    // recurring. RecurUnit is "days" or "weeks". RecurDaysOfWeek is a bitmask
    // (bit 0 = Monday .. bit 6 = Sunday), used only when the unit is weeks.
    // SeriesId ties the occurrences of one recurring series together.
    public int? RecurEveryN { get; set; }
    public string? RecurUnit { get; set; }
    public int? RecurDaysOfWeek { get; set; }
    public Guid? SeriesId { get; set; }

    public User? User { get; set; }
}
