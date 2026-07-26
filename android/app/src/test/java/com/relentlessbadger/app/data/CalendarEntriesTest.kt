package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId

class CalendarEntriesTest {

    private val zone = ZoneId.of("America/New_York")
    private val july = YearMonth.of(2026, 7)

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute).atZone(zone).toInstant().toEpochMilli()

    private fun openTask(
        id: String = "task",
        title: String = "task",
        createdAtMillis: Long,
        initialDelayMinutes: Int = 60,
        firstWarningAtMillis: Long? = null,
        recurrence: Recurrence? = null,
    ) = OpenTaskEntity(
        id = id,
        title = title,
        createdAtMillis = createdAtMillis,
        initialDelayMinutes = initialDelayMinutes,
        repeatIntervalMinutes = 15,
        firstWarningAtMillis = firstWarningAtMillis,
        nextFireAtMillis = firstWarningAtMillis ?: createdAtMillis,
        recurEveryN = recurrence?.everyN,
        recurUnit = recurrence?.unit?.wire(),
        recurDaysOfWeek = recurrence?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek,
        seriesId = recurrence?.let { id },
    )

    private fun completed(
        id: String,
        title: String,
        atMillis: Long,
        seriesId: String? = null,
        cancelled: Boolean = false,
    ) = CompletedTaskEntity(id, title, atMillis, seriesId, cancelled)

    private fun days(
        openTasks: List<OpenTaskEntity> = emptyList(),
        completedTasks: List<CompletedTaskEntity> = emptyList(),
        month: YearMonth = july,
        includeCancelled: Boolean = false,
    ) = buildMonthEntries(openTasks, completedTasks, month, zone, includeCancelled)

    @Test
    fun `completed task lands on its local calendar day`() {
        val result = days(completedTasks = listOf(completed("a", "walk dog", at(2026, 7, 10, 14))))
        val day = result.getValue(LocalDate.of(2026, 7, 10))
        assertEquals(listOf("walk dog"), day.map { it.title })
        assertEquals(CalendarEntryKind.COMPLETED, day.single().kind)
    }

    @Test
    fun `completion near UTC midnight buckets by local date`() {
        // 2026-07-11 01:30 UTC is still 2026-07-10 21:30 in New York.
        val utcLate = LocalDateTime.of(2026, 7, 11, 1, 30)
            .atZone(ZoneId.of("UTC")).toInstant().toEpochMilli()
        val result = days(completedTasks = listOf(completed("a", "late", utcLate)))
        assertTrue(LocalDate.of(2026, 7, 10) in result)
        assertTrue(LocalDate.of(2026, 7, 11) !in result)
    }

    @Test
    fun `completions outside the month are excluded`() {
        val result = days(
            completedTasks = listOf(
                completed("a", "june", at(2026, 6, 30, 23)),
                completed("b", "august", at(2026, 8, 1, 0)),
            ),
        )
        assertTrue(result.isEmpty())
    }

    @Test
    fun `one-shot task appears on its first warning day`() {
        val result = days(
            openTasks = listOf(
                openTask(createdAtMillis = at(2026, 7, 1, 8), firstWarningAtMillis = at(2026, 7, 20, 9)),
            ),
        )
        val day = result.getValue(LocalDate.of(2026, 7, 20))
        assertEquals(CalendarEntryKind.SCHEDULED, day.single().kind)
        assertTrue(!day.single().recurring)
    }

    @Test
    fun `one-shot without first warning appears at creation plus initial delay`() {
        // Created 23:30 with a 60-minute delay: starts the *next* day.
        val result = days(
            openTasks = listOf(
                openTask(createdAtMillis = at(2026, 7, 5, 23, 30), initialDelayMinutes = 60),
            ),
        )
        assertTrue(LocalDate.of(2026, 7, 5) !in result)
        assertEquals(at(2026, 7, 6, 0, 30), result.getValue(LocalDate.of(2026, 7, 6)).single().atMillis)
    }

    @Test
    fun `one-shot outside the month is absent`() {
        val result = days(
            openTasks = listOf(
                openTask(createdAtMillis = at(2026, 7, 1, 8), firstWarningAtMillis = at(2026, 8, 2, 9)),
            ),
        )
        assertTrue(result.isEmpty())
    }

    @Test
    fun `daily recurrence anchored mid-month fills the rest of the month only`() {
        val result = days(
            openTasks = listOf(
                openTask(
                    createdAtMillis = at(2026, 7, 10, 8),
                    firstWarningAtMillis = at(2026, 7, 10, 9),
                    recurrence = Recurrence(1, RecurUnit.DAYS),
                ),
            ),
        )
        assertTrue(LocalDate.of(2026, 7, 9) !in result)
        for (day in 10..31) {
            assertEquals(at(2026, 7, day, 9), result.getValue(LocalDate.of(2026, 7, day)).single().atMillis)
        }
    }

    @Test
    fun `every 3 days keeps its phase from an anchor in a previous month`() {
        // Anchored 2026-06-28: occurrences 6/28, 7/1, 7/4 ... — aligned to the
        // anchor, not to the viewed month's first day.
        val result = days(
            openTasks = listOf(
                openTask(
                    createdAtMillis = at(2026, 6, 28, 9),
                    firstWarningAtMillis = at(2026, 6, 28, 9),
                    recurrence = Recurrence(3, RecurUnit.DAYS),
                ),
            ),
        )
        val expected = listOf(1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31).map { LocalDate.of(2026, 7, it) }
        assertEquals(expected, result.keys.toList())
    }

    @Test
    fun `biweekly Mon and Fri only fires in on-schedule weeks`() {
        // Anchor Mon 2026-07-06; every 2 weeks on Mon|Fri: 7/6, 7/10, 7/20, 7/24.
        val result = days(
            openTasks = listOf(
                openTask(
                    createdAtMillis = at(2026, 7, 6, 9),
                    firstWarningAtMillis = at(2026, 7, 6, 9),
                    recurrence = Recurrence(2, RecurUnit.WEEKS, 0b0010001),
                ),
            ),
        )
        val expected = listOf(6, 10, 20, 24).map { LocalDate.of(2026, 7, it) }
        assertEquals(expected, result.keys.toList())
    }

    @Test
    fun `a future month shows all of a recurring task's occurrences`() {
        val result = days(
            openTasks = listOf(
                openTask(
                    createdAtMillis = at(2026, 7, 6, 9),
                    firstWarningAtMillis = at(2026, 7, 6, 9),
                    recurrence = Recurrence(1, RecurUnit.WEEKS, 0b0000001),
                ),
            ),
            month = YearMonth.of(2026, 9),
        )
        // Mondays of September 2026: 7, 14, 21, 28.
        val expected = listOf(7, 14, 21, 28).map { LocalDate.of(2026, 9, it) }
        assertEquals(expected, result.keys.toList())
    }

    @Test
    fun `entries within a day interleave completed and scheduled ascending`() {
        val result = days(
            openTasks = listOf(
                openTask(
                    id = "s", title = "scheduled",
                    createdAtMillis = at(2026, 7, 15, 8),
                    firstWarningAtMillis = at(2026, 7, 15, 12),
                ),
            ),
            completedTasks = listOf(
                completed("c1", "morning", at(2026, 7, 15, 9)),
                completed("c2", "evening", at(2026, 7, 15, 18)),
            ),
        )
        val day = result.getValue(LocalDate.of(2026, 7, 15))
        assertEquals(listOf("morning", "scheduled", "evening"), day.map { it.title })
    }

    @Test
    fun `cancelled tasks are left out by default, leaving their day empty`() {
        val cancelled = listOf(completed("a", "skipped", at(2026, 7, 10, 14), cancelled = true))
        // No entries at all for that day, which is also what clears its dot.
        assertTrue(days(completedTasks = cancelled).isEmpty())
    }

    @Test
    fun `cancelled tasks appear as cancelled when asked for`() {
        val result = days(
            completedTasks = listOf(
                completed("a", "skipped", at(2026, 7, 10, 14), cancelled = true),
                completed("b", "walk dog", at(2026, 7, 10, 15)),
            ),
            includeCancelled = true,
        )
        val day = result.getValue(LocalDate.of(2026, 7, 10))
        assertEquals(listOf("skipped", "walk dog"), day.map { it.title })
        assertEquals(
            listOf(CalendarEntryKind.CANCELLED, CalendarEntryKind.COMPLETED),
            day.map { it.kind },
        )
    }

    @Test
    fun `completed occurrence of a series is marked recurring`() {
        val result = days(
            completedTasks = listOf(completed("a", "meds", at(2026, 7, 3, 9), seriesId = "series")),
        )
        assertTrue(result.getValue(LocalDate.of(2026, 7, 3)).single().recurring)
    }
}
