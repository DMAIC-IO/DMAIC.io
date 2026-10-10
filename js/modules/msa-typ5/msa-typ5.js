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
import { State, formatP, formatNum, formatPct } from './msa-typ5-model.js';
import { analyze, kappaLevel, ratedShare, stackWide } from '../../engines/msa-typ5-engine.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';
import { computeGageRunChart } from '../../engines/gage-run-chart-engine.js';
import { renderGageRunStrips } from '../../core/chart/gage-run-strips.js';

/**
 * Confidence interval '[lo, hi]'; German uses '; ' because ',' is the decimal sign.
 * @param {number[]} ci @param {'de'|'en'} lang @returns {string}
 */
function fmtCI(ci, lang) {
  return `[${formatNum(ci[0], 3, lang)}${lang === 'de' ? ';' : ','} ${formatNum(ci[1], 3, lang)}]`;
}

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

/** Verdict level → traffic-light class for the table dots. */
function levelClass(level) {
  if (level === 'good') return 'dmike-kpi--good';
  if (level === 'marginal') return 'dmike-kpi--warn';
  if (level === 'unacceptable') return 'dmike-kpi--bad';
  return '';
}

/** z statistic with two decimals; non-finite → '—'. */
function fmtZ(z, lang) { return formatNum(z, 2, lang); }

/**
 * Criterion value for the criteria table: κ with three decimals, rates as
 * percent.
 * @param {string} id criterion id
 * @param {number} v
 * @param {'de'|'en'} lang
 * @returns {string}
 */
function fmtCriterion(id, v, lang) {
  return (id === 'fleissKappa' || id === 'minKappa') ? formatNum(v, 3, lang) : formatPct(v, lang);
}

/**
 * κ → traffic-light class under the limits of the active rule set.
 * @param {number} k
 * @param {'aiag'|'bosch'} ruleSet
 * @returns {string}
 */
function kappaClass(k, ruleSet) {
  return levelClass(kappaLevel(k, ruleSet));
}

const mod = createModule({
  config: {
    id: 'msa-typ5',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.msa-typ5',
    version: '1.2.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      // i18n text of a wide-layout problem (trials vs. column count), else null.
      layoutError: null,
      _pickers: { part: null, appraiser: null, rating: null, reference: null, replicate: null, ratings: null },
      _charts: [],
      _unsubs: [],
      _renderGen: 0,
      // Filter der Teile-Tabelle. Reine Anzeigevorliebe, daher transient —
      // ein neu geladenes Projekt startet bewusst mit allen Teilen sichtbar.
      onlyDisputed: false,

      // Passthroughs für Template-Ausdrücke
      verdictClass,

      /** κ and other numbers with the language decimal separator. */
      fmt(v, d = 3) { return formatNum(v, d, this._lang()); },
      /** Rate (0…1) as percent with the language decimal separator. */
      fmtPct(rate) { return formatPct(rate, this._lang()); },

      // ── Levels-Panel (View-Getter) ────────────────────────────

      /**
       * Raw rating cells: the rating column (long layout) or all rating
       * columns of the wide layout; null when none is chosen.
       * @returns {Array<*>|null}
       */
      _ratingValues() {
        const sm = module._context.stateManager;
        if (this.model.params.layout === 'wide') {
          const refs = this.model.columns.ratings;
          return refs.length ? refs.flatMap((r) => getColumnValues(sm, r) || []) : null;
        }
        const ref = this.model.columns.rating;
        return ref ? (getColumnValues(sm, ref) || []) : null;
      },

      /** Rohwerte aus der Bewertungs-Spalte (dedupliziert + sortiert). */
      detectedLevels() {
        const vals = this._ratingValues();
        if (!vals) return [];
        const cleaned = vals.filter((v) => v !== null && v !== undefined && v !== '');
        const unique = [...new Set(cleaned.map((v) => String(v)))];
        if (unique.length > 0 && unique.every((v) => Number.isFinite(Number(v)))) {
          return unique.sort((a, b) => Number(a) - Number(b));
        }
        return unique.sort();
      },

      /** Zwei häufigste Bewertungs-Werte für den Binär-Fall. */
      _twoMostFrequent() {
        const levels = this.detectedLevels();
        const vals = this._ratingValues();
        if (!vals) return [levels[0], levels[1]];
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
        if (this.layoutError) return this.layoutError;
        if (this.model.params.layout === 'wide' && !this.result) return _t('emptyStateWide');
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

      /** Active UI language for number formats that differ by locale (p values). */
      _lang() {
        return module._context?.i18n?.getLanguage?.() || module._context?.language || 'de';
      },

      verdictSubline() {
        const r = this.result;
        if (!r) return '';
        const fk = r.betweenAppraisers?.fleissKappa || {};
        const src = r.meta?.referenceSource || 'none';
        const srcLabel = _t(`labels.referenceSource${src.charAt(0).toUpperCase() + src.slice(1)}`);
        // SE0 only holds under H0, so Fleiss κ gets a z test, not a CI.
        const test = Number.isFinite(fk.z)
          ? ` (z ${this.fmt(fk.z, 1)}; p ${formatP(fk.p, this._lang())})`
          : '';
        let line = `Fleiss κ = ${this.fmt(fk.kappa, 3)}${test} · ${_t('labels.referenceSource')}: ${srcLabel}`;
        const driver = this._driverCriterion();
        if (driver) line += ` · ${this._driverText(driver)}`;
        return line;
      },

      /** "Decisive: <criterion> (<appraiser>) <value>" for a criterion. */
      _driverText(c) {
        return _t('verdictDriver', {
          criterion: this._criterionLabel(c),
          appraiser: c.appraiser ? ` (${c.appraiser})` : '',
          value: fmtCriterion(c.id, c.value, this._lang()),
        });
      },

      /** The criterion that decided the verdict, or null. */
      _driverCriterion() {
        const v = this.result?.verdict;
        if (!v?.driver) return null;
        return (v.criteria || []).find((c) => c.id === v.driver) || null;
      },

      /** Criterion label; the Bosch minimum names which κ it came from. */
      _criterionLabel(c) {
        const label = _t(`criteria.${c.id}`);
        return c.source ? `${label} (${_t(`criteria.source_${c.source}`)})` : label;
      },

      /**
       * Rows of the verdict-criteria table. Limits carry ≥ / ≤ by
       * direction; the row that decided the verdict is highlighted.
       */
      criteriaRows() {
        const v = this.result?.verdict;
        if (!v) return [];
        const lang = this._lang();
        return (v.criteria || []).map((c) => {
          const op = c.direction === 'max' ? '≤' : '≥';
          return {
            key: c.id,
            label: this._criterionLabel(c),
            value: fmtCriterion(c.id, c.value, lang),
            appraiser: c.appraiser ?? '—',
            good: `${op} ${fmtCriterion(c.id, c.limits.good, lang)}`,
            marginal: `${op} ${fmtCriterion(c.id, c.limits.marginal, lang)}`,
            status: this.verdictLabel(c.level),
            ampelClass: levelClass(c.level),
            rowClass: c.id === v.driver ? 'msa-typ5__row--driver' : '',
          };
        });
      },

      hasReferenceNote() {
        return !!this.result?.verdict?.referenceNote;
      },

      referenceNoteText() {
        const note = this.result?.verdict?.referenceNote;
        return note ? _t(`verdictNote.${note}`) : '';
      },

      // ── KPI-Aggregate ────────────────────────────────────────

      fleissKappa()  { return this.result?.betweenAppraisers?.fleissKappa?.kappa ?? null; },

      /**
       * Colour of the Fleiss κ tile: the level Fleiss κ earns under the
       * active rule set — not the overall verdict, which a miss rate can
       * drive while κ itself is fine. No colour when the rule set does not
       * rate Fleiss κ on its own.
       */
      fleissKappaClass() {
        const c = (this.result?.verdict?.criteria || []).find((x) =>
          x.id === 'fleissKappa' || (x.id === 'minKappa' && x.source === 'fleiss'));
        return c ? verdictClass(c.level) : '';
      },
      fleissMethod() { return this.result?.betweenAppraisers?.fleissKappa?.method || ''; },

      _repRates()   { return Object.values(this.result?.perAppraiser || {}).map((x) => x.repeatability?.rate).filter(Number.isFinite); },
      _effRates()   { return Object.values(this.result?.perAppraiser || {}).map((x) => x.vsReference?.effectiveness?.rate).filter(Number.isFinite); },
      _kappaVsRefs(){ return Object.values(this.result?.perAppraiser || {}).map((x) => this._kappaVsRef(x)?.kappa).filter(Number.isFinite); },

      /**
       * κ of one appraiser vs. the reference under the active rule set:
       * Bosch rates Fleiss κ with the reference as one more rater, AIAG
       * reports Cohen κ.
       */
      _kappaVsRef(v) {
        return this.result?.verdict?.ruleSet === 'bosch' ? v.vsReference?.fleissKappa : v.vsReference?.kappa;
      },

      meanRepeatability() { return mean(this._repRates()); },
      meanEffectiveness() { return mean(this._effRates()); },
      meanKappaVsRef()    { return mean(this._kappaVsRefs()); },

      interpretationText() {
        const ip = this.result?.interpretation;
        if (!ip) return '';
        // engine liefert vollen Key inkl. Prefix `modules.msa-typ5.interp_*`;
        // hier direkt an i18n weiterreichen (kein Prefix-Trim).
        // A non-good verdict names its deciding criterion: κ and effectiveness
        // alone would not explain a red verdict driven by the miss rate.
        const driver = this._driverCriterion();
        if (driver && this.result.verdict.level !== 'good') {
          return module._context.i18n.t(`${ip.textKey}_driver`, { decisive: this._driverText(driver) });
        }
        // The engine formats its numbers language-neutral ('0.922');
        // localize the decimal sign here.
        const params = { ...(ip.params || {}) };
        if (this._lang() === 'de') {
          for (const [k, v] of Object.entries(params)) {
            if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) params[k] = v.replace('.', ',');
          }
        }
        return module._context.i18n.t(ip.textKey, params);
      },

      // ── Tabellen (View-Rows) ─────────────────────────────────

      perAppraiserRows() {
        const per = this.result?.perAppraiser;
        if (!per) return [];
        const lang = this._lang();
        return Object.entries(per).map(([id, v]) => {
          const rep  = v.repeatability;
          const eff  = v.vsReference?.effectiveness;
          const miss = v.vsReference?.missRate;
          const fa   = v.vsReference?.falseAlarmRate;
          const bias = v.vsReference?.biasRate;
          return {
            id,
            repeatability:   rep  ? formatPct(rep.rate, lang) : '—',
            effectiveness:   eff  ? formatPct(eff.rate, lang) : '—',
            // 0/0 (no part of that reference class) is not a rate of 0 %.
            missRate:        formatPct(ratedShare(miss), lang),
            falseAlarmRate:  formatPct(ratedShare(fa), lang),
            biasRate:        bias ? formatNum(bias.value, 3, lang) : '—',
            within:          v.withinKappa ? formatNum(v.withinKappa.kappa, 3, lang) : '—',
            withinP:         v.withinKappa ? formatP(v.withinKappa.p, lang) : '—',
          };
        });
      },

      pairTableTitle() {
        return `${_t('table.pair')} — ${_t('table.cohenKappa')}`;
      },

      pairRows() {
        const p = this.result?.betweenAppraisers?.pairwiseCohenKappa;
        if (!p) return [];
        const lang = this._lang();
        const ruleSet = this.result.verdict?.ruleSet;
        return Object.entries(p).map(([pair, k]) => {
          const ci = (k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1]))
            ? fmtCI(k.ci95, lang)
            : '—';
          return {
            pair,
            pairLabel: pair.replace('|', ' | '),
            kappa: formatNum(k.kappa, 3, lang),
            ci95: ci,
            z: fmtZ(k.z, lang),
            p: formatP(k.p, lang),
            ampelClass: kappaClass(k.kappa, ruleSet),
          };
        });
      },

      /** Header of the κ column in the vs-reference table. */
      vsRefKappaHeader() {
        return _t(this.result?.verdict?.ruleSet === 'bosch' ? 'table.fleissKappa' : 'table.cohenKappa');
      },

      vsRefRows() {
        const per = this.result?.perAppraiser;
        if (!per) return [];
        const lang = this._lang();
        const ruleSet = this.result.verdict?.ruleSet;
        return Object.entries(per)
          .filter(([, v]) => this._kappaVsRef(v))
          .map(([id, v]) => {
            const k = this._kappaVsRef(v);
            const ci = (k.ci95 && Number.isFinite(k.ci95[0]) && Number.isFinite(k.ci95[1]))
              ? fmtCI(k.ci95, lang)
              : '—';
            return {
              id,
              kappa: formatNum(k.kappa, 3, lang),
              ci95: ci,
              z: fmtZ(k.z, lang),
              p: formatP(k.p, lang),
              ampelClass: kappaClass(k.kappa, ruleSet),
            };
          });
      },

      // ── Fehlerdetails: Teile-Sicht ───────────────────────────

      /** Prüfer-Spalten der Teile-Tabelle, in stabiler Reihenfolge. */
      partAppraisers() {
        return Object.keys(this.result?.perAppraiser || {});
      },

      /**
       * Zeilen der Teile-Tabelle. Die Engine liefert sie bereits nach
       * Problemgrad sortiert; hier kommt nur der Filter und die Formatierung
       * dazu. Ein Teil ohne bekannte Referenz zeigt „—" statt einer Null,
       * damit „nicht bewertbar" nicht wie „fehlerfrei" aussieht.
       */
      perPartRows() {
        const rows = this.result?.perPart || [];
        const appraisers = this.partAppraisers();
        return rows
          .filter((r) => !this.onlyDisputed || r.isDisputed)
          .map((r) => ({
            part: String(r.part),
            reference: r.reference ?? '—',
            ratings: appraisers.map((a) => {
              const vals = r.byAppraiser[a] || [];
              const mixed = vals.length >= 2 && !vals.every((v) => v === vals[0]);
              const wrong = r.reference !== null && vals.some((v) => v !== r.reference);
              return {
                appraiser: a,
                text: vals.join(', ') || '—',
                // Klasse hier fertig gerechnet — im Template wären das
                // verschachtelte Ausdrücke, die Alpine CSP nicht kann.
                cellClass: mixed ? 'msa-typ5__cell--mixed' : (wrong ? 'msa-typ5__cell--wrong' : ''),
              };
            }),
            vsRefErrors: r.vsRefErrors === null ? '—' : String(r.vsRefErrors),
            mixedAppraisers: String(r.mixedAppraisers),
            rowClass: r.isDisputed ? 'msa-typ5__row--disputed' : '',
          }));
      },

      hasDisputedParts() {
        return (this.result?.perPart || []).some((r) => r.isDisputed);
      },

      toggleOnlyDisputed() {
        this.onlyDisputed = !this.onlyDisputed;
      },

      // ── Fehlerdetails: Prüfer-Sicht ──────────────────────────

      /**
       * Eine Zeile je Prüfer und Verwechslungsart, plus — wo vorhanden — eine
       * Zeile „gemischt" für in sich uneinheitliche Wiederholungen. Prüfer
       * ohne jeden Befund erscheinen nicht; ist die Tabelle dadurch leer,
       * zeigt das Template den Hinweis `table.noDisagreement`.
       */
      disagreementRows() {
        const d = this.result?.disagreement || {};
        const out = [];
        for (const [appraiser, entry] of Object.entries(d)) {
          for (const p of entry.confusionPairs || []) {
            out.push({
              key: `${appraiser}|${p.from}|${p.to}`,
              appraiser,
              kind: `${p.from} → ${p.to}`,
              count: String(p.count),
              parts: (p.parts || []).map(String).join(', '),
              rowClass: '',
            });
          }
          if (entry.mixed > 0) {
            out.push({
              key: `${appraiser}|mixed`,
              appraiser,
              kind: _t('table.mixedKind'),
              count: String(entry.mixed),
              parts: (entry.mixedParts || []).map(String).join(', '),
              rowClass: 'msa-typ5__row--mixed',
            });
          }
        }
        return out;
      },

      // ── Gesamtauswertung (KPI-Kacheln) ───────────────────────

      // Flach gehalten, weil Alpine CSP keine verschachtelten Ausdrücke im
      // Template kann: je Kachel eine Methode für Wert und Unterzeile.

      overallBetweenRate() {
        return this.fmtPct(this.result?.overall?.betweenAppraisers?.rate);
      },

      overallBetweenSub() {
        const o = this.result?.overall?.betweenAppraisers;
        return o ? `${o.agree} / ${o.n}` : '';
      },

      hasOverallVsRef() {
        return !!this.result?.overall?.allVsReference;
      },

      overallVsRefRate() {
        return this.fmtPct(this.result?.overall?.allVsReference?.rate);
      },

      overallVsRefSub() {
        const o = this.result?.overall?.allVsReference;
        return o ? `${o.agree} / ${o.n}` : '';
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
       * Baut das Long-Format-Ratings-Array (aus dem langen oder breiten
       * Datenlayout) und ruft die Engine. Aktualisiert `this.result` und triggert das Chart-Rendering.
       */
      runAnalysis() {
        this.layoutError = null;
        const built = this.model.params.layout === 'wide' ? this._wideRows() : this._longRows();
        if (!built) return this._clearResult();
        const { rows, referenceMap } = built;
        if (rows.length === 0) return this._clearResult();
        const cols = this.model.columns;

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
              ruleSet: p.ruleSet,
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

      /**
       * Long layout: one row per rating from the part / appraiser / rating
       * (/ reference / replicate) columns. Null when a required column is missing.
       * @returns {{rows: object[], referenceMap: object}|null}
       */
      _longRows() {
        const cols = this.model.columns;
        if (!cols.part || !cols.appraiser || !cols.rating) return null;

        const sm = module._context.stateManager;
        const parts   = getColumnValues(sm, cols.part)      || [];
        const apprs   = getColumnValues(sm, cols.appraiser) || [];
        const ratings = getColumnValues(sm, cols.rating)    || [];
        const refs    = cols.reference ? (getColumnValues(sm, cols.reference) || []) : null;
        const reps    = cols.replicate ? (getColumnValues(sm, cols.replicate) || []) : null;

        const N = Math.min(parts.length, apprs.length, ratings.length);
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
        return { rows, referenceMap };
      },

      /**
       * Wide layout: one column per appraiser × trial, grouped in worksheet
       * order by the trials per appraiser (see `stackWide`). Sets `layoutError`
       * when the trials do not fit the column count.
       * @returns {{rows: object[], referenceMap: object}|null}
       */
      _wideRows() {
        const cols = this.model.columns;
        if (!cols.part || cols.ratings.length === 0) return null;

        const sm = module._context.stateManager;
        const parts = getColumnValues(sm, cols.part) || [];
        const columns = this._inSheetOrder(cols.ratings).map((ref) => ({
          name: getColumnName(sm, ref),
          values: getColumnValues(sm, ref) || [],
        }));
        const trialsRaw = String(this.model.params.trials ?? '').trim();
        const { rows, error } = stackWide({ parts, columns, trials: trialsRaw === '' ? NaN : Number(trialsRaw) });
        if (error) {
          const key = error === 'invalidTrials' ? 'errWideInvalidTrials' : 'errWideColumnsNotDivisible';
          this.layoutError = _t(key, { columns: columns.length, trials: trialsRaw });
          return null;
        }

        const refs = cols.reference ? (getColumnValues(sm, cols.reference) || []) : null;
        const referenceMap = {};
        if (refs) {
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const ref = refs[i];
            if (part === null || part === undefined || part === '') continue;
            if (ref === null || ref === undefined || ref === '') continue;
            referenceMap[String(part)] = String(ref);
          }
        }
        return { rows, referenceMap };
      },

      /**
       * Column refs sorted by their position in the worksheet (the multi
       * picker returns them in click order).
       * @param {Array<{instanceId:string,sheetId:string,columnId:string}>} refs
       */
      _inSheetOrder(refs) {
        const sm = module._context.stateManager;
        const pos = (ref) => {
          const sheet = sm.getModuleState(ref.instanceId)?.sheets?.find((sh) => sh.id === ref.sheetId);
          return (sheet?.state?.columns || []).findIndex((c) => c.id === ref.columnId);
        };
        return [...refs].sort((a, b) => pos(a) - pos(b));
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
          { dir: 'h', value: 0.75, label: `κ = ${this.fmt(0.75, 2)}`, dash: 'dash', width: 1, color: 'var(--color-success, #2ea043)' },
          { dir: 'h', value: 0.40, label: `κ = ${this.fmt(0.40, 2)}`, dash: 'dash', width: 1, color: 'var(--color-warning, #d29922)' },
        ];
        const fleiss = res.betweenAppraisers?.fleissKappa?.kappa;
        if (Number.isFinite(fleiss)) {
          refLines.push({ dir: 'h', value: fleiss, label: `Fleiss κ = ${this.fmt(fleiss, 3)}`, dash: 'solid', width: 1, color: 'var(--color-info, #58a6ff)' });
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          editKey: 'kappa',
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
          editKey: 'effectiveness',
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
          editKey: 'sdt',
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

        const wideEl = module._container.querySelector('[data-ref="col-ratings-wrap"]');
        if (wideEl) {
          this._pickers.ratings?.destroy();
          this._pickers.ratings = new ColumnPicker(wideEl, module._context, {
            mode: 'multi',
            onChange: (refs) => {
              this.model.columns.ratings = refs;
              this.runAnalysis();
            },
          });
          this._pickers.ratings.value = this.model.columns.ratings;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (das data()-Objekt wird per Alpine.data geteilt).
        this._charts = [];
        this._unsubs = [];
        this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null, ratings: null };

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
            if (Array.isArray(r)) continue;
            if (r && r.instanceId === instanceId && r.columnId === columnId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          const ratings = this.model.columns.ratings;
          const kept = ratings.filter((r) => !(r.instanceId === instanceId && r.columnId === columnId));
          if (kept.length !== ratings.length) {
            this.model.columns.ratings = kept;
            touched = true;
          }
          if (touched) this.runAnalysis();
        };
        const nullOnWorksheetRemoved = ({ instanceId } = {}) => {
          let touched = false;
          for (const role of Object.keys(this.model.columns)) {
            if (Array.isArray(this.model.columns[role])) continue;
            if (this.model.columns[role]?.instanceId === instanceId) {
              this.model.columns[role] = null;
              touched = true;
            }
          }
          const ratings = this.model.columns.ratings;
          const kept = ratings.filter((r) => r.instanceId !== instanceId);
          if (kept.length !== ratings.length) {
            this.model.columns.ratings = kept;
            touched = true;
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
        this._pickers = { part: null, appraiser: null, rating: null, reference: null, replicate: null, ratings: null };
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
      if (Array.isArray(next.ratings)) {
        next.ratings = next.ratings.map((r) => (r && r.instanceId === '__source__' ? { ...r, instanceId } : r));
      }
      return { ...data, columns: next };
    },
  });
};

export default mod;
