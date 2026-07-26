package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.SettingsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsScenarios : ScenarioTest() {

    @Test
    fun `settings saved offline take effect immediately and are pushed when connectivity returns`() = scenario {
        givenOffline()

        whenSettingsSaved(SettingsDto(30, 5, listOf(15, 90, 300, 480), 2))

        // Immediately effective: a new task snapshots the new values.
        val task = whenTaskCreated("water plants")
        assertEquals(30, task.initialDelayMinutes)
        assertEquals(5, task.repeatIntervalMinutes)
        assertTrue("flagged for push", settingsStore.dirty)
        thenNothingPushed()

        givenOnline()
        whenSyncRuns()

        assertEquals(SettingsDto(30, 5, listOf(15, 90, 300, 480), 2), server.receivedSettingsPuts.single())
        assertEquals(SettingsDto(30, 5, listOf(15, 90, 300, 480), 2), server.settings)
        assertFalse("flag cleared once acknowledged", settingsStore.dirty)
    }

    @Test
    fun `unpushed local settings are not overwritten by the server's copy`() = scenario {
        server.settings = SettingsDto(10, 10, listOf(10, 10), 0)
        server.failSettingsPush = true

        whenSettingsSaved(SettingsDto(30, 5, listOf(15, 90, 300, 480), 2))
        whenSyncFailsWith { it is retrofit2.HttpException }

        assertEquals("local edit survives", SettingsDto(30, 5, listOf(15, 90, 300, 480), 2), settingsStore.settings)
        assertTrue("still flagged for push", settingsStore.dirty)
    }

    @Test
    fun `with no local edits, settings changed on the server flow down on sync`() = scenario {
        server.settings = SettingsDto(45, 20, listOf(120, 480), 1)

        whenSyncRuns()

        assertEquals(SettingsDto(45, 20, listOf(120, 480), 1), settingsStore.settings)
    }

    @Test
    fun `changing the server URL rewrites it but keeps the session and local data`() = scenario {
        givenSyncedTask("water plants")
        givenOffline()
        whenTaskCreated("buy milk") // stays pendingCreate
        val savedSettings = settingsStore.settings
        val syncRequestsBefore = syncRequests.requests

        whenServerUrlChanged("https://new.badger.test/")

        assertEquals("normalized (trailing slash trimmed)", "https://new.badger.test", settingsStore.baseUrl)
        thenTaskVisible("water plants")
        thenTaskVisible("buy milk")
        assertTrue("pending work survives", localTaskByTitle("buy milk").pendingCreate)
        assertTrue("no alarms cancelled", alarms.cancelled.isEmpty())
        assertEquals("settings untouched", savedSettings, settingsStore.settings)
        assertEquals("still signed in", "test-jwt", settingsStore.current().token)
        assertEquals("one sync requested", syncRequestsBefore + 1, syncRequests.requests)
    }

    @Test
    fun `a blank server URL is rejected and nothing changes`() = scenario {
        whenServerUrlChangeFailsWith("   /")

        assertEquals("http://badger.test", settingsStore.baseUrl)
    }

    @Test
    fun `a malformed server URL is rejected and nothing changes`() = scenario {
        whenServerUrlChangeFailsWith("not a url")

        assertEquals("http://badger.test", settingsStore.baseUrl)
    }
}
