/**
 * Schedules the student starred, each under a name they can edit.
 *
 * A favourite is the set of section ids plus a label, so it survives a
 * regeneration: the old app kept a `SchedulePermutation` object and compared it
 * by identity of its `Section` instances, which broke as soon as the producer
 * was rebuilt. The name is the student's own — the search has no stable ordering
 * to name a schedule by, so "schedule #7" would point somewhere else tomorrow.
 */
import { permutationsEqual } from '$lib/scheduling/generator';
import type { SchedulePermutation } from '$lib/scheduling/types';
import {
  browserStorage,
  loadFavorites,
  saveFavorites,
  type SavedFavorite,
  type StorageLike,
} from './persistence';

export type { SavedFavorite };

/** The name offered for a starred schedule that has not been named yet. */
export const DEFAULT_FAVORITE_NAME_PREFIX = 'Favorite';

export class FavoritesState {
  /** Each entry is one favourited schedule: its section ids and its name. */
  schedules = $state<SavedFavorite[]>([]);

  private readonly storage: StorageLike;

  constructor(storage: StorageLike = browserStorage()) {
    this.storage = storage;
  }

  restore(): void {
    this.schedules = loadFavorites(this.storage);
  }

  get count(): number {
    return this.schedules.length;
  }

  contains(permutation: SchedulePermutation): boolean {
    return this.indexOf(permutation) !== -1;
  }

  /** The stored name, or `undefined` when the schedule is not a favourite. */
  nameOf(permutation: SchedulePermutation): string | undefined {
    const index = this.indexOf(permutation);
    return index === -1 ? undefined : this.schedules[index].name;
  }

  add(permutation: SchedulePermutation, name?: string): void {
    if (this.contains(permutation)) return;
    this.schedules = [
      ...this.schedules,
      { sectionIds: [...permutation.sectionIds], name: name ?? this.nextDefaultName() },
    ];
    this.save();
  }

  /** No-op for a schedule that is not starred, so a stale rename cannot add one. */
  rename(permutation: SchedulePermutation, name: string): void {
    const index = this.indexOf(permutation);
    if (index === -1) return;

    this.schedules = this.schedules.map((favorite, at) =>
      at === index ? { ...favorite, name: name.trim() } : favorite,
    );
    this.save();
  }

  remove(permutation: SchedulePermutation): void {
    const index = this.indexOf(permutation);
    if (index === -1) return;

    this.schedules = this.schedules.filter((_, at) => at !== index);
    this.save();
  }

  toggle(permutation: SchedulePermutation): void {
    if (this.contains(permutation)) this.remove(permutation);
    else this.add(permutation);
  }

  /** Favourites as schedules the views can render, in stored order. */
  asPermutations(): SchedulePermutation[] {
    return this.schedules.map(({ sectionIds }) => ({ sectionIds, problems: [] }));
  }

  save(): void {
    saveFavorites($state.snapshot(this.schedules), this.storage);
  }

  private indexOf(permutation: SchedulePermutation): number {
    return this.schedules.findIndex(({ sectionIds }) =>
      permutationsEqual({ sectionIds, problems: [] }, { ...permutation, problems: [] }),
    );
  }

  /** "Favorite 3" — the lowest number no existing favourite has taken. */
  private nextDefaultName(): string {
    const taken = new Set(this.schedules.map(({ name }) => name));
    for (let counter = 1; ; counter++) {
      const candidate = `${DEFAULT_FAVORITE_NAME_PREFIX} ${counter}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
