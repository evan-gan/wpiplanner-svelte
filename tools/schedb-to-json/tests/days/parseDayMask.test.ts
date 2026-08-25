import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_BITS } from '../../../../src/lib/model/schedb.ts';
import { dayMaskToNames, parseDayMask } from '../../src/days.ts';

describe('parseDayMask', () => {
  it('sets one bit for a single day', () => {
    assert.equal(parseDayMask('wed'), DAY_BITS.wed);
  });

  it('combines bits for a comma-separated list', () => {
    assert.equal(parseDayMask('mon,tue,thu,fri'), DAY_BITS.mon | DAY_BITS.tue | DAY_BITS.thu | DAY_BITS.fri);
  });

  it('treats the "?" marker as no known days', () => {
    assert.equal(parseDayMask('?'), 0);
  });

  it('treats an empty value as no known days', () => {
    assert.equal(parseDayMask(''), 0);
  });

  it('tolerates whitespace and casing around day names', () => {
    assert.equal(parseDayMask(' Mon , TUE '), DAY_BITS.mon | DAY_BITS.tue);
  });

  it('rejects an unrecognized day abbreviation', () => {
    assert.throws(() => parseDayMask('mon,funday'), /Unknown day abbreviation/);
  });
});

describe('day mask overlap', () => {
  it('reports an overlap only when two periods share a day', () => {
    const monWedFri = parseDayMask('mon,wed,fri');
    const tueThu = parseDayMask('tue,thu');
    const wedOnly = parseDayMask('wed');

    assert.equal(monWedFri & tueThu, 0, 'MWF and TR must not overlap');
    assert.notEqual(monWedFri & wedOnly, 0, 'MWF and W must overlap');
  });
});

describe('dayMaskToNames', () => {
  it('expands a mask back to Sunday-first short names', () => {
    assert.deepEqual(dayMaskToNames(parseDayMask('fri,mon')), ['mon', 'fri']);
  });

  it('returns nothing for an unknown-days mask', () => {
    assert.deepEqual(dayMaskToNames(0), []);
  });
});
