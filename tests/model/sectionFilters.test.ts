import { describe, expect, it } from 'vitest';
import type { CourseJson, SectionJson } from '$lib/model/schedb';
import { buildSectionFilters, UNKNOWN_PROFESSOR } from '$lib/model/sectionFilters';
import { makePeriod, makeSection } from '../fixtures/miniCatalog';

function course(sections: SectionJson[]): CourseJson {
  return {
    id: 'CS|2102',
    number: '2102',
    name: 'Object-Oriented Design Concepts',
    minCredits: 1,
    maxCredits: 1,
    descriptionIndex: 0,
    sections,
  };
}

function taughtBy(sectionId: string, ...professors: string[]): SectionJson {
  return makeSection(
    sectionId,
    ['A'],
    professors.map((professor) => makePeriod({ professor })),
  );
}

function professorGroup(sections: SectionJson[]) {
  return buildSectionFilters(course(sections)).find((group) => group.id === 'professor');
}

describe('buildSectionFilters — professors', () => {
  it('lists each professor once, in the order their first section appears', () => {
    const group = professorGroup([
      taughtBy('CS|2102|A01', 'Ada Lovelace'),
      taughtBy('CS|2102|A02', 'Grace Hopper'),
      taughtBy('CS|2102|A03', 'Ada Lovelace'),
    ]);

    expect(group?.options.map((option) => option.label)).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  it('maps a professor to every section they teach', () => {
    const group = professorGroup([
      taughtBy('CS|2102|A01', 'Ada Lovelace'),
      taughtBy('CS|2102|A02', 'Grace Hopper'),
      taughtBy('CS|2102|A03', 'Ada Lovelace'),
    ]);

    expect(group?.options[0].sectionIds).toEqual(['CS|2102|A01', 'CS|2102|A03']);
    expect(group?.options[1].sectionIds).toEqual(['CS|2102|A02']);
  });

  it('lists a co-taught section under each of its professors', () => {
    const group = professorGroup([
      taughtBy('CS|2102|A01', 'Ada Lovelace', 'Grace Hopper'),
      taughtBy('CS|2102|A02', 'Grace Hopper'),
    ]);

    expect(group?.options[0].sectionIds).toEqual(['CS|2102|A01']);
    expect(group?.options[1].sectionIds).toEqual(['CS|2102|A01', 'CS|2102|A02']);
  });

  it('does not repeat a section whose periods share one professor', () => {
    const group = professorGroup([
      taughtBy('CS|2102|A01', 'Ada Lovelace', 'Ada Lovelace'),
      taughtBy('CS|2102|A02', 'Grace Hopper'),
    ]);

    expect(group?.options[0].sectionIds).toEqual(['CS|2102|A01']);
  });

  it('buckets a section with no professor name under Unknown', () => {
    const group = professorGroup([
      taughtBy('CS|2102|A01', 'Ada Lovelace'),
      taughtBy('CS|2102|A02', '  '),
    ]);

    expect(group?.options.map((option) => option.label)).toEqual([
      'Ada Lovelace',
      UNKNOWN_PROFESSOR,
    ]);
  });
});

describe('buildSectionFilters — groups with nothing to choose', () => {
  it('drops a filter whose sections all share one value', () => {
    const filters = buildSectionFilters(
      course([taughtBy('CS|2102|A01', 'Ada Lovelace'), taughtBy('CS|2102|A02', 'Ada Lovelace')]),
    );

    expect(filters).toEqual([]);
  });

  it('drops every filter for a course with no sections', () => {
    expect(buildSectionFilters(course([]))).toEqual([]);
  });
});
