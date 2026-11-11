/**
 * D.Mike — Attributive Regelkarte: Model.
 *
 * Gespeichert wird nur die Konfiguration; Grenzen und Verletzungen rechnet
 * die Ableitung `analysis` aus Model und Arbeitsblatt. Ob die
 * Stichprobenspalte (p, u) und das konstante n (np) gelten, entscheidet der
 * Kartentyp in der Ansicht; gespeichert werden beide immer. Die Kartentypen
 * und Regeln entsprechen der Engine (attribute-control-chart-engine.js).
 */
import { defineModel, command, number, boolean, oneOf, list, columnRef, text } from '../../../core/model.js';
import { getAttributeChartType } from '../../../engines/attribute-control-chart-engine.js';
import { analyzeState, resultOf, pointsOf } from './analyze.js';
import controlChart from '../../../widgets/control-chart/schema.js';

export const State = defineModel({
  version: '1.0',
  fields: {
    chartTypeId: oneOf(['p', 'np', 'c', 'u']),
    defectsRef: columnRef({ types: ['numeric'], minCount: 2 }),
    sizeRef: columnRef({ types: ['numeric'], minCount: 2 }),
    constantN: number({ integer: true, min: 1, default: 50 }),
    baselineCount: number({ integer: true, min: 1, nullable: true }),
    enabledRules: list(oneOf([1, 2, 3, 5, 6]), { unique: true, sorted: true, default: [1] }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    controlChartEdits: controlChart.edits(),
  },
  derived: {
    /**
     * Grenzen und Verletzungen; null ohne die nötigen Spalten oder mit weniger als 2 Punkten.
     *
     * @param {any} data Arbeitsblattsicht
     * @this {import('./model.types.js').StateModel}
     * @returns {ReturnType<typeof analyzeState>}
     */
    analysis(data) { return analyzeState(this, (ref) => data.values(ref) ?? []); },
    /**
     * Das Ergebnis als Zahlen.
     *
     * @param {any} _data Arbeitsblattsicht
     * @param {{ analysis: any }} d
     * @this {import('./model.types.js').StateModel}
     * @returns {ReturnType<typeof resultOf>}
     */
    result(_data, d) { return resultOf(d.analysis, this.chartTypeId); },
    /**
     * Je Punkt eine Zeile.
     *
     * @param {any} _data Arbeitsblattsicht
     * @param {{ analysis: any }} d
     * @returns {ReturnType<typeof pointsOf>}
     */
    points(_data, d) { return pointsOf(d.analysis); },
    /**
     * Die Spaltenfelder des Kartentyps.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {('defectsRef'|'sizeRef')[]}
     */
    activeColumnSlots() { return getAttributeChartType(this.chartTypeId)?.requiresSampleSize ? ['defectsRef', 'sizeRef'] : ['defectsRef']; },
    /**
     * Die Einstellungen des Kartentyps.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {string[]}
     */
    activeParams() {
      const np = Boolean(getAttributeChartType(this.chartTypeId)?.requiresConstantN);
      return ['chartTypeId', ...(np ? ['constantN'] : []), 'baselineCount', 'enabledRules'];
    },
  },
  derivedBulk: ['points'],
  commands: {
    toggleRule: command({
      params: { ruleId: oneOf([1, 2, 3, 5, 6]), on: boolean() },
      run({ ruleId, on }) {
        this.enabledRules = on ? [...this.enabledRules, ruleId] : this.enabledRules.filter((r) => r !== ruleId);
      },
    }),
  },
});
