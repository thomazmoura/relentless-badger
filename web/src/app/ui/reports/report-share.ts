import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Share and Copy for a report's toolbar, as the reports all send themselves. */
@Injectable({ providedIn: 'root' })
export class ReportShare {
  private readonly snackBar = inject(MatSnackBar);

  async share(text: string): Promise<void> {
    // Desktop browsers mostly lack the share sheet. Falling back to the
    // clipboard keeps the button meaningful rather than hiding it on half the
    // platforms the PWA runs on.
    if (!('share' in navigator)) {
      await this.writeClipboard(text, 'Sharing is not available here — copied instead');
      return;
    }
    try {
      await navigator.share({ text });
    } catch (error) {
      // A cancelled share sheet is the user changing their mind, not a failure.
      if ((error as DOMException)?.name !== 'AbortError') {
        this.snackBar.open('Could not share the list', undefined, { duration: 4000 });
      }
    }
  }

  async copy(text: string): Promise<void> {
    await this.writeClipboard(text, 'Copied the list');
  }

  private async writeClipboard(text: string, message: string): Promise<void> {
    try {
      // Absent outside a secure context, and it can still reject when the
      // document has lost focus.
      await navigator.clipboard.writeText(text);
      this.snackBar.open(message, undefined, { duration: 4000 });
    } catch {
      this.snackBar.open('Could not copy to the clipboard', undefined, { duration: 4000 });
    }
  }
}
