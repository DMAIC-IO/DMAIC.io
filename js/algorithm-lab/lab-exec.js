/**
 * Algorithm Lab — pure execution & comparison helpers.
 * Extracted from the former lab-core.js / lab-try-it.js so the validation tab
 * and the try-it tab share one implementation. No DOM, no i18n.
 */
import { ENGINES } from './lab-data.generated.js';

/**
 * Load the algorithm's calculation function via dynamic import of its engine
 * module (source.file_path + source.function_name).
 * @returns {Promise<function>}
 */
export async function buildFunction(algo) {
  const src = algo.source;
  if (!src) throw new Error('No source definition');

  let mod;
  if (src.file_path && ENGINES && ENGINES[src.file_path]) {
    // Prefer inlined ENGINES map (data-first path); already validated at build time.
    mod = await ENGINES[src.file_path]();
  } else if (src.file_path) {
    // Fall back to dynamic import for un-built/un-generated checkouts.
    // Resolve file_path against the app/dev root derived from import.meta.url,
    // NOT document.baseURI: when the page is served at /app/dev without a
    // trailing slash, new URL(file_path, document.baseURI) drops the trailing
    // "dev" segment → 404 on import. import.meta.url is stable across the dev
    // server, DDEV, and frozen releases. This file lives at
    // app/dev/js/algorithm-lab/lab-exec.js, so '../../' → app/dev/.
    const appRoot = new URL('../../', import.meta.url);
    const modulePath = new URL(src.file_path, appRoot).href;
    mod = await import(modulePath);
  } else {
    throw new Error('No source file_path available');
  }

  const fn = mod[src.function_name];
  if (typeof fn !== 'function') {
    throw new Error(`Export "${src.function_name}" not found in ${src.file_path}`);
  }
  return fn;
}

/** Clone inputs and coerce `data` to numbers (array or matrix). */
export function prepareInputs(inputs) {
  const prepared = { ...inputs };
  if (Array.isArray(prepared.data)) {
    prepared.data = prepared.data.map(row =>
      Array.isArray(row) ? row.map(Number) : Number(row)
    );
  }
  return prepared;
}

/**
 * Map inputs → positional args in signature.parameters order.
 * Special case: a single-parameter signature whose param name is NOT a
 * top-level key of `inputs` receives the whole `inputs` object as that one arg
 * (lets flat fixture shapes forward to single-object dispatchers like
 * math-utils `evaluate(inputs)`). Falls back to (data, lsl, usl) with no signature.
 */
export function mapArgs(algo, inputs) {
  const params = algo.source?.signature?.parameters;
  if (params && params.length > 0) {
    if (params.length === 1 && !(params[0].name in (inputs || {}))) {
      return [inputs];
    }
    return params.map(p => inputs[p.name]);
  }
  return [inputs.data, inputs.lsl, inputs.usl];
}

/** Resolve a dot-path on an object; the synthetic key `value` returns a primitive result itself. */
export function getByPath(obj, path) {
  if (obj == null || typeof obj !== 'object') {
    return path === 'value' ? obj : undefined;
  }
  if (path in obj) return obj[path];
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Tolerance-aware deep comparison: sentinels (Infinity/NaN), null≈undefined, arrays, objects, abs/rel tolerance. */
export function compare(actual, expected, tol) {
  if (expected === 'Infinity' && typeof actual === 'number') return actual === Infinity;
  if (expected === '-Infinity' && typeof actual === 'number') return actual === -Infinity;
  if (expected === 'NaN' && typeof actual === 'number') return Number.isNaN(actual);
  if (expected === null) return actual === null || actual === undefined;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((exp, i) => compare(actual[i], exp, tol));
  }
  if (expected != null && typeof expected === 'object') {
    if (actual == null || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([k, v]) => compare(actual[k], v, tol));
  }
  if (typeof expected !== 'number') return actual === expected;
  if (typeof actual !== 'number') return false;
  if (!isFinite(actual) && !isFinite(expected)) return true;
  const absDiff = Math.abs(actual - expected);
  const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
  return absDiff <= tol.absolute || relDiff <= tol.relative;
}

/** Parse "1, 2; 3\n4" → [1,2,3,4]; throws on a non-numeric token. */
export function parseNumberArray(raw) {
  if (!raw) return [];
  return raw.split(/[,;\s\t\n]+/).map(v => v.trim()).filter(v => v).map(v => {
    const n = parseFloat(v);
    if (isNaN(n)) throw new Error(`Invalid number: "${v}"`);
    return n;
  });
}

/** Parse a delimited string into a trimmed, non-empty string array. */
export function parseStringArray(raw) {
  if (!raw) return [];
  return raw.split(/[,;\t\n]+/).map(v => v.trim()).filter(v => v);
}

/** Assign `value` at a dot-path, creating intermediate objects. */
export function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur)) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Parse CSV-ish text → flat numeric array (first numeric tokens of each line). */
export function parseCsvNumbers(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  const data = [];
  for (const line of lines) {
    const vals = line.split(/[,;\t]/).map(v => v.trim()).filter(v => v);
    for (const v of vals) {
      const n = parseFloat(v);
      if (!isNaN(n)) data.push(n);
    }
  }
  return data;
}
