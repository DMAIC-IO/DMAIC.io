/**
 * Algorithm Lab — Export Utilities
 * JSON export of validation results and try-it outputs.
 */

/**
 * Export validation results as a downloadable JSON file.
 * @param {object} algo - Algorithm JSON
 * @param {object} fixtures - Fixture JSON
 * @param {Array<{id: string, pass: boolean, actual: object, duration: number}>} results
 */
export function exportValidationResults(algo, fixtures, results) {
  const payload = {
    export_type: 'validation_results',
    algorithm_id: algo.id,
    algorithm_version: algo.version,
    timestamp: new Date().toISOString(),
    fixture_source: fixtures.generated_with || null,
    summary: {
      total: results.length,
      passed: results.filter(r => r.pass).length,
      failed: results.filter(r => !r.pass).length,
    },
    results,
  };

  _download(payload, `${algo.id}-validation-${_dateStamp()}.json`);
}

/**
 * Export a single try-it execution result.
 * @param {object} algo - Algorithm JSON
 * @param {object} inputs - Input values used
 * @param {object|null} result - Computed result
 * @param {object|null} error - Error if thrown
 * @param {number} duration - Execution time in ms
 */
export function exportTryItResult(algo, inputs, result, error, duration) {
  const payload = {
    export_type: 'try_it_result',
    algorithm_id: algo.id,
    algorithm_version: algo.version,
    timestamp: new Date().toISOString(),
    inputs,
    result,
    error,
    duration_ms: duration,
  };

  _download(payload, `${algo.id}-tryit-${_dateStamp()}.json`);
}

// ── Helpers ───────────────────────────────────────────────

function _download(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function _dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
