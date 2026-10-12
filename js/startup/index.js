/**
 * D.Mike — Startup concern registry.
 * One-shot boot side effects, run in order by app.js after the frame and
 * pages are initialized. Order preserved from the original app.js bootstrap:
 * deeplink → cross-version prompt → migration notice → viewport guard →
 * auto-save → ZEG sheet sync → e2e handle.
 */
import exampleDeeplink from './example-deeplink.js';
import crossVersionPrompt from './cross-version-prompt.js';
import migrationNotice from './migration-notice.js';
import viewportGuard from './viewport-guard.js';
import autosave from './autosave.js';
import zegSheetSync from './zeg-sheet-sync.js';
import e2eHandle from './e2e-handle.js';

export const startupTasks = [
  exampleDeeplink,
  crossVersionPrompt,
  migrationNotice,
  viewportGuard,
  autosave,
  zegSheetSync,
  e2eHandle,
];
