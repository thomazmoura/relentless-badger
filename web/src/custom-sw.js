// Angular's generated worker plus the reminder notification handling. Notification
// actions only exist on notifications shown from a service worker registration, so the
// nagging reminders have to live here rather than in the page.
//
// The worker deliberately never mutates task state: localStorage (the database) is not
// reachable from a worker. It only routes the user's choice back to a page, which applies
// it through TaskRepository — see core/notify/sw-bridge.ts.
importScripts('./ngsw-worker.js');

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const taskId = data.taskId;
  if (!taskId) {
    return;
  }
  event.notification.close();

  // The body tap stands in for Android's third "Other…" action: it opens the wait picker.
  const action = event.action || 'pick-wait';
  const url = `./?task=${encodeURIComponent(taskId)}&intent=${encodeURIComponent(action)}`;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const message = { type: 'notification-action', taskId, action, waitMinutes: data.waitMinutes };
      for (const client of clientList) {
        client.postMessage(message);
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
