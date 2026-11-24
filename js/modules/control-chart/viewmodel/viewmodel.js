/**
 * D.Mike — Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Viewmodel.
 *
 * `computed analysis` liest die Messwertspalte aus dem Arbeitsblatt
 * (`ctx.source`) und rechnet die Regelkarte; `analyze` merkt sich die letzte
 * Eingabe, so rufen Ansicht, Ableitungen (`result`, `points`) und die beiden
 * Viewmodel-Kommandos die Engine zusammen einmal je Änderung. Die Oberfläche
 * besteht aus zwei view-Teilen (Eingabe, Ausgabe).
 *
 * Viewmodel-Kommandos, weil sie das Ergebnis der Rechnung über das
 * Arbeitsblatt brauchen, das ein Model-Kommando nicht sieht:
 * `setAnnotation` prüft, ob es den Punkt gibt; `setPhase2` friert die
 * gerechneten Grenzen ein.
 *
 * Eine andere Spalte verwirft eingefrorene Grenzen einer anderen Spalte
 * (`$watch` in `init`, im Schritt der Spaltenänderung).
 */
import { createModule } from '../../../core/template-module.js';
import { command, number, text, boolean, setFields, cloneJSON } from '../../../core/model.js';
import { requireIndex } from '../../../core/validate.js';
import { sourceColumns } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputsOf, analyze, freezeLimitsOf, sameColumn } from '../domain/analyze.js';
import { UiState } from './state.js';
import { inputView } from './input.js';
import { outputView } from './output.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */

/** @param {any} ref @returns {string} Schlüssel eines Spaltenbezugs, leer ohne */
const keyOf = (ref) => (ref ? `${ref.instanceId}|${ref.sheetId ?? ''}|${ref.columnId}` : '');

/**
 * Eine Ablehnung mit dem Hinweistext der Oberfläche.
 * @param {(key: string) => string} t @param {string} param @param {string} hintKey
 * @returns {Error & { param: string, hintKey: string }}
 */
const refusal = (t, param, hintKey) => Object.assign(new Error(t(hintKey)), { param, hintKey });

/** Zahl der Punkte der ersten Teilkarte; 0 ohne Ergebnis. @param {any} a @returns {number} */
const pointCount = (a) => (a?.status === 'ok' ? a.fit.subcharts[a.ct.subcharts[0].id].values.length : 0);

/** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, { nelsonCollapsed: boolean }>} */
function coreView(ctx) {
  /** @type {null|(() => void)} */
  let unwatch = null;
  return {
    init() {
      // Verworfen wird nur, wenn sich der Bezug ändert und die eingefrorenen
      // Grenzen nicht. Ändern sich beide (Rückgängig, Wiederholen, Laden), bleibt
      // alles. Das Verwerfen gehört zum Schritt der Spaltenänderung: es läuft eine
      // Mikroaufgabe später, `amend` faltet es in den Schritt.
      const off = this.$watch(
        () => [keyOf(this.model.columnRef), JSON.stringify(this.model.frozenLimits)],
        (/** @type {string[]} */ now, /** @type {string[]} */ before) => {
          if (now[0] === before[0] || now[1] !== before[1]) return;
          const stale = () => {
            const fl = this.model.frozenLimits;
            return Boolean(fl?.columnRef) && !sameColumn(fl.columnRef, this.model.columnRef);
          };
          if (!stale()) return;
          queueMicrotask(() => {
            if (!stale()) return;
            ctx.history?.amend(() => setFields(this.model, { frozenLimits: null }));
            ctx.notify(this.t('phase2_columnChanged'), 'info');
          });
        },
      );
      unwatch = typeof off === 'function' ? off : null;
    },
    destroy() {
      unwatch?.();
      unwatch = null;
    },
    computed: {
      /**
       * Rohergebnis oder Fehlergrund; `null` ohne Ausgabe (kein Bezug, Spalte
       * nicht lesbar, unter zwei Werten). Die Werte entstehen hier und gehen
       * roh an die Engine.
       */
      analysis() {
        return analyze(inputsOf(this.model, sourceColumns(ctx.source)));
      },
    },
  };
}

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  commands: {
    setAnnotation: command({
      params: { index: number({ integer: true, min: 0 }), comment: text(), excluded: boolean() },
      current({ index }) {
        const ann = index == null ? null : this.model.annotations[index];
        return { comment: ann?.comment ?? '', excluded: Boolean(ann?.excluded) };
      },
      run({ index, comment, excluded }) {
        requireIndex('index', index, pointCount(this.analysis), { existing: true });
        const annotations = cloneJSON(this.model.annotations);
        if (!comment && !excluded) delete annotations[index];
        else annotations[index] = { comment, excluded };
        setFields(this.model, { annotations });
      },
    }),
    setPhase2: command({
      params: { enabled: boolean() },
      run({ enabled }) {
        if (!enabled) {
          if (this.model.frozenLimits) setFields(this.model, { frozenLimits: null });
          return;
        }
        /** @type {Analysis|null} */
        const a = this.analysis;
        if (a?.status !== 'ok') throw refusal(this.t, 'enabled', 'phase2_needsData');
        if (a.stages.length > 0) throw refusal(this.t, 'enabled', 'phase2_noStages');
        if (a.frozen) return;
        setFields(this.model, { frozenLimits: freezeLimitsOf(this.model, a) });
      },
    }),
  },
  view: [coreView, inputView, outputView],
});
