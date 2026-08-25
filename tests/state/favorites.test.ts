import { describe, expect, it } from 'vitest';
import { FavoritesState } from '$lib/state/favorites.svelte';
import { createMemoryStorage } from '$lib/state/persistence';

const schedule = { sectionIds: ['CS|2102|A01', 'MA|1021|A02'], problems: [] };
const other = { sectionIds: ['CS|2102|A02', 'MA|1021|A02'], problems: [] };

const make = () => new FavoritesState(createMemoryStorage());

describe('FavoritesState', () => {
  it('starts empty', () => {
    expect(make().count).toBe(0);
  });

  it('stars a schedule', () => {
    const favorites = make();
    favorites.add(schedule);
    expect(favorites.contains(schedule)).toBe(true);
    expect(favorites.count).toBe(1);
  });

  it('does not star the same schedule twice', () => {
    const favorites = make();
    favorites.add(schedule);
    favorites.add(schedule);
    expect(favorites.count).toBe(1);
  });

  it('recognises a schedule whose sections come back in a different order', () => {
    const favorites = make();
    favorites.add(schedule);
    expect(favorites.contains({ sectionIds: [...schedule.sectionIds].reverse(), problems: [] })).toBe(
      true,
    );
  });

  it('does not confuse two schedules that share a section', () => {
    const favorites = make();
    favorites.add(schedule);
    expect(favorites.contains(other)).toBe(false);
  });

  it('unstars a schedule', () => {
    const favorites = make();
    favorites.add(schedule);
    favorites.remove(schedule);
    expect(favorites.count).toBe(0);
  });

  it('toggles', () => {
    const favorites = make();
    favorites.toggle(schedule);
    expect(favorites.contains(schedule)).toBe(true);
    favorites.toggle(schedule);
    expect(favorites.contains(schedule)).toBe(false);
  });

  it('hands favourites back as schedules the views can render', () => {
    const favorites = make();
    favorites.add(schedule);
    expect(favorites.asPermutations()).toEqual([{ sectionIds: schedule.sectionIds, problems: [] }]);
  });

  it('restores what was saved', () => {
    const storage = createMemoryStorage();
    const first = new FavoritesState(storage);
    first.add(schedule);

    const second = new FavoritesState(storage);
    second.restore();
    expect(second.contains(schedule)).toBe(true);
  });
});
