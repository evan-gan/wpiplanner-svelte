import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { CatalogSearch, MAX_SEARCH_RESULTS } from '$lib/model/catalogSearch';
import { makeCatalog, makeCourse, makePeriod, makeSection } from '../fixtures/miniCatalog';

function searchOver(courses: Parameters<typeof makeCatalog>[1]): CatalogSearch {
  return new CatalogSearch(new Catalog(makeCatalog('CS', courses)));
}

function taught(id: string, ...professors: string[]) {
  return makeSection(id, ['A'], professors.map((professor) => makePeriod({ professor })));
}

const SEARCH = searchOver([
  makeCourse('CS', '1102', 'Accelerated Introduction to Program Design', [taught('CS|1102|A01', 'Ada Lovelace')]),
  makeCourse('CS', '2102', 'Object-Oriented Design Concepts', [taught('CS|2102|A01', 'Grace Hopper', 'N/A')]),
  makeCourse('CS', '3733', 'Software Engineering', [taught('CS|3733|A01', 'Ada Lovelace')]),
]);

describe('CatalogSearch — classes', () => {
  it('matches a course code with or without the space', () => {
    expect(SEARCH.search('cs 1102').courses.map((hit) => hit.abbrev)).toEqual(['CS1102']);
    expect(SEARCH.search('CS1102').courses.map((hit) => hit.abbrev)).toEqual(['CS1102']);
  });

  it('matches every word of a title, in any order', () => {
    expect(SEARCH.search('design program').courses.map((hit) => hit.abbrev)).toEqual(['CS1102']);
  });

  it('ranks code matches above title matches', () => {
    const search = searchOver([
      makeCourse('CS', '9000', 'All about 2102', [taught('CS|9000|A01', 'X')]),
      makeCourse('CS', '2102', 'Design', [taught('CS|2102|A01', 'Y')]),
    ]);
    expect(search.search('2102').courses.map((hit) => hit.abbrev)).toEqual(['CS2102', 'CS9000']);
  });

  it('returns nothing for a blank query', () => {
    expect(SEARCH.search('   ')).toEqual({ courses: [], professors: [], totalCourses: 0, totalProfessors: 0 });
  });

  it('caps the list but reports the full count', () => {
    const many = Array.from({ length: MAX_SEARCH_RESULTS + 3 }, (_, index) =>
      makeCourse('CS', String(1000 + index), 'Seminar', [taught(`CS|${1000 + index}|A01`, 'X')]),
    );
    const results = searchOver(many).search('seminar');
    expect(results.courses).toHaveLength(MAX_SEARCH_RESULTS);
    expect(results.totalCourses).toBe(MAX_SEARCH_RESULTS + 3);
  });
});

describe('CatalogSearch — professors', () => {
  it('finds a professor by any part of the name and lists every class they teach', () => {
    const [professor] = SEARCH.search('lovelace').professors;
    expect(professor.name).toBe('Ada Lovelace');
    expect(professor.courses.map((hit) => hit.abbrev)).toEqual(['CS1102', 'CS3733']);
  });

  it('accepts the words of a name in either order', () => {
    expect(SEARCH.search('hopper grace').professors.map((hit) => hit.name)).toEqual(['Grace Hopper']);
  });

  it('never offers placeholder names such as N/A', () => {
    expect(SEARCH.search('n/a').professors).toEqual([]);
  });

  it('never offers "Not Assigned" either', () => {
    const search = searchOver([makeCourse('CS', '1000', 'X', [taught('CS|1000|A01', 'Not Assigned')])]);
    expect(search.search('assigned').professors).toEqual([]);
  });
});
