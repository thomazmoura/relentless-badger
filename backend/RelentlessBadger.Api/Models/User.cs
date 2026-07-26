namespace RelentlessBadger.Api.Models;

public class User
{
    public Guid Id { get; set; }
    public required string GoogleSub { get; set; }
    public required string Email { get; set; }
    public string? Name { get; set; }
    public int InitialDelayMinutes { get; set; } = 60;
    public int RepeatIntervalMinutes { get; set; } = 15;
    // The user's snooze options, in minutes, as a comma-separated list in the
    // order they are shown; DefaultWaitIndex points at the one the reminder
    // notification's one-tap Wait button uses.
    public string WaitMinutesCsv { get; set; } = "60,240";
    public int DefaultWaitIndex { get; set; }

    public List<TaskItem> Tasks { get; set; } = [];
}
