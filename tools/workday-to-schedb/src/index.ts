#!/usr/bin/env node
/**
 * CLI: refresh `static/schedb.json` (and `static/yearHeader.txt`) from the live
 * Workday course-listings feed.
 *
 *   pnpm updateData
 *   pnpm updateData -- --input data/prod-data.json --output /tmp/schedb.json
 */
import { writeFileSync } from 'node:fs';
import { buildSchedb, type ConversionResult } from './buildSchedb.ts';
import { fetchFeed, formatGenerated, readFeedFile, FEED_URL, type FetchedFeed } from './fetchFeed.ts';
import { renderCatalogFiles } from './refresh.ts';

interface CliOptions {
  url: string;
  /** Read this saved feed instead of fetching. */
  inputPath: string | null;
  outputPath: string;
  /** Where to write the two-line year header, or null to leave it alone. */
  yearHeaderPath: string | null;
  reportPath: string | null;
  /** Where to keep a copy of the raw feed, for debugging a bad conversion. */
  saveFeedPath: string | null;
  /** Line 2 of the year header: offer the link to last year's planner. */
  showOldLink: boolean;
  pretty: boolean;
}

const USAGE = `Usage: workday-to-schedb [options]

Fetches the WPI Workday course-listings feed and writes the catalog the app loads.

  --url <url>            Feed URL (default: ${FEED_URL})
  --input <path>         Convert a saved feed instead of fetching
  --output <path>        Catalog to write (default: static/schedb.json)
  --year-header <path>   Year header to write (default: static/yearHeader.txt)
  --no-year-header       Leave the year header alone
  --report <path>        Write the data-quality anomaly log as JSON
  --save-feed <path>     Also save the raw feed exactly as fetched
  --show-old-link        Write "true" on line 2 of the year header
  --pretty               Indent the catalog (much larger; for inspection only)`;

const DEFAULTS: CliOptions = {
  url: FEED_URL,
  inputPath: null,
  outputPath: 'static/schedb.json',
  yearHeaderPath: 'static/yearHeader.txt',
  reportPath: null,
  saveFeedPath: null,
  showOldLink: false,
  pretty: false,
};

function parseArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const nextValue = (): string => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${argument} requires a value.\n\n${USAGE}`);
      return value;
    };

    switch (argument) {
      case '--url': options.url = nextValue(); break;
      case '--input': options.inputPath = nextValue(); break;
      case '--output': options.outputPath = nextValue(); break;
      case '--year-header': options.yearHeaderPath = nextValue(); break;
      case '--no-year-header': options.yearHeaderPath = null; break;
      case '--report': options.reportPath = nextValue(); break;
      case '--save-feed': options.saveFeedPath = nextValue(); break;
      case '--show-old-link': options.showOldLink = true; break;
      case '--pretty': options.pretty = true; break;
      default:
        throw new Error(`Unknown option "${argument}".\n\n${USAGE}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));

  const feed =
    options.inputPath === null
      ? await fetchFeedWithNotice(options.url)
      : await readFeedFile(options.inputPath);

  const result = buildSchedb(feed.entries, { generated: formatGenerated(feed.lastModified) });
  writeOutputs(options, feed, result);
  reportSummary(options, feed, result);
}

async function fetchFeedWithNotice(url: string): Promise<FetchedFeed> {
  console.log(`Fetching ${url} ...`);
  return fetchFeed(url);
}

function writeOutputs(options: CliOptions, feed: FetchedFeed, result: ConversionResult): void {
  const files = renderCatalogFiles(result, options);
  writeFileSync(options.outputPath, files.schedbJson, 'utf8');

  if (options.yearHeaderPath !== null) {
    writeFileSync(options.yearHeaderPath, files.yearHeaderText, 'utf8');
  }
  if (options.reportPath !== null) {
    writeFileSync(options.reportPath, JSON.stringify(result.anomalies.toJSON(), null, 2), 'utf8');
  }
  if (options.saveFeedPath !== null) {
    writeFileSync(options.saveFeedPath, feed.rawJson, 'utf8');
  }
}

function reportSummary(options: CliOptions, feed: FetchedFeed, result: ConversionResult): void {
  const { stats } = result;

  console.log(`Wrote ${options.outputPath}`);
  console.log(`  schedule data refreshed ${result.data.generated} (feed Last-Modified)`);
  console.log(`  ${result.yearHeaderLine}`);
  console.log(
    `  ${stats.plannableRows} of ${stats.feedRows} feed rows are in the planned terms`,
  );
  console.log(
    `  ${stats.departments} departments, ${stats.courses} courses, ` +
      `${stats.sections} sections, ${stats.periods} periods`,
  );
  console.log(
    `  ${formatBytes(Buffer.byteLength(feed.rawJson))} feed -> ` +
      `${formatBytes(Buffer.byteLength(JSON.stringify(result.data)))} catalog`,
  );
  console.log(
    `  ${stats.uniqueDescriptions} pooled descriptions (${formatBytes(stats.pooledDescriptionBytes)})`,
  );

  const anomalyCounts = Object.entries(result.anomalies.countByKind());
  if (anomalyCounts.length === 0) {
    console.log('  no data-quality anomalies');
    return;
  }
  console.log(`  anomalies: ${anomalyCounts.map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
  if (options.reportPath === null) {
    console.log('  (re-run with --report <path> to see them in full)');
  }
}

function formatBytes(byteCount: number): string {
  return `${(byteCount / 1024 / 1024).toFixed(2)}MB`;
}

try {
  await main();
} catch (error) {
  console.error(`workday-to-schedb failed: ${(error as Error).message}`);
  process.exit(1);
}
