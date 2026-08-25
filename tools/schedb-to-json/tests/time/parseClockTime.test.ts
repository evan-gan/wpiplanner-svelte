import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatClockTime, parseClockTime } from '../../src/time.ts';

describe('parseClockTime', () => {
  it('converts a morning time to minutes since midnight', () => {
    assert.equal(parseClockTime('9:00AM'), 9 * 60);
  });

  it('converts an afternoon time by adding twelve hours', () => {
    assert.equal(parseClockTime('1:50PM'), 13 * 60 + 50);
  });

  it('keeps noon at twelve rather than shifting it to midnight', () => {
    assert.equal(parseClockTime('12:00PM'), 12 * 60);
  });

  it('maps midnight to zero, which the legacy Java parser got wrong', () => {
    assert.equal(parseClockTime('12:00AM'), 0);
  });

  it('accepts a single-digit hour and surrounding whitespace', () => {
    assert.equal(parseClockTime('  8:05AM '), 8 * 60 + 5);
  });

  it('rejects text that is not a 12-hour clock time', () => {
    assert.throws(() => parseClockTime('13:00'), /Could not parse time/);
  });

  it('rejects an hour outside the 12-hour range', () => {
    assert.throws(() => parseClockTime('13:00PM'), /outside the valid 12-hour clock range/);
  });

  it('rejects minutes above 59', () => {
    assert.throws(() => parseClockTime('9:75AM'), /outside the valid 12-hour clock range/);
  });
});

describe('formatClockTime', () => {
  it('round-trips a morning time', () => {
    assert.equal(formatClockTime(parseClockTime('9:30AM')), '9:30AM');
  });

  it('round-trips noon and midnight', () => {
    assert.equal(formatClockTime(parseClockTime('12:00PM')), '12:00PM');
    assert.equal(formatClockTime(parseClockTime('12:00AM')), '12:00AM');
  });

  it('drops minutes when asked, for compact axis labels', () => {
    assert.equal(formatClockTime(13 * 60, false), '1PM');
  });
});
