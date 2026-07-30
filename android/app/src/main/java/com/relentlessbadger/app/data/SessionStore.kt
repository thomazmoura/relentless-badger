package com.relentlessbadger.app.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "session")

data class Session(
    val baseUrl: String,
    val token: String?,
    val email: String?,
    val initialDelayMinutes: Int,
    val repeatIntervalMinutes: Int,
    // Ordered snooze options, 1..MAX_WAITS entries, each at least a minute.
    val waitMinutes: List<Int>,
    // Index into [waitMinutes]: the wait the notification's one-tap button uses.
    val defaultWaitIndex: Int,
    // Wall-clock windows where reminders are held back until the window ends.
    // Empty means quiet hours are switched off.
    val quietHours: List<QuietRange>,
    // While set and still in the future, every reminder is held back until then.
    val pauseUntilMillis: Long?,
    // Minimum spacing between two notifications; 0 lets them fire together.
    val minNotificationGapSeconds: Int,
    // When the last reminder was actually shown, for measuring that spacing.
    val lastNotificationAtMillis: Long?,
) {
    val isSignedIn: Boolean get() = token != null && baseUrl.isNotBlank()

    val defaultWaitMinutes: Int
        get() = waitMinutes.getOrElse(defaultWaitIndex) { waitMinutes.first() }

    fun isPaused(nowMillis: Long): Boolean = (pauseUntilMillis ?: 0) > nowMillis
}

/**
 * The slice of session state the business logic needs: the current settings
 * snapshot, the server base URL, and the "settings edited locally, not yet
 * pushed" flag. Fakeable in scenario tests without dragging DataStore in.
 */
interface SettingsStore {
    suspend fun current(): Session
    suspend fun saveBaseUrl(baseUrl: String)
    suspend fun saveSettings(settings: SettingsDto)

    /**
     * Holds every reminder back until [atMillis]; null resumes. Deliberately
     * separate from [saveSettings]: a pause is about this device right now, so
     * it never travels through the settings DTO — and a settings pull can't
     * clobber it.
     */
    suspend fun savePauseUntil(atMillis: Long?)

    /**
     * How far apart notifications must land. Local for the same reason a pause
     * is: it describes this device's notification drawer, not the account, so it
     * stays out of the settings DTO where a pull could clobber it.
     */
    suspend fun saveMinNotificationGapSeconds(seconds: Int)

    /** Records that a reminder was just shown, anchoring the next gap. */
    suspend fun saveLastNotificationAt(millis: Long)
    suspend fun markSettingsDirty()
    suspend fun clearSettingsDirty()
    suspend fun isSettingsDirty(): Boolean
}

class SessionStore(private val context: Context) : SettingsStore {

    private object Keys {
        val BASE_URL = stringPreferencesKey("base_url")
        val TOKEN = stringPreferencesKey("token")
        val EMAIL = stringPreferencesKey("email")
        val INITIAL_DELAY = intPreferencesKey("initial_delay_minutes")
        val REPEAT_INTERVAL = intPreferencesKey("repeat_interval_minutes")
        val WAIT_MINUTES = stringPreferencesKey("wait_minutes")
        val DEFAULT_WAIT_INDEX = intPreferencesKey("default_wait_index")
        val QUIET_HOURS = stringPreferencesKey("quiet_hours")
        val PAUSE_UNTIL = longPreferencesKey("pause_until_millis")
        val MIN_NOTIFICATION_GAP = intPreferencesKey("min_notification_gap_seconds")
        val LAST_NOTIFICATION_AT = longPreferencesKey("last_notification_at_millis")
        val SETTINGS_DIRTY = booleanPreferencesKey("settings_dirty")

        // Superseded by WAIT_MINUTES. Still read (never written) so an install
        // upgrading from the fixed medium/long pair keeps its configured values
        // instead of silently reverting to the defaults.
        val MEDIUM_WAIT = intPreferencesKey("medium_wait_minutes")
        val LONG_WAIT = intPreferencesKey("long_wait_minutes")
    }

    // Mirrors kept warm for the OkHttp auth interceptor, which cannot suspend.
    @Volatile var cachedToken: String? = null
        private set
    @Volatile var cachedBaseUrl: String = ""
        private set

    val sessionFlow: Flow<Session> = context.dataStore.data.map { prefs ->
        Session(
            baseUrl = prefs[Keys.BASE_URL] ?: "",
            token = prefs[Keys.TOKEN],
            email = prefs[Keys.EMAIL],
            initialDelayMinutes = prefs[Keys.INITIAL_DELAY] ?: 60,
            repeatIntervalMinutes = prefs[Keys.REPEAT_INTERVAL] ?: 15,
            waitMinutes = resolveWaitMinutes(
                prefs[Keys.WAIT_MINUTES], prefs[Keys.MEDIUM_WAIT], prefs[Keys.LONG_WAIT],
            ),
            defaultWaitIndex = prefs[Keys.DEFAULT_WAIT_INDEX] ?: 0,
            quietHours = parseQuietHours(prefs[Keys.QUIET_HOURS]),
            pauseUntilMillis = prefs[Keys.PAUSE_UNTIL],
            minNotificationGapSeconds =
                prefs[Keys.MIN_NOTIFICATION_GAP] ?: DEFAULT_NOTIFICATION_GAP_SECONDS,
            lastNotificationAtMillis = prefs[Keys.LAST_NOTIFICATION_AT],
        ).also {
            cachedToken = it.token
            cachedBaseUrl = it.baseUrl
        }
    }

    override suspend fun current(): Session = sessionFlow.first()

    override suspend fun saveBaseUrl(baseUrl: String) {
        val normalized = baseUrl.trim().trimEnd('/')
        context.dataStore.edit { it[Keys.BASE_URL] = normalized }
        cachedBaseUrl = normalized
    }

    suspend fun saveLogin(token: String, email: String, settings: SettingsDto) {
        context.dataStore.edit {
            it[Keys.TOKEN] = token
            it[Keys.EMAIL] = email
            it[Keys.INITIAL_DELAY] = settings.initialDelayMinutes
            it[Keys.REPEAT_INTERVAL] = settings.repeatIntervalMinutes
            it[Keys.WAIT_MINUTES] = settings.waitMinutes.joinToString(",")
            it[Keys.DEFAULT_WAIT_INDEX] = settings.defaultWaitIndex
            it[Keys.QUIET_HOURS] = settings.quietHours.joinToString(",")
        }
        cachedToken = token
    }

    override suspend fun saveSettings(settings: SettingsDto) {
        context.dataStore.edit {
            it[Keys.INITIAL_DELAY] = settings.initialDelayMinutes
            it[Keys.REPEAT_INTERVAL] = settings.repeatIntervalMinutes
            it[Keys.WAIT_MINUTES] = settings.waitMinutes.joinToString(",")
            it[Keys.DEFAULT_WAIT_INDEX] = settings.defaultWaitIndex
            it[Keys.QUIET_HOURS] = settings.quietHours.joinToString(",")
        }
    }

    override suspend fun savePauseUntil(atMillis: Long?) {
        context.dataStore.edit {
            if (atMillis == null) it.remove(Keys.PAUSE_UNTIL) else it[Keys.PAUSE_UNTIL] = atMillis
        }
    }

    override suspend fun saveMinNotificationGapSeconds(seconds: Int) {
        context.dataStore.edit { it[Keys.MIN_NOTIFICATION_GAP] = seconds }
    }

    override suspend fun saveLastNotificationAt(millis: Long) {
        context.dataStore.edit { it[Keys.LAST_NOTIFICATION_AT] = millis }
    }

    override suspend fun markSettingsDirty() {
        context.dataStore.edit { it[Keys.SETTINGS_DIRTY] = true }
    }

    override suspend fun clearSettingsDirty() {
        context.dataStore.edit { it[Keys.SETTINGS_DIRTY] = false }
    }

    override suspend fun isSettingsDirty(): Boolean =
        context.dataStore.data.first()[Keys.SETTINGS_DIRTY] ?: false

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
        cachedToken = null
        cachedBaseUrl = ""
    }
}

/**
 * The stored wait list, or — on an install upgrading from the fixed medium/long
 * pair — those two values folded into a list so the user's configuration
 * carries over. A malformed or empty stored list would leave the app with no
 * snooze options at all, so anything unusable falls back to the defaults.
 */
internal fun resolveWaitMinutes(csv: String?, legacyMedium: Int?, legacyLong: Int?): List<Int> =
    csv?.parseWaitMinutes()
        ?: listOfNotNull(legacyMedium, legacyLong)
            .filter { it >= 1 }
            .ifEmpty { DEFAULT_WAIT_MINUTES }

private fun String.parseWaitMinutes(): List<Int>? =
    split(',').mapNotNull { it.trim().toIntOrNull()?.takeIf { m -> m >= 1 } }.ifEmpty { null }
