package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.Language
import com.relentlessbadger.app.data.LanguagePreference
import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.ui.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * The language setting: device default out of the box, overridable in
 * Settings, and — like the sound — a property of this device that never syncs.
 */
class LanguageScenarios : ScenarioTest() {

    @Test
    fun `a fresh install on an English device nags in English`() = scenario {
        givenDeviceLanguage("en-US")
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        val shown = alarms.shownReminders.single()
        assertEquals(Language.English, shown.language)
        assertEquals("Badger: water plants", Strings.of(shown.language).notificationTitle(shown.task.title))
    }

    @Test
    fun `a fresh install on a Portuguese device nags in Portuguese`() = scenario {
        givenDeviceLanguage("pt-BR")
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("regar as plantas")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        val shown = alarms.shownReminders.single()
        assertEquals(Language.Portuguese, shown.language)
        assertEquals("Texugo: regar as plantas", Strings.of(shown.language).notificationTitle(shown.task.title))
    }

    @Test
    fun `a chosen language overrides the device`() = scenario {
        givenDeviceLanguage("pt-BR")
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenLanguageChosen(LanguagePreference.English)
        whenReminderFires(task.id)

        assertEquals(Language.English, alarms.shownReminders.single().language)
    }

    @Test
    fun `device default follows the device when its language changes`() = scenario {
        givenDeviceLanguage("en-US")
        givenLanguage(LanguagePreference.System)
        givenOffline()

        givenDeviceLanguage("pt-PT")
        whenTestNotificationRequested()

        assertEquals(listOf(Language.Portuguese), alarms.testNotificationLanguages)
    }

    @Test
    fun `choosing a language stays on this device`() = scenario {
        givenOnline()

        whenLanguageChosen(LanguagePreference.Portuguese)
        whenSyncRuns()

        assertFalse(settingsStore.isSettingsDirty())
        thenNothingPushed()
    }

    @Test
    fun `a settings pull leaves the chosen language alone`() = scenario {
        givenLanguage(LanguagePreference.Portuguese)
        server.settings = SettingsDto(45, 20, listOf(120, 480), 1)

        whenSyncRuns()

        assertEquals(LanguagePreference.Portuguese, settingsStore.current().language)
    }
}
