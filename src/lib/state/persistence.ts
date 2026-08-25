/**
 * Reading and writing everything the app keeps in `localStorage`.
 *
 * All keys are namespaced under `wpiplanner.v2.`. The formats all changed in the
 * rewrite — courses are keyed by id rather than by `{dept, name}`, chosen times
 * are cell indexes rather than clock strings, favourites are section ids rather
 * than hex CRNs — so the legacy keys are ignored rather than half-migrated.
 * PLAN.md §5 records that as a deliberate decision.
 *
 * Every function here is total: a corrupt or hand-edited payload yields the
 * default rather than an exception, because a bad saved schedule must not stop
 * the app from starting. The legacy code called `e.printStackTrace()` and
 * carried on with a half-populated model.
 */
import type { TermName } from '$lib/model/schedb';
import { TERM_NAMES } from '$lib/model/terms';
import { GRID_CELL_COUNT } from '$lib/model/timeGrid';
import type { ChosenTimes } from '$lib/scheduling/types';

const NAMESPACE = 'wpiplanner.v2.';

export const STORAGE_KEYS = {
  selection: `${NAMESPACE}selection`,
  selectedDepts: `${NAMESPACE}selectedDepts`,
  chosenTimes: `${NAMESPACE}chosenTimes`,
  favorites: `${NAMESPACE}favorites`,
} as const;

/** The slice of the Storage API this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One chosen course and the sections the student has switched off. */
export interface SavedCourse {
  courseId: string;
  deniedSectionIds: string[];
}

/** An in-memory stand-in, for tests and for SSR where there is no window. */
export function createMemoryStorage(): StorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

/**
 * The browser's `localStorage`, or a memory stand-in when it is unavailable.
 *
 * Safari in private mode and some enterprise policies make even *touching*
 * `localStorage` throw, so this is probed rather than assumed.
 */
export function browserStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access itself threw — fall through to the memory stand-in.
  }
  return createMemoryStorage();
}

function readJson<T>(key: string, storage: StorageLike): T | undefined {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown, storage: StorageLike): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled store must not break the interaction that triggered
    // the save; the student simply will not get their schedule back next visit.
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function saveSelection(courses: readonly SavedCourse[], storage: StorageLike): void {
  writeJson(STORAGE_KEYS.selection, courses, storage);
}

export function loadSelection(storage: StorageLike): SavedCourse[] {
  const parsed = readJson<unknown>(STORAGE_KEYS.selection, storage);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (entry): entry is SavedCourse =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as SavedCourse).courseId === 'string' &&
      isStringArray((entry as SavedCourse).deniedSectionIds),
  );
}

export function saveSelectedDepartments(abbrevs: readonly string[], storage: StorageLike): void {
  writeJson(STORAGE_KEYS.selectedDepts, abbrevs, storage);
}

/** Null means "never chosen", which the picker answers by preselecting MA. */
export function loadSelectedDepartments(storage: StorageLike): string[] | null {
  const parsed = readJson<unknown>(STORAGE_KEYS.selectedDepts, storage);
  return isStringArray(parsed) ? parsed : null;
}

/**
 * Persist the availability grid as the *blocked* cells only.
 *
 * Almost every student blocks a handful of cells out of 400, so storing the
 * exceptions keeps the payload tiny and makes "everything available" the natural
 * default for a first visit.
 */
export function saveChosenTimes(times: ChosenTimes, storage: StorageLike): void {
  const blocked: Record<string, number[]> = {};

  for (const term of TERM_NAMES) {
    blocked[term] = times[term].flatMap((available, index) => (available ? [] : [index]));
  }

  writeJson(STORAGE_KEYS.chosenTimes, blocked, storage);
}

export function loadChosenTimes(storage: StorageLike): ChosenTimes {
  const times = {} as ChosenTimes;
  for (const term of TERM_NAMES) {
    times[term] = new Array<boolean>(GRID_CELL_COUNT).fill(true);
  }

  const parsed = readJson<Record<string, unknown>>(STORAGE_KEYS.chosenTimes, storage);
  if (typeof parsed !== 'object' || parsed === null) return times;

  for (const term of TERM_NAMES) {
    const blocked = parsed[term];
    if (!Array.isArray(blocked)) continue;

    for (const index of blocked) {
      if (typeof index !== 'number') continue;
      if (index < 0 || index >= GRID_CELL_COUNT) continue;
      times[term][index] = false;
    }
  }

  return times;
}

/** Favourited schedules, each as the ids of its sections. */
export function saveFavorites(favorites: readonly string[][], storage: StorageLike): void {
  writeJson(STORAGE_KEYS.favorites, favorites, storage);
}

export function loadFavorites(storage: StorageLike): string[][] {
  const parsed = readJson<unknown>(STORAGE_KEYS.favorites, storage);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isStringArray);
}

/** Terms are the keys of a {@link ChosenTimes}; re-exported for callers. */
export type { TermName };
