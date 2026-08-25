#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { convertSchedb } from './convert.ts';

interface CliOptions {
  inputPath: string;
  outputPath: string;
  reportPath: string | null;
  pretty: boolean;
}

const USAGE = `Usage: schedb-to-json <input.schedb> <output.json> [--pretty] [--report <path.json>]

Converts the Workday .schedb XML export into the compact JSON the app loads.

  --pretty            Indent the output (much larger; for inspection only)
  --report <path>     Write the data-quality anomaly log as JSON`;

function parseArguments(argv: string[]): CliOptions {
  const positional: string[] = [];
  let reportPath: string | null = null;
  let pretty = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === '--pretty') {
      pretty = true;
    } else if (argument === '--report') {
      reportPath = argv[++index] ?? null;
      if (reportPath === null) throw new Error('--report requires a file path.\n\n' + USAGE);
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option "${argument}".\n\n${USAGE}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional.length !== 2) {
    throw new Error(`Expected an input and an output path, got ${positional.length}.\n\n${USAGE}`);
  }
  return { inputPath: positional[0], outputPath: positional[1], reportPath, pretty };
}

function main(): void {
  const options = parseArguments(process.argv.slice(2));

  let source: string;
  try {
    source = readFileSync(options.inputPath, 'utf8');
  } catch (cause) {
    throw new Error(
      `Could not read the schedule export at "${options.inputPath}". ` +
        `Check the path, or regenerate it with WorkdayToPlannerConverter. (${(cause as Error).message})`,
    );
  }

  const { data, stats, anomalies } = convertSchedb(source);
  const json = JSON.stringify(data, null, options.pretty ? 2 : undefined);

  writeFileSync(options.outputPath, json, 'utf8');
  if (options.reportPath !== null) {
    writeFileSync(options.reportPath, JSON.stringify(anomalies.toJSON(), null, 2), 'utf8');
  }

  reportSummary(options, source.length, json.length, stats, anomalies.countByKind());
}

function reportSummary(
  options: CliOptions,
  sourceBytes: number,
  outputBytes: number,
  stats: ReturnType<typeof convertSchedb>['stats'],
  anomalyCounts: Record<string, number>,
): void {
  const shrink = ((1 - outputBytes / sourceBytes) * 100).toFixed(1);

  console.log(`Wrote ${options.outputPath}`);
  console.log(
    `  ${stats.departments} departments, ${stats.courses} courses, ` +
      `${stats.sections} sections, ${stats.periods} periods`,
  );
  console.log(
    `  ${formatBytes(sourceBytes)} XML -> ${formatBytes(outputBytes)} JSON (${shrink}% smaller)`,
  );
  console.log(
    `  ${stats.uniqueDescriptions} pooled descriptions (${formatBytes(stats.pooledDescriptionBytes)})`,
  );

  const anomalyEntries = Object.entries(anomalyCounts);
  if (anomalyEntries.length === 0) {
    console.log('  no data-quality anomalies');
    return;
  }
  console.log(`  anomalies: ${anomalyEntries.map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
  if (options.reportPath === null) {
    console.log('  (re-run with --report <path> to see them in full)');
  }
}

function formatBytes(byteCount: number): string {
  return `${(byteCount / 1024 / 1024).toFixed(2)}MB`;
}

try {
  main();
} catch (error) {
  console.error(`schedb-to-json failed: ${(error as Error).message}`);
  process.exit(1);
}
