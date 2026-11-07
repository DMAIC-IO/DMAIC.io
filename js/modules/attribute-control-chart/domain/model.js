/**
 * D.Mike — Attributive Regelkarte: Model.
 *
 * Gespeichert wird nur die Konfiguration; Grenzen und Verletzungen rechnet
 * der view-Block (`computed analysis`) aus Model und Arbeitsblatt. Ob die
 * Stichprobenspalte (p, u) und das konstante n (np) gelten, entscheidet der
 * Kartentyp in der Ansicht; gespeichert werden beide immer. Die Kartentypen
 * und Regeln entsprechen der Engine (attribute-control-chart-engine.js).
 */
import { defineModel, command, number, boolean, oneOf, list, columnRef, text } from '../../../core/model.js';
import controlChart from '../../../widgets/control-chart/schema.js';

export const State = defineModel({
  version: '1.0',
  fields: {
    chartTypeId: oneOf(['p', 'np', 'c', 'u']),
    defectsRef: columnRef({ types: ['numeric'], minCount: 2 }),
    sizeRef: columnRef({ types: ['numeric'], minCount: 2 }),
    constantN: number({ integer: true, min: 1, default: 50 }),
    baselineCount: number({ integer: true, min: 1, nullable: true }),
    enabledRules: list(oneOf([1, 2, 3, 5, 6]), { default: [1] }),
  },
  view: {
    exampleWorksheetId: text({ nullable: true }),
    controlChartEdits: controlChart.edits(),
  },
  commands: {
    toggleRule: command({
      params: { ruleId: oneOf([1, 2, 3, 5, 6]), on: boolean() },
      run({ ruleId, on }) {
        const rest = this.enabledRules.filter((r) => r !== ruleId);
        this.enabledRules = [...new Set(on ? [...rest, ruleId] : rest)].sort((a, b) => a - b);
      },
    }),
  },
});
