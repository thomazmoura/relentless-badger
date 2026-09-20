package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

class DailyOverviewTest {

    private val zone = ZoneId.of("America/New_York")

    /** Noon on a Wednesday — far enough from either midnight to be unambiguous. */
    private val now = at(2026, 7, 15, 12, 0)

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute).atZone(zone).toInstant().toEpochMilli()

    private fun openTask(
        id: String = "task",
        title: String = "task",
        createdAtMillis: Long = now,
        initialDelayMinutes: Int = 60,
        firstWarningAtMillis: Long? = null,
        nextFireAtMillis: Long? = null,
        recurrence: Recurrence? = null,
    ) = OpenTaskEntity(
        id = id,
        title = title,
        createdAtMillis = createdAtMillis,
        initialDelayMinutes = initialDelayMinutes,
        repeatIntervalMinutes = 15,
        firstWarningAtMillis = firstWarningAtMillis,
        nextFireAtMillis = nextFireAtMillis ?: firstWarningAtMillis ?: createdAtMillis,
        recurEveryN = recurrence?.everyN,
        recurUnit = recurrence?.unit?.wire(),
        recurDaysOfWeek = recurrence?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek,
        seriesId = recurrence?.let { id },
    )

    private fun completedTask(
        id: String = "done",
        title: String = "done",
        completedAtMillis: Long,
        cancelled: Boolean = false,
        seriesId: String? = null,
    ) = CompletedTaskEntity(id, title, completedAtMillis, seriesId, cancelled)

    /** The day [now] falls on, where the overview splits into now and later. */
    private fun overview(vararg tasks: OpenTaskEntity) =
        buildDailyOverview(tasks.toList(), emptyList(), today, now, includeConcluded = false, zone = zone)

    private fun overviewOf(
        date: LocalDate,
        openTasks: List<OpenTaskEntity> = emptyList(),
        completed: List<CompletedTaskEntity> = emptyList(),
        includeConcluded: Boolean = true,
    ) = buildDailyOverview(openTasks, completed, date, now, includeConcluded, zone)

    private val today = LocalDate.of(2026, 7, 15)

    /** The items of [kind], or an empty list when the section isn't on screen. */
    private fun DailyOverview.items(kind: OverviewSectionKind) =
        sections.firstOrNull { it.kind == kind }?.items.orEmpty()

    private val DailyOverview.now get() = items(OverviewSectionKind.NOW)
    private val DailyOverview.later get() = items(OverviewSectionKind.LATER)

    @Test
    fun `a task whose start has passed is nagging now`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 15, 9, 12)))

        assertEquals(listOf("task"), result.now.map { it.title })
        assertTrue(result.later.isEmpty())
    }

    @Test
    fun `a task starting later today is expected later`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 15, 18, 0)))

        assertTrue(result.now.isEmpty())
        assertEquals(listOf("task"), result.later.map { it.title })
    }

    @Test
    fun `a task starting tomorrow is in neither section`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 16, 9, 0)))

        assertTrue("tomorrow belongs to the calendar, not today", result.now.isEmpty())
        assertTrue(result.later.isEmpty())
    }

    @Test
    fun `a task still nagging from yesterday stays in now`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 14, 21, 0)))

        assertEquals(1, result.now.size)
        assertEquals(
            "the overview reports when it started, not when it next fires",
            at(2026, 7, 14, 21, 0),
            result.now.single().atMillis,
        )
        assertTrue(
            "a carried-over nag must be marked, so its label can carry the date",
            result.now.single().fromEarlierDay,
        )
    }

    @Test
    fun `a nag that began today is not marked as carried over`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 15, 9, 12)))

        assertFalse(result.now.single().fromEarlierDay)
    }

    @Test
    fun `a snoozed task stays in now rather than jumping to later`() {
        // Snoozing pushes nextFire out but leaves the first warning alone.
        val result = overview(
            openTask(
                firstWarningAtMillis = at(2026, 7, 15, 9, 0),
                nextFireAtMillis = at(2026, 7, 15, 20, 0),
            ),
        )

        assertEquals(listOf("task"), result.now.map { it.title })
        assertTrue(result.later.isEmpty())
    }

    @Test
    fun `a task without a first warning counts as nagging and reports its delayed start`() {
        val created = at(2026, 7, 15, 11, 30)
        val result = overview(openTask(createdAtMillis = created, initialDelayMinutes = 60))

        assertEquals(1, result.now.size)
        assertEquals(created + 60 * 60_000L, result.now.single().atMillis)
    }

    @Test
    fun `both sections come back in time order`() {
        val result = overview(
            openTask(id = "c", title = "c", firstWarningAtMillis = at(2026, 7, 15, 22, 0)),
            openTask(id = "a", title = "a", firstWarningAtMillis = at(2026, 7, 15, 8, 0)),
            openTask(id = "d", title = "d", firstWarningAtMillis = at(2026, 7, 15, 18, 0)),
            openTask(id = "b", title = "b", firstWarningAtMillis = at(2026, 7, 15, 11, 0)),
        )

        assertEquals(listOf("a", "b"), result.now.map { it.title })
        assertEquals(listOf("d", "c"), result.later.map { it.title })
    }

    @Test
    fun `a recurring occurrence is flagged and counted once`() {
        val result = overview(
            openTask(
                firstWarningAtMillis = at(2026, 7, 15, 18, 0),
                recurrence = Recurrence(1, RecurUnit.DAYS),
            ),
        )

        assertEquals(1, result.later.size)
        assertTrue(result.later.single().recurring)
    }

    @Test
    fun `a one-off is not flagged as recurring`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 15, 18, 0)))

        assertFalse(result.later.single().recurring)
    }

    @Test
    fun `a task starting at the last minute of the day still counts as today`() {
        val result = overview(openTask(firstWarningAtMillis = at(2026, 7, 15, 23, 59)))

        assertEquals(1, result.later.size)
    }

    // --- Other days ---------------------------------------------------------

    @Test
    fun `a past day shows a still-open task as overdue`() {
        val result = overviewOf(
            LocalDate.of(2026, 7, 13),
            openTasks = listOf(openTask(firstWarningAtMillis = at(2026, 7, 13, 9, 0))),
        )

        assertEquals(listOf("task"), result.items(OverviewSectionKind.OVERDUE).map { it.title })
        assertTrue(
            "now and later are today's question",
            result.items(OverviewSectionKind.NOW).isEmpty() && result.items(OverviewSectionKind.LATER).isEmpty(),
        )
    }

    @Test
    fun `a task left over from a different day is not that day's debt`() {
        val result = overviewOf(
            LocalDate.of(2026, 7, 13),
            openTasks = listOf(openTask(firstWarningAtMillis = at(2026, 7, 14, 9, 0))),
        )

        assertTrue(result.isEmpty)
    }

    @Test
    fun `a past day reports what was completed on it`() {
        val result = overviewOf(
            LocalDate.of(2026, 7, 13),
            completed = listOf(completedTask(completedAtMillis = at(2026, 7, 13, 16, 40))),
        )

        assertEquals(listOf("done"), result.items(OverviewSectionKind.DONE).map { it.title })
        assertEquals(at(2026, 7, 13, 16, 40), result.items(OverviewSectionKind.DONE).single().atMillis)
    }

    @Test
    fun `a cancellation is never reported as done`() {
        val result = overviewOf(
            LocalDate.of(2026, 7, 13),
            completed = listOf(completedTask(completedAtMillis = at(2026, 7, 13, 16, 40), cancelled = true)),
        )

        assertTrue("a cancellation must not read as an accomplishment", result.isEmpty)
    }

    @Test
    fun `completions stay out until they are asked for`() {
        val completed = listOf(completedTask(completedAtMillis = at(2026, 7, 13, 16, 40)))

        assertTrue(
            overviewOf(LocalDate.of(2026, 7, 13), completed = completed, includeConcluded = false).isEmpty,
        )
        assertFalse(overviewOf(LocalDate.of(2026, 7, 13), completed = completed).isEmpty)
    }

    @Test
    fun `today can show its completions alongside what is still owed`() {
        val result = overviewOf(
            today,
            openTasks = listOf(openTask(firstWarningAtMillis = at(2026, 7, 15, 9, 12))),
            completed = listOf(completedTask(completedAtMillis = at(2026, 7, 15, 10, 0))),
        )

        assertEquals(
            listOf(OverviewSectionKind.NOW, OverviewSectionKind.DONE),
            result.sections.map { it.kind },
        )
    }

    @Test
    fun `a future day shows what is scheduled, never what is nagging`() {
        val result = overviewOf(
            LocalDate.of(2026, 7, 17),
            openTasks = listOf(openTask(firstWarningAtMillis = at(2026, 7, 17, 8, 0))),
        )

        assertEquals(
            listOf(OverviewSectionKind.SCHEDULED),
            result.sections.map { it.kind },
        )
    }

    @Test
    fun `a future day expands a repeating series onto its own occurrence`() {
        // Anchored on Wednesday the 15th, so the series lands on the 22nd — a
        // day the current occurrence says nothing about.
        val result = overviewOf(
            LocalDate.of(2026, 7, 22),
            openTasks = listOf(
                openTask(
                    firstWarningAtMillis = at(2026, 7, 15, 18, 0),
                    recurrence = Recurrence(1, RecurUnit.WEEKS, daysOfWeek = 1 shl 2),
                ),
            ),
        )

        val scheduled = result.items(OverviewSectionKind.SCHEDULED)
        assertEquals(1, scheduled.size)
        assertEquals(at(2026, 7, 22, 18, 0), scheduled.single().atMillis)
        assertTrue(scheduled.single().recurring)
    }

    @Test
    fun `a day with nothing on it has no sections at all`() {
        assertTrue(overviewOf(LocalDate.of(2026, 7, 13)).isEmpty)
    }
}
