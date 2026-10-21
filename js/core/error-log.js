/**
 * D.Mike — Error log (core/error-log.js)
 * Fixed-size ring buffer of recent errors for the bug reporter. Hooks
 * window `error`, `unhandledrejection` and console.error; the original
 * console.error is always called — the buffer swallows nothing. No output,
 * no network, no storage.
 */

const STACK_LIMIT = 2000;
const MESSAGE_LIMIT = 2000; // console.error may be handed whole data dumps

function describe(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function stackOf(value) {
  return value instanceof Error && value.stack ? value.stack : null;
}

function nameOf(value) {
  return value instanceof Error ? value.name : null;
}

/**
 * Stack of whoever called console.error. Must be called directly from the
 * wrapper: the V8 "Error" header, callSite's own frame and the wrapper's
 * frame are dropped.
 */
function callSite() {
  const lines = String(new Error().stack ?? '').split('\n');
  if (lines.length && !/^\s+at\s|@/.test(lines[0])) lines.shift();
  return lines.slice(2).join('\n') || null;
}

/**
 * Create an error log.
 * @param {{limit?: number, target?: EventTarget, consoleObj?: {error: Function},
 *          now?: () => Date}} [opts]
 * @returns {{install: () => void, uninstall: () => void,
 *            record: (kind: string, message: string, stack: string|null, name?: string|null) => void,
 *            getEntries: () => object[]}}
 */
export function createErrorLog(opts = {}) {
  const limit = opts.limit ?? 20;
  const target = opts.target ?? globalThis;
  const consoleObj = opts.consoleObj ?? console;
  const now = opts.now ?? (() => new Date());
  const entries = [];
  let originalError = null;

  function record(kind, message, stack, name = null) {
    entries.push({
      at: now().toISOString(),
      kind,
      name: name ? String(name) : null,
      message: String(message ?? ''),
      stack: stack ? String(stack).slice(0, STACK_LIMIT) : null,
    });
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }

  function onError(ev) {
    record('error', ev.message || describe(ev.error), stackOf(ev.error), nameOf(ev.error));
  }

  function onRejection(ev) {
    record('unhandledrejection', describe(ev.reason), stackOf(ev.reason), nameOf(ev.reason));
  }

  return {
    record,
    install() {
      if (originalError) return;
      originalError = consoleObj.error;
      const original = originalError;
      consoleObj.error = function (...args) {
        try {
          const err = args.find(a => a instanceof Error);
          record('console.error', args.map(describe).join(' ').slice(0, MESSAGE_LIMIT),
            err ? stackOf(err) : callSite(), nameOf(err));
        } catch { /* never break console.error */ }
        return original.apply(this, args);
      };
      target.addEventListener('error', onError);
      target.addEventListener('unhandledrejection', onRejection);
    },
    uninstall() {
      if (!originalError) return;
      consoleObj.error = originalError;
      originalError = null;
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
    },
    getEntries() { return entries.map(e => ({ ...e })); },
  };
}

/** The application-wide log (window + console). */
export const errorLog = createErrorLog();

/** Install the application-wide log; safe to call more than once. */
export function installErrorLog() { errorLog.install(); }
