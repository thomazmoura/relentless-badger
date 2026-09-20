package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
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

    private fun overview(vararg tasks: OpenTaskEntity) =
        buildDailyOverview(tasks.toList(), now, zone)

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
}
