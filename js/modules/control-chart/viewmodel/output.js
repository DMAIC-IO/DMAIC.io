/**
 * D.Mike — Regelkarte für Variablen: view-Teil Ausgabe.
 *
 * KPI-Leiste, Fehlerkasten, Teilkarten (Widget `control-chart` je Teilkarte,
 * als Objekt für `x-for`), Verletzungsliste und der Anmerkungsdialog. Die
 * Texte baut der Presenter (`present.js`), einmal je Rechnung und Sprache.
 */
import { columnName } from '../../../core/source-columns.js';
import { errorOf } from '../domain/analyze.js';
import { kpiOf, chartViewsOf, violationRowsOf } from './present.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {Extract<Analysis, { status: 'ok' }>} Ok */
/** @typedef {import('./present.js').ViolationRow} ViolationRow */

/** @type {import('./state.types.js').ControlChartViewFn} */
export function outputView(ctx) {
  /** KPI-Leiste je Rechnung und Sprache. */
  const kpis = new WeakMap();
  /** Teilkarten je Rechnung, Spaltenname und Sprache. */
  const views = new WeakMap();
  /** Zuletzt gemeldeter Fehler des `computed` (nur einmal warnen). */
  let warned = null;
  /** Globale Texte (Punkt, Regel). */
  const gt = (/** @type {string} */ key, /** @type {object} */ params) => ctx.i18n.t(key, params);
  return {
    /** Es gibt ein Ergebnis. */
    get hasResult() {
      const a = /** @type {any} */ (this.analysis);
      if (a && typeof a === 'object' && 'error' in a && warned !== a) {
        warned = a;
        console.warn('control-chart: Rechnung fehlgeschlagen', a.error);
      }
      return a?.status === 'ok';
    },
    /** Grund, warum nicht gerechnet wurde, als Text; sonst leer. */
    get errorText() {
      const reason = errorOf(/** @type {any} */ (this.analysis));
      return reason ? this.t(reason) : '';
    },
    /** Die KPI-Leiste; `null` ohne Ergebnis. */
    get kpi() {
      if (!this.hasResult) return null;
      /** @type {Ok} */
      const a = this.analysis;
      const lang = ctx.i18n.getLanguage();
      const hit = kpis.get(a);
      if (hit && hit.lang === lang) return hit.value;
      const value = kpiOf(a, this.t, lang);
      kpis.set(a, { lang, value });
      return value;
    },
    /**
     * Je Teilkarte Kopfzeile, Abzeichen, Konfiguration und Altschlüssel, als
     * Objekt in Zeichenreihenfolge; leer ohne Ergebnis.
     */
    get chartViews() {
      if (!this.hasResult) return {};
      /** @type {Ok} */
      const a = this.analysis;
      const col = columnName(ctx.source, this.model.columnRef) ?? '';
      const lang = ctx.i18n.getLanguage();
      const hit = views.get(a);
      if (hit && hit.lang === lang && hit.col === col) return hit.value;
      const value = chartViewsOf(a, this.model, col, this.t, lang);
      views.set(a, { lang, col, value });
      return value;
    },
    /** Mit Ergebnis, ohne Verletzung der ersten Teilkarte. */
    get showNoViolations() {
      return this.hasResult && /** @type {Ok} */ (this.analysis).primaryViolations.length === 0;
    },
    /** Die Zeilen der Verletzungsliste; leer ohne Ergebnis. */
    get violationRows() {
      if (!this.hasResult) return [];
      return violationRowsOf(/** @type {Ok} */ (this.analysis), this.model.annotations, gt);
    },
    /** Es gibt Verletzungen. */
    get showViolations() { return this.violationRows.length > 0; },
    /** Kopf der Verletzungsliste. */
    get violationsHeader() { return `⚑ ${this.t('violationsTitle', { count: this.violationRows.length })}`; },
    /**
     * Öffnet den Anmerkungsdialog eines Punkts; „Entfernen“ nur bei einer
     * bestehenden Anmerkung.
     * @param {ViolationRow} row
     * @returns {Promise<void>}
     */
    openAnnotation(row) {
      const index = row.index;
      return ctx.openDialog('annForm', {
        args: { index },
        title: this.t('annotationTitle', { idx: index + 1 }),
        confirmLabel: 'modules.control-chart.annotationSave',
        delete: Object.hasOwn(this.model.annotations, String(index)) ? 'removeAnnotation' : undefined,
      });
    },
    /**
     * Enter oder Leertaste an einer Zeile öffnen den Dialog.
     * @param {ViolationRow} row @param {KeyboardEvent} event
     */
    onViolationKey(row, event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.openAnnotation(row);
    },
  };
}
