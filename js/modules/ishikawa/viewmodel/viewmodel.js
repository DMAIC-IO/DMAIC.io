/**
 * D.Mike — Ishikawa (6M): Viewmodel.
 *
 * Problembeschreibung, Ursachen mit Expertenbewertung nach 6M, Snapshots,
 * Experimente und Fakten in vier Reitern. Daten und Kommandos liegen im Model
 * (domain/model.js), die Agentenfläche entsteht aus dessen Schema; was
 * Übersetzungen oder den UI-State braucht, sind die Kommandos in
 * `commands.js`. Die Oberfläche setzt sich aus vier view-Teilen zusammen
 * (Problem, Ursachen, Snapshots, Experimente); Umsortieren läuft über die
 * Gesten in interaction/. Export: Tabellen-Mapper, Menü und Datei baut der Kern.
 */
import { createModule } from '../../../core/template-module.js';
import { resolveDateOffset } from '../../../core/date-offset.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { treeGesture } from '../interaction/tree.js';
import { rowGesture } from '../interaction/rows.js';
import { exportTable } from '../io/export.js';
import { UiState } from './state.js';
import { commands } from './commands.js';
import * as forms from './forms.js';
import { problemView } from './problem.js';
import { causesView } from './causes.js';
import { snapshotsView } from './snapshots.js';
import { experimentsView } from './experiments.js';

export default createModule({
  descriptor,
  Model: State,
  history: true,
  State: UiState,
  commands,
  forms,
  gestures: [
    treeGesture({ handle: '.ishikawa__grip--tree' }),
    rowGesture({ handle: '.ishikawa__grip--exp', command: 'moveExperimentBefore' }),
    rowGesture({ handle: '.ishikawa__grip--fact', command: 'moveFactBefore' }),
  ],

  /**
   * Die relativen Daten des Beispiels („+7d“) zu Kalenderdaten auflösen.
   * @param {object} data Modulzustand des Beispiels
   * @returns {object} Kopie mit aufgelösten Daten der Experimente und Fakten
   */
  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.experiments)) {
      for (const e of result.experiments) {
        e.startDate = resolveDateOffset(e.startDate);
        e.endDate = resolveDateOffset(e.endDate);
      }
    }
    if (Array.isArray(result.facts)) {
      for (const f of result.facts) f.date = resolveDateOffset(f.date);
    }
    return result;
  },

  view: [problemView, causesView, snapshotsView, experimentsView],

  /** @type {import('./state.types.js').IshikawaExports} */
  exports: {
    fileName: 'ishikawa-6m-export',
    table() { return exportTable(this.model, { t: this.t }); },
  },
});
