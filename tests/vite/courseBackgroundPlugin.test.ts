/**
 * The build step that turns a department's course-background YAML into the
 * module the browser downloads.
 */
import { describe, expect, it } from 'vitest';
import { compileCourseBackground, courseBackgroundPlugin } from '../../vite/courseBackgroundPlugin';
import { hashDescription, type ShippedBackgroundFile } from '$lib/model/courseBackground';

const VALID_YAML = `department: AE
entries:
  - courseId: AE|2110
    description: "Recommended background: MA 2051 or equivalent."
    clauses:
      - strength: recommended
        timing: prior
        sourceText: "Recommended background: MA 2051 or equivalent."
        requirement: { kind: course, course: MA|2051, orEquivalent: true }
    noCreditWith: [AE|3602]
    needsReview: just a note for editors
`;

/** Run the emitted module's default export expression. */
function evaluateModule(code: string): ShippedBackgroundFile {
  const expression = code.replace(/^export default /, '').replace(/;$/, '');
  return new Function(`return ${expression}`)() as ShippedBackgroundFile;
}

describe('compileCourseBackground', () => {
  it('emits the shipped form: hashed description, no editing-only fields', () => {
    const shipped = evaluateModule(compileCourseBackground(VALID_YAML, 'AE'));
    expect(shipped).toEqual({
      department: 'AE',
      entries: [
        {
          courseId: 'AE|2110',
          descriptionHash: hashDescription('Recommended background: MA 2051 or equivalent.'),
          clauses: [
            {
              strength: 'recommended',
              timing: 'prior',
              requirement: { kind: 'course', course: 'MA|2051', orEquivalent: true },
            },
          ],
          noCreditWith: ['AE|3602'],
        },
      ],
    });
  });

  it('fails the build on a file that does not validate, naming the problem', () => {
    const typo = VALID_YAML.replace('strength: recommended', 'strength: recommend');
    expect(() => compileCourseBackground(typo, 'AE')).toThrow(/AE\.yaml has 1 problem.*strength/s);
  });

  it('fails the build on broken YAML, naming the file', () => {
    expect(() => compileCourseBackground('department: AE\n  entries: [', 'AE')).toThrow(/AE\.yaml is not valid YAML/);
  });
});

describe('courseBackgroundPlugin', () => {
  const transform = courseBackgroundPlugin().transform as (code: string, id: string) => { code: string } | null;

  it('compiles course-background YAML, taking the department from the file name', () => {
    const result = transform(VALID_YAML, '/repo/src/lib/config/courseBackground/AE.yaml?import');
    expect(result && evaluateModule(result.code).department).toBe('AE');
  });

  it('leaves every other file alone', () => {
    expect(transform('a: 1', '/repo/src/lib/config/other.yaml')).toBeNull();
    expect(transform('export {}', '/repo/src/lib/config/courseBackground/AE.ts')).toBeNull();
  });
});
