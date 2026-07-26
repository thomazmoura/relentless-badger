package com.relentlessbadger.app.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.relentlessbadger.app.db.OpenTaskEntity

/**
 * Everything the business logic needs from the platform's alarm/notification
 * machinery, behind an interface so scenario tests can record instead of
 * touching AlarmManager.
 */
interface ReminderScheduler {
    fun canScheduleExact(): Boolean
    fun schedule(task: OpenTaskEntity)
    fun cancel(taskId: String)

    /** Clears the currently shown reminder without touching the scheduled alarm. */
    fun dismissNotification(taskId: String)

    /** [defaultWaitMinutes] backs the notification's one-tap Wait button. */
    fun showReminder(task: OpenTaskEntity, defaultWaitMinutes: Int)
}

class AlarmReminderScheduler(private val context: Context) : ReminderScheduler {

    private val alarmManager: AlarmManager
        get() = context.getSystemService(AlarmManager::class.java)

    override fun canScheduleExact(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

    override fun schedule(task: OpenTaskEntity) {
        val pendingIntent = reminderIntent(task.id)
        if (canScheduleExact()) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, task.nextFireAtMillis, pendingIntent,
            )
        } else {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, task.nextFireAtMillis, pendingIntent,
            )
        }
    }

    override fun cancel(taskId: String) {
        alarmManager.cancel(reminderIntent(taskId))
        Notifications.cancel(context, taskId)
    }

    override fun dismissNotification(taskId: String) {
        Notifications.cancel(context, taskId)
    }

    override fun showReminder(task: OpenTaskEntity, defaultWaitMinutes: Int) {
        Notifications.showReminder(context, task, defaultWaitMinutes)
    }

    private fun reminderIntent(taskId: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            taskId.hashCode(),
            Intent(context, ReminderReceiver::class.java).putExtra(Notifications.EXTRA_TASK_ID, taskId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
