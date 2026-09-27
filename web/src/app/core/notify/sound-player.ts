/**
 * Plays a nag's sound from the page. Browsers ignore a notification's own sound
 * option, so anything but the OS default has to be played by us — which is why
 * notifications with a chosen sound are posted silent.
 */
export interface SoundPlayer {
  /**
   * Resolves once playback has started; rejects when the browser refuses, most
   * often because the page hasn't had a user gesture yet (autoplay policy).
   */
  play(source: string): Promise<void>;
  stop(): void;
}

export class AudioElementSoundPlayer implements SoundPlayer {
  private current: HTMLAudioElement | null = null;

  play(source: string): Promise<void> {
    this.stop();
    const audio = new Audio(source);
    this.current = audio;
    return audio.play();
  }

  stop(): void {
    if (this.current === null) return;
    this.current.pause();
    this.current = null;
  }
}
