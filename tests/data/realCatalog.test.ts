/**
 * PLAN.md §6, Phase 1 gate: the app's own index of `schedb.json` must agree with
 * the converter's summary, exactly.
 *
 * `static/schedb.json` is generated and git-ignored, so this suite skips itself
 * when the file is absent (a fresh clone before `pnpm run data:build`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { sectionAvailability } from '$lib/model/availability';
import type { SchedbFile } from '$lib/model/schedb';

const catalogPath = fileURLToPath(new URL('../../static/schedb.json', import.meta.url));
const hasCatalog = existsSync(catalogPath);

describe.skipIf(!hasCatalog)('the generated catalog', () => {
  const catalog = new Catalog(JSON.parse(readFileSync(catalogPath, 'utf8')) as SchedbFile);

  it('has the counts the converter reported for the February 2025 export', () => {
    expect(catalog.counts).toEqual({
      departments: 73,
      courses: 1233,
      sections: 5565,
      periods: 11823,
    });
  });

  it('gives every section a unique id, which CRNs are not', () => {
    const ids = new Set<string>();
    let crnCollisions = 0;
    const seenCrns = new Set<string>();

    for (const department of catalog.departments) {
      for (const course of department.courses) {
        for (const section of course.sections) {
          expect(ids.has(section.id)).toBe(false);
          ids.add(section.id);
          if (seenCrns.has(section.crn)) crnCollisions++;
          seenCrns.add(section.crn);
        }
      }
    }

    expect(ids.size).toBe(5565);
    // The reason section identity is not the CRN.
    expect(crnCollisions).toBeGreaterThan(0);
  });

  it('keeps CRNs as strings, since the values exceed Number.MAX_SAFE_INTEGER', () => {
    // Workday section numbers look like "BL01/BX01" — a paired lecture and lab.
    expect(typeof catalog.requireSection('CS|2102|BL01/BX01').crn).toBe('string');

    // At least one CRN in the export loses precision if parsed as a JS number,
    // which is why the wire format keeps every CRN as text.
    let unsafeCrns = 0;
    for (const department of catalog.departments) {
      for (const course of department.courses) {
        for (const section of course.sections) {
          if (!Number.isSafeInteger(Number(section.crn))) unsafeCrns++;
        }
      }
    }
    expect(unsafeCrns).toBeGreaterThan(0);
  });

  it('indexes a known cross-listed pair into two distinct sections', () => {
    const art = catalog.getSection('AR|2101|A01');
    const imgd = catalog.getSection('IMGD|2101|A01');

    expect(art).toBeDefined();
    expect(imgd).toBeDefined();
    expect(art!.crn).toBe(imgd!.crn);
    expect(catalog.getDepartmentOfCourse('AR|2101')?.abbrev).toBe('AR');
    expect(catalog.getDepartmentOfCourse('IMGD|2101')?.abbrev).toBe('IMGD');
  });

  it('classifies every section into one of the three availability states', () => {
    const states = new Set<string>();
    for (const department of catalog.departments) {
      for (const course of department.courses) {
        for (const section of course.sections) {
          states.add(sectionAvailability(section));
        }
      }
    }
    expect([...states].sort()).toEqual(['full', 'open', 'waitlist']);
  });
});
