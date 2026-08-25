/**
 * Course descriptions arrive as HTML fragments (`<p>`, `<br />`, `<span>`).
 *
 * The app renders descriptions as text, so tags are replaced with a space
 * rather than stripped: "structures.<br />Recommended background" must not
 * become "structures.Recommended background". Runs of whitespace then collapse.
 *
 * Unknown entities are left alone instead of throwing. A description is display
 * text — a stray `&sect;` is a blemish, not a reason to fail the whole build.
 */

const HTML_TAG_PATTERN = /<[^>]*>/g;
const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

/**
 * Convert an HTML description fragment into the plain text the app displays.
 *
 * @param rawHtml Description markup from the feed, possibly empty
 * @returns Tag-free, entity-decoded, whitespace-collapsed text
 */
export function htmlToPlainText(rawHtml: string): string {
  if (rawHtml === '') return '';

  const withoutTags = rawHtml.replace(HTML_TAG_PATTERN, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;

  return text.replace(ENTITY_PATTERN, (match, reference: string) => {
    if (reference.startsWith('#')) {
      const isHex = reference[1] === 'x' || reference[1] === 'X';
      const codePoint = parseInt(isHex ? reference.slice(2) : reference.slice(1), isHex ? 16 : 10);

      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[reference.toLowerCase()] ?? match;
  });
}
