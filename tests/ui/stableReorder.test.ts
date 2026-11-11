import { describe, expect, it } from 'vitest';
import {
  chooseAnchor,
  keepAnchorInPlace,
  offsetsFromSnapshot,
  planAnchorScroll,
  snapshotTops,
  type Measurable,
} from '$lib/ui/stableReorder';

/** An item drawn at a fixed spot, which a test moves by reassigning `top`. */
function box(top: number, height = 50): Measurable & { top: number } {
  const item = {
    top,
    getBoundingClientRect: () => ({ top: item.top, bottom: item.top + height }),
  };
  return item;
}

const VIEWPORT = { top: 0, bottom: 300 };

describe('chooseAnchor', () => {
  it('prefers the first preferred key that is on screen', () => {
    const items = new Map([['a', box(0)], ['b', box(100)], ['c', box(200)]]);
    expect(chooseAnchor(VIEWPORT, items, ['c', 'b'])).toBe('c');
  });

  it('skips a preferred item scrolled out of view', () => {
    const items = new Map([['a', box(0)], ['b', box(100)], ['off', box(900)]]);
    expect(chooseAnchor(VIEWPORT, items, ['off', 'b'])).toBe('b');
  });

  it('falls back to the first item on screen, in list order', () => {
    const items = new Map([['above', box(-200)], ['first', box(-20)], ['second', box(100)]]);
    expect(chooseAnchor(VIEWPORT, items, ['missing'])).toBe('first');
  });

  it('finds nothing when nothing is on screen', () => {
    expect(chooseAnchor(VIEWPORT, new Map([['far', box(1000)]]), [])).toBeUndefined();
  });

  it('counts a tall item whose top is above the viewport as on screen', () => {
    const items = new Map([['tall', box(-400, 600)]]);
    expect(chooseAnchor(VIEWPORT, items, ['tall'])).toBe('tall');
  });
});

describe('planAnchorScroll', () => {
  const scroller = (scrollTop: number, scrollHeight: number) => ({ scrollTop, scrollHeight, clientHeight: 400 });

  it('scrolls by however far the anchor moved, with no slack when there is room', () => {
    expect(planAnchorScroll(scroller(500, 2000), 0, 140)).toEqual({ scrollTop: 640, slack: 0 });
  });

  it('adds slack under a list too short to scroll that far', () => {
    // Content exactly fills the pane, so the scroll has nowhere to go without slack.
    expect(planAnchorScroll(scroller(0, 400), 0, 109)).toEqual({ scrollTop: 109, slack: 109 });
  });

  it('shrinks slack that is no longer needed', () => {
    // 400 content + 109 slack; the anchor moves back up by 109.
    expect(planAnchorScroll(scroller(109, 509), 109, -109)).toEqual({ scrollTop: 0, slack: 0 });
  });

  it('clamps at the top when the anchor moves up further than the scroll allows', () => {
    expect(planAnchorScroll(scroller(30, 2000), 0, -100)).toEqual({ scrollTop: 0, slack: 0 });
  });
});

describe('keepAnchorInPlace', () => {
  it('puts the anchor back where it was drawn, growing the slack first', () => {
    const anchor = box(120);
    const items = new Map([['anchor', anchor]]);
    const before = snapshotTops(items);
    const scroller = { scrollTop: 0, scrollHeight: 400, clientHeight: 400 };
    const slack = { style: { height: '' } };

    anchor.top = 260; // a group was inserted above it
    keepAnchorInPlace(scroller, 'anchor', before, items, slack);
    expect(scroller.scrollTop).toBe(140);
    expect(slack.style.height).toBe('140px');
  });

  it('leaves the scroll alone when the anchor is gone', () => {
    const scroller = { scrollTop: 500, scrollHeight: 2000, clientHeight: 400 };
    keepAnchorInPlace(scroller, 'gone', new Map([['gone', 10]]), new Map(), { style: { height: '' } });
    expect(scroller.scrollTop).toBe(500);
  });
});

describe('offsetsFromSnapshot', () => {
  it('gives each moved item the distance back to where it was drawn', () => {
    const up = box(200);
    const down = box(0);
    const items = new Map([['up', up], ['down', down]]);
    const before = snapshotTops(items);
    up.top = 50;
    down.top = 120;
    expect(offsetsFromSnapshot(before, items)).toEqual(new Map([['up', 150], ['down', -120]]));
  });

  it('skips items that did not move, moved under a pixel, or are new', () => {
    const still = box(10);
    const nudged = box(40);
    const items = new Map<string, Measurable & { top: number }>([['still', still], ['nudged', nudged]]);
    const before = snapshotTops(items);
    nudged.top = 40.4;
    items.set('new', box(90));
    expect(offsetsFromSnapshot(before, items).size).toBe(0);
  });
});
