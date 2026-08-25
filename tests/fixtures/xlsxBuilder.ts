/**
 * Builds real `.xlsx` bytes from a grid of strings, for the Workday import tests.
 *
 * The importer's job is to read a file Excel produced, so testing it against a
 * hand-written XML string would skip the half most likely to break — the ZIP
 * container. This writes a genuine archive instead: the output opens in Excel,
 * and both ZIP compression methods the reader supports can be exercised.
 */

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

export interface BuildOptions {
  /** Deflate the parts instead of storing them. Defaults to deflating. */
  compress?: boolean;
  /**
   * Write cell text inline rather than through the shared string table.
   * Workday's own export uses shared strings; both paths are read.
   */
  inlineStrings?: boolean;
}

/**
 * Build a single-sheet workbook.
 *
 * @param rows Cell text by row then column; short rows are fine
 * @param options Container and string-encoding choices
 * @returns The bytes of a complete `.xlsx` file
 */
export async function buildXlsx(
  rows: readonly (readonly string[])[],
  options: BuildOptions = {},
): Promise<Uint8Array> {
  const { compress = true, inlineStrings = false } = options;

  const sharedStrings: string[] = [];
  const sheetXml = buildSheetXml(rows, inlineStrings ? undefined : sharedStrings);

  const parts: [string, string][] = [
    ['[Content_Types].xml', CONTENT_TYPES_XML],
    ['_rels/.rels', ROOT_RELS_XML],
    ['xl/workbook.xml', WORKBOOK_XML],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ];

  if (!inlineStrings) parts.push(['xl/sharedStrings.xml', buildSharedStringsXml(sharedStrings)]);

  return writeZip(parts, compress);
}

function buildSheetXml(
  rows: readonly (readonly string[])[],
  sharedStrings: string[] | undefined,
): string {
  const body = rows
    .map((cells, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellXml = cells
        .map((text, columnIndex) => buildCellXml(text, columnLetters(columnIndex) + rowNumber, sharedStrings))
        .join('');
      return `<row r="${rowNumber}">${cellXml}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${SPREADSHEET_NS}"><sheetData>${body}</sheetData></worksheet>`;
}

function buildCellXml(text: string, reference: string, sharedStrings: string[] | undefined): string {
  if (text === '') return `<c r="${reference}"/>`;

  if (sharedStrings === undefined) {
    return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
  }

  let index = sharedStrings.indexOf(text);
  if (index === -1) index = sharedStrings.push(text) - 1;

  return `<c r="${reference}" t="s"><v>${index}</v></c>`;
}

function buildSharedStringsXml(sharedStrings: readonly string[]): string {
  const items = sharedStrings
    .map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${SPREADSHEET_NS}" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${items}</sst>`;
}

/** `0` -> `"A"`, `26` -> `"AA"`. */
function columnLetters(columnIndex: number): string {
  let letters = '';
  for (let remaining = columnIndex; remaining >= 0; remaining = Math.floor(remaining / 26) - 1) {
    letters = String.fromCharCode(65 + (remaining % 26)) + letters;
  }
  return letters;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function writeZip(parts: readonly [string, string][], compress: boolean): Promise<Uint8Array> {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const [name, text] of parts) {
    const uncompressed = new TextEncoder().encode(text);
    const stored = compress ? await deflateRaw(uncompressed) : uncompressed;
    const method = compress ? COMPRESSION_DEFLATE : COMPRESSION_STORED;
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(uncompressed);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, stored.length, true);
    localView.setUint32(22, uncompressed.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, CENTRAL_DIRECTORY_ENTRY_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, stored.length, true);
    centralView.setUint32(24, uncompressed.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralEntry.set(nameBytes, 46);

    localChunks.push(localHeader, stored);
    centralChunks.push(centralEntry);
    offset += localHeader.length + stored.length;
  }

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(8, parts.length, true);
  endView.setUint16(10, parts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concat([...localChunks, ...centralChunks, end]);
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);

  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${SPREADSHEET_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="View My Courses" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
