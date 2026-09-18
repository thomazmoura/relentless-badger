package com.relentlessbadger.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RowMovementGuardTest {

    private var now = 1_000L
    private val guard = RowMovementGuard { now }

    @Test
    fun `the first list shown doesn't lock taps`() {
        guard.observe(listOf("a", "b", "c"))

        assertTrue(guard.allowsTap())
    }

    @Test
    fun `a row changing slot locks taps until the cooldown passes`() {
        guard.observe(listOf("a", "b", "c"))

        guard.observe(listOf("b", "c", "a"))

        assertFalse(guard.allowsTap())
        now += ROW_MOVE_COOLDOWN_MILLIS - 1
        assertFalse(guard.allowsTap())
        now += 1
        assertTrue(guard.allowsTap())
    }

    @Test
    fun `removing a middle row locks taps because the rows below shift up`() {
        guard.observe(listOf("a", "b", "c"))

        guard.observe(listOf("a", "c"))

        assertFalse(guard.allowsTap())
    }

    @Test
    fun `a row added above the others locks taps`() {
        guard.observe(listOf("a", "b"))

        guard.observe(listOf("new", "a", "b"))

        assertFalse(guard.allowsTap())
    }

    @Test
    fun `removing the last row or appending one moves nothing`() {
        guard.observe(listOf("a", "b", "c"))

        guard.observe(listOf("a", "b"))
        guard.observe(listOf("a", "b", "d"))

        assertTrue(guard.allowsTap())
    }

    @Test
    fun `re-rendering the same order doesn't lock taps`() {
        guard.observe(listOf("a", "b"))

        assertFalse(guard.observe(listOf("a", "b")))

        assertTrue(guard.allowsTap())
    }

    @Test
    fun `a move during the cooldown restarts it`() {
        guard.observe(listOf("a", "b", "c"))
        guard.observe(listOf("b", "a", "c"))
        now += ROW_MOVE_COOLDOWN_MILLIS - 100

        guard.observe(listOf("b", "c", "a"))
        now += 100

        assertFalse(guard.allowsTap())
        now += ROW_MOVE_COOLDOWN_MILLIS
        assertTrue(guard.allowsTap())
    }

    @Test
    fun `the remaining lock counts down to zero and no further`() {
        assertEquals(0L, guard.tapLockRemainingMillis())
        guard.observe(listOf("a", "b"))
        guard.observe(listOf("b", "a"))

        now += 200

        assertEquals(ROW_MOVE_COOLDOWN_MILLIS - 200, guard.tapLockRemainingMillis())
        now += ROW_MOVE_COOLDOWN_MILLIS
        assertEquals(0L, guard.tapLockRemainingMillis())
    }

    @Test
    fun `a move during the cooldown pushes the remaining lock back`() {
        guard.observe(listOf("a", "b", "c"))
        guard.observe(listOf("b", "a", "c"))
        now += ROW_MOVE_COOLDOWN_MILLIS - 100

        guard.observe(listOf("b", "c", "a"))

        assertEquals(ROW_MOVE_COOLDOWN_MILLIS, guard.tapLockRemainingMillis())
    }

    @Test
    fun `a task starting moves across the scheduled header`() {
        val before = rowKeys(listOf("a"), listOf("s1", "s2"))
        val after = rowKeys(listOf("a", "s1"), listOf("s2"))
        assertEquals(listOf("a", SCHEDULED_HEADER_KEY, "s1", "s2"), before)
        guard.observe(before)

        guard.observe(after)

        assertFalse(guard.allowsTap())
    }
}
