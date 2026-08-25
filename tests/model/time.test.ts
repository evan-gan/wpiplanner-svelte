import { describe, expect, it } from 'vitest';
import {
  MINUTES_PER_DAY,
  formatClockTime,
  minutesToDecimalHours,
  parseClockTime,
  snapToBlockStart,
} from '$lib/model/time';

describe('parseClockTime', () => {
  it('parses a morning time', () => {
    expect(parseClockTime('9:00AM')).toBe(9 * 60);
  });

  it('parses an afternoon time', () => {
    expect(parseClockTime('1:30PM')).toBe(13 * 60 + 30);
  });

  it('keeps noon at 12, not 24', () => {
    expect(parseClockTime('12:00PM')).toBe(12 * 60);
  });

  it('puts midnight at 0 — the legacy Time(String) left it at hour 12', () => {
    expect(parseClockTime('12:00AM')).toBe(0);
  });

  it('rejects text that is not a 12-hour clock time', () => {
    expect(() => parseClockTime('9:0AM')).toThrow(/9:00AM/);
  });

  it('rejects an hour outside the 12-hour range', () => {
    expect(() => parseClockTime('13:00PM')).toThrow(/valid 12-hour clock range/);
  });
});

describe('formatClockTime', () => {
  it('round-trips a parsed time', () => {
    expect(formatClockTime(parseClockTime('11:59AM'))).toBe('11:59AM');
  });

  it('renders noon and midnight the way the old Time.toString did', () => {
    expect(formatClockTime(12 * 60)).toBe('12:00PM');
    expect(formatClockTime(0)).toBe('12:00AM');
  });

  it('drops the minutes for compact hour-axis labels', () => {
    expect(formatClockTime(13 * 60, false)).toBe('1PM');
  });
});

describe('minutesToDecimalHours', () => {
  it('matches the old Time.getValue used for grid positioning', () => {
    expect(minutesToDecimalHours(9 * 60 + 30)).toBe(9.5);
  });
});

describe('snapToBlockStart', () => {
  it('leaves a time already on :00 alone', () => {
    expect(snapToBlockStart(10 * 60)).toBe(10 * 60);
  });

  it('leaves a time already on :30 alone', () => {
    expect(snapToBlockStart(10 * 60 + 30)).toBe(10 * 60 + 30);
  });

  it('snaps a time between :00 and :30 back to :00', () => {
    expect(snapToBlockStart(10 * 60 + 10)).toBe(10 * 60);
  });

  it('snaps a time between :30 and :60 back to :30', () => {
    expect(snapToBlockStart(10 * 60 + 50)).toBe(10 * 60 + 30);
  });
});

describe('MINUTES_PER_DAY', () => {
  it('is a full day of minutes', () => {
    expect(MINUTES_PER_DAY).toBe(1440);
  });
});
