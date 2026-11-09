/**
 * The course-background validator, and every stored
 * `src/lib/config/courseBackground/<DEPT>.yaml` run through it — so a hand- or
 * agent-written file with a typo'd kind or course id fails `pnpm test`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  courseBackgroundStatus,
  courseIdFromCode,
  findCourseBackgroundProblems,
  hashDescription,
  toShippedFile,
  type CourseBackgroundFile,
} from '$lib/model/courseBackground';

const VALID_FILE: CourseBackgroundFile = {
  department: 'AE',
  entries: [
    {
      courseId: 'AE|2110',
      description: 'Recommended background: differential equations (MA2051 or equivalent).',
      clauses: [
        {
          strength: 'recommended',
          timing: 'prior',
          sourceText: 'Recommended background: differential equations (MA2051 or equivalent).',
          requirement: {
            kind: 'topic',
            topic: 'differential equations',
            satisfiedBy: { kind: 'course', course: 'MA|2051', orEquivalent: true },
          },
        },
      ],
      noCreditWith: ['AE|3602'],
    },
  ],
};

/** A deep copy of VALID_FILE with its one entry changed by `edit`. */
function withEntry(edit: (entry: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(VALID_FILE) as unknown as { entries: Record<string, unknown>[] };
  edit(copy.entries[0]);
  return copy;
}

describe('findCourseBackgroundProblems', () => {
  it('accepts a well-formed file', () => {
    expect(findCourseBackgroundProblems(VALID_FILE, 'AE')).toEqual([]);
  });

  it('accepts an entry with no clauses, which marks a description as read', () => {
    const file = withEntry((entry) => (entry.clauses = []));
    expect(findCourseBackgroundProblems(file, 'AE')).toEqual([]);
  });

  it('rejects a file whose department does not match its name', () => {
    expect(findCourseBackgroundProblems(VALID_FILE, 'CS').join('\n')).toMatch(/expected "CS"/);
  });

  it('rejects a course id written as prose instead of DEPT|NUMBER', () => {
    const file = withEntry((entry) => (entry.noCreditWith = ['AE 3602']));
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/noCreditWith/);
  });

  it('rejects an unknown requirement kind, naming where it sits', () => {
    const file = withEntry((entry) => {
      (entry.clauses as { requirement: unknown }[])[0].requirement = { kind: 'prereq', course: 'MA|2051' };
    });
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/clauses\[0\]\.requirement\.kind: unknown kind/);
  });

  it('rejects a one-item group, which should be the item itself', () => {
    const file = withEntry((entry) => {
      (entry.clauses as { requirement: unknown }[])[0].requirement = {
        kind: 'anyOf',
        of: [{ kind: 'course', course: 'MA|2051' }],
      };
    });
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/at least two items/);
  });

  it('rejects a countOf whose count exceeds its items', () => {
    const file = withEntry((entry) => {
      (entry.clauses as { requirement: unknown }[])[0].requirement = {
        kind: 'countOf',
        count: 3,
        of: [
          { kind: 'course', course: 'CS|2102' },
          { kind: 'course', course: 'CS|2103' },
        ],
      };
    });
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/count: must be an integer from 1 to 2/);
  });

  it('rejects an entry filed under the wrong department', () => {
    const file = withEntry((entry) => (entry.courseId = 'ME|2110'));
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/belongs in ME\.yaml/);
  });

  it('rejects a course listed twice', () => {
    const file = structuredClone(VALID_FILE);
    file.entries.push(structuredClone(file.entries[0]));
    expect(findCourseBackgroundProblems(file, 'AE').join('\n')).toMatch(/listed twice/);
  });

  it('rejects an invalid strength and timing', () => {
    const file = withEntry((entry) => {
      const clause = (entry.clauses as Record<string, unknown>[])[0];
      clause.strength = 'mandatory';
      clause.timing = 'before';
    });
    const problems = findCourseBackgroundProblems(file, 'AE').join('\n');
    expect(problems).toMatch(/strength/);
    expect(problems).toMatch(/timing/);
  });
});

describe('courseIdFromCode', () => {
  it.each([
    ['MA 2051', 'MA|2051'],
    ['MA2051', 'MA|2051'],
    ['ma 2051', 'MA|2051'],
    ['HU 210X', 'HU|210X'],
  ])('turns "%s" into %s', (code, expected) => {
    expect(courseIdFromCode(code)).toBe(expected);
  });

  it('returns null for text that is not a course code', () => {
    expect(courseIdFromCode('differential equations')).toBeNull();
  });
});

describe('hashDescription', () => {
  it('is 8 hex digits and stable', () => {
    expect(hashDescription('Recommended background: MA 2051.')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashDescription('Recommended background: MA 2051.')).toBe(hashDescription('Recommended background: MA 2051.'));
  });

  it('changes when a single character of the description changes', () => {
    expect(hashDescription('Recommended background: MA 2051.')).not.toBe(hashDescription('Recommended background: MA 2052.'));
  });

  it('hashes the empty description too', () => {
    expect(hashDescription('')).toBe('811c9dc5');
  });
});

describe('toShippedFile', () => {
  const shipped = toShippedFile(VALID_FILE);
  const [entry] = shipped.entries;

  it('replaces the description with its hash', () => {
    expect(entry.descriptionHash).toBe(hashDescription(VALID_FILE.entries[0].description));
    expect(entry).not.toHaveProperty('description');
  });

  it('drops the editing-only fields', () => {
    expect(entry.clauses[0]).not.toHaveProperty('sourceText');
    expect(entry).not.toHaveProperty('needsReview');
  });

  it('keeps everything the app reads', () => {
    expect(entry.courseId).toBe('AE|2110');
    expect(entry.noCreditWith).toEqual(['AE|3602']);
    expect(entry.clauses[0]).toEqual({
      strength: 'recommended',
      timing: 'prior',
      requirement: VALID_FILE.entries[0].clauses[0].requirement,
    });
  });
});

describe('courseBackgroundStatus', () => {
  const file = toShippedFile({
    department: 'AE',
    entries: [
      { ...VALID_FILE.entries[0], description: 'Old text.' },
      { courseId: 'AE|2210', description: 'No background here.', clauses: [], noCreditWith: [] },
      { courseId: 'AE|3602', description: 'No credit only.', clauses: [], noCreditWith: ['AE|2110'] },
    ],
  });

  it('reports background read from the current description', () => {
    expect(courseBackgroundStatus(file, 'AE|2110', 'Old text.').status).toBe('hasBackground');
  });

  it('counts a no-credit rule alone as background', () => {
    expect(courseBackgroundStatus(file, 'AE|3602', 'No credit only.').status).toBe('hasBackground');
  });

  it('reports "none" for a course read and found to state no background', () => {
    expect(courseBackgroundStatus(file, 'AE|2210', 'No background here.').status).toBe('none');
  });

  it('reports "stale" when the description changed since it was read', () => {
    expect(courseBackgroundStatus(file, 'AE|2110', 'New text.').status).toBe('stale');
    expect(courseBackgroundStatus(file, 'AE|2210', 'Now requires MA 1021.').status).toBe('stale');
  });

  it('reports "unchecked" for a course with no entry, rather than "none"', () => {
    expect(courseBackgroundStatus(file, 'AE|9999', 'Brand new course.').status).toBe('unchecked');
  });

  it('reports "unchecked" for every course of a department with no file', () => {
    expect(courseBackgroundStatus(null, 'ZZ|1000', 'x').status).toBe('unchecked');
  });
});

const backgroundDir = fileURLToPath(new URL('../../src/lib/config/courseBackground/', import.meta.url));
const storedFiles = existsSync(backgroundDir) ? readdirSync(backgroundDir).filter((name) => name.endsWith('.yaml')) : [];

describe.skipIf(storedFiles.length === 0)('stored course-background files', () => {
  it.each(storedFiles)('%s is valid', (fileName) => {
    const parsed = parseYaml(readFileSync(`${backgroundDir}${fileName}`, 'utf8'));
    expect(findCourseBackgroundProblems(parsed, fileName.replace(/\.yaml$/, ''))).toEqual([]);
  });
});
