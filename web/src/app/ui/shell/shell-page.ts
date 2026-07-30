import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AppState } from '../../core/app-state';
import { BadgerStoreService } from '../../core/store.service';
import { CalendarPage } from '../calendar/calendar-page';
import { TasksPage } from '../tasks/tasks-page';

const TABS = [
  { label: 'Tasks', icon: 'checklist' },
  { label: 'Calendar', icon: 'calendar_month' },
] as const;

/** A drag shorter than this is a tap or a scroll, not a tab change. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * Tasks and Calendar, swipeable and with a bottom bar. The selected tab is
 * remembered on the device, so coming back from Settings lands where you were.
 */
@Component({
  selector: 'app-shell-page',
  imports: [MatButtonModule, MatIconModule, CalendarPage, TasksPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="content"
      (pointerdown)="onPointerDown($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="swipeStart = null"
    >
      @if (tab() === 0) {
        <app-tasks-page />
      } @else {
        <app-calendar-page />
      }
    </div>

    <nav class="bottom">
      @for (entry of tabs; track entry.label; let i = $index) {
        <button
          type="button"
          class="tab"
          [class.selected]="tab() === i"
          [attr.aria-current]="tab() === i"
          (click)="select(i)"
        >
          <mat-icon>{{ entry.icon }}</mat-icon>
          <span>{{ entry.label }}</span>
        </button>
      }
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .content > * {
      flex: 1;
      min-height: 0;
    }
    .bottom {
      display: flex;
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 0.5rem 0;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .tab.selected {
      color: var(--mat-sys-on-secondary-container);
    }
    .tab.selected mat-icon {
      background: var(--mat-sys-secondary-container);
      border-radius: 1rem;
      padding: 0 1rem;
    }
  `,
})
export class ShellPage {
  private readonly storeService = inject(BadgerStoreService);
  readonly state = inject(AppState);
  readonly tabs = TABS;
  readonly tab = signal(this.storeService.store.currentUi().tab);

  swipeStart: { x: number; y: number } | null = null;

  select(index: number): void {
    this.tab.set(index);
    this.storeService.store.patchUi({ tab: index });
  }

  onPointerDown(event: PointerEvent): void {
    this.swipeStart = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Mostly-horizontal only, so a vertical scroll never flips the tab.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
    const next = this.tab() + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < TABS.length) this.select(next);
  }
}
