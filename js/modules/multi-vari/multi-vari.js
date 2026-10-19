/**
 * D.Mike — Multi-Vari Module (multi-vari.js)
 *
 * Analyze-Phase: Minitabs Multi-Vari-Diagramm (Statistik → Qualitätswerkzeuge
 * → Multi-Vari-Diagramm), erweitert um die Varianzkomponenten-Tabelle.
 *
 * Zeigt jede Einzelmessung nach bis zu vier Einflussgrößen gestaffelt und
 * beantwortet die Frage, die eine Kennzahl verdeckt: entsteht die Streuung
 * zwischen den Schichten, zwischen den Werkzeugnestern oder innerhalb eines
 * Teils? Die Tabelle darunter beziffert, was das Bild zeigt.
 *
 * @agent  Steuerbar über das Viewmodel: Modellform, Schätzer und die vier
 *   Anzeigeschalter (setParam), die Messwertspalte (setColumn), die
 *   Faktorzeilen über ihre id (addFactor, removeFactor, moveFactor,
 *   setFactorColumn) und das Rechnen selbst (runAnalysis). Gelesen wird über
 *   read() mit erklärter Lesefläche (AgentRead) — Konfiguration,
 *   Faktorzeilen in Schachtelungsreihenfolge, wählbare Spalten und Ergebnis
 *   samt Varianzkomponenten. Der Agent bekommt Zahlen, keine Diagramme.
 *
 * Zwei Engines, bewusst getrennt: `multi-vari-engine.js` gruppiert (und rechnet
 * nichts), `variance-components-engine.js` zerlegt (und weiß nichts vom Bild).
 * `multi-vari-analysis.js` verbindet beide — insbesondere sorgt sie dafür,
 * dass die Zerlegung dieselben (bereinigten) Zeilen sieht wie das Diagramm
 * und dass die Warnungen beider Engines zusammenfließen.
 *
 * `ChartBase` liefert genau einen Plot-Bereich, also entsteht das
 * Panel-Raster durch Stapeln einer Chart-Instanz je Streifen mit geteilter
 * Y-Domäne — wie beim `gage-run-chart`. Spec:
 * `docs/superpowers/specs/2026-08-31-multi-vari-design.md`.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, MODEL_FORMS, ESTIMATORS } from './multi-vari-model.js';
import { ColumnPicker, getColumnValues, getColumnName, refToKey, keyToRef } from '../../ui/column-picker.js';
import { draggableRows } from '../../ui/draggable-list.js';
import { computeMultiVari, MIN_FACTORS, MAX_FACTORS } from '../../engines/multi-vari-engine.js';
import { loadWorksheetExample } from '../../core/examples-registry.js';
import {
  runVarianceDecomposition,
  vcTermRows, isUnbalanced, hasClampedTerm,
  pickLargestTerm, interpretationKey, intOrDash,
  totalSdValue, totalPercentValue, vcCsvText,
} from './multi-vari-analysis.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';
import { downloadFile } from '../../core/export-utils.js';

/** Debounce für den Neulauf nach einer Eingabeänderung. */
const RERUN_DELAY = 120;

/** Die Werte der vier Anzeigeschalter. */
const BOOL_VALUES = [true, false];

/** Die Parameter, die `setParam` setzt (flaches Model). */
const PARAM_KEYS = ['modelForm', 'estimator', 'showPoints', 'connectMeans', 'showGroupMean', 'showRefLine'];

/** Je Parameter sein Prüfer; gibt den normalisierten Wert zurück. */
const PARAM_CHECKS = {
  modelForm: (v) => { requireEnum('value', v, MODEL_FORMS); return v; },
  estimator: (v) => { requireEnum('value', v, ESTIMATORS); return v; },
  showPoints: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  connectMeans: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  showGroupMean: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  showRefLine: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
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

/** Die Spalten-Slots dieses Moduls: genau einer, die Messwertspalte. */
const COLUMN_SLOTS = ['measurement'];

/** Je Slot der Filter, den der Wähler dieses Slots bekommt. */
const SLOT_FILTERS = { measurement: { types: ['numeric', 'percent', 'currency'] } };

/** Je Slot die eine Zuweisungsstelle seines Model-Feldes. */
const COLUMN_SINKS = { measurement: (m, ref) => { m.columnRefs.measurement = ref; } };

/** Der Filter der Faktorwähler: jede Spalte, kein Typfilter. */
const FACTOR_FILTER = {};

/**
 * Die Schlüsselfläche von `setParam`. Sätze je Schlüssel unter
 * `types.Params.<schlüssel>`, dieselben am Label (Alt-Taste).
 *
 * @typedef {object} Params
 * @property {'nested'|'crossed'} modelForm  geschachtelt oder gekreuzt
 * @property {'anova'|'reml'} estimator  Schätzer der Varianzkomponenten
 * @property {boolean} showPoints  Einzelwerte zeigen
 * @property {boolean} connectMeans  Mittelwerte verbinden
 * @property {boolean} showGroupMean  Gruppenmittel zeigen
 * @property {boolean} showRefLine  Gesamtmittel als Linie
 */

/**
 * Das gerechnete Ergebnis, wie `read().result` es liefert.
 *
 * @typedef {object} Result
 * @property {Strip[]} strips  Diagrammzeilen
 * @property {string[]} seriesLevels  Stufen des Serienfaktors
 * @property {string[]} factorNames  Faktoren in Rollenreihenfolge
 * @property {number} grandMean  Gesamtmittelwert
 * @property {number} n  verwertete Messwerte
 * @property {number} droppedRows  verworfene Zeilen
 * @property {string[]} warnings  Warnkennungen
 * @property {number} yMin  kleinster Wert
 * @property {number} yMax  größter Wert
 * @property {boolean} balanced  ausgewogener Plan
 * @property {number} panelCount  Panels
 * @property {Limit[]} limits  überschrittene Darstellungsgrenzen
 * @property {boolean} renderable  darstellbar
 * @property {Vc|null} vc  Varianzkomponenten
 */

/**
 * @typedef {object} Strip
 * @property {number} idx  Zeilennummer
 * @property {string} rowLevel  Stufe des Panelzeilenfaktors
 * @property {Panel[]} panels  Panels
 */

/**
 * @typedef {object} Panel
 * @property {string} panelLevel  Stufe des Panelspaltenfaktors
 * @property {Group[]} groups  Gruppen auf der X-Achse
 */

/**
 * @typedef {object} Group
 * @property {string} level  Stufe des X-Faktors
 * @property {number|null} mean  Gruppenmittel
 * @property {Series[]} series  Serien
 */

/**
 * @typedef {object} Series
 * @property {string} level  Stufe des Serienfaktors
 * @property {number[]} values  Messwerte
 * @property {number} mean  Mittelwert
 */

/**
 * @typedef {object} Limit
 * @property {string} code  Grenze
 * @property {string} column  Spalte
 * @property {number} count  Stufen
 * @property {number} max  erlaubt
 */

/**
 * @typedef {object} Vc
 * @property {'nested'|'crossed'} modelForm  Modellform
 * @property {'anova'|'reml'} estimator  tatsächlicher Schätzer
 * @property {boolean} balanced  ausgewogen
 * @property {number} n  Messwerte
 * @property {VcTerm[]} terms  Terme
 * @property {number} totalVariance  Gesamtvarianz
 * @property {boolean|null} converged  konvergiert, nur REML
 * @property {number|null} iterations  Iterationen, nur REML
 * @property {string[]} warnings  Warnkennungen
 */

/**
 * @typedef {object} VcTerm
 * @property {string} id  Kennung
 * @property {string} label  Term
 * @property {number|null} df  Freiheitsgrade, nur ANOVA
 * @property {number|null} ss  Quadratsumme, nur ANOVA
 * @property {number|null} ms  mittlere Quadratsumme, nur ANOVA
 * @property {number} variance  Varianzkomponente
 * @property {number} sd  Standardabweichung
 * @property {number} percent  Anteil an der Gesamtvarianz
 * @property {boolean} clamped  auf 0 gesetzt
 */

/**
 * Die Agenten-Lesefläche von Multi-Vari.
 *
 * Nicht die persistierte Form: `toJSON()` führt die Faktorzeilen als
 * `factorRows` und spiegelt die Referenzen zusätzlich flach in
 * `columnRefs.factors`, und das Ergebnis entsteht transient am Viewmodel.
 * Darum erklärt dieses Modul seine Lesefläche: die Zeilen heißen `factors`
 * (das ist der Name, den `removeFactor`/`setFactorColumn` für ihre Zeilen-id
 * ableiten), die Beispiel-Buchführung (`exampleWorksheetId`) bleibt draußen.
 *
 * @typedef {object} AgentRead
 * @property {{ measurement: object|null }} columnRefs  the chosen measurement column, `{ instanceId, sheetId, columnId }`, or null
 * @property {Array<{ id: string, ref: object|null }>} factors  the factor rows in order, each `{ id, ref }`; the order is the nesting (row 0 = outermost, X axis)
 * @property {'nested'|'crossed'} modelForm  nested (A > B(A) > …) or crossed (A, B, A×B, …) variance model
 * @property {'anova'|'reml'} estimator  the variance-component estimator
 * @property {boolean} showPoints  display switch: draw single measurements; does not change the result
 * @property {boolean} connectMeans  display switch: connect the group means; does not change the result
 * @property {boolean} showGroupMean  display switch: mark the group means; does not change the result
 * @property {boolean} showRefLine  display switch: draw the grand-mean reference line; does not change the result
 * @property {string[]} activeParams  the keys `setParam` accepts in the current state
 * @property {string[]} activeColumnSlots  the slots `setColumn` accepts in the current state
 * @property {object} pickableColumns  per slot (`measurement`, `factor`) the columns `setColumn` / `setFactorColumn` accept, each `{ key, name }`
 * @property {Result|null} result  the computed result, or null while measurement or two factor columns are missing or the analysis failed
 * @property {string} errorMsg  the reason the last analysis produced no result, or an empty string
 */

const mod = createModule({
  config: {
    id: 'multi-vari',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.multi-vari',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...draggableRows({
        onMove({ group, sourceId, targetId }) {
          if (group !== 'factors') return;
          // Die Reihenfolge ist die Eingabe — moveFactor rechnet neu.
          this.moveFactor(sourceId, targetId);
          this._syncFactorPickers();
        },
        rowIds(group) {
          return group === 'factors' ? this.model.factors.map(f => f.id) : [];
        },
        t: (key, params) => module._context.i18n.t(key, params),
      }),

      /**
       * Abgeleitetes Ergebnis für das Template, oder null. Form:
       *   { strips: [{ idx, rowLevel, panels }], seriesLevels, factorNames,
       *     grandMean, n, droppedRows, warnings, yMin, yMax, balanced,
       *     panelCount, vc }
       */
      result: null,
      errorMsg: '',

      _measurementPicker: null,
      /** @type {Map<string, ColumnPicker>} Picker je Faktorzeilen-Id. */
      _factorPickers: new Map(),
      _charts: [],
      _unsubs: [],
      _rerunTimer: null,
      _renderGen: 0,

      // ── Anzeige-Helfer ────────────────────────────────────────

      /** @noagent view transform */
      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      /** @noagent view transform */
      pct(v) {
        return Number.isFinite(v) ? v.toFixed(1) : '–';
      },

      /** @noagent view transform */
      factorRole(idx) {
        return _t(`factorRole_${idx}`);
      },

      /** @noagent view transform */
      chartTitle() {
        const col = getColumnName(module._context.stateManager, this.model.columnRefs.measurement);
        return _t('chartTitle', { col });
      },

      /** @noagent view transform */
      termLabel(term) {
        return term.id === 'Error' ? _t('termError') : term.label;
      },

      /** Ganzzahl oder Gedankenstrich — REML liefert keine Freiheitsgrade. @noagent view transform */
      intOrDash(v) {
        return intOrDash(v);
      },

      /** Zeilen der Varianztabelle, Error-Zeile eingeschlossen. @noagent view transform */
      vcTerms() {
        return vcTermRows(this.result);
      },

      /**
       * Gesamtvarianz der Fußzeile. Eigene Methode statt der rohen Kette
       * `result.vc.totalVariance` im Template: `x-show` blendet die Tabelle
       * nur aus, hängt sie aber nicht ab — bei gescheiterter Zerlegung
       * (`vc === null`) liefe die Bindung weiter und würde bei jedem
       * Reaktivitätszyklus einen Alpine-Ausdrucksfehler loggen.
       *
       * @noagent view transform
       */
      totalVarianceText() {
        return this.fmt(this.result?.vc?.totalVariance);
      },

      /**
       * Std.abw. der Gesamt-Zeile. Eigene Methode statt `Math.sqrt(...)` im
       * Template: Alpines CSP-Evaluator löst nackte Bezeichner nur gegen den
       * Komponenten-Scope auf, und `Math` steht dort nicht — der Ausdruck
       * scheiterte an „Undefined variable: Math".
       *
       * @noagent view transform
       */
      totalSd() {
        return this.fmt(totalSdValue(this.result?.vc));
      },

      /**
       * Anteil-Summe der Fußzeile. Aufaddiert statt fest „100.0" im Template:
       * eine geklemmte (auf 0 gesetzte) Komponente oder ein auf dem Rand
       * stehengebliebener REML-Fit lassen die Spalte durchaus auf etwas
       * anderes hinauslaufen — dann muss die Summe das auch zeigen.
       *
       * @noagent view transform
       */
      totalPercent() {
        return this.pct(totalPercentValue(this.result?.vc));
      },

      /** Term mit dem größten Varianzanteil, `Error` eingeschlossen. @noagent view transform */
      largestTerm() {
        return pickLargestTerm(this.result?.vc?.terms);
      },

      /** @noagent view transform */
      largestPercent() {
        const t = this.largestTerm();
        return t ? `${this.pct(t.percent)} %` : '–';
      },

      /** @noagent view transform */
      largestTermLabel() {
        const t = this.largestTerm();
        return t ? this.termLabel(t) : '';
      },

      /**
       * Ein Satz, der die Tabelle liest. Steht die Reststreuung oben, sagt er
       * genau das — die Einflussgrößen erklären die Streuung dann eben nicht.
       *
       * @noagent view transform
       */
      interpretationText() {
        const t = this.largestTerm();
        if (!t) return '';
        const params = { term: this.termLabel(t), percent: this.pct(t.percent) };
        return _t(interpretationKey(t), params);
      },

      /**
       * Ehrlichkeitsregel: bei unbalanciertem Plan hängen die Komponenten vom
       * Verfahren ab. Das gehört sichtbar unter die Tabelle, nicht in die
       * Fußnote eines Handbuchs.
       *
       * @noagent view transform
       */
      showUnbalancedNote() {
        return isUnbalanced(this.result);
      },

      /** @noagent view transform */
      showClampedNote() {
        return hasClampedTerm(this.vcTerms());
      },

      /** Tabelle als CSV — dieselben Spalten wie die Anzeige, Punkt als Dezimaltrenner. @noagent helper; the agent reads the numbers via read().result */
      exportCsv() {
        const vc = this.result?.vc;
        if (!vc) return;
        const head = [
          _t('tableTerm'), _t('tableDf'), _t('tableSs'), _t('tableMs'),
          _t('tableVariance'), _t('tableSd'), _t('tablePercent'),
        ];
        const csv = vcCsvText(vc, head, _t('tableTotal'), (t) => this.termLabel(t));
        // Dateiname über i18n: der Export heißt in einer englischen Oberfläche
        // nicht „…-varianzkomponenten".
        downloadFile(csv, `${_t('csvFileName')}.csv`, 'text/csv;charset=utf-8');
      },

      /** Engine-Warnungen plus die synthetische `droppedRows`-Meldung. @noagent view transform */
      warningCodes() {
        const r = this.result;
        if (!r) return [];
        return r.droppedRows > 0 ? [...r.warnings, 'droppedRows'] : r.warnings;
      },

      /** @noagent view transform */
      hasWarnings() {
        return this.warningCodes().length > 0;
      },

      /** @noagent view transform */
      warningText(code) {
        if (code === 'droppedRows') {
          return _t('warnDroppedRows', { count: this.result.droppedRows });
        }
        // Größengrenzen benennen die Spalte, die sie gesprengt hat — bei bis
        // zu vier Faktoren ist „sehr viele Stufen" sonst ein Ratespiel.
        const limit = (this.result?.limits || []).find(l => l.code === code);
        if (limit) {
          return _t(`warn_${code}`, { col: limit.column, count: limit.count, max: limit.max });
        }
        return _t(`warn_${code}`);
      },

      /**
       * Spec: wird eine der drei Größengrenzen überschritten, wird das
       * Diagramm nicht gezeichnet — die Spaltenauswahl bleibt unangetastet,
       * die Warnung nennt die verantwortliche Spalte, und die
       * Varianzkomponenten-Tabelle bleibt sichtbar.
       *
       * @noagent view transform
       */
      canRender() {
        return Boolean(this.result) && this.result.renderable !== false;
      },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Konfiguration, Faktorzeilen, wählbare Mengen und Ergebnis
       */
      read(options) {
        const json = this.model.toJSON();
        return readAgentState('multi-vari', {
          columnRefs: { measurement: json.columnRefs.measurement },
          factors: json.factorRows,
          modelForm: json.modelForm,
          estimator: json.estimator,
          showPoints: json.showPoints,
          connectMeans: json.connectMeans,
          showGroupMean: json.showGroupMean,
          showRefLine: json.showRefLine,
          activeParams: this.activeParams(),
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          result: this.result,
          errorMsg: this.errorMsg,
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() { return [...PARAM_KEYS]; },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        const sm = module._context.stateManager;
        return {
          measurement: pickableColumnList(sm, SLOT_FILTERS.measurement),
          factor: pickableColumnList(sm, FACTOR_FILTER),
        };
      },

      /** @noagent view transform; die Optionen des Modellform-Auswahlfeldes (eine Quelle: MODEL_FORMS) */
      modelFormOptions() { return MODEL_FORMS.map(v => ({ value: v, label: _t(`modelForm_${v}`) })); },

      /** @noagent view transform; die Optionen des Schätzer-Auswahlfeldes (eine Quelle: ESTIMATORS) */
      estimatorOptions() { return ESTIMATORS.map(v => ({ value: v, label: _t(`estimator_${v}`) })); },

      /**
       * Einen Parameter setzen; die Analyse läuft danach neu.
       * @agent
       * @param {keyof Params} key welcher Parameter
       * @param {string|boolean} value der Wert; Bereich je Schlüssel siehe `Params`
       * @returns {void}
       * @throws {Error} wenn `key` kein Parameter dieses Moduls ist oder `value` nicht zulässig
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        setAtPath(this.model, key, PARAM_CHECKS[key](value));
        this._scheduleRerun();
      },

      /**
       * Die Messwertspalte zuweisen; die Analyse läuft danach neu.
       * @agent
       * @param {'measurement'} slot der Slot; dieses Modul führt nur `measurement` (die Faktoren setzt `setFactorColumn`)
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte, oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn `slot` unbekannt ist oder die Spalte nicht wählbar
       */
      setColumn(slot, ref) {
        requireEnum('slot', slot, COLUMN_SLOTS);
        if (ref == null) {
          COLUMN_SINKS[slot](this.model, null);
          this._measurementPicker?.syncValue(null);
          this._scheduleRerun();
          return;
        }
        requireEnum('slot', slot, this.activeColumnSlots());
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', refToKey(ref), keys);
        // Normalisierte Form: fremde Eigenschaften des Agentenobjekts bleiben draußen.
        const clean = keyToRef(refToKey(ref));
        COLUMN_SINKS[slot](this.model, clean);
        this._measurementPicker?.syncValue(clean);
        this._scheduleRerun();
      },

      /** @noagent derived set; ein Prädikat für Vorlage und addFactor: noch Platz unter MAX_FACTORS */
      canAddFactor() { return this.model.factors.length < MAX_FACTORS; },

      /** @noagent derived set; ein Prädikat für Vorlage und removeFactor: mehr als MIN_FACTORS Zeilen */
      canRemoveFactor() { return this.model.factors.length > MIN_FACTORS; },

      /**
       * Eine leere Faktorzeile anhängen.
       * @agent
       * @returns {string} die id der neuen Zeile
       * @throws {Error} wenn schon vier Faktoren geführt werden
       */
      addFactor() {
        if (!this.canAddFactor()) {
          throw new Error(`cannot add factor; allowed: at most ${MAX_FACTORS} factors`);
        }
        this.model.addFactor();
        this.$nextTick(() => { this._syncFactorPickers(); });
        return this.model.factors[this.model.factors.length - 1].id;
      },

      /**
       * Eine Faktorzeile entfernen; die Analyse läuft danach neu.
       * @agent
       * @param {string} rowId die id einer Zeile aus read().factors
       * @returns {void}
       * @throws {Error} wenn die id unbekannt ist oder nur noch zwei Zeilen bleiben
       */
      removeFactor(rowId) {
        requireKnownId('rowId', rowId, this.model.factors.map(f => f.id));
        if (!this.canRemoveFactor()) {
          throw new Error(`cannot remove factor; allowed: at least ${MIN_FACTORS} factors`);
        }
        this.model.removeFactor(rowId);
        this._factorPickers.get(rowId)?.destroy();
        this._factorPickers.delete(rowId);
        this.$nextTick(() => {
          this._syncFactorPickers();
          this._scheduleRerun();
        });
      },

      /**
       * Eine Faktorzeile vor eine andere schieben; die Reihenfolge ist die
       * Schachtelung, die Analyse läuft danach neu.
       * @agent
       * @param {string} rowId die id der zu schiebenden Zeile
       * @param {string} beforeRowId die id der Zeile, vor der sie landet
       * @returns {void}
       * @throws {Error} wenn eine der ids unbekannt ist
       */
      moveFactor(rowId, beforeRowId) {
        const ids = this.model.factors.map(f => f.id);
        requireKnownId('rowId', rowId, ids);
        requireKnownId('beforeRowId', beforeRowId, ids);
        this.model.moveFactorBefore(rowId, beforeRowId);
        this._scheduleRerun();
      },

      /**
       * Die Spalte einer Faktorzeile setzen; die Analyse läuft danach neu.
       * @agent
       * @param {string} rowId die id einer Zeile aus read().factors
       * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
       *   der Spaltenbezug einer wählbaren Spalte (read().pickableColumns.factor), oder null zum Leeren
       * @returns {void}
       * @throws {Error} wenn die Zeilen-id unbekannt ist oder die Spalte nicht wählbar
       */
      setFactorColumn(rowId, ref) {
        requireKnownId('rowId', rowId, this.model.factors.map(f => f.id));
        let clean = null;
        if (ref != null) {
          const keys = this.pickableColumns().factor.map(c => c.key);
          requireKnownId('ref', refToKey(ref), keys);
          clean = keyToRef(refToKey(ref));
        }
        this.model.setFactorRef(rowId, clean);
        this._factorPickers.get(rowId)?.syncValue(clean);
        this._scheduleRerun();
      },

      // ── Analyse ───────────────────────────────────────────────

      _scheduleRerun() {
        clearTimeout(this._rerunTimer);
        this._rerunTimer = setTimeout(() => this.runAnalysis(), RERUN_DELAY);
      },

      /**
       * Die Analyse jetzt rechnen. `result` bleibt null ohne Messwertspalte
       * (`errorMsg` leer), mit weniger als zwei belegten Faktoren, bei einem
       * ungültigen Versuchsplan (die Engine wirft) und wenn keine verwertbaren
       * Daten übrig bleiben; in diesen drei Fällen nennt `errorMsg` den Grund.
       * @agent
       * @returns {void}
       */
      runAnalysis() {
        const clear = (msg = '') => {
          this._destroyCharts();
          this.result = null;
          this.errorMsg = msg;
        };

        const sm = module._context.stateManager;
        if (!this.model.columnRefs.measurement) return clear();

        const selected = this.model.selectedFactors();
        if (selected.length < 2) return clear(_t('errNeedFactors'));

        const measurements = getColumnValues(sm, this.model.columnRefs.measurement);
        const factorNames = selected.map(f => getColumnName(sm, f.ref));
        const factorValues = selected.map(f => getColumnValues(sm, f.ref));
        const factors = selected.map((f, i) => ({ name: factorNames[i], values: factorValues[i] }));

        let g;
        try {
          g = computeMultiVari({ measurements, factors, modelForm: this.model.modelForm });
        } catch (err) {
          return clear(String(err.message || err));
        }
        if (g.n === 0) return clear(_t('errNoData'));

        // Die Zerlegung darf scheitern (singuläres Modell, REML ohne
        // Konvergenz), ohne das Diagramm mitzureißen: das Bild trägt für sich.
        // runVarianceDecomposition() speist dabei ausschließlich g.cleaned in
        // die Zerlegung ein (dieselben Zeilen wie das Diagramm) und vereinigt
        // die Warnungen beider Engines dedupliziert.
        const { result, vcError } = runVarianceDecomposition(g, {
          factorNames,
          modelForm: this.model.modelForm,
          estimator: this.model.estimator,
        });

        this.result = result;
        this.errorMsg = vcError ? _t('errCompute', { msg: String(vcError.message || vcError) }) : '';

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderStrips(this.result, gen));
      },

      /**
       * Eine Chart-Instanz je Streifen. Alle Streifen teilen Y-Domäne und
       * Referenzlinie, sonst sind die Zeilen nicht vergleichbar; nur der
       * unterste trägt die X-Achsenbeschriftung. Jeder Streifen reserviert
       * Platz für die Legende (und zeigt sie auch an) — reserviert nur der
       * oberste, würden die Streifen unterschiedlich breit und ihre Panels
       * ständen nicht mehr untereinander (siehe `gage-run-chart`).
       *
       * @param {object} res
       * @param {number} gen — Schutz gegen veraltete Renderläufe
       */
      async _renderStrips(res, gen) {
        this._destroyCharts();
        // Über einer Größengrenze wird nichts gezeichnet (Spec). Der Abbruch
        // gehört hierher und nicht nur ins Template: sonst liefe der
        // Render-Lauf für ein ausgeblendetes Raster trotzdem durch.
        if (!res || res.renderable === false) return;

        const sm = module._context.stateManager;
        const measurementName = getColumnName(sm, this.model.columnRefs.measurement);
        const axisName = res.factorNames[0] || '';

        for (const strip of res.strips) {
          const host = await this._whenAnchor(`[data-strip="${strip.idx}"]`, gen);
          if (!host || gen !== this._renderGen) return;
          host.replaceChildren();

          const isLast = strip.idx === res.strips.length - 1;
          const chart = await module._context.chartManager.create(host, 'multi-vari', {
            title: '',
            showTitle: false,
            xLabel: isLast ? axisName : '',
            showXLabel: isLast,
            yLabel: measurementName,
            showLegend: true,
            panels: strip.panels,
            seriesLevels: res.seriesLevels,
            rowLabel: strip.rowLevel,
            refValue: this.model.showRefLine ? res.grandMean : null,
            refLabel: _t('refMean'),
            sharedYMin: res.yMin,
            sharedYMax: res.yMax,
            showPoints: this.model.showPoints,
            connectMeans: this.model.connectMeans,
            showGroupMean: this.model.showGroupMean,
          });
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },

      _whenAnchor(selector, gen, maxFrames = 30) {
        return whenAnchor(module, this, selector, gen, maxFrames);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── ColumnPicker (imperative Widgets) ─────────────────────

      _mountMeasurementPicker() {
        const el = module._container.querySelector('[data-ref="col-measurement-wrap"]');
        if (!el) return;
        this._measurementPicker?.destroy();
        this._measurementPicker = new ColumnPicker(el, module._context, {
          mode: 'single',
          ...SLOT_FILTERS.measurement,
          onChange: (ref) => { this.setColumn('measurement', ref); },
        });
        if (this.model.columnRefs.measurement) {
          this._measurementPicker.value = this.model.columnRefs.measurement;
        }
      },

      /**
       * Je Faktorzeile einen Picker in ihre Zelle hängen. Läuft auch nach jedem
       * Hinzufügen, Entfernen und Umsortieren: `x-for` baut die Zeilen neu auf,
       * die imperativen Widgets darin überleben das nicht.
       */
      _syncFactorPickers() {
        for (const [id, picker] of this._factorPickers) {
          if (!this.model.factors.some(f => f.id === id)) {
            picker.destroy();
            this._factorPickers.delete(id);
          }
        }
        for (const f of this.model.factors) {
          const cell = module._container.querySelector(`[data-factor-wrap="${f.id}"]`);
          if (!cell) continue;
          if (cell.firstElementChild && this._factorPickers.has(f.id)) continue;
          this._factorPickers.get(f.id)?.destroy();
          cell.replaceChildren();
          const picker = new ColumnPicker(cell, module._context, {
            mode: 'single',
            ...FACTOR_FILTER,
            onChange: (ref) => { this.setFactorColumn(f.id, ref); },
          });
          if (f.ref) picker.value = f.ref;
          this._factorPickers.set(f.id, picker);
        }
      },

      // ── Lebenszyklus ──────────────────────────────────────────

      /** @noagent lifecycle */
      init() {
        this._unsubs = [];
        this._charts = [];
        this._factorPickers = new Map();
        this._renderGen = 0;
        this._rerunTimer = null;

        this.dragRowsInit();
        this._mountMeasurementPicker();
        this.$nextTick(() => this._syncFactorPickers());

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId !== module._context.instanceId) return;
          this._measurementPicker?.refresh();
          for (const p of this._factorPickers.values()) p.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Chart-Farben kommen aus CSS-Custom-Properties — beim Theme-Wechsel neu zeichnen.
        const onTheme = () => {
          if (this.result) this._renderStrips(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        this.runAnalysis();
      },

      /** @noagent lifecycle */
      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._rerunTimer);
        this.dragRowsDestroy();
        this._measurementPicker?.destroy();
        this._measurementPicker = null;
        for (const p of this._factorPickers.values()) p.destroy();
        this._factorPickers.clear();
        this._destroyCharts();
      },
    };
  },
});

/**
 * Eigenes loadExample: die Katalogbeispiele bringen ein vollständiges
 * Worksheet mit (`sourceWorksheetData`) und verwenden den Platzhalter
 * `__source__` als instanceId auf allen Spaltenreferenzen. Beim Laden wird ein
 * frisches Worksheet bereitgestellt, die Platzhalter werden ersetzt, dann
 * greift setState (was die Analyse neu anstößt).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    // `loadWorksheetExample` verwirft den Rückgabewert — `data` in place ändern.
    rewriteRefs(data, oldId, newId) {
      const refs = data.columnRefs;
      if (!refs) return data;
      if (refs.measurement?.instanceId === oldId) {
        refs.measurement = { ...refs.measurement, instanceId: newId };
      }
      if (Array.isArray(refs.factors)) {
        refs.factors = refs.factors.map(r => (
          r && r.instanceId === oldId ? { ...r, instanceId: newId } : r
        ));
      }
      // Beispiele speichern die Faktoren flach; `factorRows` wird nur
      // vollständigkeitshalber mitgezogen, falls ein exportiertes Projekt
      // wieder als Beispiel eingespielt wird.
      if (Array.isArray(data.factorRows)) {
        data.factorRows = data.factorRows.map(row => (
          row?.ref?.instanceId === oldId
            ? { ...row, ref: { ...row.ref, instanceId: newId } }
            : row
        ));
      }
      return data;
    },
  });
};

export default mod;
