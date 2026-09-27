import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { I18n } from '../../core/i18n/i18n.service';
import { Strings } from '../../core/i18n/strings';
import { OverviewView } from '../today/overview-view';
import { RecurringView } from './recurring-view';

export type ReportKind = 'today' | 'recurring';

const REPORTS: readonly { readonly kind: ReportKind; readonly label: (s: Strings) => string }[] = [
  { kind: 'today', label: (s) => s.reportToday },
  { kind: 'recurring', label: (s) => s.reportRecurring },
];

/**
 * The Reports tab: one read-only report at a time, picked from a switch at the
 * top. Each report owns its own toolbar, so Share and Copy always send the one
 * on screen, under its own name. Today follows the clock, and what is still
 * owed is its point, so completions stay out until asked for.
 */
@Component({
  selector: 'app-reports-page',
  imports: [MatButtonToggleModule, NgTemplateOutlet, OverviewView, RecurringView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #reportSwitch>
      <mat-button-toggle-group
        class="switch"
        hideSingleSelectionIndicator
        [attr.aria-label]="s().reportSwitch"
        [value]="kind()"
        (change)="kind.set($event.value)"
      >
        @for (report of reports; track report.kind) {
          <mat-button-toggle [value]="report.kind">{{ report.label(s()) }}</mat-button-toggle>
        }
      </mat-button-toggle-group>
    </ng-template>

    @if (kind() === 'today') {
      <app-overview-view>
        <ng-container [ngTemplateOutlet]="reportSwitch" />
      </app-overview-view>
    } @else {
      <app-recurring-view>
        <ng-container [ngTemplateOutlet]="reportSwitch" />
      </app-recurring-view>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    app-overview-view,
    app-recurring-view {
      flex: 1;
      min-height: 0;
    }
    .switch {
      display: flex;
      margin: 0.25rem 0;
    }
    .switch mat-button-toggle {
      flex: 1;
    }
  `,
})
export class ReportsPage {
  protected readonly s = inject(I18n).strings;
  protected readonly reports = REPORTS;
  protected readonly kind = signal<ReportKind>('today');
}
