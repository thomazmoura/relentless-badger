package com.relentlessbadger.app.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import com.relentlessbadger.app.BuildConfig
import java.io.File
import java.time.Instant
import kotlin.concurrent.thread

object CrashReporting {

    private const val PREFS = "diagnostics"
    private const val KEY_LAST_EXIT_SEEN = "lastExitSeenMillis"
    private const val MAX_TRACE_CHARS = 16 * 1024

    fun createLog(context: Context): CrashLog = CrashLog(
        file = File(context.filesDir, "crash-log.txt"),
        environment = "RelentlessBadger ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · " +
            "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · " +
            "${Build.MANUFACTURER} ${Build.MODEL}",
    )

    /**
     * Records every uncaught exception before handing it on, so Android still
     * kills the process as usual. Uncaught coroutine exceptions — the ViewModel's
     * `viewModelScope.launch` and the receivers' IO scopes — end up here too.
     */
    fun install(context: Context, log: CrashLog) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching { log.recordCrash(thread, throwable) }
            previous?.uncaughtException(thread, throwable)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Off the main thread: reading an ANR trace is disk work at launch.
            thread(name = "exit-reasons") {
                runCatching { recordPastExits(context.applicationContext, log) }
            }
        }
    }

    /**
     * Freezes (ANRs) and native crashes never reach a JVM handler; the system
     * remembers them though, so pick up any that happened since the last launch.
     */
    @RequiresApi(Build.VERSION_CODES.R)
    private fun recordPastExits(context: Context, log: CrashLog) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lastSeen = prefs.getLong(KEY_LAST_EXIT_SEEN, 0L)
        val activityManager = context.getSystemService(ActivityManager::class.java)
        val exits = activityManager.getHistoricalProcessExitReasons(context.packageName, 0, 10)
            .filter { it.timestamp > lastSeen }
        exits.filter {
            it.reason == ApplicationExitInfo.REASON_ANR ||
                it.reason == ApplicationExitInfo.REASON_CRASH_NATIVE
        }.sortedBy { it.timestamp }.forEach { exit ->
            val kind = if (exit.reason == ApplicationExitInfo.REASON_ANR) "Freeze (ANR)" else "Native crash"
            val trace = runCatching {
                // Only the head: it holds the main thread, which is what froze.
                exit.traceInputStream?.bufferedReader()?.use { reader ->
                    val buffer = CharArray(MAX_TRACE_CHARS)
                    var filled = 0
                    while (filled < buffer.size) {
                        val read = reader.read(buffer, filled, buffer.size - filled)
                        if (read < 0) break
                        filled += read
                    }
                    String(buffer, 0, filled).ifEmpty { null }
                }
            }.getOrNull()
            log.record(
                "$kind at ${Instant.ofEpochMilli(exit.timestamp)}",
                listOfNotNull(exit.description, trace).joinToString("\n").ifEmpty { "(no details)" },
            )
        }
        exits.maxOfOrNull { it.timestamp }?.let {
            prefs.edit().putLong(KEY_LAST_EXIT_SEEN, it).apply()
        }
    }
}
