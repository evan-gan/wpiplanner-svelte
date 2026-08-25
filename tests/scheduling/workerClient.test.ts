/**
 * Drives {@link GeneratorClient} against a fake Worker so the request-id
 * bookkeeping — which is what keeps a superseded search from overwriting a newer
 * one — is covered without spawning a real thread.
 */
import { describe, expect, it, vi } from 'vitest';
import { GeneratorClient } from '$lib/scheduling/worker/client';
import type { GeneratorRequest, GeneratorResponse } from '$lib/scheduling/worker/protocol';
import { allTimesAvailable, section } from '../fixtures/generatorFixtures';

class FakeWorker {
  readonly sent: GeneratorRequest[] = [];
  terminated = false;
  private listeners: ((event: MessageEvent<GeneratorResponse>) => void)[] = [];

  postMessage(request: GeneratorRequest): void {
    this.sent.push(request);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    if (type === 'message') this.listeners.push(listener as never);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Push a response back to the client, as the real worker would. */
  reply(response: GeneratorResponse): void {
    for (const listener of this.listeners) {
      listener({ data: response } as MessageEvent<GeneratorResponse>);
    }
  }
}

function makeClient() {
  const worker = new FakeWorker();
  const client = new GeneratorClient(() => worker as unknown as Worker);
  return { worker, client };
}

const input = {
  courses: [[section('CS|2102|A01', ['A'] as const, ['9:00AM-9:50AM mon'])]],
  chosenTimes: allTimesAvailable(),
};

describe('GeneratorClient', () => {
  it('sends the search to the worker with a request id', () => {
    const { worker, client } = makeClient();
    client.generate({ ...input, onBatch: () => {}, onDone: () => {}, onError: () => {} });

    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0]).toMatchObject({ type: 'generate', maxSolutions: 0 });
  });

  it('forwards batches and the final total to the caller', () => {
    const { worker, client } = makeClient();
    const onBatch = vi.fn();
    const onDone = vi.fn();
    client.generate({ ...input, onBatch, onDone, onError: () => {} });

    const requestId = (worker.sent[0] as { requestId: number }).requestId;
    worker.reply({ type: 'progress', requestId, permutations: [], total: 3 });
    worker.reply({ type: 'done', requestId, total: 3, completed: true });

    expect(onBatch).toHaveBeenCalledWith([], 3);
    expect(onDone).toHaveBeenCalledWith(3, true);
  });

  it('ignores results tagged with a superseded request id', () => {
    const { worker, client } = makeClient();
    const stale = vi.fn();
    const fresh = vi.fn();

    client.generate({ ...input, onBatch: stale, onDone: () => {}, onError: () => {} });
    const staleId = (worker.sent[0] as { requestId: number }).requestId;

    client.generate({ ...input, onBatch: fresh, onDone: () => {}, onError: () => {} });
    const freshId = (worker.sent[1] as { requestId: number }).requestId;

    worker.reply({ type: 'progress', requestId: staleId, permutations: [], total: 99 });
    worker.reply({ type: 'progress', requestId: freshId, permutations: [], total: 1 });

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledWith([], 1);
  });

  it('tells the worker to cancel the request it is actually running', () => {
    const { worker, client } = makeClient();
    client.generate({ ...input, onBatch: () => {}, onDone: () => {}, onError: () => {} });
    const requestId = (worker.sent[0] as { requestId: number }).requestId;

    client.cancel();
    expect(worker.sent[1]).toEqual({ type: 'cancel', requestId });
  });

  it('surfaces a worker-side error to the caller', () => {
    const { worker, client } = makeClient();
    const onError = vi.fn();
    client.generate({ ...input, onBatch: () => {}, onDone: () => {}, onError });

    const requestId = (worker.sent[0] as { requestId: number }).requestId;
    worker.reply({ type: 'error', requestId, message: 'boom' });

    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('terminates the worker on request', () => {
    const { worker, client } = makeClient();
    client.generate({ ...input, onBatch: () => {}, onDone: () => {}, onError: () => {} });
    client.terminate();
    expect(worker.terminated).toBe(true);
  });

  it('runs the search on this thread when no worker is available', () => {
    const client = new GeneratorClient(null);
    const onDone = vi.fn();
    const batches: number[] = [];

    client.generate({
      ...input,
      onBatch: (permutations) => batches.push(permutations.length),
      onDone,
      onError: () => {},
    });

    expect(batches).toEqual([1]);
    expect(onDone).toHaveBeenCalledWith(1, true);
  });
});
