/**
 * "How could I take this section?" — the search behind the fix panel.
 *
 * The student points at a lecture, lab, or discussion that clashes with the
 * schedule on screen. This pins it, lets every other course pick any of its
 * sections (switched on or not), and looks for the full schedules that change
 * the least from the one on screen.
 *
 * "Least" is ranked in four tiers, then by tiebreakers inside a tier:
 *
 *   1. same lecture profs, same terms   (only sections/times move)
 *   2. a new lecture prof, same terms
 *   3. same profs, a term move
 *   4. both
 *
 *   then: fewest new profs → fewest term moves → fewest courses moved →
 *   smallest time shift → fewest unchecked sections turned back on.
 *
 * A fix's tier is set by the worst change anywhere in it, so a chain of moves
 * (CS1102 moves, and MA1021 moves to make room for it) is judged as a whole.
 *
 * The search is a depth-first branch-and-bound. Every course's candidates are
 * tried cheapest-first (the section on screen costs nothing). Placing a
 * section strikes every clashing candidate from the courses still to place
 * (forward checking), so a dead end is seen the moment a course runs out, and
 * a cascade is priced in early: once a course's current section is struck, the
 * bound knows it must move. A branch is dropped once that bound can no longer
 * beat the worst fix kept for any tier it could still land in. It runs only
 * when the panel opens, in a worker, and stops at its time limit (`maxMillis`)
 * — the panel gives it one second, and a longer run only when asked.
 *
 * Chosen times are respected, never questioned: a section in a blocked cell is
 * not a candidate at all.
 */
import { sectionsConflict } from './conflicts';
import { hasTimeConflicts } from './timeConflicts';
import type { ChosenTimes, GeneratorSection } from './types';

/** What picking one section costs, measured against the course's section on screen. */
export interface ChangeCost {
  /** The course leaves its current section. Never set for the pinned course. */
  moved: boolean;
  /** The lecture's professor differs. Lab/discussion instructors never count. */
  newProf: boolean;
  termMove: boolean;
  /** Rough distance between the old and new meeting times; a tiebreaker only. */
  timeShift: number;
  /** The section is currently switched off. */
  unchecked: boolean;
}

export interface FixCandidate {
  section: GeneratorSection;
  cost: ChangeCost;
}

export interface FixCourse {
  courseId: string;
  candidates: FixCandidate[];
}

export interface FixRequest {
  /** The course being changed; its candidates all contain the pinned component. */
  pinnedCourse: FixCourse;
  /** Every other course in the schedule on screen. */
  otherCourses: FixCourse[];
  chosenTimes: ChosenTimes;
  /** How many fixes to keep per tier. */
  perTier?: number;
  /** Wall-clock budget in milliseconds; omit for no limit. */
  maxMillis?: number;
  /** Node budget, mainly for tests; omit for no limit. */
  maxSteps?: number;
}

export type FixTier = 1 | 2 | 3 | 4;

export interface FixScore {
  tier: FixTier;
  newProfs: number;
  termMoves: number;
  coursesMoved: number;
  timeShift: number;
  unchecked: number;
}

export interface Fix {
  /** One section per course, the pinned course first. */
  sectionIds: string[];
  score: FixScore;
}

export type NoFixReason =
  | { kind: 'blocked-by-times' }
  | { kind: 'clashes-with-course'; courseId: string }
  | { kind: 'no-combination' }
  /** Ran out of time before finding anything or proving there is nothing. */
  | { kind: 'timed-out' };

export interface FixResult {
  /** Best first: by tier, then by the tiebreakers. */
  fixes: Fix[];
  /** False when a time or step limit stopped the search, so better fixes may exist. */
  complete: boolean;
  /** Why there is nothing to offer; null when `fixes` is not empty. */
  reason: NoFixReason | null;
}

export const DEFAULT_PER_TIER = 3;
/** Reading the clock every node would cost more than the nodes; every 256th is plenty. */
const STEPS_PER_CLOCK_CHECK = 256;

const EMPTY_SCORE: FixScore = {
  tier: 1,
  newProfs: 0,
  termMoves: 0,
  coursesMoved: 0,
  timeShift: 0,
  unchecked: 0,
};

/** Tier from the two things that set it: any new prof, any term move. */
function tierOf(newProfs: number, termMoves: number): FixTier {
  return (1 + (newProfs > 0 ? 1 : 0) + (termMoves > 0 ? 2 : 0)) as FixTier;
}

function addCost(score: FixScore, cost: ChangeCost): FixScore {
  const newProfs = score.newProfs + (cost.newProf ? 1 : 0);
  const termMoves = score.termMoves + (cost.termMove ? 1 : 0);
  return {
    tier: tierOf(newProfs, termMoves),
    newProfs,
    termMoves,
    coursesMoved: score.coursesMoved + (cost.moved ? 1 : 0),
    timeShift: score.timeShift + cost.timeShift,
    unchecked: score.unchecked + (cost.unchecked ? 1 : 0),
  };
}

/** Negative when `score` ranks better than `other`. */
export function compareScores(score: FixScore, other: FixScore): number {
  return (
    score.tier - other.tier ||
    score.newProfs - other.newProfs ||
    score.termMoves - other.termMoves ||
    score.coursesMoved - other.coursesMoved ||
    score.timeShift - other.timeShift ||
    score.unchecked - other.unchecked
  );
}

/** Same comparison with the tier left out, for fixes known to share one. */
function compareWithinTier(score: FixScore, other: FixScore): number {
  return compareScores({ ...score, tier: 1 }, { ...other, tier: 1 });
}

/**
 * What the courses still to place will add: at least `floor` (each course's
 * cheapest remaining candidate, field by field), and which kinds of change a
 * remaining candidate could still bring.
 *
 * The kinds are tracked in combination because they usually travel together:
 * another term is often taught by another prof, and a term move that only
 * comes with a new prof can never produce a tier-3 ("same profs") fix.
 */
interface Outlook {
  floor: Omit<FixScore, 'tier'>;
  newProfPossible: boolean;
  termMovePossible: boolean;
  /** A candidate with a new prof but no term move. */
  newProfAloneOk: boolean;
  /** A candidate with a term move but the same prof. */
  termMoveAloneOk: boolean;
}

/**
 * The cheapest score a partial fix could finish with in `tier`, or null when
 * it cannot end up there at all.
 *
 * Fields only grow as courses are added, so partial + floor is a lower bound
 * field by field, and therefore in the ranking order too. A tier that needs a
 * new prof (or term move) the bound does not have yet needs at least one more
 * of it, and at least one more moved course.
 */
function lowerBoundInTier(partial: FixScore, tier: FixTier, outlook: Outlook): FixScore | null {
  const needsNewProf = tier === 2 || tier === 4;
  const needsTermMove = tier >= 3;

  let newProfs = partial.newProfs + outlook.floor.newProfs;
  let termMoves = partial.termMoves + outlook.floor.termMoves;
  let coursesMoved = partial.coursesMoved + outlook.floor.coursesMoved;
  if (newProfs > 0 && !needsNewProf) return null;
  if (termMoves > 0 && !needsTermMove) return null;

  if (needsNewProf && newProfs === 0) {
    if (!(needsTermMove ? outlook.newProfPossible : outlook.newProfAloneOk)) return null;
    newProfs = 1;
    coursesMoved = Math.max(coursesMoved, partial.coursesMoved + 1);
  }
  if (needsTermMove && termMoves === 0) {
    if (!(needsNewProf ? outlook.termMovePossible : outlook.termMoveAloneOk)) return null;
    termMoves = 1;
    coursesMoved = Math.max(coursesMoved, partial.coursesMoved + 1);
  }

  return {
    tier,
    newProfs,
    termMoves,
    coursesMoved,
    timeShift: partial.timeShift + outlook.floor.timeShift,
    unchecked: partial.unchecked + outlook.floor.unchecked,
  };
}

/** Keeps the best few fixes of each tier and answers "is this branch still worth it?". */
class TierBoard {
  private readonly byTier = new Map<FixTier, Fix[]>([
    [1, []],
    [2, []],
    [3, []],
    [4, []],
  ]);

  constructor(private readonly perTier: number) {}

  offer(fix: Fix): void {
    const kept = this.byTier.get(fix.score.tier)!;
    kept.push(fix);
    kept.sort((a, b) => compareWithinTier(a.score, b.score));
    if (kept.length > this.perTier) kept.pop();
  }

  /** Whether a partial score could still earn a place in some tier. */
  canImprove(partial: FixScore, outlook: Outlook): boolean {
    return ([1, 2, 3, 4] as FixTier[]).some((tier) => {
      const bound = lowerBoundInTier(partial, tier, outlook);
      if (bound === null) return false;
      const kept = this.byTier.get(tier)!;
      if (kept.length < this.perTier) return true;
      return compareWithinTier(bound, kept[kept.length - 1].score) < 0;
    });
  }

  all(): Fix[] {
    return [...this.byTier.values()].flat().sort((a, b) => compareScores(a.score, b.score));
  }
}

/** Candidates that fit the chosen-times grid, cheapest first. */
function usableCandidates(course: FixCourse, chosenTimes: ChosenTimes): FixCandidate[] {
  return course.candidates
    .filter((candidate) => !hasTimeConflicts(candidate.section, chosenTimes))
    .sort((a, b) => compareScores(addCost(EMPTY_SCORE, a.cost), addCost(EMPTY_SCORE, b.cost)));
}

/** A course every one of whose usable sections clashes with every pinned candidate. */
function findImpossibleCourse(
  pinned: readonly FixCandidate[],
  others: readonly { courseId: string; candidates: FixCandidate[] }[],
): string | null {
  const blocker = others.find((course) =>
    course.candidates.every((candidate) =>
      pinned.every((pinnedCandidate) => sectionsConflict(candidate.section, pinnedCandidate.section)),
    ),
  );
  return blocker?.courseId ?? null;
}

/**
 * Every candidate in one flat list, plus a table of which pairs clash.
 *
 * Forward checking asks "does this clash with that?" millions of times; a
 * lookup is far cheaper than comparing periods each time. Candidates of the
 * same course are never compared, since a schedule only holds one of them.
 */
class CandidateTable {
  readonly candidates: FixCandidate[];
  /** For each course, the indexes of its candidates, cheapest first. */
  readonly domains: number[][];
  private readonly clashes: Uint8Array;

  constructor(courses: readonly FixCandidate[][]) {
    this.candidates = courses.flat();
    const courseOfIndex: number[] = [];
    this.domains = courses.map((options, course) =>
      options.map(() => {
        courseOfIndex.push(course);
        return courseOfIndex.length - 1;
      }),
    );

    const count = this.candidates.length;
    this.clashes = new Uint8Array(count * count);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        if (courseOfIndex[i] === courseOfIndex[j]) continue;
        if (!sectionsConflict(this.candidates[i].section, this.candidates[j].section)) continue;
        this.clashes[i * count + j] = 1;
        this.clashes[j * count + i] = 1;
      }
    }
  }

  clash(index: number, otherIndex: number): boolean {
    return this.clashes[index * this.candidates.length + otherIndex] === 1;
  }
}

/** A course's candidates still compatible with everything placed; null once it is placed. */
type Domains = (number[] | null)[];

/**
 * Forward checking: strike every candidate of the unplaced courses that
 * clashes with the one just placed.
 *
 * @returns The narrowed domains, or null as soon as a course has nothing left —
 *   that branch can never finish, however far it is followed
 */
function narrowDomains(table: CandidateTable, domains: Domains, placedIndex: number): Domains | null {
  const narrowed: Domains = domains.slice();
  for (let course = 0; course < domains.length; course++) {
    const options = domains[course];
    if (options === null) continue;
    const kept = options.filter((index) => !table.clash(placedIndex, index));
    if (kept.length === 0) return null;
    narrowed[course] = kept;
  }
  return narrowed;
}

/** What the unplaced courses must and might add. */
function outlookOf(table: CandidateTable, domains: Domains): Outlook {
  const floor = { newProfs: 0, termMoves: 0, coursesMoved: 0, timeShift: 0, unchecked: 0 };
  let newProfPossible = false;
  let termMovePossible = false;
  let newProfAloneOk = false;
  let termMoveAloneOk = false;

  for (const options of domains) {
    if (options === null) continue;
    const costs = options.map((index) => table.candidates[index].cost);
    floor.newProfs += costs.every((cost) => cost.newProf) ? 1 : 0;
    floor.termMoves += costs.every((cost) => cost.termMove) ? 1 : 0;
    floor.coursesMoved += costs.every((cost) => cost.moved) ? 1 : 0;
    floor.unchecked += costs.every((cost) => cost.unchecked) ? 1 : 0;
    floor.timeShift += Math.min(...costs.map((cost) => cost.timeShift));
    newProfPossible ||= costs.some((cost) => cost.newProf);
    termMovePossible ||= costs.some((cost) => cost.termMove);
    newProfAloneOk ||= costs.some((cost) => cost.newProf && !cost.termMove);
    termMoveAloneOk ||= costs.some((cost) => cost.termMove && !cost.newProf);
  }
  return { floor, newProfPossible, termMovePossible, newProfAloneOk, termMoveAloneOk };
}

/** The unplaced course with the fewest options left, or -1 when all are placed. */
function mostConstrainedCourse(domains: Domains): number {
  let best = -1;
  for (let course = 0; course < domains.length; course++) {
    const options = domains[course];
    if (options !== null && (best === -1 || options.length < domains[best]!.length)) best = course;
  }
  return best;
}

/**
 * Find the least disruptive schedules that include the pinned component.
 *
 * @param request The pinned course's candidates, every other course's
 *   candidates with their costs, and the chosen-times grid
 * @returns Up to `perTier` fixes per tier, best first, or the reason none exist
 */
export function findFixes(request: FixRequest): FixResult {
  const perTier = request.perTier ?? DEFAULT_PER_TIER;
  const maxSteps = request.maxSteps ?? Infinity;
  const deadline = request.maxMillis === undefined ? Infinity : performance.now() + request.maxMillis;

  const pinned = usableCandidates(request.pinnedCourse, request.chosenTimes);
  if (pinned.length === 0) return { fixes: [], complete: true, reason: { kind: 'blocked-by-times' } };

  const others = request.otherCourses.map((course) => ({
    courseId: course.courseId,
    candidates: usableCandidates(course, request.chosenTimes),
  }));
  // Course 0 is the pinned one, so every fix lists the pick first.
  const table = new CandidateTable([pinned, ...others.map((course) => course.candidates)]);

  const board = new TierBoard(perTier);
  const chosen: number[] = new Array(table.domains.length);
  let steps = 0;
  let stoppedEarly = false;

  function outOfBudget(): boolean {
    if (!stoppedEarly && steps >= maxSteps) stoppedEarly = true;
    if (!stoppedEarly && steps % STEPS_PER_CLOCK_CHECK === 0 && performance.now() >= deadline) {
      stoppedEarly = true;
    }
    return stoppedEarly;
  }

  // The course with the fewest options left goes next, which finds dead ends soonest.
  function visit(score: FixScore, domains: Domains): void {
    const course = mostConstrainedCourse(domains);
    if (course === -1) {
      board.offer({ sectionIds: chosen.map((index) => table.candidates[index].section.id), score });
      return;
    }
    for (const index of domains[course]!) {
      if (outOfBudget()) return;
      steps++;

      const placedDomains = domains.slice();
      placedDomains[course] = null;
      const narrowed = narrowDomains(table, placedDomains, index);
      if (narrowed === null) continue;

      const next = addCost(score, table.candidates[index].cost);
      if (!board.canImprove(next, outlookOf(table, narrowed))) continue;

      chosen[course] = index;
      visit(next, narrowed);
    }
  }

  visit(EMPTY_SCORE, table.domains);

  const fixes = board.all();
  const complete = !stoppedEarly;
  if (fixes.length > 0) return { fixes, complete, reason: null };

  // A course that clashes in every section is proof enough, finished or not;
  // "no combination" is only proven by a search that ran to the end.
  const impossibleCourse = findImpossibleCourse(pinned, others);
  if (impossibleCourse !== null) {
    return { fixes, complete, reason: { kind: 'clashes-with-course', courseId: impossibleCourse } };
  }
  return { fixes, complete, reason: complete ? { kind: 'no-combination' } : { kind: 'timed-out' } };
}
