/**
 * D.Mike — Regression: Migrationen. Rein.
 */
import { noticeBasis } from './columns.js';

const REG_TYPES = ['polynomial', 'exponential', 'logarithmic', 'power'];
const DEGREES = [1, 2, 3];
const TABS = ['scatter', 'residuals', 'order', 'qq', 'histogram', 'ss-pie', 'main-effects', 'interaction'];
const TRANSFORMS = ['identity', 'mean', 'lnvar'];

/** @param {unknown} v @returns {v is string} */
const isText = (v) => typeof v === 'string';
/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {number|null} */
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** @param {unknown} v @returns {string|null} */
const textOrNull = (v) => (isText(v) ? v : null);
/** @param {unknown} v @returns {string[]} */
const texts = (v) => (Array.isArray(v) ? v.filter(isText) : []);
/**
 * Stufen eines Faktors als Texte: die Altform schrieb sie ungewandelt, eine
 * Textspalte mit Zahlen gab Zahlen (`record.js` wandelt mit `String`).
 * @param {unknown} v @returns {string[]}
 */
const levelTexts = (v) => (Array.isArray(v) ? v.filter((x) => isText(x) || (typeof x === 'number' && Number.isFinite(x))).map(String) : []);
/** @param {unknown} v @returns {string|null} die Referenzstufe als Text */
const levelText = (v) => (isText(v) ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

/**
 * Ein Spaltenbezug mit drei Texten, sonst `null`.
 * @param {unknown} v
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refOrNull(v) {
  if (!isObj(v)) return null;
  const { instanceId, sheetId, columnId } = v;
  if (!isText(instanceId) || !isText(sheetId) || !isText(columnId)) return null;
  return { instanceId, sheetId, columnId };
}

/**
 * Der Altschlüssel `instanceId|sheetId|columnId` als Bezug; `null` sonst.
 * @param {unknown} key
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refFromKey(key) {
  if (!isText(key)) return null;
  const parts = key.split('|');
  if (parts.length !== 3 || parts.some((p) => p === '')) return null;
  const [instanceId, sheetId, columnId] = parts;
  return { instanceId, sheetId, columnId };
}

/**
 * Faktorbereiche eines Datensatzes.
 * @param {unknown} v @returns {Array<Record<string, any>>}
 */
function factorSpecOf(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((f) => isObj(f) && isText(f.name)).map((f) => {
    /** @type {Record<string, any>} */
    const o = { name: f.name, low: numOrNull(f.low), high: numOrNull(f.high) };
    if (isText(f.kind)) o.kind = f.kind;
    return o;
  });
}

/**
 * Grad eines Term-Faktors: die Engine las einen fehlenden Grad als 1
 * (`tf.degree ?? 1`, bei kategorialen Faktoren ohne Wirkung); so auch hier.
 * @param {unknown} v @returns {number}
 */
const degreeOf = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 1);

/**
 * Die Modellspezifikation eines Datensatzes; `null` ohne lesbare Form.
 * @param {unknown} v @returns {Record<string, any>|null}
 */
function specOf(v) {
  if (!isObj(v) || !Array.isArray(v.predictors) || !Array.isArray(v.terms)) return null;
  return {
    predictors: v.predictors.filter((p) => isObj(p) && isText(p.id) && isText(p.kind)).map((p) => {
      /** @type {Record<string, any>} */
      const o = { id: p.id, kind: p.kind };
      if (Array.isArray(p.levels)) o.levels = levelTexts(p.levels);
      if (levelText(p.reference) != null) o.reference = levelText(p.reference);
      return o;
    }),
    terms: v.terms.filter((t) => isObj(t) && isText(t.id) && Array.isArray(t.factors)).map((t) => ({
      id: t.id,
      factors: t.factors.filter((f) => isObj(f) && isText(f.id)).map((f) => ({ id: f.id, degree: degreeOf(f.degree) })),
    })),
  };
}

/**
 * Die Datenmomentaufnahme eines Datensatzes; `null` ohne lesbare Form.
 * @param {unknown} v @returns {Record<string, any>|null}
 */
function snapshotOf(v) {
  if (!isObj(v) || !Array.isArray(v.X) || !Array.isArray(v.y)) return null;
  /** @type {Record<string, any>} */
  const o = {
    X: v.X.filter(Array.isArray).map((row) => row.map(numOrNull)),
    y: v.y.map(numOrNull),
    factorSpec: factorSpecOf(v.factorSpec),
    termSet: texts(v.termSet),
  };
  if (isText(v.trainedAt)) o.trainedAt = v.trainedAt;
  const f = v.sourceFingerprint;
  if (isObj(f)) {
    o.sourceFingerprint = {
      experimentId: textOrNull(f.experimentId),
      responseColumn: textOrNull(f.responseColumn),
      workbookHash: textOrNull(f.workbookHash),
    };
  }
  return o;
}

/**
 * Ein gespeichertes Modell der Altform (`state.models[id]`, vom Kern als
 * `savedModel` an die Instanz gehängt) als Datensatz ohne `id`, `name`,
 * `createdFromInstanceId`. Nur bekannte Schlüssel bleiben; fehlt einer in
 * einem alten Datensatz, fehlt er auch hier.
 * @param {Record<string, any>} m
 * @returns {Record<string, any>}
 */
export function recordFromLegacy(m) {
  /** @type {Record<string, any>} */
  const o = {};
  if ('experimentId' in m) o.experimentId = textOrNull(m.experimentId);
  if (isObj(m.responseSpec)) {
    const r = m.responseSpec;
    o.responseSpec = { sourceColumn: textOrNull(r.sourceColumn), transform: isText(r.transform) ? r.transform : 'identity', aggregateOver: textOrNull(r.aggregateOver) };
  }
  if (Array.isArray(m.termSet)) o.termSet = texts(m.termSet);
  if ('coef' in m) o.coef = Array.isArray(m.coef) ? m.coef.map(numOrNull) : null;
  if ('vcov' in m) o.vcov = Array.isArray(m.vcov) ? m.vcov.filter(Array.isArray).map((row) => row.map(numOrNull)) : null;
  for (const k of ['sigma2', 'df', 'rSqAdj', 'lofPValue']) if (k in m) o[k] = numOrNull(m[k]);
  if (Array.isArray(m.factorSpec)) o.factorSpec = factorSpecOf(m.factorSpec);
  if ('spec' in m) o.spec = specOf(m.spec);
  if ('dataSnapshot' in m) o.dataSnapshot = snapshotOf(m.dataSnapshot);
  if ('dataHash' in m) o.dataHash = textOrNull(m.dataHash);
  if (isText(m.createdAt)) o.createdAt = m.createdAt;
  if (isText(m.updatedAt)) o.updatedAt = m.updatedAt;
  return o;
}

/**
 * Ein Anteil strikt zwischen 0 und 1, sonst `undefined`.
 * @param {unknown} v @returns {number|undefined}
 */
const fraction = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1 ? v : undefined);

/**
 * '0→1.0': Altstände ohne `_schema` (Felder des alten `State.toJSON`).
 *
 * - `colRefs`: leere und unvollständige Einträge fallen.
 * - `yKey` (`instanceId|sheetId|columnId`) wird der Bezug `yRef`, sonst `null`.
 * - `regType`, `polyDegree`, `activeTab`: unbekannt → Vorgabe der Altform.
 * - `confLevel`/`alpha`: gespeichert `null` → 0,95 bzw. 0,05 (wie die Altform
 *   bei der Vorgabe 95 %); fehlend oder außerhalb (0; 1) → Schlüssel entfällt
 *   (Vorgabe aus den Einstellungen).
 * - `designNotice` mit Listen bekommt `basis` aus X, Y und Grad des Altstands.
 * - `activeImportSource` mit unbekanntem `transform` → `'identity'`.
 * - `savedModel` (Modell aus den Projektschlüsseln) wird `modelRecord`.
 * - Entfallen: `result`, `perXResults` (neu gerechnet), `designTerms` (nie
 *   gerechnete Vorgabe), fremde Schlüssel.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.colRefs = Array.isArray(json.colRefs) ? json.colRefs.map(refOrNull).filter(Boolean) : [];
  out.yRef = refFromKey(json.yKey);
  out.regType = REG_TYPES.includes(json.regType) ? json.regType : 'polynomial';
  out.polyDegree = DEGREES.includes(json.polyDegree) ? json.polyDegree : 1;
  for (const [k, fallback] of /** @type {const} */ ([['confLevel', 0.95], ['alpha', 0.05]])) {
    if (!(k in json)) continue;
    if (json[k] === null) out[k] = fallback;
    else if (fraction(json[k]) !== undefined) out[k] = json[k];
  }
  out.excludedTerms = texts(json.excludedTerms);
  const n = json.designNotice;
  out.designNotice = isObj(n) && Array.isArray(n.aliased) && Array.isArray(n.saturated)
    ? {
      aliased: n.aliased.filter((a) => isObj(a) && isText(a.term)).map((a) => ({ term: a.term, with: texts(a.with) })),
      saturated: texts(n.saturated),
      basis: noticeBasis(out.colRefs, out.yRef, out.polyDegree),
    }
    : null;
  const s = json.activeImportSource;
  out.activeImportSource = isObj(s) && isText(s.experimentId) && isText(s.sourceColumn)
    ? { experimentId: s.experimentId, sourceColumn: s.sourceColumn, transform: TRANSFORMS.includes(s.transform) ? s.transform : 'identity' }
    : null;
  out.savedModelId = textOrNull(json.savedModelId);
  out.savedModelName = textOrNull(json.savedModelName);
  out.modelRecord = isObj(json.savedModel) ? recordFromLegacy(json.savedModel) : null;
  out.activeTab = TABS.includes(json.activeTab) ? json.activeTab : 'scatter';
  out.activeXKey = textOrNull(json.activeXKey);
  out.coefSortByP = json.coefSortByP === true;
  out.showCI = typeof json.showCI === 'boolean' ? json.showCI : true;
  out.showPI = json.showPI === true;
  out.exampleWorksheetId = textOrNull(json.exampleWorksheetId);
  return out;
}
