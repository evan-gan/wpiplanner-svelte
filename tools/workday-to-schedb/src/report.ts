/**
 * This tool's anomaly vocabulary. The log itself is shared with
 * `tools/schedb-to-json` — see `tools/shared/anomalies.ts`.
 */
import { AnomalyLog as SharedAnomalyLog, type Anomaly as SharedAnomaly } from '../../shared/anomalies.ts';

export type AnomalyKind =
  /** Subject code missing from `departments.ts`; the course landed in "Other". */
  | 'unknown-subject'
  /** `Course_Section` did not look like "AB 1531-A01 - Title"; the row was skipped. */
  | 'unparsable-course-section'
  /** `Enrolled_Capacity` or `Waitlist_Waitlist_Capacity` was not "used/total". */
  | 'unparsable-capacity'
  /** `Credits` was not a number; the course shows zero credits. */
  | 'unparsable-credits'
  /** No `Section_Details`; the section gets one placeholder period with no days. */
  | 'no-meeting-times'
  /** A meeting with a location but no day pattern — usually asynchronous online. */
  | 'unknown-days'
  | 'zero-length-period'
  | 'end-before-start'
  | 'empty-location'
  /** Two sections of one course ended up with the same label; the later was dropped. */
  | 'duplicate-section-id';

export type Anomaly = SharedAnomaly<AnomalyKind>;

export interface ConversionStats {
  /** Rows in `Report_Entry` before any filtering. */
  feedRows: number;
  /** Rows kept after the term, cancellation, and interest-list filters. */
  plannableRows: number;
  departments: number;
  courses: number;
  sections: number;
  periods: number;
  uniqueDescriptions: number;
  pooledDescriptionBytes: number;
}

export class AnomalyLog extends SharedAnomalyLog<AnomalyKind> {}
