import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_BITS } from '../../../../src/lib/model/schedb.ts';
import { parseDayLetters, parsePeriods, type PeriodContext } from '../../src/periods.ts';
import { AnomalyLog } from '../../src/report.ts';

const CONTEXT: PeriodContext = {
  type: 'Lecture',
  professor: 'Ada Lovelace',
  sectionNumber: 'A01',
  seats: 25,
  seatsAvailable: 7,
  actualWaitlist: 0,
  maxWaitlist: 10,
};

function parse(sectionDetails: string) {
  const log = new AnomalyLog();
  return { periods: parsePeriods(sectionDetails, CONTEXT, 'CS|2102|A01', log), log };
}

describe('parsePeriods', () => {
  it('reads location, days, and times from one meeting', () => {
    const [period] = parse('Olin Hall 126 | M-T-R-F | 9:00 AM - 9:50 AM').periods;

    assert.equal(period.location, 'Olin Hall 126');
    assert.equal(period.days, DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.thu | DAY_BITS.fri);
    assert.equal(period.startMinutes, 9 * 60);
    assert.equal(period.endMinutes, 9 * 60 + 50);
  });

  it('copies the section\'s seats onto every period', () => {
    const [period] = parse('Olin Hall 126 | M | 9:00 AM - 9:50 AM').periods;

    assert.equal(period.seats, 25);
    assert.equal(period.seatsAvailable, 7);
    assert.equal(period.maxWaitlist, 10);
    assert.equal(period.sectionNumber, 'A01');
  });

  it('splits a course that meets in two places on different days', () => {
    const { periods } = parse(
      'Fuller Labs 320 | W | 1:00 PM - 2:50 PM; Olin Hall 126 | M | 1:00 PM - 1:50 PM',
    );

    assert.equal(periods.length, 2);
    assert.equal(periods[0].days, DAY_BITS.wed);
    assert.equal(periods[1].location, 'Olin Hall 126');
  });

  it('ignores the date range some graduate sections carry as a fourth part', () => {
    const [period] = parse(
      'Stratton Hall 311 | T-F | 12:00 PM - 1:20 PM | 08/20/2026 - 10/09/2026',
    ).periods;

    assert.equal(period.days, DAY_BITS.tue | DAY_BITS.fri);
    assert.equal(period.startMinutes, 12 * 60);
    assert.equal(period.endMinutes, 13 * 60 + 20);
  });

  it('keeps the delivery note of an asynchronous section as its location', () => {
    const { periods, log } = parse('Online-asynchronous |');

    assert.equal(periods.length, 1);
    assert.equal(periods[0].location, 'Online-asynchronous');
    // No days means the search never places it against anything, which is right
    // for a section that never meets.
    assert.equal(periods[0].days, 0);
    assert.equal(log.countByKind()['unknown-days'], undefined);
  });

  it('falls back to a placeholder period when the section lists no meetings', () => {
    const { periods, log } = parse('');

    assert.equal(periods.length, 1);
    assert.equal(periods[0].days, 0);
    assert.equal(periods[0].startMinutes, 12 * 60);
    assert.equal(log.countByKind()['no-meeting-times'], 1);
  });

  it('reads a meeting whose location Workday omitted', () => {
    const { periods, log } = parse('M-T-R-F | 9:00 AM - 9:50 AM');

    assert.equal(periods[0].location, '');
    assert.equal(periods[0].days, DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.thu | DAY_BITS.fri);
    assert.equal(log.countByKind()['empty-location'], 1);
  });

  it('fails loudly on a meeting time it cannot read, rather than guessing', () => {
    assert.throws(
      () => parse('Olin Hall 126 | M | sometime after lunch'),
      /Could not parse the meeting time/,
    );
  });
});

describe('parseDayLetters', () => {
  it('maps Workday\'s letters, with R for Thursday', () => {
    assert.equal(parseDayLetters('M-W-F'), DAY_BITS.mon | DAY_BITS.wed | DAY_BITS.fri);
    assert.equal(parseDayLetters('T-R'), DAY_BITS.tue | DAY_BITS.thu);
  });

  it('is empty for no days', () => {
    assert.equal(parseDayLetters(''), 0);
  });
});
