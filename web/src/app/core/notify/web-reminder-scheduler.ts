import { signal } from '@angular/core';
import { formatDuration } from '../domain/format';
import { Language } from '../domain/language';
import { OpenTask } from '../domain/models';
import { Strings, stringsOf } from '../i18n/strings';
import { NotificationSound, notificationSoundSource } from '../domain/notification-sound';
import { ReminderScheduler, TEST_NOTIFICATION_ID } from './reminder-scheduler';
import { AudioElementSoundPlayer, SoundPlayer } from './sound-player';

/**
 * The browser's stand-in for AlarmManager.
 *
 * Two timers rather than one: a `setTimeout` armed at the nearest fire time for
 * precision, plus a slow interval that sweeps for anything overdue — background
 * tabs throttle timeouts hard, and a nag that arrives late is far better than
 * one that never arrives.
 *
 * Honest limitation: nothing fires while the browser is closed. Whatever was
 * missed fires on the next visit, through the same catch-up sweep.
 */

const SWEEP_INTERVAL_MILLIS = 5_000;
/** setTimeout overflows past ~24.8 days; re-arm in chunks below that. */
const MAX_TIMEOUT_MILLIS = 12 * 60 * 60 * 1000;

const LEADER_KEY = 'badger.reminderLeader';
const LEADER_HEARTBEAT_MILLIS = 3_000;
const LEADER_STALE_MILLIS = 10_000;

/** Where a reminder is actually shown. Faked in tests. */
export interface NotificationPresenter {
  show(
    task: OpenTask,
    defaultWaitMinutes: number,
    sound: NotificationSound,
    language: Language,
  ): void;
  showTest(defaultWaitMinutes: number, sound: NotificationSound, language: Language): void;
  dismiss(taskId: string): void;
}

export class WebReminderScheduler implements ReminderScheduler {
  /** taskId -> fire time of the currently armed reminder. */
  private readonly armed = new Map<string, number>();
  private fired: ((taskId: string) => Promise<void>) | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private sweepHandle: ReturnType<typeof setInterval> | null = null;
  private readonly tabId = Math.random().toString(36).slice(2);

  /** Notification permission, so the UI can offer to ask for it. */
  readonly permission = signal<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );

  constructor(
    private readonly presenter: NotificationPresenter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Wires the fire callback (TaskRepository.onReminderFired) and starts the sweep. */
  start(onFired: (taskId: string) => Promise<void>): void {
    this.fired = onFired;
    this.sweepHandle ??= setInterval(() => void this.sweep(), SWEEP_INTERVAL_MILLIS);
  }

  stop(): void {
    if (this.sweepHandle !== null) {
      clearInterval(this.sweepHandle);
      this.sweepHandle = null;
    }
    this.clearTimeout();
  }

  schedule(task: OpenTask): void {
    this.armed.set(task.id, task.nextFireAtMillis);
    this.rearm();
  }

  cancel(taskId: string): void {
    this.armed.delete(taskId);
    this.presenter.dismiss(taskId);
    this.rearm();
  }

  dismissNotification(taskId: string): void {
    this.presenter.dismiss(taskId);
  }

  showReminder(
    task: OpenTask,
    defaultWaitMinutes: number,
    sound: NotificationSound,
    language: Language,
  ): void {
    this.presenter.show(task, defaultWaitMinutes, sound, language);
  }

  showTestNotification(
    defaultWaitMinutes: number,
    sound: NotificationSound,
    language: Language,
  ): void {
    this.presenter.showTest(defaultWaitMinutes, sound, language);
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    const result = await Notification.requestPermission();
    this.permission.set(result);
    return result;
  }

  /**
   * Fires everything already due. Called by the sweep, and on returning to the
   * app so nags missed while it was closed arrive at once — each task fires a
   * single time, because onReminderFired pushes its next fire a full interval
   * out and thereby collapses the backlog.
   */
  async sweep(): Promise<void> {
    if (this.fired === null || !this.isLeader()) return;
    const now = this.now();
    const due = [...this.armed.entries()]
      .filter(([, fireAt]) => fireAt <= now)
      .map(([taskId]) => taskId);
    for (const taskId of due) {
      this.armed.delete(taskId);
      await this.fired(taskId);
    }
    this.rearm();
  }

  private rearm(): void {
    this.clearTimeout();
    if (this.armed.size === 0) return;
    const nearest = Math.min(...this.armed.values());
    const delay = Math.max(0, Math.min(nearest - this.now(), MAX_TIMEOUT_MILLIS));
    this.timeoutHandle = setTimeout(() => {
      this.timeoutHandle = null;
      void this.sweep();
    }, delay);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Only one tab may nag, or the user gets the same reminder twice. A short
   * lease in storage, refreshed while this tab is alive; a tab whose lease went
   * stale (closed, suspended) loses it to whoever notices first.
   */
  private isLeader(): boolean {
    const now = this.now();
    try {
      const raw = localStorage.getItem(LEADER_KEY);
      const lease = raw ? (JSON.parse(raw) as { tabId: string; heartbeatAt: number }) : null;
      const mine = lease?.tabId === this.tabId;
      const stale = !lease || now - lease.heartbeatAt > LEADER_STALE_MILLIS;
      if (!mine && !stale) return false;
      if (!mine || now - lease.heartbeatAt > LEADER_HEARTBEAT_MILLIS) {
        localStorage.setItem(LEADER_KEY, JSON.stringify({ tabId: this.tabId, heartbeatAt: now }));
      }
      return true;
    } catch {
      return true; // no storage access: better to nag than to stay silent
    }
  }
}

/**
 * Shows reminders through the service worker registration, which is the only
 * way to get action buttons on a web notification.
 *
 * The Android notification has three actions (Wait / Other… / Done); the web
 * allows two, so "Other…" becomes the notification body tap, which opens the
 * app on the wait picker.
 *
 * A chosen sound is played by the page and the notification posted silent, so
 * the OS doesn't ring over it. Only the leader tab presents, so a nag rings
 * once however many tabs are open.
 */
export class ServiceWorkerNotificationPresenter implements NotificationPresenter {
  constructor(
    private readonly registration: () => Promise<ServiceWorkerRegistration | null>,
    private readonly player: SoundPlayer = new AudioElementSoundPlayer(),
  ) {}

  show(
    task: OpenTask,
    defaultWaitMinutes: number,
    sound: NotificationSound,
    language: Language,
  ): void {
    this.post(task.id, task.title, defaultWaitMinutes, sound, stringsOf(language));
  }

  /**
   * The debug twin of [show]: same icon, insistence and buttons, so what lands
   * on a paired watch is representative of a real nag. Its buttons resolve to
   * nothing — App ignores actions carrying the test id, because there is no
   * task behind them to complete.
   */
  showTest(defaultWaitMinutes: number, sound: NotificationSound, language: Language): void {
    const strings = stringsOf(language);
    this.post(
      TEST_NOTIFICATION_ID,
      strings.testNotificationText,
      defaultWaitMinutes,
      sound,
      strings,
    );
  }

  /**
   * One line, "Badger: water plants": on a watch or a crowded shade the title
   * is often all that shows, so the task goes in it and there is no body.
   */
  private post(
    taskId: string,
    title: string,
    defaultWaitMinutes: number,
    sound: NotificationSound,
    strings: Strings,
  ): void {
    void this.registration().then(async (registration) => {
      if (
        !registration ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted'
      ) {
        return;
      }
      void registration.showNotification(strings.notificationTitle(title), {
        tag: taskId,
        requireInteraction: true,
        silent: !(await this.osShouldRing(sound)),
        data: { taskId, waitMinutes: defaultWaitMinutes },
        icon: 'icons/icon-192x192.png',
        badge: 'icons/icon-96x96.png',
        actions: [
          { action: 'wait', title: strings.waitFor(formatDuration(defaultWaitMinutes, strings)) },
          { action: 'done', title: strings.notificationDone },
        ],
      } as NotificationOptions);
    });
  }

  /**
   * Whether the notification should carry the OS sound. A chosen sound the
   * browser refuses to play (no user gesture on the page yet) falls back to the
   * OS sound: a nag that rings differently beats one that doesn't ring at all.
   */
  private async osShouldRing(sound: NotificationSound): Promise<boolean> {
    if (sound.kind === 'silent') return false;
    const source = notificationSoundSource(sound);
    if (source === null) return true;
    try {
      await this.player.play(source);
      return false;
    } catch {
      return true;
    }
  }

  dismiss(taskId: string): void {
    void this.registration().then(async (registration) => {
      if (!registration) return;
      for (const notification of await registration.getNotifications({ tag: taskId })) {
        notification.close();
      }
    });
  }
}
