import { describe, expect, it } from 'vitest';
import { DAY_BITS } from '$lib/model/schedb';
import {
  WEEKDAY_INDEXES,
  dayIndexToBit,
  dayMaskToNames,
  daysOverlap,
  fullDayName,
  maskHasDay,
  parseDayMask,
} from '$lib/model/days';

describe('parseDayMask', () => {
  it('turns a comma separated day list into a bit mask', () => {
    expect(parseDayMask('mon,wed,fri')).toBe(DAY_BITS.mon | DAY_BITS.wed | DAY_BITS.fri);
  });

  it('treats the "?" marker used by Workday as no days at all', () => {
    expect(parseDayMask('?')).toBe(0);
  });

  it('treats an empty string as no days', () => {
    expect(parseDayMask('')).toBe(0);
  });

  it('rejects a token that is not a day abbreviation', () => {
    expect(() => parseDayMask('mon,funday')).toThrow(/funday/);
  });
});

describe('dayMaskToNames', () => {
  it('expands a mask in Sunday-first order regardless of input order', () => {
    expect(dayMaskToNames(parseDayMask('fri,mon'))).toEqual(['mon', 'fri']);
  });

  it('returns nothing for an unknown-days period', () => {
    expect(dayMaskToNames(0)).toEqual([]);
  });
});

describe('daysOverlap', () => {
  it('is true when two masks share at least one day', () => {
    expect(daysOverlap(parseDayMask('mon,wed'), parseDayMask('wed,fri'))).toBe(true);
  });

  it('is false when two masks are disjoint', () => {
    expect(daysOverlap(parseDayMask('mon'), parseDayMask('tue'))).toBe(false);
  });

  it('is false when either mask is empty, so unknown-days periods never conflict', () => {
    expect(daysOverlap(0, parseDayMask('mon'))).toBe(false);
  });
});

describe('day index helpers', () => {
  it('maps Sunday-based indexes onto their bits', () => {
    expect(dayIndexToBit(0)).toBe(DAY_BITS.sun);
    expect(dayIndexToBit(6)).toBe(DAY_BITS.sat);
  });

  it('lists Monday through Friday as the schedulable weekdays', () => {
    expect(WEEKDAY_INDEXES).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports whether a mask contains a given day index', () => {
    const mask = parseDayMask('tue,thu');
    expect(maskHasDay(mask, 2)).toBe(true);
    expect(maskHasDay(mask, 3)).toBe(false);
  });

  it('gives the full name the old app printed in day columns', () => {
    expect(fullDayName(1)).toBe('Monday');
    expect(fullDayName(6)).toBe('Saturday');
  });
});
