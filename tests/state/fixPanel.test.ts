import { describe, expect, it } from 'vitest';
import {
  FixPanelState,
  LONG_SEARCH_MS,
  QUICK_SEARCH_MS,
  type FixSource,
  type FixTarget,
} from '$lib/state/fixPanel.svelte';
import type { FixRequest, FixResult } from '$lib/scheduling/fixFinder';
import { allTimesAvailable } from '../fixtures/generatorFixtures';

/** Answers every search immediately, or holds it until `fail` is called. */
class CountingSource implements FixSource {
  finds = 0;
  cancels = 0;
  lastRequest: FixRequest | null = null;
  private handlers: Parameters<FixSource['find']>[1] | null = null;

  constructor(private readonly answer: FixResult | null) {}

  find(request: FixRequest, handlers: Parameters<FixSource['find']>[1]): void {
    this.finds++;
    this.lastRequest = request;
    this.handlers = handlers;
    if (this.answer !== null) handlers.onResult(this.answer);
  }
  cancel(): void {
    this.cancels++;
  }
  terminate(): void {}
  fail(message: string): void {
    this.handlers?.onError(message);
  }
}

const TARGET: FixTarget = { courseId: 'CS|1102', componentNumber: 'AL02', pickedSectionId: 'CS|1102|AL02', baselines: new Map() };
const REQUEST: FixRequest = {
  pinnedCourse: { courseId: 'CS|1102', candidates: [] },
  otherCourses: [],
  chosenTimes: allTimesAvailable(),
};
const RESULT: FixResult = { fixes: [], complete: true, reason: { kind: 'no-combination' } };

describe('FixPanelState', () => {
  it('solves only when opened, and answers a repeat question from its cache', () => {
    const source = new CountingSource(RESULT);
    const panel = new FixPanelState(source);
    expect(source.finds).toBe(0);

    panel.open(TARGET, REQUEST, 'key');
    panel.close();
    panel.open(TARGET, REQUEST, 'key');

    expect(source.finds).toBe(1);
    expect(panel.status).toBe('done');
    expect(panel.result).toEqual(RESULT);
  });

  it('forgets every answer and closes when the choices change', () => {
    const source = new CountingSource(RESULT);
    const panel = new FixPanelState(source);
    panel.open(TARGET, REQUEST, 'key');
    panel.previewSectionIds = ['CS|1102|AL02'];

    panel.invalidate();
    expect(panel.target).toBeNull();
    expect(panel.previewSectionIds).toBeNull();

    panel.open(TARGET, REQUEST, 'key');
    expect(source.finds).toBe(2);
  });

  it('gives the first search one second and "search longer" the long budget', () => {
    const timedOut: FixResult = { fixes: [], complete: false, reason: { kind: 'timed-out' } };
    const source = new CountingSource(timedOut);
    const panel = new FixPanelState(source);

    panel.open(TARGET, REQUEST, 'key');
    expect(source.lastRequest?.maxMillis).toBe(QUICK_SEARCH_MS);
    expect(panel.searchedLonger).toBe(false);

    panel.searchLonger();
    expect(source.lastRequest?.maxMillis).toBe(LONG_SEARCH_MS);
    expect(panel.searchedLonger).toBe(true);
  });

  it('stops the running search when closed', () => {
    const source = new CountingSource(null);
    const panel = new FixPanelState(source);
    panel.open(TARGET, REQUEST, 'key');
    panel.searchLonger();
    const cancelsBefore = source.cancels;

    panel.close();
    expect(source.cancels).toBe(cancelsBefore + 1);
    expect(panel.target).toBeNull();

    // Nothing left to search longer for once closed.
    panel.searchLonger();
    expect(source.finds).toBe(2);
  });

  it('reports a failed search', () => {
    const source = new CountingSource(null);
    const panel = new FixPanelState(source);
    panel.open(TARGET, REQUEST, 'key');
    expect(panel.status).toBe('searching');

    source.fail('worker died');
    expect(panel.status).toBe('error');
    expect(panel.errorMessage).toBe('worker died');
  });
});
