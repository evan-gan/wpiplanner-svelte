/**
 * Runs the fix search off the main thread.
 *
 * One request in, one result out. The search is capped by its own step budget,
 * so there is no mid-run cancel; a superseded result is dropped by the client.
 */
import { findFixes, type FixRequest, type FixResult } from '../fixFinder';

export interface FixFinderRequest {
  requestId: number;
  request: FixRequest;
}

export type FixFinderResponse =
  | { requestId: number; type: 'done'; result: FixResult }
  | { requestId: number; type: 'error'; message: string };

self.addEventListener('message', (event: MessageEvent<FixFinderRequest>) => {
  const { requestId, request } = event.data;
  let response: FixFinderResponse;
  try {
    response = { requestId, type: 'done', result: findFixes(request) };
  } catch (error) {
    response = { requestId, type: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
});
