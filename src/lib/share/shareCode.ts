/**
 * The `?share=` link.
 *
 * The legacy format was `"01"` followed by each section's CRN as 18 hex digits.
 * That does not survive the move away from CRNs: 149 CRNs are shared by
 * cross-listed sections, so a shared link silently resolved into whichever
 * department parsed first, and the 18-digit values exceed
 * `Number.MAX_SAFE_INTEGER`. Codes carry section ids, which are unique.
 *
 * Old hex-CRN links are **not** migrated — PLAN.md says so explicitly. A version
 * prefix makes such a link fail loudly instead of decoding into the wrong schedule.
 *
 * Two id formats are read:
 *
 * - **v2** (`02.`), the raw ids joined by `~`. Every `|`, `/` and `~` in it is
 *   percent-encoded in a URL, so `CS|2102|BL01/BX01` costs 23 characters.
 *   Still decoded, so links already handed out keep working; no longer written.
 * - **v3** (`3.`), written today. It uses only the characters a query string
 *   never escapes (`A-Z a-z 0-9 - . _`) plus `~` for the rare escape, so the
 *   same section is `CS2102-BL01.BX01`, 16 characters:
 *     - ids are joined by `_`;
 *     - within an id, `-` separates the fields. The department/course `|` is
 *       dropped when the department is all letters and the course number starts
 *       with a digit — true of every real id — so the letter/digit boundary
 *       marks it. Otherwise all three fields are written, `A-B-C`;
 *     - `/` (lecture/lab pairs) is written `.`;
 *     - any other character is written `~` plus its UTF-8 bytes as hex, e.g. a
 *       space is `~20`. Only special-topic sections such as
 *       `F01 - ST: Biofabrication` need this.
 *
 * Compression or base64 would not pay: a code is a handful of short ids, too
 * little text for compression to win back its overhead, and base64 grows the
 * text by a third.
 */

/** Query parameter name, unchanged from the old app. */
export const SHARE_PARAM = 'share';

/** The format `encodeShareCode` writes. "01" was the legacy hex-CRN format. */
export const SHARE_VERSION = '3.';

/** The previous format, still accepted by `decodeShareCode`. */
export const LEGACY_SHARE_VERSION = '02.';

const LEGACY_ID_SEPARATOR = '~';

const ID_SEPARATOR = '_';
const FIELD_SEPARATOR = '-';
const SLASH_STAND_IN = '.';
const ESCAPE_MARKER = '~';

/** Characters a field may carry unchanged; everything else is rewritten. */
const PLAIN_CHARACTER = /[A-Za-z0-9]/;

/** A department and course number that can be joined with no separator. */
const IMPLICIT_SPLIT = /^([A-Za-z]+)([0-9].*)$/;

/** Encode the sections of a schedule into a share code. */
export function encodeShareCode(sectionIds: readonly string[]): string {
  return SHARE_VERSION + sectionIds.map(encodeSectionId).join(ID_SEPARATOR);
}

/**
 * Decode a share code back into section ids.
 *
 * @throws Error when the code is in no known format or is malformed
 */
export function decodeShareCode(code: string): string[] {
  if (code.startsWith(SHARE_VERSION)) {
    return splitNonEmpty(code.slice(SHARE_VERSION.length), ID_SEPARATOR).map(decodeSectionId);
  }
  if (code.startsWith(LEGACY_SHARE_VERSION)) {
    return splitNonEmpty(code.slice(LEGACY_SHARE_VERSION.length), LEGACY_ID_SEPARATOR);
  }
  throw new Error(
    `This share link is not in a recognised format (expected it to start with ` +
      `"${SHARE_VERSION}" or "${LEGACY_SHARE_VERSION}"). Links created by the previous ` +
      `version of Planner cannot be opened.`,
  );
}

/** The share code in a URL, or null when there is none. */
export function readShareCode(url: URL): string | null {
  const code = url.searchParams.get(SHARE_PARAM);
  return code === null || code === '' ? null : code;
}

/**
 * A copyable link to a schedule.
 *
 * Replaces any share code already in the URL, so re-sharing after picking a
 * different schedule does not stack parameters — the old `ShareWidget` did this
 * with `indexOf("?")` string surgery.
 *
 * The parameter is appended by hand rather than with `searchParams.set`,
 * because form encoding would turn every `~` escape into `%7E`. A v3 code only
 * contains characters that are legal unescaped in a query.
 */
export function buildShareUrl(currentUrl: string, sectionIds: readonly string[]): string {
  const url = new URL(currentUrl);
  url.searchParams.delete(SHARE_PARAM);

  const shareParam = `${SHARE_PARAM}=${encodeShareCode(sectionIds)}`;
  url.search = url.search === '' ? shareParam : `${url.search}&${shareParam}`;
  return url.toString();
}

function encodeSectionId(sectionId: string): string {
  const [department, courseNumber, ...rest] = sectionId.split('|');
  // An id without two `|` is not one the catalog produces, but it must still
  // round-trip, so it is written as a single escaped field.
  if (courseNumber === undefined || rest.length === 0) return encodeField(sectionId);

  const sectionNumber = rest.join('|');
  // The decoder splits at the first digit, so this must hold exactly.
  const canJoin = /^[A-Za-z]+$/.test(department) && /^[0-9]/.test(courseNumber);
  const prefix = canJoin
    ? encodeField(department) + encodeField(courseNumber)
    : encodeField(department) + FIELD_SEPARATOR + encodeField(courseNumber);
  return prefix + FIELD_SEPARATOR + encodeField(sectionNumber);
}

/** @throws Error when the token has the wrong number of fields */
function decodeSectionId(token: string): string {
  const fields = token.split(FIELD_SEPARATOR).map(decodeField);

  if (fields.length === 1) return fields[0];
  if (fields.length === 3) return fields.join('|');
  if (fields.length === 2) {
    const match = IMPLICIT_SPLIT.exec(fields[0]);
    if (match !== null) return `${match[1]}|${match[2]}|${fields[1]}`;
  }
  throw new Error(`This share link is damaged: "${token}" is not a section. Ask for a fresh link.`);
}

function encodeField(text: string): string {
  const encoder = new TextEncoder();
  let encoded = '';

  for (const character of text) {
    if (PLAIN_CHARACTER.test(character)) {
      encoded += character;
    } else if (character === '/') {
      encoded += SLASH_STAND_IN;
    } else {
      for (const byte of encoder.encode(character)) {
        encoded += ESCAPE_MARKER + byte.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return encoded;
}

/** @throws Error on a truncated escape or bytes that are not valid UTF-8 */
function decodeField(encoded: string): string {
  // Collected as bytes because one character may span several `~XX` escapes.
  const bytes: number[] = [];

  for (let index = 0; index < encoded.length; index++) {
    const character = encoded[index];
    if (character === SLASH_STAND_IN) {
      bytes.push('/'.charCodeAt(0));
    } else if (character === ESCAPE_MARKER) {
      const hex = encoded.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
        throw new Error(`This share link is damaged: bad escape "~${hex}". Ask for a fresh link.`);
      }
      bytes.push(parseInt(hex, 16));
      index += 2;
    } else if (PLAIN_CHARACTER.test(character)) {
      bytes.push(character.charCodeAt(0));
    } else {
      throw new Error(
        `This share link is damaged: unexpected "${character}". Ask for a fresh link.`,
      );
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    throw new Error('This share link is damaged: it contains invalid text. Ask for a fresh link.');
  }
}

function splitNonEmpty(text: string, separator: string): string[] {
  return text.split(separator).filter((part) => part !== '');
}
