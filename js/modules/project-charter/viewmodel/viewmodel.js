/**
 * D.Mike — Project charter: Viewmodel.
 *
 * Problembeschreibung (Widget `rich-text`), Ziele und Organigramm. Daten und
 * Kommandos liegen im Model (domain/model.js), die Agentenfläche entsteht aus
 * dessen Schema. Die Oberfläche setzt sich aus view-Teilen zusammen (Ziele,
 * Organigramm, Stil-Panel); Umsortieren und Umhängen laufen über die Gesten
 * in interaction/. Rückgängig und Wiederholen übernimmt der Verlauf des Kerns.
 */
import { createModule } from '../../../core/template-module.js';
import { resolveDateOffset } from '../../../core/date-offset.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { goalRowGesture } from '../interaction/goals.js';
import { orgNodeGesture } from '../interaction/org-node.js';
import { orgExportConfig } from '../io/export.js';
import { UiState } from './state.js';
import { goalsView } from './goals.js';
import { orgView } from './org.js';
import { styleView } from './style.js';

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [
    orgNodeGesture({ handle: '.pc__org-node' }),
    goalRowGesture({ handle: '.pc__goal-grip' }),
  ],

  /**
   * Die relativen Zieldaten des Beispiels („+3M“) zu Kalenderdaten auflösen.
   * @param {object} data Modulzustand des Beispiels
   * @returns {object} Kopie mit aufgelösten Zieldaten
   */
  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.goals)) {
      for (const g of result.goals) g.targetDate = resolveDateOffset(g.targetDate);
    }
    return result;
  },

  view: [goalsView, orgView, styleView],

  /** @type {import('./state.types.js').ProjectCharterExports} */
  exports: {
    fileName() { return this.t('exportFileName'); },
    image() {
      return this.chartSVG('node-diagram', orgExportConfig(this.model, {
        heights: this.state.heights,
        cssVars: (vars) => this.cssVars(vars),
      }));
    },
  },
});
