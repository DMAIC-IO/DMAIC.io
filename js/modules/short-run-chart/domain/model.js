/**
 * D.Mike — Kurzserien-Regelkarte (Z-MR): Model.
 *
 * Gespeichert werden die Messwert- und die Teilespalte. Ansicht: die
 * Editor-Einstellungen je Teilkarte (`charts`, Schlüssel `z` und `mr`) und
 * das Beispielblatt. Ergebnis, Punkte und Hinweis liefern die Ableitungen aus
 * Model und Arbeitsblatt; die Engine läuft je Änderung einmal (Merker in
 * `analyze.js`).
 */
import { defineModel, text, map, columnRef } from '../../../core/model.js';
import { sourceColumns } from '../../../core/source-columns.js';
import controlChart from '../../../widgets/control-chart/schema.js';
import { inputPairs, inputsOf, analyze, resultOf, pointsOf, skippedOf } from './analyze.js';
import { from0 } from './migrations.js';

/** @typedef {import('./analyze.js').Result} Result */
/** @typedef {import('./analyze.js').Point} Point */

/**
 * Die Teilkarten mit eigenen Editor-Einstellungen (Schlüssel von `charts`):
 * z-Karte und MR-Karte der z-Werte.
 */
export const CHART_KEYS = Object.freeze(['z', 'mr']);

/**
 * Die Rechnung zum Stand des Models.
 * @param {import('./model.types.js').StateModel} m
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {import('./analyze.js').Analysis|null}
 */
const analysisOf = (m, src) => analyze(inputsOf(inputPairs(m, sourceColumns(src))));

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    valuesRef: columnRef({ types: ['numeric'], minCount: 4, nullable: true }),
    groupsRef: columnRef({ types: ['numeric', 'text'], minCount: 4, nullable: true }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    charts: map(text(), controlChart.edits()),
  },
  invariants: {
    chartKeys: {
      fields: ['charts'],
      test(m) { return Object.keys(m.charts).every((k) => CHART_KEYS.includes(k)); },
      repair(m) {
        const charts = /** @type {Record<string, unknown>} */ (m._v.charts);
        m._v.charts = Object.fromEntries(Object.entries(charts).filter(([k]) => CHART_KEYS.includes(k)));
      },
    },
  },
  derived: {
    /**
     * Kennzahlen je Teil, Grenzen der z- und der MR-Karte und die
     * Signalpunkte beider Karten; `null` ohne eine der Spalten, bei einer
     * nicht lesbaren Spalte, unter vier verwertbaren Paaren oder bei einem
     * Rechenfehler.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result(src) {
      return resultOf(analysisOf(this, src));
    },
    /**
     * Je verwertetem Paar der z-Wert, die gleitende Spannweite (in der
     * ersten Zeile ohne Wert) und ob einer davon ein Signal ist. Leer ohne
     * Ergebnis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @this {import('./model.types.js').StateModel}
     * @returns {Point[]}
     */
    points(src) {
      return pointsOf(analysisOf(this, src));
    },
    /**
     * Der Hinweis auf Werte aus Teilen ohne Streuung (als z = 0 gezählt) in
     * der aktiven Sprache, wie ihn die Oberfläche zeigt; `null` ohne Hinweis.
     *
     * @param {import('../../../core/source-reader.js').Source} src Leser des Arbeitsblatts
     * @param {any} _d
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {string|null}
     */
    warningMsg(src, _d, t) {
      const count = skippedOf(analysisOf(this, src));
      return count > 0 ? t('warningSkipped', { count }) : null;
    },
    /**
     * Die Spaltenfelder, die im aktuellen Stand wirken.
     * @returns {string[]}
     */
    activeColumnSlots() { return ['valuesRef', 'groupsRef']; },
  },
  derivedBulk: ['points'],
});
