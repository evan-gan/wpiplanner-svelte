/**
 * Getting the feed, from the network or from disk.
 *
 * The upstream file has no version or timestamp inside it, so "Schedule Data
 * Refreshed" comes from the HTTP `Last-Modified` header — and from the file's
 * mtime when reading a saved copy, so both paths produce the same header text.
 */
import { readFile, stat } from 'node:fs/promises';
import type { ReportEntry, WorkdayFeed } from './feed.ts';

export const FEED_URL = 'https://courselistings.wpi.edu/assets/prod-data.json';

/** WPI is in one time zone and the header is read by people standing in it. */
const CAMPUS_TIME_ZONE = 'America/New_York';

export interface FetchedFeed {
  entries: ReportEntry[];
  /** When the feed was last refreshed upstream. */
  lastModified: Date;
  /** Raw JSON text, so `--save-feed` can write exactly what was parsed. */
  rawJson: string;
}

/**
 * Download and parse the feed.
 *
 * @param url Overrides {@link FEED_URL}
 * @throws Error when the request fails or the body is not the expected shape
 */
export async function fetchFeed(url: string = FEED_URL): Promise<FetchedFeed> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(
      `Could not reach the course listings feed at ${url}. ` +
        `Check the network, or pass --input with a saved copy. (${(cause as Error).message})`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `The course listings feed at ${url} returned ${response.status} ${response.statusText}. ` +
        'If this persists, the asset may have been renamed upstream.',
    );
  }

  const rawJson = await response.text();
  const lastModifiedHeader = response.headers.get('last-modified');

  return {
    entries: parseFeed(rawJson, url),
    lastModified: lastModifiedHeader === null ? new Date() : new Date(lastModifiedHeader),
    rawJson,
  };
}

/** Read a saved copy of the feed, timestamping it from the file's mtime. */
export async function readFeedFile(path: string): Promise<FetchedFeed> {
  let rawJson: string;
  try {
    rawJson = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`Could not read the saved feed at "${path}". (${(cause as Error).message})`);
  }

  const { mtime } = await stat(path);
  return { entries: parseFeed(rawJson, path), lastModified: mtime, rawJson };
}

function parseFeed(rawJson: string, source: string): ReportEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (cause) {
    throw new Error(`The feed at ${source} is not valid JSON. (${(cause as Error).message})`);
  }

  const entries = (parsed as WorkdayFeed | null)?.Report_Entry;
  if (!Array.isArray(entries)) {
    throw new Error(
      `The feed at ${source} has no "Report_Entry" array. The upstream format has changed; ` +
        'see tools/workday-to-schedb/README.md for the shape this tool expects.',
    );
  }
  if (entries.length === 0) {
    throw new Error(`The feed at ${source} contained zero sections; refusing to overwrite the catalog.`);
  }
  return entries as ReportEntry[];
}

/**
 * Render a refresh time the way the app header shows it, e.g.
 * "11:10 PM Aug 24, 2026". Matches the format the legacy converter wrote so the
 * header does not change shape when the data source does.
 */
export function formatGenerated(when: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPUS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(when);

  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return (
    `${valueOf('hour')}:${valueOf('minute')} ${valueOf('dayPeriod')} ` +
    `${valueOf('month')} ${valueOf('day')}, ${valueOf('year')}`
  );
}
