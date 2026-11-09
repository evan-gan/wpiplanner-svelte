/**
 * Lets the app import `src/lib/config/courseBackground/<DEPT>.yaml` directly.
 *
 * The YAML is what people edit; the browser gets `toShippedFile`'s output —
 * descriptions replaced by an 8-character hash, editing-only fields dropped —
 * which is roughly a tenth of the size. Each file is validated on the way
 * through, so a typo in the YAML fails `pnpm build` / `pnpm dev` with the
 * same message `pnpm background check` would print.
 */
import type { Plugin } from 'vite';
import { parse } from 'yaml';
import {
  findCourseBackgroundProblems,
  toShippedFile,
  type CourseBackgroundFile,
} from '../src/lib/model/courseBackground.ts';

const BACKGROUND_FILE = /[\\/]courseBackground[\\/]([A-Z]+)\.yaml$/;

/**
 * Compile one department's YAML into the module the app imports.
 *
 * Args:
 *   yamlText: the file's contents
 *   department: the abbreviation from the file name, e.g. `AE`
 *
 * Returns:
 *   An ES module whose default export is the `ShippedBackgroundFile`.
 */
export function compileCourseBackground(yamlText: string, department: string): string {
  let parsed: unknown;
  try {
    parsed = parse(yamlText);
  } catch (error) {
    throw new Error(`${department}.yaml is not valid YAML: ${(error as Error).message}`);
  }
  const problems = findCourseBackgroundProblems(parsed, department);
  if (problems.length > 0) {
    throw new Error(`${department}.yaml has ${problems.length} problem(s):\n  ${problems.join('\n  ')}\nRun \`pnpm background check\` for the full list.`);
  }
  const shipped = toShippedFile(parsed as CourseBackgroundFile);
  // JSON.parse of a string literal is faster for engines to load than the same data as an object literal.
  return `export default JSON.parse(${JSON.stringify(JSON.stringify(shipped))});`;
}

export function courseBackgroundPlugin(): Plugin {
  return {
    name: 'wpiplanner:course-background-yaml',
    transform(code, id) {
      const match = BACKGROUND_FILE.exec(id.split('?')[0]);
      if (!match) return null;
      return { code: compileCourseBackground(code, match[1]), map: null };
    },
  };
}
