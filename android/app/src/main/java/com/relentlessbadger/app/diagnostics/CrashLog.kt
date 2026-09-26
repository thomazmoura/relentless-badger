package com.relentlessbadger.app.diagnostics

import java.io.File
import java.time.Instant

/** How many crashes the log holds and when the newest happened, for Settings. */
data class CrashLogSummary(val count: Int, val latest: Instant?)

/**
 * An append-only text file of crashes, kept on the device so they can be shared
 * from Settings — the phone is rarely on a cable when the app dies, so logcat
 * is gone by the time anyone looks.
 *
 * Writes are synchronous: [record] is called from the uncaught-exception
 * handler, moments before the process is killed. The file is capped at
 * [maxChars] by dropping the oldest entries, so it always fits in a share
 * intent as plain text.
 */
class CrashLog(
    private val file: File,
    /** App and device versions, stamped on every entry. */
    private val environment: String,
    private val maxChars: Int = DEFAULT_MAX_CHARS,
    private val now: () -> Instant = Instant::now,
) {

    @Synchronized
    fun record(title: String, body: String) {
        // One runaway trace mustn't push every other entry out.
        val trimmedBody = if (body.length > maxChars / 2) {
            body.take(maxChars / 2) + "\n… (truncated)"
        } else {
            body
        }
        val entry = buildString {
            append(ENTRY_PREFIX).append(now()).append(TITLE_SEPARATOR).append(title).append(" ===\n")
            append(environment).append('\n')
            append(trimmedBody.trimEnd()).append("\n\n")
        }
        file.parentFile?.mkdirs()
        file.writeText(dropOldest(readOrEmpty() + entry))
    }

    fun recordCrash(thread: Thread, throwable: Throwable) {
        record("Crash on thread ${thread.name}", throwable.stackTraceToString())
    }

    @Synchronized
    fun read(): String = readOrEmpty()

    @Synchronized
    fun summary(): CrashLogSummary {
        val headers = readOrEmpty().lineSequence().filter { it.startsWith(ENTRY_PREFIX) }.toList()
        val latest = headers.lastOrNull()
            ?.removePrefix(ENTRY_PREFIX)
            ?.substringBefore(TITLE_SEPARATOR)
            ?.let { runCatching { Instant.parse(it) }.getOrNull() }
        return CrashLogSummary(headers.size, latest)
    }

    @Synchronized
    fun clear() {
        file.delete()
    }

    private fun readOrEmpty(): String = if (file.exists()) file.readText() else ""

    /** Cuts whole entries off the front until the text fits. */
    private fun dropOldest(text: String): String {
        var result = text
        while (result.length > maxChars) {
            val next = result.indexOf("\n$ENTRY_PREFIX", startIndex = 1)
            if (next < 0) return result.takeLast(maxChars)
            result = result.substring(next + 1)
        }
        return result
    }

    companion object {
        const val DEFAULT_MAX_CHARS = 64 * 1024
        private const val ENTRY_PREFIX = "=== "
        private const val TITLE_SEPARATOR = " · "
    }
}
