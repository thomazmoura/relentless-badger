import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Location } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AppState } from '../../core/app-state';
import { CalendarPage } from '../calendar/calendar-page';
import { TasksPage } from '../tasks/tasks-page';
import { TodayPage } from '../today/today-page';

const TABS = [
  { key: 'tasks', label: 'Tasks', icon: 'checklist' },
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar_month' },
] as const;

/** Marks a history entry pushed on top of Tasks, so going home can pop it. */
const FROM_TASKS = 'badgerFromTasks';

/** A drag shorter than this is a tap or a scroll, not a tab change. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * Tasks, Today and Calendar, swipeable and with a bottom bar. Tasks is home: the
 * other tabs live in the URL as one history entry above it, so the browser's
 * back returns to Tasks, as the system back does on Android.
 */
@Component({
  selector: 'app-shell-page',
  imports: [MatButtonModule, MatIconModule, CalendarPage, TasksPage, TodayPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="content"
      (pointerdown)="onPointerDown($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="swipeStart = null"
    >
      @switch (tab()) {
        @case (0) {
          <app-tasks-page />
        }
        @case (1) {
          <app-today-page />
        }
        @default {
          <app-calendar-page />
        }
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
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  readonly state = inject(AppState);
  readonly tabs = TABS;
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: true,
  });
  readonly tab = computed(() =>
    Math.max(
      0,
      TABS.findIndex((entry) => entry.key === this.queryParams().get('tab')),
    ),
  );

  swipeStart: { x: number; y: number } | null = null;

  select(index: number): void {
    const current = this.tab();
    if (index === current) return;
    if (index === 0) {
      // Popping keeps history a single entry deep, rather than stacking Tasks on top.
      if ((this.location.getState() as Record<string, unknown> | null)?.[FROM_TASKS]) {
        this.location.back();
      } else {
        void this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
      return;
    }
    void this.router.navigate([], {
      queryParams: { tab: TABS[index].key },
      // Tab to tab away from Tasks swaps the entry, so one back still lands home.
      replaceUrl: current !== 0,
      state: { [FROM_TASKS]: true },
    });
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
