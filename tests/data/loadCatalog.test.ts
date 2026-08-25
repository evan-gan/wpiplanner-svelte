import { describe, expect, it, vi } from 'vitest';
import { CatalogLoadError, loadCatalog } from '$lib/data/loadCatalog';
import { EMPTY_YEAR_HEADER, loadYearHeader, parseYearHeader } from '$lib/data/yearHeader';
import { MINI_CATALOG } from '../fixtures/miniCatalog';

function jsonResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, ...init });
}

describe('loadCatalog', () => {
  it('builds a Catalog from a well-formed file', async () => {
    const catalog = await loadCatalog({
      fetchImpl: async () => jsonResponse(JSON.stringify(MINI_CATALOG)),
    });
    expect(catalog.counts.sections).toBe(5);
  });

  it('reports byte progress while the body streams in', async () => {
    const onProgress = vi.fn();
    await loadCatalog({
      fetchImpl: async () =>
        jsonResponse(JSON.stringify(MINI_CATALOG), {
          headers: { 'content-length': '1234' },
        }),
      onProgress,
    });
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls.at(-1)?.[0].loaded).toBeGreaterThan(0);
  });

  it('announces each load stage in order, so the loading screen can name it', async () => {
    const stages: string[] = [];
    await loadCatalog({
      fetchImpl: async () => jsonResponse(JSON.stringify(MINI_CATALOG)),
      onStage: (stage) => stages.push(stage),
    });
    expect(stages).toEqual(['connecting', 'downloading', 'parsing']);
  });

  it('stops reporting stages once the request fails', async () => {
    const stages: string[] = [];
    await expect(
      loadCatalog({
        fetchImpl: async () => new Response('nope', { status: 404, statusText: 'Not Found' }),
        onStage: (stage) => stages.push(stage),
      }),
    ).rejects.toThrow(CatalogLoadError);
    expect(stages).toEqual(['connecting']);
  });

  it('explains a network failure instead of surfacing a raw TypeError', async () => {
    await expect(
      loadCatalog({
        fetchImpl: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    ).rejects.toThrow(CatalogLoadError);
  });

  it('names the status code when the file is missing', async () => {
    await expect(
      loadCatalog({
        fetchImpl: async () => new Response('', { status: 404, statusText: 'Not Found' }),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('points at data:build when the body is not JSON', async () => {
    await expect(
      loadCatalog({ fetchImpl: async () => jsonResponse('<?xml version="1.1"?><schedb/>') }),
    ).rejects.toThrow(/data:build/);
  });

  it('points at data:build when the format version does not match', async () => {
    const stale = JSON.stringify({ ...MINI_CATALOG, formatVersion: 0 });
    await expect(loadCatalog({ fetchImpl: async () => jsonResponse(stale) })).rejects.toThrow(
      /formatVersion/,
    );
  });
});

describe('parseYearHeader', () => {
  it('reads the year and the old-schedule flag', () => {
    expect(parseYearHeader('2024 - 2025 Academic Year\ntrue')).toEqual({
      year: '2024 - 2025 Academic Year',
      showOldScheduleLink: true,
    });
  });

  it('treats anything other than "true" as not showing the link', () => {
    expect(parseYearHeader('2024 - 2025\nfalse').showOldScheduleLink).toBe(false);
  });

  it('tolerates a missing second line', () => {
    expect(parseYearHeader('2024 - 2025')).toEqual({
      year: '2024 - 2025',
      showOldScheduleLink: false,
    });
  });
});

describe('loadYearHeader', () => {
  it('falls back to a blank header rather than failing the page', async () => {
    const header = await loadYearHeader(async () => {
      throw new Error('offline');
    });
    expect(header).toEqual(EMPTY_YEAR_HEADER);
  });
});

describe('URL handling', () => {
  it('fetches the catalog from the site root by default', async () => {
    const seen: string[] = [];
    await loadCatalog({
      fetchImpl: async (input) => {
        seen.push(String(input));
        return jsonResponse(JSON.stringify(MINI_CATALOG));
      },
    });
    // A bare "schedb.json" would resolve against /schedules/ and 404 there.
    expect(seen).toEqual(['/schedb.json']);
  });

  it('accepts a base-prefixed URL for a subdirectory deployment', async () => {
    const seen: string[] = [];
    await loadCatalog({
      url: '/planner/schedb.json',
      fetchImpl: async (input) => {
        seen.push(String(input));
        return jsonResponse(JSON.stringify(MINI_CATALOG));
      },
    });
    expect(seen).toEqual(['/planner/schedb.json']);
  });
});
