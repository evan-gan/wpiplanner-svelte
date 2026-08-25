/**
 * Day parsing lives in the app's model so the converter and the app cannot
 * disagree about what a day mask means. Re-exported here because tool code runs
 * under Node type stripping and needs explicit `.ts` paths.
 */
export { dayMaskToNames, parseDayMask } from '../../../src/lib/model/days.ts';
