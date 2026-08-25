/**
 * Typed wrapper around the generator worker.
 *
 * Callers hand it an input and three callbacks; it deals with request ids,
 * superseded searches, and the worker's lifetime. When workers are unavailable
 * (server-side rendering, an old browser, a test), it falls back to running the
 * same search synchronously so the UI still works.
 */
import { ScheduleGenerator, streamPermutations } from '../generator';
import type { ChosenTimes, CourseSectionLists, SchedulePermutation } from '../types';
import type { GeneratorRequest, GeneratorResponse } from './protocol';

export interface GenerateOptions {
  courses: CourseSectionLists;
  chosenTimes: ChosenTimes;
  /** 0 for the normal search; 1..10 for the conflict resolver. */
  maxSolutions?: number;
  onBatch(permutations: SchedulePermutation[], total: number): void;
  /** `completed` is false when a newer request superseded this one. */
  onDone(total: number, completed: boolean): void;
  onError(message: string): void;
}

/** Constructs the worker; injectable so tests can drive a fake. */
export type WorkerFactory = () => Worker;

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
}

export class GeneratorClient {
  private worker: Worker | null = null;
  private readonly createWorker: WorkerFactory | null;
  private nextRequestId = 1;
  private pending: GenerateOptions | null = null;
  private pendingRequestId = 0;

  /**
   * @param createWorker Omit to use the bundled worker; pass `null` to force the
   *   synchronous fallback
   */
  constructor(createWorker: WorkerFactory | null = defaultWorkerFactory) {
    this.createWorker = createWorker;
  }

  /** Start a search, superseding whatever was running. */
  generate(options: GenerateOptions): void {
    const requestId = this.nextRequestId++;
    const request: GeneratorRequest = {
      type: 'generate',
      requestId,
      courses: options.courses,
      chosenTimes: options.chosenTimes,
      maxSolutions: options.maxSolutions ?? 0,
    };

    const worker = this.ensureWorker();

    if (worker === null) {
      this.generateSynchronously(options);
      return;
    }

    this.pending = options;
    this.pendingRequestId = requestId;
    worker.postMessage(request);
  }

  /** Abandon the running search without tearing the worker down. */
  cancel(): void {
    if (this.pendingRequestId === 0) return;

    this.worker?.postMessage({ type: 'cancel', requestId: this.pendingRequestId });
    this.pending = null;
    this.pendingRequestId = 0;
  }

  /** Release the worker. The client can still be used; it will spawn a new one. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    this.pendingRequestId = 0;
  }

  private ensureWorker(): Worker | null {
    if (this.createWorker === null) return null;
    if (this.worker !== null) return this.worker;

    try {
      this.worker = this.createWorker();
      this.worker.addEventListener('message', (event: MessageEvent<GeneratorResponse>) =>
        this.handleMessage(event.data),
      );
      this.worker.addEventListener('error', (event) => {
        this.pending?.onError(`The schedule generator crashed: ${event.message}`);
        this.terminate();
      });
      return this.worker;
    } catch {
      // No Worker constructor (SSR, a test runner) or construction blocked by a
      // strict CSP. Fall back rather than leaving the Schedules tab empty.
      this.worker = null;
      return null;
    }
  }

  private handleMessage(response: GeneratorResponse): void {
    // Results from a superseded search are dropped, not merged.
    if (response.requestId !== this.pendingRequestId) return;
    const handlers = this.pending;
    if (handlers === null) return;

    if (response.type === 'progress') {
      handlers.onBatch(response.permutations, response.total);
      return;
    }

    if (response.type === 'error') {
      this.pending = null;
      this.pendingRequestId = 0;
      handlers.onError(response.message);
      return;
    }

    this.pending = null;
    this.pendingRequestId = 0;
    handlers.onDone(response.total, response.completed);
  }

  /** Same search, same callbacks, on this thread. Used when workers are absent. */
  private generateSynchronously(options: GenerateOptions): void {
    try {
      const generator = new ScheduleGenerator({
        courses: options.courses,
        chosenTimes: options.chosenTimes,
        maxSolutions: options.maxSolutions ?? 0,
      });

      const completed = streamPermutations(generator, {
        onBatch: options.onBatch,
      });

      options.onDone(generator.permutations.length, completed);
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    }
  }
}
