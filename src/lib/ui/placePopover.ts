/**
 * Where to put a popover that opens at the cursor so it stays on screen.
 *
 * It goes below-right of the point by default, flips to the left or above
 * when that side would run off the viewport, and is finally clamped inside a
 * margin — so a popover opened near any edge is still fully visible.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PopoverPlacement {
  /** The cursor (or anchor) position, in viewport pixels. */
  anchor: Point;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Gap between the cursor and the popover's corner. */
  offset?: number;
  /** Minimum distance kept from every viewport edge. */
  margin?: number;
}

const DEFAULT_OFFSET = 12;
const DEFAULT_MARGIN = 8;

function placeOnAxis(anchor: number, size: number, viewport: number, offset: number, margin: number): number {
  const after = anchor + offset;
  const before = anchor - offset - size;
  const preferred = after + size <= viewport - margin || before < margin ? after : before;
  return Math.max(margin, Math.min(preferred, viewport - margin - size));
}

/** The popover's top-left corner, in viewport pixels. */
export function placePopover(placement: PopoverPlacement): Point {
  const offset = placement.offset ?? DEFAULT_OFFSET;
  const margin = placement.margin ?? DEFAULT_MARGIN;
  return {
    x: placeOnAxis(placement.anchor.x, placement.width, placement.viewportWidth, offset, margin),
    y: placeOnAxis(placement.anchor.y, placement.height, placement.viewportHeight, offset, margin),
  };
}
