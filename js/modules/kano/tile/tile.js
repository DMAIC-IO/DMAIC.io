/**
 * D.Mike — Kano-Kachel
 *
 * „Was erwarten die Kunden?“ — Verteilung der Merkmale auf die Kategorien,
 * Vollständigkeit, Warnung bei vielen widersprüchlichen Antworten und ein
 * kompaktes Better/Worse-Diagramm (Widget `scatter-chart`). Eine Kachel je
 * Instanz. Form: createTile (core/template-tile.js); Einstellungen in
 * settings.js, Markup in resources/tile.html. Die Auswertung ist das derived
 * `evaluation` des Models.
 */
import { createTile } from '../../../core/template-tile.js';
import { distribution } from '../../../ui/tile-kit.js';
import { formatNumber } from '../../../core/number-format.js';
import { CATEGORIES, Q_WARN } from '../../../engines/kano-engine.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { kanoScatterConfig } from '../domain/chart.js';
import { Settings } from './settings.js';

/** Diagrammfarbe einer Kategorie nach ihrer Stelle in CATEGORIES. @param {string} cat @returns {string} */
const catColor = (cat) => `var(--color-chart-${CATEGORIES.indexOf(cat) + 1})`;

/**
 * Anteil als ganze Prozent („75 %“); `|| 0` glättet ein -0.
 * @param {number} v @param {string} lang @returns {string}
 */
const pct = (v, lang) => `${formatNumber(Math.round((v || 0) * 100) || 0, lang)} %`;

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'Kano',

  /** @type {import('./settings.types.js').KanoTileViewFn} */
  view(ctx) {
    /** @param {any} scope @returns {import('../domain/evaluate.js').KanoEvaluation|null} */
    const evalOf = (scope) => { const e = scope.evaluation; return e && !e.error ? e : null; };
    return {
      /** Leertext ohne Merkmale bzw. ohne klassifizierte Antwort, sonst null. */
      get empty() {
        if (this.model.items.length === 0) return ctx.i18n.t('dashboard.kanoEmpty');
        const e = evalOf(this);
        return !e || e.rows.every((r) => r.n === 0) ? ctx.i18n.t('dashboard.kanoNoData') : null;
      },
      /** Balken und Legende der Kategorien (Zahl der Merkmale je häufigster Kategorie). */
      get bar() {
        const rows = evalOf(this)?.rows ?? [];
        /** @type {Record<string, number>} */
        const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
        for (const r of rows) if (r.category) counts[r.category] += 1;
        return distribution(CATEGORIES.map((c) => ({ key: c, label: this.t(`cat${c}`), count: counts[c], color: catColor(c) })));
      },
      /** Abschnitte des Balkens. */
      get segments() { return this.empty ? [] : this.bar.segments; },
      /** Einträge der Legende. */
      get legend() { return this.empty ? [] : this.bar.legend; },
      /** Vollständigkeit, Zahl der Merkmale und der Befragten. */
      get totals() {
        const e = evalOf(this);
        if (this.empty || !e) return [];
        const lang = ctx.i18n.getLanguage();
        return [
          { label: ctx.i18n.t('dashboard.kanoCompleteness'), value: pct(e.totals.completeness, lang) },
          { label: ctx.i18n.t('dashboard.kanoItems'), value: String(e.totals.items) },
          { label: ctx.i18n.t('dashboard.kanoRespondents'), value: String(e.totals.respondents) },
        ];
      },
      /** Warnung bei zu vielen widersprüchlichen Antworten, sonst null. */
      get warn() {
        const e = evalOf(this);
        if (this.empty || !e || e.totals.qShare <= Q_WARN) return null;
        return this.t('warnQShare', { share: pct(e.totals.qShare, ctx.i18n.getLanguage()) });
      },
      /** Das Better/Worse-Diagramm ohne Achsen und Titel; null ohne Punkte oder ausgeblendet. */
      get chart() {
        const e = evalOf(this);
        if (this.empty || !e || !this.settings.showChart) return null;
        const { series, moduleRefLines } = kanoScatterConfig(e.rows, {
          importance: this.model.options.importance,
          sizeLabel: this.t('colImportanceMean'),
        });
        if (series.length === 0) return null;
        return {
          series,
          moduleRefLines,
          xLabel: this.t('chartX'),
          yLabel: this.t('chartY'),
          showTitle: false, showXLabel: false, showYLabel: false,
          showXTicks: false, showYTicks: false, showLegend: false,
        };
      },
    };
  },
});
