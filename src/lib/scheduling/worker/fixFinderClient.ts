/**
 * Typed wrapper around the fix-search worker, with a synchronous fallback for
 * environments without workers (tests, SSR) — the same pattern as `client.ts`.
 */
import { findFixes, type FixRequest, type FixResult } from '../fixFinder';
import type { FixFinderRequest, FixFinderResponse } from './fixFinder.worker';

export interface FindFixesHandlers {
  onResult(result: FixResult): void;
  onError(message: string): void;
}

export type FixWorkerFactory = () => Worker;

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./fixFinder.worker.ts', import.meta.url), { type: 'module' });
}

export class FixFinderClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pendingRequestId = 0;
  private pending: FindFixesHandlers | null = null;

  /** @param createWorker Pass `null` to force the synchronous fallback. */
  constructor(private readonly createWorker: FixWorkerFactory | null = defaultWorkerFactory) {}

  /** Start a search, superseding any running one. */
  find(request: FixRequest, handlers: FindFixesHandlers): void {
    const worker = this.ensureWorker();
    if (worker === null) {
      this.findSynchronously(request, handlers);
      return;
    }
    this.pendingRequestId = this.nextRequestId++;
    this.pending = handlers;
    const message: FixFinderRequest = { requestId: this.pendingRequestId, request };
    worker.postMessage(message);
  }

  /**
   * Stop the running search.
   *
   * The search runs as one synchronous call inside the worker, so it cannot
   * be interrupted by a message; the worker is terminated instead (a fresh one
   * starts on the next search). That is what makes closing the panel stop a
   * long "search longer" run straight away rather than leaving it to burn CPU.
   */
  cancel(): void {
    if (this.pending !== null) {
      this.worker?.terminate();
      this.worker = null;
    }
    this.forgetPending();
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.forgetPending();
  }

  private forgetPending(): void {
    this.pending = null;
    this.pendingRequestId = 0;
  }

  private ensureWorker(): Worker | null {
    if (this.createWorker === null) return null;
    if (this.worker !== null) return this.worker;
    try {
      this.worker = this.createWorker();
      this.worker.addEventListener('message', (event: MessageEvent<FixFinderResponse>) =>
        this.handleResponse(event.data),
      );
      this.worker.addEventListener('error', (event) => {
        this.pending?.onError(`The fix search crashed: ${event.message}`);
        this.terminate();
      });
      return this.worker;
    } catch {
      // No Worker here (a test runner, a strict CSP): run on this thread instead.
      return null;
    }
  }

  private handleResponse(response: FixFinderResponse): void {
    if (response.requestId !== this.pendingRequestId || this.pending === null) return;
    const handlers = this.pending;
    this.forgetPending();
    if (response.type === 'done') handlers.onResult(response.result);
    else handlers.onError(response.message);
  }

  private findSynchronously(request: FixRequest, handlers: FindFixesHandlers): void {
    try {
      handlers.onResult(findFixes(request));
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error));
    }
  }
}
