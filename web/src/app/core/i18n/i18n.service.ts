import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { DateAdapter } from '@angular/material/core';
import { deviceLanguageTag, parseLanguagePreference, resolveLanguage } from '../domain/language';
import { BadgerStoreService } from '../store.service';
import { stringsOf } from './strings';

/**
 * The label table for the language in force — the web's counterpart of the
 * Android app's LocalStrings. Screens read `strings()` in their templates, so a
 * change in Settings re-renders them on the spot.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly session = inject(BadgerStoreService).session.session;
  /** The browser's language, followed live so "device default" tracks a change to it. */
  private readonly deviceTag = signal(deviceLanguageTag());

  readonly language = computed(() =>
    resolveLanguage(parseLanguagePreference(this.session().language), this.deviceTag()),
  );
  readonly strings = computed(() => stringsOf(this.language()));

  constructor() {
    const dateAdapter = inject(DateAdapter);
    const onLanguageChange = () => this.deviceTag.set(deviceLanguageTag());
    window.addEventListener('languagechange', onLanguageChange);
    inject(DestroyRef).onDestroy(() =>
      window.removeEventListener('languagechange', onLanguageChange),
    );

    // What the page says about itself, and what the date picker renders on its
    // own — month and weekday names — follow the labels.
    effect(() => {
      const strings = this.strings();
      document.title = strings.appName;
      document.documentElement.lang = strings.locale;
      dateAdapter.setLocale(strings.locale);
    });
  }
}
