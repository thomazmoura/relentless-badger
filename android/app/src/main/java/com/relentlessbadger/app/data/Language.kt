package com.relentlessbadger.app.data

import android.content.res.Resources

/** A language the UI and the reminders can speak. */
enum class Language { English, Portuguese }

/**
 * What the user picked in Settings. [System] follows the device, which is what
 * a fresh install does. Local to the device like the sound: two phones owned by
 * the same person may well be set to different languages.
 */
enum class LanguagePreference(val storageKey: String) {
    System("system"),
    English("en"),
    Portuguese("pt"),
}

/** The stored preference, or [LanguagePreference.System] when nothing usable is stored. */
fun parseLanguagePreference(stored: String?): LanguagePreference =
    LanguagePreference.entries.firstOrNull { it.storageKey == stored } ?: LanguagePreference.System

/**
 * The language to speak. Following the device means Portuguese for any `pt`
 * locale, Brazil or Portugal alike, and English for everything else — the
 * only other language on offer.
 */
fun resolveLanguage(preference: LanguagePreference, deviceLanguageTag: String): Language =
    when (preference) {
        LanguagePreference.English -> Language.English
        LanguagePreference.Portuguese -> Language.Portuguese
        LanguagePreference.System ->
            if (deviceLanguageTag.lowercase().startsWith("pt")) Language.Portuguese else Language.English
    }

/**
 * The device's own language, read off the system resources rather than
 * [java.util.Locale.getDefault], so nothing the app does to its own locale can
 * mask what the device is actually set to.
 */
fun deviceLanguageTag(): String = Resources.getSystem().configuration.locales[0].toLanguageTag()
