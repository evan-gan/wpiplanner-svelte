/**
 * Runs the permutation search off the main thread.
 *
 * The legacy app sliced the same search into 30-step chunks on a GWT `Timer` so
 * the browser stayed responsive; here it runs flat out and posts schedules back
 * in batches as they are found.
 */
import { ScheduleGenerator, streamPermutations } from '../generator';
import type { GeneratorRequest, GeneratorResponse } from './protocol';

/** The newest request wins; anything older is abandoned at the next batch. */
let currentRequestId = 0;

function post(message: GeneratorResponse): void {
  self.postMessage(message);
}

self.addEventListener('message', (event: MessageEvent<GeneratorRequest>) => {
  const request = event.data;

  if (request.type === 'cancel') {
    // Only cancels the request it names, so a late cancel cannot kill a newer run.
    if (request.requestId === currentRequestId) currentRequestId = -1;
    return;
  }

  currentRequestId = request.requestId;

  try {
    const generator = new ScheduleGenerator({
      courses: request.courses,
      chosenTimes: request.chosenTimes,
      maxSolutions: request.maxSolutions,
    });

    const completed = streamPermutations(generator, {
      onBatch: (permutations, total) =>
        post({ type: 'progress', requestId: request.requestId, permutations, total }),
      shouldCancel: () => currentRequestId !== request.requestId,
    });

    post({
      type: 'done',
      requestId: request.requestId,
      total: generator.permutations.length,
      completed,
    });
  } catch (error) {
    post({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
