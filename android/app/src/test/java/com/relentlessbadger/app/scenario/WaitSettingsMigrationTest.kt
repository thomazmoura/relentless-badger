package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.resolveWaitMinutes
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Upgrading an install that predates the configurable wait list must carry the
 * old medium/long pair over instead of silently reverting to the defaults.
 */
class WaitSettingsMigrationTest {

    @Test
    fun `an upgraded install keeps the medium and long waits it was configured with`() {
        assertEquals(listOf(45, 720), resolveWaitMinutes(csv = null, legacyMedium = 45, legacyLong = 720))
    }

    @Test
    fun `a stored list wins over the legacy pair once the user has saved one`() {
        assertEquals(
            listOf(15, 60, 240),
            resolveWaitMinutes(csv = "15,60,240", legacyMedium = 45, legacyLong = 720),
        )
    }

    @Test
    fun `a fresh install with nothing stored gets the defaults`() {
        assertEquals(listOf(60, 240), resolveWaitMinutes(null, null, null))
    }

    @Test
    fun `a half-written legacy pair still yields the one value it has`() {
        assertEquals(listOf(45), resolveWaitMinutes(null, legacyMedium = 45, legacyLong = null))
    }

    @Test
    fun `unusable stored values fall back rather than leaving no snooze options`() {
        assertEquals(listOf(60, 240), resolveWaitMinutes("", null, null))
        assertEquals(listOf(60, 240), resolveWaitMinutes("nonsense", null, null))
        assertEquals(listOf(60, 240), resolveWaitMinutes("0,-5", null, null))
        assertEquals(listOf(60, 240), resolveWaitMinutes(null, legacyMedium = 0, legacyLong = 0))
    }

    @Test
    fun `a partly-corrupt list keeps the entries that do parse`() {
        assertEquals(listOf(30, 90), resolveWaitMinutes("30, ,90,x", null, null))
    }
}
