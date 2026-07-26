package com.relentlessbadger.app.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.relentlessbadger.app.MainActivity
import com.relentlessbadger.app.R
import com.relentlessbadger.app.db.OpenTaskEntity
import com.relentlessbadger.app.ui.formatDuration

object Notifications {
    const val CHANNEL_ID = "task_reminders"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_SNOOZE_MINUTES = "snoozeMinutes"

    /** Tells MainActivity to open the wait picker for [EXTRA_TASK_ID] on launch. */
    const val EXTRA_SHOW_WAIT_PICKER = "showWaitPicker"

    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_description)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /**
     * Android shows at most three action buttons, so the reminder offers a
     * one-tap snooze by [defaultWaitMinutes], an "Other…" button that opens the
     * app on the full list of configured waits, and Done.
     */
    fun showReminder(context: Context, task: OpenTaskEntity, defaultWaitMinutes: Int) {
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

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
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
