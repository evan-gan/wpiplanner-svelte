/**
 * Importing a Workday "View My Courses" export into the planner.
 *
 * The pipeline is four pure steps — unzip, read the sheet, group the rows into
 * courses, resolve them against the catalog — so every stage is testable without
 * a browser, and the caller decides whether to apply the result.
 */
export { ZipArchive } from './zip';
export { readFirstSheet, type SheetRows } from './xlsx';
export { parseEnrolledCourses, type EnrolledCourse } from './enrollment';
export {
  matchEnrollment,
  type EnrollmentMatch,
  type MatchedCourse,
  type UnmatchedCourse,
} from './matchEnrollment';

import type { Catalog } from '$lib/model/catalog';
import { parseEnrolledCourses } from './enrollment';
import { matchEnrollment, type EnrollmentMatch } from './matchEnrollment';
import { readFirstSheet } from './xlsx';

/**
 * Read an exported workbook and resolve it against the catalog.
 *
 * @param workbookBytes The raw bytes of the `.xlsx` the student uploaded
 * @param catalog The loaded course catalog
 * @returns The sections that resolved, and the courses that did not
 * @throws Error when the file is not a readable Workday course export
 */
export async function readWorkdayExport(
  workbookBytes: ArrayBuffer | Uint8Array,
  catalog: Catalog,
): Promise<EnrollmentMatch> {
  return matchEnrollment(parseEnrolledCourses(await readFirstSheet(workbookBytes)), catalog);
}
