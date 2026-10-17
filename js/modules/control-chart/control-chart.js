/**
 * D.Mike — Control Chart Module (control-chart.js)
 * Control phase: SPC control charts (I-MR, X̄-R, X̄-S).
 *
 * Migrated to createModule + Alpine CSP. The Model (control-chart-model.js)
 * holds only persistence state + thin helpers; all heavy computation
 * (limits, Nelson rules, capability) is delegated to the unchanged engine
 * (engines/control-chart-engine.js). The analysis RESULT is derived
 * transiently in the view from the live worksheet column + model inputs.
 *
 * Imperative widgets (mounted in init(), disposed in destroy()):
 *   - the shared ColumnPicker ('single' mode) into [data-ref="col-picker-wrap"]
 *   - one chartManager 'control-chart' per subchart into the templated
 *     [data-chart-host] hosts (chart-section headers are declarative)
 *
 * POM-byte-parity output (stats bar, chart-section headers, violation rows)
 * is rendered declaratively via the Alpine template (x-text escapes); the
 * charts mount imperatively into the x-for hosts. The annotation dialog is
 * declarative too.
 *
 * @agent  Steuerbar über das Viewmodel: Messreihe (setColumn), Kartentyp,
 *   Untergruppe, Phase I, Stufen, Spezifikationsgrenzen, Regeln (setParam),
 *   Anmerkungen und Ausschlüsse (setAnnotation), Phase II (setPhase2), neu
 *   rechnen (runAnalysis). Gelesen wird über read() mit erklärter Lesefläche
 *   (AgentRead) — Eingaben, Grenzen je Teilkarte, Fähigkeit,
 *   Regelverletzungen und je Punkt Wert und Grenzen.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './control-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef,
} from '../../ui/column-picker.js';
import {
  getChartType, NELSON_RULES, CHART_TYPES,
  evaluateNelsonRules, secondaryChartRules, computeCapability, capabilitySigma,
} from '../../engines/control-chart-engine.js';
import {
  csvPayloadToWorksheetState, loadExampleViaWorksheet,
} from '../../core/examples-registry.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireIndex, requireKnownId, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { finiteOrNull, zipPoints } from '../../core/agent/agent-results.js';

/** Auto-run debounce (ms) — matches legacy behaviour. */
const AUTORUN_DELAY = 120;

/** Die Spalten-Slots: genau einer, die Messreihe. */
const COLUMN_SLOTS = ['value'];

/** Je Slot der Filter seines Wählers — eine Quelle für Wähler und Lesefläche. */
const SLOT_FILTERS = { value: { types: ['numeric'], minCount: 2 } };

/** Die Kartentyp-Ids, in der Reihenfolge der Engine. */
const CHART_TYPE_IDS = CHART_TYPES.map(t => t.id);

/** Die Ids der Nelson-Regeln. */
const RULE_IDS = NELSON_RULES.map(r => r.id);

/** Die Optionen, die `setParam` annimmt (`subgroupSize` nur bei X̄-Karten). */
const PARAM_KEYS = ['chartTypeId', 'subgroupSize', 'baselineCount', 'stagesText', 'usl', 'lsl', 'enabledRules'];

/** Die zwei Werte eines Schalters — ohne Umwandeln (Welle-2-E5). */
const BOOL_VALUES = [true, false];

/** Die Leerform eines Zahlenfelds („alle Punkte" bzw. „keine Grenze"): `null` oder `''`. */
const isEmptyForm = (v) => v === null || v === '';

/**
 * Je Option ihr Prüfer; er gibt den Wert in der Form des Models zurück.
 * `vm` ist das Viewmodel — die Grenzen der Untergruppengröße hängen am Kartentyp.
 */
const PARAM_CHECKS = {
  chartTypeId: (v) => { requireEnum('value', v, CHART_TYPE_IDS); return v; },
  subgroupSize: (v, vm) => requireNumber('value', v, { min: vm.subgroupMin(), max: vm.subgroupMax(), integer: true }),
  baselineCount: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, { min: 1, integer: true })),
  stagesText: (v) => requireText('value', v),
  usl: (v) => (isEmptyForm(v) ? null : requireNumber('value', v)),
  lsl: (v) => (isEmptyForm(v) ? null : requireNumber('value', v)),
  enabledRules: (v) => {
    if (!Array.isArray(v)) {
      throw new Error(`invalid value ${JSON.stringify(v)}; allowed: a list of rule ids from ${RULE_IDS.join(', ')}`);
    }
    for (const r of v) requireEnum('rule', r, RULE_IDS);
    return [...new Set(v)].sort((a, b) => a - b);
  },
};

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'statParams.trim'`) in `obj` ablegen.
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

/**
 * Die Agenten-Lesefläche der Regelkarte (I-MR, X̄-R, X̄-S).
 *
 * Alle persistierten Eingaben außer `exampleWorksheetId` (Spalte, Kartentyp,
 * Untergruppe, Phase I, Stufen, Spezifikationsgrenzen, Regeln, Anmerkungen,
 * eingefrorene Grenzen), die Mengen der Setter und das Ergebnis als Zahlen
 * (Plan Welle 3 B, E4). Nicht darin: Kennzahlenleiste, Verletzungsliste und
 * Badges als Text, der Anmerkungsdialog, der Klappzustand der Regeln.
 *
 * @typedef {object} AgentRead
 * @property {object|null} columnRef  the measured column (slot `value`), `{ instanceId, sheetId, columnId }`, or null
 * @property {string} chartTypeId  `'i-mr'`, `'xbar-r'` or `'xbar-s'`
 * @property {number} subgroupSize  values per subgroup (1 for I-MR; 2–10 X̄-R; 2–25 X̄-S)
 * @property {number|null} baselineCount  points used to compute the limits, or null for all
 * @property {string} stagesText  the stage boundaries as entered (last point of each stage, e.g. "12, 25"), '' for none
 * @property {number|null} usl  upper specification limit, or null
 * @property {number|null} lsl  lower specification limit, or null
 * @property {number[]} enabledRules  the Nelson rule ids checked, sorted when set
 * @property {object} annotations  per point index `{ comment, excluded }`; an excluded point is left out of the limits
 * @property {object|null} frozenLimits  the limits frozen for Phase II monitoring, or null
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts
 * @property {string[]} activeParams  the keys `setParam` accepts for the current chart type
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {object|null} result  `{ chartType, subgroupSize, n, baselineEnd, stages, frozen, subcharts: { <id>: { cl, ucl, lcl, sigma } }, capability, violations: [{ index, ruleId }], signals }` — subchart ids i/mr, xbar/r or xbar/s; with stages the limits of the last stage (per point in points); capability `{ cp, cpu, cpl, cpk }` or null; signals the distinct violating indices of the first subchart; null with fewer than 2 values
 * @property {object[]} points  [bulk] one row per plotted point (subgroup for X̄ charts): per subchart id its value and limits (`i`, `iCl`, `iUcl`, `iLcl`, `mr`, …) and `signal`
 */
const mod = createModule({
  config: {
    id: 'control-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.control-chart',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,
      _picker: null,
      _lastResult: null,
      // Annotation dialog (transient UI)
      annOpen: false,
      annIdx: -1,
      annComment: '',
      annExcluded: false,
      // KPI strip (declarative — structured cells, see _renderStats)
      kpiCells: [],
      // Chart sections (declarative — header markup; chart mounted imperatively
      // into the templated host via _whenAnchor). See _renderCharts.
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],
      // No-violations empty state (declarative — x-if/x-text).
      noViolations: false,
      stagesWarning: '',
      // Populated violations panel (declarative — structured reactive rows).
      /** @type {Array<{index:number, ruleId:(string|number), desc:string, hasAnn:boolean, annText:string, annExcluded:boolean}>} */
      violationRows: [],
      violationsTitle: '',

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       *   — `fields: ['points']` liefert die Punkte vollständig, `rows` schneidet sie zu
       * @returns {AgentRead} Eingaben, wählbare Mengen und das gerechnete Ergebnis
       */
      read(options) {
        const m = this.model;
        const { result, points, pointsColumns } = this._agentResult();
        return readAgentState('control-chart', {
          columnRef: m.columnRef,
          chartTypeId: m.chartTypeId,
          subgroupSize: m.subgroupSize,
          baselineCount: m.baselineCount,
          stagesText: m.stagesText,
          usl: m.usl,
          lsl: m.lsl,
          enabledRules: [...m.enabledRules],
          annotations: JSON.parse(JSON.stringify(m.annotations)),
          frozenLimits: m.frozenLimits ? JSON.parse(JSON.stringify(m.frozenLimits)) : null,
          activeColumnSlots: this.activeColumnSlots(),
          activeParams: this.activeParams(),
          pickableColumns: this.pickableColumns(),
          result,
          points,
          pointsColumns,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return PARAM_KEYS.filter(k => k !== 'subgroupSize' || this.showSubgroup());
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot => [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /** @noagent view transform; die Optionen der Kartentyp-Auswahl (eine Quelle: CHART_TYPES) */
      chartTypeOptions() { return CHART_TYPE_IDS.map(v => ({ value: v, label: _t(`type_${v}`) })); },

      /**
       * Die Messreihe wählen und neu rechnen.
       * @agent
       * @param {'value'} slot der Slot; dieses Modul führt nur `value`
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {Promise<boolean>} true, wenn eingefrorene Grenzen einer anderen Spalte dabei verworfen wurden
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      async setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        let clean = null;
        if (ref != null) {
          requireEnum('slot', slot, this.activeColumnSlots());
          const keys = this.pickableColumns()[slot].map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
          clean = keyToRef(refToKey(ref));
        }
        // Eingefrorene Grenzen gehören zu ihrer Spalte (Model, Befund E-009).
        const dropped = this.model.setColumn(clean);
        this._picker?.syncValue(clean);
        await this.runAnalysis();
        return dropped;
      },

      /**
       * Eine Analyseoption setzen und neu rechnen.
       * @agent
       * @param {'chartTypeId'|'subgroupSize'|'baselineCount'|'stagesText'|'usl'|'lsl'|'enabledRules'} key
       *   welche Option; read().activeParams nennt die für den Kartentyp gültigen
       * @param {any} value Typ und Bereich je Schlüssel siehe Hilfe
       * @returns {Promise<void>}
       * @throws {Error} wenn `key` unbekannt oder gerade nicht aktiv ist oder `value` ungültig
       */
      async setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value, this));
        // Wie bisher beim Typwechsel: die Untergruppengröße in den Bereich des Typs klemmen.
        if (key === 'chartTypeId') this.model.setChartType(this.model.chartTypeId);
        await this.runAnalysis();
      },

      /**
       * Einen Punkt anmerken oder aus den Grenzen ausschließen; leerer Kommentar und
       * excluded false entfernen die Anmerkung.
       * @agent
       * @param {number} index 0-basierter Punkt der ersten Teilkarte (Untergruppe bei X̄-Karten)
       * @param {string} comment der Kommentar, '' für keinen
       * @param {boolean} excluded ob der Punkt aus der Grenzberechnung fällt
       * @returns {Promise<void>}
       * @throws {Error} wenn es den Punkt im letzten Ergebnis nicht gibt oder ein Argument ungültig ist
       */
      async setAnnotation(index, comment, excluded) {
        const n = this._lastResult ? this._lastResult.result.subcharts[this._lastResult.ct.subcharts[0].id].values.length : 0;
        requireIndex('index', index, n - 1);
        requireText('comment', comment);
        requireEnum('excluded', excluded, BOOL_VALUES);
        if (!comment && !excluded) delete this.model.annotations[index];
        else this.model.annotations[index] = { comment, excluded };
        await this.runAnalysis();
      },

      /**
       * Die Grenzen des aktuellen Ergebnisses für Phase II einfrieren oder freigeben.
       * @agent
       * @param {boolean} enabled true friert ein, false gibt frei
       * @returns {Promise<boolean>} ob danach eingefrorene Grenzen gelten — false auch dann, wenn
       *   ohne Ergebnis oder mit Stufen nicht eingefroren werden kann (keine Absage)
       * @throws {Error} wenn `enabled` kein Wahrheitswert ist
       */
      async setPhase2(enabled) {
        requireEnum('enabled', enabled, BOOL_VALUES);
        if (!enabled) {
          this.model.frozenLimits = null;
          await this.runAnalysis();
          return false;
        }
        if (this.model.frozenLimitsApply(State.parseStages(this.model.stagesText).length > 0)) return true;
        if (!this._lastResult || State.parseStages(this.model.stagesText).length > 0) return false;
        this.model.frozenLimits = this.model.buildFrozenLimits(this._lastResult);
        await this.runAnalysis();
        return true;
      },

      /** Eindeutige Paare (Index, Regel), nach Index sortiert — eine Quelle für die Liste und read(). */
      _uniqueViolations(violations) {
        const unique = [];
        const seen = new Set();
        violations.forEach(v => {
          const k = `${v.index}-${v.ruleId}`;
          if (!seen.has(k)) { seen.add(k); unique.push(v); }
        });
        return unique.sort((a, b) => a.index - b.index);
      },

      /** Ergebnis und Punkte für read(), aus `_lastResult` (E4). */
      _agentResult() {
        const L = this._lastResult;
        if (!L) return { result: null, points: [], pointsColumns: [] };
        const ids = L.ct.subcharts.map(s => s.id);
        const last = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
        const subcharts = {};
        const cols = {};
        for (const sid of ids) {
          const sc = L.result.subcharts[sid];
          subcharts[sid] = {
            cl: finiteOrNull(last(sc.cl)), ucl: finiteOrNull(last(sc.ucl)),
            lcl: finiteOrNull(last(sc.lcl)), sigma: finiteOrNull(last(sc.sigma)),
          };
          cols[sid] = sc.values;
          cols[`${sid}Cl`] = sc.cl;
          cols[`${sid}Ucl`] = sc.ucl;
          cols[`${sid}Lcl`] = sc.lcl;
        }
        const violations = this._uniqueViolations(L.primaryViolations).map(v => ({ index: v.index, ruleId: v.ruleId }));
        const signals = [...new Set(violations.map(v => v.index))];
        const { rows, columns } = zipPoints(cols, { signal: signals });
        const cap = L.capability;
        return {
          result: {
            chartType: L.ct.id,
            subgroupSize: L.n,
            n: L.result.subcharts[ids[0]].values.length,
            baselineEnd: L.baselineEnd,
            stages: [...L.stages],
            frozen: Boolean(L.frozen),
            subcharts,
            capability: cap ? Object.fromEntries(Object.entries(cap).map(([k, v]) => [k, finiteOrNull(v)])) : null,
            violations,
            signals,
          },
          points: rows,
          pointsColumns: columns,
        };
      },

      // ── Chart-type / subgroup view helpers ────────────────────

      _ct() { return getChartType(this.model.chartTypeId); },

      /** @noagent view transform; ob der Kartentyp eine wählbare Untergruppengröße hat */
      showSubgroup() {
        const ct = this._ct();
        return Boolean(ct) && ct.minSubgroupSize !== ct.maxSubgroupSize;
      },
      /** @noagent view transform */
      subgroupMin() {
        const ct = this._ct();
        return ct ? ct.minSubgroupSize : 2;
      },
      /** @noagent view transform */
      subgroupMax() {
        const ct = this._ct();
        return ct ? ct.maxSubgroupSize : 25;
      },

      // ── Input -> setParam (POM dispatches `change`) ────────────

      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} e die Änderung der Untergruppengröße
       */
      async subgroupSizeChanged(e) {
        const v = parseInt(e.target.value, 10) || 2;
        // In den Bereich des Kartentyps klemmen — vor der Senke (E6, Abweichung 2).
        await this.setParam('subgroupSize', Math.min(this.subgroupMax(), Math.max(this.subgroupMin(), v)));
        e.target.value = String(this.model.subgroupSize);
      },
      /** @noagent view transform */
      baselineValue() {
        return this.model.baselineCount ?? '';
      },
      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} e die Änderung der Phase I
       */
      async baselineChanged(e) {
        const v = parseInt(e.target.value, 10);
        // Leer, unlesbar oder < 1 heißt „alle Punkte" (E6, Abweichung 1).
        await this.setParam('baselineCount', Number.isInteger(v) && v >= 1 ? v : null);
      },
      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} e die Änderung der Stufen
       */
      async stagesChanged(e) {
        await this.setParam('stagesText', e.target.value || '');
      },
      /** @noagent view transform */
      uslValue() { return this.model.usl ?? ''; },
      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} e die Änderung der oberen Spezifikationsgrenze
       */
      async uslChanged(e) {
        const v = parseFloat(e.target.value);
        await this.setParam('usl', Number.isNaN(v) ? null : v);
      },
      /** @noagent view transform */
      lslValue() { return this.model.lsl ?? ''; },
      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {Event} e die Änderung der unteren Spezifikationsgrenze
       */
      async lslChanged(e) {
        const v = parseFloat(e.target.value);
        await this.setParam('lsl', Number.isNaN(v) ? null : v);
      },

      // ── Phase II ──────────────────────────────────────────────

      /** @noagent view transform */
      phase2BadgeText() {
        return this.model.frozenLimits ? _t('phase2_frozen') : _t('phase2_live');
      },
      /** @noagent view transform */
      phase2BadgeClass() {
        return this.model.frozenLimits ? 'control-chart__phase2-badge--frozen' : '';
      },
      /** @noagent view transform */
      phase2BadgeIcon() {
        return this.model.frozenLimits ? 'action.lock' : 'action.unlock';
      },
      /** @noagent view transform */
      phase2BtnText() {
        return this.model.frozenLimits ? _t('phase2_unfreeze') : _t('phase2_freeze');
      },
      /** @noagent view transform */
      phase2BtnClass() {
        return this.model.frozenLimits ? 'btn--secondary' : 'btn--primary';
      },
      /**
       * @noagent DOM event handler; the agent uses setPhase2()
       */
      async phase2Toggle() {
        if (this.model.frozenLimits) { await this.setPhase2(false); return; }
        if (!this._lastResult) {
          module._context.notify?.(_t('phase2_needsData'), 'warning');
          return;
        }
        if (State.parseStages(this.model.stagesText).length > 0) {
          module._context.notify?.(_t('phase2_noStages'), 'warning');
          return;
        }
        await this.setPhase2(true);
      },

      // ── Nelson rules ──────────────────────────────────────────

      nelsonCollapsed: false,
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      toggleNelson() { this.nelsonCollapsed = !this.nelsonCollapsed; },
      /** @noagent view transform */
      nelsonPanelClass() {
        return this.nelsonCollapsed ? 'control-chart__nelson-panel--collapsed' : '';
      },
      /** @noagent view transform */
      nelsonToggleClass() {
        return this.nelsonCollapsed ? 'control-chart__collapsible--collapsed' : '';
      },

      /**
       * Localized Nelson-rule view rows.
       * @noagent view transform
       */
      rulesView() {
        const lang = module._context.language || 'de';
        return NELSON_RULES.map(r => ({
          id: r.id,
          short: r.short[lang] || r.short.de,
          desc: r.desc[lang] || r.desc.de,
        }));
      },
      /** @noagent view transform */
      isRuleEnabled(id) {
        return this.model.enabledRules.includes(id);
      },
      /**
       * @noagent DOM event handler; the agent uses setParam()
       * @param {number|string} id die Regel
       * @param {Event} e die Änderung ihres Kästchens
       */
      async toggleRule(id, e) {
        const rid = parseInt(id, 10);
        const rest = this.model.enabledRules.filter(r => r !== rid);
        await this.setParam('enabledRules', e.target.checked ? [...rest, rid] : rest);
      },

      // ── Annotation dialog (declarative) ───────────────────────

      /** @noagent view transform */
      annTitle() { return _t('annotationTitle', { idx: this.annIdx + 1 }); },
      /** @noagent view transform */
      cancelLabel() { return module._context.i18n.t('common.cancel'); },
      /** @noagent view transform */
      annRemoveStyle() {
        // Object form so Alpine renders the canonical "visibility: hidden;"
        // (with a space) — the POM checks getAttribute('style') for that exact
        // substring. A bare string ('visibility:hidden') would fail the match.
        return this.model.annotations[this.annIdx] ? {} : { visibility: 'hidden' };
      },
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      openAnnotation(idx) {
        const existing = this.model.annotations[idx] || { comment: '', excluded: false };
        this.annIdx = idx;
        this.annComment = existing.comment || '';
        this.annExcluded = Boolean(existing.excluded);
        this.annOpen = true;
        this.$nextTick(() => {
          module._container.querySelector('[data-ref="ann-comment"]')?.focus();
        });
      },
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      closeAnnotation() {
        this.annOpen = false;
        this.annIdx = -1;
      },
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      annOverlayClick(e) {
        if (e.target.classList.contains('dmike-chart-popout-overlay')) this.closeAnnotation();
      },
      /**
       * @noagent DOM event handler; the agent uses setAnnotation()
       */
      async saveAnnotation() {
        const idx = this.annIdx;
        const comment = this.annComment || '';
        const excluded = Boolean(this.annExcluded);
        this.closeAnnotation();
        await this.setAnnotation(idx, comment, excluded);
      },
      /**
       * @noagent DOM event handler; the agent uses setAnnotation()
       */
      async removeAnnotation() {
        const idx = this.annIdx;
        this.closeAnnotation();
        await this.setAnnotation(idx, '', false);
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      /** @noagent helper; Entprellen für Datenereignisse, die Setter rechnen sofort */
      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      /**
       * Mit den aktuellen Eingaben und Spaltenwerten neu rechnen.
       * @agent
       * @returns {Promise<void>}
       */
      async runAnalysis() {
        clearTimeout(this._debTimer);
        const clearOutput = () => {
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.kpiCells = [];
          this.noViolations = false;
          this.stagesWarning = '';
          this.violationRows = [];
          this.violationsTitle = '';
          this._lastResult = null;
        };

        if (!this.model.columnRef) { clearOutput(); return; }

        const rawValues = getColumnValues(module._context.stateManager, this.model.columnRef);
        const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 2) { clearOutput(); return; }

        const ct = this._ct();
        if (!ct) return;

        const n = this.model.subgroupSize;
        const stagesParsed = State.parseStages(this.model.stagesText)
          .filter(b => b > 0 && b < values.length);
        const usingStages = stagesParsed.length > 0;
        const misaligned = ct.id === 'i-mr' ? [] : State.misalignedStages(stagesParsed, n);
        this.stagesWarning = misaligned.length
          ? _t('stagesSplitSubgroup', { stages: misaligned.join(', '), n })
          : '';
        const baselineEnd = usingStages ? values.length : (this.model.baselineCount || values.length);
        const excluded = this.model.excludedIndices();
        const fl = this.model.frozenLimits;

        let result;
        const frozen = this.model.frozenLimitsApply(usingStages);
        if (frozen) {
          const fresh = ct.compute(values, n, baselineEnd, undefined, excluded);
          const primaryId = ct.subcharts[0].id;
          const secondaryId = ct.subcharts[1].id;
          result = {
            subcharts: {
              [primaryId]:   { values: fresh.subcharts[primaryId].values,   ...fl.primary },
              [secondaryId]: { values: fresh.subcharts[secondaryId].values, ...fl.secondary },
            },
            labels: fresh.labels,
          };
        } else {
          result = ct.compute(values, n, baselineEnd, usingStages ? stagesParsed : undefined, excluded);
        }

        const primaryId = ct.subcharts[0].id;
        const primaryData = result.subcharts[primaryId];

        // Staged charts: every stage is judged by its own limits; capability
        // describes the current process, i.e. the last stage.
        const primaryViolations = evaluateNelsonRules(
          primaryData.values, primaryData.cl, primaryData.sigma,
          this.model.enabledRules, result.segments,
        );
        const lastSeg = result.segments ? result.segments[result.segments.length - 1] : null;
        const capValues = lastSeg ? primaryData.values.slice(lastSeg.start, lastSeg.end) : primaryData.values;
        const last = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
        const capability = computeCapability(
          capValues.filter(v => v !== null),
          last(primaryData.cl), capabilitySigma(this.model.chartTypeId, last(primaryData.sigma), n),
          this.model.usl, this.model.lsl,
        );

        this._lastResult = { result, ct, primaryViolations, capability, baselineEnd, n, stages: stagesParsed, frozen };

        this._renderStats(primaryData, primaryViolations, capability);
        await this._renderCharts(result, ct, primaryViolations, baselineEnd, n, stagesParsed);
        this._renderViolations(primaryViolations);
      },

      // ── KPI strip (declarative — structured cells) ───────────
      //
      // Cells carry RAW text (NOT esc()'d — x-text escapes structurally).
      // The staged CL hint is a separate structured field (labelHint),
      // rendered as its own conditional <span> in the template instead of
      // embedded inline markup. No HTML strings, no x-html.

      _renderStats(data, violations, capability) {
        const vCount = new Set(violations.map(v => v.index)).size;
        const total = data.values.filter(v => v !== null).length;
        const fmt = (v) => v.toFixed(4);
        // Staged: show the last stage — the process as it runs now.
        const last = (v) => Array.isArray(v) ? v[v.length - 1] : v;
        const stageCount = this._lastResult?.result?.segments?.length || 0;

        const cells = [
          {
            value: fmt(last(data.cl)),
            label: _t('statCL'),
            labelHint: stageCount > 1 ? _t('stageN', { n: stageCount }) : '',
            sub: `σ̂ = ${fmt(last(data.sigma))}`,
            mod: '',
          },
          {
            value: last(data.ucl).toFixed(3),
            label: 'UCL / LCL',
            labelHint: '',
            sub: last(data.lcl).toFixed(3),
            mod: '',
          },
          {
            value: vCount,
            label: _t('statViolations'),
            labelHint: '',
            sub: _t('statOf', { total }),
            mod: vCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
          },
        ];

        if (capability) {
          const cls = capability.cpk >= 1.33 ? '--good' : capability.cpk >= 1.0 ? '--warn' : '--bad';
          cells.push({
            value: capability.cpk.toFixed(3),
            label: 'Cpk',
            labelHint: '',
            sub: capability.cp ? `Cp = ${  capability.cp.toFixed(3)}` : '',
            mod: `dmike-kpi${cls}`,
          });
        }

        this.kpiCells = cells;
      },

      /**
       * Bounded rAF-poll for a templated host. Alpine may materialise the
       * x-for host across several reactive flush cycles, so poll (bounded)
       * until it exists. Aborts if a newer render started (stale gen).
       * @param {string} selector
       * @param {number} gen
       * @param {number} [maxFrames]
       * @returns {Promise<Element|null>}
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container ? module._container.querySelector(selector) : null;
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      async _renderCharts(result, ct, primaryViolations, baselineEnd, n, stages) {
        this._destroyCharts();

        const blEndForChart = ct.id === 'i-mr' ? baselineEnd : Math.ceil(baselineEnd / n);
        const primaryId = ct.subcharts[0].id;
        const lang = module._context.language || 'de';
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        const usingStages = Array.isArray(stages) && stages.length > 0;
        const stageBoundariesFor = (_id) => {
          if (!usingStages) return null;
          if (ct.id === 'i-mr') return stages.slice();
          return stages.map(b => Math.ceil(b / n));
        };

        const gen = ++this._renderGen;

        // Pre-compute violations / chart options per subchart, build the
        // declarative chart-section headers, then mount the imperative charts
        // into the templated hosts.
        const plans = ct.subcharts.map(sc => {
          const scData = result.subcharts[sc.id];
          const scViolations = sc.id === primaryId
            ? primaryViolations
            : evaluateNelsonRules(scData.values, scData.cl, scData.sigma,
              secondaryChartRules(this.model.enabledRules), result.segments);
          const isStable = scViolations.length === 0;
          const violationIndices = new Set(scViolations.map(v => v.index));
          const chartName = _t(`subchart_${  sc.id}`, { col: colName });
          return { sc, scData, scViolations, isStable, violationIndices, chartName };
        });

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = plans.map(p => ({
          id: p.sc.id,
          title: p.chartName,
          badgeText: p.isStable
            ? _t('stable')
            : _t('unstable', { count: p.scViolations.length }),
          badgeClass: p.isStable
            ? 'control-chart__badge--stable'
            : 'control-chart__badge--unstable',
          badgeIcon: p.isStable ? 'status.ok' : 'status.warning',
        }));

        for (const p of plans) {
          const { sc, scData, violationIndices } = p;
          const host = await this._whenAnchor(`[data-chart-host="${  sc.id  }"]`, gen);
          if (!host) return;

          const yLabel = sc.yLabel[lang] || sc.yLabel.de || '';

          const specOpts = sc.id === primaryId
            ? { usl: this.model.usl, lsl: this.model.lsl }
            : { usl: null, lsl: null };

          const excludedRaw = this.model.excludedIndices();
          const excludedForSub = (sc.id === 'i' || sc.id === 'mr')
            ? new Set(excludedRaw)
            : new Set(excludedRaw.map(i => Math.floor(i / n)));

          const chart = await module._context.chartManager.create(host, 'control-chart', {
            editKey: sc.id,
            title: '',
            xLabel: _t('xLabelSample'),
            yLabel,
            showLegend: false,
            showTitle: false,
            values: scData.values,
            cl: scData.cl,
            ucl: scData.ucl,
            lcl: scData.lcl,
            sigma: scData.sigma,
            violationIndices,
            excludedIndices: excludedForSub,
            baselineEnd: !usingStages && blEndForChart < scData.values.length ? blEndForChart : null,
            stageBoundaries: stageBoundariesFor(sc.id),
            ...specOpts,
          });
          // Stale-render guard: a newer render started while we awaited.
          if (gen !== this._renderGen) {
            module._context.chartManager.destroy(chart);
            return;
          }
          this._charts.push(chart);
        }
      },

      // ── Violations panel (declarative — structured reactive rows) ──
      // RAW text on each cell (x-text escapes structurally). The per-row click /
      // keyboard opens the annotation dialog; the annotation hint has two
      // sub-states (existing annotation vs. "add").

      _renderViolations(violations) {
        if (violations.length === 0) {
          this.noViolations = true;
          this.violationRows = [];
          this.violationsTitle = '';
          return;
        }
        this.noViolations = false;

        const lang = module._context.language || 'de';
        const unique = this._uniqueViolations(violations);

        this.violationRows = unique.map(v => {
          const rule = NELSON_RULES.find(r => r.id === v.ruleId);
          const ann = this.model.annotations[v.index];
          return {
            index: v.index,
            ruleId: v.ruleId,
            desc: rule ? (rule.short[lang] || rule.short.de) : '',
            hasAnn: Boolean(ann),
            annText: ann ? ((ann.comment || '') + (ann.excluded ? ' ⊘' : '')) : '',
            annExcluded: Boolean(ann && ann.excluded),
          };
        });
        this.violationsTitle = _t('violationsTitle', { count: unique.length });
      },

      // View helpers for the declarative violation rows.
      /** @noagent view transform */
      violationsHeaderText() { return `⚑ ${  this.violationsTitle}`; }, // ⚑
      /** @noagent view transform */
      vIdxLabel(r)  { return `#${  r.index + 1}`; },
      /** @noagent view transform */
      vRuleLabel(r) { return `Rule ${  r.ruleId}`; },
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      openViolation(r) { this.openAnnotation(r.index); },
      /** @noagent view transform; Dialog- bzw. Klappzustand, kein Zustand der Rechnung */
      onViolationKey(r, event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.openAnnotation(r.index);
        }
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Column picker (imperative, 'single' mode) ─────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.value,
          onChange: async (ref) => {
            if (await this.setColumn('value', ref)) {
              module._context.notify?.(_t('phase2_columnChanged'), 'info');
            }
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;

        const onData = () => this.scheduleAnalysis();
        eb.on('state:saved', onData);
        eb.on('worksheet:dataChanged', onData);
        this._unsubs.push(() => eb.off('state:saved', onData));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));

        // The shared ColumnPicker self-refreshes its option list on
        // module:added/removed; here we only need to re-derive the analysis
        // result when the worksheet set changes.
        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') this.scheduleAnalysis(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod));
        this._unsubs.push(() => eb.off('module:removed', onMod));

        const onTheme = () => { if (this._lastResult) this.runAnalysis(); };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        clearTimeout(this._debTimer);
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: control-chart examples ship either a project-shape
 * payload (`sourceWorksheetData` + `columnRef`) or a CSV-shape dataset
 * (`columns`). Either way we provision a worksheet (replacing any
 * previously example-provisioned one), rewrite the `__source__` placeholder,
 * then apply the state via setState (which rebuilds the Alpine tree and
 * re-runs the analysis).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    // CSV-shape payload → synthesize sourceWorksheetData + columnRef.
    synthesizeFromCsv(data, meta) {
      const wsState = csvPayloadToWorksheetState(data, meta);
      if (!wsState) return null;
      return {
        sourceWorksheetData: wsState,
        columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
      };
    },
    rewriteRefs(data, instanceId) {
      if (data.columnRef?.instanceId === '__source__') {
        data.columnRef = { ...data.columnRef, instanceId };
      }
      return data;
    },
  });
};

export default mod;
