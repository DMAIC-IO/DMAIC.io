/**
 * D.Mike — Tortendiagramm: Viewmodel.
 *
 * `computed slices` baut aus der Zeile der Datensätze und dem Arbeitsblatt
 * (`ctx.source`) die Segmente mit Farbe; der Getter `pieChart` ist die
 * Konfiguration des Diagramm-Widgets, die `stats*`-Getter liefern die Texte
 * der Segmenttabelle.
 */
import { createModule } from '../../../core/template-module.js';
import { sourceColumns } from '../../../core/source-columns.js';
import { formatNum, formatPct } from '../../../core/chart/chart-core.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { buildSlices, sliceStats } from '../domain/slices.js';
import { fromExample } from '../io/example.js';

/**
 * Zeile der Segmenttabelle, als Text.
 * @typedef {{ color: string, name: string, value: string, pct: string }} StatsRow
 */

export default createModule({
  descriptor,
  Model: State,
  history: true,
  fromExample,
  /** @type {import('../../../core/template-module.js').ViewFn<import('../domain/model.types.js').StateModel, {}>} */
  view(ctx) {
    /** @returns {string} */
    const lang = () => ctx.i18n.getLanguage();
    return {
      computed: {
        /** Segmente (Name, Wert, Farbe) der gewählten Spalten; leer ohne Werte. */
        slices() {
          return buildSlices(this.model.datasets[0], sourceColumns(ctx.source));
        },
      },
      get hasSlices() { return this.slices.length > 0; },
      /**
       * Konfiguration des Diagramms: die Segmente und die Beschriftungsvorgaben
       * des Moduls, die von denen des Typs abweichen.
       */
      get pieChart() {
        return {
          slices: this.slices.map((s) => ({ name: s.name, value: s.value, color: s.color })),
          labelMode: /** @type {'both'} */ ('both'),
          labelSize: 11,
        };
      },
      /** @returns {StatsRow[]} Zeile je Segment mit Farbe, Wert und Anteil als Text. */
      get statsRows() {
        const l = lang();
        const { slices } = sliceStats(this.slices);
        return this.slices.map((s, i) => ({
          color: s.color,
          name: s.name,
          value: formatNum(s.value, null, l),
          pct: formatPct(slices[i].share, 1, l),
        }));
      },
      /** Summe aller Segmente, als Text. */
      get statsTotal() { return formatNum(sliceStats(this.slices).total, null, lang()); },
      /** Anteil der Summe (100 %), als Text. */
      get statsTotalPct() { return formatPct(1, 1, lang()); },
      /** Schlüssel der Editor-Einstellungen in den alten `chartEdits`. */
      get legacyEditKey() { return 'pie'; },
      /**
       * Farbfeld einer Tabellenzeile.
       * @param {{ color: string }} r
       * @returns {string}
       */
      swatchStyle(r) { return `background:${r.color}`; },
      /**
       * Name einer Tabellenzeile, mit Abstand zum Farbfeld.
       * @param {{ name: string }} r
       * @returns {string}
       */
      sliceLabel(r) { return ` ${r.name}`; },
    };
  },
});
