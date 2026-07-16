/**
 * D.Mike — DataGrid Fill (datagrid-fill.js)
 *
 * Excel-like fill-handle pattern detection and value generation.
 *
 * Source values + types come in (one source row × N source columns, or N rows ×
 * one source column). For each fill direction, this module classifies the source
 * as one of `copy`, `linear`, `dateStep`, `textSuffix`, or `repeat` and emits the
 * generated values for the target slots. Formulas are propagated by shifting
 * relative cell references (`C2[3]` → `C2[5]` when filling 2 rows down).
 */

import { isNumericType } from './datagrid-utils.js';

/* ─── Cell reference shifting in formulas ─────────────────────
 *
 * Formula syntax (see datagrid-formula.js):
 *   C2[5]      → 1-based column 2, 1-based row 5
 *   'Name'[5]  → named column, 1-based row 5
 *   C2         → bare column reference (no row → don't shift on row fill)
 *   'Name'     → bare named column reference
 *   C2[5]:C2[9]   → range
 *   'Name'[5]:'Name'[9]
 */

const RE_CELL_REF      = /(C(\d+))\[(\d+)\]/gi;          // C2[5]
const RE_NAMED_REF     = /('(?:[^'\\]|\\.)+')\[(\d+)\]/g; // 'Name'[5]
const RE_BARE_COL_REF  = /(?<![A-Za-z'])C(\d+)(?!\[)/gi;  // C2 not followed by [
// Note: bare `'Name'` references are deliberately NOT shifted on horizontal
// fills — there's no unambiguous way to map a name to a sibling column.

/**
 * Shift relative references in a formula string.
 * @param {string} formula — original formula starting with '='
 * @param {number} dRow — row offset (positive = down)
 * @param {number} dCol — column offset (positive = right)
 * @param {number} maxCols — clamp upper bound for column refs
 * @returns {string} adjusted formula
 */
export function shiftFormulaRefs(formula, dRow, dCol, maxCols) {
  if (!formula || typeof formula !== 'string') return formula;
  let out = formula;

  // C2[5] → adjust column index (1-based) and row index (1-based)
  out = out.replace(RE_CELL_REF, (_m, _full, colStr, rowStr) => {
    const newCol = clampCol(parseInt(colStr) + dCol, maxCols);
    const newRow = Math.max(1, parseInt(rowStr) + dRow);
    return `C${newCol}[${newRow}]`;
  });

  // 'Name'[5] → row only (column name follows the name, not the position)
  out = out.replace(RE_NAMED_REF, (_m, namePart, rowStr) => {
    const newRow = Math.max(1, parseInt(rowStr) + dRow);
    return `${namePart}[${newRow}]`;
  });

  // Bare C2 → column shift only (used in range syntax like C2:C5)
  if (dCol !== 0) {
    out = out.replace(RE_BARE_COL_REF, (_m, colStr) => {
      const newCol = clampCol(parseInt(colStr) + dCol, maxCols);
      return `C${newCol}`;
    });
  }

  return out;
}

function clampCol(n, max) {
  if (max == null) return Math.max(1, n);
  return Math.max(1, Math.min(max, n));
}

/* ─── Pattern detection ───────────────────────────────────────
 *
 * Input: a source vector (1D array of {value, formula, type} entries).
 * Output: a Pattern object describing how to extrapolate beyond the source.
 *
 * Pattern kinds:
 *   copy        — single cell or non-extrapolable: repeat the source as-is.
 *   linear      — numeric arithmetic progression (constant step within ε).
 *   dateStep    — ISO date arithmetic progression (day-stepped).
 *   textSuffix  — strings sharing a prefix with a trailing integer suffix
 *                 forming an arithmetic progression: "Run 1", "Run 2", …
 *   repeat      — fallback: cycle the source.
 */

const EPSILON = 1e-9;

/**
 * @param {Array<{value:*, formula:?string}>} cells — source row OR column slice
 * @param {string} columnType — declared column type ('numeric'|'text'|'date'…)
 * @returns {{kind:string, step?:number, base?:*, prefix?:string, padLen?:number, source:Array}}
 */
export function detectPattern(cells, columnType) {
  if (!cells.length) return { kind: 'copy', source: [] };

  // Strip nulls only at the *edges* — interior nulls disqualify extrapolation.
  if (cells.length === 1) {
    return { kind: 'copy', source: cells };
  }

  // Formulas in source → always treat as 'copy' so each formula is propagated
  // individually (relative-ref shift happens at fill time).
  if (cells.some(c => c.formula)) {
    return { kind: 'copy', source: cells };
  }

  // Reject if any value is null
  if (cells.some(c => c.value == null)) {
    return { kind: 'copy', source: cells };
  }

  // ── Numeric arithmetic progression ─────────────────────────
  if (isNumericType(columnType) || cells.every(c => typeof c.value === 'number')) {
    const nums = cells.map(c => typeof c.value === 'number' ? c.value : Number(c.value));
    if (nums.every(n => Number.isFinite(n))) {
      const step = nums[1] - nums[0];
      const allEqual = nums.every((v, i) => i === 0 || Math.abs((v - nums[i - 1]) - step) < EPSILON);
      if (allEqual) {
        return { kind: 'linear', step, base: nums[nums.length - 1], source: cells };
      }
    }
  }

  // ── Date arithmetic progression (ISO YYYY-MM-DD) ──────────
  if (columnType === 'date' && cells.every(c => typeof c.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.value))) {
    const days = cells.map(c => isoDateToDayNumber(c.value));
    const step = days[1] - days[0];
    const allEqual = days.every((d, i) => i === 0 || (d - days[i - 1]) === step);
    if (allEqual && step !== 0) {
      return { kind: 'dateStep', step, base: days[days.length - 1], source: cells };
    }
  }

  // ── Text suffix arithmetic progression: "Run 1", "Run 2", … ─
  if (cells.every(c => typeof c.value === 'string')) {
    const parsed = cells.map(c => {
      const m = String(c.value).match(/^(.*?)(\d+)$/);
      return m ? { prefix: m[1], num: parseInt(m[2], 10), padLen: m[2].length } : null;
    });
    if (parsed.every(p => p && p.prefix === parsed[0].prefix)) {
      const step = parsed[1].num - parsed[0].num;
      const allEqual = parsed.every((p, i) => i === 0 || (p.num - parsed[i - 1].num) === step);
      if (allEqual) {
        const padLen = Math.max(...parsed.map(p => p.padLen));
        return {
          kind: 'textSuffix',
          step,
          base: parsed[parsed.length - 1].num,
          prefix: parsed[0].prefix,
          padLen,
          source: cells,
        };
      }
    }
  }

  return { kind: 'repeat', source: cells };
}

/**
 * Apply Excel's Ctrl-modifier semantics to a detected pattern.
 *
 * Excel uses Ctrl to *swap* the default fill behaviour:
 *
 *   - Single cell, default → copy.
 *     With Ctrl → promote to a +1 series:
 *       • number     →  linear step=1
 *       • ISO date   →  dateStep step=1 (one day)
 *       • text with trailing integer → textSuffix step=1
 *       • plain text →  stays copy (no sensible increment)
 *
 *   - Multi-cell arithmetic (linear / dateStep / textSuffix), default → extrapolate.
 *     With Ctrl → degrade to repeat (cycle the source).
 *
 *   - repeat / copy with multiple cells → unchanged (Ctrl can't extract structure
 *     from non-arithmetic input).
 *
 * @param {object} pattern  output of detectPattern()
 * @param {boolean} ctrl    Ctrl/Cmd held during the drag
 * @returns {object}        effective pattern after applying the modifier
 */
export function withCtrlModifier(pattern, ctrl) {
  if (!ctrl) return pattern;

  // Multi-cell extrapolation → degrade to plain repeat.
  if ((pattern.kind === 'linear' || pattern.kind === 'dateStep' || pattern.kind === 'textSuffix')
      && pattern.source.length > 1) {
    return { kind: 'repeat', source: pattern.source };
  }

  // Single-cell copy → promote to +1 series when the value is numeric-ish.
  if (pattern.kind === 'copy' && pattern.source.length === 1) {
    const v = pattern.source[0].value;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return { kind: 'linear', step: 1, base: v, source: pattern.source };
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return { kind: 'dateStep', step: 1, base: isoDateToDayNumber(v), source: pattern.source };
    }
    if (typeof v === 'string') {
      const m = v.match(/^(.*?)(\d+)$/);
      if (m) {
        return {
          kind: 'textSuffix',
          step: 1,
          base: parseInt(m[2], 10),
          prefix: m[1],
          padLen: m[2].length,
          source: pattern.source,
        };
      }
    }
  }

  return pattern;
}

/**
 * Generate `count` filled values starting one step beyond the source.
 *
 * @param {object} pattern — output of detectPattern()
 * @param {number} count — number of cells to produce
 * @param {-1|1} dir — +1 = forward (down/right), -1 = backward (up/left).
 *                     Backward fill mirrors the source sequence around the
 *                     starting cell (Excel behaviour).
 * @returns {Array<{value:*, formula:?string, sourceIdx?:number}>}
 *          — `sourceIdx` (when present) tells the caller which source row to
 *          take a formula from, for adjustment.
 */
export function generateFill(pattern, count, dir) {
  if (count <= 0) return [];
  const out = [];
  const src = pattern.source;
  const stepDir = dir === -1 ? -1 : 1;

  switch (pattern.kind) {
    case 'linear': {
      const step = pattern.step * stepDir;
      const base = stepDir === 1 ? pattern.base : src[0].value;
      for (let i = 0; i < count; i++) {
        out.push({ value: round12(base + step * (i + 1)), formula: null });
      }
      return out;
    }

    case 'dateStep': {
      const step = pattern.step * stepDir;
      const base = stepDir === 1 ? pattern.base : isoDateToDayNumber(src[0].value);
      for (let i = 0; i < count; i++) {
        out.push({ value: dayNumberToIsoDate(base + step * (i + 1)), formula: null });
      }
      return out;
    }

    case 'textSuffix': {
      const step = pattern.step * stepDir;
      const base = stepDir === 1 ? pattern.base : parseInt(String(src[0].value).match(/(\d+)$/)[1], 10);
      for (let i = 0; i < count; i++) {
        const n = base + step * (i + 1);
        const numStr = String(Math.max(0, n)).padStart(pattern.padLen, '0');
        out.push({ value: pattern.prefix + numStr, formula: null });
      }
      return out;
    }

    case 'copy':
    case 'repeat':
    default: {
      // Cycle the source, optionally reversed for backward fills
      const seq = stepDir === 1 ? src : [...src].reverse();
      for (let i = 0; i < count; i++) {
        const s = seq[i % seq.length];
        out.push({ value: s.value, formula: s.formula || null, sourceIdx: i % seq.length });
      }
      return out;
    }
  }
}

/* ─── Date helpers ────────────────────────────────────────────
 * Day-number arithmetic uses UTC noon to sidestep DST jumps.
 */

function isoDateToDayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d, 12) / 86400000);
}

function dayNumberToIsoDate(dayNum) {
  const dt = new Date(dayNum * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Round float arithmetic noise to 12 sig digits. Excel does similar. */
function round12(n) {
  if (!Number.isFinite(n)) return n;
  const r = Number(n.toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
}
