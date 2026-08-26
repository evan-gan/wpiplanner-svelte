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

  it('names a new favourite after the lowest unused number', () => {
    const favorites = make();
    favorites.add(schedule);
    favorites.add(other);
    expect(favorites.schedules.map(({ name }) => name)).toEqual(['Favorite 1', 'Favorite 2']);
  });

  it('keeps the name it was given', () => {
    const favorites = make();
    favorites.add(schedule, 'No 8ams');
    expect(favorites.nameOf(schedule)).toBe('No 8ams');
  });

  it('renames a favourite, trimming what was typed', () => {
    const favorites = make();
    favorites.add(schedule);
    favorites.rename(schedule, '  Fridays off  ');
    expect(favorites.nameOf(schedule)).toBe('Fridays off');
  });

  it('renames by section set, not by the order the sections came in', () => {
    const favorites = make();
    favorites.add(schedule);
    favorites.rename({ sectionIds: [...schedule.sectionIds].reverse(), problems: [] }, 'Reordered');
    expect(favorites.nameOf(schedule)).toBe('Reordered');
  });

  it('ignores a rename of a schedule that is not starred', () => {
    const favorites = make();
    favorites.rename(schedule, 'Ghost');
    expect(favorites.count).toBe(0);
  });

  it('has no name for a schedule that is not starred', () => {
    expect(make().nameOf(schedule)).toBeUndefined();
  });

  it('restores what was saved', () => {
    const storage = createMemoryStorage();
    const first = new FavoritesState(storage);
    first.add(schedule);

    const second = new FavoritesState(storage);
    second.restore();
    expect(second.contains(schedule)).toBe(true);
  });

  it('restores the names too', () => {
    const storage = createMemoryStorage();
    const first = new FavoritesState(storage);
    first.add(schedule, 'No 8ams');

    const second = new FavoritesState(storage);
    second.restore();
    expect(second.nameOf(schedule)).toBe('No 8ams');
  });
});
