/**
 * Mounts the live catalog endpoint on Vite's own server, so `pnpm dev` and
 * `pnpm preview` refresh from Workday exactly like the deployed app does.
 *
 * Without this, `/api/catalog/*` is a 404 locally (Vite runs no Vercel
 * functions) and the app silently falls back to the committed snapshot in
 * `static/`, which only changes when someone runs `pnpm updateData`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import { createCatalogHandler, type CatalogHandler, type CatalogHandlerOptions } from './catalogHandler.ts';

/** The same public path `vercel.json` rewrites to `api/catalog.ts`. */
const MOUNT_PATH = '/api/catalog';

export function catalogEndpointPlugin(options: CatalogHandlerOptions = {}): Plugin {
  // One handler for the whole server process, so its ten-minute cache survives
  // between requests the same way a warm Vercel instance's does.
  let handler: CatalogHandler | null = null;
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    handler ??= createCatalogHandler(options);
    serveThroughHandler(handler, request, response).catch(next);
  };

  return {
    name: 'wpiplanner-catalog-endpoint',
    configureServer: (server) => void server.middlewares.use(MOUNT_PATH, middleware),
    configurePreviewServer: (server) => void server.middlewares.use(MOUNT_PATH, middleware),
  };
}

/** Adapt Node's request/response pair to the handler's Fetch-style interface. */
async function serveThroughHandler(
  handler: CatalogHandler,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  // Connect strips the mount path from `url`; the handler reads the file name
  // from the last segment, so the stripped form (`/schedb.json`) is enough.
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }

  const fetchResponse = await handler(new Request(url, { method: request.method, headers }));
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}
