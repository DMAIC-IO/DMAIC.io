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
import { analyze } from '../domain/analyze.js';
import { presentResult, insufficientText, residualCharts, previewHypotheses } from './present.js';

export default createModule({
  descriptor,
  Model: State,
  readComputed: ['result'],
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
      /** Alter Schlüssel je Residuendiagramm, unter dem früher gespeichert wurde. */
      legacyEditKeys: {
        fitted: 'hyptest:chart-resid-fits', prob: 'hyptest:chart-resid-normal',
        hist: 'hyptest:chart-resid-hist', order: 'hyptest:chart-resid-order',
      },
      get residFitted() { return residualCharts(this.result, this.t)?.fitted ?? null; },
      get residProb() { return residualCharts(this.result, this.t)?.prob ?? null; },
      get residHist() { return residualCharts(this.result, this.t)?.hist ?? null; },
      get residOrder() { return residualCharts(this.result, this.t)?.order ?? null; },
      get previewH0() { return previewHypotheses(this.model, this.t).h0; },
      get previewH1() { return previewHypotheses(this.model, this.t).h1; },
      /** Segment-Klasse: `btn--active`, wenn das Modelfeld `field` den Wert `value` hat. */
      activeClass(field, value) { return this.model[field] === value ? 'btn--active' : ''; },
      /** Rasterklasse der Testart-Reihe (Mittelwert hat vier Schaltflächen). */
      get testTypeRowClass() { return this.model.category === 'mean' ? 'hyptest__toggle-row--grid' : ''; },
      /** Beschriftung der ersten Stichprobenspalte. */
      get sample1Label() { return this.t(this.model.testType === 'paired' ? 'pairedColumn1' : 'sample1Column'); },
      /** Beschriftung der zweiten Stichprobenspalte. */
      get sample2Label() { return this.t(this.model.testType === 'paired' ? 'pairedColumn2' : 'sample2Column'); },
      /** Zwei Stichproben (ungepaart oder gepaart): zweite Spalte nötig. */
      get needsSecondColumn() { return this.model.testType === 'two' || this.model.testType === 'paired'; },
      /** Überschrift des Zielwerts beim Einstichprobentest. */
      get targetTitle() { return this.t(this.model.category === 'mean' ? 'targetMean' : 'targetVariance'); },
      /** Annahme gleicher Varianzen ist wählbar (Mittelwerte, zwei oder k Stichproben). */
      get showEqualVariances() {
        const m = this.model;
        return m.category === 'mean' && (m.testType === 'two' || m.testType === 'k');
      },
      /** Beschriftung der Varianzannahme. */
      get equalVariancesLabel() { return this.t(this.model.testType === 'k' ? 'assumeEqualVariancesK' : 'assumeEqualVariances'); },
      /** Hinweis, wie viele Paare wegen fehlender Werte entfielen; sonst leer. */
      get pairedNote() {
        const info = this.display?.pairInfo;
        if (!info || !(info.dropped > 0)) return '';
        return this.t('pairedDropped', { count: info.dropped, n: info.n, k: info.dropped });
      },
      /** Layout der Normalitätskarten: Raster bei k Stichproben. */
      get normLayoutClass() { return this.display?.isK ? 'hyptest__norm-grid' : 'hyptest__contents'; },
      /** Weg-Punkt „normalverteilt“. */
      get normalDotClass() { return this.display?.allNormal ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'; },
      /** Antwort „normalverteilt“ als Text. */
      get normalAnswer() { return this.t(this.display?.allNormal ? 'yes' : 'no'); },
      /** Weg-Punkt der Varianzfrage. */
      get varTrailDotClass() { return this.display?.varEquality?.trailYes ? 'hyptest__trail-dot--pass' : 'hyptest__trail-dot--fail'; },
      /** Antwort der Varianzfrage als Text. */
      get varTrailAnswer() { return this.t(this.display?.varEquality?.trailYes ? 'yes' : 'no'); },
      /** Frage der Varianzstufe im Weg. */
      get varTrailLabel() { return this.t(this.display?.varEquality?.trailLabelKey ?? 'varEqual'); },
      /** Entscheidungsklasse der Varianzgleichheit. */
      get varDecisionClass() { return this.display?.varEquality?.varsEqual ? 'hyptest__decision--accept' : 'hyptest__decision--reject'; },
      /** Entscheidungstext der Varianzgleichheit. */
      get varDecisionText() { return this.t(this.display?.varEquality?.varsEqual ? 'varEqual' : 'varUnequal'); },
      /** @noagent Öffnet die Dokumentation des Verfahrens im Algorithm Lab. */
      algoNavigate(algoId) {
        if (algoId) ctx.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
      },
    };
  },
});
