/**
 * D.Mike — VoC → CTx-Kachel
 *
 * Eine Kachel für die erste Instanz (feste Kachel-id `voc-ctx-tree`): Zahl
 * der Stimmen, Bedürfnisse, Treiber und Anforderungen, Verteilung der
 * Treiberarten und die ersten Aussagen. Form: createTile
 * (core/template-tile.js); Einstellungen in settings.js, Markup in
 * resources/tile.html.
 */

import { createTile } from '../../../core/template-tile.js';
import { distribution } from '../../../ui/tile-kit.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { Settings } from './settings.js';

/** Treiberarten mit Kürzel und Farbe (Variablen an der Kachelwurzel). */
const DRIVERS = [
  { type: 'ctq', label: 'CTQ', color: 'var(--vct-tile-ctq)' },
  { type: 'ctd', label: 'CTD', color: 'var(--vct-tile-ctd)' },
  { type: 'ctc', label: 'CTC', color: 'var(--vct-tile-ctc)' },
];

export default createTile({
  descriptor,
  Model: State,
  Settings,
  size: { defaultW: 3, defaultH: 10, minW: 2, minH: 6 },
  titleKey: 'dashboard.vocTitle',

  /**
   * Eine Kachel für die erste Instanz; die feste Id `voc-ctx-tree` tragen
   * gespeicherte Layouts und Kachel-Einstellungen.
   * @param {{ i18n: any, findInstances: (id: string) => Array<{ instanceId: string }> }} ctx
   * @returns {Array<{ tileId: string, instanceId: string, title: string }>}
   */
  enumerate(ctx) {
    const [first] = ctx.findInstances('voc-ctx-tree');
    return first ? [{ tileId: 'voc-ctx-tree', instanceId: first.instanceId, title: ctx.i18n.t('dashboard.vocTitle') }] : [];
  },

  /** @type {import('./settings.types.js').VocCtxTreeTileViewFn} */
  view(ctx) {
    /** @param {string} key @returns {string} */
    const g = (key) => ctx.i18n.t(`dashboard.${key}`);
    return {
      /** Leertext ohne Stimmen, sonst null. */
      get empty() {
        return this.model.vocs.length === 0 ? g('vocEmpty') : null;
      },
      /** Zahl der Bedürfnisse, Anforderungen und der Treiber je Art. */
      get counts() {
        let needs = 0;
        let reqs = 0;
        const byType = { ctq: 0, ctd: 0, ctc: 0 };
        for (const voc of this.model.vocs) {
          for (const need of voc.needs) {
            needs++;
            for (const drv of need.drivers) {
              byType[drv.type]++;
              reqs += drv.requirements.length;
            }
          }
        }
        return { needs, reqs, byType, drivers: byType.ctq + byType.ctd + byType.ctc };
      },
      /** Die vier Zahlen über dem Balken. */
      get stats() {
        if (this.empty) return [];
        const c = this.counts;
        return [
          { value: String(this.model.vocs.length), label: ` ${this.t('tile.vocUnit')}` },
          { value: String(c.needs), label: ` ${g('vocNeeds')}` },
          { value: String(c.drivers), label: ` ${g('vocDrivers')}` },
          { value: String(c.reqs), label: ` ${g('vocReqs')}` },
        ];
      },
      /** Balken und Legende der Treiberarten. */
      get bar() {
        const { byType } = this.counts;
        return distribution(DRIVERS.map((d) => ({ key: d.type, label: d.label, count: byType[d.type], color: d.color })));
      },
      /** Abschnitte des Balkens. */
      get segments() { return this.empty ? [] : this.bar.segments; },
      /** Legende, wenn eingeschaltet und Treiber da sind, sonst null. */
      get legend() {
        return !this.empty && this.settings.showLegend && this.counts.drivers > 0 ? this.bar.legend : null;
      },
      /** Überschrift der Aussagenliste oder null. */
      get listLabel() { return this.empty ? null : g('vocStatements'); },
      /** Die ersten Aussagen in Anführungszeichen, mit Herkunft. */
      get items() {
        return this.model.vocs.slice(0, this.settings.topN).map((v) => ({
          quote: v.source ? `„${v.text || '—'}“ ` : `„${v.text || '—'}“`,
          source: v.source ? `(${v.source})` : null,
        }));
      },
      /** „… +n“ für die übrigen Aussagen oder null. */
      get more() {
        const n = this.model.vocs.length - this.settings.topN;
        return n > 0 ? `… +${n}` : null;
      },
    };
  },
});
