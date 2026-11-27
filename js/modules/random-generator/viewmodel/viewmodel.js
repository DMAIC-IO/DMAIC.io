/**
 * D.Mike — Zufallsgenerator: Viewmodel.
 *
 * Verteilung, Parameter je Verteilung, Umfang, Startwerte und Kategorien
 * liegen im Model (domain/model.js); die Werte sind eine reine Funktion
 * davon (`samplesOf`) und folgen jeder Änderung sofort. Die Seitenleiste
 * schreibt `currentDist` über `x-set`, die Parameter binden `x-field` je
 * Verteilung. Hier bleiben Anzeige (Kennzahlkarten, Werteliste, Anteile,
 * Häufigkeiten in der App-Sprache), die Diagrammkonfiguration, der
 * Zielwähler (UI-State `target`) und der Lauf `toWorksheet`, der die Werte
 * als Stapel ans Arbeitsblatt schickt. Export: die Werte als Spalte `Value`.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { text } from '../../../core/model.js';
import { formatNumber } from '../../../core/number-format.js';
import { worksheetWrite, commitWorksheetWrite } from '../../../core/worksheet-write.js';
import descriptor from '../module.js';
import { State, TARGET_FILTER } from '../domain/model.js';
import { ATTRIBUTIVE_KEY, categories, distOf, isNumericDist } from '../domain/distributions.js';
import { samplesOf, summaryOf, frequency } from '../domain/sample.js';
import { targetGroups, targetList, requireTarget, parseTarget, NEW_COLUMN_ID } from '../../../core/worksheet-targets.js';
import { toRows, fileNameOf } from '../io/export.js';
import { UiState } from './state.js';
import {
  DISPLAY_MAX, NEW_WORKSHEET, fmtStat, fmtValue, countLabel, attrColor, probBars, colorOf, freqRows,
} from './present.js';

/** Kennzahlen stetig/diskret, Schlüssel wie in `generated`. */
const STAT_KEYS = ['n', 'mean', 'sd', 'median', 'min', 'max', 'skewness', 'kurtosis'];

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').RandomGeneratorExports} */
  exports: {
    fileName() { return fileNameOf(this.model, samplesOf(this.model).values.length); },
    table() { return toRows(this.model.currentDist, samplesOf(this.model).values); },
  },
  asyncTasks: {
    toWorksheet: asyncTask({
      params: { target: text({ nullable: true }) },
      async run({ target }) {
        // Stand vor dem ersten await: Werte, Name, Art und das geprüfte Ziel.
        const m = this.model;
        const services = this._ui.services;
        if (target !== null) requireTarget(target, this.targetOptions());
        const values = [...samplesOf(m).values];
        if (!values.length) return null;
        const attributive = m.currentDist === ATTRIBUTIVE_KEY;
        const dist = distOf(m.currentDist);
        const name = attributive ? this.t('distAttributive') : this.t(dist?.nameKey ?? '');
        const discrete = attributive || Boolean(dist?.discrete);
        const type = attributive ? 'text' : 'numeric';
        const sent = this.t('sentToWorksheet');
        let write = worksheetWrite();
        if (target === null) {
          write = write.newWorksheet({ name: services.i18n.t('worksheet.defaultSheetName') })
            .column({ name, values, type, discrete });
        } else {
          const ref = parseTarget(target);
          write = write.worksheet(ref.instanceId).sheet(ref.sheetId);
          write = ref.columnId === NEW_COLUMN_ID
            ? write.column({ name, values, type, discrete })
            : write.overwrite(ref.columnId, { values, type, discrete });
        }
        const { instanceId } = await commitWorksheetWrite(services, write.build());
        this._ui.notify(sent, 'success');
        return { instanceId };
      },
    }),
  },
  /** @type {import('./state.types.js').RandomGeneratorViewFn} */
  view(ctx) {
    const lang = () => ctx.i18n.getLanguage();
    return {
      // ─── Seitenleiste und Kopf ─────────────────────────────
      /** Kategorien der Seitenleiste mit ihren Verteilungen. */
      get categories() { return categories(); },
      get attrKey() { return ATTRIBUTIVE_KEY; },
      get isNumeric() { return isNumericDist(this.model.currentDist); },
      get isAttributive() { return this.model.currentDist === ATTRIBUTIVE_KEY; },
      /** @param {string} key @returns {string} übersetzter Name der Verteilung */
      distName(key) { return key === ATTRIBUTIVE_KEY ? this.t('distAttributive') : this.t(distOf(key)?.nameKey ?? ''); },
      /** @param {string} key @returns {string} Klasse des Knopfs in der Seitenleiste */
      distBtnClass(key) { return key === this.model.currentDist ? 'btn btn--ghost btn--active rg-sidebar__btn rg-sidebar__btn--active' : 'btn btn--ghost rg-sidebar__btn'; },
      get title() { return this.distName(this.model.currentDist ?? ''); },
      get formula() {
        return this.isAttributive ? 'X ~ Categorical(p₁, p₂, …, pₖ)' : (distOf(this.model.currentDist)?.formula ?? '');
      },
      /** @param {string} key @returns {boolean} ist `key` die gewählte Verteilung? */
      isDist(key) { return this.model.currentDist === key; },
      get removeGlyph() { return '×'; },

      computed: {
        /** Die erzeugten Werte des Stands (Merker in domain/sample.js). */
        samples() { return samplesOf(this.model); },
        /** Kennzahlen als Text: stetig/diskret n bis kurtosis, attributiv n, categories, mostFrequent. */
        stats() {
          const v = this.samples.values;
          if (!v.length) return {};
          if (this.isAttributive) {
            const sorted = frequency(v);
            return {
              n: formatNumber(v.length, lang()),
              categories: formatNumber(sorted.length, lang()),
              mostFrequent: sorted[0] ? String(sorted[0][0]) : '—',
            };
          }
          const g = /** @type {any} */ (summaryOf(v, false));
          return Object.fromEntries(STAT_KEYS.map((k) => [k, k === 'n' ? formatNumber(g.n, lang()) : fmtStat(g[k], lang())]));
        },
        /** Wahrscheinlichkeitsbalken je Kategorie. */
        probBars() { return probBars(this.model.attributes, lang()); },
        /** Häufigkeitstabelle (attributiv). */
        freqRows() {
          return this.isAttributive ? freqRows(/** @type {string[]} */ (this.samples.values), this.model.attributes, lang()) : [];
        },
        /** Die angezeigten Werte (höchstens 2000). */
        shownValues() {
          const discrete = Boolean(distOf(this.model.currentDist)?.discrete);
          return this.samples.values.slice(0, DISPLAY_MAX).map((v) => fmtValue(v, discrete, lang()));
        },
        /** Die angezeigten Kategorien als Chips (höchstens 2000). */
        chips() {
          const attrs = this.model.attributes;
          return this.samples.values.slice(0, DISPLAY_MAX).map((v) => ({
            value: String(v), style: `--rg-attr-color:${colorOf(attrs, String(v), 'var(--color-text-tertiary)')}`,
          }));
        },
        /** Zielwähler: je Blatt mit leerer Spalte seine leeren Spalten und „neue Spalte“. */
        targetGroups() {
          return targetGroups(ctx.source, TARGET_FILTER).map((g) => ({
            key: g.newColumnKey,
            label: g.sheetName,
            options: [
              ...g.columns.map((c) => ({ value: c.key, label: `${c.shortName} ${c.name} (n=${formatNumber(c.valueCount, lang())})` })),
              { value: g.newColumnKey, label: `+ ${ctx.i18n.t('ui.columnPicker.newColumn')}` },
            ],
          }));
        },
        /** Histogramm der stetigen/diskreten Werte. */
        histogramChart() {
          const dist = distOf(this.model.currentDist);
          const v = this.samples.values;
          if (!dist || !v.length) return null;
          const name = this.t(dist.nameKey);
          return {
            title: `${this.t('histogram')} — ${name}`,
            data: /** @type {number[]} */ (v),
            showNormalCurve: !dist.discrete,
            showLegend: !dist.discrete,
            barColor: 'var(--color-chart-1)',
            normalCurveColor: 'var(--color-chart-2)',
            xLabel: name,
            yLabel: '',
          };
        },
        /** Pareto der Kategorien mit Farbe je Kategorie. */
        paretoChart() {
          const v = this.samples.values;
          if (!this.isAttributive || !v.length) return null;
          const attrs = this.model.attributes;
          return {
            title: `${this.t('distAttributive')} — ${this.t('frequency')}`,
            items: frequency(v).map(([name, value]) => ({ name, value, color: colorOf(attrs, name, 'var(--color-chart-1)') })),
            refLineValue: 80,
          };
        },
      },

      get hasResults() { return this.samples.values.length > 0; },
      get errorText() { return this.samples.error ? this.t('errGenerate', { message: this.samples.error }) : ''; },
      get dataCount() { return countLabel(this.samples.values.length, lang()); },
      get legacyHistogramKey() { return 'histogram'; },
      get legacyParetoKey() { return 'pareto'; },
      /** @param {number} i @returns {string} Farbvariable der Kategoriezeile */
      attrRowStyle(i) { return `--rg-attr-color: ${attrColor(i)}`; },
      get addLabel() { return `+ ${this.t('addAttribute')}`; },
      get targetPlaceholder() { return ctx.i18n.t('ui.columnPicker.placeholder'); },
      get newWorksheetLabel() { return `+ ${ctx.i18n.t('ui.columnPicker.newWorksheet')}`; },
      /** Die Ziele, die der Lauf annimmt (wie `read().targetColumns`). */
      targetOptions() { return targetList(ctx.source, TARGET_FILTER); },

      /**
       * Sendet die Werte an das gewählte Ziel und holt das Arbeitsblatt nach
       * vorn; ohne Wahl ein Hinweis. Der Agent startet den Lauf selbst und
       * wechselt die Ansicht nicht.
       * @returns {Promise<void>}
       */
      async sendToWorksheet() {
        const choice = this.state.target;
        if (!choice) {
          ctx.notify(this.t('selectTarget'));
          return;
        }
        const target = choice === NEW_WORKSHEET ? null : choice;
        // Inzwischen gefüllt oder gelöscht: Hinweis statt der Prüfmeldung des Laufs.
        if (target !== null && !this.targetOptions().some((o) => o.key === target)) {
          ctx.notify(this.t('targetUnavailable'), 'warning');
          return;
        }
        // Scheitert der Lauf, meldet ihn der Kern (Meldung des Fehlers).
        const out = await this._asyncTaskHost.start('toWorksheet', { target });
        if (out.status === 'rejected') {
          ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
          return;
        }
        const instanceId = out.status === 'done' ? out.value?.instanceId : null;
        if (instanceId) ctx.eventBus.emit('module:activated', { instanceId });
      },
    };
  },
});
