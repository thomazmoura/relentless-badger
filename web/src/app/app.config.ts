import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { CrashLogErrorHandler } from './core/diagnostics/crash-log';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Keeps uncaught errors on the device so they can be shared from Settings.
    { provide: ErrorHandler, useClass: CrashLogErrorHandler },
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // The date and time pickers work in native Date objects.
    provideNativeDateAdapter(),
    // custom-sw.js wraps ngsw-worker.js and adds the reminder notification handling.
    // Registered immediately because notification actions need an active registration
    // before the first reminder can fire.
    provideServiceWorker('custom-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
