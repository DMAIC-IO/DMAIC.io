/**
 * DMAIC.io — MSA Typ 4 Module (msa-typ4.js)
 * Measure phase: Linearity + bias analysis over the measurement range.
 *
 * Data source: two columns from a Worksheet module
 *   (reference value, measured value).
 *
 * Migrated to createModule + Alpine CSP. The Model (msa-typ4-model.js) holds
 * only the raw inputs (name/unit/norm/pvMode/tolerance/sigmaP/alpha + two
 * column references); the linearity result is derived transiently in the view
 * from those inputs plus the live worksheet column values via the shared
 * engine. ColumnPickers and the SVG charts are mounted imperatively (they
 * are not pure-template concerns).
 *
 * Spec: docs/modules/MSA-TYP4.md
 *
 * @agent  Steuerbar über das Viewmodel: die acht Parameter (setParam, auch der
 *   Punkt-Schlüssel der Toleranz), die zwei Spalten Referenz und Messwert
 *   (setColumn) und das Rechnen selbst. Gelesen wird über read() mit erklärter
 *   Lesefläche (AgentRead) — Konfiguration, wählbare Mengen und gerechnetes
 *   Ergebnis. Der Agent bekommt Zahlen, keine Diagramme.
 */

import { toNum } from '../../core/chart/chart-data-prep.js';
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { setAtPath } from '../../core/agent/agent-path.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, NORM_OPTIONS, PV_OPTIONS, ALPHA_OPTIONS } from './msa-typ4-model.js';
import { analyze } from '../../engines/msa-typ4-engine.js';
import { ColumnPicker, getColumnValues, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { decimalOr } from '../../core/parse-decimal.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '–'; }

/** @param {number} p @returns {string} */
function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return '–';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

/** Die acht Parameter, die `setParam` kennt; die Toleranz als Punkt-Schlüssel. */
const PARAM_KEYS = ['name', 'unit', 'norm', 'pvMode', 'tolerance.LSL', 'tolerance.USL', 'sigmaP', 'alpha'];

/** Je Parameter sein Prüfer; freie Texte nehmen nur eine Zeichenkette an. */
const PARAM_CHECKS = {
  name: (v) => requireText('value', v),
  unit: (v) => requireText('value', v),
  norm: (v) => requireEnum('value', v, NORM_OPTIONS),
  pvMode: (v) => requireEnum('value', v, PV_OPTIONS),
  'tolerance.LSL': (v) => requireText('value', v),
  'tolerance.USL': (v) => requireText('value', v),
  sigmaP: (v) => requireText('value', v),
  alpha: (v) => requireEnum('value', v, ALPHA_OPTIONS),
};

/** Die Spalten-Slots dieses Moduls: Referenz- und Messwertspalte. */
const COLUMN_SLOTS = ['reference', 'measured'];

/** Je Slot der Filter, den der Wähler dieses Slots bekommt. */
const SLOT_FILTERS = { reference: { types: ['numeric'] }, measured: { types: ['numeric'] } };

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = {
  reference: (m, ref) => { m.refColumn = ref; },
  measured: (m, ref) => { m.measColumn = ref; },
};

/**
 * Die Schlüsselfläche von `setParam`. Die Toleranzgrenzen tragen den Punkt
 * im Schlüssel; im Model liegen sie unter `params.tolerance`. Sätze je
 * Schlüssel unter `types.Params.<schlüssel>` (Punkt = Verschachtelung in
 * i18n), dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {string} name  Bezeichnung des Merkmals
 * @property {string} unit  Maßeinheit
 * @property {'AIAG'|'VDA5'} norm  Bewertungsnorm
 * @property {'tolerance'|'sixSigma'} pvMode  Bezugsgröße der Prozessstreuung
 * @property {string} tolerance.LSL  untere Toleranzgrenze
 * @property {string} tolerance.USL  obere Toleranzgrenze
 * @property {string} [sigmaP]  Prozessstandardabweichung, nur im Modus sixSigma
 * @property {'0.01'|'0.05'|'0.10'} alpha  Signifikanzniveau
 */

/**
 * Das gerechnete Ergebnis (`analyze()` aus `engines/msa-typ4-engine.js`),
 * wie `read().result` es liefert — ohne `regression.ciBand` (eine Funktion,
 * fällt beim Klonen weg). Unendliche Werte kommen als leer an.
 *
 * @typedef {object} Result
 * @property {boolean} ok  immer wahr, wenn ein Ergebnis da ist
 * @property {ReferencePoint[]} perReference  je Referenzwert
 * @property {Regression} regression  Gerade Bias über Referenzwert
 * @property {Kpi} kpi  Kennzahlen beider Normen
 * @property {ProcessVariation} pv  Bezugsgröße der Prozentwerte
 * @property {Interpretation} interpretation  Deutung als Satz
 */

/**
 * @typedef {object} ReferencePoint
 * @property {number} xRef  Referenzwert
 * @property {number} n  Wiederholungen
 * @property {number} mean  Mittelwert
 * @property {number} bias  Mittelwert minus Referenzwert
 * @property {number} sd  Standardabweichung
 * @property {number|null} tStat  Prüfgröße
 * @property {number} pValue  p-Wert
 * @property {number} percentBias  Bias in % der Bezugsgröße
 * @property {'green'|'yellow'|'red'} verdict  Ampel
 */

/**
 * @typedef {object} Regression
 * @property {number} slope  Steigung
 * @property {number} intercept  Achsenabschnitt
 * @property {number} seSlope  Standardfehler der Steigung
 * @property {number} seIntercept  Standardfehler des Achsenabschnitts
 * @property {number} tSlope  Prüfgröße der Steigung
 * @property {number} tIntercept  Prüfgröße des Achsenabschnitts
 * @property {number} pSlope  p-Wert der Steigung
 * @property {number} pIntercept  p-Wert des Achsenabschnitts
 * @property {number} MSE  mittleres Fehlerquadrat
 * @property {number} N  Anzahl Messwerte
 * @property {number} dfResid  Freiheitsgrade der Residuen
 * @property {number[]} ciSlope  Konfidenzintervall der Steigung
 * @property {number[]} ciIntercept  Konfidenzintervall des Achsenabschnitts
 */

/**
 * @typedef {object} Kpi
 * @property {KpiAiag} aiag  Kennzahlen nach AIAG
 * @property {KpiVda5} vda5  Kennzahlen nach VDA 5
 */

/**
 * @typedef {object} KpiAiag
 * @property {number} percentLinearity  %Linearität
 * @property {number} maxPercentBias  größter %Bias
 * @property {boolean} slopeSignificant  Steigung signifikant
 * @property {boolean} interceptSignificant  Achsenabschnitt signifikant
 * @property {Verdict} verdict  Urteil
 */

/**
 * @typedef {object} KpiVda5
 * @property {number} u_BI  Unsicherheit aus Bias und Linearität
 * @property {number} U  erweiterte Unsicherheit
 * @property {number|null} Q_MS_BI  Eignungskennwert
 * @property {Verdict} verdict  Urteil
 */

/**
 * @typedef {object} Verdict
 * @property {'green'|'yellow'|'red'} color  Ampel
 * @property {string} key  Textschlüssel des Urteils
 */

/**
 * @typedef {object} ProcessVariation
 * @property {'tolerance'|'sixSigma'} mode  Bezugsart
 * @property {number} value  Bezugsgröße
 * @property {'tolerance'|'sixSigma'} source  gleich mode
 */

/**
 * @typedef {object} Interpretation
 * @property {string} textKey  Textschlüssel der Deutung
 * @property {InterpretationParams} params  Werte im Satz
 */

/**
 * @typedef {object} InterpretationParams
 * @property {string} [pctLin]  %Linearität, nur AIAG
 * @property {string} [maxPctBias]  größter %Bias, nur AIAG
 * @property {string} [qMsBi]  Eignungskennwert, nur VDA 5
 */

/** Präfix der Kontexthilfe je KPI-Kachel (`types.<Typedef>.<property>`). */
const HELP = 'modules.msa-typ4.types.';

/**
 * Die Agenten-Lesefläche von MSA Typ 4.
 *
 * Nicht die persistierte Form: das Model hält NUR die Eingaben, das Ergebnis
 * entsteht transient am Viewmodel (`result`). Darum erklärt dieses Modul seine
 * Lesefläche: Konfiguration, die abgeleiteten Mengen, die `setParam` und
 * `setColumn` prüfen, und das Ergebnis — ohne die interne
 * Beispiel-Buchführung (`exampleWorksheetId`) und ohne die Diagramme.
 *
 * @typedef {object} AgentRead
 * @property {object} params  the entered parameters (name, unit, norm, pvMode, tolerance { LSL, USL }, sigmaP, alpha), values as text as entered
 * @property {object|null} refColumn  the chosen reference column, `{ instanceId, sheetId, columnId }`, or null
 * @property {object|null} measColumn  the chosen measured column, `{ instanceId, sheetId, columnId }`, or null
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state (`sigmaP` only outside the tolerance mode)
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumn` accepts, each `{ key, name }`
 * @property {Result|null} result  the computed result, or null while the inputs are incomplete or invalid
 */
const mod = createModule({
  config: {
    id: 'msa-typ4',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.msa-typ4',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      errorMsg: '',
      _pickers: {},
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,
      _lastRef: null,
      _lastMeas: null,

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, wählbare Mengen und gerechnetes Ergebnis
       */
      read(options) {
        return readAgentState('msa-typ4', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          result: this.result,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return PARAM_KEYS.filter(k => k !== 'sigmaP' || !this.isTolerance()); },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return Object.fromEntries(COLUMN_SLOTS.map(slot =>
          [slot, pickableColumnList(sm, SLOT_FILTERS[slot])]));
      },

      /**
       * Einen Parameter setzen.
       * @agent
       * @param {keyof Params} key welcher Parameter; die im Zustand zulässigen nennt `activeParams`
       * @param {string} value der Wert als Text, wie er eingegeben würde; Wertebereich je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` im aktuellen Zustand kein Parameter ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        PARAM_CHECKS[key](value);
        setAtPath(this.model.params, key, value);
        this.scheduleAnalysis();
      },

      /**
       * Eine Spalte einem Slot zuweisen.
       * @agent
       * @param {'reference'|'measured'} slot der Slot
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
          this.scheduleAnalysis();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._pickers[slot]?.syncValue(clean);
        this.scheduleAnalysis();
      },

      // ── View transformations ──────────────────────────────────

      /** @noagent view transform */
      fmt,
      /** @noagent view transform */
      fmtP,

      /** @noagent view transform; die Optionen der Norm-Auswahl (eine Quelle: NORM_OPTIONS) */
      normOptions() {
        const keys = { AIAG: 'labels.normAiag', VDA5: 'labels.normVda' };
        return NORM_OPTIONS.map(v => ({ value: v, label: _t(keys[v]) }));
      },
      /** @noagent view transform; die Optionen der PV-Auswahl (eine Quelle: PV_OPTIONS) */
      pvOptions() {
        const keys = { tolerance: 'labels.pvModeTolerance', sixSigma: 'labels.pvModeSixSigma' };
        return PV_OPTIONS.map(v => ({ value: v, label: _t(keys[v]) }));
      },
      /** @noagent view transform; die Alpha-Optionen des Auswahlfeldes */
      alphaOptions() { return ALPHA_OPTIONS; },
      /** @noagent view transform */
      isTolerance() { return this.model.params.pvMode === 'tolerance'; },
      /** @noagent view transform */
      isAiag()      { return this.model.params.norm !== 'VDA5'; },
      /** @noagent view transform */
      isVda()       { return this.model.params.norm === 'VDA5'; },

      /** Current-norm KPI block (AIAG or VDA5). */
      _currentKpi() {
        if (!this.result) return null;
        return this.isVda() ? this.result.kpi.vda5 : this.result.kpi.aiag;
      },

      /** @noagent view transform */
      currentVerdictColor() {
        const k = this._currentKpi();
        return k ? k.verdict.color : 'green';
      },

      /** @noagent view transform */
      interpretationClass() {
        return `msa-typ4__interp msa-typ4__interp--${this.currentVerdictColor()}`;
      },

      /** @noagent view transform */
      interpretationText() {
        if (!this.result) return '';
        const i = this.result.interpretation;
        return _t(i.textKey, i.params);
      },

      /** @noagent view transform */
      kpiModClass(color) {
        const map = { green: 'dmike-kpi--good', yellow: 'dmike-kpi--warn', red: 'dmike-kpi--bad' };
        return map[color] || '';
      },

      /**
       * Compose the KPI-strip tiles for the currently selected norm. Kept in a
       * single data-fn to avoid conditional-branch soup in the template.
       * @noagent view transform
       * @returns {Array<{ key:string, mod:string, help:string, label:string, value:string, sub:string }>}
       */
      kpiTiles() {
        const r = this.result;
        if (!r) return [];
        const isVda = this.isVda();
        const tiles = [];
        if (isVda) {
          const k = r.kpi.vda5;
          const mod = this.kpiModClass(k.verdict.color);
          tiles.push(
            { key: 'uBi',   mod, help: `${HELP}KpiVda5.u_BI`, label: _t('kpi.uBi'),   value: fmt(k.u_BI, 4), sub: '' },
            { key: 'u',     mod, help: `${HELP}KpiVda5.U`, label: _t('kpi.u'),     value: fmt(k.U, 4),    sub: '' },
            { key: 'qmsbi', mod, help: `${HELP}KpiVda5.Q_MS_BI`, label: _t('kpi.qMsBi'), value: `${fmt(k.Q_MS_BI, 2)} %`, sub: _t(k.verdict.key) },
          );
        } else {
          const k = r.kpi.aiag;
          const mod = this.kpiModClass(k.verdict.color);
          const slopeMod = k.slopeSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good';
          const intMod   = k.interceptSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good';
          tiles.push(
            { key: 'lin',   mod, help: `${HELP}KpiAiag.percentLinearity`, label: _t('kpi.percentLinearity'), value: `${fmt(k.percentLinearity, 2)} %`, sub: _t(k.verdict.key) },
            { key: 'slope', mod: slopeMod, help: `${HELP}Regression.slope`, label: _t('kpi.slope'),     value: fmt(r.regression.slope, 4),     sub: `p = ${fmtP(r.regression.pSlope)}` },
            { key: 'int',   mod: intMod,   help: `${HELP}Regression.intercept`, label: _t('kpi.intercept'), value: fmt(r.regression.intercept, 4), sub: `p = ${fmtP(r.regression.pIntercept)}` },
          );
        }
        // %Bias-Peak wird aus dem AIAG-Block gelesen — auch im VDA-Modus sinnvoll.
        tiles.push({
          key: 'maxBias', mod: '',
          help: `${HELP}KpiAiag.maxPercentBias`,
          label: _t('kpi.maxPercentBias'),
          value: `${fmt(r.kpi.aiag.maxPercentBias, 2)} %`,
          sub: '',
        });
        return tiles;
      },

      /** @noagent view transform; Per-reference table rows (view-formatted). */
      tableRows() {
        const r = this.result;
        if (!r || !r.perReference) return [];
        return r.perReference.map((p) => ({
          key: `${p.xRef}`,
          rowClass: `msa-typ4__row--${p.verdict}`,
          xRef: fmt(p.xRef, 3),
          n: p.n,
          mean: fmt(p.mean, 4),
          bias: fmt(p.bias, 4),
          percentBias: `${fmt(p.percentBias, 2)} %`,
          tStat: fmt(p.tStat, 2),
          pValue: fmtP(p.pValue),
        }));
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      /**
       * Build aligned {reference, measured} arrays from the two selected
       * worksheet columns, dropping rows where either value is missing/non-numeric.
       * @returns {{reference:number[], measured:number[]} | null}
       */
      _buildDataArrays() {
        const sm = module._context.stateManager;
        const rawRef = getColumnValues(sm, this.model.refColumn);
        const rawMeas = getColumnValues(sm, this.model.measColumn);

        const reference = [], measured = [];
        const len = Math.min(rawRef.length, rawMeas.length);
        for (let i = 0; i < len; i++) {
          const r = typeof rawRef[i] === 'number' ? rawRef[i]
                    : toNum(String(rawRef[i] ?? '').replace(',', '.'));
          const m = typeof rawMeas[i] === 'number' ? rawMeas[i]
                    : toNum(String(rawMeas[i] ?? '').replace(',', '.'));
          if (!Number.isFinite(r) || !Number.isFinite(m)) continue;
          reference.push(r);
          measured.push(m);
        }
        if (reference.length === 0) return null;
        return { reference, measured };
      },

      /**
       * Run analysis if both columns are selected; otherwise silently clear
       * results (mirrors msa-typ1/msa-typ2 auto-analysis behaviour).
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this.errorMsg = '';
        if (!this.model.refColumn || !this.model.measColumn) return this.clearResults();
        const data = this._buildDataArrays();
        if (!data) return this.clearResults();

        this._lastRef = data.reference;
        this._lastMeas = data.measured;

        const p = this.model.params;
        const flat = {
          pvMode: p.pvMode,
          LSL: decimalOr(p.tolerance.LSL, NaN),
          USL: decimalOr(p.tolerance.USL, NaN),
          sigmaP: decimalOr(p.sigmaP, NaN),
          alpha: decimalOr(p.alpha, NaN),
          norm: p.norm,
        };
        const res = analyze(data.reference, data.measured, flat);
        if (!res.ok) return this.clearResults();

        this.result = res;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(res, gen));
      },

      /**
       * Die Rechnung nach kurzer Ruhezeit anstoßen.
       * @agent
       * @returns {void}
       */
      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), 600);
      },

      /**
       * Das Ergebnis und die Diagramme verwerfen.
       * @agent
       * @returns {void}
       */
      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── SVG charts (imperative via chartManager) ──────────────

      async _renderCharts(res, gen) {
        this._destroyCharts();
        await this._renderLinearityChart(res, gen);
        if (gen !== this._renderGen) return;
        await this._renderPctBiasChart(res, gen);
        if (gen !== this._renderGen) return;
        await this._renderPerRefDotChart(res, gen);
        if (gen !== this._renderGen) return;
        // Residuen-Chart erst rendern, wenn der Anwender <details> öffnet.
        const det = module._container.querySelector('[data-ref="residuals-details"]');
        if (!det) return;
        if (det.open) {
          await this._renderResidualChart(res, gen);
        } else if (!det.__msa4Bound) {
          det.__msa4Bound = true;
          det.addEventListener('toggle', () => {
            if (det.open) this._renderResidualChart(this.result, ++this._renderGen);
          }, { once: true });
        }
      },

      /**
       * Linearitäts-Plot: Bias-Punkte, Regressionsgerade und 95 %-KI-Band
       * über den Messbereich. KI-Band wird über errorBars.bandShow der
       * Fit-Serie realisiert (deltas relativ zu ŷ).
       */
      async _renderLinearityChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-linearity"]');
        if (!host) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        // Einzel-Bias-Punkte
        const biasX = ref.slice();
        const biasY = ref.map((x, i) => meas[i] - x);

        // Regressionsgerade + KI-Band als Deltas relativ zum Fit
        const xMin = Math.min(...ref);
        const xMax = Math.max(...ref);
        const steps = 40;
        const fitX = new Array(steps + 1);
        const fitY = new Array(steps + 1);
        const yPlus = new Array(steps + 1);
        const yMinus = new Array(steps + 1);
        for (let i = 0; i <= steps; i++) {
          const x = xMin + (xMax - xMin) * (i / steps);
          const yhat = res.regression.slope * x + res.regression.intercept;
          const [lo, hi] = res.regression.ciBand(x);
          fitX[i] = x;
          fitY[i] = yhat;
          yPlus[i] = Math.max(0, hi - yhat);
          yMinus[i] = Math.max(0, yhat - lo);
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          editKey: 'linearity',
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('table.bias'),
          series: [
            {
              name: _t('table.bias'),
              color: 'var(--color-accent)',
              x: biasX, y: biasY,
              symbol: 'circle', strokeWidth: 1.5,
            },
            {
              name: 'Fit',
              color: 'var(--color-info)',
              x: fitX, y: fitY,
              markerSize: 0,
              connectLine: { show: true, width: 1.5, dash: 'solid', color: 'var(--color-info)' },
              errorBars: {
                show: true, bandShow: true, yMode: 'absolute',
                yPlus, yMinus,
                // Helles CSS-Variable statt rgba() → per Memory feedback_svg_rgba
                // wird das SVG-fill-Attribut ohne fill-opacity befüllt.
                bandColor: 'var(--color-accent-light)',
              },
            },
          ],
          refLines: [
            { dir: 'h', value: 0, label: '0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * %Bias-Plot mit ±5 %-Toleranzband. Vorzeichenbehafteter %Bias =
       * percentBias * sign(bias) (percentBias speichert |bias| relativ zu PV).
       */
      async _renderPctBiasChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-pctbias"]');
        if (!host) return;
        if (!res.perReference || res.perReference.length === 0) return;

        const xs = res.perReference.map(p => p.xRef);
        const ys = res.perReference.map(p => (Number.isFinite(p.percentBias) ? p.percentBias * Math.sign(p.bias) : 0));

        const chart = await module._context.chartManager.create(host, 'scatter', {
          editKey: 'pct-bias',
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('table.percentBias'),
          series: [
            {
              name: _t('table.percentBias'),
              color: 'var(--color-warning)',
              x: xs, y: ys,
              symbol: 'circle', strokeWidth: 1.5,
            },
          ],
          refLines: [
            { dir: 'h', value: 0,  label: '0',    dash: 'dash', width: 1,   color: 'var(--color-text-secondary)' },
            { dir: 'h', value: 5,  label: '+5 %', dash: 'dot',  width: 1.2, color: 'var(--color-success)' },
            { dir: 'h', value: -5, label: '−5 %', dash: 'dot',  width: 1.2, color: 'var(--color-success)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * Dot-Plot: Messwerte je Referenzpunkt sowie Zellenmittelwert
       * (Diamond-Marker). Zeigt visuell, wo Bias und Streuung sitzen.
       */
      async _renderPerRefDotChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-per-ref"]');
        if (!host) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        const meanX = res.perReference.map(p => p.xRef);
        const meanY = res.perReference.map(p => p.mean);

        const chart = await module._context.chartManager.create(host, 'scatter', {
          editKey: 'per-ref',
          showLegend: true,
          xLabel: _t('labels.referenceColumn'),
          yLabel: _t('labels.measuredColumn'),
          series: [
            {
              name: _t('labels.measuredColumn'),
              color: 'var(--color-accent)',
              x: ref.slice(), y: meas.slice(),
              symbol: 'circle', strokeWidth: 1.5,
            },
            {
              name: _t('table.mean'),
              color: 'var(--color-text-primary)',
              x: meanX, y: meanY,
              symbol: 'diamond', strokeWidth: 1.5, markerSize: 10,
            },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      /**
       * Residuen-Chart: Residuum = bias(i) − ŷ(x_i) über ŷ. Erlaubt
       * visuelle Prüfung der Modell-Restfehler (Muster ⇒ Nicht-Linearität).
       */
      async _renderResidualChart(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-residuals"]');
        if (!host || !res) return;
        const ref = this._lastRef, meas = this._lastMeas;
        if (!ref || !meas || ref.length === 0) return;

        const xs = new Array(ref.length);
        const ys = new Array(ref.length);
        for (let i = 0; i < ref.length; i++) {
          const b = meas[i] - ref[i];
          const yhat = res.regression.slope * ref[i] + res.regression.intercept;
          xs[i] = yhat;
          ys[i] = b - yhat;
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          editKey: 'residual',
          showLegend: true,
          xLabel: 'ŷ',
          yLabel: _t('charts.residuals'),
          series: [
            {
              name: _t('charts.residuals'),
              color: 'var(--color-accent)',
              x: xs, y: ys,
              symbol: 'circle', strokeWidth: 1.5,
            },
          ],
          refLines: [
            { dir: 'h', value: 0, label: '0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      _destroyCharts() {
        const cm = module._context?.chartManager;
        for (const c of this._charts) {
          try { if (cm) cm.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPickers (imperative widgets) ────────────────────

      _mountPickers() {
        const pickerConfig = [
          { slot: 'reference', wrap: 'picker-ref' },
          { slot: 'measured', wrap: 'picker-meas' },
        ];
        for (const { slot, wrap } of pickerConfig) {
          const el = module._container.querySelector(`[data-ref="${wrap}"]`);
          if (!el) continue;
          this._pickers[slot]?.destroy();
          this._pickers[slot] = new ColumnPicker(el, module._context, {
            mode: 'single',
            ...SLOT_FILTERS[slot],
            onChange: (ref) => { this.setColumn(slot, ref); this.runAnalysis(); },
          });
          const current = slot === 'reference' ? this.model.refColumn : this.model.measColumn;
          if (current) this._pickers[slot].value = current;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];
        this._pickers = {};

        // Ensure module-scoped CSS is loaded (msa-typ4.css is not statically
        // linked from index.dist.html — matches the legacy pattern).
        if (!document.getElementById('msa-typ4-css')) {
          const link = document.createElement('link');
          link.id = 'msa-typ4-css';
          link.rel = 'stylesheet';
          link.href = new URL('js/modules/msa-typ4/msa-typ4.css', document.baseURI).href;
          document.head.appendChild(link);
        }

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            for (const picker of Object.values(this._pickers)) picker?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-run analysis whenever underlying worksheet data changes (cell
        // edits don't change the column selection, so the ColumnPicker's own
        // refresh() wouldn't catch them).
        const onDataChange = () => this.runAnalysis();
        eb.on('state:saved', onDataChange);
        eb.on('worksheet:dataChanged', onDataChange);
        this._unsubs.push(() => eb.off('state:saved', onDataChange));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onDataChange));

        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._debTimer);
        for (const picker of Object.values(this._pickers)) picker?.destroy();
        this._pickers = {};
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ4 examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `refColumn.instanceId` / `measColumn.instanceId`. On load we provision a
 * fresh worksheet, rewrite the placeholders, then apply state (which re-runs
 * the analysis on the new data).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      let out = data;
      for (const key of ['refColumn', 'measColumn']) {
        const r = out[key];
        if (r && r.instanceId === '__source__') {
          out = { ...out, [key]: { ...r, instanceId } };
        }
      }
      return out;
    },
  });
};

export default mod;
