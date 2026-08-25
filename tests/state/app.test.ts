import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { AppState } from '$lib/state/app.svelte';
import { PermutationsState } from '$lib/state/permutations.svelte';
import { createMemoryStorage } from '$lib/state/persistence';
import type { GenerateOptions } from '$lib/scheduling/worker/client';
import { MINI_CATALOG } from '../fixtures/miniCatalog';

/** Runs the real search synchronously so the tests can assert on results. */
class InlineSource {
  generateCount = 0;
  private options: GenerateOptions | null = null;

  generate(options: GenerateOptions): void {
    this.generateCount++;
    this.options = options;
    // Mirrors the worker: the client's synchronous fallback path.
    import('$lib/scheduling/generator').then(({ ScheduleGenerator, streamPermutations }) => {
      const generator = new ScheduleGenerator({
        courses: options.courses,
        chosenTimes: options.chosenTimes,
      });
      streamPermutations(generator, { onBatch: options.onBatch });
      options.onDone(generator.permutations.length, true);
    });
  }
  cancel(): void {}
  terminate(): void {}
  get lastOptions(): GenerateOptions | null {
    return this.options;
  }
}

function makeApp() {
  const catalog = new Catalog(structuredClone(MINI_CATALOG));
  const source = new InlineSource();
  const app = new AppState(catalog, createMemoryStorage(), new PermutationsState(source));
  return { app, source };
}

describe('AppState wiring', () => {
  it('preselects MA on a first visit, as the legacy picker did', () => {
    const { app } = makeApp();
    app.restore();
    expect(app.selectedDepartments).toEqual(['MA']);
  });

  it('remembers the department picker selection', () => {
    const catalog = new Catalog(structuredClone(MINI_CATALOG));
    const storage = createMemoryStorage();

    const first = new AppState(catalog, storage, new PermutationsState(new InlineSource()));
    first.restore();
    first.setSelectedDepartments(['CS', 'PH']);

    const second = new AppState(catalog, storage, new PermutationsState(new InlineSource()));
    second.restore();
    expect(second.selectedDepartments).toEqual(['CS', 'PH']);
  });

  it('restarts the search when a course is added', () => {
    const { app, source } = makeApp();
    const before = source.generateCount;

    app.addCourse('CS|2102');
    expect(source.generateCount).toBeGreaterThan(before);
    expect(source.lastOptions?.courses).toHaveLength(1);
  });

  it('restarts the search when a section is toggled', () => {
    const { app, source } = makeApp();
    app.addCourse('CS|2102');
    const before = source.generateCount;

    app.toggleSection('CS|2102', 'CS|2102|A01');
    expect(source.generateCount).toBe(before + 1);
    expect(source.lastOptions?.courses[0]).toHaveLength(1);
  });

  it('restarts the search when times are blocked out', () => {
    const { app, source } = makeApp();
    app.addCourse('CS|2102');
    const before = source.generateCount;

    app.applyChosenTimesDrag('A', { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(source.generateCount).toBe(before + 1);
  });

  it('widens the visible hours to fit the chosen courses', () => {
    const { app } = makeApp();
    app.addCourse('CS|2102');
    // The fixture has a 9:00AM section, below the 10:00 default floor.
    expect(app.timeRange.startHour).toBe(9);
  });

  it('reports whether the Times and Schedules tabs have anything to show', () => {
    const { app } = makeApp();
    expect(app.hasCourses).toBe(false);
    app.addCourse('CS|2102');
    expect(app.hasCourses).toBe(true);
  });

  it('raises the course-limit warning instead of an alert', () => {
    const { app } = makeApp();
    app.selection.replaceAll(
      Array.from({ length: 18 }, (_, index) => ({ courseId: `FAKE|${index}`, deniedSectionIds: [] })),
    );

    expect(app.addCourse('CS|2102')).toBe('limit-reached');
    expect(app.courseLimitWarning).toBe(true);
  });

  it('clears the warning once a course is removed', () => {
    const { app } = makeApp();
    app.courseLimitWarning = true;
    app.addCourse('CS|2102');
    app.removeCourse('CS|2102');
    expect(app.courseLimitWarning).toBe(false);
  });
});

describe('applying conflict fixes', () => {
  it('switches off every section of the course a conflict blames', () => {
    const { app } = makeApp();
    app.addCourse('CS|2102');
    app.addCourse('MA|1021');

    app.applyProblems([
      {
        kind: 'conflict',
        sectionId: 'MA|1021|A01',
        courseId: 'MA|1021',
        otherSectionId: 'CS|2102|A01',
        otherCourseId: 'CS|2102',
      },
    ]);

    expect(app.selection.allowedSections('MA|1021')).toEqual([]);
  });

  it('re-opens exactly the times a time conflict names', () => {
    const { app } = makeApp();
    app.chosenTimes.setSelected('A', 2, 0, false);

    app.applyProblems([
      {
        kind: 'timeConflict',
        sectionId: 'CS|2102|A01',
        courseId: 'CS|2102',
        cells: { A: [{ row: 2, column: 0, dayIndex: 1, startMinutes: 9 * 60, insideGrid: true }] },
      },
    ]);

    expect(app.chosenTimes.isSelected('A', 2, 0)).toBe(true);
  });
});
