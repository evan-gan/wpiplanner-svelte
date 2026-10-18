import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberScroll } from '$lib/ui/rememberScroll';

/** Just enough of an element for the action: a scroll offset and events. */
function fakeScroller(): HTMLElement {
  const target = new EventTarget() as EventTarget & { scrollTop: number };
  target.scrollTop = 0;
  return target as unknown as HTMLElement;
}

function scrollTo(element: HTMLElement, offset: number) {
  element.scrollTop = offset;
  element.dispatchEvent(new Event('scroll'));
}

describe('rememberScroll', () => {
  // Node has no frames; queue the callbacks so a test decides when one "paints".
  let pendingFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    pendingFrames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pendingFrames.push(callback);
      return pendingFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pendingFrames[id - 1] = () => {};
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function paintFrame() {
    for (const callback of pendingFrames.splice(0)) callback(0);
  }

  it('starts the element at the remembered offset', () => {
    const element = fakeScroller();
    rememberScroll(element, { read: () => 340, write: () => {} });
    expect(element.scrollTop).toBe(340);
  });

  it('restores the offset again after the browser moves it during layout', () => {
    const element = fakeScroller();
    let saved = 340;
    rememberScroll(element, { read: () => saved, write: (offset) => (saved = offset) });
    // What a multi-select does on its own: jump to its first selected option.
    scrollTo(element, 78);
    paintFrame();
    expect(element.scrollTop).toBe(340);
  });

  it('does not re-apply the offset after being destroyed', () => {
    const element = fakeScroller();
    const action = rememberScroll(element, { read: () => 340, write: () => {} });
    element.scrollTop = 10;
    action.destroy();
    paintFrame();
    expect(element.scrollTop).toBe(10);
  });

  it('records every scroll into the memory', () => {
    const element = fakeScroller();
    let saved = 0;
    rememberScroll(element, { read: () => saved, write: (offset) => (saved = offset) });
    scrollTo(element, 120);
    expect(saved).toBe(120);
  });

  it('writes to the newest memory after an update', () => {
    const element = fakeScroller();
    let first = 0;
    let second = 0;
    const action = rememberScroll(element, { read: () => 0, write: (offset) => (first = offset) });
    action.update({ read: () => 0, write: (offset) => (second = offset) });
    scrollTo(element, 50);
    expect(first).toBe(0);
    expect(second).toBe(50);
  });

  it('stops recording once destroyed', () => {
    const element = fakeScroller();
    let saved = 0;
    const action = rememberScroll(element, { read: () => 0, write: (offset) => (saved = offset) });
    action.destroy();
    scrollTo(element, 90);
    expect(saved).toBe(0);
  });
});
