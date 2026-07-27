/**
 * DMAIC.io — MSA Typ 5 Module (msa-typ5.js)
 * Measure phase: Attributive Prüfmittel-Fähigkeit.
 * Fünf Prüfer × Teile × Wiederholungen mit binärem / nominalem / ordinalem
 * Merkmal — Kappa-basierte Übereinstimmung, Effektivität, Signal Detection.
 *
 * Migriert auf createModule + Alpine CSP. Das Model (msa-typ5-model.js) hält
 * ausschließlich die Roh-Inputs (params + fünf Column-Refs + optionale
 * Beispieldaten-Worksheet-Id); das analyze()-Ergebnis wird transient in der
 * View aus diesen Inputs plus den Live-Worksheet-Daten via
 * `js/engines/msa-typ5-engine.js` abgeleitet. ColumnPicker und Charts werden
 * imperativ gemountet (keine reinen Template-Belange).
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ5-model.js';
import { analyze } from '../../engines/msa-typ5-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { computeGageRunChart } from '../../engines/gage-run-chart-engine.js';
import { renderGageRunStrips } from '../../core/chart/gage-run-strips.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
/** @param {number} rate @returns {string} */
function fmtPct(rate) { return Number.isFinite(rate) ? `${(rate * 100).toFixed(1)} %` : '—'; }

/** Mittelwert einer Zahlenliste unter Ignorieren von NaN/Infinity. */
function mean(arr) {
  const clean = (arr || []).filter(Number.isFinite);
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : null;
}

/** Verdikt-Level → dmike-kpi-Modifier-Klasse. */
function verdictClass(level) {
  if (level === 'good') return 'dmike-kpi--good';
  if (level === 'marginal') return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}

/** κ-Wert → Ampel-Klasse (AIAG-Schwellen 0.75 / 0.40). */
function kappaClass(k) {
  if (!Number.isFinite(k)) return '';
  if (k >= 0.75) return 'dmike-kpi--good';
  if (k >= 0.40) return 'dmike-kpi--warn';
  return 'dmike-kpi--bad';
}

const mod = createModule({
  config: {
    id: 'msa-typ5',
    engine: 'alpine',
    phase: 'measure',
    icon: 'check-square',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      _pickers: { part: null, appraiser: null, rating: null, reference: null, replicate: null },
      _charts: [],
      _unsubs: [],
      _renderGen: 0,

      // Passthroughs für Template-Ausdrücke
      fmt,
      fmtPct,
      verdictClass,

      // ── Levels-Panel (View-Getter) ────────────────────────────

      /** Rohwerte aus der Bewertungs-Spalte (dedupliziert + sortiert). */
      detectedLevels() {
        const ref = this.model.columns.rating;
        if (!ref) return [];
        const vals = getColumnValues(module._context.stateManager, ref) || [];
        const cleaned = vals.filter((v) => v !== null && v !== undefined && v !== '');
        const unique = [...new Set(cleaned.map((v) => String(v)))];
        if (unique.length > 0 && unique.every((v) => Number.isFinite(Number(v)))) {
          return unique.sort((a, b) => Number(a) - Number(b));
        }
        return unique.sort();
      },

      /** Zwei häufigste Bewertungs-Werte für den Binär-Fall. */
      _twoMostFrequent() {
        const ref = this.model.columns.rating;
        const levels = this.detectedLevels();
        if (!ref) return [levels[0], levels[1]];
        const vals = getColumnValues(module._context.stateManager, ref) || [];
        const counts = new Map();
        for (const v of vals) {
          if (v === null || v === undefined || v === '') continue;
          const key = String(v);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
        return [sorted[0] ?? levels[0], sorted[1] ?? levels[1]];
      },

      binaryPositive() {
        const levels = this.detectedLevels();
        const [firstTwo] = [this._twoMostFrequent()];
        const pos = (this.model.params.positiveLevel && levels.includes(this.model.params.positiveLevel))
          ? this.model.params.positiveLevel
          : firstTwo[0];
        return pos ?? '—';
      },

      binaryNegative() {
        const levels = this.detectedLevels();
        const [firstTwo] = [this._twoMostFrequent()];
        const pos = this.binaryPositive();
        const neg = firstTwo.find((v) => v !== pos) ?? levels.find((v) => v !== pos);
        return neg ?? '—';
      },

      swapPositive() {
        const neg = this.binaryNegative();
        if (neg === '—') return;
        this.model.params.positiveLevel = neg;
        this.runAnalysis();
      },

      weightsHiddenClass() {
        return this.model.params.type === 'ordinal' ? '' : 'msa-typ5__hidden';
      },

      // ── Feature-type change resets positiveLevel + neu analysieren ──

      onTypeChanged() {
        this.model.params.positiveLevel = null;
        this.runAnalysis();
      },

      // ── Referenzquelle-Anzeige ────────────────────────────────

      referenceSourceLabel() {
        const src = this.result?.meta?.referenceSource;
        if (!src) return '—';
        const key = `labels.referenceSource${src.charAt(0).toUpperCase() + src.slice(1)}`;
        return _t(key);
      },

      // ── Verdikt / Empty-State ────────────────────────────────

      verdictLabel(level) {
        const key = `verdict${level.charAt(0).toUpperCase() + level.slice(1)}`;
        return _t(key);
      },

      emptyStateText() {
        const err = this.result?.meta?.errors?.[0];
        if (err) return this._translateCode(err, 'err');
        return _t('emptyState');
      },

      warningEntries() {
        const ws = this.result?.meta?.warnings || [];
        return ws.map((w) => {
          const params = { ...(w.params || {}) };
          if (Array.isArray(params.appraisers)) params.appraisers = params.appraisers.join(', ');
          return this._translateCode({ code: w.code, params }, 'warn');
        });
      },

      /** Engine-Codes E_TOO_FEW_PARTS / W_UNBALANCED_REPS → i18n-Keys. */
      _translateCode({ code, params }, prefix) {
        const stripped = code.replace(/^E_|^W_/, '');
        const camel = stripped.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join('');
        return _t(`${prefix}${camel}`, params ?? {});
      },

      verdictSubline() {
        const r = this.result;
        if (!r) return '';
        const fk = r.betweenAppraisers?.fleissKappa || {};
        const src = r.meta?.referenceSource || 'none';
        const srcLabel = _t(`labels.referenceSource${src.charAt(0).toUpperCase() + src.slice(1)}`);
        const ci = (fk.ci95 && Number.isFinite(fk.ci95[0]) && Number.isFinite(fk.ci95[1]))
          ? ` (KI [${fmt(fk.ci95[0], 3)}, ${fmt(fk.ci95[1], 3)}])`
          : '';
        return `Fleiss κ = ${fmt(fk.kappa, 3)}${ci} · ${_t('labels.referenceSource')}: ${srcLabel}`;
      },

      // ── KPI-Aggregate ────────────────────────────────────────

      fleissKappa()  { return this.result?.betweenAppraisers?.fleissKappa?.kappa ?? null; },
      fleissMethod() { return this.result?.betweenAppraisers?.fleissKappa?.method || ''; },

      _repRates()   { return Object.values(this.result?.perAppraiser || {}).map((x) => x.repeatability?.rate).filter(Number.isFinite); },
      _effRates()   { return Object.values(this.result?.perAppraiser || {}).map((x) => x.vsReference?.effectiveness?.rate).filter(Number.isFinite); },
      _kappaVsRefs(){ return Object.values(this.result?.perAppraiser || {}).map((x) => x.vsReference?.kappa?.kappa).filter(Number.isFinite); },

      meanRepeatability() { return mean(this._repRates()); },
      meanEffectiveness() { return mean(this._effRates()); },
      meanKappaVsRef()    { return mean(this._kappaVsRefs()); },

      interpretationText() {
        const ip = this.result?.interpretation;
        if (!ip) return '';
        // engine liefert vollen Key inkl. Prefix `modules.msa-typ5.interp_*`;
        // hier direkt an i18n weiterreichen (kein Prefix-Trim).
        return module._context.i18n.t(ip.textKey, ip.params || {});
      },

      // ── Tabellen (View-Rows) ─────────────────────────────────

      perAppraiserRows() {
        const per = this.result?.perAppraiser;
        if (!per) return [];
        return Object.entries(per).map(([id, v]) => {
          const rep  = v.repeatability;
          const eff  = v.vsReference?.effectiveness;
          const miss = v.vsReference?.missRate;
          const fa   = v.vsReference?.falseAlarmRate;
          const bias = v.vsReference?.biasRate;
          return {
            id,
            repeatability:   rep  ? fmtPct(rep.rate)   : '—',
            effectiveness:   eff  ? fmtPct(eff.rate)   : '—',
            missRate:        miss ? fmtPct(miss.rate)  : '—',
            falseAlarmRate:  fa   ? fmtPct(fa.rate)    : '—',
            biasRate:        bias ? fmt(bias.value, 3) : '—',
          };
        });
      },

      pairTableTitle() {
        return `${_t('table.pair')} — ${_t('table.cohenKappa')}`;
      },

      pairRows() {
        const p = this.result?.betweenAppraisers?.pairwiseCohenKappa;
        if (!p) return [];
        return Object.entries(p).map(([pair, k]) => {
          const ci = (k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1]))
            ? `[${fmt(k.ci95[0], 3)}, ${fmt(k.ci95[1], 3)}]`
            : '—';
          return {
            pair,
            pairLabel: pair.replace('|', ' | '),
            kappa: fmt(k.kappa, 3),
            ci95: ci,
            ampelClass: kappaClass(k.kappa),
          };
        });
      },

      vsRefRows() {
        const per = this.result?.perAppraiser;
        if (!per) return [];
        return Object.entries(per)
          .filter(([, v]) => v.vsReference?.kappa)
          .map(([id, v]) => {
            const k = v.vsReference.kappa;
            const ci = (k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1]))
              ? `[${fmt(k.ci95[0], 3)}, ${fmt(k.ci95[1], 3)}]`
              : '—';
            return {
              id,
              kappa: fmt(k.kappa, 3),
              ci95: ci,
              ampelClass: kappaClass(k.kappa),
            };
          });
      },

      hasEffectivenessChart() {
        const per = this.result?.perAppraiser;
        if (!per) return false;
        return Object.values(per).some((x) => x.vsReference?.effectiveness);
      },

      hasSdtChart() {
        return !!this.result?.signalDetection;
      },

      /**
       * Wie die Bewertungen auf die Zahlenachse des Messverlaufsdiagramms
       * kommen — oder null, wenn das keine ehrliche Darstellung ergibt.
       *
       * Eine Zahlenachse setzt eine Reihenfolge voraus. Ordinale Skalen und
       * numerisch kodierte Bewertungen bringen sie mit. Bei binären Studien
       * gibt die Studienart sie vor (negativ < positiv), auch wenn die Marken
       * Text sind ("ok"/"nok") — das ist der klassische Fall der attributiven
       * Prüfung. Nominale Klassen ("Kratzer"/"Delle"/"Riss") haben keine
       * Reihenfolge; eine Achse würde eine erfinden, also kein Diagramm.
       *
       * @returns {{map: (v: string) => number, label: string}|null}
       */
      _gageRunEncoding() {
        const rows = this._ratingRows;
        if (!this.result || !Array.isArray(rows) || rows.length === 0) return null;

        if (rows.every(r => Number.isFinite(Number(r.value)))) {
          return { map: (v) => Number(v), label: _t('labels.ratingColumn') };
        }

        if (this.model.params.type === 'binary') {
          const pos = this.binaryPositive();
          const neg = this.binaryNegative();
          const known = pos !== '—' && neg !== '—';
          if (known && rows.every(r => r.value === pos || r.value === neg)) {
            return {
              map: (v) => (v === pos ? 1 : 0),
              label: _t('charts.gageRunBinaryAxis', { neg, pos }),
            };
          }
        }

        return null;
      },

      hasGageRunChart() {
        return this._gageRunEncoding() !== null;
      },

      // ── Analyse ──────────────────────────────────────────────

      /**
       * Baut das Long-Format-Ratings-Array aus den fünf Spalten und ruft die
       * Engine. Aktualisiert `this.result` und triggert das Chart-Rendering.
       */
      runAnalysis() {
        const cols = this.model.columns;
        if (!cols.part || !cols.appraiser || !cols.rating) {
          return this._clearResult();
        }

        const sm = module._context.stateManager;
        const parts   = getColumnValues(sm, cols.part)      || [];
        const apprs   = getColumnValues(sm, cols.appraiser) || [];
        const ratings = getColumnValues(sm, cols.rating)    || [];
        const refs    = cols.reference ? (getColumnValues(sm, cols.reference) || []) : null;
        const reps    = cols.replicate ? (getColumnValues(sm, cols.replicate) || []) : null;

        const N = Math.min(parts.length, apprs.length, ratings.length);
        if (N === 0) return this._clearResult();

        const rows = [];
        const referenceMap = {};
        for (let i = 0; i < N; i++) {
          if (parts[i] === null || parts[i] === undefined || parts[i] === '') continue;
          if (apprs[i] === null || apprs[i] === undefined || apprs[i] === '') continue;
          if (ratings[i] === null || ratings[i] === undefined || ratings[i] === '') continue;
          const row = {
            part: String(parts[i]),
            appraiser: String(apprs[i]),
            value: String(ratings[i]),
          };
          if (reps && reps[i] !== null && reps[i] !== undefined && reps[i] !== '') {
            const r = Number(reps[i]);
            row.rep = Number.isFinite(r) ? r : (i + 1);
          } else {
            row.rep = null;
          }
          rows.push(row);
          if (refs && refs[i] !== null && refs[i] !== undefined && refs[i] !== '') {
            referenceMap[String(parts[i])] = String(refs[i]);
          }
        }
        if (rows.length === 0) return this._clearResult();

        // Klassen aus den vorkommenden Bewertungs-Werten ableiten.
        const values = [...new Set(rows.map((r) => r.value))];
        let levels;
        const p = this.model.params;
        if (p.type === 'ordinal') {
          levels = values.every((v) => Number.isFinite(Number(v)))
            ? values.sort((a, b) => Number(a) - Number(b))
            : values.sort();
        } else {
          levels = values.sort();
          if (p.type === 'binary' && p.positiveLevel && levels.includes(p.positiveLevel)) {
            levels = [p.positiveLevel, ...levels.filter((v) => v !== p.positiveLevel)];
          } else if (p.type === 'binary') {
            const [pos] = this._twoMostFrequent();
            if (pos && levels.includes(pos)) {
              levels = [pos, ...levels.filter((v) => v !== pos)];
            }
          }
        }

        const referencesArg = cols.reference
          ? (Object.keys(referenceMap).length > 0 ? referenceMap : {})
          : null;

        let result;
        try {
          result = analyze({
            type: p.type,
            levels,
            ratings: rows,
            references: referencesArg,
            params: {
              alpha: parseFloat(p.alpha) || 0.05,
              weights: p.weights,
            },
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[msa-typ5] analyze() threw:', err);
          return this._clearResult();
        }

        this.result = result;
        // Für das Messverlaufsdiagramm: genau die Zeilen, die in die Analyse
        // eingegangen sind.
        this._ratingRows = rows;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(result, gen));
      },

      _clearResult() {
        this.result = null;
        this._destroyCharts();
      },

      // ── Charts (imperativ via chartManager) ──────────────────

      async _renderCharts(res, gen) {
        this._destroyCharts();
        await this._renderKappaBar(res, gen);
        if (gen !== this._renderGen) return;
        if (Object.values(res.perAppraiser).some((x) => x.vsReference?.effectiveness)) {
          await this._renderEffectivenessBar(res, gen);
          if (gen !== this._renderGen) return;
        }
        if (res.signalDetection) {
          await this._renderSdtScatter(res, gen);
          if (gen !== this._renderGen) return;
        }
        if (this.hasGageRunChart()) {
          await this._renderGageRunChart(res, gen);
          if (gen !== this._renderGen) return;
        }
        await this._renderConfusionHeatmaps(res, gen);
      },

      /**
       * Messverlaufsdiagramm über die Rohbewertungen: ein Feld je Prüfeinheit,
       * Farbe je Prüfer. Macht sichtbar, WO die Übereinstimmung bricht — welcher
       * Prüfer bei welchem Teil abweicht — was Kappa nur als Zahl verdichtet.
       */
      async _renderGageRunChart(res, gen) {
        const el = module._container.querySelector('[data-ref="chart-gage-run"]');
        if (!el) return;

        const enc = this._gageRunEncoding();
        if (!enc) { el.replaceChildren(); return; }
        const rows = this._ratingRows || [];
        const g = computeGageRunChart({
          parts: rows.map(r => r.part),
          operators: rows.map(r => r.appraiser),
          measurements: rows.map(r => enc.map(r.value)),
        });
        if (!g.n) { el.replaceChildren(); return; }

        const charts = await renderGageRunStrips(module._context, el, {
          panels: g.panels,
          operators: g.operators,
          refValue: g.grandMean,
          refLabel: _t('charts.gageRunMean'),
          yMin: g.yMin,
          yMax: g.yMax,
          perRow: 10,
          xLabel: _t('labels.partColumn'),
          yLabel: enc.label,
          rowClass: 'msa-typ5__gage-run-row',
          isStale: () => gen !== this._renderGen,
        });
        this._charts.push(...charts);
      },

      async _renderKappaBar(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-kappa-bar"]');
        if (!host) return;
        const entries = Object.entries(res.betweenAppraisers?.pairwiseCohenKappa || {});
        if (!entries.length) return;

        const labels = entries.map(([pair]) => pair.replace('|', ' | '));
        const x = entries.map((_, i) => i);
        const y = entries.map(([, k]) => k.kappa);
        const yPlus  = entries.map(([, k]) => (Number.isFinite(k.ci95?.[1]) ? Math.max(0, k.ci95[1] - k.kappa) : 0));
        const yMinus = entries.map(([, k]) => (Number.isFinite(k.ci95?.[0]) ? Math.max(0, k.kappa - k.ci95[0]) : 0));

        const refLines = [
          { dir: 'h', value: 0.75, label: 'κ = 0.75', dash: 'dash', width: 1, color: 'var(--color-success, #2ea043)' },
          { dir: 'h', value: 0.40, label: 'κ = 0.40', dash: 'dash', width: 1, color: 'var(--color-warning, #d29922)' },
        ];
        const fleiss = res.betweenAppraisers?.fleissKappa?.kappa;
        if (Number.isFinite(fleiss)) {
          refLines.push({ dir: 'h', value: fleiss, label: `Fleiss κ = ${fleiss.toFixed(3)}`, dash: 'solid', width: 1, color: 'var(--color-info, #58a6ff)' });
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: _t('table.pair'),
          yLabel: 'Cohen κ',
          showLegend: false,
          xTicks: x,
          xTickFormat: (v) => labels[Math.round(v)] ?? '',
          xMin: -0.5,
          xMax: x.length - 0.5,
          yMin: Math.min(-0.1, ...y, ...entries.map(([, k]) => k.ci95?.[0] ?? 0)),
          yMax: Math.max(1.05, ...y, ...entries.map(([, k]) => k.ci95?.[1] ?? 0)),
          series: [{
            name: 'κ',
            color: 'var(--color-accent, #58a6ff)',
            x, y,
            symbol: 'circle',
            markerSize: 10,
            strokeWidth: 1.5,
            errorBars: { show: true, yMode: 'relative', yPlus, yMinus },
          }],
          refLines,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderEffectivenessBar(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-eff-bar"]');
        if (!host) return;
        const entries = Object.entries(res.perAppraiser).filter(([, v]) => v.vsReference?.effectiveness);
        if (!entries.length) return;

        const labels = entries.map(([id]) => id);
        const x = entries.map((_, i) => i);
        const y = entries.map(([, v]) => v.vsReference.effectiveness.rate);
        const yPlus  = entries.map(([, v]) => Math.max(0, (v.vsReference.effectiveness.ci95?.[1] ?? y[0]) - v.vsReference.effectiveness.rate));
        const yMinus = entries.map(([, v]) => Math.max(0, v.vsReference.effectiveness.rate - (v.vsReference.effectiveness.ci95?.[0] ?? y[0])));

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: _t('table.appraiser'),
          yLabel: _t('kpi.effectiveness'),
          showLegend: false,
          xTicks: x,
          xTickFormat: (v) => labels[Math.round(v)] ?? '',
          xMin: -0.5,
          xMax: x.length - 0.5,
          yMin: 0,
          yMax: 1.05,
          series: [{
            name: _t('kpi.effectiveness'),
            color: 'var(--color-accent, #58a6ff)',
            x, y,
            symbol: 'circle',
            markerSize: 10,
            strokeWidth: 1.5,
            errorBars: { show: true, yMode: 'relative', yPlus, yMinus },
          }],
          refLines: [
            { dir: 'h', value: 0.90, label: '90 %', dash: 'dash', width: 1, color: 'var(--color-success, #2ea043)' },
            { dir: 'h', value: 0.80, label: '80 %', dash: 'dash', width: 1, color: 'var(--color-warning, #d29922)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderSdtScatter(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-sdt"]');
        if (!host) return;
        const per = res.signalDetection?.perAppraiser || {};
        const ids = Object.keys(per);
        if (!ids.length) return;
        const palette = [
          'var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-chart-5)',
          'var(--color-chart-2)', 'var(--color-chart-7)', 'var(--color-chart-4)',
        ];
        const series = ids.map((id, i) => ({
          name: id,
          color: palette[i % palette.length],
          x: [per[id].criterion],
          y: [per[id].dPrime],
          symbol: 'circle',
          markerSize: 12,
          strokeWidth: 1.5,
        }));

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: 'Kriterium c',
          yLabel: "d'",
          showLegend: true,
          series,
          refLines: [
            { dir: 'v', value: 0, label: 'c = 0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
            { dir: 'h', value: 0, label: "d' = 0", dash: 'dash', width: 1, color: 'var(--color-text-secondary)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderConfusionHeatmaps(res, gen) {
        const host = module._container.querySelector('[data-ref="chart-heatmaps"]');
        if (!host) return;

        const items = [];
        for (const [id, v] of Object.entries(res.perAppraiser || {})) {
          if (v.confusionMatrix && Array.isArray(v.confusionMatrix.counts)) {
            items.push({
              title: `${id} vs. ${_t('labels.referenceSource')}`,
              rows: v.confusionMatrix.rows,
              cols: v.confusionMatrix.cols,
              counts: v.confusionMatrix.counts,
            });
          }
        }
        for (const [pair, k] of Object.entries(res.betweenAppraisers?.pairwiseCohenKappa || {})) {
          if (!k.confusion || !Array.isArray(k.confusion.counts)) continue;
          const [a, b] = pair.split('|');
          items.push({
            title: `${a} vs. ${b}`,
            rows: k.confusion.rows,
            cols: k.confusion.cols,
            counts: k.confusion.counts,
          });
        }
        if (!items.length) { host.replaceChildren(); return; }

        // Grid-Zellen imperativ aufbauen — Anker liegen sonst in verschachteltem
        // x-if/x-for (bekannte Alpine-CSP-Gotcha §6). Innerhalb der Zellen
        // benutzen wir textContent statt innerHTML gegen XSS.
        host.replaceChildren();
        for (let i = 0; i < items.length; i++) {
          const cell = document.createElement('div');
          cell.className = 'msa-typ5__heatmap-cell';
          const title = document.createElement('div');
          title.className = 'msa-typ5__heatmap-title';
          title.textContent = items[i].title;
          const body = document.createElement('div');
          body.className = 'msa-typ5__heatmap-body';
          body.setAttribute('data-ref', `heatmap-${i}`);
          cell.append(title, body);
          host.appendChild(cell);
        }

        for (let i = 0; i < items.length; i++) {
          if (gen !== this._renderGen) return;
          const target = host.querySelector(`[data-ref="heatmap-${i}"]`);
          if (!target) continue;
          // Belt-and-braces: kill any residual chart cards inside the body
          // (defensive against races between concurrent runAnalysis() calls
          // where a stale generation slipped a card in before the guard fired).
          target.replaceChildren();
          const chart = await module._context.chartManager.create(target, 'heatmap', {
            xCategories: items[i].cols,
            yCategories: items[i].rows,
            cells: items[i].counts,
            cellGap: 1,
            valueDecimals: 0,
            valueLabel: 'n',
            showCellLabels: true,
            squareCells: true,
            plotMargins: { top: 6, right: 10, bottom: 22, left: 42 },
            colorScheme: 'viridis',
          });
          if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
          this._charts.push(chart);
        }
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
        const roles = ['part', 'appraiser', 'rating', 'reference', 'replicate'];
        for (const role of roles) {
          const el = module._container.querySelector(`[data-ref="col-${role}-wrap"]`);
          if (!el) continue;
          this._pickers[role]?.destroy();
          this._pickers[role] = new ColumnPicker(el, module._context, {
            mode: 'single',
            onChange: (ref) => {
              this.model.columns[role] = ref;
              this.runAnalysis();
            },
          });
          if (this.model.columns[role]) {
            this._pickers[role].value = this.model.columns[role];
          }
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (das data()-Objekt wird per Alpine.data geteilt).
        this._charts = [];
        this._unsubs = [];
        this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null };

        this._mountPickers();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId } = {}) => {
          if (!instanceId || instanceId === module._context.instanceId) {
            for (const p of Object.values(this._pickers)) p?.refresh?.();
          }
        };
        const rerun = () => this.runAnalysis();
        const nullOnColumnRemoved = ({ instanceId, columnId } = {}) => {
          let touched = false;
          for (const role of Object.keys(this.model.columns)) {
            const r = this.model.columns[role];
            if (r && r.instanceId === instanceId && r.columnId === columnId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          if (touched) this.runAnalysis();
        };
        const nullOnWorksheetRemoved = ({ instanceId } = {}) => {
          let touched = false;
          for (const role of Object.keys(this.model.columns)) {
            if (this.model.columns[role]?.instanceId === instanceId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          if (touched) this.runAnalysis();
        };
        eb.on('module:activated',         onActivated);
        eb.on('worksheet:dataChanged',    rerun);
        eb.on('worksheet:column-removed', nullOnColumnRemoved);
        eb.on('worksheet:removed',        nullOnWorksheetRemoved);
        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(
          () => eb.off('module:activated',         onActivated),
          () => eb.off('worksheet:dataChanged',    rerun),
          () => eb.off('worksheet:column-removed', nullOnColumnRemoved),
          () => eb.off('worksheet:removed',        nullOnWorksheetRemoved),
          () => eb.off('theme:changed',            onTheme),
        );

        // Ergebnis aus wiederhergestelltem State neu berechnen.
        this.runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        for (const p of Object.values(this._pickers)) p?.destroy?.();
        this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null };
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ5-Beispiele liefern ein komplettes Worksheet
 * (`sourceWorksheetData`) und benutzen den Platzhalter `__source__` als
 * `columns.<role>.instanceId`. loadExampleViaWorksheet provisioniert eine
 * frische Worksheet-Instanz, wir mappen die Platzhalter auf deren instanceId
 * und wenden dann den State an (der die Analyse auf den neuen Daten anstößt).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      if (!data.columns) return data;
      const next = { ...data.columns };
      for (const role of ['part', 'appraiser', 'rating', 'reference', 'replicate']) {
        const r = next[role];
        if (r && r.instanceId === '__source__') {
          next[role] = { ...r, instanceId };
        }
      }
      return { ...data, columns: next };
    },
  });
};

export default mod;
