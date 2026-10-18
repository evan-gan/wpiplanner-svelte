/**
 * Free-text search over the catalog by class (code or title) and by professor.
 *
 * Built once per catalog: the professor index walks every period, which is too
 * much to redo on each keystroke. Searching itself is a linear scan of the
 * course list, which is a few thousand rows.
 */
import type { Catalog } from './catalog.ts';
import { isPlaceholderProfessor } from './sectionComponents.ts';

/** Results are capped so the dropdown stays a glance, not a second course list. */
export const MAX_SEARCH_RESULTS = 8;

export interface CourseHit {
  courseId: string;
  abbrev: string;
  name: string;
}

export interface ProfessorHit {
  name: string;
  courses: CourseHit[];
}

export interface SearchResults {
  courses: CourseHit[];
  professors: ProfessorHit[];
  /** How many matches there were before the cap, per box. */
  totalCourses: number;
  totalProfessors: number;
}

interface IndexedCourse extends CourseHit {
  /** "cs1102", with the space a student might type removed. */
  compactCode: string;
  lowerName: string;
}

interface IndexedProfessor {
  name: string;
  lowerName: string;
  courseIds: Set<string>;
}

/** Lower-case and drop everything but letters and digits: "CS 1102" -> "cs1102". */
function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export class CatalogSearch {
  private readonly courses: IndexedCourse[] = [];
  private readonly professors: IndexedProfessor[] = [];
  private readonly courseHitById = new Map<string, CourseHit>();

  constructor(catalog: Catalog) {
    const professorsByName = new Map<string, IndexedProfessor>();

    for (const department of catalog.departments) {
      for (const course of department.courses) {
        const abbrev = catalog.courseAbbrev(course.id);
        const hit: CourseHit = { courseId: course.id, abbrev, name: course.name };

        this.courseHitById.set(course.id, hit);
        this.courses.push({ ...hit, compactCode: compact(abbrev), lowerName: course.name.toLowerCase() });

        for (const section of course.sections) {
          for (const period of section.periods) {
            const name = period.professor.trim();
            if (name === '' || isPlaceholderProfessor(name)) continue;

            const existing = professorsByName.get(name);
            if (existing === undefined) {
              professorsByName.set(name, {
                name,
                lowerName: name.toLowerCase(),
                courseIds: new Set([course.id]),
              });
            } else {
              existing.courseIds.add(course.id);
            }
          }
        }
      }
    }

    this.professors = [...professorsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Both boxes of results for one query. An empty query matches nothing. */
  search(query: string): SearchResults {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === '') {
      return { courses: [], professors: [], totalCourses: 0, totalProfessors: 0 };
    }

    const courseMatches = this.matchCourses(trimmed);
    const professorMatches = this.matchProfessors(trimmed);

    return {
      courses: courseMatches.slice(0, MAX_SEARCH_RESULTS),
      professors: professorMatches.slice(0, MAX_SEARCH_RESULTS).map((professor) => ({
        name: professor.name,
        courses: [...professor.courseIds].map((id) => this.courseHitById.get(id)!),
      })),
      totalCourses: courseMatches.length,
      totalProfessors: professorMatches.length,
    };
  }

  /**
   * Courses whose code or title contains every word of the query.
   *
   * Code matches rank first (typing "cs11" should surface CS1102 before a title
   * that happens to contain "cs"), then titles that start with the query.
   */
  private matchCourses(lowerQuery: string): CourseHit[] {
    const compactQuery = compact(lowerQuery);
    const words = lowerQuery.split(/\s+/);
    const ranked: { hit: CourseHit; rank: number }[] = [];

    for (const course of this.courses) {
      let rank = Infinity;

      if (compactQuery !== '' && course.compactCode.startsWith(compactQuery)) rank = 0;
      else if (compactQuery !== '' && course.compactCode.includes(compactQuery)) rank = 1;
      else if (course.lowerName.startsWith(lowerQuery)) rank = 2;
      else if (words.every((word) => course.lowerName.includes(word))) rank = 3;

      if (rank !== Infinity) ranked.push({ hit: course, rank });
    }

    // Array.sort is stable, so ties keep catalog order.
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.hit);
  }

  /** Professors whose name contains every word, so "kadam sne" finds "Snehalata Kadam". */
  private matchProfessors(lowerQuery: string): IndexedProfessor[] {
    const words = lowerQuery.split(/\s+/);
    return this.professors.filter((professor) =>
      words.every((word) => professor.lowerName.includes(word)),
    );
  }
}
