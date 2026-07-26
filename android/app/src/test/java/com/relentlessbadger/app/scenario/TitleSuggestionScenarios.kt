package com.relentlessbadger.app.scenario

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TitleSuggestionScenarios : ScenarioTest() {

    @Test
    fun `titles used on this device suggest offline, including completed tasks`() = scenario {
        givenOffline()

        val task = whenTaskCreated("water plants")
        whenTaskCompleted(task.id)
        whenTaskCreated("walk dog")

        val titles = repository.titles()
        assertTrue(titles.contains("water plants"))
        assertTrue(titles.contains("walk dog"))
    }

    @Test
    fun `titles known only to the server join local suggestions after a sync`() = scenario {
        givenOffline()
        whenTaskCreated("local habit")
        givenOnline()
        givenServerHasOpenTask("habit from the other phone")

        whenSyncRuns()

        val titles = repository.titles()
        assertTrue(titles.contains("local habit"))
        assertTrue(titles.contains("habit from the other phone"))
    }

    @Test
    fun `a dismissed title stops being suggested`() = scenario {
        givenOffline()
        whenTaskCreated("water plants")
        whenTaskCreated("walk dog")

        whenSuggestionDismissed("water plants")

        val titles = repository.titles()
        assertFalse(titles.contains("water plants"))
        assertTrue(titles.contains("walk dog"))
    }

    @Test
    fun `a dismissed title stays gone when the server still reports it`() = scenario {
        givenOnline()
        givenServerHasOpenTask("habit from the other phone")
        whenSyncRuns()

        whenSuggestionDismissed("habit from the other phone")
        whenSyncRuns()

        assertFalse(repository.titles().contains("habit from the other phone"))
    }

    @Test
    fun `undoing a dismissal suggests the title again`() = scenario {
        givenOffline()
        whenTaskCreated("water plants")
        whenSuggestionDismissed("water plants")

        whenSuggestionDismissalUndone("water plants")

        assertTrue(repository.titles().contains("water plants"))
    }

    @Test
    fun `using a dismissed title again brings it back`() = scenario {
        givenOffline()
        whenTaskCreated("water plants")
        whenSuggestionDismissed("water plants")

        whenTaskCreated("water plants")

        assertTrue(repository.titles().contains("water plants"))
    }

    @Test
    fun `a repeatedly used title ranks above one-offs`() = scenario {
        givenOffline()

        whenTaskCreated("one off")
        whenTimeAdvancesMinutes(1)
        whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(1)
        whenTaskCreated("water plants")

        assertEquals("water plants", repository.titles().first())
    }
}
