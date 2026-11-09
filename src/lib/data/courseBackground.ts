/**
 * Loads the hand-read course background (`src/lib/config/courseBackground/`)
 * for one course at a time.
 *
 * Each department's YAML is its own lazily imported chunk, so the data never
 * lands in the main bundle — viewing an AE course fetches only AE's, once. The
 * build compiles the YAML to the compact `ShippedBackgroundFile`
 * (`vite/courseBackgroundPlugin.ts`), so what arrives has no descriptions in it.
 */
import {
  courseBackgroundStatus,
  type CourseBackgroundStatus,
  type ShippedBackgroundFile,
} from '$lib/model/courseBackground';

const departmentFiles = import.meta.glob<ShippedBackgroundFile>('../config/courseBackground/*.yaml', {
  import: 'default',
});

const loadedDepartments = new Map<string, Promise<ShippedBackgroundFile | null>>();

function loadDepartment(department: string): Promise<ShippedBackgroundFile | null> {
  const cached = loadedDepartments.get(department);
  if (cached) return cached;

  const importFile = departmentFiles[`../config/courseBackground/${department}.yaml`];
  // A department with no file is one added since the descriptions were read; its courses come back `unchecked`.
  const pending = importFile
    ? importFile().catch((error: unknown) => {
        // Forget the failure so the next course view retries (e.g. after a dropped connection).
        loadedDepartments.delete(department);
        console.error(`Could not load course background for ${department}: ${(error as Error).message}`);
        return null;
      })
    : Promise.resolve(null);
  loadedDepartments.set(department, pending);
  return pending;
}

/**
 * What is known about a course's background — see `CourseBackgroundStatus`
 * for why `unchecked` and `stale` must be read as "unknown".
 *
 * Args:
 *   courseId: e.g. `AE|2110`
 *   currentDescription: the course's description in the loaded catalog
 */
export async function loadCourseBackground(
  courseId: string,
  currentDescription: string,
): Promise<CourseBackgroundStatus> {
  const department = courseId.split('|')[0];
  return courseBackgroundStatus(await loadDepartment(department), courseId, currentDescription);
}
