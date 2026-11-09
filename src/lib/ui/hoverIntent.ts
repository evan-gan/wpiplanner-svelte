/**
 * Open-on-hover timing for a popover the pointer has to be able to reach.
 *
 * Hovering a trigger opens it after a short delay, so sweeping the pointer
 * across a list does not open (and solve) every row it passes. Leaving the
 * trigger closes it only after a grace period, and entering the popover itself
 * cancels that close — that is what lets the pointer travel from the trigger
 * into the popover to use it.
 */
export interface HoverIntentOptions {
  openDelayMs: number;
  closeDelayMs: number;
  onClose: () => void;
}

export class HoverIntent {
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: HoverIntentOptions) {}

  /** The pointer entered a trigger; `open` runs after the delay unless it leaves first. */
  enterTrigger(open: () => void): void {
    this.cancelClose();
    this.cancelOpen();
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      open();
    }, this.options.openDelayMs);
  }

  /** The pointer left a trigger. */
  leaveTrigger(): void {
    this.cancelOpen();
    this.scheduleClose();
  }

  /** The pointer reached the popover: keep it open. */
  enterSurface(): void {
    this.cancelClose();
  }

  leaveSurface(): void {
    this.scheduleClose();
  }

  /** Open straight away — a click or a keyboard press on the trigger. */
  openNow(open: () => void): void {
    this.cancelClose();
    this.cancelOpen();
    open();
  }

  /** Forget any pending open or close, e.g. when the popover was closed some other way. */
  reset(): void {
    this.cancelOpen();
    this.cancelClose();
  }

  private scheduleClose(): void {
    this.cancelClose();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.options.onClose();
    }, this.options.closeDelayMs);
  }

  private cancelOpen(): void {
    if (this.openTimer !== null) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  private cancelClose(): void {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }
}
