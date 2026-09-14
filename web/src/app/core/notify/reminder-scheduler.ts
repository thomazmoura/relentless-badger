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

  /** Posts the reminder-shaped notification behind the Advanced settings button. */
  showTestNotification(defaultWaitMinutes: number): void;
}

/**
 * Stands in for a task id on the notification fired by the Advanced settings
 * button. No task ever carries it, which is the point: it keeps the test
 * notification out of every taskId-keyed path.
 */
export const TEST_NOTIFICATION_ID = 'badger-test-notification';
