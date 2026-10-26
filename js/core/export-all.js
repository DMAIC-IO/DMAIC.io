/**
 * D.Mike — Projekt-Export als Baustein (export-all.js)
 *
 * Herausgezogen aus `frame/header/action-buttons.js` (Strg+S-Pfad), weil es
 * einen zweiten Verbraucher bekommen hat: das Einwilligungstor der
 * Agentenfläche fordert beim Erteilen einen Export an — das ist die
 * vereinbarte Sicherung anstelle eines Undo-Mechanismus.
 *
 * Verhalten unverändert: alle Projekte, Dateiname mit Zeitstempel, danach
 * `project:exported` (daran hängt der ExportReminder, der
 * `settings.lastExportAt` stempelt) und ein Erfolgs-Toast.
 */

/**
 * Temporärer `<a download>`-Helfer. Kein HTML-String, keine Senke.
 * @param {string} json
 * @param {string} filename
 */
export function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Local timestamp for export filenames: YYYY-MM-DD_HH-MM-SS.
 * Dashes instead of colons — colons are not allowed in Windows filenames.
 * @param {Date} [now]
 * @returns {string}
 */
export function exportStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    + `_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
}

/**
 * Alle Projekte als eine JSON-Datei herunterladen.
 * @param {{ stateManager: object, eventBus: object, i18n: object, notify: Function }} deps
 * @returns {Promise<void>}
 */
export async function exportAllProjects({ stateManager, eventBus, i18n, notify }) {
  const json = await stateManager.exportAllJSON();
  downloadJSON(json, `dmaic-io_alle_projekte_${exportStamp()}.json`);
  eventBus.emit('project:exported');
  notify?.(i18n.t('app.export'), 'success', 'status.ok');
}
