/**
 * D.Mike — Attribute Test Module (attribute-test.js)
 *
 * 1-proportion, 2-proportion and chi-square association tests on counts,
 * entered as summarized counts or taken from worksheet columns.
 * Pipeline: state → normalizer → engine (via report) → template.
 * @see docs/superpowers/specs/2026-10-10-attribute-tests-design.md
 *
 * @agent  Steuerbar über das Viewmodel: die Parameter (setParam), die vier
 *   Spaltenrollen (setColumn), die Kreuztabelle der Zusammenfassung
 *   (setTableCell, setTableRowName, setTableColName, addRow, addCol,
 *   removeRow, removeCol) und das Rechnen selbst. Gelesen wird über read()
 *   mit erklärter Lesefläche (AgentRead) — Konfiguration, die im Zustand
 *   gültigen Parameter und Rollen, wählbare Spalten und Ergebnis.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireEnum, requireKnownId, requireIndex, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { ColumnPicker, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { State, TEST_KINDS, INPUT_MODES, DIRECTIONS, MIN_DIM } from './attribute-test-model.js';
import {
  normalizeSummary, normalizeColumns, distinctValues, defaultEventValue, columnValuesOrNull,
} from './attribute-test-input.js';
import { buildReport } from './attribute-test-report.js';

const PICKERS = [
  { role: 'response', wrap: 'picker-response-wrap' },
  { role: 'group', wrap: 'picker-group-wrap' },
  { role: 'rowVar', wrap: 'picker-row-wrap' },
  { role: 'colVar', wrap: 'picker-col-wrap' },
];

/** Die zwei Werte eines Schalters; der Prüfer wandelt nie um (`Boolean('nein')` wäre `true`). */
const BOOL_VALUES = [true, false];

/** Die Parameter, die `setParam` annimmt (`summary.*` als Punkt-Schlüssel). */
const PARAM_KEYS = ['testKind', 'inputMode', 'alpha', 'direction', 'p0', 'pooled',
  'summary.x', 'summary.n', 'summary.x1', 'summary.n1', 'summary.x2', 'summary.n2', 'eventValue'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  testKind: (v) => { requireEnum('value', v, TEST_KINDS); return v; },
  inputMode: (v) => { requireEnum('value', v, INPUT_MODES); return v; },
  // Offener Bereich 0 < α < 1 (wie das Eingabefeld); `requireNumber` kennt nur geschlossene Grenzen.
  alpha: (v) => {
    const n = requireNumber('value', v);
    if (n <= 0 || n >= 1) {
      throw new Error(`invalid value ${JSON.stringify(v)}; allowed: a number between 0 and 1, exclusive`);
    }
    return n;
  },
  direction: (v) => { requireEnum('value', v, DIRECTIONS); return v; },
  p0: (v) => requireText('value', v),
  pooled: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  'summary.x': (v) => requireText('value', v),
  'summary.n': (v) => requireText('value', v),
  'summary.x1': (v) => requireText('value', v),
  'summary.n1': (v) => requireText('value', v),
  'summary.x2': (v) => requireText('value', v),
  'summary.n2': (v) => requireText('value', v),
  eventValue: (v) => v, // gegen eventValueOptions() geprüft, siehe setParam
};

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'summary.x'`) in `obj` ablegen.
 * Lokal geschrieben, weil der Generator (agent-data) Importe nicht liest und
 * die Schreibstelle im Modul selbst sehen muss.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/** Die Spaltenrollen in der Reihenfolge der Oberfläche, oben nach unten. */
const COLUMN_SLOTS = ['response', 'group', 'rowVar', 'colVar'];

/** Je Rolle die Optionen ihres Wählers (kein Typfilter, mindestens zwei Werte). */
const SLOT_FILTERS = {
  response: { minCount: 2 },
  group: { minCount: 2 },
  rowVar: { minCount: 2 },
  colVar: { minCount: 2 },
};

/** Je Rolle die eine Zuweisungsstelle ihres Model-Feldes. */
const COLUMN_SINKS = {
  response: (m, ref) => { m.colRefs.response = ref; },
  group: (m, ref) => { m.colRefs.group = ref; },
  rowVar: (m, ref) => { m.colRefs.rowVar = ref; },
  colVar: (m, ref) => { m.colRefs.colVar = ref; },
};

/** Beschriftungsschlüssel der Richtungsauswahl. */
const DIRECTION_LABEL_KEYS = { 'two-sided': 'dirTwoSided', greater: 'dirGreater', less: 'dirLess' };

/**
 * Die Agenten-Lesefläche des Attribut-Tests.
 *
 * Nicht die persistierte Form: ohne die interne Beispiel-Buchführung
 * (`exampleWorksheetId`), dafür mit den im Zustand gültigen Mengen und dem
 * transienten Ergebnis.
 *
 * @typedef {object} AgentRead
 * @property {'one'|'two'|'assoc'} testKind  the kind of test
 * @property {'summary'|'columns'} inputMode  where the counts come from
 * @property {'two-sided'|'greater'|'less'} direction  the alternative hypothesis
 * @property {number|null} alpha  the significance level
 * @property {string} p0  the hypothesized proportion as entered
 * @property {boolean} pooled  pooled standard error for the 2-proportion z statistic
 * @property {object} summary  the summarized counts as entered: x, n, x1, n1, x2, n2 and the cross table `{ rows, cols, counts }`
 * @property {object} colRefs  the chosen column per role (response, group, rowVar, colVar), each `{ instanceId, sheetId, columnId }` or null
 * @property {string|null} eventValue  the value of the response column that counts as event
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {string[]} eventValueOptions  the values `setParam('eventValue', …)` accepts
 * @property {object|null} result  the test report, or null while the inputs are incomplete or invalid
 * @property {string} errorMsg  the reason there is no result (input hint or refusal), or an empty string
 */

const mod = createModule({
  config: {
    id: 'attribute-test',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.attribute-test',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ────────────────────
      result: null,
      eventOptions: [],
      _pickers: {},
      _unsubs: [],

      // ── Template helpers (no ?. in the template) ───────────────
      // All of these are view transforms; the agent reads the state via read().
      /** @noagent view transform */
      isKind(k) { return this.model.testKind === k; },
      /** @noagent view transform */
      isMode(m) { return this.model.inputMode === m; },
      /** @noagent view transform */
      hasResult() { return !!(this.result && !this.result.error); },
      /** @noagent view transform */
      message() { return this.result && this.result.error ? _t(this.result.error) : ''; },
      /** @noagent view transform */
      isHint() { return !!(this.result && this.result.hint); },
      /** @noagent view transform */
      stats() { return this.hasResult() ? this.result.stats : []; },
      /** @noagent view transform */
      notes() { return this.hasResult() ? this.result.notes : []; },
      /** @noagent view transform */
      statLabel(s) { return _t(s.labelKey, s.params || {}); },
      /** @noagent view transform */
      noteText(n) { return _t(n.key, n.params || {}); },
      /** @noagent view transform */
      hasTable() { return this.hasResult() && !!this.result.table; },
      /** @noagent view transform */
      tableCols() { return this.hasTable() ? this.result.table.cols : []; },
      /** @noagent view transform */
      tableRows() { return this.hasTable() ? this.result.table.rows : []; },
      /** @noagent view transform */
      decisionText() {
        if (!this.hasResult()) return '';
        return _t(this.result.decision === 'reject' ? 'decisionReject' : 'decisionKeep',
          { alpha: this.model.alpha });
      },
      /** @noagent view transform */
      decisionClass() {
        return this.hasResult() && this.result.decision === 'reject'
          ? 'attrtest__decision--reject' : 'attrtest__decision--keep';
      },
      /** @noagent view transform */
      basisText() { return this.hasResult() ? _t(this.result.basisKey) : ''; },
      /** @noagent view transform */
      hypotheses() {
        const d = this.model.direction;
        const op = d === 'two-sided' ? '≠' : d === 'greater' ? '>' : '<';
        if (this.model.testKind === 'one') return [_t('h0One'), _t('h1One', { op })];
        if (this.model.testKind === 'two') return [_t('h0Two'), _t('h1Two', { op })];
        return [_t('h0Assoc'), _t('h1Assoc')];
      },
      /** @noagent view transform */
      is2x2() {
        return this.hasTable() && this.tableCols().length === 2 && this.tableRows().length === 2;
      },
      /** @noagent view transform */
      showDirection() { return !this.isKind('assoc') || this.is2x2(); },
      /** @noagent view transform */
      cellValue(i, j) { return this.model.summary.table.counts[i][j]; },
      /** @noagent view transform */
      tableRowIdx() { return this.model.summary.table.rows.map((_, i) => i); },
      /** @noagent view transform */
      tableColIdx() { return this.model.summary.table.cols.map((_, j) => j); },
      /** @noagent view transform */
      rowName(i) { return this.model.summary.table.rows[i]; },
      /** @noagent view transform */
      colName(j) { return this.model.summary.table.cols[j]; },
      /** @noagent view transform */
      showEvent() { return this.isMode('columns') && !this.isKind('assoc'); },
      /** @noagent view transform */
      isEvent(v) { return v === this.model.eventValue; },

      // ── Agent surface ──────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, gültige Mengen, wählbare Spalten und Ergebnis
       */
      read(options) {
        // exampleWorksheetId ist Buchführung des Beispiel-Ladens, kein Lesefeld.
        const state = this.model.toJSON();
        delete state.exampleWorksheetId;
        return readAgentState('attribute-test', {
          ...state,
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          eventValueOptions: this.eventValueOptions(),
          result: this.hasResult() ? this.result : null,
          errorMsg: this.hasResult() ? '' : (this.result?.error ? this.message() : ''),
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        const params = ['testKind', 'inputMode', 'alpha'];
        const summary = this.isMode('summary');
        if (this.isKind('one')) {
          params.push(...(summary ? ['summary.x', 'summary.n'] : ['eventValue']), 'p0');
        } else if (this.isKind('two')) {
          params.push(...(summary ? ['summary.x1', 'summary.n1', 'summary.x2', 'summary.n2'] : ['eventValue']));
        }
        if (this.showDirection()) params.push('direction');
        if (this.isKind('two')) params.push('pooled');
        return params;
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        if (!this.isMode('columns')) return [];
        if (this.isKind('one')) return ['response'];
        if (this.isKind('two')) return ['response', 'group'];
        return ['rowVar', 'colVar'];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot =>
          [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent derived set; der Agent liest sie über read().eventValueOptions */
      eventValueOptions() { return [...this.eventOptions]; },

      /** @noagent view transform; die Richtungsauswahl rendert aus DIRECTIONS */
      directionOptions() {
        return DIRECTIONS.map(v => ({ value: v, label: _t(DIRECTION_LABEL_KEYS[v]) }));
      },

      /** @noagent view transform; ob ein Eintrag der Richtungsauswahl gewählt ist */
      isDirection(v) { return this.model.direction === v; },

      /**
       * Einen Parameter setzen; die Analyse läuft danach neu.
       * @agent
       * @param {'testKind'|'inputMode'|'alpha'|'direction'|'p0'|'pooled'|'summary.x'|'summary.n'|'summary.x1'|'summary.n1'|'summary.x2'|'summary.n2'|'eventValue'} key welcher Parameter
       * @param {string|number|boolean} value der Wert; Typ und Bereich je Schlüssel
       * @returns {void}
       * @throws {Error} wenn `key` kein Parameter dieses Moduls oder im Zustand nicht gültig ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        const clean = PARAM_CHECKS[key](value);
        if (key === 'eventValue') requireEnum('value', clean, this.eventValueOptions());
        setAtPath(this.model, key, clean);
        if (key === 'testKind' || key === 'inputMode') {
          // Die Wähler hängen an Elementen, die der Wechsel neu aufbaut.
          this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });
        }
        this.runAnalysis();
      },

      /**
       * Eine Spalte einer Rolle zuweisen; die Analyse läuft danach neu.
       * @agent
       * @param {'response'|'group'|'rowVar'|'colVar'} slot die Rolle; activeColumnSlots nennt die im Zustand gültigen
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._pickers[slot]?.syncValue(null);
          this.runAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._pickers[slot]?.syncValue(clean);
        this.runAnalysis();
      },

      /**
       * Eine Zelle der Kreuztabelle setzen (Zusammenfassung, Zusammenhang).
       * Die Tabelle gilt nur bei der Testart assoc mit Eingabe über Zusammenfassung.
       * @agent
       * @param {number} row Zeilenindex, 0 ist die erste Zeile
       * @param {number} col Spaltenindex, 0 ist die erste Spalte
       * @param {string} value die Anzahl als Text, '' leert die Zelle
       * @returns {void}
       * @throws {Error} wenn ein Index außerhalb der Tabelle liegt oder `value` kein Text ist
       */
      setTableCell(row, col, value) {
        const t = this.model.summary.table;
        requireIndex('row', row, t.rows.length - 1);
        requireIndex('col', col, t.cols.length - 1);
        this.model.summary.table.counts[row][col] = requireText('value', value);
        this.runAnalysis();
      },

      /**
       * Den Namen einer Zeile der Kreuztabelle setzen.
       * @agent
       * @param {number} row Zeilenindex, 0 ist die erste Zeile
       * @param {string} name der Name, '' leert ihn
       * @returns {void}
       * @throws {Error} wenn der Index außerhalb der Tabelle liegt oder `name` kein Text ist
       */
      setTableRowName(row, name) {
        const t = this.model.summary.table;
        requireIndex('row', row, t.rows.length - 1);
        this.model.summary.table.rows[row] = requireText('name', name);
        this.runAnalysis();
      },

      /**
       * Den Namen einer Spalte der Kreuztabelle setzen.
       * @agent
       * @param {number} col Spaltenindex, 0 ist die erste Spalte
       * @param {string} name der Name, '' leert ihn
       * @returns {void}
       * @throws {Error} wenn der Index außerhalb der Tabelle liegt oder `name` kein Text ist
       */
      setTableColName(col, name) {
        const t = this.model.summary.table;
        requireIndex('col', col, t.cols.length - 1);
        this.model.summary.table.cols[col] = requireText('name', name);
        this.runAnalysis();
      },

      /**
       * Eine Zeile ans Ende der Kreuztabelle hängen; die Zählwerte sind leer.
       * @agent
       * @returns {void}
       */
      addRow() { this.model.addRow(); this.runAnalysis(); },

      /**
       * Eine Spalte ans Ende der Kreuztabelle hängen; die Zählwerte sind leer.
       * @agent
       * @returns {void}
       */
      addCol() { this.model.addCol(); this.runAnalysis(); },

      /**
       * Eine Zeile der Kreuztabelle entfernen.
       * @agent
       * @param {number} row Zeilenindex, 0 ist die erste Zeile
       * @returns {void}
       * @throws {Error} wenn der Index außerhalb der Tabelle liegt oder nur noch zwei Zeilen bleiben
       */
      removeRow(row) {
        const t = this.model.summary.table;
        requireIndex('row', row, t.rows.length - 1);
        if (!this.canRemoveRow()) {
          throw new Error(`invalid row ${row}; allowed: removing only while more than ${MIN_DIM} rows remain`);
        }
        this.model.removeRow(row);
        this.runAnalysis();
      },

      /**
       * Eine Spalte der Kreuztabelle entfernen.
       * @agent
       * @param {number} col Spaltenindex, 0 ist die erste Spalte
       * @returns {void}
       * @throws {Error} wenn der Index außerhalb der Tabelle liegt oder nur noch zwei Spalten bleiben
       */
      removeCol(col) {
        const t = this.model.summary.table;
        requireIndex('col', col, t.cols.length - 1);
        if (!this.canRemoveCol()) {
          throw new Error(`invalid col ${col}; allowed: removing only while more than ${MIN_DIM} columns remain`);
        }
        this.model.removeCol(col);
        this.runAnalysis();
      },

      // ── Input handlers (DOM) ───────────────────────────────────

      /** @noagent DOM event handler; the agent uses setParam() */
      setKind(k) { this.setParam('testKind', k); },
      /** @noagent DOM event handler; the agent uses setParam() */
      setMode(m) { this.setParam('inputMode', m); },
      /** @noagent DOM event handler; the agent uses setParam() */
      onTextInput(key, event) { this.setParam(key, event.target.value); },
      /** @noagent DOM event handler; the agent uses setParam() */
      onDirectionChange(event) { this.setParam('direction', event.target.value); },
      /** @noagent DOM event handler; the agent uses setParam() */
      onPooledChange(event) { this.setParam('pooled', event.target.checked); },
      /**
       * Alpha-Feld: ein Komma gilt als Dezimaltrenner; bei einem unzulässigen
       * Wert springt das Feld auf den Wert des Models zurück.
       * @noagent DOM event handler; the agent uses setParam()
       */
      onAlphaInput(event) {
        const raw = String(event.target.value).replace(',', '.');
        try {
          PARAM_CHECKS.alpha(raw);
        } catch {
          event.target.value = this.model.alpha; // invalid: re-sync the field to the active α
          return;
        }
        this.setParam('alpha', raw);
      },
      /** @noagent DOM event handler; the agent uses setTableCell() */
      setCell(i, j, event) { this.setTableCell(i, j, event.target.value); },
      /** @noagent DOM event handler; the agent uses setTableRowName() */
      setRowName(i, event) { this.setTableRowName(i, event.target.value); },
      /** @noagent DOM event handler; the agent uses setTableColName() */
      setColName(j, event) { this.setTableColName(j, event.target.value); },
      /** @noagent view transform; ob eine Zeile entfernt werden darf */
      canRemoveRow() { return this.model.summary.table.rows.length > MIN_DIM; },
      /** @noagent view transform; ob eine Spalte entfernt werden darf */
      canRemoveCol() { return this.model.summary.table.cols.length > MIN_DIM; },
      /** @noagent DOM event handler; the agent uses removeRow() */
      onRemoveRow(i) { if (this.canRemoveRow()) this.removeRow(i); },
      /** @noagent DOM event handler; the agent uses removeCol() */
      onRemoveCol(j) { if (this.canRemoveCol()) this.removeCol(j); },
      /** @noagent DOM event handler; the agent uses setParam() */
      onEventChange(event) { this.setParam('eventValue', event.target.value); },

      // ── Analysis ───────────────────────────────────────────────
      _values(ref) {
        return columnValuesOrNull(module._context.stateManager, ref);
      },
      /**
       * Das Ergebnis aus den aktuellen Eingaben neu rechnen. Fehlen Eingaben
       * oder sind sie ungültig, bleibt `result` ohne Bericht und `errorMsg`
       * nennt den Grund; das ist keine Absage der Aktion.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        const m = this.model;
        if (m.alpha == null) this._seedAlpha();
        if (m.inputMode === 'columns') {
          const cols = {
            response: this._values(m.colRefs.response),
            group: this._values(m.colRefs.group),
            rowVar: this._values(m.colRefs.rowVar),
            colVar: this._values(m.colRefs.colVar),
          };
          this.eventOptions = cols.response ? distinctValues(cols.response) : [];
          if (this.eventOptions.length && !this.eventOptions.includes(m.eventValue)) {
            m.eventValue = defaultEventValue(cols.response);
          }
          this.result = buildReport(m, normalizeColumns(m, cols));
        } else {
          this.result = buildReport(m, normalizeSummary(m));
        }
      },

      // ── ColumnPickers (imperative widgets) ─────────────────────
      _remountPickers() {
        this._disposePickers();
        const ctx = module._context;
        const c = module._container;
        for (const { role, wrap } of PICKERS) {
          const el = c.querySelector(`[data-ref="${wrap}"]`);
          if (!el) continue;
          const picker = new ColumnPicker(el, ctx, {
            mode: 'single',
            ...SLOT_FILTERS[role],
            onChange: (ref) => { this.setColumn(role, ref); },
          });
          if (this.model.colRefs[role]) picker.value = this.model.colRefs[role];
          this._pickers[role] = picker;
        }
      },
      _disposePickers() {
        for (const p of Object.values(this._pickers)) p.destroy();
        this._pickers = {};
      },

      // ── Lifecycle ──────────────────────────────────────────────
      _seedAlpha() {
        const sm = module._context.stateManager;
        const globalConf = (sm.get('settings.confidenceLevel') ?? 95) / 100;
        this.model.alpha = Number((1 - globalConf).toFixed(4));
      },
      /** @noagent lifecycle */
      init() {
        this._unsubs = [];
        if (this.model.alpha == null) this._seedAlpha();

        // Every change of the persisted state re-runs the analysis. runAnalysis
        // only writes `eventValue` when it changes, so this settles in one pass.
        this.$watch(() => this.model.toJSON(), () => this.runAnalysis());

        this.$nextTick(() => { this._remountPickers(); this.runAnalysis(); });

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId !== module._context.instanceId) return;
          for (const p of Object.values(this._pickers)) p.refresh();
          this.runAnalysis();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        this.runAnalysis();
      },
      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._disposePickers();
      },
    };
  },
});

/**
 * Custom loadExample: column examples ship a worksheet and use the
 * placeholder `__source__` as `instanceId` in `colRefs`. Summary examples
 * carry no worksheet and are applied as plain state.
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      const rewrite = (r) => (r && r.instanceId === '__source__' ? { ...r, instanceId } : r);
      const refs = data.colRefs || {};
      return {
        ...data,
        colRefs: Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, rewrite(r)])),
      };
    },
  });
};

export default mod;
