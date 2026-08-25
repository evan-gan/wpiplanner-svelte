/**
 * A read-only ZIP reader, just enough to open an `.xlsx`.
 *
 * An `.xlsx` is a ZIP of XML parts, so reading one means unzipping one. Rather
 * than take a dependency for it, this walks the central directory by hand and
 * hands the compressed bytes to `DecompressionStream`, which every browser the
 * app targets — and Node 18+, so the tests — already ships.
 *
 * Deliberately not supported: ZIP64, encryption, and multi-disk archives. None
 * can occur in a Workday export, and each throws rather than decoding wrongly.
 */

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

const END_OF_CENTRAL_DIRECTORY_MIN_SIZE = 22;
const CENTRAL_DIRECTORY_ENTRY_FIXED_SIZE = 46;
const LOCAL_FILE_HEADER_FIXED_SIZE = 30;

/** The largest an EOCD record can be: its 22 fixed bytes plus a 64KB comment. */
const MAX_END_OF_CENTRAL_DIRECTORY_SEARCH = END_OF_CENTRAL_DIRECTORY_MIN_SIZE + 0xffff;

/** A value of all-ones in a 32-bit size field means "see the ZIP64 extra field". */
const ZIP64_SENTINEL = 0xffffffff;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

interface CentralDirectoryEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** A ZIP archive held in memory, indexed by entry name. */
export class ZipArchive {
  private readonly bytes: Uint8Array;
  private readonly entries: Map<string, CentralDirectoryEntry>;

  private constructor(bytes: Uint8Array, entries: Map<string, CentralDirectoryEntry>) {
    this.bytes = bytes;
    this.entries = entries;
  }

  static open(archiveBytes: ArrayBuffer | Uint8Array): ZipArchive {
    const bytes =
      archiveBytes instanceof Uint8Array ? archiveBytes : new Uint8Array(archiveBytes);
    return new ZipArchive(bytes, readCentralDirectory(bytes));
  }

  has(fileName: string): boolean {
    return this.entries.has(fileName);
  }

  get fileNames(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Decompress one entry and decode it as UTF-8.
   *
   * @param fileName Entry path inside the archive, e.g. `xl/workbook.xml`
   * @returns The entry's decoded text
   * @throws Error when the entry is absent or uses an unsupported compression method
   */
  async readText(fileName: string): Promise<string> {
    const entry = this.entries.get(fileName);
    if (entry === undefined) {
      throw new Error(
        `The archive has no entry named "${fileName}". It contains: ${this.fileNames.join(', ')}.`,
      );
    }

    const compressed = this.sliceEntryData(entry);
    if (entry.compressionMethod === COMPRESSION_STORED) {
      return new TextDecoder().decode(compressed);
    }
    if (entry.compressionMethod !== COMPRESSION_DEFLATE) {
      throw new Error(
        `Entry "${fileName}" uses unsupported ZIP compression method ${entry.compressionMethod}; ` +
          `only stored (0) and deflate (8) can be read.`,
      );
    }

    return new TextDecoder().decode(await inflateRaw(compressed));
  }

  /**
   * The compressed bytes of one entry.
   *
   * The local header repeats the name and extra field with lengths that need not
   * match the central directory's, so the data offset has to be read from the
   * local header itself rather than assumed.
   */
  private sliceEntryData(entry: CentralDirectoryEntry): Uint8Array {
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const headerOffset = entry.localHeaderOffset;

    if (view.getUint32(headerOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(
        `Corrupt archive: no local file header for "${entry.fileName}" at offset ${headerOffset}.`,
      );
    }

    const nameLength = view.getUint16(headerOffset + 26, true);
    const extraLength = view.getUint16(headerOffset + 28, true);
    const dataStart = headerOffset + LOCAL_FILE_HEADER_FIXED_SIZE + nameLength + extraLength;

    return this.bytes.subarray(dataStart, dataStart + entry.compressedSize);
  }
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot decompress ZIP data: DecompressionStream is unavailable. ' +
        'Use a current version of Chrome, Edge, Firefox, or Safari.',
    );
  }

  const stream = new Blob([compressed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readCentralDirectory(bytes: Uint8Array): Map<string, CentralDirectoryEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);

  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  if (directoryOffset === ZIP64_SENTINEL) {
    throw new Error('ZIP64 archives are not supported; re-export the file from Workday.');
  }

  const entries = new Map<string, CentralDirectoryEntry>();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY_SIGNATURE) {
      throw new Error(
        `Corrupt archive: expected a central directory entry at offset ${offset} ` +
          `(entry ${index + 1} of ${entryCount}).`,
      );
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if (compressedSize === ZIP64_SENTINEL || localHeaderOffset === ZIP64_SENTINEL) {
      throw new Error('ZIP64 archives are not supported; re-export the file from Workday.');
    }

    const nameStart = offset + CENTRAL_DIRECTORY_ENTRY_FIXED_SIZE;
    const fileName = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));

    entries.set(fileName, { fileName, compressionMethod, compressedSize, localHeaderOffset });
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Locate the end-of-central-directory record.
 *
 * It sits at the very end of the file unless a trailing comment pushes it back,
 * so the only way to find it is to scan backwards for its signature.
 */
function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - MAX_END_OF_CENTRAL_DIRECTORY_SEARCH);

  for (let offset = view.byteLength - END_OF_CENTRAL_DIRECTORY_MIN_SIZE; offset >= earliest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }

  throw new Error(
    'That file is not a readable .xlsx workbook: no ZIP end-of-central-directory record was found.',
  );
}
