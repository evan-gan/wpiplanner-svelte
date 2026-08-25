/**
 * Guards on the hand-maintained calendar. These are the mistakes a yearly
 * re-transcription actually makes: a term range typed backwards, two terms
 * overlapping, or a no-class day dated outside every term.
 */
import { describe, expect, it } from 'vitest';
import { ACADEMIC_CALENDAR } from '$lib/config/academicCalendar';
import { TERM_NAMES } from '$lib/model/terms';
import { DAY_BITS } from '$lib/model/schedb';
import { isoDateWeekday } from '$lib/calendar/dates';

const { terms, exceptions, breaks } = ACADEMIC_CALENDAR;

describe('term dates', () => {
  it('covers all four terms in calendar order', () => {
    expect(terms.map((dates) => dates.term)).toEqual([...TERM_NAMES]);
  });

  it('has each term starting before it ends', () => {
    for (const dates of terms) expect(dates.firstDay < dates.lastDay).toBe(true);
  });

  it('never overlaps two terms', () => {
    for (let index = 1; index < terms.length; index++) {
      expect(terms[index - 1].lastDay < terms[index].firstDay).toBe(true);
    }
  });

  it('starts and ends every term on a weekday', () => {
    for (const dates of terms) {
      for (const date of [dates.firstDay, dates.lastDay]) {
        expect(isoDateWeekday(date)).toBeGreaterThanOrEqual(1);
        expect(isoDateWeekday(date)).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('exceptions', () => {
  it('places every exception inside a term, or it would cancel nothing', () => {
    for (const exception of exceptions) {
      const term = terms.find(
        (dates) => dates.firstDay <= exception.date && exception.date <= dates.lastDay,
      );
      expect(term, `${exception.date} (${exception.reason}) falls outside every term`).toBeDefined();
    }
  });

  it('names a real weekday wherever a day follows another schedule', () => {
    for (const exception of exceptions) {
      if (exception.followsDay === null) continue;
      expect(DAY_BITS[exception.followsDay]).toBeDefined();
    }
  });

  it('lists each date at most once', () => {
    const dates = exceptions.map((exception) => exception.date);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('breaks', () => {
  it('has each break starting before it ends', () => {
    for (const academicBreak of breaks) {
      expect(academicBreak.firstDay <= academicBreak.lastDay).toBe(true);
    }
  });

  it('cancels Thanksgiving inside B-Term rather than between terms', () => {
    const thanksgiving = breaks.find((entry) => entry.name.includes('Thanksgiving'));
    const bTerm = terms.find((dates) => dates.term === 'B');
    expect(thanksgiving).toBeDefined();
    expect(bTerm!.firstDay <= thanksgiving!.firstDay).toBe(true);
    expect(thanksgiving!.lastDay <= bTerm!.lastDay).toBe(true);
  });
});
