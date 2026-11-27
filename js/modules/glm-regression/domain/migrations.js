/**
 * D.Mike — GLM-Regression: Migrationen. Rein.
 */
import { complement } from './analyze.js';

const METHODS = ['auto', 'binomial', 'poisson', 'negbin'];
const TABS = ['model', 'diagnostics', 'roc', 'prediction'];

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
/** @param {unknown} v @returns {v is number} */
const isFraction = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1;

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
 * Faktorbereiche eines Datensatzes: stetig mit Grenzen, kategorial mit Stufen.
 * @param {unknown} v @returns {Array<Record<string, any>>}
 */
function factorSpecOf(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((f) => isObj(f) && isText(f.name)).map((f) => {
    /** @type {Record<string, any>} */
    const o = { name: f.name };
    if (isText(f.kind)) o.kind = f.kind;
    if ('low' in f) o.low = numOrNull(f.low);
    if ('high' in f) o.high = numOrNull(f.high);
    if (Array.isArray(f.levels)) o.levels = levelTexts(f.levels);
    if (levelText(f.reference) != null) o.reference = levelText(f.reference);
    return o;
  });
}

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
      factors: t.factors.filter((f) => isObj(f) && isText(f.id) && typeof f.degree === 'number').map((f) => ({ id: f.id, degree: f.degree })),
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
 * einem alten Datensatz, fehlt er auch hier. Gegenüber der Regression
 * zusätzlich `family` und `terms`.
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
  if (isObj(m.family) && isText(m.family.name) && isText(m.family.link)) {
    o.family = { name: m.family.name, link: m.family.link };
    if (numOrNull(m.family.theta) !== null) o.family.theta = m.family.theta;
  }
  if (Array.isArray(m.terms)) o.terms = texts(m.terms);
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
 * '0→1.0': Altstände ohne `_schema` (Felder des alten `State.toJSON`).
 *
 * - `colRefs`: leere und unvollständige Einträge fallen.
 * - `yKey`/`trialsKey` (`instanceId|sheetId|columnId`) werden die Bezüge
 *   `yRef`/`trialsRef`, sonst `null`.
 * - `method`, `activeTab`: unbekannt → Vorgabe der Altform; `successClass`
 *   nur als Zahl.
 * - `confLevel`/`alpha`: gültig ist ein Anteil in (0; 1). Ist nur einer
 *   gültig, folgt der andere als 1 − x (Kopplung wie `setParam`); keiner
 *   gültig → beide Schlüssel entfallen (Vorgabe aus den Einstellungen).
 * - `cutoff` außerhalb [0; 1] → 0,5.
 * - `savedModel` (Modell aus den Projektschlüsseln) wird `modelRecord`.
 * - Entfallen: `result` (schlankes Ergebnis, neu gerechnet), fremde Schlüssel.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const out = {};
  out.colRefs = Array.isArray(json.colRefs) ? json.colRefs.map(refOrNull).filter(Boolean) : [];
  out.yRef = refFromKey(json.yKey);
  out.trialsRef = refFromKey(json.trialsKey);
  out.successClass = numOrNull(json.successClass);
  out.method = METHODS.includes(json.method) ? json.method : 'auto';
  const conf = isFraction(json.confLevel) ? json.confLevel : null;
  const alpha = isFraction(json.alpha) ? json.alpha : null;
  if (conf !== null) out.confLevel = conf;
  if (alpha !== null) out.alpha = alpha;
  if (conf !== null && alpha === null) out.alpha = complement(conf);
  if (alpha !== null && conf === null) out.confLevel = complement(alpha);
  out.cutoff = typeof json.cutoff === 'number' && json.cutoff >= 0 && json.cutoff <= 1 ? json.cutoff : 0.5;
  out.savedModelId = textOrNull(json.savedModelId);
  out.savedModelName = textOrNull(json.savedModelName);
  out.modelRecord = isObj(json.savedModel) ? recordFromLegacy(json.savedModel) : null;
  out.activeTab = TABS.includes(json.activeTab) ? json.activeTab : 'model';
  out.exampleWorksheetId = textOrNull(json.exampleWorksheetId);
  return out;
}
