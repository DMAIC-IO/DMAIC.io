/**
 * Die Schlusszeile des node-Runners, ohne Farben. Importfehler zählen als
 * Fehlschlag: wer nur die letzte Zeile liest, darf kein Grün sehen.
 * @param {{ passed: number, failed: number, skipped: number, todo: number,
 *   suites: number, files: number, domFiles: number, importFailures: number }} c
 * @returns {string}
 */
export function formatSummary(c) {
  const failed = c.failed + c.importFailures;
  const noun = c.importFailures === 1 ? 'file' : 'files';
  const imports = c.importFailures > 0 ? `, ${c.importFailures} ${noun} failed to import` : '';
  return `${c.passed} passed, ${failed} failed${imports}, ${c.skipped} skipped, ${c.todo} todo `
    + `(${c.suites} suites, ${c.files} files; ${c.domFiles} DOM files run in the browser bridge)`;
}
