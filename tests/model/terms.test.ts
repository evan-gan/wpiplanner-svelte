import { describe, expect, it } from 'vitest';
import { TERM_NAMES, formatTermLabel, parseTerms, shareAnyTerm, termIndex } from '$lib/model/terms';

describe('TERM_NAMES', () => {
  it('is in calendar order', () => {
    expect(TERM_NAMES).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('parseTerms', () => {
  it('parses a single term', () => {
    expect(parseTerms('A Term')).toEqual(['A']);
  });

  it('parses a two-term course', () => {
    expect(parseTerms('C Term, D Term')).toEqual(['C', 'D']);
  });

  it('returns terms in calendar order regardless of input order', () => {
    expect(parseTerms('D Term, C Term')).toEqual(['C', 'D']);
  });

  it('accepts the bare letter form the legacy Term.getTermByName also allowed', () => {
    expect(parseTerms('B')).toEqual(['B']);
  });

  it('rejects an unknown term', () => {
    expect(() => parseTerms('E Term')).toThrow(/E Term/);
  });
});

describe('shareAnyTerm', () => {
  it('is true when two sections are taught in the same term', () => {
    expect(shareAnyTerm(['A', 'B'], ['B'])).toBe(true);
  });

  it('is false for sections in different halves of the year', () => {
    expect(shareAnyTerm(['A', 'B'], ['C', 'D'])).toBe(false);
  });
});

describe('formatTermLabel', () => {
  it('renders the header used above each week grid', () => {
    expect(formatTermLabel('A')).toBe('A-Term');
  });
});

describe('termIndex', () => {
  it('gives the calendar position used for thumbnail striping', () => {
    expect(termIndex('A')).toBe(0);
    expect(termIndex('D')).toBe(3);
  });
});
