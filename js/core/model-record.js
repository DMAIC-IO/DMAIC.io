/**
 * D.Mike — Model record helpers (model-record.js)
 *
 * Pure helpers that build the self-contained model record a regression
 * owner (`regression`, `glm-regression`) carries as its saved model
 * (rule D5 "data with the owner"). The record shape is the legacy
 * `state.models[id]` shape: `{ experimentId, responseSpec, termSet, coef,
 * vcov, sigma2, df, rSqAdj, lofPValue, factorSpec, spec, dataSnapshot,
 * dataHash, … }`.
 *
 * No state, no I/O: every function returns a fresh value.
 */

/**
 * Deterministic 32-bit FNV-1a hash over the JSON serialization of (X, y).
 * Returned as an 8-char zero-padded hex string. Sufficient to detect data
 * drift; not a cryptographic hash (no collision-resistance guarantees).
 *
 * @param {number[][]} X - Design matrix as fed into OLS (after model expansion).
 * @param {number[]}   y - Response vector.
 * @returns {string} 8-char hex hash
 */
export function computeDataHash(X, y) {
  const text = JSON.stringify({ X, y });
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Compose the `dataSnapshot` block for a model. Wraps the raw training inputs
 * with metadata that makes the snapshot self-contained: anyone can reproduce
 * the OLS fit from the snapshot alone, even after the source data changes.
 *
 * @param {{X: number[][], y: number[], factorSpec: object[], termSet: string[],
 *          experimentId?: string|null, responseColumn?: string|null,
 *          workbookHash?: string|null}} args
 * @returns {{X: number[][], y: number[], factorSpec: object[], termSet: string[],
 *            trainedAt: string, sourceFingerprint: {experimentId: string|null,
 *            responseColumn: string|null, workbookHash: string}}} dataSnapshot
 */
export function buildDataSnapshot(args) {
  return {
    X: args.X.map(row => [...row]),
    y: [...args.y],
    factorSpec: args.factorSpec.map(f => ({ ...f })),
    termSet: [...args.termSet],
    trainedAt: new Date().toISOString(),
    sourceFingerprint: {
      experimentId:   args.experimentId   ?? null,
      responseColumn: args.responseColumn ?? null,
      workbookHash:   args.workbookHash   ?? computeDataHash(args.X, args.y),
    },
  };
}
