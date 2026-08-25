/**
 * Schedules the student starred.
 *
 * A favourite is just the set of section ids, so it survives a regeneration:
 * the old app kept a `SchedulePermutation` object and compared it by identity of
 * its `Section` instances, which broke as soon as the producer was rebuilt.
 */
import { permutationsEqual } from '$lib/scheduling/generator';
import type { SchedulePermutation } from '$lib/scheduling/types';
import {
  browserStorage,
  loadFavorites,
  saveFavorites,
  type StorageLike,
} from './persistence';

export class FavoritesState {
  /** Each entry is the section ids of one favourited schedule. */
  schedules = $state<string[][]>([]);

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
    return this.schedules.some((sectionIds) =>
      permutationsEqual({ sectionIds, problems: [] }, { ...permutation, problems: [] }),
    );
  }

  add(permutation: SchedulePermutation): void {
    if (this.contains(permutation)) return;
    this.schedules = [...this.schedules, [...permutation.sectionIds]];
    this.save();
  }

  remove(permutation: SchedulePermutation): void {
    this.schedules = this.schedules.filter(
      (sectionIds) =>
        !permutationsEqual({ sectionIds, problems: [] }, { ...permutation, problems: [] }),
    );
    this.save();
  }

  toggle(permutation: SchedulePermutation): void {
    if (this.contains(permutation)) this.remove(permutation);
    else this.add(permutation);
  }

  /** Favourites as schedules the views can render. */
  asPermutations(): SchedulePermutation[] {
    return this.schedules.map((sectionIds) => ({ sectionIds, problems: [] }));
  }

  save(): void {
    saveFavorites($state.snapshot(this.schedules), this.storage);
  }
}
