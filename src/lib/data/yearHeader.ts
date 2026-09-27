/**
 * `yearHeader.txt` — two lines maintained by hand next to the deployed app.
 *
 * Line 1 is the academic year shown under the "Planner" title. Line 2 is
 * "true"/"false" for whether to offer the link to last year's schedule at `/old`.
 * The legacy `MainView` parsed it inline and logged to a `java.util.logging`
 * Logger on failure; here a failure just leaves the header blank, because a
 * missing subtitle should never stop the app from running.
 */

export const YEAR_HEADER_URL = '/yearHeader.txt';

/** The live endpoint's copy; see `LIVE_CATALOG_URL` in `loadCatalog.ts`. */
export const LIVE_YEAR_HEADER_URL = '/api/catalog/yearHeader.txt';

export interface YearHeader {
  /** e.g. "2024 - 2025 Academic Year"; empty when the file is missing. */
  year: string;
  showOldScheduleLink: boolean;
}

export const EMPTY_YEAR_HEADER: YearHeader = { year: '', showOldScheduleLink: false };

/** Parse the two-line file. Tolerates CRLF and a missing second line. */
export function parseYearHeader(text: string): YearHeader {
  const [year = '', showLink = ''] = text.split('\n').map((line) => line.trim());
  return { year, showOldScheduleLink: showLink.toLowerCase() === 'true' };
}

/**
 * Fetch and parse the header from the first URL that answers, falling back to
 * blank if none can be read.
 *
 * @param urls Tried in order; pass `${base}/yearHeader.txt` under a subpath
 */
export async function loadYearHeader(
  fetchImpl: typeof fetch = fetch,
  ...urls: string[]
): Promise<YearHeader> {
  for (const url of urls.length > 0 ? urls : [YEAR_HEADER_URL]) {
    try {
      const response = await fetchImpl(url);
      if (response.ok) return parseYearHeader(await response.text());
      console.warn(`Could not load ${url}: HTTP ${response.status}`);
    } catch (error) {
      console.warn(`Could not load ${url}:`, error);
    }
  }
  return EMPTY_YEAR_HEADER;
}
