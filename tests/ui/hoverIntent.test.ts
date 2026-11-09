import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoverIntent } from '$lib/ui/hoverIntent';

function setup() {
  const onClose = vi.fn();
  const open = vi.fn();
  const intent = new HoverIntent({ openDelayMs: 300, closeDelayMs: 300, onClose });
  return { intent, open, onClose };
}

describe('HoverIntent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens only after the pointer rests on the trigger', () => {
    const { intent, open } = setup();
    intent.enterTrigger(open);
    vi.advanceTimersByTime(299);
    expect(open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not open when the pointer sweeps past', () => {
    const { intent, open } = setup();
    intent.enterTrigger(open);
    vi.advanceTimersByTime(100);
    intent.leaveTrigger();
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
  });

  it('stays open while the pointer travels from the trigger into the popover', () => {
    const { intent, onClose } = setup();
    intent.leaveTrigger();
    vi.advanceTimersByTime(200);
    intent.enterSurface();
    vi.advanceTimersByTime(1000);
    expect(onClose).not.toHaveBeenCalled();

    intent.leaveSurface();
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('forgets pending timers on reset', () => {
    const { intent, open, onClose } = setup();
    intent.enterTrigger(open);
    intent.leaveSurface();
    intent.reset();
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
