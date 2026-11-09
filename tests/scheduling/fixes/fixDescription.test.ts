import { describe, expect, it } from 'vitest';
import {
  describeFix,
  describeNoFix,
  describePanelHeader,
  splitBestPerTier,
  type DescribeContext,
} from '$lib/scheduling/fixDescription';
import type { Fix, FixScore } from '$lib/scheduling/fixFinder';
import { combo, fixCatalog, ON_SCREEN, part } from '../../fixtures/fixCatalog';
import { Catalog } from '$lib/model/catalog';
import { makeCatalog, makeCourse } from '../../fixtures/miniCatalog';

const catalog = fixCatalog();

function context(overrides: Partial<DescribeContext> = {}): DescribeContext {
  return {
    catalog,
    baselines: ON_SCREEN,
    pinnedCourseId: 'CS|2102',
    pinnedComponent: 'AL02',
    ...overrides,
  };
}

function fix(sectionIds: string[], score: Partial<FixScore> = {}): Fix {
  return {
    sectionIds,
    score: { tier: 1, newProfs: 0, termMoves: 0, coursesMoved: 1, timeShift: 0, unchecked: 0, ...score },
  };
}

describe('describeFix', () => {
  it('says nothing about what stays: a same-prof move has only its count and change lines', () => {
    const card = describeFix(fix(['CS|2102|AL02', 'CS|1102|AL03/AX03', 'CS|3733|A02'], { coursesMoved: 2 }), context());

    expect(card.headline).toEqual(['2 courses move']);

    const [cs1102, cs3733] = card.shown;
    expect(cs1102.tags).toEqual([]);
    expect(cs1102.lines).toEqual([
      { type: 'Lecture', from: 'TR 10am - 10:50am AL01', to: 'MWF 1pm - 1:50pm AL03', note: null },
      { type: 'Lab', from: 'W 3pm - 4:50pm AX01', to: 'W 3pm - 4:50pm AX03', note: null },
    ]);
    expect(cs1102.makesRoomFor).toBeNull();
    // CS3733 sat at MWF 1pm, where CS1102 is moving to.
    expect(cs3733.makesRoomFor).toBe('makes room for CS1102');
  });

  it('names a new lecture prof and states a new lab instructor by full name', () => {
    const card = describeFix(
      fix(['CS|2102|AL02', 'CS|1102|AL04/AX04'], { tier: 2, newProfs: 1 }),
      context(),
    );
    expect(card.headline[0]).toEqual('1 new prof');
    expect(card.shown[0].tags[0]).toEqual('New prof: Donald Knuth, was Grace Hopper');

    // Only the lab changes: same lecturer, so no "new prof", but the instructor is stated.
    const labCard = describeFix(fix(['CS|2102|AL02', 'CS|1102|AL01/AX02']), context());
    expect(labCard.shown[0].tags).toEqual([]);
    expect(labCard.shown[0].lines.map((line) => line.type)).toEqual(['Lab']);
    expect(labCard.shown[0].lines[0].note).toBe('New lab instructor: Jane Lee, was Sam Park');
  });

  it('names a term move and never mentions unchecked sections, which "Use this" re-checks', () => {
    const card = describeFix(
      fix(['CS|2102|AL02', 'CS|1102|BL01/BX01'], { tier: 3, termMoves: 1, unchecked: 1 }),
      context(),
    );
    expect(card.headline).toEqual(['1 term change', '1 course moves']);
    expect(card.shown[0].tags).toEqual(['Moves to B-Term']);
  });

  it('shows what moves with the pick on the picked course itself', () => {
    const pinnedLab = context({ pinnedCourseId: 'CS|1102', pinnedComponent: 'AX02', baselines: new Map([['CS|1102', ['CS|1102|AL04/AX04']]]) });
    const card = describeFix(fix(['CS|1102|AL01/AX02'], { coursesMoved: 0 }), pinnedLab);
    expect(card.shown[0].tags).toEqual([]);
    expect(card.shown[0].lines.map((line) => line.type)).toEqual(['Lecture']);
  });

  it('folds minor changes past three but always shows the bad ones', () => {
    const busy = new Catalog(
      makeCatalog(
        'XX',
        ['1', '2', '3', '4', '5'].map((number) =>
          makeCourse('XX', number, `Course ${number}`, [
            combo(`XX|${number}|A01`, [part('A01', 'Lecture', 'Same Prof', 'mon', '9:00AM-9:50AM')]),
            combo(`XX|${number}|A02`, [part('A02', 'Lecture', number === '5' ? 'Other Prof' : 'Same Prof', 'tue', '9:00AM-9:50AM')]),
          ]),
        ),
      ),
    );
    const baselines = new Map(['1', '2', '3', '4', '5'].map((number) => [`XX|${number}`, [`XX|${number}|A01`]]));
    const card = describeFix(
      fix(['1', '2', '3', '4', '5'].map((number) => `XX|${number}|A02`), { tier: 2, newProfs: 1, coursesMoved: 4 }),
      { catalog: busy, baselines, pinnedCourseId: 'XX|1', pinnedComponent: 'A02' },
    );

    expect(card.shown.map((change) => change.label)).toEqual(['XX2', 'XX3', 'XX5']);
    expect(card.folded.map((change) => change.label)).toEqual(['XX4']);
  });
});

describe('describePanelHeader', () => {
  it('names the pick with times then section, its prof change, and what it clashes with', () => {
    expect(describePanelHeader('CS|2102|AL02', context())).toEqual({
      title: 'Take CS2102',
      meeting: 'TR 10am - 10:50am AL02',
      tags: ['New prof: Alan Turing, was Ada Lovelace'],
      clashes: ['CS1102 · TR 10am - 10:50am AL01'],
    });
  });

  it('lists every clashing meeting of a course on one line', () => {
    const header = describePanelHeader(
      'CS|1102|AL01/AX02',
      context({
        pinnedCourseId: 'CS|1102',
        pinnedComponent: 'AL01',
        baselines: new Map([
          ['CS|1102', ['CS|1102|AL03/AX03']],
          ['CS|2102', ['CS|2102|AL02']],
        ]),
      }),
    );
    expect(header.clashes).toEqual(['CS2102 · TR 10am - 10:50am AL02']);
  });
});

describe('describePanelHeader for a lab pick', () => {
  it('names the meeting kind and only the changes it brings', () => {
    const header = describePanelHeader(
      'CS|1102|AL01/AX02',
      context({ pinnedCourseId: 'CS|1102', pinnedComponent: 'AX02' }),
    );
    expect(header.title).toBe('Take CS1102 Lab');
    expect(header.tags).toEqual(['New lab instructor: Jane Lee, was Sam Park']);
  });
});

describe('with no schedule on screen (every checked section is a baseline)', () => {
  const checked = context({
    baselines: new Map([
      ['CS|2102', ['CS|2102|AL01']],
      ['CS|1102', ['CS|1102|AL01/AX01', 'CS|1102|AL04/AX04']],
    ]),
  });

  it('treats a checked section as no change at all', () => {
    const card = describeFix(fix(['CS|2102|AL02', 'CS|1102|AL04/AX04'], { coursesMoved: 0 }), checked);
    expect(card.shown).toEqual([]);
  });

  it('measures an unchecked section against the closest checked one', () => {
    // AL03 is Grace Hopper's, like checked AL01, so no "new prof" even though AL04 (Knuth) is also checked.
    const card = describeFix(fix(['CS|2102|AL02', 'CS|1102|AL03/AX03']), checked);
    expect(card.shown[0].tags).toEqual([]);
    expect(card.shown[0].lines[0].from).toBe('TR 10am - 10:50am AL01');
  });

  it('lists a course as a clash only when every checked section clashes', () => {
    expect(describePanelHeader('CS|2102|AL02', checked).clashes).toEqual([]);

    const allClash = context({
      baselines: new Map([
        ['CS|2102', ['CS|2102|AL01']],
        ['CS|1102', ['CS|1102|AL01/AX01', 'CS|1102|AL01/AX02']],
      ]),
    });
    expect(describePanelHeader('CS|2102|AL02', allClash).clashes).toEqual(['CS1102 · every checked section']);
  });
});

describe('describeNoFix', () => {
  it('says why in plain words', () => {
    expect(describeNoFix({ kind: 'blocked-by-times' }, catalog)).toMatch(/Times tab/);
    expect(describeNoFix({ kind: 'clashes-with-course', courseId: 'CS|1102' }, catalog)).toBe(
      'No fix: every CS1102 section clashes with this.',
    );
    expect(describeNoFix({ kind: 'no-combination' }, catalog)).toMatch(/can't all fit/);
    expect(describeNoFix({ kind: 'timed-out' }, catalog)).toBe('No viable suggestions found.');
    expect(describeNoFix({ kind: 'timed-out' }, catalog, true)).toBe(
      'No viable suggestions found, even after searching longer.',
    );
  });
});

describe('splitBestPerTier', () => {
  it('keeps the first card of each tier up front and the rest behind "More options"', () => {
    const cards = [{ tier: 1 }, { tier: 1 }, { tier: 2 }, { tier: 4 }, { tier: 4 }] as const;
    const { best, more } = splitBestPerTier(cards);
    expect(best).toEqual([cards[0], cards[2], cards[3]]);
    expect(more).toEqual([cards[1], cards[4]]);
  });
});
