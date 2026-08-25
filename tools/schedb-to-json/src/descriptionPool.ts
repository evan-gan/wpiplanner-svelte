/**
 * Description pooling is shared with `tools/workday-to-schedb`, so it lives in
 * `tools/shared`. Re-exported here because tool code runs under Node type
 * stripping and needs explicit `.ts` paths.
 */
export { DescriptionPool } from '../../shared/descriptionPool.ts';
