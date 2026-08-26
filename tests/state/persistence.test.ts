import { describe, expect, it, vi } from 'vitest';
import { TERM_NAMES } from '$lib/model/terms';
import { GRID_CELL_COUNT, cellIndex } from '$lib/model/timeGrid';
import {
  STORAGE_KEYS,
  createMemoryStorage,
  loadChosenTimes,
  loadFavorites,
  loadSelectedDepartments,
  loadSelection,
  saveChosenTimes,
  saveFavorites,
  saveSelectedDepartments,
  saveSelection,
} from '$lib/state/persistence';

function blankTimes() {
  return Object.fromEntries(
    TERM_NAMES.map((term) => [term, new Array<boolean>(GRID_CELL_COUNT).fill(true)]),
  ) as Record<(typeof TERM_NAMES)[number], boolean[]>;
}

describe('selection persistence', () => {
  it('round-trips chosen courses and their denied sections', () => {
    const storage = createMemoryStorage();
    const selection = [
      { courseId: 'CS|2102', deniedSectionIds: ['CS|2102|A02'] },
      { courseId: 'MA|1021', deniedSectionIds: [] },
    ];

    saveSelection(selection, storage);
    expect(loadSelection(storage)).toEqual(selection);
  });

  it('returns an empty selection when nothing was ever saved', () => {
    expect(loadSelection(createMemoryStorage())).toEqual([]);
  });

  it('ignores a corrupt payload rather than failing to start', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.selection, '{not json');
    expect(loadSelection(storage)).toEqual([]);
  });

  it('ignores a payload of the right JSON but the wrong shape', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.selection, '{"courses": "all of them"}');
    expect(loadSelection(storage)).toEqual([]);
  });

  it('namespaces its key so the legacy "savedCourse" data is left alone', () => {
    const storage = createMemoryStorage();
    storage.setItem('savedCourse', '[{"dept":"CS","name":"2102","sections":[]}]');
    saveSelection([{ courseId: 'CS|2102', deniedSectionIds: [] }], storage);

    expect(STORAGE_KEYS.selection).toMatch(/^wpiplanner\.v2\./);
    expect(loadSelection(storage)).toHaveLength(1);
    expect(storage.getItem('savedCourse')).not.toBeNull();
  });
});

describe('chosen-times persistence', () => {
  it('round-trips a grid with a few cells blocked', () => {
    const storage = createMemoryStorage();
    const times = blankTimes();
    times.A[cellIndex(0, 0)] = false;
    times.C[cellIndex(5, 3)] = false;

    saveChosenTimes(times, storage);
    expect(loadChosenTimes(storage)).toEqual(times);
  });

  it('defaults to every cell available when nothing was saved', () => {
    const loaded = loadChosenTimes(createMemoryStorage());
    expect(loaded.A.every((cell) => cell)).toBe(true);
    expect(Object.keys(loaded).sort()).toEqual([...TERM_NAMES].sort());
  });

  it('stores only the blocked cells, since most students block none', () => {
    const storage = createMemoryStorage();
    const times = blankTimes();
    times.A[7] = false;

    saveChosenTimes(times, storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.chosenTimes)!)).toEqual({
      A: [7],
      B: [],
      C: [],
      D: [],
    });
  });

  it('drops out-of-range cell indexes from a hand-edited payload', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.chosenTimes, JSON.stringify({ A: [-1, 5, 99999] }));

    const loaded = loadChosenTimes(storage);
    expect(loaded.A[5]).toBe(false);
    expect(loaded.A.filter((cell) => !cell)).toHaveLength(1);
  });
});

describe('favorites persistence', () => {
  it('round-trips favorited schedules with their names', () => {
    const storage = createMemoryStorage();
    const favorites = [
      { sectionIds: ['CS|2102|A01', 'MA|1021|A01'], name: 'No 8ams' },
      { sectionIds: ['CS|2102|A02'], name: '' },
    ];

    saveFavorites(favorites, storage);
    expect(loadFavorites(storage)).toEqual(favorites);
  });

  it('reads a favorite saved before names existed, giving it a blank name', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.favorites, JSON.stringify([['CS|2102|A01', 'MA|1021|A01']]));

    expect(loadFavorites(storage)).toEqual([
      { sectionIds: ['CS|2102|A01', 'MA|1021|A01'], name: '' },
    ]);
  });

  it('skips a favorite saved in the legacy hex-CRN format instead of failing', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEYS.favorites, JSON.stringify(['01000000004E20AAAA']));
    expect(loadFavorites(storage)).toEqual([]);
  });

  it('drops an entry whose section ids are unreadable', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify([{ sectionIds: [3, 4], name: 'broken' }, { sectionIds: ['CS|2102|A01'] }]),
    );

    expect(loadFavorites(storage)).toEqual([{ sectionIds: ['CS|2102|A01'], name: '' }]);
  });
});

describe('selected departments persistence', () => {
  it('round-trips the department picker selection', () => {
    const storage = createMemoryStorage();
    saveSelectedDepartments(['CS', 'MA'], storage);
    expect(loadSelectedDepartments(storage)).toEqual(['CS', 'MA']);
  });

  it('returns null, not an empty list, when nothing was saved', () => {
    // Null means "first visit", which the picker answers by preselecting MA —
    // an empty list means "the student deselected everything".
    expect(loadSelectedDepartments(createMemoryStorage())).toBeNull();
  });

  it('distinguishes a deliberately empty selection from a first visit', () => {
    const storage = createMemoryStorage();
    saveSelectedDepartments([], storage);
    expect(loadSelectedDepartments(storage)).toEqual([]);
  });
});

describe('storage that refuses to cooperate', () => {
  it('does not throw when writing fails, such as in private browsing', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(() => saveSelection([{ courseId: 'CS|2102', deniedSectionIds: [] }], failing)).not.toThrow();
  });

  it('does not throw when reading fails', () => {
    const failing = {
      getItem: () => {
        throw new DOMException('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };

    expect(loadSelection(failing)).toEqual([]);
  });
});
