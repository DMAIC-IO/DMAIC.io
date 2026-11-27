/**
 * D.Mike — Kano: Viewmodel.
 *
 * Quelle, Merkmale, Befragte, Antworten, Kommandos und Invarianten liegen im
 * Model (domain/model.js), die Auswertung ist dessen Ableitung `evaluation`;
 * die Agentenfläche entsteht aus dem Schema. Hier bleiben:
 *  - das Lesen der VoC→CTx-Bäume über `ctx.instances` (in `init`, bei
 *    `module:added`/`module:removed` und bei `data:changed` eines bekannten
 *    Baums) in den UI-State `trees`, daraus die wirksame Verknüpfung
 *    (`effectiveSourceId`, Heilung beim Lesen), das offene Diff und die
 *    Statuszeile;
 *  - der Lauf `applySync`, der den Baum frisch liest und `syncItems` ruft;
 *  - die Handler der Auswahlfelder (Baum, Ebene mit Rückfrage, Antworten)
 *    und das Umbenennen eines Reiters;
 *  - die Anzeige in der App-Sprache und die Konfiguration des Diagramms.
 * Exporte: die Ergebnistabelle (CSV, XLSX) und das Diagramm (PNG, SVG).
 */
import { createModule } from '../../../core/template-module.js';
import { runUiCommand } from '../../../core/command-directives.js';
import { asyncTask } from '../../../core/async-task.js';
import { formatNumber } from '../../../core/number-format.js';
import { applyEdits, ownedKeys } from '../../../widgets/chart-edits.js';
import scatterChart from '../../../widgets/scatter-chart/schema.js';
import { toChart } from '../../../widgets/scatter-chart/mount.js';
import { Q_WARN } from '../../../engines/kano-engine.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { diff, flatten, effectiveSourceId } from '../domain/link.js';
import { kanoScatterConfig, exportSized } from '../domain/chart.js';
import { toRows } from '../io/table.js';
import { UiState } from './state.js';
import { beforeLoadExample } from './example.js';

/** @typedef {import('../domain/evaluate.js').KanoEvaluation} KanoEvaluation */
/** @typedef {import('../domain/evaluate.js').KanoRow} KanoRow */
/** @typedef {{ instanceId: string, name: string, vocs: any[] }} TreeEntry */

/** Blattname der XLSX-Datei (wie die Altform, sprachunabhängig). */
const XLSX_SHEET = 'Kano';

/** Auswertung ohne Merkmale (auch wenn die Ableitung scheitert). */
const EMPTY = Object.freeze({
  rows: [],
  totals: Object.freeze({ items: 0, respondents: 0, completeness: 0, qShare: 0 }),
});

/**
 * Ein Baum der Leseform als Eintrag der Auswahl: Name ist der Text der
 * ersten Kundenstimme, sonst die Instanz.
 * @param {string} instanceId @param {any} read @returns {TreeEntry}
 */
function treeEntry(instanceId, read) {
  const vocs = Array.isArray(read?.vocs) ? read.vocs : [];
  return { instanceId, name: vocs[0]?.text || instanceId, vocs };
}

/**
 * Die wirksame Baum-Instanz des Viewmodels.
 * @param {any} vm @returns {string|null}
 */
const sourceOf = (vm) => effectiveSourceId({
  stored: vm.model.source.instanceId,
  treeIds: vm.state.trees.map((/** @type {TreeEntry} */ t) => t.instanceId),
  itemsEmpty: vm.model.items.length === 0,
  unlinked: vm.state.unlinked,
});

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  beforeLoadExample,
  /** @type {import('./state.types.js').KanoExports} */
  exports: {
    fileName: 'kano',
    table() { return toRows(this.model, this.t); },
    /** XLSX mit dem Blattnamen der Altform; ohne Merkmale keine Datei. */
    tables() {
      const rows = toRows(this.model, this.t);
      return rows === null ? null : { [XLSX_SHEET]: rows };
    },
    /** Das Diagramm in der Größe des Editors, sonst in der Bildschirmgröße (wie die Altform). */
    image() {
      const cfg = this.chart;
      if (!cfg) return null;
      const edits = this.model.scatterEdits ?? {};
      const rect = /** @type {HTMLElement|null} */ (this.$root?.querySelector('[data-ref="chart"] .dmike-chart-svg-wrap'))?.getBoundingClientRect();
      const screen = rect ? { w: rect.width, h: rect.height } : null;
      return this.chartSVG('scatter', toChart(exportSized(applyEdits(cfg, edits, scatterChart.editable, ownedKeys(cfg)), screen)));
    },
  },
  asyncTasks: {
    applySync: asyncTask({
      /** @returns {string|null} der Grund, warum nicht übernommen werden kann */
      blocked() {
        if (this.hasNoTree) return this.t('sourceNone');
        if (this.sourceId === null) return this.t('syncDetached');
        if (this.activeTree === null) return this.t('sourceHint.unknownTree');
        if (!this.hasPending) return this.t('syncClean');
        return null;
      },
      /**
       * Den verknüpften Baum frisch lesen und die Merkmale der eingestellten
       * Ebene übernehmen (ein Verlaufsschritt).
       * @returns {Promise<number>} die Zahl der Merkmale
       */
      async run() {
        const instanceId = /** @type {string} */ (sourceOf(this));
        const level = this.model.source.level;
        const model = this.model;
        const instances = this._ui.services.instances;
        const read = await instances.read(instanceId, { fields: ['vocs'] });
        const entry = treeEntry(instanceId, read);
        const at = this.state.trees.findIndex((/** @type {TreeEntry} */ t) => t.instanceId === instanceId);
        if (at !== -1) this.state.trees.splice(at, 1, entry);
        return model.syncItems({ instanceId, candidates: flatten(entry, level) });
      },
    }),
  },
  /** @type {import('./state.types.js').KanoViewFn} */
  view(ctx) {
    /** Zähler der Lesevorgänge: ein älterer überschreibt keinen neueren, nach `destroy` keiner. */
    let readSeq = 0;
    /** @type {(() => void)|null} */
    let onModules = null;
    /** @type {((payload: unknown) => void)|null} */
    let onData = null;
    const lang = () => ctx.i18n.getLanguage();
    return {
      init() {
        this.loadTrees();
        onModules = () => this.loadTrees();
        onData = (payload) => {
          if (typeof payload !== 'string' || !payload.startsWith('module:')) return;
          const id = payload.slice('module:'.length).replace(/:removed$/, '');
          if (this.state.trees.some((/** @type {TreeEntry} */ t) => t.instanceId === id)) this.loadTrees();
        };
        ctx.eventBus.on('module:added', onModules);
        ctx.eventBus.on('module:removed', onModules);
        ctx.eventBus.on('data:changed', onData);
      },
      destroy() {
        if (onModules) {
          ctx.eventBus.off('module:added', onModules);
          ctx.eventBus.off('module:removed', onModules);
        }
        if (onData) ctx.eventBus.off('data:changed', onData);
        onModules = null;
        onData = null;
        readSeq += 1;
      },

      // ─── Bäume ─────────────────────────────────────────────
      /**
       * Die VoC→CTx-Bäume des Projekts lesen; ein Baum, der sich nicht lesen
       * lässt, entfällt aus der Auswahl.
       * @returns {Promise<void>}
       */
      async loadTrees() {
        const seq = ++readSeq;
        const list = ctx.instances.list({ modules: ['voc-ctx-tree'] });
        const reads = await Promise.all(list.map((inst) => ctx.instances.read(inst.instanceId, { fields: ['vocs'] })
          .then((r) => treeEntry(inst.instanceId, r))
          .catch((err) => { console.warn('[kano] reading voc-ctx-tree failed', inst.instanceId, err); return null; })));
        if (seq !== readSeq) return;
        this.state.trees = reads.filter((r) => r !== null);
      },
      /** Kein Baum im Projekt. */
      get hasNoTree() { return this.state.trees.length === 0; },
      /** Die wirksame Baum-Instanz: gespeichert oder der einzige Baum. @returns {string|null} */
      get sourceId() { return sourceOf(this); },
      /** Der verknüpfte Baum aus dem letzten Lesen, sonst `null`. @returns {TreeEntry|null} */
      get activeTree() {
        const id = this.sourceId;
        return id === null ? null : (this.state.trees.find((/** @type {TreeEntry} */ t) => t.instanceId === id) ?? null);
      },
      /** @param {TreeEntry} tr @returns {string} Name des Baums in der Auswahl */
      treeLabel(tr) { return tr.name; },
      /** @param {string} id @returns {boolean} der Baum ist verknüpft */
      isTreeSelected(id) { return id === this.sourceId; },
      /** Keine Verknüpfung. */
      get noTreeSelected() { return this.sourceId === null; },
      /**
       * Baumwahl: „keine“ löst die Verknüpfung bewusst (die Heilung auf den
       * einzigen Baum greift dann nicht mehr).
       * @param {Event} event
       */
      changeTree(event) {
        const value = /** @type {HTMLSelectElement} */ (event.target).value || null;
        this.state.unlinked = value === null;
        this.model.setSourceTree({ instanceId: value });
      },

      // ─── Ebene ─────────────────────────────────────────────
      /**
       * Ebenenwahl über das Kommando (es fragt bei erfassten Antworten nach);
       * bei Abbruch oder Ablehnung zeigt das Feld wieder die gespeicherte Ebene.
       * @param {Event} event
       * @returns {Promise<void>}
       */
      async levelChanged(event) {
        const el = /** @type {HTMLSelectElement} */ (event.target);
        const level = /** @type {'need'|'driver'|'req'} */ (el.value);
        const r = await runUiCommand(this._ui, 'setSourceLevel', { level });
        if (!r.ok) {
          if ('error' in r) {
            console.warn('[kano] setSourceLevel', r.error);
            ctx.notify?.(ctx.i18n.t('common.inputRejectedPlain'), 'error');
          }
          el.value = this.model.source.level;
        }
      },

      // ─── Übernahme ─────────────────────────────────────────
      /** Offenes Diff gegen den verknüpften Baum (Zahlen). @returns {{ added: number, renamed: number, missing: number }} */
      get pending() {
        const tree = this.activeTree;
        if (!tree) return { added: 0, renamed: 0, missing: 0 };
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        return { added: d.added.length, renamed: d.renamed.length, missing: d.missing.length };
      },
      /** Es gibt etwas zu übernehmen. */
      get hasPending() {
        const p = this.pending;
        return p.added + p.renamed + p.missing > 0;
      },
      /** Merkmale ohne Baumbezug. */
      get isDetached() { return this.sourceId === null && this.model.items.length > 0; },
      /** Die Statuszeile unter dem Übernahmeknopf. */
      get syncStatus() {
        if (this.isDetached) return this.t('syncDetached');
        if (this.sourceId === null) return '';
        // Verknüpfter Baum gelöscht: dieselbe Begründung wie am gesperrten Knopf.
        if (!this.activeTree) return this.t('sourceHint.unknownTree');
        if (!this.hasPending) return this.t('syncClean');
        return this.t('syncPending', this.pending);
      },

      // ─── Befragte ──────────────────────────────────────────
      /** Vorgabename der nächsten Befragten, z. B. „Befragte:r 3“. */
      get nextRespondentName() { return this.t('respondentDefault', { n: this.model.respondents.length + 1 }); },
      /** @param {string} id @returns {string} Klasse des Reiters */
      tabClass(id) { return id === this.model.activeRespondentId ? 'dmike-tab--active' : ''; },
      /** @param {string} id @returns {boolean} der Reitername wird gerade bearbeitet */
      isRenaming(id) { return this.state.renamingRespondentId === id; },
      /** @param {string} name @returns {string} Tooltip des Reiters mit Umbenennhinweis */
      respondentRenameTitle(name) { return `${name} — ${this.t('respondentRenameHint')}`; },
      /**
       * Das Umbenennen eines Reiters beginnen (Doppelklick).
       * @param {string} id
       */
      startRename(id) {
        const r = this.model.respondents.find((x) => x.id === id);
        if (!r) return;
        this.state.renamingRespondentId = id;
        this.state.renameDraft = r.name;
        this.$nextTick(() => {
          const input = /** @type {HTMLInputElement|null} */ (this.$root.querySelector('.kano__tab-rename-input'));
          if (input) { input.focus(); input.select(); }
        });
      },
      /**
       * Den Entwurf übernehmen; ein leerer Entwurf lässt den alten Namen
       * stehen, eine inzwischen gelöschte Befragte ist nichts zu tun.
       */
      commitRename() {
        const id = this.state.renamingRespondentId;
        if (id === null) return;
        const name = this.state.renameDraft;
        this.state.renamingRespondentId = null;
        this.state.renameDraft = '';
        if (!this.model.respondents.some((r) => r.id === id)) return;
        if (name.trim() === '') return;
        try {
          this.model.renameRespondent({ id, name });
        } catch (err) {
          console.warn('[kano] renameRespondent', err);
        }
      },
      /**
       * Tasten im Namensfeld: Enter übernimmt, Esc verwirft; Pfeiltasten
       * bewegen den Reiterfokus nicht.
       * @param {KeyboardEvent} event
       */
      onRenameKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          /** @type {HTMLElement} */ (event.target).blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.state.renamingRespondentId = null;
          this.state.renameDraft = '';
        }
        event.stopPropagation();
      },

      // ─── Erfassung ─────────────────────────────────────────
      /** Erfassen ist möglich: Merkmale und eine angezeigte Befragte. */
      get canCapture() { return this.model.items.length > 0 && this.model.activeRespondentId !== null; },
      /** Hinweis „keine Merkmale“. */
      get showCaptureEmpty() { return this.model.items.length === 0; },
      /** Hinweis „keine Befragte“. */
      get showNoRespondent() { return this.model.items.length > 0 && this.model.activeRespondentId === null; },
      /**
       * Wert eines Antwortfelds der angezeigten Befragten für das Auswahlfeld.
       * @param {string} itemId @param {'f'|'d'|'w'} field @returns {string} `''` ohne Antwort
       */
      answerValue(itemId, field) {
        const rid = this.model.activeRespondentId;
        const v = rid === null ? null : (this.model.answers[rid]?.[itemId]?.[field] ?? null);
        return v === null ? '' : String(v);
      },
      /**
       * Antwort aus dem Auswahlfeld setzen; eine Ablehnung setzt das Feld zurück.
       * @param {string} itemId @param {'f'|'d'|'w'} field @param {Event} event
       */
      answerChanged(itemId, field, event) {
        const el = /** @type {HTMLSelectElement} */ (event.target);
        const respondentId = this.model.activeRespondentId;
        if (respondentId === null) return;
        try {
          this.model.setAnswer({ respondentId, itemId, field, value: el.value === '' ? null : Number(el.value) });
        } catch (err) {
          console.warn('[kano] setAnswer', err);
          el.value = this.answerValue(itemId, field);
        }
      },
      /** @param {{ missing: boolean }} item @returns {string} Zeilenklasse: Merkmal fehlt im Baum */
      itemRowClass(item) { return item.missing ? 'kano__row--missing' : ''; },

      // ─── Auswertung ────────────────────────────────────────
      /** Die Auswertung; ohne Ergebnis die leere. @returns {KanoEvaluation} */
      get result() {
        const e = /** @type {any} */ (this.evaluation);
        return e && !e.error ? e : /** @type {any} */ (EMPTY);
      },
      /** @param {string|null} cat @returns {string} Kategoriename, `—` ohne Kategorie */
      catLabel(cat) { return cat ? this.t(`cat${cat}`) : '—'; },
      /** @param {number|null} v @param {number} dec @returns {string} Zahl mit fester Stellenzahl, `—` ohne Wert */
      fmt(v, dec) { return v === null || v === undefined ? '—' : formatNumber(v, lang(), { decimals: dec }); },
      /** @param {number} v Anteil @returns {string} ganze Prozent („75 %“) */
      pct(v) { return `${formatNumber(Math.round((v || 0) * 100) || 0, lang())} %`; },
      /** Die Kennzahl Merkmale. */
      get kpiItems() { return String(this.result.totals.items); },
      /** Die Kennzahl Befragte. */
      get kpiRespondents() { return String(this.result.totals.respondents); },
      /** Die Kennzahl Vollständigkeit. */
      get kpiCompleteness() { return this.pct(this.result.totals.completeness); },
      /** Die Kennzahl Anteil widersprüchlich. */
      get kpiQShare() { return this.pct(this.result.totals.qShare); },
      /** Der Anteil widersprüchlicher Antworten ist insgesamt zu hoch. */
      get qWarn() { return this.result.totals.qShare > Q_WARN; },
      /** Warntext mit eingesetztem Anteil. */
      get qWarnText() { return this.t('warnQShare', { share: this.pct(this.result.totals.qShare) }); },
      /** @param {KanoRow} row @returns {boolean} das Merkmal hat zu viele widersprüchliche Antworten */
      rowQWarn(row) { return row.n > 0 && row.counts.Q / row.n > Q_WARN; },
      /** @param {KanoRow} row @returns {string} Zeilenklasse der Ergebnistabelle */
      resultRowClass(row) { return this.rowQWarn(row) ? 'kano__row--warn' : ''; },

      // ─── Diagramm ──────────────────────────────────────────
      /** Das Better/Worse-Diagramm; ohne Punkte `null`. */
      get chart() {
        const { series, moduleRefLines } = kanoScatterConfig(this.result.rows, {
          importance: this.model.options.importance,
          sizeLabel: this.t('colImportanceMean'),
        });
        if (series.length === 0) return null;
        return {
          xLabel: this.t('chartX'),
          yLabel: this.t('chartY'),
          showLegend: false,
          fileName: 'kano',
          series,
          moduleRefLines,
        };
      },
    };
  },
});
