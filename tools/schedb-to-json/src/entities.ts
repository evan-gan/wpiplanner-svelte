/** The five entities XML predefines. Anything else must be a character reference. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Expand XML entity and character references in an attribute value.
 *
 * Course descriptions in the Workday export routinely contain `&amp;` and
 * numeric references for typographic punctuation, so attribute values cannot be
 * used raw.
 *
 * @param rawValue Attribute text exactly as it appeared between the quotes
 * @returns The decoded text
 * @throws Error when an unrecognized named entity is encountered, so that a
 *   malformed export fails loudly instead of leaking `&foo;` into the UI
 */
export function decodeXmlEntities(rawValue: string): string {
  if (!rawValue.includes('&')) return rawValue;

  return rawValue.replace(ENTITY_PATTERN, (match, reference: string) => {
    if (reference.startsWith('#x') || reference.startsWith('#X')) {
      return codePointToString(parseInt(reference.slice(2), 16), match);
    }
    if (reference.startsWith('#')) {
      return codePointToString(parseInt(reference.slice(1), 10), match);
    }
    const named = NAMED_ENTITIES[reference];
    if (named === undefined) {
      throw new Error(
        `Unknown XML entity "${match}". Only ${Object.keys(NAMED_ENTITIES).join(', ')} ` +
          `and numeric character references are supported; the source file may be corrupt.`,
      );
    }
    return named;
  });
}

function codePointToString(codePoint: number, originalReference: string): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    throw new Error(`Character reference "${originalReference}" is outside the Unicode range.`);
  }
  return String.fromCodePoint(codePoint);
}
