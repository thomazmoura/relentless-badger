import { DestroyRef, inject, Injectable } from '@angular/core';
import { BadgerStore } from './data/local-store';
import { LocalSessionStore } from './data/session-store';
import { createDefaultDriver } from './data/storage';

/**
 * Owns the database and the session for the whole app.
 *
 * Deliberately free of HttpClient: the auth interceptor reads the session from
 * here, and the interceptor is itself part of HttpClient's pipeline — putting
 * the two in one service would be a dependency cycle.
 */
@Injectable({ providedIn: 'root' })
export class BadgerStoreService {
  readonly store = new BadgerStore(createDefaultDriver());
  readonly session = new LocalSessionStore(this.store);

  constructor() {
    // Another tab's write is the only way this data changes underneath us.
    const onStorage = (event: StorageEvent) => {
      const key = BadgerStore.storeKeyFor(event.key);
      if (key) this.store.reload(key);
    };
    // A pending flush would otherwise be lost when the page goes away.
    const onHide = () => this.store.flush();

    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    });
  }
}
