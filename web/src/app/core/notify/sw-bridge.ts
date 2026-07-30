/**
 * The user's choice on a reminder notification, routed back into the page.
 *
 * The service worker can't touch the database (localStorage isn't reachable
 * from a worker), so it never applies Done or Wait itself: it focuses or opens
 * the app and forwards the action, which is why acting on a notification always
 * brings the app up.
 */
export type NotificationIntent = 'done' | 'wait' | 'pick-wait';

export interface NotificationAction {
  readonly taskId: string;
  readonly action: NotificationIntent;
  readonly waitMinutes?: number;
}

/** A message posted by custom-sw.js after a notification click. */
export function listenForNotificationActions(
  handler: (action: NotificationAction) => void,
): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined;
  const listener = (event: MessageEvent) => {
    const data = event.data as Partial<NotificationAction> & { type?: string };
    if (data?.type === 'notification-action' && data.taskId && data.action) {
      handler({ taskId: data.taskId, action: data.action, waitMinutes: data.waitMinutes });
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

/**
 * The cold-start counterpart: the worker opened a new window with the action in
 * the query string. Consumes it from the URL so a reload can't replay it, the
 * way MainActivity strips the notification extras from its intent.
 */
export function takeNotificationActionFromUrl(): NotificationAction | null {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get('task');
  const action = params.get('intent') as NotificationIntent | null;
  if (!taskId || !action) return null;

  params.delete('task');
  params.delete('intent');
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  return { taskId, action };
}
