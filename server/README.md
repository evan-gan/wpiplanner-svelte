# Live catalog endpoint

Serves `schedb.json` and `yearHeader.txt` built from the live Workday feed,
refetching it at most once every ten minutes. There is no cron job: the first
request after the ten minutes are up does the refetch (a few seconds, mostly downloading the feed),
and every other request is served from memory or from the CDN.

| File | What it does |
|---|---|
| `catalogHandler.ts` | `createCatalogHandler(options)` → a Web-standard `(Request) => Promise<Response>`. Knows nothing about any host. |
| `refreshingCache.ts` | One value that reloads on read once it has expired. Shares a reload between concurrent requests, and keeps the old value (for 60 s, then retries) if a reload fails. |
| `../api/catalog.ts` | The Vercel mount. |
| `viteCatalogPlugin.ts` | The local mount: serves `/api/catalog/*` under `pnpm dev` and `pnpm preview`, so local runs refresh from Workday too. Registered in `vite.config.ts`. |
| `../tools/workday-to-schedb/src/refresh.ts` | `refreshCatalog()`: fetch + convert, no file I/O. The CLI (`pnpm updateData`) uses the same rendering, so both produce identical bytes. |

## The HTTP interface

```
GET /api/catalog/schedb.json      the catalog the app loads
GET /api/catalog/yearHeader.txt   academic year, then "true"/"false" for the /old link
```

The handler reads the file name from `?file=`, else the last path segment, so
it works at any mount path. Responses carry:

- `Cache-Control: public, max-age=0, must-revalidate, s-maxage=<seconds left>, stale-if-error=86400`
  — any shared cache holds it only as long as the in-memory copy has left, so a
  CDN never stretches the ten minutes.
- `Content-Encoding: gzip` when the client accepts it (4 MB → 0.4 MB, which also
  keeps it well under Vercel's 4.5 MB function response limit).
- `Last-Modified`: when WPI last regenerated the feed. `X-Catalog-Fetched-At`:
  when this server last pulled it.
- `Access-Control-Allow-Origin: *` — it is public course data, so other sites
  and services may read it directly.

Errors: `404` for an unknown file (the body lists the valid ones), `405` for
anything but GET/HEAD/OPTIONS, `502` if the feed fails and there is no earlier
copy to serve. Errors are `no-store`.

## Options

```ts
createCatalogHandler({
  maxAgeSeconds: 600,          // how long one fetch of the feed is served
  showOldLink: false,          // line 2 of yearHeader.txt
  feedUrl: '...',              // defaults to the WPI prod-data.json feed
  source: async () => ({ schedbJson, yearHeaderText, feedLastModified }),
                               // replace the Workday fetch entirely
});
```

On Vercel, `SHOW_OLD_SCHEDULE_LINK=true` in the project's environment variables
sets `showOldLink`.

## Hosting it somewhere else

Create the handler **once, at module scope** — the cache lives in its closure.

```ts
// Deno / Bun
import { createCatalogHandler } from './server/catalogHandler.ts';
const handle = createCatalogHandler();
Deno.serve(handle);                       // Bun: Bun.serve({ fetch: handle })

// Cloudflare Workers (needs the nodejs_compat flag for node:fs in fetchFeed.ts)
export default { fetch: createCatalogHandler() };

// Netlify Functions (v2)
export default createCatalogHandler();
export const config = { path: '/api/catalog/:file' };
```

Plain Node has no Fetch-style server built in; wrap it with an adapter such as
`@hono/node-server` (`serve({ fetch: handle })`), or run it under a framework
that accepts Web handlers.

Any host with a shared cache in front will honour `s-maxage`. On a host with
none, the in-memory cache still limits refetches to once per ten minutes per
running instance.

## Why not a cron job

Vercel's Hobby plan runs cron at most once a day. Refreshing on request needs
no plan features at all: it is an ordinary function plus ordinary cache headers.
