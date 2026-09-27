import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Connect, PreviewServer, ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogSource } from '../../server/catalogHandler';
import { catalogEndpointPlugin } from '../../server/viteCatalogPlugin';

const SCHEDB_JSON = JSON.stringify({ formatVersion: 1, departments: [] });
const YEAR_HEADER_TEXT = '2026 - 2027 Academic Year\nfalse\n';

function fakeSource(): CatalogSource & ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    schedbJson: SCHEDB_JSON,
    yearHeaderText: YEAR_HEADER_TEXT,
    feedLastModified: new Date('2026-09-18T20:30:00Z'),
  }));
}

/** Capture what the plugin mounts, standing in for Vite's connect stack. */
function mountedMiddleware(hook: 'configureServer' | 'configurePreviewServer', source: CatalogSource) {
  const mounts: { path: string; middleware: Connect.NextHandleFunction }[] = [];
  const fakeServer = {
    middlewares: { use: (path: string, middleware: Connect.NextHandleFunction) => mounts.push({ path, middleware }) },
  } as unknown as ViteDevServer & PreviewServer;
  const plugin = catalogEndpointPlugin({ source });
  (plugin[hook] as (server: ViteDevServer & PreviewServer) => void)(fakeServer);
  return mounts;
}

let server: Server | null = null;
afterEach(() => server?.close());

/** Serve a mounted middleware over real HTTP, stripping the mount path the way connect does. */
async function listen(mountPath: string, middleware: Connect.NextHandleFunction): Promise<string> {
  server = createServer((request, response) => {
    request.url = request.url!.slice(mountPath.length) || '/';
    middleware(request as Connect.IncomingMessage, response, (error?: unknown) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}${mountPath}`;
}

describe('catalogEndpointPlugin', () => {
  it.each(['configureServer', 'configurePreviewServer'] as const)(
    'mounts at /api/catalog under %s, matching the Vercel path',
    (hook) => {
      const mounts = mountedMiddleware(hook, fakeSource());
      expect(mounts.map((mount) => mount.path)).toEqual(['/api/catalog']);
    },
  );

  it('does not fetch the feed until the endpoint is requested', () => {
    const source = fakeSource();
    mountedMiddleware('configureServer', source);
    expect(source).not.toHaveBeenCalled();
  });

  it('serves both files over HTTP from one fetch of the feed', async () => {
    const source = fakeSource();
    const [mount] = mountedMiddleware('configureServer', source);
    const baseUrl = await listen(mount.path, mount.middleware);

    const schedb = await fetch(`${baseUrl}/schedb.json`);
    expect(schedb.status).toBe(200);
    expect(schedb.headers.get('cache-control')).toContain('s-maxage=');
    expect(await schedb.text()).toBe(SCHEDB_JSON);

    const yearHeader = await fetch(`${baseUrl}/yearHeader.txt`);
    expect(await yearHeader.text()).toBe(YEAR_HEADER_TEXT);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('passes the handler 404 through for an unknown file', async () => {
    const [mount] = mountedMiddleware('configureServer', fakeSource());
    const baseUrl = await listen(mount.path, mount.middleware);
    const response = await fetch(`${baseUrl}/secrets.env`);
    expect(response.status).toBe(404);
  });
});
