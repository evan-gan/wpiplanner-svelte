export type AnomalyKind =
  | 'duplicate-crn'
  | 'unknown-days'
  | 'zero-length-period'
  | 'end-before-start'
  | 'midnight-hour'
  | 'empty-location'
  | 'missing-attribute';

export interface Anomaly {
  kind: AnomalyKind;
  /** Where in the catalog the problem is, e.g. "CS|2102|A01". */
  where: string;
  detail: string;
}

export interface ConversionStats {
  departments: number;
  courses: number;
  sections: number;
  periods: number;
  uniqueDescriptions: number;
  pooledDescriptionBytes: number;
}

/**
 * Collects data-quality problems found while mapping so the conversion can
 * report them in bulk rather than aborting on the first oddity. Structural
 * errors (unparseable times, unknown days) still throw — these are values that
 * are legal but suspicious.
 */
export class AnomalyLog {
  private readonly entries: Anomaly[] = [];

  add(kind: AnomalyKind, where: string, detail: string): void {
    this.entries.push({ kind, where, detail });
  }

  get all(): readonly Anomaly[] {
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

  toJSON(): { total: number; byKind: Record<string, number>; entries: readonly Anomaly[] } {
    return { total: this.entries.length, byKind: this.countByKind(), entries: this.entries };
  }
}
