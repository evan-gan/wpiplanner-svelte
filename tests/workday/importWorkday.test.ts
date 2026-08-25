/**
 * The Workday import end to end: exported workbook -> catalog sections -> the
 * courses and denied sections the schedule search runs on.
 */
import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { AppState } from '$lib/state/app.svelte';
import { PermutationsState } from '$lib/state/permutations.svelte';
import { createMemoryStorage } from '$lib/state/persistence';
import type { GenerateOptions } from '$lib/scheduling/worker/client';
import { readWorkdayExport } from '$lib/workday';
import { MINI_CATALOG } from '../fixtures/miniCatalog';
import { buildXlsx } from '../fixtures/xlsxBuilder';
import { WORKDAY_HEADER_ROWS, workdayRow } from '../fixtures/workdayExport';

/** Records that the search was restarted without actually running it. */
class RecordingSource {
  generateCount = 0;
  lastOptions: GenerateOptions | null = null;

  generate(options: GenerateOptions): void {
    this.generateCount++;
    this.lastOptions = options;
  }
  cancel(): void {}
  terminate(): void {}
}

function makeApp() {
  const catalog = new Catalog(structuredClone(MINI_CATALOG));
  const source = new RecordingSource();
  const app = new AppState(catalog, createMemoryStorage(), new PermutationsState(source));
  return { app, catalog, source };
}

/** An export naming two courses that exist in the mini catalog. */
function miniCatalogExport() {
  return buildXlsx([
    ...WORKDAY_HEADER_ROWS,
    workdayRow({
      courseListing: 'CS 2102 - Object-Oriented Design Concepts',
      section: 'CS 2102-A01 - Object-Oriented Design Concepts',
      termText: '2026 Fall A Term',
    }),
    workdayRow({
      courseListing: 'MA 1021 - Calculus I',
      section: 'MA 1021-A02 - Calculus I',
      termText: '2026 Fall A Term',
    }),
  ]);
}

describe('readWorkdayExport', () => {
  it('resolves an exported workbook to catalog section ids', async () => {
    const { catalog } = makeApp();
    const { matched, unmatched } = await readWorkdayExport(await miniCatalogExport(), catalog);

    expect(unmatched).toEqual([]);
    expect(matched.map((course) => course.sectionId)).toEqual(['CS|2102|A01', 'MA|1021|A02']);
  });
});

describe('AppState.importEnrolledSections', () => {
  it('chooses each imported course and switches every other section off', async () => {
    const { app, catalog } = makeApp();
    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);

    app.importEnrolledSections(matched);

    expect(app.selection.courseIds).toEqual(['CS|2102', 'MA|1021']);
    expect(app.selection.allowedSections('CS|2102').map((section) => section.id)).toEqual([
      'CS|2102|A01',
    ]);
    expect(app.selection.allowedSections('MA|1021').map((section) => section.id)).toEqual([
      'MA|1021|A02',
    ]);
  });

  it('leaves the search exactly one combination to find', async () => {
    const { app, catalog, source } = makeApp();
    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);

    app.importEnrolledSections(matched);

    expect(source.lastOptions?.courses.map((sections) => sections.length)).toEqual([1, 1]);
  });

  it('restarts the search once, not once per course', async () => {
    const { app, catalog, source } = makeApp();
    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);

    const before = source.generateCount;
    app.importEnrolledSections(matched);
    expect(source.generateCount).toBe(before + 1);
  });

  it('replaces whatever was chosen before', async () => {
    const { app, catalog } = makeApp();
    app.addCourse('PH|1110');

    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);
    app.importEnrolledSections(matched);

    expect(app.selection.courseIds).not.toContain('PH|1110');
  });

  it('survives a reload, because the import is persisted like any other choice', async () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const storage = createMemoryStorage();

    const first = new AppState(catalog, storage, new PermutationsState(new RecordingSource()));
    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);
    first.importEnrolledSections(matched);

    const second = new AppState(catalog, storage, new PermutationsState(new RecordingSource()));
    second.restore();

    expect(second.selection.courseIds).toEqual(['CS|2102', 'MA|1021']);
    expect(second.selection.allowedSections('CS|2102').map((section) => section.id)).toEqual([
      'CS|2102|A01',
    ]);
  });

  it('reports how many courses it kept', async () => {
    const { app, catalog } = makeApp();
    const { matched } = await readWorkdayExport(await miniCatalogExport(), catalog);

    expect(app.importEnrolledSections(matched)).toBe(2);
  });

  it('imports an empty match as an empty selection rather than throwing', () => {
    const { app } = makeApp();
    expect(app.importEnrolledSections([])).toBe(0);
    expect(app.selection.courseIds).toEqual([]);
  });
});
