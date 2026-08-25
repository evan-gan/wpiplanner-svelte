import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import type { CourseJson, SchedbFile, SectionJson, TermName } from '$lib/model/schedb';
import { SCHEDB_FORMAT_VERSION } from '$lib/model/schedb';
import { matchEnrollment } from '$lib/workday/matchEnrollment';
import type { EnrolledCourse } from '$lib/workday/enrollment';
import { makePeriod, makeSection } from '../fixtures/miniCatalog';

/**
 * A catalog section built from several meeting labels, the way the real one
 * stores a lecture and its lab: number `AL01/AX01`, one period per label.
 */
function combined(courseId: string, labels: string[], terms: TermName[] = ['A']): SectionJson {
  const number = labels.join('/');
  return makeSection(`${courseId}|${number}`, terms, [], {
    periods: labels.map((label) => makePeriod({ sectionNumber: label })),
  });
}

function course(courseId: string, sections: SectionJson[]): CourseJson {
  return {
    id: courseId,
    number: courseId.split('|')[1],
    name: 'A Course',
    minCredits: 3,
    maxCredits: 3,
    descriptionIndex: 0,
    sections,
  };
}

const CATALOG_FILE: SchedbFile = {
  formatVersion: SCHEDB_FORMAT_VERSION,
  generated: 'test',
  minutesPerBlock: 30,
  descriptions: ['description'],
  departments: [
    {
      abbrev: 'CS',
      name: 'Computer Science',
      courses: [
        course('CS|1102', [
          combined('CS|1102', ['AL01', 'AX01']),
          combined('CS|1102', ['AL01', 'AX02']),
          combined('CS|1102', ['AL02', 'AX03']),
        ]),
        course('CS|1101', [combined('CS|1101', ['A01'])]),
      ],
    },
    {
      abbrev: 'MA',
      name: 'Mathematics',
      courses: [
        course('MA|1023', [
          combined('MA|1023', ['AL01', 'AD02', 'AX03']),
          combined('MA|1023', ['AL01', 'AD02', 'AX04']),
        ]),
      ],
    },
  ],
};

const catalog = new Catalog(CATALOG_FILE);

function enrolled(
  deptAbbrev: string,
  courseNumber: string,
  sectionNumbers: string[],
): EnrolledCourse {
  return { deptAbbrev, courseNumber, title: 'A Course', termText: '2026 Fall A Term', sectionNumbers };
}

describe('matchEnrollment', () => {
  it('matches a lecture and lab pair to the combined catalog section', () => {
    const { matched, unmatched } = matchEnrollment([enrolled('CS', '1102', ['AL01', 'AX01'])], catalog);

    expect(unmatched).toEqual([]);
    expect(matched[0]).toMatchObject({
      courseId: 'CS|1102',
      sectionId: 'CS|1102|AL01/AX01',
      sectionNumber: 'AL01/AX01',
      partial: false,
    });
  });

  it('does not care what order Workday listed the meetings in', () => {
    const { matched } = matchEnrollment([enrolled('CS', '1102', ['AX01', 'AL01'])], catalog);
    expect(matched[0].sectionId).toBe('CS|1102|AL01/AX01');
  });

  it('matches a three-part lecture, discussion, and lab section', () => {
    const { matched } = matchEnrollment(
      [enrolled('MA', '1023', ['AX03', 'AL01', 'AD02'])],
      catalog,
    );
    expect(matched[0].sectionId).toBe('MA|1023|AL01/AD02/AX03');
  });

  it('matches a section that has only one meeting', () => {
    const { matched } = matchEnrollment([enrolled('CS', '1101', ['A01'])], catalog);
    expect(matched[0].sectionId).toBe('CS|1101|A01');
  });

  it('prefers an exact match over a section that merely contains the labels', () => {
    const { matched } = matchEnrollment([enrolled('MA', '1023', ['AL01', 'AD02', 'AX04'])], catalog);
    expect(matched[0].sectionId).toBe('MA|1023|AL01/AD02/AX04');
    expect(matched[0].partial).toBe(false);
  });

  it('matches on a subset when only one section contains the listed labels', () => {
    const { matched } = matchEnrollment([enrolled('CS', '1102', ['AL02'])], catalog);
    expect(matched[0]).toMatchObject({ sectionId: 'CS|1102|AL02/AX03', partial: true });
  });

  it('leaves out a subset that several sections could satisfy', () => {
    const { matched, unmatched } = matchEnrollment([enrolled('CS', '1102', ['AL01'])], catalog);

    expect(matched).toEqual([]);
    expect(unmatched[0].reason).toMatch(/more than one/i);
    expect(unmatched[0].reason).toContain('AL01/AX01');
  });

  it('reports a course the catalog does not have', () => {
    const { unmatched } = matchEnrollment([enrolled('CS', '4999', ['A01'])], catalog);
    expect(unmatched[0].reason).toMatch(/not in the current catalog/i);
  });

  it('reports a section the catalog does not have, and lists the ones it does', () => {
    const { unmatched } = matchEnrollment([enrolled('CS', '1102', ['ZZ99'])], catalog);
    expect(unmatched[0].reason).toMatch(/no section ZZ99/i);
    expect(unmatched[0].reason).toContain('AL01/AX01');
  });

  it('keeps matched and unmatched courses independent of each other', () => {
    const { matched, unmatched } = matchEnrollment(
      [enrolled('CS', '1102', ['AL01', 'AX01']), enrolled('CS', '4999', ['A01'])],
      catalog,
    );

    expect(matched).toHaveLength(1);
    expect(unmatched).toHaveLength(1);
  });
});
