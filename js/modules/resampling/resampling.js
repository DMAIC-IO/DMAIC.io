/**
 * D.Mike — Resampling Module (resampling.js)
 * Analyze phase: bootstrap confidence intervals and permutation tests for one,
 * two, paired and k samples.
 *
 * createModule + Alpine CSP. The Model (resampling-model.js) holds settings and
 * the condensed result summary; all statistics live in the engines, input
 * handling in resampling-analysis.js, display mapping in resampling-presenter.js.
 * Computation runs only on the explicit "Compute" button through the runner
 * from `mod.runnerFactory` (inline runner today, a worker runner later).
 *
 * Native objects (AbortController, charts, pickers) stay in closure locals of
 * `data()`: on reactive Alpine data they would be proxied and their methods
 * would throw "Illegal invocation".
 *
 * @agent  Steuerbar über das Viewmodel: die dreizehn Parameter (setParam), die
 *   Stichprobenspalten (setColumn, setColumns für die k Gruppen) und das
 *   Rechnen selbst (compute wartet bis zum letzten Durchlauf, cancel bricht
 *   ab). Gelesen wird über read() mit erklärter Lesefläche (AgentRead) —
 *   Konfiguration, wählbare Mengen, Laufzustand und das Ergebnis. Der Agent
 *   bekommt Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, MODES, CONTRASTS, DIRECTIONS, CI_METHODS, STATS_BY_MODE } from './resampling-model.js';
import {
  readInputs, validateInputs, errorKeyForCode, buildJobs, computeInputsHash, summarize,
} from './resampling-analysis.js';
import { resultView, bootDecision, bootChartConfig, permChartConfig, statisticKey } from './resampling-presenter.js';
import { statementParts, renderStatement } from './resampling-statement.js';
import { createInlineRunner } from '../../engines/resampling-runner.js';
import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** Die Parameter, die `setParam` annimmt; `statParams.*` liegt unter dem Model-Feld `statParams`. */
const PARAM_KEYS = ['mode', 'statisticId', 'statParams.trim', 'statParams.p',
  'statParams.lsl', 'statParams.usl', 'contrast', 'direction', 'target',
  'B', 'seed', 'confidence', 'ciMethod'];

/**
 * Je Parameter sein Prüfer; gibt den normalisierten Wert zurück.
 * Konfidenz, Trimmanteil und Quantil p sind mathematisch begrenzt und werden
 * außerhalb ihres Bereichs abgewiesen (D1, Spec §3). B und seed nehmen jede
 * ganze Zahl an — die Absage für Werte außerhalb ihres Bereichs steht in
 * `validationMsg`. `statisticId` prüft `setParam` gegen die Statistiken des Modus.
 */
const PARAM_CHECKS = {
  mode: (v) => { requireEnum('value', v, MODES); return v; },
  statisticId: (v) => requireText('value', v),
  'statParams.trim': (v) => requireNumber('value', v, { min: 0, exclusiveMax: 0.5 }),
  'statParams.p': (v) => requireNumber('value', v, { exclusiveMin: 0, exclusiveMax: 1 }),
  'statParams.lsl': (v) => requireText('value', v),
  'statParams.usl': (v) => requireText('value', v),
  contrast: (v) => { requireEnum('value', v, CONTRASTS); return v; },
  direction: (v) => { requireEnum('value', v, DIRECTIONS); return v; },
  target: (v) => requireText('value', v),
  B: (v) => requireNumber('value', v, { integer: true }),
  seed: (v) => requireNumber('value', v, { integer: true }),
  confidence: (v) => requireNumber('value', v, { exclusiveMin: 0, exclusiveMax: 1 }),
  ciMethod: (v) => { requireEnum('value', v, CI_METHODS); return v; },
};

/** Die Einzelspalten-Slots in der Reihenfolge der Oberfläche; die Namen sind die Model-Felder. */
const COLUMN_SLOTS = ['colRef1', 'colRef2'];
/** Der Mehrfachspalten-Slot (Modus k). */
const MULTI_SLOTS = ['colRefsK'];

/** Je Slot die Filter, die der Wähler dieses Slots bekommt. */
const SLOT_FILTERS = {
  colRef1: { types: ['numeric'], minCount: 2 },
  colRef2: { types: ['numeric'], minCount: 2 },
  colRefsK: { types: ['numeric'], minCount: 2 },
};

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = {
  colRef1: (m, ref) => { m.colRef1 = ref; },
  colRef2: (m, ref) => { m.colRef2 = ref; },
};
const MULTI_SINKS = { colRefsK: (m, refs) => { m.colRefsK = refs; } };

/** Beschriftungsschlüssel der Auswahllisten (Werte kommen aus den Model-Konstanten). */
const STATISTIC_LABEL_KEYS = {
  mean: 'statMean', median: 'statMedian', stddev: 'statStddev', variance: 'statVariance',
  trimmedMean: 'statTrimmedMean', quantile: 'statQuantile', cv: 'statCv', ppk: 'statPpk',
};
const CONTRAST_LABEL_KEYS = { difference: 'contrastDifference', ratio: 'contrastRatio' };
const DIRECTION_LABEL_KEYS = { 'two-sided': 'twoSided', greater: 'greater', less: 'less' };
const CI_METHOD_LABEL_KEYS = { bca: 'ciBca', percentile: 'ciPercentile' };

/** Präfix der Hilfeschlüssel für die Typen dieses Moduls (`resultHelp`). */
const HELP = 'modules.resampling.types.';

/**
 * Die Schlüsselfläche von `setParam`. Punkt im Schlüssel = Verschachtelung
 * im Model (`statParams.trim`). Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'one'|'two'|'paired'|'k'} mode  Aufbau
 * @property {string} statisticId  Statistik
 * @property {number} [statParams.trim]  Stutzungsanteil, nur getrimmter Mittelwert
 * @property {number} [statParams.p]  Quantil, nur Quantil
 * @property {string} [statParams.lsl]  untere Spezifikationsgrenze, nur Ppk
 * @property {string} [statParams.usl]  obere Spezifikationsgrenze, nur Ppk
 * @property {'difference'|'ratio'} [contrast]  Vergleich, nur zwei Stichproben
 * @property {'two-sided'|'greater'|'less'} [direction]  Alternativhypothese, zwei und gepaart
 * @property {string} [target]  Zielwert, nur eine Stichprobe
 * @property {number} B  Zahl der Wiederholungen
 * @property {number} seed  Startwert des Zufallsgenerators
 * @property {number} confidence  Konfidenzniveau als Anteil
 * @property {'bca'|'percentile'} ciMethod  Intervallverfahren
 */

/**
 * Das zuletzt erfolgreich gerechnete Ergebnis, wie `read().result` es liefert.
 * Welche Teile gefüllt sind, hängt vom Aufbau ab: one → boot; two und
 * paired → boot und perm; k → k.
 *
 * @typedef {object} Result
 * @property {string} inputsHash  Fingerabdruck der Eingaben
 * @property {'one'|'two'|'paired'|'k'} mode  Aufbau
 * @property {string} statisticId  Statistik
 * @property {'difference'|'ratio'} contrast  Vergleich
 * @property {'two-sided'|'greater'|'less'} direction  Alternativhypothese
 * @property {number} confidence  Konfidenzniveau
 * @property {number} B  Wiederholungen
 * @property {number} seed  Startwert
 * @property {string[]} labels  Stichproben
 * @property {number[]} n  Werte je Stichprobe
 * @property {Boot|null} boot  Bootstrap, nicht bei k
 * @property {Perm|null} perm  Permutationstest, zwei und gepaart
 * @property {KResult|null} k  k-Stichproben-Auswertung
 */

/**
 * Bootstrap-Zusammenfassung (Aufbau one, two, paired).
 *
 * @typedef {object} Boot
 * @property {number|null} estimate  Schätzwert
 * @property {number|null} se  Bootstrap-Standardfehler
 * @property {number|null} bias  Verzerrung
 * @property {Intervals} ci  Konfidenzintervalle
 * @property {'reject'|'retain'|null} decision  Urteil über den Zielwert, nur bei einer Stichprobe mit Zielwert
 * @property {Bin[]} bins  Histogramm der Replikate
 */

/**
 * Beide Konfidenzintervalle eines Bootstraps.
 *
 * @typedef {object} Intervals
 * @property {Array<number|null>|null} percentile  Perzentil-Intervall
 * @property {Array<number|null>|null} bca  BCa-Intervall
 * @property {boolean} bcaFallback  BCa auf Perzentil zurückgefallen
 */

/**
 * Eine Histogrammklasse einer gezogenen Verteilung.
 *
 * @typedef {object} Bin
 * @property {number} x0  Klassenbeginn
 * @property {number} x1  Klassenende
 * @property {number} count  Anzahl
 */

/**
 * Permutationstest (Aufbau two, paired).
 *
 * @typedef {object} Perm
 * @property {number|null} observed  beobachtete Statistik
 * @property {number|null} pValue  p-Wert
 * @property {boolean} exact  exakt aufgezählt
 * @property {number} permutations  Zuordnungen bzw. Wiederholungen
 * @property {Bin[]} bins  Histogramm der Permutationsverteilung
 */

/**
 * k-Stichproben-Auswertung (Aufbau k).
 *
 * @typedef {object} KResult
 * @property {number|null} estimate  Statistik der gepoolten Werte
 * @property {number|null} observed  beobachtete Prüfgröße
 * @property {number|null} pValue  p-Wert
 * @property {boolean} exact  exakt aufgezählt
 * @property {number} permutations  Zuordnungen bzw. Wiederholungen
 * @property {Bin[]} bins  Histogramm der Permutationsverteilung
 * @property {KGroup[]} groups  je Stichprobe
 * @property {PostHoc[]} posthoc  Paarvergleiche
 */

/**
 * Eine Stichprobe im Aufbau k.
 *
 * @typedef {object} KGroup
 * @property {number|null} estimate  Schätzwert
 * @property {Intervals} ci  Konfidenzintervalle
 */

/**
 * Ein Paarvergleich im Aufbau k.
 *
 * @typedef {object} PostHoc
 * @property {number} i  erste Stichprobe
 * @property {number} j  zweite Stichprobe
 * @property {number|null} contrast  Differenz
 * @property {Intervals} ci  Konfidenzintervalle
 * @property {number|null} pRaw  p-Wert unkorrigiert
 * @property {number|null} pHolm  p-Wert nach Holm
 * @property {boolean} exact  exakt aufgezählt
 */

/**
 * Die Agenten-Lesefläche von Resampling.
 *
 * Das Model hält die Eingaben und die verdichtete Ergebniszusammenfassung;
 * Laufzustand und Hinweise entstehen am Viewmodel. Darum erklärt dieses Modul
 * seine Lesefläche — ohne die interne Beispiel-Buchführung (`exampleWorksheetId`).
 *
 * @typedef {object} AgentRead
 * @property {'one'|'two'|'paired'|'k'} mode  the sample design
 * @property {string} statisticId  the statistic that is resampled
 * @property {object} statParams  `{ trim, p, lsl, usl }`: trimming share, quantile level, lower and upper limit (limits as text)
 * @property {'difference'|'ratio'} contrast  how two samples are compared (mode 'two')
 * @property {'two-sided'|'greater'|'less'} direction  the alternative (modes 'two' and 'paired')
 * @property {string} target  the hypothesised value as text (mode 'one'); empty means none
 * @property {object|null} colRef1  the first sample column, `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} colRef2  the second sample column (modes 'two' and 'paired'), or null
 * @property {object[]} colRefsK  the group columns in order (mode 'k'), each `{ instanceId, sheetId, columnId }`
 * @property {number} B  number of resamples or permutations
 * @property {number} seed  random seed
 * @property {number} confidence  confidence level as a fraction, for example 0.95
 * @property {'bca'|'percentile'} ciMethod  interval method
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} statisticOptions  the statistics the current mode offers
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {string[]} activeMultiSlots  the slots `setColumns` accepts in the current state
 * @property {object} pickableColumns  per slot the columns it accepts, each `{ key, name }`
 * @property {boolean} running  true while a run is in progress
 * @property {boolean} stale  true when a result exists that was computed from other inputs
 * @property {string} validationMsg  why `compute` would not run, or an empty string
 * @property {string} errorMsg  why the last run failed, or an empty string
 * @property {Result|null} result  the summary of the last run, or null until the first successful run
 */
const mod = createModule({
  config: {
    id: 'resampling',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.resampling',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    let abortCtl = null;
    let renderGen = 0;
    let charts = [];
    let pickers = [];
    /** Wähler je Slot, damit `setColumn`/`setColumns` ihn nachziehen kann. */
    let pickerBySlot = {};
    let unsubs = [];

    const chartManager = () => module._context.chartManager;
    const destroyCharts = () => {
      for (const chart of charts) {
        try { chartManager().destroy(chart); } catch { /* ignore */ }
      }
      charts = [];
    };
    const disposePickers = () => {
      for (const p of pickers) p.destroy();
      pickers = [];
      pickerBySlot = {};
    };
    const valuesOf = (ref) => (ref ? getColumnValues(module._context.stateManager, ref) : null);

    return {
      // ── Transient view state (not persisted) ────────────────────
      running: false,
      progress: 0,
      errorKey: null,
      validationKey: null,
      currentHash: null,
      stale: false,
      view: null,
      /** Sentence parts of the plain-language key statement (resampling-statement.js). */
      statement: [],
      /** Completed runs in this view instance (not persisted; lets E2E detect a finished recompute). */
      runCount: 0,

      /** @noagent view transform */
      statisticKey,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Mengen, Laufzustand und Ergebnis
       */
      read(options) {
        const { exampleWorksheetId: _book, ...state } = this.model.toJSON();
        const r = state.result;
        const verdict = bootDecision(r, { ciMethod: this.model.ciMethod, target: this.model.target });
        return readAgentState('resampling', {
          ...state,
          result: r && r.boot ? { ...r, boot: { ...r.boot, decision: verdict } } : r,
          activeParams: this.activeParams(),
          statisticOptions: this.statisticOptions(),
          activeColumnSlots: this.activeColumnSlots(),
          activeMultiSlots: this.activeMultiSlots(),
          pickableColumns: this.pickableColumns(),
          running: this.running,
          stale: this.stale,
          validationMsg: this.validationKey ? _t(this.validationKey) : '',
          errorMsg: this.errorKey ? _t(this.errorKey) : '',
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        const active = {
          'statParams.trim': this.showTrim(),
          'statParams.p': this.showQuantileP(),
          'statParams.lsl': this.showLimits(),
          'statParams.usl': this.showLimits(),
          contrast: this.showContrast(),
          direction: this.showDirection(),
          target: this.showTarget(),
        };
        return PARAM_KEYS.filter((key) => active[key] !== false);
      },

      /** @noagent derived set; der Agent liest sie über read().statisticOptions */
      statisticOptions() { return [...STATS_BY_MODE[this.model.mode]]; },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() {
        if (this.model.mode === 'k') return [];
        return this.model.mode === 'one' ? ['colRef1'] : [...COLUMN_SLOTS];
      },

      /** @noagent derived set; der Agent liest sie über read().activeMultiSlots */
      activeMultiSlots() { return this.model.mode === 'k' ? [...MULTI_SLOTS] : []; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries([...COLUMN_SLOTS, ...MULTI_SLOTS].map((slot) =>
          [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Einen Parameter setzen; Gültigkeit und Bereiche prüft die Validierung,
       * deren Grund `validationMsg` nennt. Ein Moduswechsel setzt eine Statistik,
       * die der neue Modus nicht anbietet, auf den Mittelwert zurück.
       * @agent
       * @param {keyof Params} key welcher Parameter; die im aktuellen Zustand zulässigen nennt activeParams
       * @param {string|number} value der Wert; Typ je Schlüssel siehe `Params`, Zahlen als Zahl oder Zahlentext, Grenzen und Zielwert als Text
       * @returns {void}
       * @throws {Error} wenn `key` im aktuellen Zustand nicht gilt oder `value` nicht zur Art des Parameters passt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        if (key === 'mode') {
          this.model.setMode(PARAM_CHECKS.mode(value));
          this.$nextTick(() => { this._remountPickers(); this.refresh(); });
          this.refresh();
          return;
        }
        if (key === 'statisticId') requireEnum('value', value, this.statisticOptions());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this.refresh();
      },

      /**
       * Eine Stichprobenspalte einem Slot zuweisen (Modi one, two, paired).
       * @agent
       * @param {'colRef1'|'colRef2'} slot der Slot; `colRef2` nur in den Modi two und paired
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` im aktuellen Modus nicht gilt oder die Spalte nicht wählbar ist
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, this.activeColumnSlots());
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          pickerBySlot[slot]?.syncValue(null);
          this.refresh();
          return;
        }
        const keys = this.pickableColumns()[slot].map((c) => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        pickerBySlot[slot]?.syncValue(clean);
        this.refresh();
      },

      /**
       * Die Gruppenspalten des Modus k ersetzen; die Reihenfolge ist die der Gruppen.
       * @agent
       * @param {'colRefsK'} slot der Slot; nur im Modus k
       * @param {Array<{ instanceId: string, sheetId: string, columnId: string }>} refs
       *   die Spaltenbezüge wählbarer Spalten; `[]` leert die Auswahl
       * @returns {void}
       * @throws {Error} wenn `slot` im aktuellen Modus nicht gilt, `refs` keine Liste ist oder eine Spalte nicht wählbar ist
       */
      setColumns(slot, refs) {
        requireEnum('slot', slot, this.activeMultiSlots());
        if (!Array.isArray(refs)) {
          throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: a list of column references, [] clears it`);
        }
        const keys = this.pickableColumns()[slot].map((c) => c.key);
        for (const ref of refs) requireKnownId('ref', refToKey(ref), keys);
        const clean = [...new Set(refs.map(refToKey))].map(keyToRef);
        MULTI_SINKS[slot](this.model, clean);
        pickerBySlot[slot]?.syncValue(clean);
        this.refresh();
      },

      /**
       * Eingabefeld → Senke: ein Wert, den der Prüfer abweist, setzt das Feld auf
       * den Stand des Models zurück.
       * @noagent DOM event handler; the agent uses setParam()
       */
      onParamInput(key, event) {
        const raw = event.target.value;
        try {
          PARAM_CHECKS[key](raw);
        } catch {
          event.target.value = this.paramValue(key);
          return;
        }
        this.setParam(key, raw);
      },

      /** @noagent view transform; der Stand eines Parameters für das Eingabefeld */
      paramValue(key) {
        return key.split('.').reduce((o, k) => o[k], this.model);
      },

      /** @noagent view transform; die Statistiken des Modus (eine Quelle: STATS_BY_MODE) */
      statisticChoices() {
        return this.statisticOptions().map((v) => ({ value: v, label: _t(STATISTIC_LABEL_KEYS[v]) }));
      },
      /** @noagent view transform; die Kontraste (eine Quelle: CONTRASTS) */
      contrastChoices() { return CONTRASTS.map((v) => ({ value: v, label: _t(CONTRAST_LABEL_KEYS[v]) })); },
      /** @noagent view transform; die Alternativen (eine Quelle: DIRECTIONS) */
      directionChoices() { return DIRECTIONS.map((v) => ({ value: v, label: _t(DIRECTION_LABEL_KEYS[v]) })); },
      /** @noagent view transform; die Intervallmethoden (eine Quelle: CI_METHODS) */
      ciMethodChoices() { return CI_METHODS.map((v) => ({ value: v, label: _t(CI_METHOD_LABEL_KEYS[v]) })); },

      /** @noagent view transform */
      isMode(mode) { return this.model.mode === mode; },
      /** @noagent view transform */
      showTrim() { return this.model.statisticId === 'trimmedMean'; },
      /** @noagent view transform */
      showQuantileP() { return this.model.statisticId === 'quantile'; },
      /** @noagent view transform */
      showLimits() { return this.model.statisticId === 'ppk'; },
      /** @noagent view transform */
      showContrast() { return this.model.mode === 'two'; },
      /** @noagent view transform */
      showTarget() { return this.model.mode === 'one'; },
      /** @noagent view transform */
      showDirection() { return this.model.mode === 'two' || this.model.mode === 'paired'; },
      /** @noagent view transform */
      showValidation() { return Boolean(this.validationKey) && this.model.hasContent(); },
      /** @noagent helper; ob ein Lauf starten darf */
      canCompute() { return !this.running && !this.validationKey; },
      /** @noagent view transform */
      sampleLabelKey(which) {
        if (this.model.mode === 'paired') return which === 1 ? 'pairedXColumn' : 'pairedYColumn';
        if (this.model.mode === 'two') return which === 1 ? 'group1Column' : 'group2Column';
        return 'sampleColumn';
      },

      /** @noagent DOM event handler; the agent uses setParam('mode', …) */
      setMode(mode) { this.setParam('mode', mode); },

      /**
       * Einen neuen Startwert ziehen (1 bis 2147483647).
       * @agent
       * @returns {void}
       */
      rollSeed() { this.model.rollSeed(); this.refresh(); },

      /** @noagent helper; Validierung, Hash, Veraltet-Anzeige und Ergebnisansicht neu berechnen */
      refresh() {
        const inputs = readInputs(this.model, valuesOf);
        this.validationKey = validateInputs(this.model, inputs);
        this.currentHash = computeInputsHash(this.model, inputs);
        this.stale = this.model.isStale(this.currentHash);
        const opts = { ciMethod: this.model.ciMethod, target: this.model.target };
        this.view = resultView(this.model.result, opts);
        this.statement = statementParts(this.model.result, opts);
      },

      /**
       * Hilfeschlüssel der Spalten Schätzwert, beobachtetes T, p-Wert und
       * Permutationen der Ergebnistabelle — im Aufbau k zeigen sie Werte aus
       * dem k-Ergebnis, sonst aus Bootstrap bzw. Permutationstest.
       * @noagent Anzeige
       * @param {'estimate'|'observed'|'pValue'|'permutations'} prop Spalte
       * @returns {string}
       */
      resultHelp(prop) {
        if (this.view && this.view.isK) return `${HELP}KResult.${prop}`;
        return `${HELP}${prop === 'estimate' ? 'Boot' : 'Perm'}.${prop}`;
      },

      /** @noagent view transform; Kernaussage als ein übersetzter Absatz */
      statementText() { return renderStatement(this.statement, _t); },

      _labels() {
        const sm = module._context.stateManager;
        const refs = this.model.mode === 'k' ? this.model.colRefsK
          : this.model.mode === 'one' ? [this.model.colRef1]
            : [this.model.colRef1, this.model.colRef2];
        return refs.map((r) => getColumnName(sm, r));
      },

      /**
       * Rechnet auf Anforderung; kehrt nach dem letzten Durchlauf zurück. Bei
       * ungültigen oder unvollständigen Eingaben rechnet es nicht — validationMsg
       * nennt den Grund, result bleibt, wie es war. Läuft schon ein Lauf
       * (read().running ist true), kehrt es ebenfalls ohne Rechnen zurück;
       * validationMsg ist dann leer. Ein Abbruch lässt result unverändert.
       * @agent
       * @returns {Promise<void>}
       */
      async compute() {
        if (!this.canCompute()) return;
        this.refresh();
        if (this.validationKey) return;
        // Snapshot: the inputs stay editable during the run, so everything the run
        // computes and summarizes must come from the settings at its start.
        const snap = State.fromJSON(this.model.toJSON());
        const labels = this._labels();
        const inputs = readInputs(snap, valuesOf);
        const hash = computeInputsHash(snap, inputs);
        const jobs = buildJobs(snap, inputs);
        const runner = mod.runnerFactory();
        abortCtl = new AbortController();
        const { signal } = abortCtl;
        this.running = true;
        this.progress = 0;
        this.errorKey = null;
        const outcomes = [];
        try {
          for (let i = 0; i < jobs.length; i++) {
            const result = await runner.run(jobs[i].job, {
              signal,
              onProgress: (done, total) => { this.progress = (i + (total ? done / total : 0)) / jobs.length; },
            });
            outcomes.push({ role: jobs[i].role, result });
          }
          this.model.result = summarize(snap, inputs, outcomes, hash, labels);
          this.runCount++;
        } catch (err) {
          if (!(err && err.name === 'AbortError')) {
            this.errorKey = err && err.code ? errorKeyForCode(err.code, snap.statisticId) : 'errUnexpected';
          }
        } finally {
          this.running = false;
          this.progress = 0;
          abortCtl = null;
          this.refresh();
        }
      },

      /**
       * Einen laufenden Lauf abbrechen; result bleibt, wie es war. Ohne Lauf
       * geschieht nichts.
       * @agent
       * @returns {void}
       */
      cancel() {
        if (abortCtl) abortCtl.abort();
      },

      /** @noagent view transform; zeichnet die Diagramme */
      async renderCharts() {
        const gen = ++renderGen;
        destroyCharts();
        const summary = this.model.result;
        if (!summary) return;
        const specs = [
          ['[data-ref="chart-boot"]', bootChartConfig(summary, this.model.ciMethod, _t)],
          ['[data-ref="chart-perm"]', permChartConfig(summary, _t)],
        ];
        for (const [selector, cfg] of specs) {
          const el = module._container.querySelector(selector);
          if (!el || !cfg) continue;
          const chart = await chartManager().create(el, 'histogram', cfg);
          if (gen !== renderGen) {
            if (chart) { try { chartManager().destroy(chart); } catch { /* ignore */ } }
            return;
          }
          if (chart) charts.push(chart);
        }
      },

      // ── ColumnPickers (imperative widgets) ─────────────────────

      _remountPickers() {
        disposePickers();
        const ctx = module._context;
        const c = module._container;
        const single = (selector, key) => {
          const wrap = c.querySelector(selector);
          if (!wrap) return;
          const picker = new ColumnPicker(wrap, ctx, {
            mode: 'single', ...SLOT_FILTERS[key],
            onChange: (ref) => { this.setColumn(key, ref); },
          });
          if (this.model[key]) picker.value = this.model[key];
          pickers.push(picker);
          pickerBySlot[key] = picker;
        };
        single('[data-ref="picker1-wrap"]', 'colRef1');
        single('[data-ref="picker2-wrap"]', 'colRef2');
        const wrapK = c.querySelector('[data-ref="picker-k-wrap"]');
        if (wrapK) {
          const picker = new ColumnPicker(wrapK, ctx, {
            mode: 'multi', ...SLOT_FILTERS.colRefsK,
            onChange: (refs) => {
              // Veraltete Einträge (Spalte nicht mehr wählbar) fallen heraus, sonst weist die Senke die ganze Liste ab.
              const keys = this.pickableColumns().colRefsK.map((x) => x.key);
              this.setColumns('colRefsK', refs.filter((r) => keys.includes(refToKey(r))));
            },
          });
          if (this.model.colRefsK.length) picker.value = this.model.colRefsK;
          pickers.push(picker);
          pickerBySlot.colRefsK = picker;
        }
      },

      // ── Lifecycle ──────────────────────────────────────────────

      /** @noagent lifecycle */
      init() {
        unsubs = [];
        this.refresh();
        this.$watch(() => JSON.stringify(this.model.toJSON()), () => this.refresh());
        this.$watch(() => this.model.result, () => this.$nextTick(() => this.renderCharts()));
        this.$watch(() => this.model.ciMethod, () => this.$nextTick(() => this.renderCharts()));
        this.$nextTick(() => { this._remountPickers(); this.renderCharts(); });

        const eb = module._context.eventBus;
        const own = `module:${module._context.instanceId}`;
        const onData = (payload) => {
          if (typeof payload === 'string' && payload.startsWith(own)) return;
          this.refresh();
        };
        const onActivated = ({ instanceId }) => {
          if (instanceId !== module._context.instanceId) return;
          for (const p of pickers) p.refresh();
          this.refresh();
        };
        eb.on('data:changed', onData);
        eb.on('module:activated', onActivated);
        unsubs.push(() => eb.off('data:changed', onData));
        unsubs.push(() => eb.off('module:activated', onActivated));
      },

      /** @noagent lifecycle */
      destroy() {
        if (abortCtl) abortCtl.abort();
        abortCtl = null;
        renderGen++;
        destroyCharts();
        disposePickers();
        for (const unsub of unsubs) unsub();
        unsubs = [];
      },
    };
  },
});

/** Runner used by `compute()`; tests and a future worker runner replace it. */
mod.runnerFactory = () => createInlineRunner();

/**
 * Custom loadExample: resampling catalog examples ship a full worksheet and use
 * the placeholder `__source__` as the `instanceId` of every column ref.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId } : r;
      const out = { ...data };
      if (out.colRef1) out.colRef1 = rewrite(out.colRef1);
      if (out.colRef2) out.colRef2 = rewrite(out.colRef2);
      if (Array.isArray(out.colRefsK)) out.colRefsK = out.colRefsK.map(rewrite);
      return out;
    },
  });
};

export default mod;
