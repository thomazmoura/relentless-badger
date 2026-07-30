using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using RelentlessBadger.Api.Contracts;

namespace RelentlessBadger.Api.Tests;

public class ApiTests : IClassFixture<TestAppFactory>
{
    private readonly TestAppFactory _factory;

    public ApiTests(TestAppFactory factory) => _factory = factory;

    private async Task<HttpClient> LoginAsync(string sub = "sub-1", string email = "user@example.com")
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/auth/google",
            new GoogleLoginRequest($"{sub}|{email}|Test User"));
        response.EnsureSuccessStatusCode();
        var login = await response.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", login!.Token);
        return client;
    }

    [Fact]
    public async Task Endpoints_require_authentication()
    {
        var client = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/tasks")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/me/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/tasks/titles")).StatusCode);
    }

    [Fact]
    public async Task Invalid_google_token_is_rejected()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/auth/google", new GoogleLoginRequest("garbage"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_twice_reuses_the_same_user()
    {
        var client1 = await LoginAsync(sub: "repeat-sub");
        var created = await (await client1.PostAsJsonAsync("/tasks", new CreateTaskRequest("persisted task")))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.NotNull(created);

        var client2 = await LoginAsync(sub: "repeat-sub");
        var tasks = await client2.GetFromJsonAsync<List<TaskDto>>("/tasks?status=open");
        Assert.Contains(tasks!, t => t.Id == created!.Id);
    }

    [Fact]
    public async Task Task_lifecycle_create_list_complete()
    {
        var client = await LoginAsync(sub: "lifecycle-sub");

        var createResponse = await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("  take out trash  "));
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var task = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal("take out trash", task!.Title);
        Assert.Null(task.CompletedAt);

        var open = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=open");
        Assert.Contains(open!, t => t.Id == task.Id);

        var completeResponse = await client.PostAsync($"/tasks/{task.Id}/complete", null);
        completeResponse.EnsureSuccessStatusCode();
        var completed = await completeResponse.Content.ReadFromJsonAsync<TaskDto>();
        Assert.NotNull(completed!.CompletedAt);

        open = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=open");
        Assert.DoesNotContain(open!, t => t.Id == task.Id);

        var done = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=done");
        Assert.Contains(done!, t => t.Id == task.Id);
    }

    [Fact]
    public async Task Complete_preserves_the_client_completion_time()
    {
        var client = await LoginAsync(sub: "completed-at-sub");
        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("done offline")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var completedAt = new DateTime(2026, 7, 10, 8, 30, 0, DateTimeKind.Utc);
        var response = await client.PostAsJsonAsync(
            $"/tasks/{task!.Id}/complete", new CompleteTaskRequest(completedAt));
        response.EnsureSuccessStatusCode();
        var completed = await response.Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(completedAt, completed!.CompletedAt!.Value.ToUniversalTime());
    }

    [Fact]
    public async Task Cancelling_closes_the_task_but_flags_it_as_not_done()
    {
        var client = await LoginAsync(sub: "cancelled-sub");
        var cancelled = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("skip today")))
            .Content.ReadFromJsonAsync<TaskDto>();
        var completed = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("actually did it")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var response = await client.PostAsJsonAsync(
            $"/tasks/{cancelled!.Id}/complete", new CompleteTaskRequest(Cancelled: true));
        response.EnsureSuccessStatusCode();
        Assert.True((await response.Content.ReadFromJsonAsync<TaskDto>())!.Cancelled);

        (await client.PostAsJsonAsync($"/tasks/{completed!.Id}/complete", new CompleteTaskRequest()))
            .EnsureSuccessStatusCode();

        // Both are closed and both come back on the done list — cancelling keeps
        // the record, it is the reports that filter it out.
        Assert.Empty(await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=open") ?? []);
        var done = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=done") ?? [];
        Assert.True(done.Single(t => t.Id == cancelled.Id).Cancelled);
        Assert.False(done.Single(t => t.Id == completed.Id).Cancelled);
    }

    [Fact]
    public async Task Cancelling_an_already_completed_task_changes_nothing()
    {
        var client = await LoginAsync(sub: "cancel-idempotent-sub");
        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("already done")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var completedAt = new DateTime(2026, 7, 20, 6, 15, 0, DateTimeKind.Utc);
        (await client.PostAsJsonAsync($"/tasks/{task!.Id}/complete", new CompleteTaskRequest(completedAt)))
            .EnsureSuccessStatusCode();

        var response = await client.PostAsJsonAsync(
            $"/tasks/{task.Id}/complete",
            new CompleteTaskRequest(completedAt.AddHours(3), Cancelled: true));
        response.EnsureSuccessStatusCode();
        var after = await response.Content.ReadFromJsonAsync<TaskDto>();
        // Re-read from the store, so the timestamp comes back kind-less.
        Assert.Equal(completedAt, DateTime.SpecifyKind(after!.CompletedAt!.Value, DateTimeKind.Utc));
        Assert.False(after.Cancelled);
    }

    [Fact]
    public async Task First_warning_time_round_trips_and_defaults_to_null()
    {
        var client = await LoginAsync(sub: "first-warning-sub");

        var warningAt = new DateTime(2026, 7, 12, 9, 0, 0, DateTimeKind.Utc);
        var scheduled = await (await client.PostAsJsonAsync("/tasks",
                new CreateTaskRequest("scheduled task", warningAt)))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(warningAt, scheduled!.FirstWarningAt!.Value.ToUniversalTime());

        var plain = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("plain task")))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Null(plain!.FirstWarningAt);
    }

    [Fact]
    public async Task Recurrence_round_trips_on_create_and_defaults_to_null()
    {
        var client = await LoginAsync(sub: "recurrence-sub");

        var seriesId = Guid.NewGuid();
        var recurring = await (await client.PostAsJsonAsync("/tasks",
                new CreateTaskRequest("water plants",
                    new DateTime(2026, 7, 13, 9, 0, 0, DateTimeKind.Utc),
                    RecurEveryN: 2, RecurUnit: "weeks", RecurDaysOfWeek: 0b0010001, SeriesId: seriesId)))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(2, recurring!.RecurEveryN);
        Assert.Equal("weeks", recurring.RecurUnit);
        Assert.Equal(0b0010001, recurring.RecurDaysOfWeek);
        Assert.Equal(seriesId, recurring.SeriesId);

        var listed = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=open");
        var fetched = Assert.Single(listed!, t => t.Id == recurring.Id);
        Assert.Equal(2, fetched.RecurEveryN);

        var plain = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("one-off")))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Null(plain!.RecurEveryN);
        Assert.Null(plain.RecurUnit);
        Assert.Null(plain.RecurDaysOfWeek);
        Assert.Null(plain.SeriesId);
    }

    [Fact]
    public async Task Invalid_recurrence_is_rejected()
    {
        var client = await LoginAsync(sub: "invalid-recurrence-sub");

        var invalidRequests = new[]
        {
            new CreateTaskRequest("t", RecurEveryN: 0, RecurUnit: "days"),
            new CreateTaskRequest("t", RecurEveryN: 1, RecurUnit: "fortnights"),
            new CreateTaskRequest("t", RecurEveryN: 1, RecurUnit: "weeks", RecurDaysOfWeek: 0),
            new CreateTaskRequest("t", RecurEveryN: 1, RecurUnit: "weeks", RecurDaysOfWeek: 128),
            new CreateTaskRequest("t", RecurEveryN: 1, RecurUnit: "days", RecurDaysOfWeek: 1),
            new CreateTaskRequest("t", RecurEveryN: 1),
            new CreateTaskRequest("t", RecurUnit: "days"),
        };
        foreach (var request in invalidRequests)
        {
            var response = await client.PostAsJsonAsync("/tasks", request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Fact]
    public async Task Schedule_update_round_trips()
    {
        var client = await LoginAsync(sub: "schedule-update-sub");
        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("tune me")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var warningAt = new DateTime(2026, 8, 1, 7, 30, 0, DateTimeKind.Utc);
        var updateResponse = await client.PutAsJsonAsync($"/tasks/{task!.Id}/schedule",
            new UpdateTaskScheduleRequest(warningAt, 45, 1, "days", null, task.Id));
        updateResponse.EnsureSuccessStatusCode();
        var updated = await updateResponse.Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(warningAt, updated!.FirstWarningAt!.Value.ToUniversalTime());
        Assert.Equal(45, updated.RepeatIntervalMinutes);
        Assert.Equal(1, updated.RecurEveryN);
        Assert.Equal("days", updated.RecurUnit);
        Assert.Equal(task.Id, updated.SeriesId);

        var cleared = await (await client.PutAsJsonAsync($"/tasks/{task.Id}/schedule",
                new UpdateTaskScheduleRequest(null, 15, null, null, null, null)))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Null(cleared!.FirstWarningAt);
        Assert.Equal(15, cleared.RepeatIntervalMinutes);
        Assert.Null(cleared.RecurEveryN);
        Assert.Null(cleared.SeriesId);
    }

    [Fact]
    public async Task Invalid_schedule_update_is_rejected()
    {
        var client = await LoginAsync(sub: "invalid-schedule-sub");
        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("guarded")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var badInterval = await client.PutAsJsonAsync($"/tasks/{task!.Id}/schedule",
            new UpdateTaskScheduleRequest(null, 0, null, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, badInterval.StatusCode);

        var badRecurrence = await client.PutAsJsonAsync($"/tasks/{task.Id}/schedule",
            new UpdateTaskScheduleRequest(null, 15, 1, "weeks", 0, null));
        Assert.Equal(HttpStatusCode.BadRequest, badRecurrence.StatusCode);
    }

    [Fact]
    public async Task Schedule_update_unknown_or_foreign_task_is_not_found()
    {
        var alice = await LoginAsync(sub: "schedule-alice", email: "alice@example.com");
        var bob = await LoginAsync(sub: "schedule-bob", email: "bob@example.com");

        var request = new UpdateTaskScheduleRequest(null, 15, null, null, null, null);
        Assert.Equal(HttpStatusCode.NotFound,
            (await alice.PutAsJsonAsync($"/tasks/{Guid.NewGuid()}/schedule", request)).StatusCode);

        var aliceTask = await (await alice.PostAsJsonAsync("/tasks", new CreateTaskRequest("alice task")))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(HttpStatusCode.NotFound,
            (await bob.PutAsJsonAsync($"/tasks/{aliceTask!.Id}/schedule", request)).StatusCode);
    }

    [Fact]
    public async Task Client_supplied_id_created_at_and_delays_are_honored()
    {
        var client = await LoginAsync(sub: "client-id-sub");

        var id = Guid.NewGuid();
        var createdAt = new DateTime(2026, 7, 1, 8, 30, 0, DateTimeKind.Utc);
        var response = await client.PostAsJsonAsync("/tasks",
            new CreateTaskRequest("offline task", null, id, createdAt, 30, 5));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var task = await response.Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(id, task!.Id);
        Assert.Equal(createdAt, task.CreatedAt.ToUniversalTime());
        Assert.Equal(30, task.InitialDelayMinutes);
        Assert.Equal(5, task.RepeatIntervalMinutes);
    }

    [Fact]
    public async Task Create_with_same_id_is_idempotent()
    {
        var client = await LoginAsync(sub: "idempotent-sub");

        var id = Guid.NewGuid();
        var request = new CreateTaskRequest("pushed twice", null, id);
        var first = await client.PostAsJsonAsync("/tasks", request);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var retry = await client.PostAsJsonAsync("/tasks", request);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var task = await retry.Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(id, task!.Id);

        var all = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=all");
        Assert.Single(all!, t => t.Id == id);
    }

    [Fact]
    public async Task Create_with_id_owned_by_another_user_conflicts()
    {
        var alice = await LoginAsync(sub: "conflict-alice", email: "alice@example.com");
        var bob = await LoginAsync(sub: "conflict-bob", email: "bob@example.com");

        var id = Guid.NewGuid();
        (await alice.PostAsJsonAsync("/tasks", new CreateTaskRequest("alice task", null, id)))
            .EnsureSuccessStatusCode();

        var response = await bob.PostAsJsonAsync("/tasks", new CreateTaskRequest("bob task", null, id));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Empty_title_is_rejected()
    {
        var client = await LoginAsync(sub: "empty-title-sub");
        var response = await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("   "));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Settings_round_trip_and_snapshot_into_new_tasks()
    {
        var client = await LoginAsync(sub: "settings-sub");

        var defaults = await client.GetFromJsonAsync<SettingsDto>("/me/settings");
        Assert.Equal(60, defaults!.InitialDelayMinutes);
        Assert.Equal(15, defaults.RepeatIntervalMinutes);
        Assert.Equal([60, 240], defaults.WaitMinutes);
        Assert.Equal(0, defaults.DefaultWaitIndex);

        var putResponse = await client.PutAsJsonAsync(
            "/me/settings", new SettingsDto(30, 5, [15, 90, 300, 480], 2));
        putResponse.EnsureSuccessStatusCode();

        var updated = await client.GetFromJsonAsync<SettingsDto>("/me/settings");
        Assert.Equal(30, updated!.InitialDelayMinutes);
        Assert.Equal(5, updated.RepeatIntervalMinutes);
        Assert.Equal([15, 90, 300, 480], updated.WaitMinutes);
        Assert.Equal(2, updated.DefaultWaitIndex);

        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("water plants")))
            .Content.ReadFromJsonAsync<TaskDto>();
        Assert.Equal(30, task!.InitialDelayMinutes);
        Assert.Equal(5, task.RepeatIntervalMinutes);

        var invalid = await client.PutAsJsonAsync("/me/settings", new SettingsDto(0, 5, [90, 300], 0));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Settings_rejects_wait_lists_it_cannot_honour()
    {
        var client = await LoginAsync(sub: "waits-sub");

        // A zero-minute wait would nag again instantly.
        var zeroWait = await client.PutAsJsonAsync("/me/settings", new SettingsDto(30, 5, [0, 300], 0));
        Assert.Equal(HttpStatusCode.BadRequest, zeroWait.StatusCode);

        // No waits at all leaves the reminder with nothing to snooze by.
        var noWaits = await client.PutAsJsonAsync("/me/settings", new SettingsDto(30, 5, [], 0));
        Assert.Equal(HttpStatusCode.BadRequest, noWaits.StatusCode);

        var tooMany = await client.PutAsJsonAsync(
            "/me/settings", new SettingsDto(30, 5, [1, 2, 3, 4, 5, 6, 7], 0));
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);

        // The default must name a wait that exists.
        var badIndex = await client.PutAsJsonAsync("/me/settings", new SettingsDto(30, 5, [90, 300], 2));
        Assert.Equal(HttpStatusCode.BadRequest, badIndex.StatusCode);

        var negativeIndex = await client.PutAsJsonAsync("/me/settings", new SettingsDto(30, 5, [90, 300], -1));
        Assert.Equal(HttpStatusCode.BadRequest, negativeIndex.StatusCode);

        // Nothing above stuck: the user still has the defaults.
        var settings = await client.GetFromJsonAsync<SettingsDto>("/me/settings");
        Assert.Equal([60, 240], settings!.WaitMinutes);
    }

    [Fact]
    public async Task Titles_are_distinct_and_ordered_by_frequency()
    {
        var client = await LoginAsync(sub: "titles-sub");

        foreach (var title in new[] { "take out trash", "walk dog", "take out trash" })
        {
            var response = await client.PostAsJsonAsync("/tasks", new CreateTaskRequest(title));
            response.EnsureSuccessStatusCode();
        }

        var titles = await client.GetFromJsonAsync<List<string>>("/tasks/titles");
        Assert.Equal(2, titles!.Count);
        Assert.Equal("take out trash", titles[0]);
        Assert.Equal("walk dog", titles[1]);
    }

    [Fact]
    public async Task Users_cannot_see_or_touch_each_others_tasks()
    {
        var alice = await LoginAsync(sub: "alice-sub", email: "alice@example.com");
        var bob = await LoginAsync(sub: "bob-sub", email: "bob@example.com");

        var aliceTask = await (await alice.PostAsJsonAsync("/tasks", new CreateTaskRequest("alice secret")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var bobTasks = await bob.GetFromJsonAsync<List<TaskDto>>("/tasks?status=all");
        Assert.DoesNotContain(bobTasks!, t => t.Id == aliceTask!.Id);

        Assert.Equal(HttpStatusCode.NotFound,
            (await bob.PostAsync($"/tasks/{aliceTask!.Id}/complete", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await bob.DeleteAsync($"/tasks/{aliceTask.Id}")).StatusCode);
    }

    [Fact]
    public async Task Delete_removes_task()
    {
        var client = await LoginAsync(sub: "delete-sub");
        var task = await (await client.PostAsJsonAsync("/tasks", new CreateTaskRequest("to be deleted")))
            .Content.ReadFromJsonAsync<TaskDto>();

        var deleteResponse = await client.DeleteAsync($"/tasks/{task!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var all = await client.GetFromJsonAsync<List<TaskDto>>("/tasks?status=all");
        Assert.DoesNotContain(all!, t => t.Id == task.Id);
    }

    // The web client lives on another origin, so its preflight has to pass
    // without an Authorization header — and only from a configured origin.
    [Fact]
    public async Task Preflight_from_a_configured_origin_is_allowed()
    {
        var client = _factory
            .WithWebHostBuilder(builder => builder.UseSetting("Cors:AllowedOrigins:0", "http://localhost:4200"))
            .CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Options, "/tasks");
        request.Headers.Add("Origin", "http://localhost:4200");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("http://localhost:4200",
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task Preflight_from_an_unknown_origin_gets_no_cors_headers()
    {
        var client = _factory
            .WithWebHostBuilder(builder => builder.UseSetting("Cors:AllowedOrigins:0", "http://localhost:4200"))
            .CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Options, "/tasks");
        request.Headers.Add("Origin", "http://evil.example");
        request.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await client.SendAsync(request);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
