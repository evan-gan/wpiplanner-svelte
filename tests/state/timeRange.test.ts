import { describe, expect, it } from 'vitest';
import {
  DEFAULT_END_HOUR,
  DEFAULT_START_HOUR,
  TimeRangeState,
  computeTimeRange,
} from '$lib/state/timeRange.svelte';
import { section } from '../fixtures/generatorFixtures';

describe('computeTimeRange', () => {
  it('never narrows past 10:00-16:00', () => {
    const midday = [[section('CS|2102|A01', ['A'], ['11:00AM-11:50AM mon'])]];
    expect(computeTimeRange(midday)).toEqual({ startHour: 10, endHour: 16 });
  });

  it('stretches down to an early class', () => {
    const early = [[section('CS|2102|A01', ['A'], ['8:00AM-8:50AM mon'])]];
    expect(computeTimeRange(early)).toEqual({ startHour: 8, endHour: 16 });
  });

  it('stretches up to a late class, rounding the end hour up', () => {
    const late = [[section('CS|4432|A01', ['A'], ['6:00PM-8:50PM mon'])]];
    expect(computeTimeRange(late)).toEqual({ startHour: 10, endHour: 21 });
  });

  it('rounds a half-hour start down to the whole hour', () => {
    const halfPast = [[section('CS|2102|A01', ['A'], ['9:30AM-10:20AM mon'])]];
    expect(computeTimeRange(halfPast).startHour).toBe(9);
  });

  it('covers every course, not just the first', () => {
    const spread = [
      [section('CS|2102|A01', ['A'], ['11:00AM-11:50AM mon'])],
      [section('PE|1110|A01', ['A'], ['8:00AM-8:50AM tue'])],
    ];
    expect(computeTimeRange(spread).startHour).toBe(8);
  });

  it('falls back to the minimum window with no courses at all', () => {
    expect(computeTimeRange([])).toEqual({ startHour: 10, endHour: 16 });
  });
});

describe('TimeRangeState', () => {
  it('starts at the legacy defaults before any course is chosen', () => {
    const range = new TimeRangeState();
    expect(range.startHour).toBe(DEFAULT_START_HOUR);
    expect(range.endHour).toBe(DEFAULT_END_HOUR);
  });

  it('updates from the chosen courses', () => {
    const range = new TimeRangeState();
    range.update([[section('CS|2102|A01', ['A'], ['8:00AM-8:50AM mon'])]]);
    expect(range.startHour).toBe(8);
    expect(range.hours).toBe(8);
  });

  it('maps a time onto its vertical position in the grid', () => {
    const range = new TimeRangeState();
    range.update([[section('CS|2102|A01', ['A'], ['10:00AM-10:50AM mon'])]]);
    expect(range.progress(10 * 60)).toBe(0);
    expect(range.progress(16 * 60)).toBe(1);
    expect(range.progress(13 * 60)).toBe(0.5);
  });
});
