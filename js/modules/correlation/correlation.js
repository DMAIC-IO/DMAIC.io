/**
 * D.Mike — Correlation Analysis Module (correlation.js)
 * Analyze phase: Pearson, Spearman, Kendall correlations.
 *
 * Migrated to createModule + Alpine CSP. The Model (correlation-model.js) holds
 * only persistence state (selected columns, confidence, matrix method, filters)
 * + thin orchestration that delegates ALL statistics to the unchanged engine
 * (engines/correlation-engine.js). The analysis RESULT is derived transiently
 * in the view and recomputed on every relevant change — it is NOT persisted.
 *
 * Output is declarative Alpine markup:
 *   - 2 columns → pairwise cards + descriptive/diagnostic stat grids
 *   - 3+ columns → correlation matrix (heatmap <table>) + per-pair scatter cards
 * The only imperative widgets are the chartManager scatter plots, mounted into
 * [data-ref] anchors and disposed in destroy() (sanctioned chart-tier exception).
 * The previous correlation-render.js subfile is gone — its table/card HTML is
 * now template, its chart config is now the data-fn chart helpers below.
 *
 * @agent  Steuerbar über das Viewmodel: die gewählten Spalten (setColumns,
 *   Reihenfolge zählt), die Parameter (setParam), das Rechnen (runAnalysis)
 *   und das Leeren der Ergebnisse (clearResults). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead) — Auswahl, Parameter, wählbare Spalten,
 *   Modus und Ergebnis. Der Agent bekommt Zahlen, keine Diagramme.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireNumber } from '../../core/agent/agent-argcheck.js';
import { State, METHODS, parseConfPercent, formatConfPercent } from './correlation-model.js';
import { isPickerFocused, refToKey, keyToRef } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

// Unicode glyphs carried over from the legacy innerHTML (kept out of x-text
// literals — Alpine CSP would emit \u-escapes verbatim).
const GLYPH_RHO = 'ρ';      // ρ
const GLYPH_TAU = 'τ';      // τ
const GLYPH_GE_R = '|r| ≥'; // |r| ≥
const GLYPH_LE_P = 'p ≤';   // p ≤
const EN_DASH = '–';        // –
const HEART_LR = '↔';       // ↔

/** Format a number to d decimals, with dashes / infinities like legacy. */
function fmt(v, d = 4) {
  if (v == null) return EN_DASH;
  if (v === Infinity) return '∞';        // ∞
  if (v === -Infinity) return '−∞'; // −∞
  if (Number.isNaN(v)) return EN_DASH;
  return v.toFixed(d);
}
function fmtP(p) {
  if (p == null || !isFinite(p)) return EN_DASH;
  return p < 0.0001 ? '< 0.0001' : p.toFixed(4);
}

const REC_NAMES = { pearson: 'Pearson r', spearman: `Spearman ${GLYPH_RHO}`, kendall: `Kendall ${GLYPH_TAU}` };

/** Zulässige Bereiche der Zahlenparameter (einzige Quelle für Setter und Oberfläche). */
const PARAM_RANGES = {
  // Wie die App-Einstellung (pages/settings/settings.js, clampConfPower 50–99.99 %),
  // die confidenceLevel vorbelegt: ein engerer Setter wiese den eigenen Zustand ab.
  confidenceLevel: { min: 0.5, max: 0.9999 },
  filterMinR: { min: 0, max: 1 },
  filterMaxP: { min: 0, max: 1 },
};

/** Leerform eines Feldes: das Feld ist leer oder `null`. */
const isEmptyForm = (v) => v === null || v === '';

/** Die Parameter, die `setParam` kennt; welche gelten, sagt `activeParams()`. */
const PARAM_KEYS = ['confidenceLevel', 'matrixMethod', 'filterMinR', 'filterMaxP'];

/** Die drei Schlüssel der Matrixansicht; sie gelten erst ab drei Spalten. */
const MATRIX_KEYS = ['matrixMethod', 'filterMinR', 'filterMaxP'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  confidenceLevel: (v) => requireNumber('value', v, PARAM_RANGES.confidenceLevel),
  matrixMethod: (v) => { requireEnum('value', v, METHODS); return v; },
  filterMinR: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, PARAM_RANGES.filterMinR)),
  filterMaxP: (v) => (isEmptyForm(v) ? null : requireNumber('value', v, PARAM_RANGES.filterMaxP)),
};

/**
 * Setzt einen Wert unter einem Schlüssel in `obj`. Lokal geschrieben, weil der
 * Generator (agent-data) Importe nicht liest und die Schreibstelle im Modul
 * selbst sehen muss.
 * @param {object} obj Wurzel, deren Schlüssel beschrieben wird
 * @param {string} key Schlüssel
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  obj[key] = value;
}

/** Die Mehrfachspalten dieses Moduls: genau eine Liste, die Auswahl. */
const MULTI_SLOTS = ['columns'];

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const MULTI_SINKS = { columns: (m, refs) => { m.colRefs = refs; } };

/** Präfix der Typedef-Sätze; Kacheln und Kennzahlen hängen ihren Schlüssel an. */
const HELP = 'modules.correlation.types.';

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {number} confidenceLevel  Konfidenzniveau als Anteil
 * @property {'pearson'|'spearman'|'kendall'} [matrixMethod]  Koeffizient der Matrix, nur ab drei Spalten
 * @property {number} [filterMinR]  Mindestbetrag des Koeffizienten, nur Matrix
 * @property {number} [filterMaxP]  Höchst-p-Wert, nur Matrix
 */

/**
 * Das paarweise Ergebnis (genau zwei Spalten), wie `read().result` es liefert.
 *
 * @typedef {object} PairResult
 * @property {number} n  Paare
 * @property {number} df  Freiheitsgrade n − 2
 * @property {number} confidenceLevel  Konfidenzniveau
 * @property {LinearStat} pearson  Pearson
 * @property {LinearStat} spearman  Spearman
 * @property {KendallStat} kendall  Kendall
 * @property {Descriptive} descriptive  Lage und Streuung
 * @property {Diagnostics} diagnostics  Voraussetzungen
 * @property {Recommendation} recommendation  empfohlener Koeffizient
 * @property {number[]} _x  gepaarte Werte X
 * @property {number[]} _y  gepaarte Werte Y
 * @property {string} _nameX  Name X
 * @property {string} _nameY  Name Y
 */

/**
 * @typedef {object} LinearStat
 * @property {number|null} r  Koeffizient
 * @property {number|null} t  t-Wert
 * @property {number|null} p  p-Wert
 * @property {number|null} r2  Bestimmtheitsmaß
 * @property {Array<number|null>} ci  Konfidenzintervall
 */

/**
 * @typedef {object} KendallStat
 * @property {number|null} tau  Kendalls τ
 * @property {number|null} z  z-Wert
 * @property {number|null} p  p-Wert
 * @property {number} concordant  konkordante Paare
 * @property {number} discordant  diskordante Paare
 * @property {Array<number|null>} ci  Konfidenzintervall
 */

/**
 * @typedef {object} Descriptive
 * @property {number|null} meanX  Mittelwert X
 * @property {number|null} meanY  Mittelwert Y
 * @property {number|null} stdX  Standardabweichung X
 * @property {number|null} stdY  Standardabweichung Y
 * @property {number|null} cov  Kovarianz
 */

/**
 * @typedef {object} Diagnostics
 * @property {Normality} normX  Normalität X
 * @property {Normality} normY  Normalität Y
 * @property {number|null} skewX  Schiefe X
 * @property {number|null} skewY  Schiefe Y
 * @property {number|null} kurtX  Wölbung X
 * @property {number|null} kurtY  Wölbung Y
 * @property {number|null} mono  Monotonie-Index
 * @property {number} outliers  Ausreißer
 */

/**
 * @typedef {object} Normality
 * @property {boolean} normal  normalverteilt
 * @property {number|null} jb  Jarque-Bera
 * @property {string} label  Urteil
 */

/**
 * @typedef {object} Recommendation
 * @property {'pearson'|'spearman'|'kendall'} best  empfohlen
 * @property {Reason[]} reasons  Gründe
 * @property {MethodScores} scores  Punkte je Koeffizient
 */

/**
 * @typedef {object} Reason
 * @property {boolean} ok  spricht für Pearson
 * @property {string} key  Kennung des Grunds
 * @property {object} [params]  Platzhalter
 */

/**
 * @typedef {object} MethodScores
 * @property {number} pearson  Pearson
 * @property {number} spearman  Spearman
 * @property {number} kendall  Kendall
 */

/**
 * Die Korrelationsmatrix (drei und mehr Spalten).
 *
 * @typedef {object} MatrixResult
 * @property {string[]} names  Spaltennamen
 * @property {MatrixByMethod} matrix  Koeffizienten
 * @property {object} ciMatrix  Konfidenzintervalle je Koeffizient
 * @property {object} pMatrix  p-Werte je Koeffizient
 * @property {Array<number[]>} nMatrix  Paare je Zelle
 * @property {MatrixPair[]} pairs  Rohwerte je Spaltenpaar
 */

/**
 * @typedef {object} MatrixByMethod
 * @property {Array<Array<number|null>>} pearson  Pearson
 * @property {Array<Array<number|null>>} spearman  Spearman
 * @property {Array<Array<number|null>>} kendall  Kendall
 */

/**
 * @typedef {object} MatrixPair
 * @property {number} i  erste Spalte
 * @property {number} j  zweite Spalte
 * @property {number[]} x  Werte der ersten
 * @property {number[]} y  Werte der zweiten
 */

/**
 * Die Agenten-Lesefläche von Correlation.
 *
 * Das Model hält die Eingaben flach; das Ergebnis entsteht transient am
 * Viewmodel. Darum erklärt dieses Modul seine Lesefläche — ohne die interne
 * Beispiel-Buchführung (`exampleWorksheetId`) und ohne Diagrammdaten.
 *
 * @typedef {object} AgentRead
 * @property {object[]} colRefs  the chosen columns in order, each `{ instanceId, sheetId, columnId }`; the first is X, the second Y
 * @property {number} confidenceLevel  confidence level as a fraction, for example 0.95
 * @property {'pearson'|'spearman'|'kendall'} matrixMethod  the method the correlation matrix shows
 * @property {number|null} filterMinR  the matrix hides pairs with |r| below this value; null means no filter
 * @property {number|null} filterMaxP  the matrix hides pairs with a p-value above this value; null means no filter
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeMultiSlots  the slots `setColumns` accepts in the current state
 * @property {object} pickableColumns  per slot the columns `setColumns` accepts, each `{ key, name }`
 * @property {'pairwise'|'matrix'|'none'} mode  'pairwise' with two columns, 'matrix' from three, 'none' otherwise or while no result exists
 * @property {PairResult|null} result  the pairwise analysis (two columns) or null
 * @property {MatrixResult|null} matrixResult  the correlation matrix (three or more columns) or null
 * @property {string} errorMsg  why the analysis gave no result, or an empty string
 */

const mod = createModule({
  config: {
    id: 'correlation',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.correlation',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Glyph constants exposed to the template ──────────────
      GLYPH_RHO, GLYPH_TAU, GLYPH_GE_R, GLYPH_LE_P,

      // ── Transient view state (never persisted) ───────────────
      result: null,         // pairwise engine result (or { error })
      matrixResult: null,   // raw matrix from model.computeMatrix
      matrixView: { names: [], rows: [] },
      cards: [],
      statGroups: [],
      filteredPairs: [],
      recTooltipLines: [],
      errorKey: null,
      _errN: 0,
      hoverRow: -1,
      hoverCol: -1,
      selectedPair: null,
      collapsedPairs: {},   // key → true when collapsed
      allCollapsed: false,
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      _lastFingerprint: null,

      // ── stateManager accessor ────────────────────────────────
      /** @noagent helper */
      sm() { return module._context?.stateManager; },

      // ── Column list ──────────────────────────────────────────
      /** @noagent view transform; der Agent liest read().pickableColumns */
      colGroups() { return this.model.columnGroups(this.sm()); },
      /** @noagent view transform */
      colKey(col) { return refToKey(col); },
      /** @noagent view transform */
      colDisplayName(col) {
        return col.columnName ? `${col.shortName} ${EN_DASH} ${col.columnName}` : col.shortName;
      },
      /** @noagent DOM event handler; the agent uses setColumns() */
      toggleColumn(col) {
        const key = refToKey(col);
        const keys = this.model.colRefs.map(refToKey);
        const pickable = this.pickableColumns().columns.map(c => c.key);
        // Veraltete Bezüge (Spalte nicht mehr wählbar) fallen heraus, sonst sperrten sie die Liste.
        const next = (keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key])
          .filter(k => pickable.includes(k));
        this.setColumns('columns', next.map(keyToRef));
      },

      // ── Selected-info hint ───────────────────────────────────
      /** @noagent view transform */
      selectedInfoText() {
        const n = this.model.colRefs.length;
        if (n === 0) return _t('selectMinTwo');
        if (n === 1) return _t('selectOneMore');
        if (n === 2) return _t('pairwiseMode');
        return _t('matrixMode', { n });
      },
      /** @noagent view transform */
      selectedInfoClass() {
        return this.model.colRefs.length < 2 ? 'corr__hint' : 'corr__col-info';
      },

      // ── Confidence level ─────────────────────────────────────
      /** @noagent view transform */
      confDisplay() { return formatConfPercent(this.model.confidenceLevel); },
      /** @noagent view transform */
      confPctText() { return String(Math.round(this.model.confidenceLevel * 100)); },
      /** @noagent DOM event handler; the agent uses setParam() */
      commitConf(event) {
        const input = event.target;
        const parsed = parseConfPercent(input.value);
        if (parsed != null && parsed !== this.model.confidenceLevel) {
          let ok = true;
          try { PARAM_CHECKS.confidenceLevel(parsed); } catch { ok = false; }
          if (ok) this.setParam('confidenceLevel', parsed);
        }
        input.value = formatConfPercent(this.model.confidenceLevel);
      },
      /** @noagent DOM event handler */
      confKeydown(event) {
        if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
      },

      // ── Error box ────────────────────────────────────────────
      /** @noagent view transform; der Agent liest read().errorMsg */
      errorText() {
        if (!this.errorKey) return '';
        if (this.errorKey === 'errMin4') return _t('errMin4', { n: this._errN ?? 0 });
        return _t(this.errorKey);
      },
      /** @noagent view transform */
      errorDisplay() { return this.errorKey ? 'display:block' : 'display:none'; },

      // ── Mode ─────────────────────────────────────────────────
      /** @noagent derived set; der Agent liest read().mode */
      mode() {
        const n = this.model.colRefs.length;
        if (n === 2 && this.result && !this.result.error) return 'pairwise';
        if (n > 2 && this.matrixResult) return 'matrix';
        return 'none';
      },

      // ── Auto-run (recompute + chart mount) ───────────────────
      /** @noagent helper; der Agent nutzt runAnalysis() */
      autoRun() {
        if (!module._container) return;
        if (this.model.colRefs.length < 2) { this.clearResults(); return; }
        const fp = this.model.inputFingerprint(this.sm());
        if (fp === this._lastFingerprint && (this.result || this.matrixResult)) return;
        this._lastFingerprint = fp;
        this.runAnalysis();
      },

      /**
       * Verwirft Ergebnis und Ansicht; die gewählten Spalten bleiben.
       * @agent
       * @returns {void}
       */
      clearResults() {
        this.result = null;
        this.matrixResult = null;
        this.matrixView = { names: [], rows: [] };
        this.cards = [];
        this.statGroups = [];
        this.filteredPairs = [];
        this.errorKey = null;
        this.selectedPair = null;
        // Reset index-keyed collapse state so stale "i-j" keys from a prior
        // column-set don't apply to a different pair after a re-analysis.
        this.collapsedPairs = {};
        this.allCollapsed = false;
        this._lastFingerprint = null;
        this._renderGen++;
        this.destroyCharts();
      },

      /**
       * Rechnet mit den gewählten Spalten neu: bei zwei Spalten paarweise, ab
       * drei als Matrix. Mit weniger als zwei Spalten geschieht nichts außer
       * dem Löschen der Fehlermeldung; result und matrixResult bleiben, wie sie sind.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        this.errorKey = null;
        this._renderGen++;
        this.destroyCharts();
        const n = this.model.colRefs.length;
        if (n < 2) return;
        if (n === 2) this.runPairwise();
        else this.runMatrix();
      },

      /** @noagent helper; der Agent nutzt runAnalysis() */
      runPairwise() {
        this.matrixResult = null;
        const res = this.model.computePairwise(this.sm());
        if (!res) { this.result = null; return; }
        if (res.error) {
          this.errorKey = res.error;
          this._errN = res.n;
          this.result = null;
          return;
        }
        this.result = res;
        this.buildPairwiseView(res);
        this.$nextTick(() => this.mountScatter(res));
      },

      /** @noagent helper; der Agent nutzt runAnalysis() */
      runMatrix() {
        this.result = null;
        // Fresh collapse state per analysis: "i-j" keys are index-based, so a
        // changed column-set must not inherit collapse flags from the old one.
        this.collapsedPairs = {};
        this.allCollapsed = false;
        const m = this.model.computeMatrix(this.sm());
        this.matrixResult = m;
        this.selectedPair = null;
        this.buildMatrixView(m);
        this.$nextTick(() => this.mountMatrixScatters(m));
      },

      // ── View builders (pairwise) ─────────────────────────────
      /** @noagent view transform */
      buildPairwiseView(result) {
        const { pearson, spearman, kendall, recommendation, descriptive, diagnostics, n, df } = result;

        const corrColor = (r) => {
          const a = Math.abs(r);
          if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
          if (a >= 0.4) return 'var(--color-warning)';
          return 'var(--color-text-tertiary)';
        };
        const interpretR = (r) => {
          const a = Math.abs(r);
          const dir = r >= 0 ? 'pos' : 'neg';
          if (a >= 0.9) return _t(`interpVeryStrong_${dir}`);
          if (a >= 0.7) return _t(`interpStrong_${dir}`);
          if (a >= 0.5) return _t(`interpModerate_${dir}`);
          if (a >= 0.3) return _t(`interpWeak_${dir}`);
          return _t('interpVeryWeak');
        };
        const toP = (v) => ((v + 1) / 2) * 100;

        // Recommendation tooltip lines — {icon, text} pairs so an icon can sit
        // beside each line without an x-text trap wiping it. The header line
        // carries no icon (iconName: null, hidden via x-show in the
        // template). Per reason: ok → criterion met, !ok → criterion
        // violated — reads as an assumption check, not a hard error, hence
        // status.ok/status.warning.
        const lines = [{ iconName: null, text: `${_t('recommendation')}: ${REC_NAMES[recommendation.best]}` }];
        for (const r of recommendation.reasons) {
          lines.push({ iconName: r.ok ? 'status.ok' : 'status.warning', text: _t(r.key, r.params) });
        }
        this.recTooltipLines = lines;

        const makeCard = (method, label, help, rVal, stats, ci) => {
          const color = corrColor(rVal);
          return {
            method, label, help, color,
            recClass: recommendation.best === method ? 'result-card--recommended' : '',
            rText: fmt(rVal),
            interp: interpretR(rVal),
            stats,
            ciFillStyle: `background:${color};left:${toP(ci[0])}%;width:${toP(ci[1]) - toP(ci[0])}%`,
            ciPointStyle: `left:${toP(rVal)}%`,
            ciLow: fmt(ci[0]),
            ciHigh: fmt(ci[1]),
          };
        };

        this.cards = [
          makeCard('pearson', 'Pearson r', HELP + 'LinearStat.r', pearson.r, [
            { label: _t('pValue'), help: HELP + 'LinearStat.p', value: fmtP(pearson.p) },
            { label: _t('tStat'), help: HELP + 'LinearStat.t', value: fmt(pearson.t) },
            { label: 'R²', help: HELP + 'LinearStat.r2', value: `${fmt(pearson.r2)} (${(pearson.r2 * 100).toFixed(1)} %)` },
          ], pearson.ci),
          makeCard('spearman', `Spearman ${GLYPH_RHO}`, HELP + 'LinearStat.r', spearman.r, [
            { label: _t('pValue'), help: HELP + 'LinearStat.p', value: fmtP(spearman.p) },
            { label: _t('tStat'), help: HELP + 'LinearStat.t', value: fmt(spearman.t) },
            { label: `${GLYPH_RHO}²`, help: HELP + 'LinearStat.r2', value: `${fmt(spearman.r2)} (${(spearman.r2 * 100).toFixed(1)} %)` },
          ], spearman.ci),
          makeCard('kendall', `Kendall ${GLYPH_TAU}`, HELP + 'KendallStat.tau', kendall.tau, [
            { label: _t('pValue'), help: HELP + 'KendallStat.p', value: fmtP(kendall.p) },
            { label: _t('zStat'), help: HELP + 'KendallStat.z', value: fmt(kendall.z) },
            { label: _t('concordant'), help: HELP + 'KendallStat.concordant', value: String(kendall.concordant) },
            { label: _t('discordant'), help: HELP + 'KendallStat.discordant', value: String(kendall.discordant) },
          ], kendall.ci),
        ];

        const normXColor = diagnostics.normX.normal ? 'var(--color-success)' : 'var(--color-warning)';
        const normYColor = diagnostics.normY.normal ? 'var(--color-success)' : 'var(--color-warning)';
        const monoColor = diagnostics.mono >= 0.85 ? 'var(--color-success)'
          : diagnostics.mono >= 0.7 ? 'var(--color-warning)' : 'var(--color-error)';
        const outlierColor = diagnostics.outliers === 0 ? 'var(--color-success)' : 'var(--color-warning)';

        this.statGroups = [
          {
            title: _t('descriptiveStats'),
            rows: [
              { label: 'n', help: HELP + 'PairResult.n', value: String(n) },
              { label: _t('degreesOfFreedom'), help: HELP + 'PairResult.df', value: String(df) },
              { label: _t('meanX'), help: HELP + 'Descriptive.meanX', value: fmt(descriptive.meanX, 3) },
              { label: _t('meanY'), help: HELP + 'Descriptive.meanY', value: fmt(descriptive.meanY, 3) },
              { label: _t('stdDevX'), help: HELP + 'Descriptive.stdX', value: fmt(descriptive.stdX, 3) },
              { label: _t('stdDevY'), help: HELP + 'Descriptive.stdY', value: fmt(descriptive.stdY, 3) },
              { label: _t('covariance'), help: HELP + 'Descriptive.cov', value: fmt(descriptive.cov, 3) },
            ],
          },
          {
            title: _t('diagnostics'),
            rows: [
              { label: _t('normalityX'), help: HELP + 'Diagnostics.normX', value: `${diagnostics.normX.label} (JB=${diagnostics.normX.jb.toFixed(2)})`, style: `color:${normXColor}` },
              { label: _t('normalityY'), help: HELP + 'Diagnostics.normY', value: `${diagnostics.normY.label} (JB=${diagnostics.normY.jb.toFixed(2)})`, style: `color:${normYColor}` },
              { label: _t('skewnessX'), help: HELP + 'Diagnostics.skewX', value: fmt(diagnostics.skewX, 3) },
              { label: _t('skewnessY'), help: HELP + 'Diagnostics.skewY', value: fmt(diagnostics.skewY, 3) },
              { label: _t('kurtosisX'), help: HELP + 'Diagnostics.kurtX', value: fmt(diagnostics.kurtX, 3) },
              { label: _t('kurtosisY'), help: HELP + 'Diagnostics.kurtY', value: fmt(diagnostics.kurtY, 3) },
              { label: _t('monotonicityIndex'), help: HELP + 'Diagnostics.mono', value: `${(diagnostics.mono * 100).toFixed(1)} %`, style: `color:${monoColor}` },
              { label: _t('outliers'), help: HELP + 'Diagnostics.outliers', value: diagnostics.outliers === 0 ? _t('none') : String(diagnostics.outliers), style: `color:${outlierColor}` },
            ],
          },
        ];
      },

      // ── View builders (matrix) ───────────────────────────────
      /** @noagent view transform */
      cellPassesFilter(r, p) {
        const minR = this.model.filterMinR;
        const maxP = this.model.filterMaxP;
        if (minR == null && maxP == null) return true;
        if (isNaN(r)) return false;
        if (minR != null && Math.abs(r) < minR) return false;
        if (maxP != null && (p == null || p > maxP)) return false;
        return true;
      },

      /** @noagent view transform */
      buildMatrixView(matrixResult) {
        const { names, matrix, ciMatrix, pMatrix, nMatrix, pairs } = matrixResult;
        const k = names.length;
        const method = this.model.matrixMethod;
        const mat = matrix[method];
        const ciMat = ciMatrix[method];
        const pMat = pMatrix[method];

        const corrColor = (r) => {
          if (isNaN(r)) return 'var(--color-text-tertiary)';
          const a = Math.abs(r);
          if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
          if (a >= 0.4) return 'var(--color-warning)';
          return 'var(--color-text-tertiary)';
        };
        const corrBg = (r) => {
          if (isNaN(r)) return 'transparent';
          const a = Math.abs(r);
          return r > 0 ? `rgba(34, 197, 94, ${a * 0.25})` : `rgba(239, 68, 68, ${a * 0.25})`;
        };

        const rows = [];
        for (let i = 0; i < k; i++) {
          const row = [];
          for (let j = 0; j < k; j++) {
            if (j > i) {
              row.push({ kind: 'empty', cls: 'corr__matrix-cell corr__matrix-cell--empty', style: '', title: '' });
              continue;
            }
            if (i === j) {
              row.push({ kind: 'diag', cls: 'corr__matrix-cell corr__matrix-cell--diag', style: '', title: '' });
              continue;
            }
            const r = mat[i][j];
            const p = pMat[i][j];
            const passes = this.cellPassesFilter(r, p);
            const color = corrColor(r);
            const bg = passes ? corrBg(r) : 'transparent';
            const ci = ciMat[i][j];
            row.push({
              kind: 'value',
              cls: `corr__matrix-cell${  passes ? '' : ' corr__matrix-cell--dimmed'}`,
              style: `background:${bg};color:${color}`,
              title: `n = ${nMatrix[i][j]}`,
              val: isNaN(r) ? EN_DASH : fmt(r),
              pStr: p != null ? fmtP(p) : '',
              ciStr: ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '',
            });
          }
          rows.push(row);
        }
        this.matrixView = { names, rows };

        // Filtered upper-triangle pairs for scatter cards.
        const corrColorF = corrColor;
        this.filteredPairs = (pairs || []).filter(pair => {
          if (pair.x.length < 4) return false;
          return this.cellPassesFilter(mat[pair.i][pair.j], pMat[pair.i][pair.j]);
        }).map(pair => {
          const r = mat[pair.i][pair.j];
          const p = pMat[pair.i][pair.j];
          const ci = ciMat[pair.i][pair.j];
          return {
            i: pair.i, j: pair.j,
            key: `${pair.i}-${pair.j}`,
            titleText: `${names[pair.i]} ${HEART_LR} ${names[pair.j]}`,
            color: corrColorF(r),
            rLabel: isNaN(r) ? EN_DASH : fmt(r, 3),
            pLabel: p != null ? fmtP(p) : EN_DASH,
            ciLabel: ci ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : '',
          };
        });
      },

      /** @noagent DOM event handler; the agent uses setParam() */
      setMethod(method) {
        this.setParam('matrixMethod', method);
      },

      /** @noagent view transform; die Auswahl rendert aus METHODS */
      methodOptions() {
        return METHODS.map(value => ({ value, label: REC_NAMES[value] }));
      },

      /**
       * Die Matrix nach einem Methodenwechsel neu aufbauen.
       * @returns {void}
       */
      _applyMethod() {
        if (this.matrixResult) {
          this._renderGen++;
          this.destroyCharts();
          this.selectedPair = null;
          this.buildMatrixView(this.matrixResult);
          this.$nextTick(() => this.mountMatrixScatters(this.matrixResult));
        }
      },

      // ── Matrix filter inputs ─────────────────────────────────
      /** @noagent view transform */
      filterMinRDisplay() { return this.model.filterMinR != null ? String(this.model.filterMinR) : ''; },
      /** @noagent view transform */
      filterMaxPDisplay() { return this.model.filterMaxP != null ? String(this.model.filterMaxP) : ''; },
      /** @noagent DOM event handler; the agent uses setParam() */
      applyFilterMinR(event) {
        this._applyFilter('filterMinR', event.target);
      },
      /** @noagent DOM event handler; the agent uses setParam() */
      applyFilterMaxP(event) {
        this._applyFilter('filterMaxP', event.target);
      },
      /**
       * Einen Filterwert der Eingabe über setParam übernehmen; bei Absage zeigt
       * das Feld wieder den Modellwert.
       * @param {'filterMinR'|'filterMaxP'} key welcher Filter
       * @param {HTMLInputElement} input das Eingabefeld
       */
      _applyFilter(key, input) {
        const v = input.value.trim();
        const value = v === '' ? null : parseFloat(v);
        let ok = true;
        try { PARAM_CHECKS[key](value); } catch { ok = false; }
        if (ok) this.setParam(key, value);
        else input.value = this.model[key] != null ? String(this.model[key]) : '';
      },
      /** @noagent helper */
      rerenderMatrix() {
        if (!this.matrixResult) return;
        this._renderGen++;
        this.destroyCharts();
        this.buildMatrixView(this.matrixResult);
        this.$nextTick(() => this.mountMatrixScatters(this.matrixResult));
      },

      // ── Matrix hover / select / collapse (transient) ─────────
      /** @noagent DOM event handler */
      matrixHover(event) {
        const cell = event.target.closest('[data-row][data-col]');
        if (!cell) return;
        this.hoverRow = cell.dataset.row;
        this.hoverCol = cell.dataset.col;
      },
      /** @noagent DOM event handler */
      matrixHoverClear() { this.hoverRow = -1; this.hoverCol = -1; },
      /** @noagent view transform */
      hoverClass(i, j) {
        const hr = this.hoverRow, hc = this.hoverCol;
        if (hr === -1 && hc === -1) return '';
        const match = String(i) === String(hr) || String(j) === String(hc);
        return match ? ' corr__matrix--highlight' : '';
      },
      /** @noagent DOM event handler */
      matrixClick(event) {
        const cell = event.target.closest('[data-row][data-col]');
        if (!cell) return;
        const row = parseInt(cell.dataset.row, 10);
        const col = parseInt(cell.dataset.col, 10);
        if (row === col || cell.classList.contains('corr__matrix-cell--empty')) return;
        if (!this.filteredPairs.length) return;
        const pairI = Math.max(row, col);
        const pairJ = Math.min(row, col);
        const pairKey = `${pairI}-${pairJ}`;
        this.selectedPair = this.selectedPair === pairKey ? null : pairKey;
      },
      /** @noagent view transform */
      selectClass(i, j) {
        if (!this.selectedPair) return '';
        const [pi, pj] = this.selectedPair.split('-').map(Number);
        const match = (i === pi && j === pj) || (i === pj && j === pi);
        return match ? ' corr__matrix-cell--selected' : '';
      },
      /** @noagent view transform */
      plotCardClass(pair) {
        return this.collapsedPairs[pair.key] ? 'corr__matrix-plot-card--collapsed' : '';
      },
      /** @noagent view transform */
      plotCardDisplay(pair) {
        if (!this.selectedPair) return '';
        return this.selectedPair === pair.key ? '' : 'display:none';
      },
      /** @noagent DOM event handler */
      togglePlot(key) {
        this.collapsedPairs = { ...this.collapsedPairs, [key]: !this.collapsedPairs[key] };
      },
      /** @noagent view transform */
      collapseAllLabel() { return this.allCollapsed ? _t('expandAll') : _t('collapseAll'); },
      /** @noagent DOM event handler */
      toggleAllPlots() {
        const next = !this.allCollapsed;
        const map = {};
        for (const pair of this.filteredPairs) map[pair.key] = next;
        this.collapsedPairs = map;
        this.allCollapsed = next;
      },

      // ── Chart mounting (imperative — sanctioned chart tier) ──
      //
      // Scatter anchors live INSIDE Alpine `x-if`/`x-for` templates (the
      // pairwise `scatter-plot` anchor under `x-if="mode()==='pairwise'"`, the
      // per-pair `matrix-plot-*` anchors under a nested `x-if`+`x-for`). Alpine
      // materialises those deeply-nested nodes over several reactive flush
      // cycles, so a single `$nextTick` can fire BEFORE the anchors exist in the
      // DOM — `querySelector` then returns null and no chart mounts (the blank
      // cards). `_whenAnchor` waits across animation frames (bounded) until the
      // anchor is present before mounting, aborting if a newer render started.
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container?.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /** @noagent helper */
      async mountScatter(result) {
        const gen = this._renderGen;
        if (!result._x || !result._y) return;
        const plotEl = await this._whenAnchor('[data-ref="scatter-plot"]', gen);
        if (!plotEl) return;
        const x = result._x, y = result._y;
        const { slope, intercept, xMin, xMax } = this._regression(x, y);
        await this._mkScatter(plotEl, gen, {
          editKey: 'single',
          xLabel: result._nameX || 'X', yLabel: result._nameY || 'Y', showLegend: true,
          dataName: _t('dataPoints'), lineName: _t('regressionLine'),
          x, y, slope, intercept, xMin, xMax,
        });
      },

      /** @noagent helper */
      async mountMatrixScatters(matrixResult) {
        const gen = this._renderGen;
        const { names } = matrixResult;
        for (const pair of this.filteredPairs) {
          if (this._renderGen !== gen) return;
          if (pair.i == null) continue;
          const raw = matrixResult.pairs.find(p => p.i === pair.i && p.j === pair.j);
          if (!raw || raw.x.length < 4) continue;
          const plotEl = await this._whenAnchor(`[data-ref="matrix-plot-${pair.key}"]`, gen);
          if (!plotEl) continue;
          const { slope, intercept, xMin, xMax } = this._regression(raw.x, raw.y);
          await this._mkScatter(plotEl, gen, {
            editKey: `pair:${pair.key}`,
            xLabel: names[pair.i], yLabel: names[pair.j], showLegend: false,
            dataName: _t('dataPoints'), lineName: '',
            x: raw.x, y: raw.y, slope, intercept, xMin, xMax,
          });
        }
      },

      _regression(x, y) {
        let sumX = 0, sumY = 0;
        for (let n = 0; n < x.length; n++) { sumX += x[n]; sumY += y[n]; }
        const mx = sumX / x.length, my = sumY / x.length;
        let num = 0, den = 0;
        for (let n = 0; n < x.length; n++) {
          num += (x[n] - mx) * (y[n] - my);
          den += (x[n] - mx) * (x[n] - mx);
        }
        const slope = den ? num / den : 0;
        return { slope, intercept: my - slope * mx, xMin: Math.min(...x), xMax: Math.max(...x) };
      },

      async _mkScatter(plotEl, gen, o) {
        const chart = await module._context.chartManager.create(plotEl, 'scatter', {
          editKey: o.editKey,
          xLabel: o.xLabel, yLabel: o.yLabel, showLegend: o.showLegend,
          series: [
            { name: o.dataName, color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75, x: o.x, y: o.y, symbol: 'circle' },
            {
              name: o.lineName, color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
              x: [o.xMin, o.xMax], y: [o.slope * o.xMin + o.intercept, o.slope * o.xMax + o.intercept],
              connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
            },
          ],
        });
        if (gen !== this._renderGen) { try { module._context.chartManager.destroy(chart); } catch { /* ignore */ } return; }
        this._charts.push(chart);
      },

      /** @noagent helper */
      destroyCharts() {
        for (const chart of this._charts) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Agent surface ────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Auswahl, Parameter, wählbare Spalten, Modus und Ergebnis
       */
      read(options) {
        return readAgentState('correlation', {
          ...this.model.toJSON(),
          activeParams: this.activeParams(),
          activeMultiSlots: this.activeMultiSlots(),
          pickableColumns: this.pickableColumns(),
          mode: this.mode(),
          result: this.result,
          matrixResult: this.matrixResult,
          errorMsg: this.errorText(),
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return this.mode() === 'matrix' ? ['confidenceLevel', ...MATRIX_KEYS] : ['confidenceLevel'];
      },

      /** @noagent derived set; der Agent liest sie über read().activeMultiSlots */
      activeMultiSlots() {
        return [...MULTI_SLOTS];
      },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        return { columns: this.model.discoverColumns(this.sm()).map(c => ({
          key: refToKey(c), name: c.columnName || c.shortName || refToKey(c) })) };
      },

      /**
       * Einen Parameter setzen; die Analyse läuft danach neu bzw. die Matrix
       * wird neu aufgebaut.
       * @agent
       * @param {keyof Params} key welcher Parameter; die Matrixschlüssel gelten erst ab drei Spalten, die im Zustand zulässigen nennt `activeParams`
       * @param {number|string|null} value der Wert; Bereich je Schlüssel siehe `Params`; `filterMinR`/`filterMaxP` nehmen `null` für keinen Filter
       * @returns {void}
       * @throws {Error} wenn `key` im aktuellen Zustand nicht gilt oder `value` nicht zulässig ist
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        if (key === 'confidenceLevel') {
          this._lastFingerprint = null;
          this.autoRun();
        } else if (key === 'matrixMethod') {
          this._applyMethod();
        } else {
          this.rerenderMatrix();
        }
      },

      /**
       * Die Spaltenauswahl ersetzen; die Reihenfolge zählt (die erste Spalte
       * ist X, die zweite Y). Danach läuft die Analyse neu; mit weniger als
       * zwei Spalten werden die Ergebnisse verworfen. Doppelte Einträge zählen einmal.
       * @agent
       * @param {'columns'} slot der Slot; dieses Modul führt nur `columns`
       * @param {Array<{ instanceId: string, sheetId: string, columnId: string }>} refs
       *   die Spaltenbezüge wählbarer Spalten in der gewünschten Reihenfolge; `[]` leert die Auswahl
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist, `refs` keine Liste ist oder eine Spalte nicht wählbar ist
       */
      setColumns(slot, refs) {
        requireEnum('slot', slot, MULTI_SLOTS);
        requireEnum('slot', slot, this.activeMultiSlots());
        if (!Array.isArray(refs)) {
          throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: a list of column references, [] clears it`);
        }
        const keys = this.pickableColumns()[slot].map(c => c.key);
        for (const ref of refs) requireKnownId('ref', refToKey(ref), keys);
        const clean = [...new Set(refs.map(refToKey))].map(keyToRef);
        MULTI_SINKS[slot](this.model, clean);
        this.result = null;
        this.matrixResult = null;
        this._lastFingerprint = null;
        this.autoRun();
      },

      // ── Lifecycle ────────────────────────────────────────────
      /** @noagent lifecycle */
      init() {
        const ctx = module._context;

        // Default confidence from app settings on a fresh module.
        if (this.model.confidenceLevel == null) {
          this.model.confidenceLevel = (ctx.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
        }

        const onRefresh = () => {
          if (isPickerFocused(module._container)) return;
          this.autoRun();
        };
        const eb = ctx.eventBus;
        eb.on('state:saved', onRefresh);
        eb.on('worksheet:dataChanged', onRefresh);
        this._unsubs.push(
          () => eb.off('state:saved', onRefresh),
          () => eb.off('worksheet:dataChanged', onRefresh),
        );
        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod), () => eb.off('module:removed', onMod));
        const onAct = ({ instanceId }) => { if (instanceId === ctx.instanceId) onRefresh(); };
        eb.on('module:activated', onAct);
        this._unsubs.push(() => eb.off('module:activated', onAct));
        const onTheme = () => {
          if (this.result && !this.result.error) { this._renderGen++; this.destroyCharts(); this.$nextTick(() => this.mountScatter(this.result)); }
          else if (this.matrixResult) { this.rerenderMatrix(); }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.$nextTick(() => this.autoRun());
      },

      /** @noagent lifecycle */
      destroy() {
        for (const u of this._unsubs) u();
        this._unsubs = [];
        // Bump the render generation so any in-flight `_whenAnchor` rAF-poll
        // aborts on its next tick instead of running its full frame budget
        // after teardown.
        this._renderGen++;
        this.destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: correlation examples ship a worksheet snapshot
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the registry)
 * plus a `colRefs` array using the `__source__` placeholder instanceId. We
 * provision the worksheet (replacing any prior example-provisioned one),
 * rewrite the placeholder refs to the new instance, then apply via setState —
 * which rebuilds the Alpine tree and re-runs the analysis.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      data.colRefs = (data.colRefs || []).map(r =>
        (r && r.instanceId === '__source__') ? { ...r, instanceId } : r);
      // Drop any persisted derived result from old snapshots — auto-run recomputes.
      delete data.result;
      delete data.matrixResult;
      return data;
    },
  });
};

export default mod;
