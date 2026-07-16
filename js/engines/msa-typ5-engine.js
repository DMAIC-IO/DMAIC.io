/**
 * D.Mike — MSA Typ 5 Engine (msa-typ5-engine.js)
 * Pure computation for Attribute Measurement System Analysis (Type 5):
 * kappa-based agreement between appraisers, binary/nominal/ordinal.
 * No DOM access — testable in isolation.
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md
 */

export const ERR = {
  NO_RATINGS:               'E_NO_RATINGS',
  TOO_FEW_PARTS:            'E_TOO_FEW_PARTS',
  TOO_FEW_APPRAISERS:       'E_TOO_FEW_APPRAISERS',
  TOO_FEW_LEVELS:           'E_TOO_FEW_LEVELS',
  UNKNOWN_REFERENCE_LEVEL:  'E_UNKNOWN_REFERENCE_LEVEL',
  INVALID_TYPE:             'E_INVALID_TYPE',
  ORDINAL_LEVELS_UNORDERED: 'E_ORDINAL_LEVELS_UNORDERED',
};

export const WARN = {
  UNBALANCED_REPS:     'W_UNBALANCED_REPS',
  AMBIGUOUS_CONSENSUS: 'W_AMBIGUOUS_CONSENSUS',
  LOW_REP_COUNT:       'W_LOW_REP_COUNT',
};

/**
 * Validate raw analyze() input.
 * @param {object} input {type, levels, ratings, references, params}
 * @returns {{valid: boolean, errors: Array, warnings: Array}}
 */
export function validate(input) {
  const errors = [], warnings = [];
  const push = (arr, code, params = null) => arr.push({ code, params });

  if (!['binary', 'nominal', 'ordinal'].includes(input?.type)) {
    push(errors, ERR.INVALID_TYPE, { got: input?.type });
  }
  const ratings = Array.isArray(input?.ratings) ? input.ratings : [];
  if (ratings.length === 0) {
    push(errors, ERR.NO_RATINGS);
    return { valid: false, errors, warnings };
  }
  const parts = new Set(), appraisers = new Set(), values = new Set();
  for (const r of ratings) {
    parts.add(r.part); appraisers.add(r.appraiser); values.add(r.value);
  }
  if (parts.size < 2)      push(errors, ERR.TOO_FEW_PARTS,      { got: parts.size });
  if (appraisers.size < 2) push(errors, ERR.TOO_FEW_APPRAISERS, { got: appraisers.size });
  if (values.size < 2)     push(errors, ERR.TOO_FEW_LEVELS,     { got: values.size });

  const levels = Array.isArray(input?.levels) ? input.levels : [];
  if (input?.references && typeof input.references === 'object') {
    for (const [part, val] of Object.entries(input.references)) {
      if (!levels.includes(val)) {
        push(errors, ERR.UNKNOWN_REFERENCE_LEVEL, { part, value: val });
        break;
      }
    }
  }

  // Ordinal: levels muss angegeben und mindestens so viele Stufen wie in Bewertungen
  if (input?.type === 'ordinal' && (!Array.isArray(input?.levels) || input.levels.length < 2)) {
    push(errors, ERR.ORDINAL_LEVELS_UNORDERED, { got: input?.levels });
  }

  // Warnungen (blockieren nicht)
  const repCounts = new Map();
  for (const r of ratings) {
    const k = `${r.part}|${r.appraiser}`;
    repCounts.set(k, (repCounts.get(k) || 0) + 1);
  }
  const counts = [...repCounts.values()];
  if (counts.length > 0 && new Set(counts).size > 1) {
    push(warnings, WARN.UNBALANCED_REPS, { min: Math.min(...counts), max: Math.max(...counts) });
  }
  const lowRepAppraisers = new Set();
  for (const [k, c] of repCounts) if (c < 2) lowRepAppraisers.add(k.split('|')[1]);
  if (lowRepAppraisers.size > 0) {
    push(warnings, WARN.LOW_REP_COUNT, { appraisers: [...lowRepAppraisers] });
  }

  return { valid: errors.length === 0, errors, warnings };
}
