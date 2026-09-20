import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OverviewView } from './overview-view';

/**
 * The Today tab: the day overview pointed at now, following the clock. What is
 * still owed is the point here, so completions stay out until asked for.
 */
@Component({
  selector: 'app-today-page',
  imports: [OverviewView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-overview-view />`,
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
export class TodayPage {}
