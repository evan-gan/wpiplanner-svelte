import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesInRange,
  isoDateWeekday,
  rangesOverlap,
  zonedTimeToUtcMillis,
} from '$lib/calendar/dates';

describe('isoDateWeekday', () => {
  it('reports Sunday-based indexes matching DAY_BITS order', () => {
    expect(isoDateWeekday('2026-08-20')).toBe(4); // Thursday
    expect(isoDateWeekday('2026-08-23')).toBe(0); // Sunday
  });

  it('rejects text that is not a calendar date', () => {
    expect(() => isoDateWeekday('August 20')).toThrow(/YYYY-MM-DD/);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary backwards', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('datesInRange', () => {
  it('includes both endpoints', () => {
    expect(datesInRange('2026-11-25', '2026-11-27')).toEqual([
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
    ]);
  });

  it('is empty when the end precedes the start', () => {
    expect(datesInRange('2026-11-27', '2026-11-25')).toEqual([]);
  });

  it('spans a daylight saving change without dropping or repeating a day', () => {
    // 2027-03-14 is the US spring-forward date.
    expect(datesInRange('2027-03-13', '2027-03-15')).toEqual([
      '2027-03-13',
      '2027-03-14',
      '2027-03-15',
    ]);
  });
});

describe('rangesOverlap', () => {
  it('counts a shared endpoint as an overlap', () => {
    expect(rangesOverlap('2026-08-20', '2026-10-09', '2026-10-09', '2026-10-18')).toBe(true);
  });

  it('separates ranges that only touch across a gap', () => {
    expect(rangesOverlap('2026-08-20', '2026-10-09', '2026-10-10', '2026-10-18')).toBe(false);
  });
});

describe('zonedTimeToUtcMillis', () => {
  it('resolves a summer morning in Eastern Daylight Time', () => {
    const instant = zonedTimeToUtcMillis('2026-08-20', 9 * 60, 'America/New_York');
    expect(new Date(instant).toISOString()).toBe('2026-08-20T13:00:00.000Z');
  });

  it('resolves the same wall clock in Eastern Standard Time an hour later in UTC', () => {
    const instant = zonedTimeToUtcMillis('2026-12-11', 9 * 60, 'America/New_York');
    expect(new Date(instant).toISOString()).toBe('2026-12-11T14:00:00.000Z');
  });

  it('resolves a time on the day the clocks go forward', () => {
    const instant = zonedTimeToUtcMillis('2027-03-14', 9 * 60, 'America/New_York');
    expect(new Date(instant).toISOString()).toBe('2027-03-14T13:00:00.000Z');
  });
});
