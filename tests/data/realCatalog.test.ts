/**
 * PLAN.md §6, Phase 1 gate: whatever catalog the app is about to ship has to
 * hold together when the app's own index reads it.
 *
 * These are invariants, not pinned counts. `pnpm updateData` replaces
 * `static/schedb.json` with the current term's catalog whenever anyone runs it,
 * so a fixed section count would fail on every refresh while telling nobody
 * anything. The counts that *are* pinned live in
 * `tests/scheduling/goldenSets.test.ts`, against the one export they were
 * verified against.
 *
 * `static/schedb.json` is generated and git-ignored, so this suite skips itself
 * when the file is absent (a fresh clone before `pnpm updateData`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { sectionAvailability } from '$lib/model/availability';
import { SCHEDB_FORMAT_VERSION, type SchedbFile, type SectionJson } from '$lib/model/schedb';

const catalogPath = fileURLToPath(new URL('../../static/schedb.json', import.meta.url));
const hasCatalog = existsSync(catalogPath);

describe.skipIf(!hasCatalog)('the generated catalog', () => {
  const file = JSON.parse(readFileSync(catalogPath, 'utf8')) as SchedbFile;
  const catalog = new Catalog(file);

  /** Every section in the catalog, with the course and department that own it. */
  function everySection(): { section: SectionJson; courseId: string; abbrev: string }[] {
    return catalog.departments.flatMap((department) =>
      department.courses.flatMap((course) =>
        course.sections.map((section) => ({
          section,
          courseId: course.id,
          abbrev: department.abbrev,
        })),
      ),
    );
  }

  it('declares the format version the app was built against', () => {
    expect(file.formatVersion).toBe(SCHEDB_FORMAT_VERSION);
    expect(file.minutesPerBlock).toBeGreaterThan(0);
    expect(file.generated).not.toBe('');
  });

  it('holds a catalog of a plausible size', () => {
    const { departments, courses, sections, periods } = catalog.counts;

    expect(departments).toBeGreaterThan(30);
    expect(courses).toBeGreaterThan(500);
    expect(sections).toBeGreaterThan(1000);
    expect(periods).toBeGreaterThanOrEqual(sections);
  });

  it('gives every section a unique id', () => {
    const ids = new Set<string>();
    for (const { section } of everySection()) {
      expect(ids.has(section.id)).toBe(false);
      ids.add(section.id);
    }
    expect(ids.size).toBe(catalog.counts.sections);
  });

  it('builds every section id from its department, course, and section number', () => {
    for (const { section, courseId, abbrev } of everySection()) {
      expect(section.id).toBe(`${courseId}|${section.number}`);
      expect(courseId.startsWith(`${abbrev}|`)).toBe(true);
    }
  });

  it('indexes every section back to the department that owns it', () => {
    for (const { section, courseId, abbrev } of everySection()) {
      expect(catalog.requireSection(section.id)).toBe(section);
      expect(catalog.getCourseIdOfSection(section.id)).toBe(courseId);
      expect(catalog.getDepartmentOfCourse(courseId)?.abbrev).toBe(abbrev);
    }
  });

  it('gives every section at least one term and one period', () => {
    for (const { section } of everySection()) {
      expect(section.terms.length).toBeGreaterThan(0);
      expect(section.periods.length).toBeGreaterThan(0);
    }
  });

  it('resolves every description index into the pool', () => {
    for (const department of catalog.departments) {
      for (const course of department.courses) {
        expect(course.descriptionIndex).toBeLessThan(file.descriptions.length);

        for (const section of course.sections) {
          expect(section.descriptionIndex).toBeLessThan(file.descriptions.length);
        }
      }
    }
  });

  it('classifies every section into one of the three availability states', () => {
    const states = new Set<string>();
    for (const { section } of everySection()) states.add(sectionAvailability(section));

    expect([...states].sort()).toEqual(['full', 'open', 'waitlist']);
  });
});
