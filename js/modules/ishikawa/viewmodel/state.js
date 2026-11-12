/**
 * D.Mike — Ishikawa: UI-State.
 *
 * Offener Reiter, eingeklappte Ursachen, Kategoriefilter, Vergleich und
 * Pareto-Quelle (Snapshot-id, `null` = aktueller Stand), Trend-Bereich mit
 * seinen Editor-Einstellungen, die Lightbox, die Ursache des offenen Dialogs
 * „Versuche verknüpfen“ (stableId, für seinen Hinweis) und die Vorschau der
 * Gesten.
 * Je Komponente, nie gespeichert.
 */
import { defineState, oneOf, list, number, boolean, object, text } from '../../../core/model.js';
import trendChart from '../../../widgets/trend-chart/schema.js';

export const UiState = defineState({
  tab: oneOf(['problem', 'facts', 'hypotheses', 'experiments']),
  collapsed: list(number()),
  filter: oneOf(['', 'man', 'machine', 'environment', 'material', 'measurement', 'method']),
  compareSnapId: number({ nullable: true }),
  paretoSnapId: number({ nullable: true }),
  trendVisible: boolean(),
  trendEdits: trendChart.edits(),
  lightbox: object({ scope: text(), id: number() }, { nullable: true }),
  linkCause: text({ nullable: true }),
  dragPreview: object({ kind: text(), index: number(), ids: list(number()) }, { nullable: true }),
});
