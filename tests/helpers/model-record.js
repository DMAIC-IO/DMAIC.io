/**
 * Testhelfer: ein gespeichertes Modell so, wie es `saveAsModel` der Regression
 * baut (`regression/domain/record.js` über `core/model-record.js`) und
 * `derived savedModel` liefert — mit `id` und `name`, ohne Besitzer-id.
 *
 * Ersetzt in den Pipeline-Tests `saveModel`/`getModel` des entfallenen
 * `core/models-store.js` (Regel D5: das Modell liegt bei seiner Instanz).
 */
import { buildDataSnapshot, computeDataHash } from '../../js/core/model-record.js';

const NOW = '2026-01-01T00:00:00.000Z';

/**
 * @param {{ id?: string, name?: string, X: number[][], y: number[],
 *           factorSpec: object[], termSet: string[], coef: number[]|null,
 *           sigma2?: number|null, df?: number|null, rSqAdj?: number|null,
 *           lofPValue?: number|null, experimentId?: string|null,
 *           responseColumn?: string|null, transform?: string,
 *           spec?: object|null, now?: string } & Record<string, any>} a
 *   Weitere Schlüssel (`family`, `terms` der GLM) gehen unverändert mit.
 * @returns {Record<string, any>}
 */
export function modelRecord(a) {
  const {
    id = 'm-1', name = 'Modell', X, y, factorSpec, termSet, coef,
    sigma2 = null, df = null, rSqAdj = null, lofPValue = null,
    experimentId = null, responseColumn = 'y', transform = 'identity',
    spec = null, now = NOW, ...extra
  } = a;
  const dataSnapshot = buildDataSnapshot({ X, y, factorSpec, termSet, experimentId, responseColumn });
  dataSnapshot.trainedAt = now;
  return {
    id,
    name,
    experimentId,
    responseSpec: { sourceColumn: responseColumn, transform, aggregateOver: null },
    termSet: [...termSet],
    coef: coef ? [...coef] : null,
    vcov: null,
    sigma2,
    df,
    rSqAdj,
    lofPValue,
    factorSpec: factorSpec.map((f) => ({ ...f })),
    spec: spec ? JSON.parse(JSON.stringify(spec)) : null,
    dataSnapshot,
    dataHash: computeDataHash(X, y),
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}
