import { describe, expect, it } from 'vitest';
import {
  compareScores,
  findFixes,
  type ChangeCost,
  type FixCandidate,
  type FixCourse,
  type FixScore,
} from '$lib/scheduling/fixFinder';
import { sectionsConflict } from '$lib/scheduling/conflicts';
import { hasTimeConflicts } from '$lib/scheduling/timeConflicts';
import { cellIndex, dayIndexToColumn, minutesToRow } from '$lib/model/timeGrid';
import { parseClockTime } from '$lib/model/time';
import type { ChosenTimes } from '$lib/scheduling/types';
import { allTimesAvailable, section } from '../../fixtures/generatorFixtures';

const NO_COST: ChangeCost = { moved: false, newProf: false, termMove: false, timeShift: 0, unchecked: false };

/** A candidate section; any cost other than "the section on screen" must be spelled out. */
function candidate(id: string, spec: string, cost: Partial<ChangeCost> = {}, terms: ('A' | 'B')[] = ['A']): FixCandidate {
  return { section: section(id, terms, [spec]), cost: { ...NO_COST, ...cost } };
}

function course(courseId: string, ...candidates: FixCandidate[]): FixCourse {
  return { courseId, candidates };
}

const MOVED = { moved: true, timeShift: 60 };

function blockCell(times: ChosenTimes, clock: string, dayIndex: number): ChosenTimes {
  times.A[cellIndex(minutesToRow(parseClockTime(clock)), dayIndexToColumn(dayIndex))] = false;
  return times;
}

describe('findFixes', () => {
  it('moves the one course that clashes, keeping its prof and term (tier 1)', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|AL03', '1:00PM-1:50PM tue', MOVED),
        ),
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.reason).toBeNull();
    expect(result.fixes[0].sectionIds).toEqual(['PH|1110|AL02', 'CS|1102|AL03']);
    expect(result.fixes[0].score).toMatchObject({ tier: 1, coursesMoved: 1 });
  });

  it('ranks keeping every prof above moving fewer courses with a new prof', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|AL04', '9:00AM-9:50AM mon', { ...MOVED, newProf: true }),
          candidate('CS|1102|AL03', '11:00AM-11:50AM wed', MOVED),
        ),
        course(
          'MA|1021',
          candidate('MA|1021|A01', '11:00AM-11:50AM wed'),
          candidate('MA|1021|A04', '2:00PM-2:50PM wed', MOVED),
        ),
      ],
      chosenTimes: allTimesAvailable(),
    });

    // A second tier-2 fix (new prof *and* MA1021 moving) is kept too, after these.
    expect(result.fixes.slice(0, 2).map((fix) => [fix.score.tier, fix.score.coursesMoved])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it('follows a cascade: a course moves to make room for the one that had to move', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|AL03', '1:00PM-1:50PM wed', MOVED),
        ),
        course(
          'MA|1021',
          candidate('MA|1021|A01', '1:00PM-1:50PM wed'),
          candidate('MA|1021|A04', '3:00PM-3:50PM wed', MOVED),
        ),
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.fixes[0].sectionIds.sort()).toEqual(['CS|1102|AL03', 'MA|1021|A04', 'PH|1110|AL02']);
  });

  it('puts a term move below a new prof', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|BL01', '10:00AM-10:50AM tue', { moved: true, termMove: true }, ['B']),
          candidate('CS|1102|AL04', '9:00AM-9:50AM mon', { ...MOVED, newProf: true }),
        ),
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.fixes.map((fix) => fix.score.tier)).toEqual([2, 3]);
  });

  it('may use a switched-off section, and counts it', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|AL03', '1:00PM-1:50PM tue', { ...MOVED, unchecked: true }),
        ),
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.fixes[0].score.unchecked).toBe(1);
  });

  it('never uses a section in a blocked time', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course(
          'CS|1102',
          candidate('CS|1102|AL01', '10:00AM-10:50AM tue'),
          candidate('CS|1102|AL03', '1:00PM-1:50PM tue', MOVED),
          candidate('CS|1102|AL05', '3:00PM-3:50PM tue', { ...MOVED, timeShift: 300 }),
        ),
      ],
      chosenTimes: blockCell(allTimesAvailable(), '1:00PM', 2),
    });

    expect(result.fixes.map((fix) => fix.sectionIds[1])).toEqual(['CS|1102|AL05']);
  });

  it('says so when the pick itself is in a blocked time', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [],
      chosenTimes: blockCell(allTimesAvailable(), '10:00AM', 2),
    });

    expect(result).toEqual({ fixes: [], complete: true, reason: { kind: 'blocked-by-times' } });
  });

  it('names a course whose every section clashes with the pick', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [course('CS|1102', candidate('CS|1102|AL01', '10:00AM-10:50AM tue'))],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.reason).toEqual({ kind: 'clashes-with-course', courseId: 'CS|1102' });
  });

  it('reports no combination when only the courses together cannot fit', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course('CS|1102', candidate('CS|1102|AL01', '10:00AM-10:50AM tue'), candidate('CS|1102|AL03', '1:00PM-1:50PM tue', MOVED)),
        course('MA|1021', candidate('MA|1021|A01', '1:00PM-1:50PM tue')),
      ],
      chosenTimes: allTimesAvailable(),
    });

    expect(result.reason).toEqual({ kind: 'no-combination' });
  });

  it('reports a time-out, not "no combination", when the clock runs out first', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course('CS|1102', candidate('CS|1102|AL01', '10:00AM-10:50AM tue'), candidate('CS|1102|AL03', '1:00PM-1:50PM tue', MOVED)),
      ],
      chosenTimes: allTimesAvailable(),
      maxMillis: 0,
    });

    expect(result).toEqual({ fixes: [], complete: false, reason: { kind: 'timed-out' } });
  });

  it('still names an impossible course when it runs out of time', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [course('CS|1102', candidate('CS|1102|AL01', '10:00AM-10:50AM tue'))],
      chosenTimes: allTimesAvailable(),
      maxMillis: 0,
    });

    expect(result.reason).toEqual({ kind: 'clashes-with-course', courseId: 'CS|1102' });
  });

  it('stops at its step budget and says the answer may not be the best', () => {
    const result = findFixes({
      pinnedCourse: course('PH|1110', candidate('PH|1110|AL02', '10:00AM-10:50AM tue')),
      otherCourses: [
        course('CS|1102', candidate('CS|1102|AL01', '10:00AM-10:50AM tue'), candidate('CS|1102|AL03', '1:00PM-1:50PM tue', MOVED)),
      ],
      chosenTimes: allTimesAvailable(),
      // The pick, then one more node would finish it; one step cannot.
      maxSteps: 1,
    });

    expect(result.complete).toBe(false);
  });
});

/** Seeded so a failure reproduces. */
function randomSource(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOTS = ['9:00AM-9:50AM', '10:00AM-10:50AM', '11:00AM-11:50AM'];
const DAYS = ['mon', 'tue'];

function randomCourse(random: () => number, courseIndex: number): FixCourse {
  const count = 1 + Math.floor(random() * 4);
  const candidates = Array.from({ length: count }, (_, sectionIndex) => {
    const spec = `${SLOTS[Math.floor(random() * SLOTS.length)]} ${DAYS[Math.floor(random() * DAYS.length)]}`;
    // The first candidate stands for the section on screen, so it costs nothing.
    const cost: Partial<ChangeCost> =
      sectionIndex === 0
        ? {}
        : {
            moved: true,
            newProf: random() < 0.3,
            termMove: random() < 0.2,
            timeShift: Math.floor(random() * 120),
            unchecked: random() < 0.3,
          };
    return candidate(`C${courseIndex}|1|S${sectionIndex}`, spec, cost);
  });
  return course(`C${courseIndex}|1`, ...candidates);
}

/** Every valid schedule, scored the slow way. */
function bruteForceScores(pinned: FixCourse, others: FixCourse[]): FixScore[] {
  const levels = [pinned, ...others].map((fixCourse) =>
    fixCourse.candidates.filter((option) => !hasTimeConflicts(option.section, allTimesAvailable())),
  );
  const scores: FixScore[] = [];

  function walk(level: number, picked: FixCandidate[]): void {
    if (level === levels.length) {
      const sum = (key: 'newProf' | 'termMove' | 'moved' | 'unchecked') =>
        picked.filter((option) => option.cost[key]).length;
      const newProfs = sum('newProf');
      const termMoves = sum('termMove');
      scores.push({
        tier: (1 + (newProfs > 0 ? 1 : 0) + (termMoves > 0 ? 2 : 0)) as FixScore['tier'],
        newProfs,
        termMoves,
        coursesMoved: sum('moved'),
        timeShift: picked.reduce((total, option) => total + option.cost.timeShift, 0),
        unchecked: sum('unchecked'),
      });
      return;
    }
    for (const option of levels[level]) {
      if (picked.some((other) => sectionsConflict(other.section, option.section))) continue;
      walk(level + 1, [...picked, option]);
    }
  }

  walk(0, []);
  return scores;
}

/** The top `perTier` scores of each tier, best first — what findFixes must return. */
function expectedTopScores(scores: FixScore[], perTier: number): FixScore[] {
  return ([1, 2, 3, 4] as const).flatMap((tier) =>
    scores
      .filter((score) => score.tier === tier)
      .sort(compareScores)
      .slice(0, perTier),
  );
}

describe('findFixes against brute force', () => {
  it('keeps the same best scores per tier over 300 random problems', () => {
    const random = randomSource(42);
    for (let trial = 0; trial < 300; trial++) {
      const pinned = course('P|1', candidate('P|1|S0', `${SLOTS[trial % 3]} mon`), candidate('P|1|S1', `${SLOTS[(trial + 1) % 3]} tue`, { timeShift: 30 }));
      const others = Array.from({ length: 1 + Math.floor(random() * 3) }, (_, index) => randomCourse(random, index));

      const result = findFixes({ pinnedCourse: pinned, otherCourses: others, chosenTimes: allTimesAvailable() });
      const expected = expectedTopScores(bruteForceScores(pinned, others), 3);

      expect(result.fixes.map((fix) => fix.score), `trial ${trial}`).toEqual(expected);
    }
  });
});
