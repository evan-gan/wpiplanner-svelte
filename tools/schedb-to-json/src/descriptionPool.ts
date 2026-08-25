/**
 * Interns description text so identical strings are stored once.
 *
 * Course and section descriptions in the Workday export are overwhelmingly
 * duplicates of one another — every section of a course repeats the full catalog
 * blurb. Pooling collapses roughly 4.0MB of raw text into 0.9MB.
 */
export class DescriptionPool {
  private readonly texts: string[] = [];
  private readonly indexByText = new Map<string, number>();

  /**
   * @param rawText Description text, possibly empty or whitespace-only
   * @returns Index into {@link toArray}, or -1 when there is nothing to store
   */
  intern(rawText: string): number {
    const text = rawText.trim();
    if (text === '') return -1;

    const existing = this.indexByText.get(text);
    if (existing !== undefined) return existing;

    const index = this.texts.length;
    this.texts.push(text);
    this.indexByText.set(text, index);
    return index;
  }

  toArray(): string[] {
    return this.texts;
  }

  get byteLength(): number {
    return this.texts.reduce((total, text) => total + Buffer.byteLength(text, 'utf8'), 0);
  }
}
