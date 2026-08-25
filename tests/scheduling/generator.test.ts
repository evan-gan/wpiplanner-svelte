import { describe, expect, it, vi } from 'vitest';
import { ScheduleGenerator, permutationsEqual, streamPermutations } from '$lib/scheduling/generator';
import { allTimesAvailable, noTimesAvailable, section } from '../fixtures/generatorFixtures';
import type { CourseSectionLists } from '$lib/scheduling/types';
import { cellIndex, dayIndexToColumn, minutesToRow } from '$lib/model/timeGrid';

function runToCompletion(courses: CourseSectionLists, options: { chosenTimes?: ReturnType<typeof allTimesAvailable>; maxSolutions?: number } = {}) {
  const generator = new ScheduleGenerator({
    courses,
    chosenTimes: options.chosenTimes ?? allTimesAvailable(),
    maxSolutions: options.maxSolutions ?? 0,
  });
  while (generator.canGenerate()) generator.step();
  return generator;
}

/** The set of schedules, as sorted id strings, so order does not matter. */
function scheduleSet(generator: ScheduleGenerator): string[] {
  return generator.permutations.map((p) => [...p.sectionIds].sort().join('+')).sort();
}

const cs01 = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon,wed,fri']);
const cs02 = section('CS|2102|A02', ['A'], ['1:00PM-1:50PM mon,wed,fri']);
const ma01 = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM mon,wed,fri']);
const ma02 = section('MA|1021|A02', ['A'], ['11:00AM-11:50AM mon,wed,fri']);

describe('ScheduleGenerator with no courses', () => {
  it('has nothing to generate', () => {
    const generator = runToCompletion([]);
    expect(generator.canGenerate()).toBe(false);
    expect(generator.permutations).toEqual([]);
  });
});

describe('ScheduleGenerator with one course', () => {
  it('produces one schedule per section', () => {
    expect(scheduleSet(runToCompletion([[cs01, cs02]]))).toEqual(['CS|2102|A01', 'CS|2102|A02']);
  });
});

describe('ScheduleGenerator with two courses', () => {
  it('produces the full cross product when nothing collides', () => {
    const generator = runToCompletion([
      [cs01, cs02],
      [ma02],
    ]);
    expect(scheduleSet(generator)).toEqual([
      'CS|2102|A01+MA|1021|A02',
      'CS|2102|A02+MA|1021|A02',
    ]);
  });

  it('drops the combination that collides', () => {
    const generator = runToCompletion([
      [cs01, cs02],
      [ma01, ma02],
    ]);
    // CS A01 and MA A01 are both 9:00 MWF, so that one pairing is missing.
    expect(scheduleSet(generator)).toEqual([
      'CS|2102|A01+MA|1021|A02',
      'CS|2102|A02+MA|1021|A01',
      'CS|2102|A02+MA|1021|A02',
    ]);
  });

  it('finds nothing when every combination collides', () => {
    expect(runToCompletion([[cs01], [ma01]]).permutations).toEqual([]);
  });
});

describe('ScheduleGenerator and chosen times', () => {
  it('excludes a section whose time the student blocked out', () => {
    const times = allTimesAvailable();
    times.A[cellIndex(minutesToRow(9 * 60), dayIndexToColumn(1))] = false;

    const generator = runToCompletion([[cs01, cs02]], { chosenTimes: times });
    expect(scheduleSet(generator)).toEqual(['CS|2102|A02']);
  });

  it('finds nothing when the student has blocked out every time', () => {
    expect(runToCompletion([[cs01, cs02]], { chosenTimes: noTimesAvailable() }).permutations).toEqual([]);
  });
});

describe('ScheduleGenerator course ordering', () => {
  it('searches the course with the fewest sections first', () => {
    // The legacy producer sorted ascending by section count so the tree narrows
    // early. The order is observable in the sections list of each permutation.
    const generator = runToCompletion([
      [cs01, cs02],
      [ma02],
    ]);
    expect(generator.courses.map((sections) => sections.length)).toEqual([1, 2]);
    expect(generator.permutations[0].sectionIds[0]).toBe('MA|1021|A02');
  });

  it('ignores a course with no allowed sections left', () => {
    const generator = runToCompletion([[cs01], [], [ma02]]);
    expect(generator.courses).toHaveLength(2);
    expect(scheduleSet(generator)).toEqual(['CS|2102|A01+MA|1021|A02']);
  });
});

describe('ScheduleGenerator stepping', () => {
  it('reports work remaining until the search is exhausted', () => {
    const generator = new ScheduleGenerator({
      courses: [[cs01, cs02], [ma01, ma02]],
      chosenTimes: allTimesAvailable(),
    });

    expect(generator.canGenerate()).toBe(true);
    let steps = 0;
    while (generator.canGenerate() && steps < 1000) {
      generator.step();
      steps++;
    }
    expect(generator.canGenerate()).toBe(false);
    expect(generator.permutations).toHaveLength(3);
  });

  it('run() advances by at most the requested number of steps', () => {
    const generator = new ScheduleGenerator({
      courses: [[cs01, cs02], [ma01, ma02]],
      chosenTimes: allTimesAvailable(),
    });
    expect(generator.run(1)).toBe(1);
    expect(generator.run(1000)).toBeLessThan(1000);
    expect(generator.canGenerate()).toBe(false);
  });

  it('stepping a finished generator is a no-op rather than an error', () => {
    const generator = runToCompletion([[cs01]]);
    expect(() => generator.step()).not.toThrow();
    expect(generator.permutations).toHaveLength(1);
  });
});

describe('ScheduleGenerator with maxSolutions — the conflict resolver path', () => {
  it('finds nothing at maxSolutions 0 when the courses cannot coexist', () => {
    expect(runToCompletion([[cs01], [ma01]]).permutations).toEqual([]);
  });

  it('suggests dropping one of the two colliding courses at maxSolutions 1', () => {
    const generator = runToCompletion([[cs01], [ma01]], { maxSolutions: 1 });
    const titles = generator.permutations.map((p) =>
      p.problems.map((problem) => (problem.kind === 'conflict' ? problem.courseId : '?')).join(),
    );
    expect(generator.permutations.length).toBeGreaterThan(0);
    expect(new Set(titles)).toEqual(new Set(['CS|2102', 'MA|1021']));
  });

  it('suggests re-enabling times when the block is the chosen-times grid', () => {
    const times = allTimesAvailable();
    times.A[cellIndex(minutesToRow(9 * 60), dayIndexToColumn(1))] = false;

    const generator = runToCompletion([[cs01]], { chosenTimes: times, maxSolutions: 1 });
    expect(generator.permutations).toHaveLength(1);

    const problem = generator.permutations[0].problems[0];
    expect(problem.kind).toBe('timeConflict');
    expect(problem.kind === 'timeConflict' && problem.cells.A).toHaveLength(1);
  });

  it('carries the sections of the schedule it would produce alongside the problems', () => {
    const generator = runToCompletion([[cs01], [ma01]], { maxSolutions: 1 });
    for (const permutation of generator.permutations) {
      expect(permutation.sectionIds.length).toBeGreaterThan(0);
    }
  });

  it('produces real schedules with no problems attached at maxSolutions 0', () => {
    const generator = runToCompletion([[cs01, cs02], [ma01, ma02]]);
    expect(generator.permutations.every((p) => p.problems.length === 0)).toBe(true);
  });
});

describe('permutationsEqual', () => {
  it('ignores the order sections were added in', () => {
    expect(
      permutationsEqual(
        { sectionIds: ['a', 'b'], problems: [] },
        { sectionIds: ['b', 'a'], problems: [] },
      ),
    ).toBe(true);
  });

  it('is false when the section sets differ', () => {
    expect(
      permutationsEqual(
        { sectionIds: ['a', 'b'], problems: [] },
        { sectionIds: ['a', 'c'], problems: [] },
      ),
    ).toBe(false);
  });

  it('is false when one carries problems and the other does not', () => {
    expect(
      permutationsEqual(
        { sectionIds: ['a'], problems: [] },
        {
          sectionIds: ['a'],
          problems: [
            {
              kind: 'conflict',
              sectionId: 'a',
              courseId: 'A',
              otherSectionId: 'b',
              otherCourseId: 'B',
            },
          ],
        },
      ),
    ).toBe(false);
  });
});

describe('streamPermutations', () => {
  const many: CourseSectionLists = [
    [section('A|1|S1', ['A'], ['8:00AM-8:50AM mon']), section('A|1|S2', ['A'], ['9:00AM-9:50AM mon'])],
    [section('B|1|S1', ['A'], ['1:00PM-1:50PM tue']), section('B|1|S2', ['A'], ['2:00PM-2:50PM tue'])],
    [section('C|1|S1', ['A'], ['3:00PM-3:50PM wed']), section('C|1|S2', ['A'], ['4:00PM-4:50PM wed'])],
  ];

  it('delivers every schedule exactly once across its batches', () => {
    const generator = new ScheduleGenerator({ courses: many, chosenTimes: allTimesAvailable() });
    const delivered: string[] = [];

    const finished = streamPermutations(generator, {
      stepsPerBatch: 1,
      onBatch: (batch) => delivered.push(...batch.map((p) => [...p.sectionIds].sort().join('+'))),
    });

    expect(finished).toBe(true);
    expect(delivered).toHaveLength(8);
    expect(new Set(delivered).size).toBe(8);
  });

  it('reports the running total alongside each batch', () => {
    const generator = new ScheduleGenerator({ courses: many, chosenTimes: allTimesAvailable() });
    const totals: number[] = [];

    streamPermutations(generator, {
      stepsPerBatch: 1,
      onBatch: (_batch, total) => totals.push(total),
    });

    expect(totals.at(-1)).toBe(8);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  it('stops early and reports not finished when cancelled', () => {
    const generator = new ScheduleGenerator({ courses: many, chosenTimes: allTimesAvailable() });
    let batches = 0;

    const finished = streamPermutations(generator, {
      stepsPerBatch: 1,
      onBatch: () => batches++,
      shouldCancel: () => batches >= 1,
    });

    expect(finished).toBe(false);
    expect(generator.canGenerate()).toBe(true);
  });

  it('finishes immediately when there is nothing to search', () => {
    const generator = new ScheduleGenerator({ courses: [], chosenTimes: allTimesAvailable() });
    const onBatch = vi.fn();

    expect(streamPermutations(generator, { onBatch })).toBe(true);
    expect(onBatch).not.toHaveBeenCalled();
  });
});
