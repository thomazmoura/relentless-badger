import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * Google sign-in, script-loaded rather than npm-installed: the button renders
 * itself and hands back an ID token, which the backend validates against the
 * same Web OAuth client the Android app uses.
 *
 * The Cloud Console client needs this origin under "Authorized JavaScript
 * origins" — without it Google refuses to render the button at all.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private loading: Promise<void> | null = null;
  private pendingResolve: ((idToken: string) => void) | null = null;

  /** Mirrors AppViewModel.devLoginAvailable: no client id, no Google button. */
  get devLoginAvailable(): boolean {
    return environment.googleWebClientId.trim() === '';
  }

  /**
   * Renders Google's button into [target] and resolves with the ID token once
   * the user picks an account.
   */
  async renderButton(target: HTMLElement): Promise<string> {
    await this.load();
    const google = window.google;
    if (!google) {
      throw new Error('Google Sign-In could not be loaded.');
    }
    const token = new Promise<string>((resolve) => {
      this.pendingResolve = resolve;
    });
    google.accounts.id.initialize({
      client_id: environment.googleWebClientId,
      // FedCM is the only flow left in browsers that block third-party cookies.
      use_fedcm_for_prompt: true,
      callback: (response) => this.pendingResolve?.(response.credential),
    });
    google.accounts.id.renderButton(target, { theme: 'outline', size: 'large', width: 280 });
    return token;
  }

  private load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = new Promise<void>((resolve, reject) => {
      if (window.google) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.loading = null;
        reject(new Error('Cannot reach Google Sign-In. Check your network.'));
      };
      document.head.appendChild(script);
    });
    return this.loading;
  }
}
