/**
 * D.Mike — Prozessfähigkeit: Viewmodel.
 *
 * Die Analyse ist die Ableitung `analysis` des Models; `computed values`
 * liefert die Werte für das Histogramm über `ctx.source`. Die Getter bereiten
 * Kennzahlen, Tabellen und Formeln auf, `chart` ist die Konfiguration des
 * Diagramm-Widgets.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields } from '../../../core/model.js';
import { columnOptions, sourceColumns } from '../../../core/source-columns.js';
import { formatNumber } from '../../../core/number-format.js';
import { SUBGROUP_METHODS } from '../../../engines/sigma-within-engine.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { inputValues, specRefLines } from '../domain/analyze.js';
import { subgroupAllowed } from '../domain/columns.js';
import { fmt as fmtIn, fmtZ as fmtZIn, fmtFraction as fmtFractionIn, fmtDec as fmtDecIn } from '../domain/format.js';
import { fromExample } from '../io/example.js';

/** Präfix der Kontexthilfe-Sätze an Kennzahlen und Tabellenspalten. */
const HELP = 'modules.process-capability.types.';

/** Urteil → Textschlüssel der Statuszeile. */
const STATUS_KEY = { pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' };
/** Urteil → Textschlüssel der Kachel. */
const BADGE_KEY = { pass: 'capable', fail: 'notCapable', warn: 'condCapable' };
/** Urteil → Klasse der Kennzahl. */
const KPI_CLASS = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

/** @param {{ instanceId: string, sheetId?: string, columnId: string }|null} ref @returns {string} */
const keyOf = (ref) => (ref ? `${ref.instanceId}|${ref.sheetId ?? ''}|${ref.columnId}` : '');

/**
 * @typedef {{ key: string, help: string, mod?: string, label: string, value: string, sub: string }} Kpi
 * @typedef {{ label: string, help: string, value: string }} StatCol
 * @typedef {{ key: string, label: string, below: string, above: string, total: string }} PpmRow
 */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  fromExample,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** @param {number} v @returns {string} Grenzwert der Bewertung in der Sprache der App */
    const limitText = (v) => formatNumber(v, ctx.i18n.getLanguage(), { decimals: 2 });
    /** @param {number} v @param {number} [d] @returns {string} feste Stellen in der Sprache der App */
    const fmt = (v, d) => fmtIn(v, d, ctx.i18n.getLanguage());
    /** @param {number} v @param {number} [d] @returns {string} Z-Wert in der Sprache der App */
    const fmtZ = (v, d) => fmtZIn(v, d, ctx.i18n.getLanguage());
    /** @param {number} p @returns {string} Anteil für die Z.bench-Zeile in der Sprache der App */
    const fmtFraction = (p) => fmtFractionIn(p, ctx.i18n.getLanguage());
    /** @param {number} v @returns {string} n̄ und ν mit höchstens zwei Nachkommastellen */
    const fmtDec = (v) => fmtDecIn(v, ctx.i18n.getLanguage());
    return {
      /** @noagent Lebenszyklus: eine andere Messspalte verwirft eine ID-Spalte, die nicht mehr passt. */
      init() {
        // Geleert wird nur, wenn sich Messspalte oder Modus ändern, die ID-Spalte aber nicht.
        // Ändert sich auch sie (Rückgängig, Wiederholen, Laden eines Stands), bleibt alles.
        // Das Leeren gehört zum Schritt der Änderung an der Messspalte: es läuft eine
        // Mikroaufgabe später, `amend` faltet es in den Schritt.
        this.$watch(
          () => [keyOf(this.model.columnRef), keyOf(this.model.subgroupColumnRef), this.model.params.subgroupMode],
          (now, before) => {
            if ((now[0] === before[0] && now[2] === before[2]) || now[1] !== before[1]) return;
            const stale = () => this.model.params.subgroupMode === 'column' && this.model.subgroupColumnRef
              && !subgroupAllowed(this.model.columnRef, this.model.subgroupColumnRef);
            if (!stale()) return;
            queueMicrotask(() => {
              if (!stale()) return;
              ctx.history?.amend(() => setFields(this.model, { subgroupColumnRef: null }));
            });
          },
        );
      },
      computed: {
        /** Die Werte, mit denen die Analyse rechnet: Beispieldaten, sonst die Messspalte. */
        values() {
          return inputValues(this.model, sourceColumns(ctx.source));
        },
      },

      /** Das Ergebnis der Analyse oder `null`. */
      get result() {
        const a = this.analysis;
        return a && typeof a === 'object' && 'result' in a ? a.result : null;
      },
      /** Die für die Daten wählbaren Schätzer. */
      get methodKeys() { return this.analysis?.methods ?? []; },
      /** Der verwendete Schätzer. */
      get activeMethod() { return this.analysis?.method ?? ''; },
      /** Die Optionen der Schätzerwahl; gewählt ist der verwendete. */
      get methodOptions() {
        const active = this.activeMethod;
        return this.methodKeys.map((key) => ({ value: key, label: this.methodName(key), selected: key === active }));
      },
      /** Hinweis zu Schätzer oder ID-Spalte, übersetzt; leer ohne. */
      get withinHint() { return this.analysis?.hint ?? ''; },

      /** Gibt es ein Arbeitsblatt im Projekt? */
      get hasWorksheet() { return ctx.source.list().some((i) => i.moduleId === 'worksheet'); },
      /** Gibt es eine numerische Spalte? */
      get hasNumericColumns() { return columnOptions(ctx.source, { types: ['numeric'] }).length > 0; },
      /** Leerzustand „kein Arbeitsblatt“. */
      get showNoWorksheet() { return !this.model.embeddedValues && !this.hasWorksheet; },
      /** Leerzustand „keine numerischen Spalten“. */
      get showNoNumericColumns() { return !this.model.embeddedValues && this.hasWorksheet && !this.hasNumericColumns; },
      /** Die ID-Spalte darf die Messspalte nicht sein. */
      get excludeForSubgroup() { return this.model.columnRef ? [this.model.columnRef] : []; },
      /** Beschriftung der Beispieldaten mit ihrem Umfang. */
      get embeddedText() {
        const n = this.model.embeddedValues?.length ?? 0;
        return `${this.model.embeddedLabel || this.t('exampleData')} (n=${n})`;
      },
      /** Titel des Knopfs, der die Beispieldaten verwirft. */
      get removeTitle() { return this.t('common.remove'); },

      /** Die Untergruppen-Arten; „aus Spalte“ ist bei Beispieldaten gesperrt. */
      get subgroupModeOptions() {
        const allowed = this.subgroupModeValues ?? [];
        return ['size', 'column'].map((value) => ({
          value,
          ref: `inp-subgroup-mode-${value}`,
          label: this.t(value === 'size' ? 'subgroupModeSize' : 'subgroupModeColumn'),
          disabled: !allowed.includes(value),
        }));
      },
      /** Gilt die feste Untergruppengröße? */
      get showSubgroupSize() { return !!this.activeParams?.includes('subgroupSize'); },
      /** Gilt die ID-Spalte? */
      get showSubgroupColumn() { return !this.model.embeddedValues && this.model.params.subgroupMode === 'column'; },
      /** Hinweis unter der Untergruppengröße. */
      get subgroupSizeHint() { return this.t(this.model.embeddedValues ? 'subgroupEmbeddedHint' : 'subgroupHint'); },
      /** Gilt die Spannweite der gleitenden Spannweiten? */
      get showMrSpan() { return !!this.activeParams?.includes('mrSpan'); },
      /** Gilt der Korrekturfaktor? */
      get showUnbiased() { return !!this.activeParams?.includes('unbiased'); },

      /** Klasse der Statuszeile nach dem Gesamturteil. */
      get statusBarClass() { return this.result ? `pc__status-bar--${this.result.overall}` : ''; },
      /** Text der Statuszeile. */
      get statusLabel() { return this.result ? this.t(STATUS_KEY[this.result.overall] || 'statusWarn') : ''; },
      /** Merkmal der Statuszeile. */
      get featureName() { return this.model.params.name || '–'; },
      /** Bewertung „fähig“ mit Grenzwert. */
      get interpGoodText() { return this.t('interpGood', { limit: limitText(1.33) }); },
      /** Bewertung „bedingt fähig“ mit Grenzwerten. */
      get interpOkText() { return this.t('interpOk', { low: limitText(1), limit: limitText(1.33) }); },
      /** Bewertung „nicht fähig“ mit Grenzwert. */
      get interpPoorText() { return this.t('interpPoor', { low: limitText(1) }); },

      /**
       * Konfidenzintervall als Text, z. B. „KI 95%: [0.5051; 0.9488]“.
       * @param {Array<number|null>|null} ci
       * @returns {string}
       */
      ciLabel(ci) {
        const r = this.result;
        if (!ci || !r) return '';
        return `${this.t('ci')} ${Math.round(r.confidence * 100)}%: [${fmt(ci[0])}; ${fmt(ci[1])}]`;
      },

      /**
       * Zeile „Grenzwert … · Urteil · KI …“ unter Cp und Cpk.
       * @param {string|null} status @param {Array<number|null>|null} ci
       * @returns {string}
       */
      _verdictSub(status, ci) {
        const badge = this.t(BADGE_KEY[status ?? ''] || 'condCapable');
        return `${this.t('threshold')}: ≥ ${limitText(1.33)} · ${badge}${ci ? ` · ${this.ciLabel(ci)}` : ''}`;
      },

      /** Kurzfristige Kennzahlen (Cp, Cpk, CPL, CPU). @returns {Kpi[]} */
      get mainKpis() {
        const r = this.result;
        if (!r) return [];
        /** @type {Kpi[]} */
        const cells = [];
        if (r.Cp != null) {
          cells.push({ key: 'cp', help: `${HELP}Result.Cp`, mod: KPI_CLASS[r.cpStatus ?? ''] || '',
            label: `Cp (${this.t('potential')})`, value: fmt(r.Cp), sub: this._verdictSub(r.cpStatus, r.CpCI) });
        }
        cells.push({ key: 'cpk', help: `${HELP}Result.Cpk`, mod: KPI_CLASS[r.cpkStatus] || '',
          label: `Cpk (${this.t('actual')})`, value: fmt(r.Cpk), sub: this._verdictSub(r.cpkStatus, r.CpkCI) });
        if (r.CPL != null) {
          cells.push({ key: 'cpl', help: `${HELP}Result.CPL`, mod: '',
            label: `CPL (${this.t('lower')})`, value: fmt(r.CPL), sub: `(x̄ − LSL) / 3 ${this.t('sigmaWithinSym')}` });
        }
        if (r.CPU != null) {
          cells.push({ key: 'cpu', help: `${HELP}Result.CPU`, mod: '',
            label: `CPU (${this.t('upper')})`, value: fmt(r.CPU), sub: `(USL − x̄) / 3 ${this.t('sigmaWithinSym')}` });
        }
        return cells;
      },

      /** Langfristige Kennzahlen (Pp, Ppk, PPM, Sigma-Level). @returns {Kpi[]} */
      get perfKpis() {
        const r = this.result;
        if (!r) return [];
        /** @type {Kpi[]} */
        const cells = [];
        if (r.Pp != null) {
          cells.push({ key: 'pp', help: `${HELP}Result.Pp`, label: `Pp (${this.t('overallPotential')})`,
            value: fmt(r.Pp), sub: `${this.t('longTerm')}${r.PpCI ? ` · ${this.ciLabel(r.PpCI)}` : ''}` });
        }
        if (r.Ppk != null) {
          cells.push({ key: 'ppk', help: `${HELP}Result.Ppk`, label: `Ppk (${this.t('overallActual')})`,
            value: fmt(r.Ppk), sub: `${this.t('longTerm')}${r.PpkCI ? ` · ${this.ciLabel(r.PpkCI)}` : ''}` });
        }
        cells.push({ key: 'ppm', help: `${HELP}Result.ppmTotal`, label: `PPM (${this.t('defective')})`,
          value: fmt(r.ppmTotal ?? NaN),
          sub: `${this.t('perMillion')} · ${this.t('ppmObservedShort')} ${fmt(r.ppmObservedTotal ?? NaN, 0)} · ${this.t('ppmWithinShort')} ${fmt(r.ppmWithinTotal ?? NaN, 0)}` });
        cells.push({ key: 'sigma', help: `${HELP}Result.sigmaLevel`, label: this.t('sigmaLevel'),
          value: `${fmtZ(r.sigmaLevel ?? NaN)}σ`,
          sub: `${this.t('zBenchOverall')} ${fmtZ(r.zBenchOverall ?? NaN, 2)} · ${this.t('sixSigmaConvention')} ${fmtZ(r.sigmaLevelShifted ?? NaN, 2)}` });
        return cells;
      },

      /**
       * Name eines Schätzers.
       * @param {string} key
       * @returns {string}
       */
      methodName(key) { return key ? this.t(`withinMethodNames.${key}`) : ''; },

      /**
       * Zahl mit fester Stellenzahl, „–“ ohne Wert.
       * @param {number|null} v @param {number} [d]
       * @returns {string}
       */
      fmt(v, d) { return fmt(v ?? NaN, d); },

      /**
       * Freiheitsgrade mit höchstens zwei Nachkommastellen.
       * @param {number} v
       * @returns {string}
       */
      fmtDf(v) { return fmtDec(v); },

      /** Beschriftung von σ innerhalb mit Schätzer und Grundlage, z. B. „(R̄/d2, k = 25, n̄ = 5, ν = 90)“. */
      get withinLabel() {
        const r = this.result;
        if (!r) return '';
        const c = r.unbiased;
        const symbol = /** @type {Record<string, string>} */ ({
          pooled: c ? 's_p/c4' : 's_p',
          rbar: 'R̄/d2',
          sbar: c ? 'S̄/c4' : 'S̄',
          averageMR: 'MR̄/d2',
          medianMR: 'MR̃/d4',
          sqrtMSSD: c ? '√MSSD/c4′' : '√MSSD',
        })[r.withinMethod];
        const parts = [symbol];
        if (SUBGROUP_METHODS.includes(r.withinMethod)) {
          parts.push(`k = ${r.subgroupCount}`, `n̄ = ${fmtDec(r.nBar)}`);
        } else if (r.withinMethod !== 'sqrtMSSD') {
          parts.push(`w = ${r.mrSpan}`);
        }
        parts.push(`ν = ${fmtDec(r.withinDf)}`);
        return `${this.t('statStddevWithin')} (${parts.join(', ')})`;
      },

      /** Spalten der Kenngrößentabelle. @returns {StatCol[]} */
      get statCols() {
        const r = this.result;
        if (!r) return [];
        const unit = this.model.params.unit || '';
        const v = (/** @type {number|null} */ x) => `${fmt(x ?? NaN)} ${unit}`;
        return /** @type {StatCol[]} */ ([
          { label: this.t('statN'), help: `${HELP}Result.n`, value: String(r.n) },
          { label: this.t('statMean'), help: `${HELP}Result.xbar`, value: v(r.xbar) },
          { label: this.withinLabel, help: `${HELP}Result.sigmaWithin`, value: v(r.sigmaWithin) },
          { label: this.t('statStddevS'), help: `${HELP}Result.s`, value: v(r.s) },
          { label: this.t('statMin'), help: `${HELP}Result.xmin`, value: v(r.xmin) },
          { label: this.t('statMax'), help: `${HELP}Result.xmax`, value: v(r.xmax) },
          r.hasLsl ? { label: this.t('common.sym.lsl'), help: `${HELP}Result.lsl`, value: v(r.lsl) } : null,
          r.hasUsl ? { label: this.t('common.sym.usl'), help: `${HELP}Result.usl`, value: v(r.usl) } : null,
          r.T != null ? { label: this.t('statTol'), help: `${HELP}Result.T`, value: v(r.T) } : null,
          r.targetVal != null ? { label: this.t('statTarget'), help: `${HELP}Result.targetVal`, value: v(r.targetVal) } : null,
        ].filter(Boolean));
      },

      /** Zeilen der PPM-Tabelle; „—“ für eine fehlende Grenze. @returns {PpmRow[]} */
      get ppmRows() {
        const r = this.result;
        if (!r) return [];
        const cell = (/** @type {number|null} */ x) => (x == null ? '—' : fmt(x, 2));
        return [
          { key: 'observed', label: this.t('ppmRowObserved'), below: cell(r.ppmObservedBelowLsl), above: cell(r.ppmObservedAboveUsl), total: cell(r.ppmObservedTotal) },
          { key: 'within', label: this.t('ppmRowWithin'), below: cell(r.ppmWithinBelowLsl), above: cell(r.ppmWithinAboveUsl), total: cell(r.ppmWithinTotal) },
          { key: 'overall', label: this.t('ppmRowOverall'), below: cell(r.ppmBelowLsl), above: cell(r.ppmAboveUsl), total: cell(r.ppmTotal) },
        ];
      },

      /** Formelzeile Z.bench = −Φ⁻¹(p(< LSL) + p(> USL)) = Wert. */
      get zBenchLine() {
        const r = this.result;
        if (!r) return '';
        const parts = [r.hasLsl ? 'p(< LSL)' : null, r.hasUsl ? 'p(> USL)' : null].filter(Boolean).join(' + ');
        return `Z.bench = −Φ⁻¹(${parts}) = −Φ⁻¹(${fmtFraction((r.ppmWithinTotal ?? NaN) / 1e6)}) = ${fmtZ(r.zBenchWithin ?? NaN)}`;
      },

      /** Konfiguration des Histogramms; `null` ohne Ergebnis. */
      get chart() {
        const r = this.result;
        if (!r) return null;
        return {
          data: this.values,
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          showLegend: true,
          moduleRefLines: specRefLines(/** @type {any} */ (r), this.t),
        };
      },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'histogram'; },

      /**
       * Schätzer wählen.
       * @param {Event} event
       * @returns {void}
       */
      withinMethodChanged(event) {
        const value = /** @type {HTMLSelectElement} */ (event.target).value;
        setFields(this.model, { params: { ...this.model.params, withinMethod: /** @type {any} */ (value) } });
      },
    };
  },
});
