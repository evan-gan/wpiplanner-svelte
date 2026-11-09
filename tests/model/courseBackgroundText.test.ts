/**
 * How stored course background reads on the Courses tab.
 */
import { describe, expect, it } from 'vitest';
import type { BackgroundClause, Requirement } from '$lib/model/courseBackground';
import {
  clauseLabel,
  clauseTimingNote,
  describeRequirement,
  describeRequirementLines,
  uncheckedBackgroundNote,
} from '$lib/model/courseBackgroundText';

const course = (id: string, orEquivalent?: boolean): Requirement => ({ kind: 'course', course: id, orEquivalent });

function clause(overrides: Partial<BackgroundClause>): BackgroundClause {
  return { strength: 'recommended', timing: 'prior', sourceText: 'x', requirement: course('MA|1021'), ...overrides };
}

describe('describeRequirement', () => {
  it('writes a course id as a course code', () => {
    expect(describeRequirement(course('MA|2051'))).toBe('MA 2051');
  });

  it('says "or equivalent" once after a choice of courses', () => {
    const choice: Requirement = { kind: 'anyOf', of: [course('ES|2503', true), course('PH|2201', true)] };
    expect(describeRequirement(choice)).toBe('ES 2503 or PH 2201, or equivalent');
  });

  it('uses a serial comma for three or more', () => {
    const all: Requirement = { kind: 'allOf', of: [course('MA|1021'), course('MA|1022'), course('MA|1024')] };
    expect(describeRequirement(all)).toBe('MA 1021, MA 1022, and MA 1024');
  });

  it('parenthesises a nested group of a different kind', () => {
    const mixed: Requirement = {
      kind: 'allOf',
      of: [course('CS|1101'), { kind: 'anyOf', of: [course('MA|1021'), course('MA|1022')] }],
    };
    expect(describeRequirement(mixed)).toBe('CS 1101 and (MA 1021 or MA 1022)');
  });

  it('puts a topic\'s courses in parentheses after it', () => {
    const topic: Requirement = { kind: 'topic', topic: 'differential equations', satisfiedBy: course('MA|2051', true) };
    expect(describeRequirement(topic)).toBe('differential equations (MA 2051 or equivalent)');
  });

  it('mixes a course with a permission', () => {
    const either: Requirement = {
      kind: 'anyOf',
      of: [course('AB|1531'), { kind: 'permission', text: 'instructor approval' }],
    };
    expect(describeRequirement(either)).toBe('AB 1531 or instructor approval');
  });

  it('reads a countOf as "any N of"', () => {
    const two: Requirement = { kind: 'countOf', count: 2, of: [course('CS|2102'), course('CS|2103'), course('CS|2223')] };
    expect(describeRequirement(two)).toBe('any 2 of CS 2102, CS 2103, CS 2223');
  });
});

describe('describeRequirementLines', () => {
  it('splits a top-level allOf into one line per item', () => {
    const all: Requirement = { kind: 'allOf', of: [course('MA|1021'), { kind: 'topic', topic: 'programming' }] };
    expect(describeRequirementLines(all)).toEqual(['MA 1021', 'programming']);
  });

  it('keeps anything else on one line', () => {
    expect(describeRequirementLines(course('MA|1021'))).toEqual(['MA 1021']);
  });
});

describe('clause labels', () => {
  it.each([
    ['required', 'prior', 'Prerequisite', null],
    ['required', 'concurrent', 'Corequisite', null],
    ['recommended', 'prior', 'Recommended', null],
    ['suggested', 'priorOrConcurrent', 'Suggested', 'before or at the same time'],
    ['recommended', 'concurrent', 'Recommended', 'at the same time'],
  ] as const)('%s + %s reads "%s" with note %s', (strength, timing, label, note) => {
    const subject = clause({ strength, timing });
    expect(clauseLabel(subject)).toBe(label);
    expect(clauseTimingNote(subject)).toBe(note);
  });

  it('labels a required standing rule a Restriction, not a Prerequisite', () => {
    const closed = clause({ strength: 'required', requirement: { kind: 'standing', text: 'closed to native speakers' } });
    expect(clauseLabel(closed)).toBe('Restriction');
  });
});

describe('uncheckedBackgroundNote', () => {
  it('warns that an unchecked course has not been read for prerequisites', () => {
    expect(uncheckedBackgroundNote('unchecked')).toMatch(/not been checked/);
  });

  it('warns that a stale course was read from an older description', () => {
    expect(uncheckedBackgroundNote('stale')).toMatch(/description changed/);
  });

  it.each(['none', 'hasBackground'] as const)('says nothing for a course that has been read (%s)', (status) => {
    expect(uncheckedBackgroundNote(status)).toBeNull();
  });
});
