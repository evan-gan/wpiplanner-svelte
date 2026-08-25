/**
 * This tool's anomaly vocabulary. The log itself is shared with
 * `tools/workday-to-schedb` — see `tools/shared/anomalies.ts`.
 */
import { AnomalyLog as SharedAnomalyLog, type Anomaly as SharedAnomaly } from '../../shared/anomalies.ts';

export type AnomalyKind =
  | 'duplicate-crn'
  | 'unknown-days'
  | 'zero-length-period'
  | 'end-before-start'
  | 'midnight-hour'
  | 'empty-location'
  | 'missing-attribute';

export type Anomaly = SharedAnomaly<AnomalyKind>;

export interface ConversionStats {
  departments: number;
  courses: number;
  sections: number;
  periods: number;
  uniqueDescriptions: number;
  pooledDescriptionBytes: number;
}

export class AnomalyLog extends SharedAnomalyLog<AnomalyKind> {}
