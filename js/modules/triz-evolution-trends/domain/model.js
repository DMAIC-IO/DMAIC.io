/**
 * D.Mike — TRIZ-Evolutionstrends: Model.
 *
 * Das betrachtete System und je Trend die erreichte Stufe (-1: keine gewählt)
 * und eine Notiz. Gespeichert: `{ _schema, system, trends: { <acht ids>:
 * { stage, notes } } }`. Dass die Stufe in der Skala ihres Trends liegt,
 * sichert die Invariante `stageInScale` — beim Laden je Trend auf -1
 * repariert, beim Schreiben abgelehnt.
 */
import { defineModel, command, text, number, object, record, oneOf } from '../../../core/model.js';
import { TRENDS, stageCount } from './trends.js';
import { from0 } from './migrations.js';

/**
 * True, wenn die Stufe -1 ist oder eine Stufe der Skala des Trends.
 * @param {string} id @param {number} stage @returns {boolean}
 */
function inScale(id, stage) {
  return stage === -1 || (stage >= 0 && stage < stageCount(id));
}

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** das betrachtete System, dessen Entwicklung eingeordnet wird */
    system: text(),
    /**
     * die acht Trends; je Trend die erreichte Stufe (0 ist die erste, -1 heißt
     * „keine gewählt“) und eine Notiz. `uneven` hat keine Stufen.
     */
    trends: record(
      ['aggregation', 'dynamism', 'scale', 'automation', 'completeness', 'controllability', 'matching', 'uneven'],
      object({ stage: number({ integer: true, min: -1, default: -1 }), notes: text() }),
    ),
  },
  view: {},
  commands: {
    setTrendStage: command({
      params: {
        trendId: oneOf(['aggregation', 'dynamism', 'scale', 'automation', 'completeness', 'controllability', 'matching', 'uneven']),
        stage: number({ integer: true, min: -1 }),
      },
      run({ trendId, stage }) {
        this.trends[trendId].stage = stage;
      },
    }),
  },
  invariants: {
    stageInScale: {
      fields: ['trends'],
      test(m) {
        return TRENDS.every((t) => inScale(t.id, m.trends[t.id].stage));
      },
      repair(m) {
        for (const t of TRENDS) {
          const entry = m._v.trends[t.id];
          if (!inScale(t.id, entry.stage)) entry.stage = -1;
        }
      },
    },
  },
});
