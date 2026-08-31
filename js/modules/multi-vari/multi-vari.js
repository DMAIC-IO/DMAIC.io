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
import { State } from './multi-vari-model.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { draggableRows } from '../../ui/draggable-list.js';
import { computeMultiVari } from '../../engines/multi-vari-engine.js';
import {
  runVarianceDecomposition,
  vcTermRows, isUnbalanced, hasClampedTerm,
  pickLargestTerm, interpretationKey, intOrDash,
  totalSdValue, vcCsvText,
} from './multi-vari-analysis.js';
import { whenAnchor } from '../../core/chart/chart-module-base.js';
import { downloadFile } from '../../core/export-utils.js';

/** Debounce für den Neulauf nach einer Eingabeänderung. */
const RERUN_DELAY = 120;

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
          this.model.moveFactorBefore(sourceId, targetId);
          // Die Reihenfolge ist die Eingabe — nach dem Verschieben neu rechnen.
          this._syncFactorPickers();
          this._scheduleRerun();
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

      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      pct(v) {
        return Number.isFinite(v) ? v.toFixed(1) : '–';
      },

      factorRole(idx) {
        return _t(`factorRole_${idx}`);
      },

      chartTitle() {
        const col = getColumnName(module._context.stateManager, this.model.columnRefs.measurement);
        return _t('chartTitle', { col });
      },

      termLabel(term) {
        return term.id === 'Error' ? _t('termError') : term.label;
      },

      /** Ganzzahl oder Gedankenstrich — REML liefert keine Freiheitsgrade. */
      intOrDash(v) {
        return intOrDash(v);
      },

      /** Zeilen der Varianztabelle, Error-Zeile eingeschlossen. */
      vcTerms() {
        return vcTermRows(this.result);
      },

      /**
       * Gesamtvarianz der Fußzeile. Eigene Methode statt der rohen Kette
       * `result.vc.totalVariance` im Template: `x-show` blendet die Tabelle
       * nur aus, hängt sie aber nicht ab — bei gescheiterter Zerlegung
       * (`vc === null`) liefe die Bindung weiter und würde bei jedem
       * Reaktivitätszyklus einen Alpine-Ausdrucksfehler loggen.
       */
      totalVarianceText() {
        return this.fmt(this.result?.vc?.totalVariance);
      },

      /**
       * Std.abw. der Gesamt-Zeile. Eigene Methode statt `Math.sqrt(...)` im
       * Template: Alpines CSP-Evaluator löst nackte Bezeichner nur gegen den
       * Komponenten-Scope auf, und `Math` steht dort nicht — der Ausdruck
       * scheiterte an „Undefined variable: Math".
       */
      totalSd() {
        return this.fmt(totalSdValue(this.result?.vc));
      },

      /** Term mit dem größten Varianzanteil, `Error` eingeschlossen. */
      largestTerm() {
        return pickLargestTerm(this.result?.vc?.terms);
      },

      largestPercent() {
        const t = this.largestTerm();
        return t ? `${this.pct(t.percent)} %` : '–';
      },

      largestTermLabel() {
        const t = this.largestTerm();
        return t ? this.termLabel(t) : '';
      },

      /**
       * Ein Satz, der die Tabelle liest. Steht die Reststreuung oben, sagt er
       * genau das — die Einflussgrößen erklären die Streuung dann eben nicht.
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
       */
      showUnbalancedNote() {
        return isUnbalanced(this.result);
      },

      showClampedNote() {
        return hasClampedTerm(this.vcTerms());
      },

      /** Tabelle als CSV — dieselben Spalten wie die Anzeige, Punkt als Dezimaltrenner. */
      exportCsv() {
        const vc = this.result?.vc;
        if (!vc) return;
        const head = [
          _t('tableTerm'), _t('tableDf'), _t('tableSs'), _t('tableMs'),
          _t('tableVariance'), _t('tableSd'), _t('tablePercent'),
        ];
        const csv = vcCsvText(vc, head, _t('tableTotal'), (t) => this.termLabel(t));
        downloadFile(csv, 'multi-vari-varianzkomponenten.csv', 'text/csv;charset=utf-8');
      },

      /** Engine-Warnungen plus die synthetische `droppedRows`-Meldung. */
      warningCodes() {
        const r = this.result;
        if (!r) return [];
        return r.droppedRows > 0 ? [...r.warnings, 'droppedRows'] : r.warnings;
      },

      hasWarnings() {
        return this.warningCodes().length > 0;
      },

      warningText(code) {
        if (code === 'droppedRows') {
          return _t('warnDroppedRows', { count: this.result.droppedRows });
        }
        return _t(`warn_${code}`);
      },

      // ── Ereignisse ────────────────────────────────────────────

      addFactor() {
        this.model.addFactor();
        this.$nextTick(() => { this._syncFactorPickers(); });
      },

      removeFactor(id) {
        this.model.removeFactor(id);
        this._factorPickers.get(id)?.destroy();
        this._factorPickers.delete(id);
        this.$nextTick(() => {
          this._syncFactorPickers();
          this._scheduleRerun();
        });
      },

      optionChanged() {
        this._scheduleRerun();
      },

      // ── Analyse ───────────────────────────────────────────────

      _scheduleRerun() {
        clearTimeout(this._rerunTimer);
        this._rerunTimer = setTimeout(() => this._runAnalysis(), RERUN_DELAY);
      },

      _runAnalysis() {
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
          g = computeMultiVari({ measurements, factors });
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

        const sm = module._context.stateManager;
        const measurementName = getColumnName(sm, this.model.columnRefs.measurement);
        const axisName = res.factorNames[0] || '';

        for (const strip of res.strips) {
          const host = await this.whenAnchor(`[data-strip="${strip.idx}"]`, gen);
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

      whenAnchor(selector, gen, maxFrames = 30) {
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
          types: ['numeric', 'percent', 'currency'],
          onChange: (ref) => {
            this.model.columnRefs.measurement = ref;
            this._scheduleRerun();
          },
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
            onChange: (ref) => {
              this.model.setFactorRef(f.id, ref);
              this._scheduleRerun();
            },
          });
          if (f.ref) picker.value = f.ref;
          this._factorPickers.set(f.id, picker);
        }
      },

      // ── Lebenszyklus ──────────────────────────────────────────

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

        this._runAnalysis();
      },

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

export default mod;
