/**
 * Route-level options only — nothing is loaded here.
 *
 * The catalog is fetched in `+layout.svelte` after mount so the loading screen
 * renders before the download starts; awaiting it here would hold the page
 * blank for the whole fetch.
 *
 * `ssr = false` because the whole app is client-side: it reads `localStorage`
 * on start, and there is no server to render against. `prerender` still emits
 * static HTML shells, which is what `adapter-static` deploys.
 */

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
