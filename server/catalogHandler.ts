/**
 * The live catalog endpoint, as a plain Web-standard `(Request) => Response`.
 *
 * Nothing in here knows about Vercel. The same handler runs anywhere that
 * speaks Fetch API requests — Vercel, Netlify, Deno, Bun, Cloudflare Workers
 * with `nodejs_compat`, or Node behind a small adapter — and `api/catalog.ts`
 * is only the line that mounts it. See `server/README.md`.
 *
 * Freshness is layered, and both layers use the same max age (10 minutes):
 *
 * 1. In process, a {@link RefreshingCache} rebuilds the catalog on the first
 *    request after it expires, so a warm instance serves every file from memory.
 * 2. In front, `s-maxage` tells any shared cache (Vercel's CDN, Cloudflare, a
 *    reverse proxy) to hold the response for the *remaining* lifetime of that
 *    in-process copy. Most visitors never reach the function at all.
 *
 * Browsers get `max-age=0`, so a reload always asks the CDN and never shows a
 * copy older than the CDN's.
 */
import {
  refreshCatalog,
  type CatalogFiles,
  type RefreshOptions,
} from '../tools/workday-to-schedb/src/refresh.ts';
import { RefreshingCache, type CacheRead } from './refreshingCache.ts';

export const DEFAULT_MAX_AGE_SECONDS = 600;

/** After a failed refresh, how long to serve the old copy before trying the feed again. */
const RETRY_AFTER_FAILURE_SECONDS = 60;

/** How long a shared cache may keep serving an old copy if this endpoint starts failing. */
const STALE_IF_ERROR_SECONDS = 86_400;

export const CATALOG_FILE_NAMES = ['schedb.json', 'yearHeader.txt'] as const;
export type CatalogFileName = (typeof CATALOG_FILE_NAMES)[number];

/** What a data source must produce; {@link refreshCatalog} is the default one. */
export type CatalogSource = () => Promise<CatalogFiles & { feedLastModified: Date }>;

export interface CatalogHandlerOptions extends RefreshOptions {
  /** How long one fetch of the feed is served before the next request refetches. */
  maxAgeSeconds?: number;
  /** Replaces the Workday fetch — for tests, or to serve some other feed. */
  source?: CatalogSource;
  /** Injected by tests; defaults to `Date.now`. */
  now?: () => number;
}

export type CatalogHandler = (request: Request) => Promise<Response>;

/** One file, encoded once per refresh rather than once per request. */
interface ServedFile {
  contentType: string;
  body: Uint8Array;
  gzipBody: Uint8Array;
}

interface Snapshot {
  files: Record<CatalogFileName, ServedFile>;
  lastModified: Date;
}

const CORS_HEADERS = {
  // The catalog is public course data; letting other sites read it is the point.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

/**
 * Build a handler that serves `schedb.json` and `yearHeader.txt`, refetching the
 * feed at most once per `maxAgeSeconds`.
 *
 * The file is taken from the `file` query parameter, else the last path segment,
 * so it works whether it is mounted at `/catalog/:file` or behind a rewrite.
 *
 * Create the handler once, at module scope: the cache lives in its closure, so
 * a handler created per request would refetch the feed every time.
 */
export function createCatalogHandler(options: CatalogHandlerOptions = {}): CatalogHandler {
  const now = options.now ?? Date.now;
  const source = options.source ?? (() => refreshCatalog(options));
  const cache = new RefreshingCache<Snapshot>({
    load: async () => prepareSnapshot(await source()),
    maxAgeMs: (options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS) * 1000,
    retryAfterFailureMs: RETRY_AFTER_FAILURE_SECONDS * 1000,
    now,
  });

  return (request) => handleRequest(request, cache, now);
}

async function handleRequest(
  request: Request,
  cache: RefreshingCache<Snapshot>,
  now: () => number,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse(405, `${request.method} is not supported; use GET.`, {
      Allow: 'GET, HEAD, OPTIONS',
    });
  }

  const fileName = requestedFileName(new URL(request.url));
  if (!isCatalogFileName(fileName)) {
    return textResponse(404, `Unknown file "${fileName}". Available: ${CATALOG_FILE_NAMES.join(', ')}.`);
  }

  let read: CacheRead<Snapshot>;
  try {
    read = await cache.read();
  } catch (error) {
    console.error('Catalog refresh failed with no previous copy to serve:', error);
    return textResponse(502, `Could not build the catalog from the course feed: ${(error as Error).message}`);
  }
  if (read.staleBecause !== undefined) {
    console.error('Catalog refresh failed; serving the previous copy:', read.staleBecause);
  }

  return fileResponse(request, read, read.value.files[fileName], now());
}

function fileResponse(
  request: Request,
  read: CacheRead<Snapshot>,
  file: ServedFile,
  nowMs: number,
): Response {
  const useGzip = acceptsGzip(request.headers.get('accept-encoding'));
  const body = useGzip ? file.gzipBody : file.body;
  const secondsLeft = Math.max(0, Math.ceil((read.expiresAt - nowMs) / 1000));

  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    'Content-Type': file.contentType,
    'Cache-Control':
      `public, max-age=0, must-revalidate, s-maxage=${secondsLeft}, ` +
      `stale-if-error=${STALE_IF_ERROR_SECONDS}`,
    'Last-Modified': read.value.lastModified.toUTCString(),
    'X-Catalog-Fetched-At': new Date(read.loadedAt).toISOString(),
    Vary: 'Accept-Encoding',
  };
  // Compressing here keeps the 4MB catalog far under per-response limits such
  // as Vercel's 4.5MB, which apply before the CDN would compress it.
  if (useGzip) headers['Content-Encoding'] = 'gzip';

  return new Response(request.method === 'HEAD' ? null : (body as BodyInit), { status: 200, headers });
}

function textResponse(status: number, message: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      // The 404 message echoes the requested name; never let a browser sniff it as HTML.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}

async function prepareSnapshot(files: Awaited<ReturnType<CatalogSource>>): Promise<Snapshot> {
  const [schedb, yearHeader] = await Promise.all([
    encodeFile(files.schedbJson, 'application/json; charset=utf-8'),
    encodeFile(files.yearHeaderText, 'text/plain; charset=utf-8'),
  ]);
  return {
    files: { 'schedb.json': schedb, 'yearHeader.txt': yearHeader },
    lastModified: files.feedLastModified,
  };
}

async function encodeFile(text: string, contentType: string): Promise<ServedFile> {
  const body = new TextEncoder().encode(text);
  return { contentType, body, gzipBody: await gzip(body) };
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

export function requestedFileName(url: URL): string {
  return url.searchParams.get('file') ?? url.pathname.split('/').at(-1) ?? '';
}

function isCatalogFileName(name: string): name is CatalogFileName {
  return (CATALOG_FILE_NAMES as readonly string[]).includes(name);
}

/**
 * Whether an `Accept-Encoding` header allows gzip.
 *
 * Honours `q=0`, which is how a client says "anything but this".
 */
export function acceptsGzip(acceptEncoding: string | null): boolean {
  if (acceptEncoding === null) return false;
  return acceptEncoding.split(',').some((entry) => {
    const [coding = '', ...parameters] = entry.split(';').map((part) => part.trim().toLowerCase());
    if (coding !== 'gzip' && coding !== '*') return false;
    const quality = parameters.find((parameter) => parameter.startsWith('q='));
    return quality === undefined || Number(quality.slice(2)) > 0;
  });
}
