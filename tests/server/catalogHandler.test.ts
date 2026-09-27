import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  acceptsGzip,
  createCatalogHandler,
  requestedFileName,
  type CatalogSource,
} from '../../server/catalogHandler';

const FEED_LAST_MODIFIED = new Date('2026-09-18T20:30:00Z');
const SCHEDB_JSON = JSON.stringify({ formatVersion: 1, departments: [] });
const YEAR_HEADER_TEXT = '2026 - 2027 Academic Year\nfalse\n';

function fakeSource(): CatalogSource & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    schedbJson: SCHEDB_JSON,
    yearHeaderText: YEAR_HEADER_TEXT,
    feedLastModified: FEED_LAST_MODIFIED,
  }));
}

function makeHandler(source: CatalogSource = fakeSource()) {
  const clock = { now: Date.parse('2026-09-18T21:00:00Z') };
  const handler = createCatalogHandler({ source, now: () => clock.now });
  return { handler, clock, source };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://planner.example${path}`, { headers });

describe('createCatalogHandler', () => {
  it('serves schedb.json by path segment', async () => {
    const { handler } = makeHandler();
    const response = await handler(get('/api/catalog/schedb.json'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(await response.text()).toBe(SCHEDB_JSON);
  });

  it('serves yearHeader.txt by the file query parameter, as the Vercel rewrite sends it', async () => {
    const { handler } = makeHandler();
    const response = await handler(get('/api/catalog?file=yearHeader.txt'));
    expect(response.headers.get('content-type')).toMatch(/text\/plain/);
    expect(await response.text()).toBe(YEAR_HEADER_TEXT);
  });

  it('gzips the body when the client accepts it', async () => {
    const { handler } = makeHandler();
    const response = await handler(get('/schedb.json', { 'accept-encoding': 'gzip, br' }));
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    const compressed = Buffer.from(await response.arrayBuffer());
    expect(gunzipSync(compressed).toString('utf8')).toBe(SCHEDB_JSON);
  });

  it('lets shared caches keep the file for exactly the ten-minute window', async () => {
    const { handler } = makeHandler();
    const cacheControl = (await handler(get('/schedb.json'))).headers.get('cache-control');
    expect(cacheControl).toContain('s-maxage=600');
    expect(cacheControl).toContain('max-age=0');
  });

  it('shortens s-maxage to what is left of the in-memory copy, so the CDN never extends it', async () => {
    const { handler, clock } = makeHandler();
    await handler(get('/schedb.json'));
    clock.now += 4 * 60_000;
    const response = await handler(get('/yearHeader.txt'));
    expect(response.headers.get('cache-control')).toContain('s-maxage=360');
  });

  it('fetches the feed once per window, however many requests arrive', async () => {
    const { handler, clock, source } = makeHandler();
    await handler(get('/schedb.json'));
    await handler(get('/yearHeader.txt'));
    clock.now += 9 * 60_000;
    await handler(get('/schedb.json'));
    expect(source).toHaveBeenCalledTimes(1);

    clock.now += 60_000;
    await handler(get('/schedb.json'));
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('reports when the feed was last regenerated upstream and when it was fetched', async () => {
    const { handler, clock } = makeHandler();
    const response = await handler(get('/schedb.json'));
    expect(response.headers.get('last-modified')).toBe(FEED_LAST_MODIFIED.toUTCString());
    expect(response.headers.get('x-catalog-fetched-at')).toBe(new Date(clock.now).toISOString());
  });

  it('allows cross-origin reads so other services can use the endpoint', async () => {
    const { handler } = makeHandler();
    const response = await handler(get('/schedb.json'));
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers a CORS preflight without touching the feed', async () => {
    const { handler, source } = makeHandler();
    const response = await handler(new Request('https://planner.example/schedb.json', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(source).not.toHaveBeenCalled();
  });

  it('sends headers but no body for HEAD', async () => {
    const { handler } = makeHandler();
    const response = await handler(new Request('https://planner.example/schedb.json', { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('rejects methods other than GET and HEAD', async () => {
    const { handler } = makeHandler();
    const response = await handler(new Request('https://planner.example/schedb.json', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toContain('GET');
  });

  it('names the available files when asked for an unknown one', async () => {
    const { handler, source } = makeHandler();
    const response = await handler(get('/api/catalog/secrets.env'));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('schedb.json, yearHeader.txt');
    expect(source).not.toHaveBeenCalled();
  });

  it('returns an uncacheable 502 naming the cause when the feed fails and nothing is cached', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handler } = makeHandler(async () => {
      throw new Error('The course listings feed returned 503');
    });
    const response = await handler(get('/schedb.json'));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('returned 503');
    consoleError.mockRestore();
  });

  it('keeps serving the previous catalog, and logs why, when a refresh fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failing = false;
    const { handler, clock } = makeHandler(async () => {
      if (failing) throw new Error('feed down');
      return { schedbJson: SCHEDB_JSON, yearHeaderText: YEAR_HEADER_TEXT, feedLastModified: FEED_LAST_MODIFIED };
    });
    await handler(get('/schedb.json'));
    failing = true;
    clock.now += 10 * 60_000;

    const response = await handler(get('/schedb.json'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(SCHEDB_JSON);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('requestedFileName', () => {
  it('prefers the file query parameter over the path', () => {
    expect(requestedFileName(new URL('https://x/api/catalog?file=schedb.json'))).toBe('schedb.json');
  });

  it('falls back to the last path segment', () => {
    expect(requestedFileName(new URL('https://x/data/yearHeader.txt'))).toBe('yearHeader.txt');
  });
});

describe('acceptsGzip', () => {
  it.each([
    ['gzip, deflate, br', true],
    ['br;q=1.0, gzip;q=0.8', true],
    ['*', true],
    ['gzip;q=0', false],
    ['br', false],
    ['', false],
  ])('%j -> %s', (header, expected) => {
    expect(acceptsGzip(header)).toBe(expected);
  });

  it('treats a missing header as identity only', () => {
    expect(acceptsGzip(null)).toBe(false);
  });
});
