import { describe, expect, it } from 'vitest';
import { placePopover } from '$lib/ui/placePopover';

const VIEWPORT = { viewportWidth: 1000, viewportHeight: 800 };
const SIZE = { width: 300, height: 200 };

describe('placePopover', () => {
  it('opens below-right of the cursor when there is room', () => {
    expect(placePopover({ anchor: { x: 100, y: 100 }, ...SIZE, ...VIEWPORT })).toEqual({ x: 112, y: 112 });
  });

  it('flips left and up near the bottom-right corner', () => {
    expect(placePopover({ anchor: { x: 900, y: 700 }, ...SIZE, ...VIEWPORT })).toEqual({ x: 588, y: 488 });
  });

  it('slides back on screen when it fits on neither side of the cursor', () => {
    const tall = { width: 300, height: 780 };
    expect(placePopover({ anchor: { x: 100, y: 400 }, ...tall, ...VIEWPORT }).y).toBe(12);
  });

  it('pins to the top margin when it is taller than the viewport', () => {
    const huge = { width: 300, height: 900 };
    expect(placePopover({ anchor: { x: 100, y: 400 }, ...huge, ...VIEWPORT }).y).toBe(8);
  });
});
