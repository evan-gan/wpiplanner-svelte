/**
 * A Svelte action that keeps an element's scroll position somewhere that
 * outlives it.
 *
 * SvelteKit unmounts a tab's route whenever the student switches tabs, which
 * throws away every scroll offset on it. Hand this action a place to keep the
 * offset (usually a field on `AppState`) and the element starts where it was
 * left, then records each scroll back into it.
 */

export interface ScrollMemory {
  /** The offset to start at, in pixels. */
  read: () => number;
  write: (scrollTop: number) => void;
}

export function rememberScroll(element: HTMLElement, memory: ScrollMemory) {
  // Actions run once the element and its children are in the document, so the
  // saved offset is reachable now. It is applied once more on the next frame
  // because a multi-select scrolls itself to its first selected option during
  // layout, after this runs. Past that frame it is never re-applied, so it
  // cannot fight the student's own scrolling.
  const savedScrollTop = memory.read();
  element.scrollTop = savedScrollTop;
  const reapplyFrame = requestAnimationFrame(() => {
    element.scrollTop = savedScrollTop;
  });

  let currentMemory = memory;
  const onScroll = () => currentMemory.write(element.scrollTop);
  element.addEventListener('scroll', onScroll, { passive: true });

  return {
    update(nextMemory: ScrollMemory) {
      currentMemory = nextMemory;
    },
    destroy() {
      cancelAnimationFrame(reapplyFrame);
      element.removeEventListener('scroll', onScroll);
    },
  };
}
