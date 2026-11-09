import { describe, expect, it } from 'vitest';
import { FixFinderClient } from '$lib/scheduling/worker/fixFinderClient';
import type { FixRequest } from '$lib/scheduling/fixFinder';
import { allTimesAvailable } from '../../fixtures/generatorFixtures';

/** Enough of a Worker to see what the client does with it. */
class FakeWorker {
  posted: unknown[] = [];
  terminated = false;
  private listener: ((event: MessageEvent) => void) | null = null;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') this.listener = listener;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.listener?.({ data } as MessageEvent);
  }
}

const REQUEST: FixRequest = {
  pinnedCourse: { courseId: 'CS|1102', candidates: [] },
  otherCourses: [],
  chosenTimes: allTimesAvailable(),
};
const noop = { onResult: () => {}, onError: () => {} };

function setup() {
  const workers: FakeWorker[] = [];
  const client = new FixFinderClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  return { client, workers };
}

describe('FixFinderClient', () => {
  it('terminates a busy worker on cancel, so a long search really stops', () => {
    const { client, workers } = setup();
    client.find(REQUEST, noop);
    client.cancel();
    expect(workers[0].terminated).toBe(true);

    client.find(REQUEST, noop);
    expect(workers).toHaveLength(2);
  });

  it('keeps an idle worker for the next search', () => {
    const { client, workers } = setup();
    client.find(REQUEST, noop);
    workers[0].reply({ requestId: 1, type: 'done', result: { fixes: [], complete: true, reason: null } });
    client.cancel();
    expect(workers[0].terminated).toBe(false);
  });

  it('delivers only the current request’s result', () => {
    const { client, workers } = setup();
    const results: unknown[] = [];
    client.find(REQUEST, { onResult: (result) => results.push(result), onError: () => {} });
    workers[0].reply({ requestId: 99, type: 'done', result: 'stale' });
    workers[0].reply({ requestId: 1, type: 'done', result: 'fresh' });
    expect(results).toEqual(['fresh']);
  });
});
