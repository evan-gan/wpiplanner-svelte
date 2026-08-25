/**
 * PLAN.md §7.2 — golden fixtures from the real catalog.
 *
 * These pin the behaviour of a handful of real course sets so a later refactor
 * cannot quietly change what students see.
 *
 * Every count below has been confirmed against the original GWT
 * `ScheduleProducer` itself, run off-browser over the February 2025 export by
 * `tools/parity-oracle`. All five agree exactly, so these are parity evidence,
 * not just refactor guards.
 *
 * That is why this suite converts `data/new.schedb` itself instead of reading
 * whatever `static/schedb.json` currently holds: the counts are evidence about
 * one specific export, and `pnpm updateData` replaces the shipped catalog with
 * next term's. Re-pinning them to a refreshed catalog would throw the evidence
 * away, since no oracle run backs the new numbers. `data/new.schedb` is
 * git-ignored, so the suite skips itself when it is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Catalog } from '$lib/model/catalog';
import { ScheduleGenerator } from '$lib/scheduling/generator';
import { createMemoryStorage, loadChosenTimes } from '$lib/state/persistence';
import { SelectionState } from '$lib/state/selection.svelte';
import { convertSchedb } from '../../tools/schedb-to-json/src/convert.ts';

const exportPath = fileURLToPath(new URL('../../data/new.schedb', import.meta.url));
const hasExport = existsSync(exportPath);

describe.skipIf(!hasExport)('real course sets', () => {
  const catalog = new Catalog(convertSchedb(readFileSync(exportPath, 'utf8')).data);
  const openWeek = loadChosenTimes(createMemoryStorage());

  /** Chooses the courses the way the UI does, then runs the search to the end. */
  function schedulesFor(courseIds: string[]) {
    const selection = new SelectionState(catalog, createMemoryStorage());
    for (const courseId of courseIds) expect(selection.addCourse(courseId)).toBe('added');

    const generator = new ScheduleGenerator({
      courses: selection.generatorCourses(),
      chosenTimes: openWeek,
    });
    generator.runToCompletion();

    return { generator, selection };
  }

  it('gives one schedule per open section of a single course', () => {
    const { generator, selection } = schedulesFor(['CS|2102']);

    // 21 sections exist; the rest are switched off on add for having no seats.
    expect(selection.allowedSections('CS|2102')).toHaveLength(4);
    expect(generator.permutations).toHaveLength(4);
    expect(generator.permutations.every((p) => p.sectionIds.length === 1)).toBe(true);
  });

  it('handles a two-term course alongside a single-term one', () => {
    // MA1020 spans A and B terms; CS1004 is A and D.
    const { generator } = schedulesFor(['CS|1004', 'MA|1020']);
    expect(generator.permutations).toHaveLength(5);
  });

  it('skips a course whose sections are all full, rather than finding nothing', () => {
    // Every CS1004 section is closed, so it drops out of the search entirely —
    // the legacy producer skipped empty section lists for the same reason.
    const { generator, selection } = schedulesFor(['CS|1004', 'AR|2101']);

    expect(selection.allowedSections('CS|1004')).toEqual([]);
    expect(generator.permutations).toHaveLength(4);
    expect(generator.permutations.every((p) => p.sectionIds.length === 1)).toBe(true);
  });

  it('treats a cross-listed pair as two courses that conflict with each other', () => {
    // AR2101 and IMGD2101 are the same class under two departments and share
    // their CRNs. Keyed by CRN they were indistinguishable; keyed by section id
    // they are two courses whose matching sections collide.
    const { generator } = schedulesFor(['AR|2101', 'IMGD|2101']);

    expect(generator.permutations).toHaveLength(12);
    // 4x4 = 16 combinations, minus the 4 where the same class is taken twice.
    for (const permutation of generator.permutations) {
      const [first, second] = permutation.sectionIds;
      expect(first.split('|')[2]).not.toBe(second.split('|')[2]);
    }
  });

  it('handles a course with many sections in reasonable time', () => {
    // MA1021 has 184 sections, 79 of them open — the widest real case.
    //
    // 231, not 4 x 79, for two reasons. 20 of those 79 sections carry a
    // Tue/Thu 6:00–7:50PM lecture, which falls outside the chosen-times grid
    // and so can never be scheduled (PLAN.md §10.5); the remaining 5 missing
    // combinations are genuine conflicts with CS2102. The 300-schedule cap is
    // not involved — the search runs to exhaustion well past it.
    const started = Date.now();
    const { generator } = schedulesFor(['CS|2102', 'MA|1021']);

    expect(generator.permutations).toHaveLength(231);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('produces schedules with no problems attached, since maxSolutions is 0', () => {
    const { generator } = schedulesFor(['CS|2102', 'MA|1021']);
    expect(generator.permutations.every((p) => p.problems.length === 0)).toBe(true);
  });
});
