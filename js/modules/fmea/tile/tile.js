/**
 * D.Mike — FMEA-Kachel
 *
 * Zahl der Risiken, höchste Stufe bzw. größte RPN, Zahl der Hinweise
 * (H ohne Maßnahme bzw. S ≥ 9), Verteilung der Kategorien und die
 * dringendsten Risiken der aktiven Bewertungsmethode. Eine Kachel je Instanz
 * über die Standardaufzählung (`fmea:<instanceId>`, Titel „FMEA — <Name>“).
 * Form: createTile (core/template-tile.js); Einstellungen in settings.js,
 * Markup in resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import { distribution } from '../../../ui/tile-kit.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { rating, rpn, ap, rpnCategory } from '../domain/rating.js';
import { Settings } from './settings.js';

const CATS = new Set(['critical', 'high', 'medium', 'low']);
/** Füllfarbe einer Kategorie — die Palette des Moduls (resources/style.css). @param {string} cat */
const catColor = (cat) => `var(--fmea-cat-${CATS.has(cat) ? cat : 'none'})`;
/** Lesbare Schriftfarbe einer Kategorie (Kontrast ≥ 4,5:1 in beiden Themen). @param {string} cat */
const catTextColor = (cat) => (CATS.has(cat) ? `var(--fmea-cat-${cat}-text)` : 'var(--fmea-cat-none)');

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titlePrefix: 'FMEA',

  /** @type {import('./settings.types.js').FmeaTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Risiken, sonst null. */
      get empty() { return this.model.risks.length === 0 ? g('fmeaEmpty') : null; },
      /** Ob die Kachel nach Aufgabenpriorität bewertet. */
      get isAp() { return this.model.method === 'ap'; },
      /** Beschriftung je Kategorie der aktiven Methode. @returns {Record<string, string>} */
      get catLabels() {
        return this.isAp
          ? { high: g('fmeaApHigh'), medium: g('fmeaApMedium'), low: g('fmeaApLow'), none: g('fmeaNotRated') }
          : { critical: g('fmeaCritical'), high: g('fmeaHigh'), medium: g('fmeaMedium'), low: g('fmeaLow'), none: g('fmeaNotRated') };
      },
      /** Zahl der Risiken je Kategorie. @returns {Record<string, number>} */
      get catCounts() {
        const r = rating(this.model.method);
        /** @type {Record<string, number>} */
        const cats = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
        for (const risk of this.model.risks) cats[r.category(risk)]++;
        return cats;
      },
      /** Die Kategorien im Balken. @returns {string[]} */
      get barCats() { return this.isAp ? ['high', 'medium', 'low'] : ['critical', 'high', 'medium', 'low']; },
      /** Zahl der Risiken, höchste Stufe bzw. größte RPN, Zahl der Hinweise. */
      get summary() {
        if (this.empty) return [];
        const labels = this.catLabels;
        const out = [{ label: `${g('fmeaRisks')}: `, value: String(this.model.risks.length), style: '', modifier: '' }];
        if (this.isAp) {
          out.push({ label: `${labels.high}: `, value: String(this.catCounts.high), style: `color:${catTextColor('high')}`, modifier: '' });
        } else {
          const maxRPN = Math.max(0, ...this.model.risks.map((r) => rpn(r)));
          out.push({ label: `${g('fmeaMaxRPN')}: `, value: maxRPN ? String(maxRPN) : '—',
            style: `color:${catTextColor(rpnCategory(maxRPN))}`, modifier: '' });
        }
        const st = /** @type {any} */ (this.stats);
        const flags = st && !st.error ? (this.isAp ? st.unjustified : st.highSeverity) ?? 0 : 0;
        out.push({
          label: `${g(this.isAp ? 'fmeaUnjustified' : 'fmeaSevere')}: `,
          value: String(flags),
          style: flags ? `color:${catTextColor(this.isAp ? 'high' : 'critical')}` : '',
          modifier: 'dashboard-fmea__flag-count',
        });
        return out;
      },
      /** Verteilung der Kategorien (ohne „nicht bewertet“ im Balken). */
      get parts() {
        const labels = this.catLabels;
        const counts = this.catCounts;
        /** @param {string} cat */
        const part = (cat) => ({ key: cat, label: labels[cat], count: counts[cat], color: catColor(cat) });
        return { bar: this.barCats.map(part), legend: [...this.barCats, 'none'].map(part) };
      },
      /** Balkensegmente je Kategorie. */
      get segments() {
        return this.empty ? [] : distribution(this.parts.bar, { total: this.model.risks.length }).segments;
      },
      /** Legende der Kategorien oder null. */
      get legend() {
        return !this.empty && this.settings.showLegend ? distribution(this.parts.legend).legend : null;
      },
      /** Die topN dringendsten bewerteten Risiken. */
      get topRisks() {
        const r = rating(this.model.method);
        return [...this.model.risks].sort(r.compare).filter((risk) => r.category(risk) !== 'none').slice(0, this.settings.topN);
      },
      /** Überschrift der Liste oder null. */
      get topLabel() { return this.topRisks.length ? g('fmeaTopRisks') : null; },
      /** Anzeigezeilen der dringendsten Risiken. */
      get top() {
        const r = rating(this.model.method);
        return this.topRisks.map((risk) => ({
          desc: risk.failureMode || risk.step || '—',
          flag: risk.specialChar || null,
          badge: this.isAp ? `AP ${ap(risk)}` : `RPN ${rpn(risk)}`,
          style: `color:${catTextColor(r.category(risk))}`,
        }));
      },
    };
  },
});
