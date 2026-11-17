/**
 * D.Mike — Startup concern registry.
 * One-shot boot side effects, run in order by app.js after the frame and
 * pages are initialized. The worksheet preload is not in this list: app.js
 * starts it right after registering the worksheet reader, before the first
 * mount, so the window in which the worksheet facade reads `not_loaded` is
 * as short as possible (it never blocks the boot).
 * The order keeps the one of the original app.js bootstrap:
 * deeplink → cross-version prompt → migration notice → viewport guard →
 * auto-save → ZEG sheet sync → e2e handle → agent surface.
 */
import exampleDeeplink from './example-deeplink.js';
import crossVersionPrompt from './cross-version-prompt.js';
import migrationNotice from './migration-notice.js';
import viewportGuard from './viewport-guard.js';
import autosave from './autosave.js';
import zegSheetSync from './zeg-sheet-sync.js';
import e2eHandle from './e2e-handle.js';
import agentSurface from './agent-surface.js';

export const startupTasks = [
  exampleDeeplink,
  crossVersionPrompt,
  migrationNotice,
  viewportGuard,
  autosave,
  zegSheetSync,
  e2eHandle,
  agentSurface,
];
