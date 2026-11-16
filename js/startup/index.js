/**
 * D.Mike — Startup concern registry.
 * One-shot boot side effects, run in order by app.js after the frame and
 * pages are initialized. Worksheet preload runs first: its listeners must
 * hear the project events of a deeplinked scenario. It starts loading the
 * worksheet code without blocking the later concerns.
 * The rest keeps the order of the original app.js bootstrap:
 * deeplink → cross-version prompt → migration notice → viewport guard →
 * auto-save → ZEG sheet sync → e2e handle → agent surface.
 */
import worksheetPreload from './worksheet-preload.js';
import exampleDeeplink from './example-deeplink.js';
import crossVersionPrompt from './cross-version-prompt.js';
import migrationNotice from './migration-notice.js';
import viewportGuard from './viewport-guard.js';
import autosave from './autosave.js';
import zegSheetSync from './zeg-sheet-sync.js';
import e2eHandle from './e2e-handle.js';
import agentSurface from './agent-surface.js';

export const startupTasks = [
  worksheetPreload,
  exampleDeeplink,
  crossVersionPrompt,
  migrationNotice,
  viewportGuard,
  autosave,
  zegSheetSync,
  e2eHandle,
  agentSurface,
];
