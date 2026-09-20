import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppState } from '../../core/app-state';
import { compareDates, parseDateKey } from '../../core/domain/time';
import { OverviewView } from './overview-view';

/**
 * One calendar day's overview, reached from the Calendar and from its own URL.
 * A day gone by is read for what came of it, so completions lead; today and
 * anything ahead are read for what is still owed, so they do not.
 */
@Component({
  selector: 'app-day-overview-page',
  imports: [OverviewView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overview-view [date]="date()" [back]="goBack" [(includeConcluded)]="includeConcluded" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    app-overview-view {
      flex: 1;
      min-height: 0;
    }
  `,
})
export class DayOverviewPage {
  private readonly state = inject(AppState);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  /** A URL can carry anything; an unreadable date is simply today. */
  protected readonly date = computed(
    () => parseDateKey(this.params()?.get('date') ?? '') ?? this.state.today(),
  );

  /**
   * Linked, not plain: walking to another day re-picks the default rather than
   * carrying the last day's choice over, while a toggle still sticks for the
   * day it was made on.
   */
  protected readonly includeConcluded = linkedSignal(
    () => compareDates(this.date(), this.state.today()) < 0,
  );

  constructor() {
    // The route drives the day the store fetches completions for.
    effect(() => this.state.overviewDate.set(this.date()));
    // Handing it back to the clock, so the Today tab is live again.
    inject(DestroyRef).onDestroy(() => this.state.overviewDate.set(null));
  }

  protected readonly goBack = (): void => {
    void this.router.navigate(['/']);
  };
}
