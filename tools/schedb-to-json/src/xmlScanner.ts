import { decodeXmlEntities } from './entities.ts';

export interface XmlTag {
  name: string;
  attributes: Record<string, string>;
}

export type XmlEvent =
  | { kind: 'open'; tag: XmlTag }
  | { kind: 'close'; name: string };

const ATTRIBUTE_PATTERN = /([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Stream tag events out of an attribute-only XML document.
 *
 * The `.schedb` export is machine-generated and contains no mixed content: every
 * element is either a container or a leaf carrying attributes. Rather than pull
 * in a general-purpose XML parser, this scanner handles exactly that shape and
 * throws on anything outside it — including stray text — so that a change in the
 * upstream export format surfaces as an error rather than as silently dropped
 * courses.
 *
 * A self-closing tag yields an `open` immediately followed by a `close`, so
 * consumers only need to track a single stack.
 *
 * @param source Full XML document text
 * @yields One event per opening and closing tag, in document order
 */
export function* scanXml(source: string): Generator<XmlEvent> {
  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf('<', cursor);

    if (tagStart === -1) {
      assertIgnorableText(source.slice(cursor), cursor);
      return;
    }
    assertIgnorableText(source.slice(cursor, tagStart), cursor);

    const skipTo = skipNonElement(source, tagStart);
    if (skipTo !== null) {
      cursor = skipTo;
      continue;
    }

    const tagEnd = findTagEnd(source, tagStart);
    const rawTag = source.slice(tagStart + 1, tagEnd);
    cursor = tagEnd + 1;

    if (rawTag.startsWith('/')) {
      yield { kind: 'close', name: rawTag.slice(1).trim() };
      continue;
    }

    const selfClosing = rawTag.endsWith('/');
    const body = selfClosing ? rawTag.slice(0, -1) : rawTag;
    const name = readTagName(body);

    yield { kind: 'open', tag: { name, attributes: readAttributes(body) } };
    if (selfClosing) yield { kind: 'close', name };
  }
}

/**
 * Advance past a prolog, comment, CDATA block, or doctype declaration.
 *
 * @returns The index just after the construct, or null if `tagStart` begins a
 *   normal element
 */
function skipNonElement(source: string, tagStart: number): number | null {
  const terminators: Array<[prefix: string, terminator: string]> = [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
    ['<?', '?>'],
    ['<!', '>'],
  ];

  for (const [prefix, terminator] of terminators) {
    if (!source.startsWith(prefix, tagStart)) continue;

    const end = source.indexOf(terminator, tagStart + prefix.length);
    if (end === -1) {
      throw new Error(
        `Unterminated "${prefix}" construct at offset ${tagStart}; expected a closing "${terminator}".`,
      );
    }
    return end + terminator.length;
  }
  return null;
}

/**
 * Locate the `>` that closes a tag, ignoring any that appear inside quoted
 * attribute values. Course descriptions do contain bare `>` characters, so a
 * naive `indexOf('>')` truncates tags.
 */
function findTagEnd(source: string, tagStart: number): number {
  let quoteChar: string | null = null;

  for (let index = tagStart + 1; index < source.length; index++) {
    const char = source[index];

    if (quoteChar !== null) {
      if (char === quoteChar) quoteChar = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quoteChar = char;
      continue;
    }
    if (char === '>') return index;
  }
  throw new Error(`Unterminated tag starting at offset ${tagStart}; no closing ">" found.`);
}

function readTagName(tagBody: string): string {
  const match = /^\s*([A-Za-z_:][\w.:-]*)/.exec(tagBody);
  if (match === null) {
    throw new Error(`Malformed tag "<${tagBody.slice(0, 40)}...>": could not read an element name.`);
  }
  return match[1];
}

function readAttributes(tagBody: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(tagBody)) !== null) {
    const rawValue = match[2] ?? match[3] ?? '';
    attributes[match[1]] = decodeXmlEntities(rawValue);
  }
  return attributes;
}

function assertIgnorableText(text: string, offset: number): void {
  if (text.trim() === '') return;
  throw new Error(
    `Unexpected text content at offset ${offset}: ${JSON.stringify(text.slice(0, 60))}. ` +
      `The .schedb format is expected to carry all data in attributes.`,
  );
}
