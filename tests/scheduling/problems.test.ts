import { describe, expect, it } from 'vitest';
import type { Problem } from '$lib/scheduling/types';
import {
  applyProblem,
  conflictProblem,
  problemDescription,
  problemListsEqual,
  problemTitle,
  problemsEqual,
  timeConflictProblem,
} from '$lib/scheduling/problems';
import { section } from '../fixtures/generatorFixtures';

const naming = {
  courseTitle: (courseId: string) => `Title of ${courseId}`,
  courseAbbrev: (courseId: string) => courseId.replace('|', ''),
};

const cs01 = section('CS|2102|A01', ['A'], ['9:00AM-9:50AM mon']);
const ma01 = section('MA|1021|A01', ['A'], ['9:00AM-9:50AM mon']);
const ma02 = section('MA|1021|A02', ['A'], ['9:00AM-9:50AM mon']);

describe('problemsEqual for section conflicts', () => {
  it('compares by course, not by section — the legacy ConflictProblem.equals', () => {
    // Disabling MA1021 to fit CS2102 is the same advice regardless of which
    // MA1021 section happened to be on the stack.
    expect(problemsEqual(conflictProblem(ma01, cs01), conflictProblem(ma02, cs01))).toBe(true);
  });

  it('distinguishes the two directions of the same collision', () => {
    expect(problemsEqual(conflictProblem(ma01, cs01), conflictProblem(cs01, ma01))).toBe(false);
  });

  it('distinguishes problems about different courses', () => {
    const other = section('PH|1110|A01', ['A'], ['9:00AM-9:50AM mon']);
    expect(problemsEqual(conflictProblem(ma01, cs01), conflictProblem(other, cs01))).toBe(false);
  });
});

describe('problemsEqual for time conflicts', () => {
  it('treats two separately raised time conflicts as distinct', () => {
    // The legacy TimeConflictProblem never overrode equals, so identity decided.
    // The de-duplication in the search depends on that.
    const cells = { A: [] };
    expect(problemsEqual(timeConflictProblem(cs01, cells), timeConflictProblem(cs01, cells))).toBe(
      false,
    );
  });

  it('treats a problem as equal to itself', () => {
    const problem = timeConflictProblem(cs01, { A: [] });
    expect(problemsEqual(problem, problem)).toBe(true);
  });

  it('is never equal to a section conflict', () => {
    expect(problemsEqual(timeConflictProblem(cs01, { A: [] }), conflictProblem(ma01, cs01))).toBe(
      false,
    );
  });
});

describe('problemListsEqual', () => {
  it('compares element by element, in order', () => {
    const a = [conflictProblem(ma01, cs01)];
    const b = [conflictProblem(ma02, cs01)];
    expect(problemListsEqual(a, b)).toBe(true);
  });

  it('is false for lists of different lengths', () => {
    expect(problemListsEqual([conflictProblem(ma01, cs01)], [])).toBe(false);
  });

  it('is true for two empty lists, which is the normal case', () => {
    expect(problemListsEqual([], [])).toBe(true);
  });
});

describe('problem text', () => {
  it('titles a section conflict as an instruction to disable a course', () => {
    expect(problemTitle(conflictProblem(ma01, cs01), naming)).toBe('Disable Title of MA|1021');
  });

  it('describes which two courses collide', () => {
    expect(problemDescription(conflictProblem(ma01, cs01), naming)).toEqual([
      'Title of MA|1021 is conflicting with Title of CS|2102',
    ]);
  });

  it('titles a time conflict with the department, course and section', () => {
    const problem = timeConflictProblem(cs01, { A: [] });
    expect(problemTitle(problem, naming)).toBe(
      'Your chosen times conflict with CS2102: Section A01',
    );
  });

  it('lists the times to re-enable, one line per term', () => {
    const problem = timeConflictProblem(cs01, {
      A: [{ row: 2, column: 0, dayIndex: 1, startMinutes: 9 * 60, insideGrid: true }],
    });
    expect(problemDescription(problem, naming)).toEqual([
      'Re-enable the following times to allow this section:',
      'A-Term: Monday@9:00AM',
    ]);
  });
});

describe('applyProblem', () => {
  it('disables every section of the course a conflict blames', () => {
    const denied: string[] = [];
    applyProblem(conflictProblem(ma01, cs01), {
      denyCourse: (courseId) => denied.push(courseId),
      allowTime: () => {},
    });
    expect(denied).toEqual(['MA|1021']);
  });

  it('re-enables exactly the blocked cells a time conflict names', () => {
    const reopened: string[] = [];
    const problem = timeConflictProblem(cs01, {
      A: [{ row: 2, column: 0, dayIndex: 1, startMinutes: 9 * 60, insideGrid: true }],
      B: [{ row: 3, column: 1, dayIndex: 2, startMinutes: 9 * 60 + 30, insideGrid: true }],
    });
    applyProblem(problem, {
      denyCourse: () => {},
      allowTime: (term, row, column) => reopened.push(`${term}:${row},${column}`),
    });
    expect(reopened).toEqual(['A:2,0', 'B:3,1']);
  });

  it('does nothing for a problem kind it does not recognise', () => {
    const unknown = { kind: 'somethingElse' } as unknown as Problem;
    expect(() =>
      applyProblem(unknown, { denyCourse: () => {}, allowTime: () => {} }),
    ).not.toThrow();
  });
});
