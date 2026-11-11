/**
 * D.Mike — MSA Typ 5: Ableitungen aus Model und Arbeitsblatt als reine Funktionen
 * (Stufen, Zeilen, Analyse). Eingaben sind das Model und die Arbeitsblattsicht.
 */
import { analyze } from '../../../engines/msa-typ5-engine.js';
import { effectiveLevels, engineLevels, mostFrequentLevel, ratingValues } from './levels.js';
import { longRows, wideRows, orderRatings } from './rows.js';

/**
 * @typedef {{ values: (ref: object|null) => any[]|null, name: (ref: object|null) => string|null,
 *   columns: () => Array<{ key: string, name: string }> }} Data  Ausschnitt der Arbeitsblattsicht
 * @typedef {import('./rows.js').Row} Row
 */

/**
 * Die gewählten Bewertungsspalten des breiten Layouts, die es im Arbeitsblatt
 * noch gibt. Eine gelöschte Spalte bleibt im Model stehen, zählt aber nicht mit.
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @returns {object[]}
 */
function liveRatings(m, data) {
  return m.ratings.filter((r) => data.values(r) != null);
}

/**
 * Rohwerte der Bewertungsspalte(n); null ohne gewählte Spalte. Eine gewählte,
 * aber verschwundene Spalte zählt im langen Layout als leer, im breiten als
 * nicht gewählt.
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @returns {Array<*>|null}
 */
function rawRatings(m, data) {
  return ratingValues(
    m.layout,
    m.rating ? (data.values(m.rating) ?? []) : null,
    liveRatings(m, data).map((r) => data.values(r) ?? []),
  );
}

/**
 * Wirksame Stufen aus den Rohwerten der Bewertungsspalte(n).
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @returns {{ all: string[], positive: string|null, negative: string|null }}
 */
export function readLevels(m, data) {
  return effectiveLevels(m, rawRatings(m, data));
}

/**
 * Zeilen der Analyse aus den Spalten; im breiten Layout die noch vorhandenen
 * Bewertungsspalten in Blattreihenfolge.
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @returns {ReturnType<typeof longRows>|ReturnType<typeof wideRows>}
 */
function buildRows(m, data) {
  /** @param {object|null} ref */
  const vals = (ref) => (ref ? (data.values(ref) ?? []) : null);
  if (m.layout === 'wide') {
    const keys = data.columns().map((c) => c.key);
    const columns = orderRatings(liveRatings(m, data), keys).map((ref) => ({
      name: data.name(ref) ?? '?',
      values: data.values(ref) ?? [],
    }));
    return wideRows({ parts: vals(m.part), columns, trials: m.trials, references: vals(m.reference) });
  }
  return longRows({
    parts: vals(m.part), appraisers: vals(m.appraiser), ratings: vals(m.rating),
    references: vals(m.reference), replicates: vals(m.replicate),
  });
}

/**
 * Die Zeilen, die in die Analyse eingehen; null, solange keine entstehen.
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @returns {Row[]|null}
 */
export function ratingRowsOf(m, data) {
  const built = buildRows(m, data);
  return built && 'rows' in built ? built.rows : null;
}

/**
 * Die Analyse aus Model und Arbeitsblatt.
 * @param {import('../domain/model.types.js').StateModel} m @param {Data} data
 * @param {{ analyze: Function }} [engine] austauschbar für Tests
 * @returns {any} null, `{ invalid }`, `{ error }` oder das Ergebnis der Engine
 */
export function readAnalysis(m, data, engine = { analyze }) {
  const built = buildRows(m, data);
  if (!built) return null;
  if ('invalid' in built) return built;
  const { rows, referenceMap } = built;
  if (rows.length === 0) return null;
  const levels = engineLevels(m.type, rows, m.positiveLevel, mostFrequentLevel(rawRatings(m, data)));
  try {
    return engine.analyze({
      type: m.type,
      levels,
      ratings: rows,
      references: m.reference && data.values(m.reference) != null ? referenceMap : null,
      params: { alpha: m.alpha, weights: m.weights, ruleSet: m.ruleSet },
    });
  } catch (err) {
    return { error: err.message };
  }
}
