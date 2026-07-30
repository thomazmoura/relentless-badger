import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HttpBadgerApi } from './data/http-api';
import { CompletedTaskStore, OpenTaskStore, TitleStore } from './data/task-store';
import { TaskRepository } from './data/task-repository';
import { isSignedIn } from './domain/models';
import {
  ServiceWorkerNotificationPresenter,
  WebReminderScheduler,
} from './notify/web-reminder-scheduler';
import { BadgerStoreService } from './store.service';
import { WebSyncScheduler } from './sync/web-sync-scheduler';

/**
 * Builds the object graph, the way BadgerApp's container does on Android: one
 * repository over the local database, with the API, the reminder engine and the
 * sync scheduler wired around it.
 */
@Injectable({ providedIn: 'root' })
export class BadgerService {
  private readonly storeService = inject(BadgerStoreService);
  private readonly http = inject(HttpClient);

  readonly session = this.storeService.session;
  readonly api = new HttpBadgerApi(this.http);
  readonly tasks = new OpenTaskStore(this.storeService.store);
  readonly titles = new TitleStore(this.storeService.store);
  readonly completed = new CompletedTaskStore(this.storeService.store);
  readonly sync = new WebSyncScheduler();
  readonly reminders = new WebReminderScheduler(
    new ServiceWorkerNotificationPresenter(() =>
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistration().then((r) => r ?? null)
        : Promise.resolve(null),
    ),
  );

  readonly repository = new TaskRepository(
    this.api,
    this.tasks,
    this.titles,
    this.completed,
    this.reminders,
    this.session,
    this.sync,
  );

  private started = false;

  /**
   * Starts the background machinery once the app knows it is signed in: re-arm
   * reminders, catch up on anything missed while the app was closed, and let the
   * sync scheduler push whatever is queued.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.sync.attach(
      () => this.repository.sync(),
      () => isSignedIn(this.session.session()),
    );
    this.reminders.start((taskId) => this.repository.onReminderFired(taskId));

    window.addEventListener('online', () => this.sync.onConnectivityOrFocus());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.sync.onConnectivityOrFocus();
        void this.reminders.sweep();
      }
    });

    if (!isSignedIn(this.session.session())) return;
    await this.repository.reArmAlarms();
    await this.reminders.sweep();
    this.sync.ensurePeriodic();
    this.sync.requestSync();
  }
}
