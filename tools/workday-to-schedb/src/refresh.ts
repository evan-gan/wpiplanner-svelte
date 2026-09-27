/**
 * The whole refresh — fetch the feed, convert it, render the two files — as one
 * function with no file I/O.
 *
 * The CLI writes the result to `static/`; the live endpoint in `server/` serves
 * it straight from memory. Both go through {@link renderCatalogFiles}, so the
 * bytes a deploy ships and the bytes the endpoint serves cannot drift.
 */
import { buildSchedb, type ConversionResult } from './buildSchedb.ts';
import { fetchFeed, formatGenerated, FEED_URL } from './fetchFeed.ts';

/** The two files the app loads, as text. */
export interface CatalogFiles {
  /** Contents of `schedb.json`. */
  schedbJson: string;
  /** Contents of `yearHeader.txt`: the academic year, then the `/old` link flag. */
  yearHeaderText: string;
}

export interface RenderOptions {
  /** Line 2 of the year header: offer the link to last year's planner. */
  showOldLink?: boolean;
  /** Indent the catalog (much larger; for inspection only). */
  pretty?: boolean;
}

export function renderCatalogFiles(
  result: ConversionResult,
  { showOldLink = false, pretty = false }: RenderOptions = {},
): CatalogFiles {
  return {
    schedbJson: JSON.stringify(result.data, null, pretty ? 2 : undefined),
    yearHeaderText: `${result.yearHeaderLine}\n${showOldLink}\n`,
  };
}

export interface RefreshOptions extends RenderOptions {
  /** Overrides {@link FEED_URL}. */
  feedUrl?: string;
  /** Injected by tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RefreshedCatalog extends CatalogFiles {
  /** The feed's `Last-Modified`: when WPI last regenerated it, not when we fetched it. */
  feedLastModified: Date;
  /** The full conversion, for callers that want the stats or the anomaly log. */
  result: ConversionResult;
}

/**
 * Fetch the live feed and convert it into the files the app loads.
 *
 * @throws Error when the feed cannot be fetched or is not the expected shape;
 *   the message names the cause (see `fetchFeed`)
 */
export async function refreshCatalog(options: RefreshOptions = {}): Promise<RefreshedCatalog> {
  const feed = await fetchFeed(options.feedUrl ?? FEED_URL, options.fetchImpl);
  const result = buildSchedb(feed.entries, { generated: formatGenerated(feed.lastModified) });
  return {
    ...renderCatalogFiles(result, options),
    feedLastModified: feed.lastModified,
    result,
  };
}
