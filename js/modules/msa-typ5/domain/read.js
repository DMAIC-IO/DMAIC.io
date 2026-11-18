/**
 * D.Mike — MSA Typ 5: Ableitungen aus Model und Arbeitsblatt als reine Funktionen
 * (Stufen, Zeilen, Analyse). Eingaben sind das Model und der Leser der Agentenfläche.
 */
import { analyze } from '../../../engines/msa-typ5-engine.js';
import { effectiveLevels, engineLevels, mostFrequentLevel, ratingValues } from './levels.js';
import { columnName, columnValues, columnOptions } from '../../../core/source-columns.js';
import { longRows, wideRows, orderRatings } from './rows.js';

/**
 * @typedef {import('../../../core/source-reader.js').Source} Source  Leser der Agentenfläche
 * @typedef {import('./rows.js').Row} Row
 */

/**
 * Werte einer Spalte; null ohne Bezug oder bei unlesbarer Spalte.
 * @param {Source} src @param {object|null} ref
 * @returns {any[]|null}
 */
function valuesOf(src, ref) {
  return columnValues(src, ref);
}

/**
 * Anzeigename einer Spalte; null ohne Bezug oder bei unlesbarer Spalte.
 * @param {Source} src @param {object|null} ref
 * @returns {string|null}
 */
function nameOf(src, ref) {
  return columnName(src, ref);
}

/**
 * Die gewählten Bewertungsspalten des breiten Layouts, die es im Arbeitsblatt
 * noch gibt. Eine gelöschte Spalte bleibt im Model stehen, zählt aber nicht mit.
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @returns {object[]}
 */
function liveRatings(m, src) {
  return m.ratings.filter((r) => valuesOf(src, r) != null);
}

/**
 * Rohwerte der Bewertungsspalte(n); null ohne gewählte Spalte. Eine gewählte,
 * aber verschwundene Spalte zählt im langen Layout als leer, im breiten als
 * nicht gewählt.
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @returns {Array<*>|null}
 */
function rawRatings(m, src) {
  return ratingValues(
    m.layout,
    m.rating ? (valuesOf(src, m.rating) ?? []) : null,
    liveRatings(m, src).map((r) => valuesOf(src, r) ?? []),
  );
}

/**
 * Wirksame Stufen aus den Rohwerten der Bewertungsspalte(n).
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @returns {{ all: string[], positive: string|null, negative: string|null }}
 */
export function readLevels(m, src) {
  return effectiveLevels(m, rawRatings(m, src));
}

/**
 * Zeilen der Analyse aus den Spalten; im breiten Layout die noch vorhandenen
 * Bewertungsspalten in Blattreihenfolge.
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @returns {ReturnType<typeof longRows>|ReturnType<typeof wideRows>}
 */
function buildRows(m, src) {
  /** @param {object|null} ref */
  const vals = (ref) => (ref ? (valuesOf(src, ref) ?? []) : null);
  if (m.layout === 'wide') {
    const keys = columnOptions(src, {}).map((c) => c.key);
    const columns = orderRatings(liveRatings(m, src), keys).map((ref) => ({
      name: nameOf(src, ref) ?? '?',
      values: valuesOf(src, ref) ?? [],
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
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @returns {Row[]|null}
 */
export function ratingRowsOf(m, src) {
  const built = buildRows(m, src);
  return built && 'rows' in built ? built.rows : null;
}

/**
 * Die Analyse aus Model und Arbeitsblatt.
 * @param {import('../domain/model.types.js').StateModel} m @param {Source} src
 * @param {{ analyze: Function }} [engine] austauschbar für Tests
 * @returns {any} null, `{ invalid }`, `{ error }` oder das Ergebnis der Engine
 */
export function readAnalysis(m, src, engine = { analyze }) {
  const built = buildRows(m, src);
  if (!built) return null;
  if ('invalid' in built) return built;
  const { rows, referenceMap } = built;
  if (rows.length === 0) return null;
  const levels = engineLevels(m.type, rows, m.positiveLevel, mostFrequentLevel(rawRatings(m, src)));
  try {
    return engine.analyze({
      type: m.type,
      levels,
      ratings: rows,
      references: m.reference && valuesOf(src, m.reference) != null ? referenceMap : null,
      params: { alpha: m.alpha, weights: m.weights, ruleSet: m.ruleSet },
    });
  } catch (err) {
    return { error: err.message };
  }
}
