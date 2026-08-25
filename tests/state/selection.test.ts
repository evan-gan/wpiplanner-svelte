import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { MAX_COURSES, SelectionState } from '$lib/state/selection.svelte';
import { createMemoryStorage } from '$lib/state/persistence';
import { MINI_CATALOG } from '../fixtures/miniCatalog';

function makeSelection() {
  const catalog = new Catalog(structuredClone(MINI_CATALOG));
  return { catalog, storage: createMemoryStorage(), selection: new SelectionState(catalog, createMemoryStorage()) };
}

describe('adding and removing courses', () => {
  it('adds a course', () => {
    const { selection } = makeSelection();
    expect(selection.addCourse('CS|2102')).toBe('added');
    expect(selection.courseIds).toEqual(['CS|2102']);
  });

  it('refuses to add the same course twice', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    expect(selection.addCourse('CS|2102')).toBe('already-added');
    expect(selection.courses).toHaveLength(1);
  });

  it('removes a course', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    selection.removeCourse('CS|2102');
    expect(selection.courses).toEqual([]);
  });

  it('keeps courses in the order they were added, which decides their colour', () => {
    const { selection } = makeSelection();
    selection.addCourse('MA|1021');
    selection.addCourse('CS|2102');
    expect(selection.courseIds).toEqual(['MA|1021', 'CS|2102']);
  });

  it('stops at the 18-course limit the colour palette imposes', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const selection = new SelectionState(catalog, createMemoryStorage());

    // Only three real courses exist in the fixture, so drive the limit directly.
    selection.replaceAll(
      Array.from({ length: MAX_COURSES }, (_, index) => ({
        courseId: `FAKE|${index}`,
        deniedSectionIds: [],
      })),
    );

    expect(selection.isFull).toBe(true);
    expect(selection.addCourse('CS|2102')).toBe('limit-reached');
  });
});

describe('denying sections', () => {
  it('switches a section off and back on', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');

    selection.setSectionDenied('CS|2102', 'CS|2102|A01', true);
    expect(selection.isSectionDenied('CS|2102', 'CS|2102|A01')).toBe(true);

    selection.setSectionDenied('CS|2102', 'CS|2102|A01', false);
    expect(selection.isSectionDenied('CS|2102', 'CS|2102|A01')).toBe(false);
  });

  it('does not record a section twice when denied repeatedly', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    selection.setSectionDenied('CS|2102', 'CS|2102|A01', true);
    selection.setSectionDenied('CS|2102', 'CS|2102|A01', true);
    expect(selection.deniedSectionIds('CS|2102')).toEqual(['CS|2102|A01']);
  });

  it('leaves only the allowed sections in the search input', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    selection.setSectionDenied('CS|2102', 'CS|2102|A01', true);

    expect(selection.allowedSections('CS|2102').map((s) => s.id)).toEqual(['CS|2102|A02']);
    expect(selection.generatorCourses()[0].map((s) => s.id)).toEqual(['CS|2102|A02']);
  });

  it('switches off sections with no seats when the course is added', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const closed = catalog.requireSection('CS|2102|A01');
    closed.periods[0].seatsAvailable = 0;

    const selection = new SelectionState(catalog, createMemoryStorage());
    selection.addCourse('CS|2102');

    expect(selection.deniedSectionIds('CS|2102')).toEqual(['CS|2102|A01']);
  });

  it('denies every section of a course when a conflict fix says to', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    selection.denyCourse('CS|2102');
    expect(selection.allowedSections('CS|2102')).toEqual([]);
  });
});

describe('denying terms', () => {
  it('switches off every section taught in that term', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');

    selection.setTermDenied('CS|2102', 'A', true);
    expect(selection.isTermDenied('CS|2102', 'A')).toBe(true);
    expect(selection.allowedSections('CS|2102')).toEqual([]);
  });

  it('switches the term back on, including sections with no seats', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    catalog.requireSection('CS|2102|A01').periods[0].seatsAvailable = 0;

    const selection = new SelectionState(catalog, createMemoryStorage());
    selection.addCourse('CS|2102');
    expect(selection.deniedSectionIds('CS|2102')).toEqual(['CS|2102|A01']);

    selection.setTermDenied('CS|2102', 'A', false);
    expect(selection.allowedSections('CS|2102')).toHaveLength(2);
  });

  it('touches both halves of a two-term section', () => {
    const { selection } = makeSelection();
    selection.addCourse('PH|1110');

    selection.setTermDenied('PH|1110', 'B', true);
    // The section spans A and B, so denying B removes it from A as well.
    expect(selection.isTermDenied('PH|1110', 'A')).toBe(true);
  });

  it('reports a term the course is not taught in as denied', () => {
    const { selection } = makeSelection();
    selection.addCourse('CS|2102');
    expect(selection.isTermDenied('CS|2102', 'D')).toBe(true);
  });
});

describe('persistence', () => {
  it('restores a saved selection', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const storage = createMemoryStorage();

    const first = new SelectionState(catalog, storage);
    first.addCourse('CS|2102');
    first.setSectionDenied('CS|2102', 'CS|2102|A02', true);

    const second = new SelectionState(catalog, storage);
    second.restore();

    expect(second.courseIds).toEqual(['CS|2102']);
    expect(second.deniedSectionIds('CS|2102')).toEqual(['CS|2102|A02']);
  });

  it('drops a saved course the catalog no longer has', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const storage = createMemoryStorage();

    const first = new SelectionState(catalog, storage);
    first.replaceAll([{ courseId: 'GONE|9999', deniedSectionIds: [] }]);

    const second = new SelectionState(catalog, storage);
    second.restore();
    expect(second.courses).toEqual([]);
  });

  it('drops a denied section id that does not belong to its course', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const storage = createMemoryStorage();

    const first = new SelectionState(catalog, storage);
    first.replaceAll([{ courseId: 'CS|2102', deniedSectionIds: ['MA|1021|A01'] }]);

    const second = new SelectionState(catalog, storage);
    second.restore();
    expect(second.deniedSectionIds('CS|2102')).toEqual([]);
  });
});
