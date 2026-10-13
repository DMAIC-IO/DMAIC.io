/**
 * D.Mike — C&E Matrix Module (ce-matrix.js)
 * Cause and Effect (X-Y) Matrix for scoring process inputs against outputs.
 * DMAIC phase: Analyze.
 *
 * Migrated to createModule + Alpine CSP. The Model (ce-matrix-model.js) holds
 * the persisted state (inputs, outputs, scores, weights) plus all weighted-scoring
 * business logic. The data-fn owns the view transforms (color scale → cell styles),
 * the input/weight/score event handlers, and the export handlers. The export
 * dropdown is declarative (config.actions children, framework-rendered).
 *
 * Spec: docs/modules/CE-MATRIX.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Eingangs- und
 *   Ergebnisgrößen anlegen, benennen und entfernen, die Kundenwichtigkeit je
 *   Ergebnisgröße, die Bewertung jeder Kreuzung und die Bewertungsskala. Der
 *   Oberfläche bleiben nur der Dateidownload und das Pareto-Diagramm, das
 *   sich aus den Zeilensummen selbst ergibt.
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX,
  exportTableAsPNG, exportTableAsSVG,
} from '../../core/export-utils.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireIndex } from '../../core/agent/agent-argcheck.js';
import {
  State, RATING_SCALES, SCALE_IDS, WEIGHTS,
} from './ce-matrix-model.js';

// ─── Color scale (green → yellow → red) — view only ───────────

const COLOR_STOPS = [
  { p: 0,    r: 34,  g: 197, b: 94  },
  { p: 0.35, r: 132, g: 204, b: 22  },
  { p: 0.55, r: 234, g: 179, b: 8   },
  { p: 0.75, r: 249, g: 115, b: 22  },
  { p: 1,    r: 239, g: 68,  b: 68  },
];

/** Linear-interpolate the gradient at a 0..1 ratio. */
function lerpColor(ratio) {
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i], b = COLOR_STOPS[i + 1];
    if (ratio >= a.p && ratio <= b.p) {
      const t = (ratio - a.p) / (b.p - a.p);
      return {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t),
      };
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1];
}

/** Background color (translucent) for a value within [min,max]. */
function colorForValue(val, min, max) {
  if (max === min) return 'transparent';
  const { r, g, b } = lerpColor((val - min) / (max - min));
  return `rgba(${r},${g},${b},.18)`;
}

/** Text color for a value within [min,max]. */
function textColorForValue(val, min, max) {
  if (max === min) return 'var(--color-text-tertiary)';
  const { r, g, b } = lerpColor((val - min) / (max - min));
  return `rgb(${r},${g},${b})`;
}

export default createModule({
  config: {
    id: 'ce-matrix',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.ce-matrix',
    version: '1.0.0',
    meta: import.meta,
    // `agentAction` nennt die Agentenmethode hinter der Leistenaktion
    // ausdrücklich; `title` ist ein Beschriftungsschlüssel und hier nur
    // zufällig gleich dem Methodennamen. Die Exportaktionen tragen keines:
    // ihre Methoden sind `_`-präfigiert und stehen in keiner Registry.
    actions: [
      { icon: 'action.add', title: 'addInput', variant: 'primary', agentAction: 'addInput', onClick: (d) => d.addInput() },
      { icon: 'action.add', title: 'addOutput', agentAction: 'addOutput', onClick: (d) => d.addOutput() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
        { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
        { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
        { icon: 'format.png',  title: 'export.png',  onClick: (d) => d._exportImage('png') },
        { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d._exportImage('svg') },
      ] },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      // ── Static view data ──────────────────────────────────────
      weightOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      scaleIds: Object.keys(RATING_SCALES),
      /** @type {Record<string, true>} cells whose last typed rating was rejected */
      rejectedCells: {},

      /** @type {any} live Pareto chart of Row Sums (right of the matrix). */
      _paretoChart: null,
      _paretoRaf: 0,

      // ── Score display ─────────────────────────────────────────
      /**
       * Raw stored score for an input (empty string when unset).
       * @noagent view transform
       */
      scoreDisplay(r, c) {
        const v = this.model.scores[this.model.key(r, c)];
        return v !== undefined ? v : '';
      },

      // ── Cell coloring (row / col sums) ────────────────────────
      /** @noagent view transform */
      rowSumStyle(r) {
        const sums = this.model.inputs.map((_, i) => this.model.rowSum(i));
        const min = Math.min(...sums);
        const max = Math.max(...sums);
        const v = this.model.rowSum(r);
        return `background:${  colorForValue(v, min, max)  };color:${  textColorForValue(v, min, max)}`;
      },
      /** @noagent view transform */
      colSumStyle(c) {
        const sums = this.model.outputs.map((_, i) => this.model.colSum(i));
        const min = Math.min(...sums);
        const max = Math.max(...sums);
        const v = this.model.colSum(c);
        return `background:${  colorForValue(v, min, max)  };color:${  textColorForValue(v, min, max)}`;
      },

      // ── Event handlers ────────────────────────────────────────
      // Jeder Handler packt nur sein Ereignis aus und ruft die Senke; die
      // Bewertung prüft er VORHER gegen die aktive Skala, damit ein
      // Tippfehler im Zahlenfeld wie bisher einen Hinweis gibt statt eines
      // Wurfs — die Oberfläche drückt die Absage durch die Markierung aus,
      // der Agent durch den Fehler.
      /**
       * @noagent packt das Eingabeereignis des Bewertungsfeldes aus; der
       *   Wert geht durch `setScore`.
       */
      scoreInput(r, c, event) {
        const raw = event.target.value;
        const k = this.model.key(r, c);
        const value = raw === '' ? null : Number(raw);
        if (value === null || this.model.allowedScores().includes(value)) {
          this.setScore(r, c, value);
          delete this.rejectedCells[k];
          return;
        }
        this.rejectedCells[k] = true;
        module._context.notify?.(_t('scoreRejected', {
          value: raw, allowed: this.model.allowedScores().join(', '),
        }), 'warning');
      },
      /**
       * @noagent packt das Änderungsereignis des Skalenfeldes aus; die
       *   Skala geht durch `setScale`.
       */
      scaleChanged(event) {
        if (!SCALE_IDS.includes(event.target.value)) return;
        this.setScale(event.target.value);
      },
      /** @noagent view transform */
      scoreMax() {
        const allowed = this.model.allowedScores();
        return allowed[allowed.length - 1];
      },
      _scoreFlagged(r, c) {
        return !!this.rejectedCells[this.model.key(r, c)] || !this.model.isOnScale(r, c);
      },
      /** @noagent view transform */
      scoreClass(r, c) {
        return this._scoreFlagged(r, c) ? 'ce-matrix__score-input--invalid' : '';
      },
      /** @noagent view transform */
      scoreTitle(r, c) {
        return this._scoreFlagged(r, c)
          ? _t('scoreAllowed', { allowed: this.model.allowedScores().join(', ') })
          : '';
      },
      /**
       * @noagent packt das Änderungsereignis des Zeilennamens aus; der Name
       *   geht durch `setInputName`.
       */
      inputNameChanged(r, event) {
        this.setInputName(r, event.target.value);
      },
      /**
       * @noagent packt das Änderungsereignis des Spaltennamens aus; der Name
       *   geht durch `setOutputName`.
       */
      outputNameChanged(c, event) {
        this.setOutputName(c, event.target.value);
      },
      /**
       * @noagent packt das Änderungsereignis der Gewichtsauswahl aus; das
       *   Gewicht geht durch `setWeight`.
       */
      weightChanged(c, event) {
        this.setWeight(c, parseInt(event.target.value, 10));
      },

      // ── Zustands-Sinks: ein benannter Setter je Feld (E2, E7) ──
      // Indexgrenzen: Zeile und Spalte bezeichnen eine Größe, die es GIBT,
      // der gültige Bereich endet also bei `length - 1`. Die
      // Kundenwichtigkeit und die Skala sind Wertemengen (das Auswahlfeld
      // der Oberfläche bietet genau diese Werte an), deshalb `requireEnum`
      // und nicht `requireIndex` — 1 bis 10 ist kein Index, und
      // `requireIndex` sagte unwahr `allowed: 0..10`.

      /**
       * Hängt eine weitere Eingangsgröße (Zeile) an die Matrix an.
       * @agent
       * @returns {number} die Zeilennummer der neuen Eingangsgröße
       */
      addInput() {
        this.model.addInput();
        return this.model.inputs.length - 1;
      },

      /**
       * Hängt eine weitere Ergebnisgröße (Spalte) mit der Kundenwichtigkeit 1
       * an die Matrix an.
       * @agent
       * @returns {number} die Spaltennummer der neuen Ergebnisgröße
       */
      addOutput() {
        this.model.addOutput();
        return this.model.outputs.length - 1;
      },

      /**
       * Entfernt eine Eingangsgröße samt ihrer Bewertungen.
       * @agent
       * @param {number} r die Zeilennummer, von 0 an gezählt
       * @returns {boolean} true wenn die Zeile entfernt wurde, false wenn es
       *   die letzte verbleibende war und sie stehen bleibt
       * @throws {Error} wenn `r` keine Eingangsgröße bezeichnet
       */
      removeInput(r) {
        requireIndex('r', r, this.model.inputs.length - 1);
        const before = this.model.inputs.length;
        this.model.removeInput(r);
        return this.model.inputs.length < before;
      },

      /**
       * Entfernt eine Ergebnisgröße samt ihrer Bewertungen und ihrer
       * Kundenwichtigkeit.
       * @agent
       * @param {number} c die Spaltennummer, von 0 an gezählt
       * @returns {boolean} true wenn die Spalte entfernt wurde, false wenn es
       *   die letzte verbleibende war und sie stehen bleibt
       * @throws {Error} wenn `c` keine Ergebnisgröße bezeichnet
       */
      removeOutput(c) {
        requireIndex('c', c, this.model.outputs.length - 1);
        const before = this.model.outputs.length;
        this.model.removeOutput(c);
        return this.model.outputs.length < before;
      },

      /**
       * Bewertet die Kreuzung einer Eingangs- mit einer Ergebnisgröße.
       * @agent
       * @param {number} r die Zeilennummer der Eingangsgröße, von 0 an gezählt
       * @param {number} c die Spaltennummer der Ergebnisgröße, von 0 an gezählt
       * @param {number|null} value die Bewertung aus der aktiven Skala;
       *   `null` löscht die Bewertung
       * @returns {boolean} true
       * @throws {Error} wenn `r` oder `c` keine Größe bezeichnet oder die
       *   aktive Skala `value` nicht zulässt
       */
      setScore(r, c, value) {
        requireIndex('r', r, this.model.inputs.length - 1);
        requireIndex('c', c, this.model.outputs.length - 1);
        // `null` ist der dokumentierte Leerwert der Feldhilfe von `scores`
        // und muss die Senke erreichen (Ruling 52); jede andere Bewertung
        // ausserhalb der Skala wirft weiter.
        if (value !== null && value !== undefined) {
          requireEnum('value', value, this.model.allowedScores());
        }
        return this.model.setScore(r, c, value ?? null);
      },

      /**
       * Wechselt die Bewertungsskala. Vorhandene Bewertungen bleiben stehen;
       * solche, die die neue Skala nicht zulässt, werden markiert statt
       * stillschweigend verändert.
       * @agent
       * @param {string} id die id der Skala
       * @returns {boolean} true
       * @throws {Error} wenn keine Skala diese id trägt
       */
      setScale(id) {
        requireEnum('id', id, SCALE_IDS);
        this.model.setScale(id);
        this.rejectedCells = {};
        const off = this.model.offScaleCount();
        if (off > 0) module._context.notify?.(_t('offScale', { count: off }), 'warning');
        return true;
      },

      /**
       * Benennt eine Eingangsgröße.
       * @agent
       * @param {number} r die Zeilennummer, von 0 an gezählt
       * @param {string} text der neue Name
       * @returns {void}
       * @throws {Error} wenn `r` keine Eingangsgröße bezeichnet
       */
      setInputName(r, text) {
        requireIndex('r', r, this.model.inputs.length - 1);
        this.model.inputs[r] = String(text ?? '');
      },

      /**
       * Benennt eine Ergebnisgröße.
       * @agent
       * @param {number} c die Spaltennummer, von 0 an gezählt
       * @param {string} text der neue Name
       * @returns {void}
       * @throws {Error} wenn `c` keine Ergebnisgröße bezeichnet
       */
      setOutputName(c, text) {
        requireIndex('c', c, this.model.outputs.length - 1);
        this.model.outputs[c] = String(text ?? '');
      },

      /**
       * Setzt die Kundenwichtigkeit einer Ergebnisgröße — den Faktor, mit dem
       * ihre Bewertungen in die Zeilensummen eingehen.
       * @agent
       * @param {number} c die Spaltennummer, von 0 an gezählt
       * @param {number} value die Kundenwichtigkeit, eine ganze Zahl von 1 bis 10
       * @returns {void}
       * @throws {Error} wenn `c` keine Ergebnisgröße bezeichnet oder `value`
       *   nicht zwischen 1 und 10 liegt
       */
      setWeight(c, value) {
        requireIndex('c', c, this.model.outputs.length - 1);
        requireEnum('value', value, WEIGHTS);
        this.model.weights[c] = value;
      },

      // ── Export ────────────────────────────────────────────────
      _exportCSV() {
        const m = this.model;
        const sep = ';';
        let csv = 'sep=;\n';
        csv += `"${this.t('weight')}"${  sep  }${m.weights.join(sep)  }${sep  }\n`;
        csv += `${sep + m.outputs.map(o => `"${o.replace(/"/g, '""')}"`).join(sep) + sep  }"${this.t('rowSum')}"\n`;
        for (let r = 0; r < m.inputs.length; r++) {
          csv += `"${m.inputs[r].replace(/"/g, '""')}"`;
          for (let c = 0; c < m.outputs.length; c++) csv += sep + m.getScore(r, c);
          csv += `${sep + m.rowSum(r)  }\n`;
        }
        csv += `"${this.t('colSum')}"`;
        for (let c = 0; c < m.outputs.length; c++) csv += sep + m.colSum(c);
        csv += '\n';
        downloadFile(csv, 'ce-matrix.csv', 'text/csv;charset=utf-8');
        module._context.notify('CSV', 'success', 'status.ok');
      },

      async _exportXLSX() {
        const m = this.model;
        // A failed load already toasted (core/chunks.js).
        let XLSX;
        try { XLSX = await ensureXLSX(); } catch { return; }
        const rows = [];
        rows.push([this.t('weight'), ...m.weights, '']);
        rows.push(['', ...m.outputs, this.t('rowSum')]);
        for (let r = 0; r < m.inputs.length; r++) {
          const row = [m.inputs[r]];
          for (let c = 0; c < m.outputs.length; c++) row.push(m.getScore(r, c));
          row.push(m.rowSum(r));
          rows.push(row);
        }
        const footRow = [this.t('colSum')];
        for (let c = 0; c < m.outputs.length; c++) footRow.push(m.colSum(c));
        rows.push(footRow);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'C&E Matrix');
        XLSX.writeFile(wb, 'ce-matrix.xlsx');
        module._context.notify('Excel', 'success', 'status.ok');
      },

      _exportJSON() {
        const json = JSON.stringify(this.model.toJSON(), null, 2);
        downloadFile(json, 'ce-matrix.json', 'application/json');
        module._context.notify('JSON', 'success', 'status.ok');
      },

      _buildTableDescriptor() {
        const m = this.model;
        const cells = [];
        for (let r = 0; r < m.inputs.length; r++) {
          const row = [];
          for (let c = 0; c < m.outputs.length; c++) {
            const v = m.scores[m.key(r, c)];
            row.push(v !== undefined ? v : '');
          }
          cells.push(row);
        }
        return {
          outputs: [...m.outputs],
          inputs: [...m.inputs],
          weights: [...m.weights],
          weightLabel: this.t('weight'),
          cells,
          rowSums: m.inputs.map((_, r) => m.rowSum(r)),
          colSums: m.outputs.map((_, c) => m.colSum(c)),
          grandTotal: m.grandTotal(),
          rowSumLabel: this.t('rowSum'),
          colSumLabel: this.t('colSum'),
          cellBg: (v, min, max) => colorForValue(v, min, max),
          cellFg: (v, min, max) => textColorForValue(v, min, max),
        };
      },

      async _exportImage(format) {
        const td = this._buildTableDescriptor();
        if (format === 'png') {
          exportTableAsPNG(td, 'ce-matrix.png');
          module._context.notify('PNG', 'success', 'status.ok');
        } else {
          await exportTableAsSVG(td, 'ce-matrix.svg');
          module._context.notify('SVG', 'success', 'status.ok');
        }
      },

      // ── Pareto (Row Sums, live) ───────────────────────────────

      /** Build {name,value}[] from current inputs + row sums. */
      _paretoItems() {
        const m = this.model;
        return m.inputs.map((name, r) => ({
          name: (name && String(name).trim()) || `Input ${r + 1}`,
          value: Math.max(0, m.rowSum(r) || 0),
        }));
      },

      /** Recreate the chart with current items. Called on model changes. */
      async _renderPareto() {
        const host = this.$el.querySelector('[data-ref="pareto-host"]');
        if (!host) return;
        const cm = module._context.chartManager;

        if (this._paretoChart) {
          try { cm.destroy(this._paretoChart); } catch { /* ignore */ }
          this._paretoChart = null;
        }
        host.replaceChildren();

        this._paretoChart = await cm.create(host, 'pareto', {
          title: this.t('paretoTitle'),
          yLabel: this.t('paretoYLabel'),
          items: this._paretoItems(),
          otherBucket: true,
          showLegend: false,
        });
      },

      /** rAF-debounced re-render so rapid keystrokes don't thrash the chart. */
      _schedulePareto() {
        if (this._paretoRaf) cancelAnimationFrame(this._paretoRaf);
        this._paretoRaf = requestAnimationFrame(() => {
          this._paretoRaf = 0;
          this._renderPareto();
        });
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      /** @noagent lifecycle, kein Zustandsweg */
      init() {
        this.$nextTick(() => this._renderPareto());
        this.$watch('model.inputs',  () => this._schedulePareto());
        this.$watch('model.outputs', () => this._schedulePareto());
        this.$watch('model.weights', () => this._schedulePareto());
        this.$watch('model.scores',  () => this._schedulePareto());
      },
      /** @noagent lifecycle, kein Zustandsweg */
      destroy() {
        if (this._paretoRaf) { cancelAnimationFrame(this._paretoRaf); this._paretoRaf = 0; }
        if (this._paretoChart) {
          try { module._context.chartManager.destroy(this._paretoChart); } catch { /* ignore */ }
          this._paretoChart = null;
        }
      },
    };
  },
});
