/**
 * Attribute readers that fail loudly.
 *
 * Every one of these takes a `where` breadcrumb (e.g. "CS|2102|A01") so that a
 * malformed row in an 8MB export can be found without bisecting the file.
 */

export type Attributes = Record<string, string>;

export function requireText(attributes: Attributes, name: string, where: string): string {
  const value = attributes[name];
  if (value === undefined) {
    throw new Error(`Missing required attribute "${name}" on ${where}.`);
  }
  return value;
}

export function optionalText(attributes: Attributes, name: string, fallback = ''): string {
  return attributes[name] ?? fallback;
}

export function requireInteger(attributes: Attributes, name: string, where: string): number {
  const raw = requireText(attributes, name, where).trim();
  const value = Number(raw);

  if (!Number.isInteger(value)) {
    throw new Error(`Attribute "${name}" on ${where} is ${JSON.stringify(raw)}, which is not an integer.`);
  }
  return value;
}

/**
 * Read a numeric attribute that may be absent or blank.
 *
 * Credit hours are the motivating case: they are decimal ("4.5") and occasionally
 * empty, and nothing in the app breaks if they are missing.
 */
export function optionalNumber(attributes: Attributes, name: string, fallback: number): number {
  const raw = attributes[name]?.trim();
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
