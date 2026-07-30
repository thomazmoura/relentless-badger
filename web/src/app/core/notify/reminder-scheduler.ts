import { OpenTask } from '../domain/models';

/**
 * Arms and cancels a task's nags. On Android this is AlarmManager; on the web
 * it is timers plus service-worker notifications, which is why the repository
 * only ever talks to this interface.
 */
export interface ReminderScheduler {
  /** (Re)arms the task's next nag at task.nextFireAtMillis. */
  schedule(task: OpenTask): void;
  cancel(taskId: string): void;
  dismissNotification(taskId: string): void;
  showReminder(task: OpenTask, defaultWaitMinutes: number): void;
}
