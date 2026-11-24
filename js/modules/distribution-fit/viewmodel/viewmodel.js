/**
 * D.Mike — Verteilungstest: Viewmodel.
 *
 * `computed values`/`analysis` rechnen aus Model und Arbeitsblatt
 * (`ctx.source`) die Anpassung — die Engine läuft dabei je Änderung genau
 * einmal (`analyze` merkt sich die letzte Eingabe). Der Presenter
 * (`present.js`) macht daraus KPI-Streifen, Rangliste, Detailkacheln und
 * Normalitätskarten; der Getter `histogram` ist die Konfiguration des
 * Diagramm-Widgets. Die Ableitung `result` (Model) liefert dem Agenten
 * dieselben Zahlen.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns } from '../../../core/source-columns.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { DATA_TYPES, inputValues, analyze } from '../domain/analyze.js';
import { UiState } from './state.js';
import { kpiCells, rankRows, detailTiles, normality, histogramConfig } from './present.js';

/** Datentyp → Textschlüssel seines Segments. */
const DATA_TYPE_LABEL_KEYS = Object.freeze({ auto: 'dataTypeAuto', continuous: 'dataTypeCont', discrete: 'dataTypeDisc' });

/** Gründe ohne Ergebnis → Textschlüssel des Fehlerkastens. */
const REASON_KEYS = Object.freeze({ min5: 'errMin5', zeroVariance: 'errZeroVariance', error: 'errGeneric' });

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').DistributionFitViewFn} */
  view(ctx) {
    /** Anzeige je Rechnung und Sprache, einmal gebaut. */
    const shown = new WeakMap();
    /**
     * @param {any} vm Viewmodel
     * @returns {{ kpis: any[], rows: any[], tiles: any[], ndd: ReturnType<typeof normality> }|null}
     */
    const display = (vm) => {
      if (!vm.hasResult) return null;
      const a = vm.analysis;
      const lang = ctx.i18n.getLanguage();
      const hit = shown.get(a);
      if (hit && hit.lang === lang) return hit.value;
      const { stats, results, normalityTests } = a.fit;
      const value = {
        kpis: kpiCells(stats, vm.t, lang),
        rows: rankRows(results, vm.t, lang),
        tiles: detailTiles(results, vm.t, lang),
        ndd: normality(normalityTests, vm.t, lang),
      };
      shown.set(a, { lang, value });
      return value;
    };
    return {
      computed: {
        /** Die Zahlen der gewählten Spalte. */
        values() {
          return inputValues(this.model, sourceColumns(ctx.source));
        },
        /** Rohergebnis samt Grund; `null` ohne Spalte oder ohne Zahlen. */
        analysis() {
          return this.model.columnRef ? analyze(this.values, this.model.dataType) : null;
        },
      },
      /** Es gibt eine gelungene Rechnung. */
      get hasResult() {
        const a = this.analysis;
        return !!a && typeof a === 'object' && /** @type {any} */ (a).status === 'ok';
      },
      /**
       * Der Grund ohne Ergebnis als Text; leer ohne Spalte oder mit Ergebnis.
       * Eine gesetzte, aber leere oder gelöschte Spalte nennt die Mindestzahl.
       */
      get errorText() {
        if (!this.model.columnRef) return '';
        const a = /** @type {any} */ (this.analysis);
        if (!a) return this.t('errMin5');
        if ('error' in a) return this.t('errGeneric');
        if (a.status === 'ok') return '';
        return this.t(/** @type {Record<string, string>} */ (REASON_KEYS)[a.reason] ?? 'errGeneric');
      },
      /** Die Segmente des Datentyps, der gespeicherte Wert aktiv. */
      get dataTypeOptions() {
        return DATA_TYPES.map((value) => ({
          value,
          label: this.t(/** @type {Record<string, string>} */ (DATA_TYPE_LABEL_KEYS)[value]),
          activeClass: this.model.dataType === value ? 'btn--active' : '',
        }));
      },
      get kpiCells() { return display(this)?.kpis ?? []; },
      get rankRows() { return display(this)?.rows ?? []; },
      get detailTiles() { return display(this)?.tiles ?? []; },
      get nddShow() { return display(this)?.ndd.show ?? false; },
      get nddCards() { return display(this)?.ndd.cards ?? []; },
      get nddDots() { return display(this)?.ndd.dots ?? []; },
      get nddConsensus() { return display(this)?.ndd.consensus ?? { cls: '', title: '', text: '', scoreLabel: '' }; },
      /** Konfiguration des Histogramms; `null` ohne Ergebnis. */
      get histogram() {
        return this.hasResult ? histogramConfig(this.values, this.t) : null;
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'histogram'; },
      /** Normalitäts-Tiefenanalyse auf- oder zuklappen (UI-State, kein Verlaufsschritt). */
      toggleNdd() { this.state.nddCollapsed = !this.state.nddCollapsed; },
      /** Symbol des Klappknopfs. */
      nddChevronIcon() { return this.state.nddCollapsed ? 'nav.expand-down' : 'nav.collapse-up'; },
      /** Titel des Klappknopfs. */
      nddToggleTitle() { return this.state.nddCollapsed ? this.t('nddExpand') : this.t('nddCollapse'); },
      /** Klasse des Körpers der Tiefenanalyse. */
      nddBodyClass() { return this.state.nddCollapsed ? 'distfit__ndd-body--collapsed' : ''; },
    };
  },
});
