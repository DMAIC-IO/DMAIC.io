/**
 * D.Mike — Bug reporter (frame/bug-reporter/bug-reporter.js)
 * Bug button on dev hosts → opt-in → optional capture → description (with
 * editor) → send, falling back to downloads. Every failure ends in a
 * notify; no project state is touched and nothing is kept on cancel.
 * Spec: docs/superpowers/specs/2026-10-08-bug-reporter-design.md (private repo).
 */
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';
import { VERSION } from '../../core/version.js';
import { errorLog } from '../../core/error-log.js';
import { buildBugReportOptInDialog } from '../../dialogs/bug-report-optin/bug-report-optin.js';
import { buildBugReportDescribeDialog } from '../../dialogs/bug-report-describe/bug-report-describe.js';
import { isReporterHost } from './host.js';
import { buildReport, collectContext } from './report.js';
import { captureScreen } from './capture.js';
import { mountEditor } from './editor.js';
import { createHttpTransport, downloadFiles } from './transport.js';

/** Capture reason → i18n key of the user toast. */
const CAPTURE_MESSAGE = { unsupported: 'captureUnsupported', denied: 'captureDenied', failed: 'captureFailed' };

/**
 * Capture reason → German phrase for the report's notes. The report is
 * written for the (German-speaking) maintainer, independent of the UI language.
 */
const CAPTURE_NOTE = { unsupported: 'nicht verfügbar', denied: 'abgelehnt', failed: 'fehlgeschlagen' };

/**
 * "<prefix>: <phrase> (<raw message>)" — the raw message only when it adds
 * something beyond the reason code itself.
 * @param {string} prefix @param {string} phrase @param {unknown} err @param {string} [code]
 * @returns {string}
 */
function note(prefix, phrase, err, code) {
  const raw = err?.message ?? (err == null ? '' : String(err));
  return raw && raw !== code ? `${prefix}: ${phrase} (${raw})` : `${prefix}: ${phrase}`;
}

/**
 * Mount the bug button and its flow, on dev hosts only.
 * @param {object} kernel bootKernel() services
 * @param {{dialog: object, workspace: object, dmaicTiles: object, notify: Function}} ui
 *   frame services; `dialog` is the dialog service (ui/dialog/dialog.js)
 * @param {{hostname?: string, transport?: {send: Function}, capture?: Function}} [deps]
 *   environment seam: the host name to check, the report transport and the
 *   screen capture; each defaults to the real browser environment
 * @returns {{button: HTMLButtonElement, run: () => Promise<void>}|null}
 */
export function initBugReporter(kernel, ui, deps = {}) {
  if (!isReporterHost(deps.hostname ?? location.hostname)) return null;
  const { i18n, eventBus, stateManager } = kernel;
  const t = i18n.tf('bugReport');
  const transport = deps.transport ?? createHttpTransport();
  const capture = deps.capture ?? captureScreen;
  const optIn = buildBugReportOptInDialog({ i18n, eventBus });
  const describe = buildBugReportDescribeDialog({ i18n, eventBus });

  const button = h('button', {
    type: 'button', class: 'bug-reporter__trigger', title: t('trigger'), 'aria-label': t('trigger'),
  }, icon('action.report-bug', { size: 'sm' }));
  eventBus.on('language:changed', () => {
    button.title = t('trigger');
    button.setAttribute('aria-label', t('trigger'));
  });
  document.body.append(button);

  let running = false;

  async function run() {
    const choice = await optIn.open(ui.dialog, {}, { confirmLabel: t('next') });
    if (!choice) return;

    const notes = [];
    let shot = null;
    if (choice.screenshot) {
      try {
        shot = await capture();
      } catch (err) {
        const reason = CAPTURE_NOTE[err?.reason] ? err.reason : 'failed';
        notes.push(note('Screenshot', CAPTURE_NOTE[reason], err, reason));
        ui.notify(t(CAPTURE_MESSAGE[reason]), 'warning');
      }
    }

    let editor = null;
    let annotations = null;
    let description;
    try {
      description = await describe.open(ui.dialog, { hasScreenshot: !!shot }, {
        confirmLabel: t('send'),
        size: shot ? 'wide' : undefined,
        onMount: body => {
          if (!shot) return;
          const host = body.querySelector('.bug-report__editor-host');
          try {
            editor = mountEditor(host, { ...shot, t });
          } catch (err) {
            // Degrade to a text-only report; the screenshot itself still goes out.
            notes.push(note('Editor', 'konnte nicht gestartet werden', err));
            editor = null;
          }
        },
        onConfirm: () => {
          editor?.commitPending();
          annotations = editor ? editor.model.toJSON() : null;
          // createDialog.open() still resolves model.result() when the caller
          // owns onConfirm; returning undefined (not false) lets the dialog close.
          return undefined;
        },
      });
    } finally {
      editor?.destroy();
    }
    if (description === null) return;

    let project = null;
    if (choice.project) {
      try { project = stateManager.exportJSON(); } catch (err) {
        notes.push(note('Projektdaten', 'Export fehlgeschlagen', err));
      }
    }

    const report = buildReport({
      date: new Date(),
      description,
      context: collectContext(
        { version: VERSION, moduleRegistry: kernel.moduleRegistry, workspace: ui.workspace,
          dmaicTiles: ui.dmaicTiles, themeManager: kernel.themeManager, i18n },
        { location, innerWidth, innerHeight, navigator, now: new Date() }),
      errors: errorLog.getEntries(),
      notes,
      screenshot: shot?.blob ?? null,
      annotations,
      project,
    });

    try {
      const { path } = await transport.send(report);
      ui.notify(t('sent', { path }), 'success');
    } catch (err) {
      if (err?.rejected) {
        ui.notify(t('rejected', { reason: err.message }), 'error');
      } else {
        downloadFiles(report);
        ui.notify(t('downloaded', { folder: report.folder }), 'warning');
      }
    }
  }

  button.addEventListener('click', async () => {
    if (running) return;
    running = true;
    try { await run(); } catch (err) {
      console.error('[bug-reporter]', err);
      ui.notify(t('failed'), 'error');
    } finally { running = false; }
  });

  return { button, run };
}
