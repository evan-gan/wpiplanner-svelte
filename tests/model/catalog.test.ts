import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { MINI_CATALOG } from '../fixtures/miniCatalog';

const catalog = new Catalog(MINI_CATALOG);

describe('Catalog lookups', () => {
  it('finds a department by its abbreviation', () => {
    expect(catalog.getDepartment('MA')?.name).toBe('Mathematical Sciences');
  });

  it('finds a course by its id', () => {
    expect(catalog.getCourse('CS|2102')?.name).toBe('Object-Oriented Design Concepts');
  });

  it('finds a section by its id', () => {
    expect(catalog.getSection('MA|1021|A02')?.number).toBe('A02');
  });

  it('returns undefined rather than throwing for an unknown id', () => {
    expect(catalog.getSection('XX|9999|Z99')).toBeUndefined();
  });

  it('walks from a section back to its course and department', () => {
    expect(catalog.getCourseOfSection('PH|1110|A01')?.id).toBe('PH|1110');
    expect(catalog.getDepartmentOfCourse('PH|1110')?.abbrev).toBe('PH');
  });

  it('requires a section that must exist, naming the id when it does not', () => {
    expect(catalog.requireSection('CS|2102|A01').number).toBe('A01');
    expect(() => catalog.requireSection('CS|2102|Z99')).toThrow(/CS\|2102\|Z99/);
  });
});

describe('Catalog display helpers', () => {
  it('builds the course abbreviation the old app printed', () => {
    expect(catalog.courseAbbrev('CS|2102')).toBe('CS2102');
  });

  it('builds the "Name (ABBR)" title from Course.toString', () => {
    expect(catalog.courseTitle('MA|1021')).toBe('Calculus I (MA1021)');
  });

  it('resolves a pooled description index back to its text', () => {
    const course = catalog.getCourse('CS|2102')!;
    expect(catalog.description(course.descriptionIndex)).toMatch(/mini catalog/);
  });

  it('resolves a missing description to the empty string', () => {
    expect(catalog.description(-1)).toBe('');
  });
});

describe('Catalog counts', () => {
  it('totals every level of the tree', () => {
    expect(catalog.counts).toEqual({
      departments: 3,
      courses: 3,
      sections: 5,
      periods: 5,
    });
  });
});

describe('Catalog validation', () => {
  it('rejects a file written by a different format version', () => {
    const wrongVersion = { ...MINI_CATALOG, formatVersion: 99 } as never;
    expect(() => new Catalog(wrongVersion)).toThrow(/formatVersion/);
  });
});
