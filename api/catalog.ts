/**
 * Vercel mount point for the live catalog endpoint. All the logic is in
 * `server/catalogHandler.ts`; this file only adapts it to Vercel's `/api`
 * convention, so porting to another host means replacing this file alone.
 *
 * Public URLs (rewritten here by `vercel.json`):
 *   /api/catalog/schedb.json
 *   /api/catalog/yearHeader.txt
 */
import { createCatalogHandler } from '../server/catalogHandler.ts';

// Module scope, so a warm instance keeps its cached catalog between requests.
const handleCatalogRequest = createCatalogHandler({
  showOldLink: process.env.SHOW_OLD_SCHEDULE_LINK === 'true',
});

export default { fetch: handleCatalogRequest };
