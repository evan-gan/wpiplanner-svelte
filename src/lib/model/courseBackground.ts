/**
 * Structured "what should I have taken first" data, read out of the free-text
 * course descriptions.
 *
 * The catalog only carries prose such as "Recommended background: differential
 * equations (MA 2051 or equivalent), dynamics (ES 2503, PH 2201 or
 * equivalent)." This module is the shape that prose is turned into so the app
 * can reason about it — check a student's past courses, flag a missing
 * corequisite, and so on.
 *
 * The data lives in `src/lib/config/courseBackground/<DEPT>.yaml`, one file per
 * department, and is read from the descriptions by hand (or by an agent) — it
 * is not produced by the converter. YAML is for the people editing it; the
 * build ships each file as a much smaller `ShippedBackgroundFile`
 * (`toShippedFile`, run by `vite/courseBackgroundPlugin.ts`).
 *
 * **Every catalog course has an entry**, including those whose description
 * states no background (`clauses: []`). That makes "read, and there is none"
 * different from "never read": a course added to the catalog later has no
 * entry, so `courseBackgroundStatus` reports it `unchecked` rather than
 * silently treating it as having no prerequisites. Each entry also keeps the
 * exact description it was read from, so a rewritten description reports
 * `stale`.
 *
 * Shared with `tools/`, so sibling imports carry an explicit `.ts`.
 */

/** A catalog course id, `${dept}|${number}`, e.g. `MA|1021` or `HU|210X`. */
export const COURSE_ID_PATTERN = /^[A-Z]{2,4}\|[0-9]{3,4}X?$/;

export type Requirement =
  /** One specific course. `orEquivalent` when the text says "MA 2051 or equivalent". */
  | { kind: 'course'; course: string; orEquivalent?: boolean }
  /** Every item ("MA 1021 and MA 1022", or a comma list of separate topics). */
  | { kind: 'allOf'; of: Requirement[] }
  /** Any one item ("PH 1110 or PH 1111"). */
  | { kind: 'anyOf'; of: Requirement[] }
  /** At least `count` of the items ("two of CS 2102, CS 2103, CS 2223"). */
  | { kind: 'countOf'; count: number; of: Requirement[] }
  /**
   * A named subject, optionally with the courses that cover it:
   * "differential equations (MA 2051 or equivalent)". `satisfiedBy` is absent
   * when the text names no course ("basic programming experience").
   */
  | { kind: 'topic'; topic: string; satisfiedBy?: Requirement }
  /** Instructor / department permission or approval. */
  | { kind: 'permission'; text: string }
  /** Class standing or program membership: "junior standing", "graduate students only". */
  | { kind: 'standing'; text: string }
  /** Anything that fits none of the above. Keep the wording verbatim. */
  | { kind: 'other'; text: string };

export type RequirementKind = Requirement['kind'];

/** How strongly the description asks for the background. */
export type BackgroundStrength = 'required' | 'recommended' | 'suggested';

/** When the background must be taken relative to this course. */
export type BackgroundTiming = 'prior' | 'concurrent' | 'priorOrConcurrent';

/** One sentence (or phrase) of the description, structured. */
export interface BackgroundClause {
  /** "Prerequisite" → required; "Recommended background" → recommended; "Suggested background" → suggested. */
  strength: BackgroundStrength;
  timing: BackgroundTiming;
  requirement: Requirement;
  /** The text this clause was read from, copied verbatim from the description. */
  sourceText: string;
}

export interface CourseBackgroundEntry {
  /** Catalog course id, e.g. `AE|2110`. */
  courseId: string;
  /** The full course description this entry was read from, verbatim. Used to detect staleness. */
  description: string;
  /** Empty when the description turned out to state no background. */
  clauses: BackgroundClause[];
  /** "Students may not receive credit for both AE 2110 and AE 3602" → `['AE|3602']`. Never includes the course itself. */
  noCreditWith: string[];
  /** Set when the text was too ambiguous to structure with confidence; says what a human should check. */
  needsReview?: string;
}

export interface CourseBackgroundFile {
  /** Department abbreviation; every entry's `courseId` starts with it. */
  department: string;
  entries: CourseBackgroundEntry[];
}

const STRENGTHS: readonly string[] = ['required', 'recommended', 'suggested'];
const TIMINGS: readonly string[] = ['prior', 'concurrent', 'priorOrConcurrent'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check one requirement tree, appending a message per problem.
 *
 * Args:
 *   requirement: the untrusted parsed JSON node
 *   path: where the node sits, for the error message (e.g. `AE|2110 clauses[0].requirement.of[1]`)
 *   problems: collected messages; mutated
 */
function checkRequirement(requirement: unknown, path: string, problems: string[]): void {
  if (!isRecord(requirement)) {
    problems.push(`${path}: expected an object, got ${JSON.stringify(requirement)}`);
    return;
  }
  switch (requirement.kind) {
    case 'course':
      if (typeof requirement.course !== 'string' || !COURSE_ID_PATTERN.test(requirement.course)) {
        problems.push(`${path}.course: "${String(requirement.course)}" is not a course id like "MA|1021"`);
      }
      if (requirement.orEquivalent !== undefined && typeof requirement.orEquivalent !== 'boolean') {
        problems.push(`${path}.orEquivalent: must be a boolean when present`);
      }
      return;
    case 'allOf':
    case 'anyOf':
    case 'countOf':
      checkGroup(requirement, path, problems);
      return;
    case 'topic':
      if (!isNonEmptyString(requirement.topic)) problems.push(`${path}.topic: must be a non-empty string`);
      if (requirement.satisfiedBy !== undefined) checkRequirement(requirement.satisfiedBy, `${path}.satisfiedBy`, problems);
      return;
    case 'permission':
    case 'standing':
    case 'other':
      if (!isNonEmptyString(requirement.text)) problems.push(`${path}.text: must be a non-empty string`);
      return;
    default:
      problems.push(`${path}.kind: unknown kind ${JSON.stringify(requirement.kind)}`);
  }
}

function checkGroup(group: Record<string, unknown>, path: string, problems: string[]): void {
  if (!Array.isArray(group.of) || group.of.length < 2) {
    // A one-item group is just that item; requiring two keeps the trees flat and comparable.
    problems.push(`${path}.of: a ${String(group.kind)} needs at least two items — use the item directly`);
    return;
  }
  if (group.kind === 'countOf') {
    const count = group.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > group.of.length) {
      problems.push(`${path}.count: must be an integer from 1 to ${group.of.length}`);
    }
  }
  group.of.forEach((item, index) => checkRequirement(item, `${path}.of[${index}]`, problems));
}

function checkClause(clause: unknown, path: string, problems: string[]): void {
  if (!isRecord(clause)) {
    problems.push(`${path}: expected an object`);
    return;
  }
  if (!STRENGTHS.includes(clause.strength as string)) {
    problems.push(`${path}.strength: must be one of ${STRENGTHS.join(', ')}`);
  }
  if (!TIMINGS.includes(clause.timing as string)) {
    problems.push(`${path}.timing: must be one of ${TIMINGS.join(', ')}`);
  }
  if (!isNonEmptyString(clause.sourceText)) problems.push(`${path}.sourceText: must be a non-empty string`);
  checkRequirement(clause.requirement, `${path}.requirement`, problems);
}

function checkEntry(entry: unknown, department: string, path: string, problems: string[]): void {
  if (!isRecord(entry)) {
    problems.push(`${path}: expected an object`);
    return;
  }
  const courseId = entry.courseId;
  if (typeof courseId !== 'string' || !COURSE_ID_PATTERN.test(courseId)) {
    problems.push(`${path}.courseId: "${String(courseId)}" is not a course id like "MA|1021"`);
  } else if (!courseId.startsWith(`${department}|`)) {
    problems.push(`${path}.courseId: ${courseId} belongs in ${courseId.split('|')[0]}.yaml, not ${department}.yaml`);
  }
  const label = typeof courseId === 'string' ? courseId : path;
  if (typeof entry.description !== 'string') problems.push(`${label}.description: must be a string`);
  if (!Array.isArray(entry.clauses)) {
    problems.push(`${label}.clauses: must be an array (empty when there is no background)`);
  } else {
    entry.clauses.forEach((clause, index) => checkClause(clause, `${label} clauses[${index}]`, problems));
  }
  if (!Array.isArray(entry.noCreditWith) || entry.noCreditWith.some((id) => typeof id !== 'string' || !COURSE_ID_PATTERN.test(id))) {
    problems.push(`${label}.noCreditWith: must be an array of course ids like "MA|1021"`);
  } else if (entry.noCreditWith.includes(courseId)) {
    problems.push(`${label}.noCreditWith: must not list the course itself`);
  }
  if (entry.needsReview !== undefined && !isNonEmptyString(entry.needsReview)) {
    problems.push(`${label}.needsReview: must be a non-empty string when present`);
  }
}

/**
 * Validate one parsed `src/lib/config/courseBackground/<DEPT>.yaml`.
 *
 * Args:
 *   file: the untrusted parsed YAML
 *   expectedDepartment: the department the file name says it holds
 *
 * Returns:
 *   One readable message per problem; empty when the file is valid.
 */
export function findCourseBackgroundProblems(file: unknown, expectedDepartment: string): string[] {
  const problems: string[] = [];
  if (!isRecord(file)) return [`${expectedDepartment}.yaml: expected an object with "department" and "entries"`];
  if (file.department !== expectedDepartment) {
    problems.push(`${expectedDepartment}.yaml: "department" is ${JSON.stringify(file.department)}, expected "${expectedDepartment}"`);
  }
  if (!Array.isArray(file.entries)) return [...problems, `${expectedDepartment}.yaml: "entries" must be an array`];

  const seen = new Set<string>();
  file.entries.forEach((entry, index) => {
    checkEntry(entry, expectedDepartment, `${expectedDepartment}.yaml entries[${index}]`, problems);
    const courseId = isRecord(entry) ? entry.courseId : undefined;
    if (typeof courseId === 'string') {
      if (seen.has(courseId)) problems.push(`${courseId}: listed twice in ${expectedDepartment}.yaml`);
      seen.add(courseId);
    }
  });
  return problems;
}

/** A clause as shipped to the browser: `sourceText` is only for the people editing the YAML. */
export type ShippedBackgroundClause = Omit<BackgroundClause, 'sourceText'>;

/**
 * An entry as shipped to the browser. The description — most of the file's
 * weight, and already in the catalog — is replaced by its hash, which is all
 * the staleness check needs; `needsReview` is an editing note.
 */
export interface ShippedBackgroundEntry {
  courseId: string;
  descriptionHash: string;
  clauses: ShippedBackgroundClause[];
  noCreditWith: string[];
}

export interface ShippedBackgroundFile {
  department: string;
  entries: ShippedBackgroundEntry[];
}

/**
 * A short fingerprint of a description: 32-bit FNV-1a over UTF-16 code units,
 * as 8 hex digits. Not cryptographic — it only has to notice that WPI edited a
 * description, and an edit colliding by chance is a 1-in-4-billion miss.
 */
export function hashDescription(text: string): string {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** The authoring file → what the browser downloads. */
export function toShippedFile(file: CourseBackgroundFile): ShippedBackgroundFile {
  return {
    department: file.department,
    entries: file.entries.map((entry) => ({
      courseId: entry.courseId,
      descriptionHash: hashDescription(entry.description),
      clauses: entry.clauses.map(({ sourceText: _sourceText, ...clause }) => clause),
      noCreditWith: entry.noCreditWith,
    })),
  };
}

/**
 * What is known about a course's background right now.
 *
 * - `unchecked`: no entry — the course is new since the descriptions were last read.
 * - `stale`: an entry exists but was read from a description that has since changed.
 * - `none`: read from the current description, which states no background.
 * - `hasBackground`: read from the current description, with clauses or no-credit rules.
 *
 * Only the last two may be trusted; anything built on this data should treat
 * `unchecked` and `stale` as "unknown", never as "no prerequisites".
 */
export type CourseBackgroundStatus =
  | { status: 'unchecked' }
  | { status: 'stale'; entry: ShippedBackgroundEntry }
  | { status: 'none'; entry: ShippedBackgroundEntry }
  | { status: 'hasBackground'; entry: ShippedBackgroundEntry };

/**
 * Classify one course against its department's shipped entries. The tool
 * runs the authoring file through `toShippedFile` first, so the tool and the
 * app reach the same answer by the same code.
 *
 * Args:
 *   file: the course's department file, or null when there is none
 *   courseId: e.g. `AE|2110`
 *   currentDescription: the description the catalog holds right now
 */
export function courseBackgroundStatus(
  file: ShippedBackgroundFile | null,
  courseId: string,
  currentDescription: string,
): CourseBackgroundStatus {
  const entry = file?.entries.find((candidate) => candidate.courseId === courseId);
  if (!entry) return { status: 'unchecked' };
  if (entry.descriptionHash !== hashDescription(currentDescription)) return { status: 'stale', entry };
  const statesSomething = entry.clauses.length > 0 || entry.noCreditWith.length > 0;
  return statesSomething ? { status: 'hasBackground', entry } : { status: 'none', entry };
}

/**
 * Turn a course code as written in prose into a catalog id.
 *
 * Returns:
 *   `"MA|2051"` for "MA 2051", "MA2051" or "ma 2051"; null when the text is not a course code.
 */
export function courseIdFromCode(code: string): string | null {
  const match = /^\s*([A-Za-z]{2,4})\s*([0-9]{3,4}X?)\s*$/.exec(code);
  return match ? `${match[1].toUpperCase()}|${match[2].toUpperCase()}` : null;
}
