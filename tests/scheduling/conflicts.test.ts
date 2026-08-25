import { describe, expect, it } from 'vitest';
import { ConflictIndex, sectionsConflict } from '$lib/scheduling/conflicts';
import { section } from '../fixtures/generatorFixtures';

describe('sectionsConflict', () => {
  it('is true for two sections overlapping on a shared day and term', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon,wed,fri']);
    const b = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(true);
  });

  it('is false when the sections are taught in different terms', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
    const b = section('MA|1021|B01', ['B'], ['9:00AM-9:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(false);
  });

  it('is true when a two-term section overlaps one half of another', () => {
    const a = section('PH|1110|A01', ['A', 'B'], ['9:00AM-9:50AM mon']);
    const b = section('MA|1021|B01', ['B'], ['9:00AM-9:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(true);
  });

  it('is false when the sections never meet on the same day', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon,wed,fri']);
    const b = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM tue,thu']);
    expect(sectionsConflict(a, b)).toBe(false);
  });

  it('is false when the sections are on the same day at different hours', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
    const b = section('MA|1021|A01', ['A'], ['11:00AM-11:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(false);
  });

  it('treats touching times as conflicting, exactly as the legacy comparison did', () => {
    // Legacy: otherStart.compareTo(periodEnd) <= 0 — the bound is inclusive.
    const a = section('CS|2102|A01', ['A'], ['9:00AM-10:00AM mon']);
    const b = section('MA|1021|A01', ['A'], ['10:00AM-11:00AM mon']);
    expect(sectionsConflict(a, b)).toBe(true);
  });

  it('is true when one period completely contains the other', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-12:00PM mon']);
    const b = section('MA|1021|A01', ['A'], ['10:00AM-10:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(true);
  });

  it('never conflicts on a period whose days the export did not supply', () => {
    const a = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM ?']);
    const b = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM mon']);
    expect(sectionsConflict(a, b)).toBe(false);
  });

  it('checks every period pair, not just the first', () => {
    const a = section('CS|2102|A01', ['A'], ['8:00AM-8:50AM mon', '2:00PM-3:50PM thu']);
    const b = section('MA|1021|A01', ['A'], ['11:00AM-11:50AM tue', '3:00PM-3:50PM thu']);
    expect(sectionsConflict(a, b)).toBe(true);
  });
});

describe('ConflictIndex', () => {
  const cs01 = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
  const cs02 = section('CS|2102|A02', ['A'], ['9:00AM-9:50AM mon']);
  const ma01 = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM mon']);
  const ma02 = section('MA|1021|A02', ['A'], ['1:00PM-1:50PM mon']);
  const index = new ConflictIndex([
    [cs01, cs02],
    [ma01, ma02],
  ]);

  it('answers the same question as the pairwise predicate', () => {
    expect(index.hasConflict(cs01.id, ma01.id)).toBe(true);
    expect(index.hasConflict(cs01.id, ma02.id)).toBe(false);
  });

  it('is symmetric', () => {
    expect(index.hasConflict(ma01.id, cs01.id)).toBe(index.hasConflict(cs01.id, ma01.id));
  });

  it('never reports two sections of the same course as conflicting', () => {
    // They overlap in time, but you only ever take one of them, and the legacy
    // ConflictController skipped same-course pairs for the same reason.
    expect(index.hasConflict(cs01.id, cs02.id)).toBe(false);
  });

  it('lists what a section conflicts with, for the section details dialog', () => {
    expect(index.getConflicts(cs01.id)).toEqual(['MA|1021|A01']);
    expect(index.getConflicts(ma02.id)).toEqual([]);
  });

  it('returns an empty list for a section it was never told about', () => {
    expect(index.getConflicts('PH|1110|A01')).toEqual([]);
  });
});
