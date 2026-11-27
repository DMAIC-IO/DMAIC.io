/**
 * D.Mike — Datentransformation: Viewmodel.
 *
 * Transformation, Quellspalte und Parameter je Transformation liegen im
 * Model (domain/model.js). Der auto-Lauf `analysis` liest Spalte und Stand,
 * wartet abbrechbar und rechnet (`analyze`); sein Wert ist das Ergebnis,
 * Original- und transformierte Werte des letzten Laufs liegen in der Closure
 * des `view`-Blocks (Diagramme, Exportkasten, Export, Senden). Der Lauf
 * `toWorksheet` wartet auf das Ende der Rechnung und schickt die Werte als
 * Stapel ans Arbeitsblatt. Hier bleiben Anzeige (Kennwerte, Normalität,
 * λ-Platzhalter und Schieber), Diagrammkonfiguration und der Zielwähler
 * (UI-State `target`). Kommando `copyExport`: Werte in die Zwischenablage.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { command, text } from '../../../core/model.js';
import { formatNumber } from '../../../core/number-format.js';
import { columnName } from '../../../core/source-columns.js';
import { worksheetWrite, commitWorksheetWrite } from '../../../core/worksheet-write.js';
import { targetGroups, targetList, requireTarget, parseTarget, NEW_COLUMN_ID } from '../../../core/worksheet-targets.js';
import descriptor from '../module.js';
import { State, TARGET_FILTER, sourceValues } from '../domain/model.js';
import { TRANSFORMS, transformOf } from '../domain/transforms.js';
import { analyze } from '../domain/analyze.js';
import { toRows, exportText, FILE_NAME } from '../io/export.js';
import { UiState } from './state.js';
import { RERUN_DELAY, SETTLE_MS, NEW_WORKSHEET, pause, statRows, normRow, alphaLine } from './present.js';

/** @typedef {import('../domain/analyze.js').Result} Result */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').DataTransformationExports} */
  exports: {
    fileName() { return FILE_NAME; },
    table() {
      const s = this.series;
      return s ? toRows(s.original, s.transformed, [this.t('original'), this.t('transformed')]) : null;
    },
  },
  commands: {
    copyExport: command({
      run() {
        const s = this.series;
        if (!s) throw new Error(this.t('nothingToCopy'));
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) throw new Error(this.t('copyFailed'));
        const copied = this.t('copied');
        const failed = this.t('copyFailed');
        clipboard.writeText(exportText(s.transformed)).then(
          () => this._ui.notify(copied, 'success'),
          (err) => { console.warn('[data-transformation] clipboard', err); this._ui.notify(failed, 'error'); },
        );
      },
    }),
  },
  asyncTasks: {
    analysis: asyncTask({
      auto: true,
      async run(_args, { signal }) {
        // Stand vor dem ersten await: Zahlen der Quellspalte, Transformation, Parameter.
        const values = this.sourceNumbers();
        const m = { currentTF: this.model.currentTF, params: JSON.parse(JSON.stringify(this.model.params)) };
        await pause(RERUN_DELAY, signal);
        signal.throwIfAborted();
        let out;
        try {
          out = analyze(values, m);
        } catch (err) {
          this.keepSeries(null);
          throw new Error(this.t(/** @type {Error} */ (err).message), { cause: err });
        }
        this.keepSeries(out ? { original: values, transformed: out.transformed } : null);
        return out ? out.result : null;
      },
    }),
    toWorksheet: asyncTask({
      params: { target: text({ nullable: true }) },
      async run({ target }, { signal }) {
        if (target !== null) requireTarget(target, this.targetOptions());
        const services = this._ui.services;
        // Erst die Rechnung abwarten: eine eben geänderte Eingabe darf keine alten Werte senden.
        if (!(await this._asyncTaskHost.settle(SETTLE_MS))) throw new Error(this.t('analysisTimeout'));
        signal.throwIfAborted();
        const s = this.series;
        const result = /** @type {Result|null} */ (this.analysis);
        if (!s || !result) return null;
        const values = [...s.transformed];
        const tfName = this.t(transformOf(result.transform)?.nameKey ?? '');
        const src = this.sourceName();
        const name = src ? `${src} (${tfName})` : tfName;
        const sent = this.t('sentToWorksheet');
        let write = worksheetWrite();
        if (target === null) {
          write = write.newWorksheet({ name: services.i18n.t('worksheet.defaultSheetName') }).column({ name, values });
        } else {
          const ref = parseTarget(target);
          write = write.worksheet(ref.instanceId).sheet(ref.sheetId);
          write = ref.columnId === NEW_COLUMN_ID ? write.column({ name, values }) : write.overwrite(ref.columnId, { values });
        }
        const { instanceId } = await commitWorksheetWrite(services, write.build());
        this._ui.notify(sent, 'success');
        return { instanceId };
      },
    }),
  },
  /** @type {import('./state.types.js').DataTransformationViewFn} */
  view(ctx) {
    /** @type {{ original: number[], transformed: number[] }|null} Werte des letzten Laufs */
    let kept = null;
    const lang = () => ctx.i18n.getLanguage();
    return {
      /** Die Zahlen der Quellspalte (für den Lauf). @returns {number[]} */
      sourceNumbers() { return sourceValues(ctx.source, this.model.columnRef); },
      /** Der Name der Quellspalte, leer ohne lesbare Spalte. @returns {string} */
      sourceName() { return this.model.columnRef ? (columnName(ctx.source, /** @type {any} */ (this.model.columnRef)) ?? '') : ''; },
      /**
       * Die Werte des letzten Laufs behalten.
       * @param {{ original: number[], transformed: number[] }|null} next @returns {void}
       */
      keepSeries(next) { kept = next; },
      /** Die Ziele, die der Lauf annimmt (wie `read().targetColumns`). */
      targetOptions() { return targetList(ctx.source, TARGET_FILTER); },

      // ─── Auswahl und Parameter ─────────────────────────────
      /** Die Transformationen in Anzeigereihenfolge. */
      get transforms() { return TRANSFORMS; },
      /** @param {string} id @returns {string} Name */
      tfName(id) { return this.t(transformOf(id)?.nameKey ?? ''); },
      /** @param {string} id @returns {string} Beschreibung */
      tfDesc(id) { return this.t(transformOf(id)?.descKey ?? ''); },
      /** @param {string} id @returns {string} Klasse der Kachel; die gewählte ist hervorgehoben */
      tfOptClass(id) { return id === this.model.currentTF ? 'dt-tf-opt dt-tf-opt--active' : 'dt-tf-opt'; },
      /** @param {string} id @returns {boolean} ist `id` die wirksame Transformation? */
      isTF(id) { return this.effectiveTF === id; },
      /**
       * Das λ, mit dem gerechnet wird: gesetzt oder die Schätzung des letzten
       * Laufs; vor dem ersten Lauf die Vorgabe des Registers.
       * @param {'boxcox'|'yeojohnson'} tf @returns {number}
       */
      lambdaShown(tf) {
        const stored = this.model.params[tf].lambda;
        if (stored !== null) return stored;
        const r = /** @type {Result|null} */ (this.analysis);
        if (r && r.transform === tf && typeof r.params.lambda === 'number') return r.params.lambda;
        return transformOf(tf)?.params[0]?.default ?? 0;
      },
      /**
       * Platzhalter des Zahlfelds λ: die Schätzung, solange das Feld leer ist.
       * @param {'boxcox'|'yeojohnson'} tf @returns {string}
       */
      lambdaPlaceholder(tf) {
        return this.model.params[tf].lambda === null ? formatNumber(this.lambdaShown(tf), lang(), { profile: 'input' }) : '';
      },

      // ─── Ergebnisse ────────────────────────────────────────
      computed: {
        /** Original- und transformierte Werte des letzten Laufs; null ohne Ergebnis. */
        series() { return this.analysis ? kept : null; },
        /** Zeilen der Kennwert-Tabelle. */
        statRows() { return statRows(/** @type {Result|null} */ (this.analysis), lang(), this.t); },
        /** Normalitätszeilen vorher und nachher. */
        norm() {
          const r = /** @type {Result|null} */ (this.analysis);
          return r ? { orig: normRow(r.original, lang(), this.t), trans: normRow(r.transformed, lang(), this.t) } : null;
        },
        /** Text des Exportkastens (sechs Nachkommastellen, wie die Zwischenablage). */
        exportText() { return this.series ? exportText(this.series.transformed) : ''; },
        /** Die Fehlermeldung des Laufs, leer ohne Fehler. */
        errorText() { return this._asyncTasks.analysis.error ?? ''; },
        /** Box-Cox ist gewählt, gerechnet wird mit Yeo-Johnson. */
        fallbackActive() { return this.model.currentTF === 'boxcox' && this.effectiveTF === 'yeojohnson'; },
        /** Zielwähler: je Blatt seine Spalten und „neue Spalte“. */
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
        /** Histogramm der Originalwerte. */
        histOrigChart() { return this.series ? { data: this.series.original } : null; },
        /** Histogramm der transformierten Werte. */
        histTransChart() { return this.series ? { data: this.series.transformed } : null; },
        /** Normalverteilungsplot der Originalwerte. */
        ppOrigChart() { return this.series ? { data: this.series.original } : null; },
        /** Normalverteilungsplot der transformierten Werte. */
        ppTransChart() { return this.series ? { data: this.series.transformed } : null; },
      },

      get hasResults() { return this.series !== null; },
      get alphaLine() { return alphaLine(lang(), this.t); },
      /** @param {'original'|'transformed'} which @returns {string} Beschriftung einer Normalitätszeile */
      normLabel(which) { return `${this.t(which)}:`; },
      get legacyHistOrigKey() { return 'histogram'; },
      get legacyHistTransKey() { return 'histogram#2'; },
      get legacyPpOrigKey() { return 'probability-plot'; },
      get legacyPpTransKey() { return 'probability-plot#2'; },
      get targetPlaceholder() { return ctx.i18n.t('ui.columnPicker.placeholder'); },
      get newWorksheetLabel() { return `+ ${ctx.i18n.t('ui.columnPicker.newWorksheet')}`; },

      /**
       * Sendet die transformierten Werte an das gewählte Ziel und holt das
       * Arbeitsblatt nach vorn; ohne Wahl ein Hinweis. Der Agent startet den
       * Lauf selbst und wechselt die Ansicht nicht.
       * @returns {Promise<void>}
       */
      async sendToWorksheet() {
        const choice = this.state.target;
        if (!choice) {
          ctx.notify(this.t('selectTarget'));
          return;
        }
        const target = choice === NEW_WORKSHEET ? null : choice;
        // Inzwischen gelöscht: Hinweis statt der Prüfmeldung des Laufs.
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
