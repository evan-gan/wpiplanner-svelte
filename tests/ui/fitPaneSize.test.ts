import { describe, expect, it } from 'vitest';
import { fitChosenPaneHeight, railWidthForSquareCalendar, type FitPaneInput } from '$lib/ui/fitPaneSize';

const BASE: FitPaneInput = {
  contentHeight: 0,
  columnHeight: 800,
  descriptionHeight: 200,
  defaultHeight: 250,
  minHeight: 100,
  dividerSize: 5,
};

describe('fitChosenPaneHeight', () => {
  it('shrinks to fit a short list, but not below the minimum', () => {
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 160 })).toBe(160);
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 30 })).toBe(100);
  });

  it('grows past the default while the description still fits', () => {
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 400 })).toBe(400);
  });

  it('stops growing where the description would start to scroll', () => {
    // 800 - 5 - 200 leaves 595 for the list.
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 700 })).toBe(595);
  });

  it('stays at the default when the description is long', () => {
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 700, descriptionHeight: 700 })).toBe(250);
  });

  it('always leaves the description its minimum', () => {
    expect(fitChosenPaneHeight({ ...BASE, contentHeight: 900, descriptionHeight: 10 })).toBe(695);
  });
});

describe('railWidthForSquareCalendar', () => {
  const SQUARE_BASE = {
    containerWidth: 2000,
    containerHeight: 1200,
    middleWidth: 180,
    toolbarHeight: 26,
    minRailWidth: 300,
    maxRailWidth: 900,
  };

  it('gives the rail whatever width leaves the calendar square', () => {
    // 1200 - 26 = 1174 square; 2000 - 180 - 1174 = 646 for the rail.
    expect(railWidthForSquareCalendar(SQUARE_BASE)).toBe(646);
  });

  it('keeps a usable rail when the window is too narrow for a square', () => {
    expect(railWidthForSquareCalendar({ ...SQUARE_BASE, containerWidth: 1200 })).toBe(300);
  });

  it('does not stretch the rail past its maximum on a very wide window', () => {
    expect(railWidthForSquareCalendar({ ...SQUARE_BASE, containerWidth: 3500 })).toBe(900);
  });
});
