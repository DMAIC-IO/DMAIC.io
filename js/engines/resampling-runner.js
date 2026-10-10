/**
 * D.Mike — Resampling runners (resampling-runner.js)
 *
 * A runner drives executeJob() and is the only engine surface the module
 * uses: run(job, { onProgress, signal }) → Promise<ResamplingResult>. The
 * inline runner works on the main thread and awaits a macrotask between
 * chunks so the UI stays responsive. A web-worker runner can be added later;
 * it must pass tests/engines/resampling-runner-contract.js.
 */

import { executeJob } from './resampling-engine.js';

function abortError() {
  return new DOMException('Resampling aborted', 'AbortError');
}

const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Main-thread runner.
 * @param {{ chunkSize?: number, yieldToEventLoop?: () => Promise<void> }} [opts]
 * @returns {{ run: (job: object, opts?: { onProgress?: (done: number, total: number) => void,
 *                                         signal?: AbortSignal }) => Promise<object> }}
 */
export function createInlineRunner({ chunkSize = 500, yieldToEventLoop = nextMacrotask } = {}) {
  return {
    async run(job, { onProgress, signal } = {}) {
      if (signal && signal.aborted) throw abortError();
      const it = executeJob(job, { chunkSize });
      for (;;) {
        const step = it.next();
        if (step.done) return step.value;
        if (onProgress) onProgress(step.value.done, step.value.total);
        await yieldToEventLoop();
        if (signal && signal.aborted) {
          it.return();
          throw abortError();
        }
      }
    },
  };
}
