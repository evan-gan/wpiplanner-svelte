/**
 * PLAN.md §7.1 — the highest-value test in the suite.
 *
 * The ported depth-first search and the brute-force oracle must agree on the
 * exact *set* of schedules for randomly generated course sets. The DFS prunes
 * aggressively and carries a hand-rolled stack; the oracle does neither. Any
 * divergence is a bug in the port.
 */
import { describe, expect, it } from 'vitest';
import { TERM_NAMES } from '$lib/model/terms';
import { GRID_CELL_COUNT } from '$lib/model/timeGrid';
import { ScheduleGenerator } from '$lib/scheduling/generator';
import { generateReferenceSchedules } from '$lib/scheduling/referenceGenerator';
import type { ChosenTimes, CourseSectionLists, GeneratorSection } from '$lib/scheduling/types';
import { allTimesAvailable } from '../fixtures/generatorFixtures';

/** Deterministic PRNG so a failure can be replayed from its seed. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

const DAY_MASKS = [0b0010101, 0b0010100, 0b0101000, 0b0000010, 0b0001000, 0];
const TERM_SETS: (typeof TERM_NAMES)[number][][] = [
  ['A'],
  ['B'],
  ['C'],
  ['D'],
  ['A', 'B'],
  ['C', 'D'],
];

function randomCourseSet(random: () => number): CourseSectionLists {
  const courseCount = 2 + Math.floor(random() * 4); // 2..5 courses
  const courses: CourseSectionLists = [];

  for (let courseIndex = 0; courseIndex < courseCount; courseIndex++) {
    const sectionCount = 2 + Math.floor(random() * 3); // 2..4 sections
    const courseId = `D${courseIndex}|1000`;
    const sections: GeneratorSection[] = [];

    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
      const periodCount = 1 + Math.floor(random() * 2);
      const terms = TERM_SETS[Math.floor(random() * TERM_SETS.length)];
      const periods = [];

      for (let periodIndex = 0; periodIndex < periodCount; periodIndex++) {
        // 8:00AM..5:00PM starts, on the half hour, 50 or 110 minutes long.
        const startMinutes = 8 * 60 + Math.floor(random() * 18) * 30;
        const length = random() < 0.75 ? 50 : 110;
        periods.push({
          days: DAY_MASKS[Math.floor(random() * DAY_MASKS.length)],
          startMinutes,
          endMinutes: startMinutes + length,
        });
      }

      sections.push({ id: `${courseId}|S${sectionIndex}`, courseId, terms, periods });
    }
    courses.push(sections);
  }

  return courses;
}

/** Blocks out a random scattering of cells so the Times path is exercised too. */
function randomChosenTimes(random: () => number): ChosenTimes {
  const times = allTimesAvailable();
  for (const term of TERM_NAMES) {
    for (let cell = 0; cell < GRID_CELL_COUNT; cell++) {
      if (random() < 0.08) times[term][cell] = false;
    }
  }
  return times;
}

function normalize(schedules: string[][]): string[] {
  return schedules.map((ids) => [...ids].sort().join('+')).sort();
}

function runGenerator(courses: CourseSectionLists, chosenTimes: ChosenTimes): string[] {
  const generator = new ScheduleGenerator({ courses, chosenTimes });
  generator.runToCompletion();
  return normalize(generator.permutations.map((permutation) => permutation.sectionIds));
}

describe('the ported search against the brute-force oracle', () => {
  it('agrees on 500 random course sets with an unrestricted week', () => {
    const random = makeRandom(0x5eed);
    const chosenTimes = allTimesAvailable();

    for (let iteration = 0; iteration < 500; iteration++) {
      const courses = randomCourseSet(random);
      const expected = normalize(generateReferenceSchedules(courses, chosenTimes));

      expect(runGenerator(courses, chosenTimes), `iteration ${iteration}`).toEqual(expected);
    }
  });

  it('agrees on 500 random course sets with random times blocked out', () => {
    const random = makeRandom(0xc0ffee);

    for (let iteration = 0; iteration < 500; iteration++) {
      const courses = randomCourseSet(random);
      const chosenTimes = randomChosenTimes(random);
      const expected = normalize(generateReferenceSchedules(courses, chosenTimes));

      expect(runGenerator(courses, chosenTimes), `iteration ${iteration}`).toEqual(expected);
    }
  });

  it('finds at least one non-trivial and one empty result across the sweep', () => {
    // Guards against the sweep silently degenerating into all-empty cases,
    // which would make the agreement above meaningless.
    const random = makeRandom(0x1234);
    let withSchedules = 0;
    let withoutSchedules = 0;

    for (let iteration = 0; iteration < 200; iteration++) {
      const courses = randomCourseSet(random);
      const chosenTimes = randomChosenTimes(random);
      const count = runGenerator(courses, chosenTimes).length;
      if (count > 0) withSchedules++;
      else withoutSchedules++;
    }

    expect(withSchedules).toBeGreaterThan(0);
    expect(withoutSchedules).toBeGreaterThan(0);
  });
});
