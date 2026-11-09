/**
 * D.Mike — Multi-Vari: Viewmodel.
 *
 * Der auto-Task `analysis` rechnet aus Model und Arbeitsblatt (`ctx.data`),
 * entprellt und abbrechbar; die Anzeigeschalter rechnen nicht neu. Getter
 * machen daraus Kennzahlen, Warnungen, Tabelle und die Konfiguration je
 * Diagrammstreifen (`strips`). Exporte: die Tabelle der Varianzkomponenten.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import descriptor from '../module.js';
import { State, MIN_ROWS, MAX_ROWS } from '../domain/model.js';
import { reorder } from '../interaction/reorder.js';
import { vcTable } from '../io/export.js';
import { fromExample } from '../io/example.js';
import { UiState } from './state.js';
import {
  analysisRun, buildStrips, errorTextOf, fmt, pct, intOrDash, termLabel,
  warningCodes, warningText, vcView,
} from './present.js';

/** Spaltenköpfe der Varianztabelle (Textschlüssel). */
const TABLE_HEAD = ['tableTerm', 'tableDf', 'tableSs', 'tableMs', 'tableVariance', 'tableSd', 'tablePercent'];

export default createModule({
  descriptor,
  Model: State,
  fromExample,
  State: UiState,
  gestures: [reorder],
  asyncTasks: {
    analysis: asyncTask({ auto: true, run: analysisRun() }),
  },
  /** @type {import('./state.types.js').MultiVariViewFn} */
  view(ctx) {
    /** Anzeige der Varianzkomponenten je Ergebnis und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    return {
      /**
       * Eine Spalte für den Lauf: Werte in Zeilenreihenfolge und Name.
       * @param {object} ref Spaltenbezug
       * @returns {{ values: any[]|null, name: string|null }}
       */
      column(ref) { return { values: ctx.data.values(ref), name: ctx.data.name(ref) }; },

      /** Das Ergebnis des letzten Laufs, oder null. */
      get result() { return this.analysis?.result ?? null; },
      /** Grund, warum kein (vollständiges) Ergebnis vorliegt; sonst leer. */
      get errorText() { return errorTextOf(this.analysis, this._asyncTasks.analysis.error, this.t); },

      /** Name der Messwertspalte. */
      get measurementName() {
        return this.model.measurement ? (ctx.data.name(this.model.measurement) ?? '?') : '?';
      },
      /** Titel über den Streifen. */
      get chartTitle() { return this.t('chartTitle', { col: this.measurementName }); },
      /** Konfiguration je Diagrammstreifen; leer ohne Ergebnis oder über einer Größengrenze. */
      get strips() {
        const m = this.model;
        return buildStrips(this.result, {
          showPoints: m.showPoints, connectMeans: m.connectMeans, showGroupMean: m.showGroupMean,
          showRefLine: m.showRefLine, yLabel: this.measurementName, refLabel: this.t('refMean'),
        });
      },
      /** Das Diagramm wird gezeichnet (keine Größengrenze überschritten). */
      get canRender() { return Boolean(this.result) && this.result.renderable !== false; },

      /** Noch Platz für eine Faktorzeile. */
      get canAddFactor() { return this.model.factors.length < MAX_ROWS; },
      /** Eine Faktorzeile lässt sich entfernen. */
      get canRemoveFactor() { return this.model.factors.length > MIN_ROWS; },
      /**
       * Rolle einer Faktorzeile (X-Achse, Serie, Panel-Spalte, Panel-Zeile).
       * @param {number} idx @returns {string}
       */
      factorRole(idx) { return this.t(`factorRole_${idx}`); },
      /**
       * Klasse der Einfügemarke der Geste.
       * @param {number} idx @returns {string}
       */
      factorRowClass(idx) {
        const p = this.state.dropPreview;
        return p && p.group === 'factors' && p.index === idx ? 'dmike-table__row--drop-target' : '';
      },

      /** Unterzeile der Kachel Messungen. */
      get statFactorsText() { return this.t('statFactors', { count: this.result?.factorNames.length ?? 0 }); },
      /** Gesamtmittel, formatiert. */
      get grandMeanText() { return fmt(this.result?.grandMean); },
      /** Unterzeile der Kachel Gesamtmittel. */
      get statSpanText() { return this.t('statSpan', { min: fmt(this.result?.yMin), max: fmt(this.result?.yMax) }); },

      /** Warnkennungen samt übersprungener Zeilen. */
      get warningCodes() { return warningCodes(this.result); },
      /** Es gibt Warnungen. */
      get hasWarnings() { return this.warningCodes.length > 0; },
      /**
       * Text einer Warnung.
       * @param {string} code @returns {string}
       */
      warningText(code) { return warningText(this.result, code, this.t); },

      /** Tabelle, Summenzeile, größter Anteil und Hinweise der Varianzkomponenten. */
      get vc() {
        const r = this.result;
        if (!r) return vcView(null, this.t);
        const hit = shown.get(r);
        const lang = ctx.i18n.getLanguage();
        if (hit && hit.lang === lang) return hit.value;
        const value = vcView(r, this.t);
        shown.set(r, { lang, value });
        return value;
      },
      /**
       * Bezeichnung eines Terms; der Rest heißt Rest (Wiederholung).
       * @param {{ id: string, label: string }} term @returns {string}
       */
      termLabel(term) { return termLabel(term, this.t); },
      /** @param {number} v @returns {string} */
      fmt(v) { return fmt(v); },
      /** @param {number} v @returns {string} */
      pct(v) { return pct(v); },
      /** @param {number} v @returns {string} */
      intOrDash(v) { return intOrDash(v); },
    };
  },

  /** @type {import('./state.types.js').MultiVariExports} */
  exports: {
    fileName() { return this.t('csvFileName'); },
    table() {
      const head = TABLE_HEAD.map((k) => this.t(k));
      const vc = this.result?.vc;
      if (!vc) return [head];
      return vcTable(vc, { head, total: this.t('tableTotal'), termLabel: (term) => termLabel(term, this.t) });
    },
  },
});
