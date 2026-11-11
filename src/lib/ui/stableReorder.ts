/**
 * Reordering a scrolled list without moving the item the user is looking at.
 *
 * When a list regroups, everything after the first change shifts. If the item
 * the student is working in shifts too, the row under their pointer jumps
 * away. The fix is the usual FLIP trick plus scroll anchoring:
 *
 * 1. `snapshotTops` before the DOM changes,
 * 2. `keepAnchorInPlace` after it changes — scroll so the anchor item is back
 *    where it was on screen,
 * 3. `slideFromSnapshot` — every other item animates from its old screen
 *    position to its new one, so the eye can follow it.
 *
 * Items are looked up by key, so this works whether the framework moved the
 * DOM node or replaced it.
 */

/** Only what the helpers read, so tests can pass plain objects. */
export interface Measurable {
  getBoundingClientRect(): { top: number; bottom: number };
}

/** Viewport `top` of each keyed item, taken just before a reorder. */
export type TopSnapshot = Map<string, number>;

export function snapshotTops(items: ReadonlyMap<string, Measurable>): TopSnapshot {
  const tops: TopSnapshot = new Map();
  for (const [key, item] of items) tops.set(key, item.getBoundingClientRect().top);
  return tops;
}

/**
 * Which item to hold still: the first of `preferredKeys` that is on screen,
 * else the first on-screen item in list order.
 *
 * @param viewport The scroll container's visible box
 * @param items Keyed items, in list order (a `Map` keeps insertion order)
 * @param preferredKeys Most important first — e.g. the course last clicked, then open ones
 * @returns The anchor's key, or undefined if nothing is on screen
 */
export function chooseAnchor(
  viewport: { top: number; bottom: number },
  items: ReadonlyMap<string, Measurable>,
  preferredKeys: readonly string[],
): string | undefined {
  const isOnScreen = (key: string) => {
    const box = items.get(key)?.getBoundingClientRect();
    return box !== undefined && box.bottom > viewport.top && box.top < viewport.bottom;
  };
  return preferredKeys.find(isOnScreen) ?? [...items.keys()].find(isOnScreen);
}

/** The parts of a scroll container the anchoring reads and writes. */
export interface ScrollBox {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Where to scroll so an item that shifted by `anchorShift` px is back where
 * it was, and how much blank space must sit under the list to allow it.
 *
 * A short list cannot scroll down far enough to cancel an item moving down,
 * so the list gets bottom slack for exactly the shortfall (and loses slack it
 * no longer needs). Moving up past the top cannot be cancelled; it clamps at 0.
 *
 * @param scroller Measured after the reorder, with `currentSlack` still in place
 * @param currentSlack Height of the slack already under the list, px
 * @param anchorShift New top minus old top of the anchor, px
 */
export function planAnchorScroll(
  scroller: ScrollBox,
  currentSlack: number,
  anchorShift: number,
): { scrollTop: number; slack: number } {
  const scrollTop = Math.max(0, scroller.scrollTop + anchorShift);
  const maxScrollWithoutSlack = scroller.scrollHeight - currentSlack - scroller.clientHeight;
  return { scrollTop, slack: Math.max(0, scrollTop - maxScrollWithoutSlack) };
}

/**
 * Scroll so the anchor item's top is back where the snapshot saw it, growing
 * or shrinking `slackElement` (an empty element at the end of the list) as
 * {@link planAnchorScroll} says.
 */
export function keepAnchorInPlace(
  scroller: ScrollBox,
  anchorKey: string,
  before: TopSnapshot,
  items: ReadonlyMap<string, Measurable>,
  slackElement: { style: { height: string } },
): void {
  const oldTop = before.get(anchorKey);
  const anchor = items.get(anchorKey);
  if (oldTop === undefined || anchor === undefined) return;

  const currentSlack = Number.parseFloat(slackElement.style.height) || 0;
  const plan = planAnchorScroll(scroller, currentSlack, anchor.getBoundingClientRect().top - oldTop);
  // Slack first: until it exists the browser would clamp the scroll.
  slackElement.style.height = `${plan.slack}px`;
  scroller.scrollTop = plan.scrollTop;
}

/** How far each item must be drawn back up (negative) or down to sit where it was. */
export function offsetsFromSnapshot(
  before: TopSnapshot,
  items: ReadonlyMap<string, Measurable>,
): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const [key, item] of items) {
    const oldTop = before.get(key);
    if (oldTop === undefined) continue;
    const offset = oldTop - item.getBoundingClientRect().top;
    // Sub-pixel differences are layout rounding, not a move worth animating.
    if (Math.abs(offset) >= 1) offsets.set(key, offset);
  }
  return offsets;
}

const SLIDE_MS = 220;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Stop earlier slides so the next measurement sees each item's real position. */
export function cancelSlides(items: ReadonlyMap<string, HTMLElement>): void {
  for (const element of items.values()) {
    for (const animation of element.getAnimations?.() ?? []) animation.cancel();
  }
}

/**
 * Animate every moved item from its old screen position to its new one, and
 * fade in items that were not there before.
 */
export function slideFromSnapshot(before: TopSnapshot, items: ReadonlyMap<string, HTMLElement>): void {
  if (prefersReducedMotion()) return;
  const offsets = offsetsFromSnapshot(before, items);
  for (const [key, element] of items) {
    if (typeof element.animate !== 'function') return;
    const offset = offsets.get(key);
    if (offset !== undefined) {
      element.animate([{ transform: `translateY(${offset}px)` }, { transform: 'none' }], {
        duration: SLIDE_MS,
        easing: 'ease-out',
      });
    } else if (!before.has(key)) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out' });
    }
  }
}

/** The nearest ancestor that scrolls vertically — where scroll anchoring has to happen. */
export function findScrollParent(element: HTMLElement): HTMLElement | null {
  for (let current = element.parentElement; current !== null; current = current.parentElement) {
    const overflowY = getComputedStyle(current).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
  }
  return null;
}
