import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { AppState } from '../../core/app-state';

/**
 * Sign-in. The server URL is only shown when the build has no baked-in default
 * or the user asks for it, the same rule the Android screen uses.
 */
@Component({
  selector: 'app-sign-in-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1>RelentlessBadger</h1>
      <p class="tagline">The to-do list that won't shut up until you do the thing.</p>

      @if (showAdvanced()) {
        <mat-form-field appearance="outline" class="field">
          <mat-label>Server URL</mat-label>
          <input matInput [ngModel]="baseUrl()" (ngModelChange)="baseUrl.set($event)" />
          <mat-hint>The machine on your network running the API</mat-hint>
        </mat-form-field>
      }

      @if (state.devLoginAvailable) {
        <p class="note">
          Google Sign-In is not configured in this build (googleWebClientId is empty).
        </p>
        <button matButton="outlined" [disabled]="state.busy()" (click)="signInAsDev()">
          Dev sign-in (server dev bypass)
        </button>
      } @else {
        <div #googleButton class="google"></div>
      }

      @if (state.configuredBaseUrl !== '') {
        <button matButton (click)="showAdvanced.set(!showAdvanced())">
          {{ showAdvanced() ? 'Hide advanced' : 'Advanced' }}
        </button>
      }

      @if (state.busy()) {
        <mat-spinner diameter="32" />
      }
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      text-align: center;
    }
    h1 {
      font: var(--mat-sys-headline-medium);
      margin: 3rem 0 0;
    }
    .tagline,
    .note {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      max-width: 28rem;
    }
    .field {
      width: min(28rem, 100%);
    }
  `,
})
export class SignInPage {
  readonly state = inject(AppState);
  private readonly router = inject(Router);

  private readonly googleButton = viewChild<ElementRef<HTMLElement>>('googleButton');

  readonly baseUrl = signal(this.state.session().baseUrl || this.state.configuredBaseUrl);
  readonly showAdvanced = signal(this.state.configuredBaseUrl === '');

  constructor() {
    // Google renders its own button, so it can only be wired once the host
    // element exists — and re-wired if the user toggles the advanced panel.
    effect(() => {
      const host = this.googleButton();
      if (!host) return;
      void this.state
        .signInWithGoogle(host.nativeElement, this.baseUrl())
        .then(() => this.leaveIfSignedIn());
    });

    effect(() => {
      if (this.state.signedIn()) void this.router.navigate(['/']);
    });
  }

  async signInAsDev(): Promise<void> {
    await this.state.signInAsDev(this.baseUrl());
    await this.leaveIfSignedIn();
  }

  private async leaveIfSignedIn(): Promise<void> {
    if (this.state.signedIn()) await this.router.navigate(['/']);
  }
}
