/**
 * A single value that reloads itself on read once it is older than a max age.
 *
 * This is what makes the catalog refresh "on the first request after ten
 * minutes" without a cron job: nothing runs between requests, and the first
 * read past the deadline pays for the reload. Concurrent reads during a reload
 * share one load rather than each starting their own.
 *
 * A failed reload keeps serving the previous value — stale seat counts beat no
 * planner — and waits `retryAfterFailureMs` before trying again, so an upstream
 * outage costs one upstream request per retry window, not one per visitor.
 */

export interface CacheRead<Value> {
  value: Value;
  /** Epoch ms when `value` was loaded. */
  loadedAt: number;
  /** Epoch ms after which the next read reloads. */
  expiresAt: number;
  /** Set when the last reload failed and this is the previous value. */
  staleBecause?: Error;
}

export interface RefreshingCacheOptions<Value> {
  load: () => Promise<Value>;
  maxAgeMs: number;
  /** How long to keep serving the previous value after a failed reload. */
  retryAfterFailureMs: number;
  /** Injected by tests; defaults to `Date.now`. */
  now?: () => number;
}

export class RefreshingCache<Value> {
  private current: CacheRead<Value> | null = null;
  private pendingLoad: Promise<CacheRead<Value>> | null = null;
  private readonly now: () => number;

  constructor(private readonly options: RefreshingCacheOptions<Value>) {
    this.now = options.now ?? Date.now;
  }

  /**
   * Return the cached value, reloading first if it has expired.
   *
   * @throws the load's error only when there is no previous value to fall back on
   */
  async read(): Promise<CacheRead<Value>> {
    if (this.current !== null && this.now() < this.current.expiresAt) return this.current;
    this.pendingLoad ??= this.reload().finally(() => {
      this.pendingLoad = null;
    });
    return this.pendingLoad;
  }

  private async reload(): Promise<CacheRead<Value>> {
    try {
      const value = await this.options.load();
      const loadedAt = this.now();
      this.current = { value, loadedAt, expiresAt: loadedAt + this.options.maxAgeMs };
      return this.current;
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      if (this.current === null) throw error;

      this.current = {
        value: this.current.value,
        loadedAt: this.current.loadedAt,
        expiresAt: this.now() + this.options.retryAfterFailureMs,
        staleBecause: error,
      };
      return this.current;
    }
  }
}
