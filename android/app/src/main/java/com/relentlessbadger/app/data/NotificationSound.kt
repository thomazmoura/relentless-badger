package com.relentlessbadger.app.data

/**
 * What a nag sounds like on this device. Local-only, like the notification gap:
 * a picked sound is a URI that means nothing on another device, so it never
 * travels through the settings DTO.
 */
sealed interface NotificationSound {
    data object Silent : NotificationSound

    /** Whatever the device plays for notifications — what the app always did. */
    data object SystemDefault : NotificationSound

    /** One of [BUILT_IN_SOUNDS], by key. */
    data class BuiltIn(val key: String) : NotificationSound

    /** A sound picked from the device, with the title it had when picked. */
    data class Custom(val uri: String, val label: String) : NotificationSound
}

data class BuiltInSound(val key: String, val label: String)

/**
 * Shipped with the app, from Google's Material sound resources (CC-BY 4.0; see
 * SOUNDS-LICENSE.md). Keys are what gets stored, so they must never be renamed;
 * the asset files are named after them on both platforms.
 */
val BUILT_IN_SOUNDS = listOf(
    BuiltInSound("simple-01", "Simple"),
    BuiltInSound("simple-02", "Simple 2"),
    BuiltInSound("decorative-01", "Decorative"),
    BuiltInSound("decorative-02", "Decorative 2"),
    BuiltInSound("ambient", "Ambient"),
    BuiltInSound("high-intensity", "Urgent"),
)

fun NotificationSound.label(): String = when (this) {
    NotificationSound.Silent -> "Silent"
    NotificationSound.SystemDefault -> "System default"
    is NotificationSound.BuiltIn -> BUILT_IN_SOUNDS.first { it.key == key }.label
    is NotificationSound.Custom -> label
}

/**
 * The stored form: `silent`, `system`, `builtin:<key>` or `custom:<uri>|<label>`.
 * The URI goes first because it is percent-encoded and so never holds a `|`,
 * while a sound's title might.
 */
fun NotificationSound.toStorageString(): String = when (this) {
    NotificationSound.Silent -> "silent"
    NotificationSound.SystemDefault -> "system"
    is NotificationSound.BuiltIn -> "builtin:$key"
    is NotificationSound.Custom -> "custom:$uri|$label"
}

/**
 * The stored sound, or the system default when nothing usable is stored. A
 * corrupt value, or a built-in that a later version dropped, should cost the
 * user their choice — not their reminders' sound altogether.
 */
fun parseNotificationSound(stored: String?): NotificationSound = when {
    stored == "silent" -> NotificationSound.Silent
    stored?.startsWith("builtin:") == true -> stored.removePrefix("builtin:")
        .takeIf { key -> BUILT_IN_SOUNDS.any { it.key == key } }
        ?.let { NotificationSound.BuiltIn(it) }
        ?: NotificationSound.SystemDefault
    stored?.startsWith("custom:") == true -> {
        val uri = stored.removePrefix("custom:").substringBefore('|')
        val label = stored.substringAfter('|', missingDelimiterValue = "")
        if (uri.isBlank()) NotificationSound.SystemDefault
        else NotificationSound.Custom(uri, label.ifBlank { "Custom sound" })
    }
    else -> NotificationSound.SystemDefault
}

/**
 * Which audio stream a nag's sound plays on, and so which volume it follows.
 * Local like the sound: how loud a phone should be is a property of that phone.
 * Alarm and media both ring through vibrate mode; they differ in routing, since
 * Android plays alarms on the speaker even with headphones connected, while
 * media stays in the headphones.
 */
enum class SoundStream(val storageKey: String, val label: String) {
    Notification("notification", "Notification"),
    Alarm("alarm", "Alarm"),
    Media("media", "Media"),
}

/**
 * The stored stream, falling back to the on/off alarm switch it replaced so an
 * install that had opted in keeps ringing on the alarm stream.
 */
fun parseSoundStream(stored: String?, legacyAlarmStream: Boolean?): SoundStream =
    SoundStream.entries.firstOrNull { it.storageKey == stored }
        ?: if (legacyAlarmStream == true) SoundStream.Alarm else SoundStream.Notification
