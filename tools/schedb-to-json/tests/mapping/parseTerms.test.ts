import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTerms } from '../../src/terms.ts';

describe('parseTerms', () => {
  it('reads a single-term label', () => {
    assert.deepEqual(parseTerms('A Term'), ['A']);
  });

  it('reads a paired half-year label', () => {
    assert.deepEqual(parseTerms('C Term, D Term'), ['C', 'D']);
  });

  it('returns terms in calendar order regardless of input order', () => {
    assert.deepEqual(parseTerms('D Term, C Term'), ['C', 'D']);
  });

  it('accepts a bare term letter', () => {
    assert.deepEqual(parseTerms('B'), ['B']);
  });

  it('deduplicates a repeated term', () => {
    assert.deepEqual(parseTerms('A Term, A Term'), ['A']);
  });

  it('returns nothing for an empty label', () => {
    assert.deepEqual(parseTerms(''), []);
  });

  it('rejects a term outside A-D', () => {
    assert.throws(() => parseTerms('E Term'), /Unknown term/);
  });
});
