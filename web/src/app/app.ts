import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppState } from './core/app-state';
import { TEST_NOTIFICATION_ID } from './core/notify/reminder-scheduler';
import {
  listenForNotificationActions,
  NotificationAction,
  takeNotificationActionFromUrl,
} from './core/notify/sw-bridge';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<router-outlet />',
})
export class App {
  private readonly state = inject(AppState);

  constructor() {
    // Tapping a reminder's Done or Wait button lands here: the service worker
    // can't reach the database, so the page applies the action.
    const stopListening = listenForNotificationActions((action) => void this.apply(action));
    inject(DestroyRef).onDestroy(stopListening);

    const coldStart = takeNotificationActionFromUrl();
    if (coldStart) void this.apply(coldStart);
  }

  private async apply(action: NotificationAction): Promise<void> {
    // The test notification from Advanced settings has no task behind it; its
    // buttons exist to look like a real reminder, not to do anything.
    if (action.taskId === TEST_NOTIFICATION_ID) return;
    switch (action.action) {
      case 'done':
        await this.state.completeTaskFromReminder(action.taskId);
        break;
      case 'wait':
        if (action.waitMinutes) {
          await this.state.snoozeTask(action.taskId, action.waitMinutes);
        } else {
          await this.state.openWaitPicker(action.taskId);
        }
        break;
      case 'pick-wait':
        await this.state.openWaitPicker(action.taskId);
        break;
    }
  }
}
