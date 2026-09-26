package com.relentlessbadger.app.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

class CrashLogTest {

    @get:Rule
    val folder = TemporaryFolder()

    private var clock = Instant.parse("2026-09-26T10:00:00Z")

    private fun log(maxChars: Int = CrashLog.DEFAULT_MAX_CHARS) =
        CrashLog(folder.root.resolve("crash-log.txt"), "test-env", maxChars) { clock }

    @Test
    fun `an empty log has nothing to share`() {
        val log = log()
        assertEquals("", log.read())
        assertEquals(CrashLogSummary(0, null), log.summary())
    }

    @Test
    fun `a crash is recorded with its stack trace and cause`() {
        val log = log()
        val crash = IllegalStateException("outer", IllegalArgumentException("inner"))

        log.recordCrash(Thread.currentThread(), crash)

        val text = log.read()
        assertTrue(text.contains("Crash on thread ${Thread.currentThread().name}"))
        assertTrue(text.contains("test-env"))
        assertTrue(text.contains("IllegalStateException: outer"))
        assertTrue(text.contains("Caused by: java.lang.IllegalArgumentException: inner"))
        assertEquals(CrashLogSummary(1, clock), log.summary())
    }

    @Test
    fun `the summary counts entries and reports the newest`() {
        val log = log()
        log.record("first", "a")
        clock = Instant.parse("2026-09-26T11:30:00Z")
        log.record("second", "b")

        assertEquals(CrashLogSummary(2, clock), log.summary())
    }

    @Test
    fun `the log survives a new instance, as after a restart`() {
        log().record("before restart", "trace")
        assertEquals(1, log().summary().count)
    }

    @Test
    fun `the oldest entries are dropped to stay under the cap`() {
        val log = log(maxChars = 400)
        repeat(10) { log.record("crash $it", "x".repeat(40)) }

        val text = log.read()
        assertTrue(text.length <= 400)
        assertTrue(text.contains("crash 9"))
        assertFalse(text.contains("crash 0 "))
        assertTrue(text.startsWith("=== "))
    }

    @Test
    fun `an oversized trace is truncated rather than evicting everything`() {
        val log = log(maxChars = 400)
        log.record("small", "ok")
        log.record("huge", "y".repeat(10_000))

        val text = log.read()
        assertTrue(text.contains("small"))
        assertTrue(text.contains("(truncated)"))
    }

    @Test
    fun `clearing empties the log`() {
        val log = log()
        log.record("crash", "trace")

        log.clear()

        assertEquals(0, log.summary().count)
        assertNull(log.summary().latest)
    }
}
