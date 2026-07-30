import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AppState } from './core/app-state';

/** Everything except the sign-in screen needs a session. */
const signedIn: CanActivateFn = () => {
  const state = inject(AppState);
  return state.signedIn() ? true : inject(Router).createUrlTree(['/signin']);
};

export const routes: Routes = [
  {
    path: '',
    canActivate: [signedIn],
    loadComponent: () => import('./ui/shell/shell-page').then((m) => m.ShellPage),
  },
  {
    path: 'settings',
    canActivate: [signedIn],
    loadComponent: () => import('./ui/settings/settings-page').then((m) => m.SettingsPage),
  },
  {
    path: 'signin',
    loadComponent: () => import('./ui/signin/sign-in-page').then((m) => m.SignInPage),
  },
  { path: '**', redirectTo: '' },
];
