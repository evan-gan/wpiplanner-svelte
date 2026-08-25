/**
 * Loads the catalog once, for every route.
 *
 * `ssr = false` because the whole app is client-side: it reads `localStorage`
 * on start, and there is no server to render against. `prerender` still emits
 * static HTML shells, which is what `adapter-static` deploys.
 */
import { base } from '$app/paths';
import { loadCatalog } from '$lib/data/loadCatalog';
import { loadYearHeader } from '$lib/data/yearHeader';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = true;
/**
 * Directory-style output: `/courses` is written as `courses/index.html`.
 *
 * Plain static hosts serve that for `/courses` without any rewrite rule, which
 * `courses.html` would need. PLAN.md §10 asks how the site is deployed; this is
 * the form that works whichever answer comes back.
 */
export const trailingSlash = 'always';

export const load: LayoutLoad = async ({ fetch }) => {
  // The header is small and independent; a slow or missing yearHeader.txt must
  // not hold up the catalog, and vice versa.
  // Paths go through `base` so the app also works when deployed under a
  // subdirectory, and so a route like `/schedules/` does not resolve a bare
  // filename against itself.
  const [catalog, yearHeader] = await Promise.all([
    loadCatalog({ fetchImpl: fetch, url: `${base}/schedb.json` }),
    loadYearHeader(fetch, `${base}/yearHeader.txt`),
  ]);

  return { catalog, yearHeader };
};
