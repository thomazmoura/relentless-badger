import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BadgerStoreService } from '../store.service';

/**
 * Turns the API's relative paths into absolute ones against the session's base
 * URL and attaches the bearer token — Retrofit's base URL plus auth interceptor,
 * in one place.
 *
 * Absolute URLs (the Google script, anything the app fetches directly) pass
 * through untouched.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (/^https?:\/\//i.test(request.url)) {
    return next(request);
  }

  const session = inject(BadgerStoreService).session;
  const baseUrl = session.cachedBaseUrl;
  const token = session.cachedToken;

  const url = baseUrl ? `${baseUrl}/${request.url.replace(/^\/+/, '')}` : request.url;
  return next(
    request.clone({
      url,
      setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
};
