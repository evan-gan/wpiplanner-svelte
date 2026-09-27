import { describe, expect, it, vi } from 'vitest';
import { RefreshingCache } from '../../server/refreshingCache';

const MAX_AGE_MS = 600_000;
const RETRY_MS = 60_000;

/** A cache over a counter, with a clock the test moves by hand. */
function makeCache(load: () => Promise<number>) {
  const clock = { now: 1_000_000 };
  const cache = new RefreshingCache({
    load,
    maxAgeMs: MAX_AGE_MS,
    retryAfterFailureMs: RETRY_MS,
    now: () => clock.now,
  });
  return { cache, clock };
}

function countingLoader() {
  let calls = 0;
  return vi.fn(async () => ++calls);
}

describe('RefreshingCache', () => {
  it('loads on the first read', async () => {
    const load = countingLoader();
    const { cache, clock } = makeCache(load);
    const read = await cache.read();
    expect(read.value).toBe(1);
    expect(read.expiresAt).toBe(clock.now + MAX_AGE_MS);
  });

  it('serves the cached value until the max age has passed', async () => {
    const load = countingLoader();
    const { cache, clock } = makeCache(load);
    await cache.read();
    clock.now += MAX_AGE_MS - 1;
    expect((await cache.read()).value).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads on the first read at or after the max age', async () => {
    const load = countingLoader();
    const { cache, clock } = makeCache(load);
    await cache.read();
    clock.now += MAX_AGE_MS;
    expect((await cache.read()).value).toBe(2);
  });

  it('shares one load between reads that arrive while it is running', async () => {
    const load = countingLoader();
    const { cache } = makeCache(load);
    const values = await Promise.all([cache.read(), cache.read(), cache.read()]);
    expect(values.map((read) => read.value)).toEqual([1, 1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('throws when the very first load fails, since there is nothing to fall back on', async () => {
    const { cache } = makeCache(async () => {
      throw new Error('feed down');
    });
    await expect(cache.read()).rejects.toThrow('feed down');
  });

  it('tries again on the next read after a failed first load', async () => {
    let attempt = 0;
    const { cache } = makeCache(async () => {
      if (++attempt === 1) throw new Error('feed down');
      return attempt;
    });
    await expect(cache.read()).rejects.toThrow();
    expect((await cache.read()).value).toBe(2);
  });

  it('serves the previous value, flagged stale, when a reload fails', async () => {
    let failing = false;
    const { cache, clock } = makeCache(async () => {
      if (failing) throw new Error('feed down');
      return 7;
    });
    const first = await cache.read();
    failing = true;
    clock.now += MAX_AGE_MS;

    const stale = await cache.read();
    expect(stale.value).toBe(7);
    expect(stale.loadedAt).toBe(first.loadedAt);
    expect(stale.staleBecause?.message).toBe('feed down');
    expect(stale.expiresAt).toBe(clock.now + RETRY_MS);
  });

  it('waits the retry window, not the full max age, before retrying after a failure', async () => {
    let failing = false;
    const load = vi.fn(async () => {
      if (failing) throw new Error('feed down');
      return 7;
    });
    const { cache, clock } = makeCache(load);
    await cache.read();
    failing = true;
    clock.now += MAX_AGE_MS;
    await cache.read();

    clock.now += RETRY_MS - 1;
    await cache.read();
    expect(load).toHaveBeenCalledTimes(2);

    failing = false;
    clock.now += 1;
    const recovered = await cache.read();
    expect(load).toHaveBeenCalledTimes(3);
    expect(recovered.staleBecause).toBeUndefined();
  });
});
