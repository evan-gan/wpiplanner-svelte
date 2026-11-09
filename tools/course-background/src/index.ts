/**
 * Bookkeeping for `src/lib/config/courseBackground/`: which courses still need their
 * background read out of the description, and whether what is stored is valid.
 *
 *   pnpm background status          per-department progress table
 *   pnpm background todo <DEPT>     the courses in DEPT that need an entry (unchecked or stale), with full descriptions
 *   pnpm background check           validate every file; exits 1 on any problem
 *
 * Every catalog course needs an entry, even one whose description states no
 * background — that is what lets a course added later show up as `unchecked`
 * instead of passing for "no prerequisites". A course needs (re)reading when it
 * has no entry, or its entry's stored `description` no longer equals the
 * catalog's — i.e. `pnpm updateData` changed the text since it was read.
 *
 * Entries for courses missing from the current catalog are kept: a course not
 * offered this year usually returns with the same description.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SchedbFile } from '../../../src/lib/model/schedb.ts';
import { parse as parseYaml } from 'yaml';
import {
  courseBackgroundStatus,
  findCourseBackgroundProblems,
  toShippedFile,
  type CourseBackgroundFile,
  type ShippedBackgroundFile,
} from '../../../src/lib/model/courseBackground.ts';

const CATALOG_PATH = 'static/schedb.json';
const BACKGROUND_DIR = 'src/lib/config/courseBackground';

interface CatalogCourse {
  id: string;
  name: string;
  description: string;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${(error as Error).message}. Run from the repo root; run \`pnpm updateData\` if the catalog is missing.`);
  }
}

function readYaml(path: string): unknown {
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${path}: ${(error as Error).message}. Check the YAML indentation near the line it names.`);
  }
}

/** Every course in the catalog, grouped by department abbreviation. */
function loadCatalogCourses(): Map<string, CatalogCourse[]> {
  const catalog = readJson(CATALOG_PATH) as SchedbFile;
  const byDepartment = new Map<string, CatalogCourse[]>();
  for (const department of catalog.departments) {
    byDepartment.set(
      department.abbrev,
      department.courses.map((course) => ({
        id: course.id,
        name: course.name,
        description: catalog.descriptions[course.descriptionIndex] ?? '',
      })),
    );
  }
  return byDepartment;
}

/**
 * A department's entries in the form the app downloads, or null when no file
 * exists yet. Going through `toShippedFile` means `status` reaches the same
 * answer as the running app, hash comparison included.
 */
function loadBackgroundFile(department: string): ShippedBackgroundFile | null {
  const path = join(BACKGROUND_DIR, `${department}.yaml`);
  return existsSync(path) ? toShippedFile(readYaml(path) as CourseBackgroundFile) : null;
}

/** Split a department's courses into done (read from the current text), stale, and unchecked (never read). */
function classifyCourses(courses: CatalogCourse[], file: ShippedBackgroundFile | null) {
  const statusOf = (course: CatalogCourse) => courseBackgroundStatus(file, course.id, course.description).status;
  return {
    done: courses.filter((course) => ['none', 'hasBackground'].includes(statusOf(course))),
    stale: courses.filter((course) => statusOf(course) === 'stale'),
    unchecked: courses.filter((course) => statusOf(course) === 'unchecked'),
  };
}

function printStatus(): void {
  const catalog = loadCatalogCourses();
  let totalCourses = 0;
  let totalDone = 0;
  console.log('dept   done/courses  stale  unchecked');
  for (const [department, courses] of [...catalog].sort(([a], [b]) => a.localeCompare(b))) {
    const { done, stale, unchecked } = classifyCourses(courses, loadBackgroundFile(department));
    totalCourses += courses.length;
    totalDone += done.length;
    const marker = done.length === courses.length ? '  ✓' : '';
    console.log(
      `${department.padEnd(6)} ${`${done.length}/${courses.length}`.padEnd(13)} ${String(stale.length).padEnd(6)} ${unchecked.length}${marker}`,
    );
  }
  console.log(`\n${totalDone} of ${totalCourses} catalog courses read from their current description.`);
}

function printTodo(department: string | undefined): void {
  if (!department) throw new Error('Usage: pnpm background todo <DEPT>   (e.g. `pnpm background todo AE`)');
  const courses = loadCatalogCourses().get(department);
  if (!courses) throw new Error(`No department "${department}" in ${CATALOG_PATH}. Department abbreviations are upper case, e.g. AE.`);
  const { stale, unchecked } = classifyCourses(courses, loadBackgroundFile(department));
  for (const course of [...stale, ...unchecked]) {
    const tag = stale.includes(course) ? ' [STALE: description changed; rewrite this entry]' : '';
    console.log(`=== ${course.id} — ${course.name}${tag}\n${course.description}\n`);
  }
  console.log(`${stale.length + unchecked.length} course(s) need an entry in ${BACKGROUND_DIR}/${department}.yaml`);
}

function runCheck(): void {
  const files = existsSync(BACKGROUND_DIR) ? readdirSync(BACKGROUND_DIR).filter((name) => name.endsWith('.yaml')) : [];
  const problems = files.flatMap((name) =>
    findCourseBackgroundProblems(readYaml(join(BACKGROUND_DIR, name)), name.replace(/\.yaml$/, '')),
  );
  for (const problem of problems) console.log(problem);
  console.log(problems.length === 0 ? `${files.length} file(s) valid.` : `\n${problems.length} problem(s).`);
  if (problems.length > 0) process.exitCode = 1;
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === 'status') printStatus();
  else if (command === 'todo') printTodo(argument);
  else if (command === 'check') runCheck();
  else throw new Error('Usage: pnpm background <status | todo DEPT | check>');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
