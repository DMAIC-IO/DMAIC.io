/**
 * D.Mike — DoE Planner: source worksheet of an optimal design (domain/source.js)
 *
 * Pure. Reads factor and response values of a picked worksheet sheet
 * through the module's worksheet data access (`ctx.data`) and turns them
 * into the coded rows the optimal-design engine augments.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * The part of `ctx.data` this reader needs.
 * @typedef {object} SourceDataAccess
 * @property {(ref: { instanceId: string, sheetId: string }) => ({ rowCount: number,
 *   columns: Array<{ id: string, name: string }> }|null)} sheet
 * @property {(instanceId: string) => (Array<{ id: string }>|null)} [sheets]
 * @property {(ref: { instanceId: string, sheetId: string, columnId: string }) => (any[]|null)} values
 */

/**
 * @typedef {object} SourceData
 * @property {boolean} ok
 * @property {number[][]} [codedMatrix] coded factor values of the valid rows
 * @property {Array<Array<number|string>>} [actualRows] actual values (numbers, level labels)
 * @property {Array<Array<number|null>>} [responseValues] per response, one value per valid row
 * @property {number} [rowCount] valid rows
 * @property {number} [mappedResponseCount] responses found by name
 * @property {number} [skippedRows] rows with a missing or invalid factor cell
 * @property {string[]} errors
 * @property {string[]} [missingFactors] factor names without a column
 */

/**
 * @param {any} s
 * @returns {string}
 */
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * A cell as a number: decimal comma counts; blanks, text and booleans do not.
 * @param {any} v
 * @returns {number|null}
 */
function numberOf(v) {
  if (typeof v === 'boolean') return null;
  const n = parseDecimalInput(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Factor and response values of a source worksheet sheet.
 *
 * Columns are matched to factors and responses by name (trimmed,
 * case-insensitive). A missing factor column aborts with
 * `source-missing-factor-columns`; a missing response column leaves the
 * response empty. Continuous values are coded `2·(v − lo)/(hi − lo) − 1`,
 * clamped to [−1, +1]; categorical cells are matched to the levels. Rows
 * with a missing or invalid factor cell are skipped.
 *
 * @param {SourceDataAccess} data worksheet data access
 * @param {{ instanceId: string, sheetId: string }|null} ref source sheet
 * @param {Array<{ name: string, kind?: string, levels: string[] }>} factors
 * @param {Array<{ name: string }>} responses
 * @returns {SourceData} errors: `source-missing-ref`, `source-not-found`,
 *   `source-sheet-not-found`, `source-empty`, `source-missing-factor-columns`,
 *   `source-no-valid-rows`
 */
export function sourceData(data, ref, factors, responses) {
  if (!ref?.instanceId || !ref?.sheetId) return { ok: false, errors: ['source-missing-ref'] };
  if (typeof data.sheets === 'function' && data.sheets(ref.instanceId) === null) {
    return { ok: false, errors: ['source-not-found'] };
  }
  const sheet = data.sheet({ instanceId: ref.instanceId, sheetId: ref.sheetId });
  if (!sheet) return { ok: false, errors: ['source-sheet-not-found'] };

  const rowCount = sheet.rowCount ?? 0;
  if (rowCount === 0) return { ok: false, errors: ['source-empty'] };

  /** @param {string} name @returns {any[]|null} the values of the column with this name */
  const valuesOf = (name) => {
    const col = sheet.columns.find((c) => norm(c.name) === norm(name));
    return col ? (data.values({ instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: col.id }) ?? []) : null;
  };

  const factorValues = factors.map((f) => valuesOf(f.name));
  const missing = factors.filter((_, fi) => factorValues[fi] === null).map((f) => f.name);
  if (missing.length) return { ok: false, errors: ['source-missing-factor-columns'], missingFactors: missing };
  const responseCols = responses.map((r) => valuesOf(r.name));

  const codedMatrix = [];
  const actualRows = [];
  /** @type {Array<Array<number|null>>} */
  const responseValues = responses.map(() => []);
  let skipped = 0;

  for (let i = 0; i < rowCount; i++) {
    const codedRow = [];
    const actualRow = [];
    let rowValid = true;

    for (let fi = 0; fi < factors.length; fi++) {
      const f = factors[fi];
      const raw = /** @type {any[]} */ (factorValues[fi])[i];
      if (raw == null || raw === '') { rowValid = false; break; }

      let coded;
      if (f.kind === 'categorical') {
        const idx = f.levels.findIndex((l) => norm(l) === norm(raw));
        if (idx < 0) { rowValid = false; break; }
        const nLv = f.levels.length;
        coded = nLv === 1 ? 0 : -1 + (2 * idx) / (nLv - 1);
        actualRow.push(f.levels[idx]); // the factor's own spelling
      } else {
        const num = parseDecimalInput(raw);
        if (!Number.isFinite(num)) { rowValid = false; break; }
        const lo = parseDecimalInput(f.levels[0]);
        const hi = parseDecimalInput(f.levels[f.levels.length - 1]);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) { rowValid = false; break; }
        coded = -1 + (2 * (num - lo)) / (hi - lo);
        coded = Math.max(-1, Math.min(1, coded));
        actualRow.push(num);
      }
      codedRow.push(coded);
    }

    if (!rowValid) { skipped++; continue; }

    codedMatrix.push(codedRow);
    actualRows.push(actualRow);
    responses.forEach((_, ri) => {
      const col = responseCols[ri];
      responseValues[ri].push(col ? numberOf(col[i]) : null);
    });
  }

  if (codedMatrix.length === 0) return { ok: false, errors: ['source-no-valid-rows'], skippedRows: skipped };

  return {
    ok: true,
    codedMatrix,
    actualRows,
    responseValues,
    rowCount: codedMatrix.length,
    mappedResponseCount: responseCols.filter(Boolean).length,
    skippedRows: skipped,
    errors: [],
  };
}
