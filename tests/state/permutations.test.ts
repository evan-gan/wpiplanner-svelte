import { describe, expect, it, vi } from 'vitest';
import {
  COURSE_COLORS,
  PERMUTATION_LIMIT,
  PermutationsState,
  UNCOLORED,
  colorForCourse,
} from '$lib/state/permutations.svelte';
import type { GenerateOptions } from '$lib/scheduling/worker/client';
import type { SchedulePermutation } from '$lib/scheduling/types';
import { allTimesAvailable, section } from '../fixtures/generatorFixtures';

/** A stand-in for the worker client that lets a test push results by hand. */
class ScriptedSource {
  options: GenerateOptions | null = null;
  cancelled = 0;
  terminated = 0;

  generate(options: GenerateOptions): void {
    this.options = options;
  }
  cancel(): void {
    this.cancelled++;
  }
  terminate(): void {
    this.terminated++;
  }

  deliver(...permutations: SchedulePermutation[]): void {
    this.options?.onBatch(permutations, permutations.length);
  }
  finish(completed = true): void {
    this.options?.onDone(0, completed);
  }
  fail(message: string): void {
    this.options?.onError(message);
  }
}

const courses = [[section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon'])]];
const scheduleA = { sectionIds: ['CS|2102|A01'], problems: [] };
const scheduleB = { sectionIds: ['CS|2102|A02'], problems: [] };

function start() {
  const source = new ScriptedSource();
  const state = new PermutationsState(source);
  state.regenerate(courses, courses, allTimesAvailable());
  return { source, state };
}

describe('colorForCourse', () => {
  it('assigns colours by position in the chosen list', () => {
    expect(colorForCourse('B', ['A', 'B'])).toBe(COURSE_COLORS[1]);
  });

  it('leaves the eighteenth course white — the palette only has seventeen', () => {
    const ids = Array.from({ length: 18 }, (_, index) => `C${index}`);
    expect(colorForCourse(ids[16], ids)).toBe(COURSE_COLORS[16]);
    expect(colorForCourse(ids[17], ids)).toBe(UNCOLORED);
  });

  it('leaves a course that is not chosen white', () => {
    expect(colorForCourse('X', ['A'])).toBe(UNCOLORED);
  });
});

describe('running a search', () => {
  it('reports searching until results are done', () => {
    const { source, state } = start();
    expect(state.isSearching).toBe(true);

    source.deliver(scheduleA);
    source.finish();
    expect(state.status).toBe('done');
    expect(state.count).toBe(1);
  });

  it('cancels whatever was running before starting again', () => {
    const { source, state } = start();
    state.regenerate(courses, courses, allTimesAvailable());
    expect(source.cancelled).toBeGreaterThan(0);
  });

  it('finishes immediately when every course has had its sections switched off', () => {
    const source = new ScriptedSource();
    const state = new PermutationsState(source);

    state.regenerate([[], []], [[], []], allTimesAvailable());

    expect(state.status).toBe('done');
    expect(state.foundNothing).toBe(true);
    expect(source.options).toBeNull();
  });

  it('reports having found nothing once a real search comes back empty', () => {
    const { source, state } = start();
    source.finish();
    expect(state.foundNothing).toBe(true);
  });

  it('stays out of the done state when a search was superseded', () => {
    const { source, state } = start();
    source.finish(false);
    expect(state.status).toBe('searching');
  });

  it('surfaces a generator error', () => {
    const { source, state } = start();
    source.fail('worker exploded');
    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('worker exploded');
  });
});

describe('selection', () => {
  it('selects the first schedule so the pane is never blank', () => {
    const { source, state } = start();
    source.deliver(scheduleA, scheduleB);
    expect(state.selected).toEqual(scheduleA);
  });

  it('keeps the schedule the student was reading if it survives a regeneration', () => {
    const { source, state } = start();
    source.deliver(scheduleA, scheduleB);
    state.select(scheduleB);

    state.regenerate(courses, courses, allTimesAvailable());
    const second = new ScriptedSource();
    // Re-deliver through the same state's new pending request.
    source.deliver(scheduleA, scheduleB);

    expect(state.selected).toEqual(scheduleB);
    expect(second.cancelled).toBe(0);
  });

  it('falls back to the first schedule when the previous one is gone', () => {
    const { source, state } = start();
    source.deliver(scheduleA, scheduleB);
    state.select(scheduleB);

    state.regenerate(courses, courses, allTimesAvailable());
    source.deliver(scheduleA);

    expect(state.selected).toEqual(scheduleA);
  });

  it('knows which schedule is on screen regardless of section order', () => {
    const { source, state } = start();
    const wide = { sectionIds: ['a', 'b'], problems: [] };
    source.deliver(wide);
    expect(state.isSelected({ sectionIds: ['b', 'a'], problems: [] })).toBe(true);
  });
});

describe('the 300 schedule cap', () => {
  it('stops the search once the cap is reached', () => {
    const { source, state } = start();
    const many = Array.from({ length: PERMUTATION_LIMIT + 50 }, (_, index) => ({
      sectionIds: [`S${index}`],
      problems: [],
    }));

    source.deliver(...many);

    expect(state.count).toBe(PERMUTATION_LIMIT);
    expect(state.status).toBe('done');
    expect(source.cancelled).toBeGreaterThan(0);
  });

  it('ignores a batch that arrives after the cap', () => {
    const { source, state } = start();
    source.deliver(
      ...Array.from({ length: PERMUTATION_LIMIT }, (_, index) => ({
        sectionIds: [`S${index}`],
        problems: [],
      })),
    );
    source.deliver(scheduleA);
    expect(state.count).toBe(PERMUTATION_LIMIT);
  });
});

describe('lifecycle', () => {
  it('builds a conflict index the section dialog can read', () => {
    const { state } = start();
    expect(state.conflicts).not.toBeNull();
  });

  it('terminates its worker on dispose', () => {
    const { source, state } = start();
    state.dispose();
    expect(source.terminated).toBe(1);
  });
});
