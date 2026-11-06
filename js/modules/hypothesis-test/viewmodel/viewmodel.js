/**
 * D.Mike — Hypothesentest: Viewmodel.
 *
 * Ein `computed result` rechnet aus Model und Arbeitsblatt (`ctx.data`);
 * Getter machen daraus Anzeige, Fehlertext, die vier Residuendiagramme und
 * die Hypothesenvorschau.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State, resolveTarget } from '../domain/model.js';
import { analyze, algoIdOf } from '../domain/analyze.js';
import { presentResult, insufficientText, residualCharts, previewHypotheses } from './present.js';

export default createModule({
  descriptor,
  Model: State,
  readComputed: ['result'],
  /** Beim ersten Öffnen α und Ziel-Teststärke aus den Einstellungen. */
  createDefault(context) {
    const m = new State();
    const conf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    const power = (context.stateManager.get('settings.power') ?? 80) / 100;
    m.alpha = Number((1 - conf).toFixed(4));
    m.powerGoal = power;
    return m;
  },
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** Anzeigemodell je Ergebnisobjekt, einmal gebaut. */
    const shown = new WeakMap();
    return {
      computed: {
        /**
         * Die Analyse als Zahlen; `{ status: 'insufficient', reason }`, solange Eingaben fehlen.
         * Gepaart kommen die Spalten ungefiltert (die Paarbildung dünnt sie aus), sonst nur Zahlen.
         */
        result() {
          const m = this.model;
          const refs = m.testType === 'k' ? m.colRefsK
            : (m.testType === 'one' ? [m.colRef1] : [m.colRef1, m.colRef2]);
          const samples = refs.map((ref) => {
            if (!ref) return { name: '', values: null };
            if (m.testType === 'paired') return { name: '', values: ctx.data.values(ref) };
            return { name: ctx.data.name(ref) ?? '', values: ctx.data.numeric(ref) };
          });
          return analyze({
            category: m.category, testType: m.testType, direction: m.direction,
            alpha: m.alpha, powerGoal: m.powerGoal, target: resolveTarget(m), targetType: m.targetType,
            equalVariances: m.equalVariances, samples,
          });
        },
      },
      /** Anzeigemodell (Texte, Klassen, Tooltips) oder null. */
      get display() {
        const r = this.result;
        if (!r || r.status !== 'ok') return null;
        const hit = shown.get(r);
        if (hit && hit.t === this.t) return hit.value;
        const value = presentResult(r, this.t, this.model);
        shown.set(r, { t: this.t, value });
        return value;
      },
      /** Hinweis zu unvollständigen Eingaben oder zur gescheiterten Analyse; sonst leer. */
      get errorText() {
        const r = this.result;
        if (!r) return '';
        if (r.error != null) return this.t('analysisFailed', { message: r.error });
        return r.status === 'ok' ? '' : insufficientText(r, this.t);
      },
      get residFitted() { return residualCharts(this.result, this.t)?.fitted ?? null; },
      get residProb() { return residualCharts(this.result, this.t)?.prob ?? null; },
      get residHist() { return residualCharts(this.result, this.t)?.hist ?? null; },
      get residOrder() { return residualCharts(this.result, this.t)?.order ?? null; },
      get previewH0() { return previewHypotheses(this.model, this.t).h0; },
      get previewH1() { return previewHypotheses(this.model, this.t).h1; },
      /** @noagent Öffnet die Dokumentation des Verfahrens im Algorithm Lab. */
      algoNavigate(name) {
        const algoId = algoIdOf(name);
        if (algoId) ctx.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
      },
    };
  },
});
