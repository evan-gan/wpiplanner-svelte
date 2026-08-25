/**
 * Fetches and validates `schedb.json`.
 *
 * Replaces `Scheduler.java` + `LoadSchedule.java`, which opened a raw
 * XMLHttpRequest, hooked `onprogress` through JSNI, and then tried three parse
 * strategies in sequence (XML, XML-minus-first-line, JSON) before giving up with
 * a `Window.alert`. There is one format now, and a failure is a typed error the
 * UI can render.
 */
import { Catalog } from '$lib/model/catalog';
import type { SchedbFile } from '$lib/model/schedb';

/**
 * Where the catalog lives, relative to the site root.
 *
 * Callers pass an absolute path built from SvelteKit's `base`, because a route
 * like `/schedules/` would otherwise resolve a bare filename against itself.
 */
export const CATALOG_URL = '/schedb.json';

export interface LoadProgress {
  /** Bytes received so far. */
  loaded: number;
  /** Bytes the server promised, or 0 when it did not send Content-Length. */
  total: number;
}

export interface LoadCatalogOptions {
  /** Overrides {@link CATALOG_URL}; pass `${base}/schedb.json` under a subpath. */
  url?: string;
  /** Called as bytes arrive, so the loading screen can show a real bar. */
  onProgress?: (progress: LoadProgress) => void;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Thrown for anything that stops the catalog from loading. */
export class CatalogLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'CatalogLoadError';
  }
}

/**
 * Read the whole response body, reporting byte progress as it arrives.
 *
 * Falls back to `response.text()` when the body is not a stream, which is what
 * happens under test runners and in older Safari.
 */
async function readBodyWithProgress(
  response: Response,
  onProgress?: (progress: LoadProgress) => void,
): Promise<string> {
  const total = Number(response.headers.get('content-length') ?? 0);
  const body = response.body;

  if (body === null || typeof body.getReader !== 'function') {
    const text = await response.text();
    onProgress?.({ loaded: text.length, total: total || text.length });
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    chunks.push(decoder.decode(value, { stream: true }));
    onProgress?.({ loaded, total });
  }
  chunks.push(decoder.decode());

  return chunks.join('');
}

/**
 * Fetch `schedb.json` and build the {@link Catalog} index from it.
 *
 * @throws CatalogLoadError when the request fails, the body is not JSON, or the
 *   file was written by a different converter version
 */
export async function loadCatalog(options: LoadCatalogOptions = {}): Promise<Catalog> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = options.url ?? CATALOG_URL;
  let response: Response;

  try {
    response = await doFetch(url, { signal: options.signal });
  } catch (cause) {
    throw new CatalogLoadError(
      `Could not reach ${url}. Check the network connection and reload.`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new CatalogLoadError(
      `Loading ${url} failed with HTTP ${response.status} ${response.statusText}. ` +
        `The schedule data may not have been deployed alongside the app.`,
    );
  }

  const text = await readBodyWithProgress(response, options.onProgress);

  let parsed: SchedbFile;
  try {
    parsed = JSON.parse(text) as SchedbFile;
  } catch (cause) {
    throw new CatalogLoadError(
      `${url} is not valid JSON. Re-run \`pnpm run data:build\` to regenerate it.`,
      { cause },
    );
  }

  // The Catalog constructor checks formatVersion and throws with instructions.
  try {
    return new Catalog(parsed);
  } catch (cause) {
    throw new CatalogLoadError((cause as Error).message, { cause });
  }
}
