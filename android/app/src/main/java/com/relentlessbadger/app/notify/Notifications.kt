package com.relentlessbadger.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.relentlessbadger.app.MainActivity
import com.relentlessbadger.app.R
import com.relentlessbadger.app.data.NotificationSound
import com.relentlessbadger.app.db.OpenTaskEntity
import com.relentlessbadger.app.ui.formatDuration

object Notifications {
    const val CHANNEL_ID = "task_reminders"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_SNOOZE_MINUTES = "snoozeMinutes"

    /** Tells MainActivity to open the wait picker for [EXTRA_TASK_ID] on launch. */
    const val EXTRA_SHOW_WAIT_PICKER = "showWaitPicker"

    /**
     * Stands in for a task id on the notification fired by the Advanced
     * settings button. No task ever carries it, which is the point: it keeps
     * the test notification out of every taskId-keyed path.
     */
    const val TEST_NOTIFICATION_ID = "badger-test-notification"

    /**
     * A channel's sound is fixed once it exists — only the user can change it
     * from system settings — so each sound gets its own channel and switching
     * sound switches channel. The system default keeps the original id, so
     * installs that never touch the setting keep whatever the user tuned there.
     *
     * The channels for other sounds are deleted, leaving a single "Reminders"
     * entry in system settings. Deleting a channel takes its notifications with
     * it, so changing the sound clears the drawer; the nags return on their next
     * repeat, which is a fair price for a setting touched once in a blue moon.
     *
     * The audio usage is just as fixed, so [alarmStream] is part of the id too.
     * An alarm-usage sound follows the alarm volume rather than the ringer, which
     * is what lets it ring on vibrate — and, on most builds, through Do Not
     * Disturb whenever alarms are allowed. The system default has to name its
     * sound explicitly there, since leaving it unset means notification usage.
     */
    fun ensureChannel(context: Context, sound: NotificationSound, alarmStream: Boolean): String {
        val onAlarm = alarmStream && sound != NotificationSound.Silent
        val id = channelIdFor(sound, onAlarm)
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(id) == null) {
            val channel = NotificationChannel(
                id,
                context.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.notification_channel_description)
                if (onAlarm || sound != NotificationSound.SystemDefault) {
                    setSound(soundUri(context, sound), audioAttributesFor(onAlarm))
                }
            }
            manager.createNotificationChannel(channel)
        }
        manager.notificationChannels
            .filter { it.id.startsWith(CHANNEL_ID) && it.id != id }
            .forEach { manager.deleteNotificationChannel(it.id) }
        return id
    }

    /** Shared with the settings preview, so it plays on the stream the channel will. */
    fun audioAttributesFor(alarmStream: Boolean): AudioAttributes = AudioAttributes.Builder()
        .setUsage(if (alarmStream) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    private fun channelIdFor(sound: NotificationSound, alarmStream: Boolean): String {
        val base = if (alarmStream) "${CHANNEL_ID}_alarm" else CHANNEL_ID
        return when (sound) {
            NotificationSound.SystemDefault -> base
            NotificationSound.Silent -> "${base}_silent"
            is NotificationSound.BuiltIn -> "${base}_builtin_${sound.key}"
            is NotificationSound.Custom -> "${base}_custom_${Integer.toHexString(sound.uri.hashCode())}"
        }
    }

    /**
     * What [sound] plays, or null for silence. Also used to preview a choice in
     * settings, so the preview is exactly what the channel will ring with.
     */
    fun soundUri(context: Context, sound: NotificationSound): Uri? = when (sound) {
        NotificationSound.Silent -> null
        NotificationSound.SystemDefault -> Settings.System.DEFAULT_NOTIFICATION_URI
        is NotificationSound.BuiltIn ->
            BUILT_IN_SOUND_RES[sound.key]?.let { Uri.parse("android.resource://${context.packageName}/$it") }
        is NotificationSound.Custom -> Uri.parse(sound.uri)
    }

    // Referenced by id rather than resolved by name, so resource shrinking can
    // see the sounds are used and keeps them.
    private val BUILT_IN_SOUND_RES = mapOf(
        "simple-01" to R.raw.badger_notification_simple_01,
        "simple-02" to R.raw.badger_notification_simple_02,
        "decorative-01" to R.raw.badger_notification_decorative_01,
        "decorative-02" to R.raw.badger_notification_decorative_02,
        "ambient" to R.raw.badger_notification_ambient,
        "high-intensity" to R.raw.badger_notification_high_intensity,
    )

    /**
     * Android shows at most three action buttons, so the reminder offers a
     * one-tap snooze by [defaultWaitMinutes], an "Other…" button that opens the
     * app on the full list of configured waits, and Done.
     */
    fun showReminder(
        context: Context,
        task: OpenTaskEntity,
        defaultWaitMinutes: Int,
        sound: NotificationSound,
        alarmStream: Boolean,
    ) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val openApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val doneIntent = PendingIntent.getBroadcast(
            context,
            task.id.hashCode(),
            Intent(context, ReminderActionReceiver::class.java).putExtra(EXTRA_TASK_ID, task.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val waitIntent = snoozeIntent(context, task.id, defaultWaitMinutes, task.id.hashCode() + 1)
        val otherIntent = PendingIntent.getActivity(
            context,
            task.id.hashCode() + 2,
            Intent(context, MainActivity::class.java)
                .putExtra(EXTRA_TASK_ID, task.id)
                .putExtra(EXTRA_SHOW_WAIT_PICKER, true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, ensureChannel(context, sound, alarmStream))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(task.title)
            .setContentIntent(openApp)
            .addAction(
                0,
                context.getString(
                    R.string.notification_action_wait,
                    formatDuration(defaultWaitMinutes),
                ),
                waitIntent,
            )
            .addAction(0, context.getString(R.string.notification_action_other), otherIntent)
            .addAction(0, context.getString(R.string.notification_action_done), doneIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(task.id.hashCode(), notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS revoked mid-flight; nothing else to do.
        }
    }

    /**
     * The debug twin of [showReminder]: same channel (so the same sound), icon, priority and action
     * buttons, so what lands on the watch is representative of a real nag. The
     * buttons only dismiss it — there is no task behind them to complete.
     */
    fun showTestNotification(
        context: Context,
        defaultWaitMinutes: Int,
        sound: NotificationSound,
        alarmStream: Boolean,
    ) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val dismiss = PendingIntent.getBroadcast(
            context,
            TEST_NOTIFICATION_ID.hashCode(),
            Intent(context, TestNotificationReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, ensureChannel(context, sound, alarmStream))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText("Test notification \u2014 reminders are working")
            .setContentIntent(dismiss)
            .setAutoCancel(true)
            .addAction(
                0,
                context.getString(
                    R.string.notification_action_wait,
                    formatDuration(defaultWaitMinutes),
                ),
                dismiss,
            )
            .addAction(0, context.getString(R.string.notification_action_other), dismiss)
            .addAction(0, context.getString(R.string.notification_action_done), dismiss)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(TEST_NOTIFICATION_ID.hashCode(), notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS revoked mid-flight; nothing else to do.
        }
    }

    fun cancel(context: Context, taskId: String) {
        NotificationManagerCompat.from(context).cancel(taskId.hashCode())
    }

    private fun snoozeIntent(context: Context, taskId: String, minutes: Int, requestCode: Int): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, SnoozeActionReceiver::class.java)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_SNOOZE_MINUTES, minutes),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
