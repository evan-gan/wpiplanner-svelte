/**
 * Data-quality findings collected while converting a schedule export.
 *
 * Both converters need the same "collect, don't abort" behaviour: a value that
 * is legal but suspicious (a period with no location, a zero-length meeting)
 * should be reported in bulk at the end of a run rather than stopping the build.
 * Structural errors — an unparseable time, an unknown day — still throw.
 *
 * The kind is a type parameter so each tool can pin its own closed set of
 * findings and still get a compile error for a typo.
 */
export interface Anomaly<Kind extends string> {
  kind: Kind;
  /** Where in the catalog the problem is, e.g. "CS|2102|A01". */
  where: string;
  detail: string;
}

export class AnomalyLog<Kind extends string> {
  private readonly entries: Anomaly<Kind>[] = [];

  add(kind: Kind, where: string, detail: string): void {
    this.entries.push({ kind, where, detail });
  }

  get all(): readonly Anomaly<Kind>[] {
    return this.entries;
  }

  /** Counts per kind, for the one-line summary printed after a run. */
  countByKind(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.entries) {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
    }
    return counts;
  }

  toJSON(): { total: number; byKind: Record<string, number>; entries: readonly Anomaly<Kind>[] } {
    return { total: this.entries.length, byKind: this.countByKind(), entries: this.entries };
  }
}
