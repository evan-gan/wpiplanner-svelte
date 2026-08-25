/**
 * Reads the first worksheet of an `.xlsx` into a grid of strings.
 *
 * The XML is scanned with regular expressions rather than `DOMParser` because
 * the tests run under Node, which has no DOM. That is only safe because the
 * shapes involved are tiny and fixed — `<si>`, `<row>`, `<c>`, `<v>` — and the
 * scanner ignores anything it does not recognise instead of guessing.
 *
 * Only what the Workday import needs is read: shared strings, inline strings,
 * and raw cell values. Number formats, dates, and formulas come back as the
 * stored text, which is why the importer never reads the date columns.
 */
import { ZipArchive } from './zip';

/** A worksheet as rows of cells, indexed by column number with gaps filled in. */
export type SheetRows = string[][];

const RELATIONSHIPS_PART = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PART = 'xl/sharedStrings.xml';
const WORKBOOK_PART = 'xl/workbook.xml';

/**
 * Read the first worksheet of a workbook.
 *
 * @param workbookBytes The raw bytes of an `.xlsx` file
 * @returns Rows of trimmed cell text; short rows are padded to their last cell only
 * @throws Error when the file is not a workbook or has no worksheets
 */
export async function readFirstSheet(workbookBytes: ArrayBuffer | Uint8Array): Promise<SheetRows> {
  const archive = ZipArchive.open(workbookBytes);

  if (!archive.has(WORKBOOK_PART)) {
    throw new Error(
      'That file is not an Excel workbook: it has no xl/workbook.xml part. ' +
        'Export "View My Courses" from Workday as .xlsx and upload that file.',
    );
  }

  const sharedStrings = archive.has(SHARED_STRINGS_PART)
    ? parseSharedStrings(await archive.readText(SHARED_STRINGS_PART))
    : [];

  const sheetPart = await resolveFirstSheetPart(archive);
  return parseSheet(await archive.readText(sheetPart), sharedStrings);
}

/**
 * Find the archive path of the workbook's first worksheet.
 *
 * The sheet order lives in `workbook.xml`, but the path lives in the
 * relationships part keyed by relationship id, so both have to be read.
 */
async function resolveFirstSheetPart(archive: ZipArchive): Promise<string> {
  const workbookXml = await archive.readText(WORKBOOK_PART);
  const firstSheet = /<sheet\b[^>]*>/.exec(workbookXml)?.[0];
  if (firstSheet === undefined) {
    throw new Error('That workbook has no worksheets.');
  }

  const relationshipId = /\br:id="([^"]+)"/.exec(firstSheet)?.[1];
  if (relationshipId !== undefined && archive.has(RELATIONSHIPS_PART)) {
    const target = findRelationshipTarget(
      await archive.readText(RELATIONSHIPS_PART),
      relationshipId,
    );
    if (target !== undefined) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      if (archive.has(path)) return path;
    }
  }

  // Workday's export names the part conventionally; fall back to that before failing.
  if (archive.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml';

  throw new Error(
    `Could not locate the first worksheet in the workbook. It contains: ${archive.fileNames.join(', ')}.`,
  );
}

function findRelationshipTarget(relationshipsXml: string, relationshipId: string): string | undefined {
  for (const [tag] of relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    if (/\bId="([^"]+)"/.exec(tag)?.[1] !== relationshipId) continue;
    return /\bTarget="([^"]+)"/.exec(tag)?.[1];
  }
  return undefined;
}

/**
 * Parse the shared string table.
 *
 * A single entry can be split across several `<r>` runs when part of it is
 * styled differently, so every `<t>` inside one `<si>` is concatenated.
 */
function parseSharedStrings(sharedStringsXml: string): string[] {
  const strings: string[] = [];

  for (const [, body] of sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    strings.push(concatTextNodes(body));
  }

  // A self-closing `<si/>` is a legitimate empty string and the loop above skips it.
  return strings;
}

function concatTextNodes(xml: string): string {
  let text = '';
  for (const [, content] of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) {
    text += decodeXmlEntities(content);
  }
  return text;
}

function parseSheet(sheetXml: string, sharedStrings: readonly string[]): SheetRows {
  const rows: SheetRows = [];

  for (const [, openTag, body] of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const declaredRowNumber = Number(/\br="(\d+)"/.exec(openTag)?.[1]);
    const rowIndex = Number.isFinite(declaredRowNumber) ? declaredRowNumber - 1 : rows.length;

    rows[rowIndex] = parseRow(body, sharedStrings);
  }

  // Rows the sheet skipped entirely are holes in the array; make them empty rows.
  for (let index = 0; index < rows.length; index++) rows[index] ??= [];

  return rows;
}

function parseRow(rowXml: string, sharedStrings: readonly string[]): string[] {
  const cells: string[] = [];
  let nextColumn = 0;

  for (const [, openTag, body] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const reference = /\br="([A-Z]+)\d+"/.exec(openTag)?.[1];
    const column = reference === undefined ? nextColumn : columnIndexOf(reference);

    cells[column] = readCellValue(openTag, body ?? '', sharedStrings);
    nextColumn = column + 1;
  }

  for (let index = 0; index < cells.length; index++) cells[index] ??= '';

  return cells;
}

function readCellValue(
  openTag: string,
  body: string,
  sharedStrings: readonly string[],
): string {
  const cellType = /\bt="([^"]+)"/.exec(openTag)?.[1] ?? 'n';

  if (cellType === 'inlineStr') return concatTextNodes(body).trim();

  const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
  if (rawValue === undefined) return '';

  if (cellType === 's') {
    const sharedIndex = Number(rawValue);
    return (sharedStrings[sharedIndex] ?? '').trim();
  }

  return decodeXmlEntities(rawValue).trim();
}

/** `"A"` -> 0, `"Z"` -> 25, `"AA"` -> 26. */
function columnIndexOf(reference: string): number {
  let index = 0;
  for (const character of reference) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (entity, name: string) => {
    switch (name) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return decodeNumericEntity(name) ?? entity;
    }
  });
}

function decodeNumericEntity(name: string): string | undefined {
  const isHex = name.startsWith('#x') || name.startsWith('#X');
  const codePoint = Number.parseInt(isHex ? name.slice(2) : name.slice(1), isHex ? 16 : 10);

  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return undefined;
  return String.fromCodePoint(codePoint);
}
