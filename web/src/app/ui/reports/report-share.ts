import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { I18n } from '../../core/i18n/i18n.service';

/** Share and Copy for a report's toolbar, as the reports all send themselves. */
@Injectable({ providedIn: 'root' })
export class ReportShare {
  private readonly snackBar = inject(MatSnackBar);
  private readonly s = inject(I18n).strings;

  async share(text: string): Promise<void> {
    // Desktop browsers mostly lack the share sheet. Falling back to the
    // clipboard keeps the button meaningful rather than hiding it on half the
    // platforms the PWA runs on.
    if (!('share' in navigator)) {
      await this.writeClipboard(text, this.s().sharingUnavailable);
      return;
    }
    try {
      await navigator.share({ text });
    } catch (error) {
      // A cancelled share sheet is the user changing their mind, not a failure.
      if ((error as DOMException)?.name !== 'AbortError') {
        this.snackBar.open(this.s().couldNotShare, undefined, { duration: 4000 });
      }
    }
  }

  async copy(text: string): Promise<void> {
    await this.writeClipboard(text, this.s().copiedList);
  }

  private async writeClipboard(text: string, message: string): Promise<void> {
    try {
      // Absent outside a secure context, and it can still reject when the
      // document has lost focus.
      await navigator.clipboard.writeText(text);
      this.snackBar.open(message, undefined, { duration: 4000 });
    } catch {
      this.snackBar.open(this.s().couldNotCopy, undefined, { duration: 4000 });
    }
  }
}
