/**
 * D.Mike — Settings page (settings.js)
 * Fully-Alpine conversion of the former _initSettings + _initShortcutsTab.
 * Rendered as a centered DRAGGABLE popout (dmike-chart-popout shell) via the
 * createPage() factory. The data-fn owns all control state; two imperative
 * exceptions (per spec §Conventions) are wrapped by Alpine state:
 *   - the color picker (openColorPicker — imperative widget),
 *   - the shortcuts capture keydown listener (document-level, capture phase).
 */

import { createPage } from '../../core/create-page.js';
import { draggablePopout } from '../../ui/draggable-popout.js';
import { openColorPicker, hexToRGBA, rgbaToHex6 } from '../../core/color-picker.js';
import {
  shortcutRegistry, normalizeCombo, formatCombo,
} from '../../core/shortcut-registry.js';

/** Default 10-color chart series palette (identical to legacy DEFAULT_COLORS). */
export const DEFAULT_CHART_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
];

/** Statistics defaults (identical to legacy STAT_DEFAULTS). */
export const STAT_DEFAULTS = { confidenceLevel: 95, power: 80 };

/** Shortcut group display order (identical to legacy groupOrder). */
export const SHORTCUT_GROUP_ORDER = ['general', 'datagrid', 'worksheet', 'vocCtxTree'];

/** Font-slider bounds + defaults, keyed by state key (mirrors index.html). */
export const FONT_SLIDERS = [
  { key: 'chartTitleSize', min: 8, max: 28, def: 15 },
  { key: 'chartLabelSize', min: 8, max: 24, def: 12 },
  { key: 'chartTickSize',  min: 7, max: 20, def: 11 },
];

/** alpha = 100 − confidence (2-decimal, number). Legacy: +(100-conf).toFixed(2). */
export function linkedAlpha(confidence) { return Number((100 - confidence).toFixed(2)); }

/** beta = 100 − power (2-decimal, number). */
export function linkedBeta(power) { return Number((100 - power).toFixed(2)); }

/** Clamp a confidence/power value to [50, 99.99] with a fallback. */
export function clampConfPower(raw, fallback) {
  const v = parseFloat(raw);
  return Math.min(99.99, Math.max(50, Number.isFinite(v) ? v : fallback));
}

/** Clamp an alpha/beta value to [0.01, 50] with a fallback. */
export function clampRisk(raw, fallback) {
  const v = parseFloat(raw);
  return Math.min(50, Math.max(0.01, Number.isFinite(v) ? v : fallback));
}

/** Clamp export-reminder minutes to [1, 1440] integer, default 60. */
export function clampMinutes(raw) {
  return Math.min(1440, Math.max(1, parseInt(raw, 10) || 60));
}

/**
 * Group shortcut definitions by category in the configured order, with any
 * unknown categories appended. Pure — testable without the registry.
 * @param {Array<{id,category,...}>} all
 * @param {string[]} order
 * @returns {Array<{id:string, items:Array}>} ordered groups
 */
export function groupShortcuts(all, order) {
  const byGroup = new Map();
  for (const sc of all) {
    if (!byGroup.has(sc.category)) byGroup.set(sc.category, []);
    byGroup.get(sc.category).push(sc);
  }
  const orderedIds = order.filter(g => byGroup.has(g))
    .concat([...byGroup.keys()].filter(g => !order.includes(g)));
  return orderedIds.map(id => ({ id, items: byGroup.get(id) }));
}

export default createPage({
  id: 'settings',
  templateUrl: new URL('js/pages/settings/settings.html', document.baseURI).href,
  // The popout overlay IS the mount container; the panel lives inside the template.
  container: '#settings-overlay',
  button: '#settings-btn',
  overlay: 'settings',
  i18nKey: 'settings',
  onShow(containerEl) {
    const root = containerEl.querySelector('[x-data]');
    if (root && root._x_dataStack) root._x_dataStack[0].popoutResetPosition?.();
  },
  data(context, t, page) {
    const { stateManager, themeManager, i18n, eventBus, tipEngine } = context;

    return {
      // size + initialPosition left empty so the centred geometry comes from the
      // CSS rule `#settings-panel.dmike-chart-popout` (width/max-height/left/top).
      // popoutStyle() then returns '' until the user drags — keeping the inline
      // style.left/top empty initially (drag-test contract) and matching the
      // legacy 480px visual baseline.
      ...draggablePopout({ size: '', initialPosition: '' }),

      // ── tabs ──────────────────────────────────────────────
      tabs: [
        { id: 'appearance', labelKey: 'tabAppearance' },
        { id: 'charts',     labelKey: 'tabCharts' },
        { id: 'statistics', labelKey: 'tabStatistics' },
        { id: 'shortcuts',  labelKey: 'tabShortcuts' },
      ].map(x => ({ id: x.id, label: t(x.labelKey) })),
      activeTab: 'appearance',
      selectTab(id) { this.activeTab = id; },
      isTab(id) { return this.activeTab === id; },
      tabClass(id) {
        return id === this.activeTab
          ? 'settings-tab settings-tab--active'
          : 'settings-tab';
      },

      // ── close (overlay outside-click; Escape handled by factory) ──
      close() { page.hide(); },

      // ── language ──────────────────────────────────────────
      currentLang: i18n.getLanguage(),
      langClass(lang) {
        return lang === this.currentLang
          ? 'lang-toggle__option lang-toggle__option--active'
          : 'lang-toggle__option';
      },
      async setLang(lang) {
        await i18n.setLanguage(lang);
        this.currentLang = lang;
      },

      // ── theme ─────────────────────────────────────────────
      currentTheme: themeManager.getTheme(),
      themeClass(theme) {
        return theme === this.currentTheme
          ? 'settings-theme-btn settings-theme-btn--active'
          : 'settings-theme-btn';
      },
      setTheme(theme) {
        themeManager.setTheme(theme);
        this.currentTheme = theme;
      },

      // ── tips ──────────────────────────────────────────────
      tipsEnabled: stateManager.get('settings.tipsEnabled') !== false,
      onTipsToggle() { stateManager.set('settings.tipsEnabled', this.tipsEnabled); },
      resetTips() { if (tipEngine) tipEngine.resetDismissed(); },

      // ── export reminder ───────────────────────────────────
      reminderEnabled: stateManager.get('settings.exportReminderEnabled') !== false,
      onReminderToggle() { stateManager.set('settings.exportReminderEnabled', this.reminderEnabled); },
      reminderMinutes: stateManager.get('settings.exportReminderMinutes') == null
        ? 60 : stateManager.get('settings.exportReminderMinutes'),
      onReminderMinutes() {
        const v = clampMinutes(this.reminderMinutes);
        this.reminderMinutes = v;
        stateManager.set('settings.exportReminderMinutes', v);
      },

      // ── glossary inline links ─────────────────────────────
      glossaryInline: stateManager.get('settings.glossary.inlineLinksEnabled') !== false,
      onGlossaryToggle() {
        stateManager.set('settings.glossary.inlineLinksEnabled', this.glossaryInline);
        eventBus.emit('settings:changed', {
          key: 'glossary.inlineLinksEnabled', value: this.glossaryInline,
        });
      },

      // ── show algo-lab links ───────────────────────────────
      showAlgoLinks: stateManager.get('settings.showAlgoLabLinks') !== false,
      onAlgoLinksToggle() {
        stateManager.set('settings.showAlgoLabLinks', this.showAlgoLinks);
        document.body.classList.toggle('hide-algo-lab-links', !this.showAlgoLinks);
      },

      // ── chart font sliders ────────────────────────────────
      fontSliders: FONT_SLIDERS.map(f => {
        const stored = stateManager.get(`settings.${f.key}`);
        return { ...f, value: stored == null ? f.def : stored };
      }),
      onFontInput(idx) {
        const f = this.fontSliders[idx];
        stateManager.set(`settings.${f.key}`, Number(f.value));
      },
      fontValue(idx) { return this.fontSliders[idx].value; },
      previewStyle(idx) { return `font-size:${  this.fontSliders[idx].value  }px`; },
      fontPreviewKey(key) {
        return {
          chartTitleSize: 'chartPreviewTitle',
          chartLabelSize: 'chartPreviewLabel',
          chartTickSize: 'chartPreviewTick',
        }[key];
      },

      // ── chart series colors (imperative picker, wrapped) ──
      colors: (() => {
        const saved = stateManager.get('settings.chartColors');
        return DEFAULT_CHART_COLORS.map((c, i) => (saved && saved[i]) || c);
      })(),
      colorStyle(i) { return `background:${  this.colors[i]}`; },
      pickColor(i, $event) {
        if (this._activePicker) this._activePicker.close();
        this._activePicker = openColorPicker($event, hexToRGBA(this.colors[i]), (rgba) => {
          const hex = rgbaToHex6(rgba);
          this.colors[i] = hex;
          document.documentElement.style.setProperty(`--color-chart-${i + 1}`, hex);
          const current = stateManager.get('settings.chartColors') || [...DEFAULT_CHART_COLORS];
          current[i] = hex;
          stateManager.set('settings.chartColors', current);
        });
      },
      resetColors() {
        this.colors = [...DEFAULT_CHART_COLORS];
        const root = document.documentElement;
        DEFAULT_CHART_COLORS.forEach((c, i) => root.style.setProperty(`--color-chart-${i + 1}`, c));
        stateManager.set('settings.chartColors', null);
      },
      _activePicker: null,

      // ── chart background color ────────────────────────────
      bgColor: stateManager.get('settings.chartBgColor') || null,
      bgIsNone() { return !this.bgColor; },
      bgStyle() { return this.bgColor ? `background:${  this.bgColor}` : ''; },
      pickBgColor($event) {
        if (this._activePicker) this._activePicker.close();
        const current = stateManager.get('settings.chartBgColor') || 'rgba(255,255,255,1)';
        this._activePicker = openColorPicker($event, current, (rgba) => {
          this.bgColor = rgba;
          stateManager.set('settings.chartBgColor', rgba);
        });
      },
      resetBgColor() {
        this.bgColor = null;
        stateManager.set('settings.chartBgColor', null);
      },

      // ── show legend default ───────────────────────────────
      showLegend: stateManager.get('settings.chartShowLegend') !== false,
      onLegendToggle() { stateManager.set('settings.chartShowLegend', this.showLegend); },

      // ── statistics (linked inputs) ────────────────────────
      confidence: stateManager.get('settings.confidenceLevel') == null
        ? STAT_DEFAULTS.confidenceLevel : stateManager.get('settings.confidenceLevel'),
      power: stateManager.get('settings.power') == null
        ? STAT_DEFAULTS.power : stateManager.get('settings.power'),
      alpha: 0, beta: 0,                         // derived in init()
      onConfidence() {
        const v = clampConfPower(this.confidence, 95);
        this.confidence = v;
        this.alpha = linkedAlpha(v);
        stateManager.set('settings.confidenceLevel', v);
      },
      onAlpha() {
        const v = clampRisk(this.alpha, 5);
        const conf = Number((100 - v).toFixed(2));
        this.confidence = conf;
        stateManager.set('settings.confidenceLevel', conf);
      },
      onPower() {
        const v = clampConfPower(this.power, 80);
        this.power = v;
        this.beta = linkedBeta(v);
        stateManager.set('settings.power', v);
      },
      onBeta() {
        const v = clampRisk(this.beta, 20);
        const power = Number((100 - v).toFixed(2));
        this.power = power;
        stateManager.set('settings.power', power);
      },
      resetStats() {
        this.confidence = STAT_DEFAULTS.confidenceLevel;
        this.power = STAT_DEFAULTS.power;
        this.alpha = linkedAlpha(this.confidence);
        this.beta = linkedBeta(this.power);
        stateManager.set('settings.confidenceLevel', STAT_DEFAULTS.confidenceLevel);
        stateManager.set('settings.power', STAT_DEFAULTS.power);
      },

      // ── shortcuts list (state machine; capture is imperative) ──
      shortcutGroups: [],
      capturingId: null,
      pendingConflict: null,                     // { id, combo, conflicts }
      _onCaptureKey: null,
      _unsubShortcuts: null,

      refreshShortcuts() {
        const next = groupShortcuts(shortcutRegistry.getAll(), SHORTCUT_GROUP_ORDER)
          .map(g => ({
            id: g.id,
            title: i18n.t(`settings.shortcutsGroup.${g.id}`) || g.id,
            items: g.items.map(sc => ({
              id: sc.id,
              label: i18n.t(sc.descriptionKey) || sc.id,
              combo: sc.currentCombo,
              isCustom: sc.isCustom,
              scope: sc.scope,
              hasConflict: shortcutRegistry.findConflicts(sc.currentCombo, sc.scope, sc.id).length > 0,
            })),
          }));
        // Update existing reactive item objects in place when the structure is
        // unchanged (the common case: only a combo/isCustom/hasConflict changed).
        // Replacing the whole array does not reliably re-render the keyed nested
        // x-for `x-text`, so we patch field-by-field to drive fine-grained
        // reactivity. Fall back to a full replace if the shape differs.
        const cur = this.shortcutGroups;
        const sameShape = cur.length === next.length
          && cur.every((g, gi) => g.id === next[gi].id
            && g.items.length === next[gi].items.length
            && g.items.every((it, ii) => it.id === next[gi].items[ii].id));
        if (!sameShape) { this.shortcutGroups = next; return; }
        next.forEach((g, gi) => {
          cur[gi].title = g.title;
          g.items.forEach((it, ii) => {
            const dst = cur[gi].items[ii];
            dst.label = it.label;
            dst.combo = it.combo;
            dst.isCustom = it.isCustom;
            dst.scope = it.scope;
            dst.hasConflict = it.hasConflict;
          });
        });
      },
      groupTitle(g) { return g.title; },
      keyText(item) {
        return this.capturingId === item.id
          ? (i18n.t('settings.shortcutsCapture') || 'Tasten drücken…')
          : item.combo;
      },
      keyClass(item) {
        return this.capturingId === item.id
          ? 'settings-shortcut-key settings-shortcut-key--capturing'
          : 'settings-shortcut-key';
      },
      rowClass(item) {
        return item.hasConflict
          ? 'settings-shortcut-row settings-shortcut-row--conflict'
          : 'settings-shortcut-row';
      },
      showConflict(item) {
        return Boolean(this.pendingConflict && this.pendingConflict.id === item.id);
      },
      conflictMsg() {
        if (!this.pendingConflict) return '';
        const names = this.pendingConflict.conflicts
          .map(c => `„${i18n.t(c.descriptionKey) || c.id}"`).join(', ');
        return (i18n.t('settings.shortcutsConflict') || 'Konflikt mit {name}.').replace('{name}', names);
      },
      startCapture(item) {
        if (this.capturingId === item.id) { this._stopCapture(); return; }
        this.capturingId = item.id;
        this.pendingConflict = null;
        document.addEventListener('keydown', this._onCaptureKey, true);
      },
      _stopCapture() {
        this.capturingId = null;
        document.removeEventListener('keydown', this._onCaptureKey, true);
      },
      resetOne(item) { shortcutRegistry.resetBinding(item.id); },
      resetAll() { this.pendingConflict = null; shortcutRegistry.resetAll(); },
      useAnyway() {
        const { id, combo } = this.pendingConflict;
        this.pendingConflict = null;
        shortcutRegistry.setBinding(id, combo);
      },
      cancelConflict() { this.pendingConflict = null; this.refreshShortcuts(); },

      // ── lifecycle ─────────────────────────────────────────
      init() {
        this.alpha = linkedAlpha(this.confidence);
        this.beta = linkedBeta(this.power);
        if (!this.showAlgoLinks) document.body.classList.add('hide-algo-lab-links');
        this.colors.forEach((c, i) =>
          document.documentElement.style.setProperty(`--color-chart-${i + 1}`, c));

        this._onCaptureKey = (e) => {
          if (!this.capturingId) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') { this._stopCapture(); return; }
          const parsed = normalizeCombo(e);
          if (!parsed) return;                   // pure modifier
          const combo = formatCombo(parsed);
          const def = shortcutRegistry.getDefinition(this.capturingId);
          const conflicts = shortcutRegistry.findConflicts(combo, def.scope, this.capturingId);
          if (conflicts.length > 0) {
            this.pendingConflict = { id: this.capturingId, combo, conflicts };
            this._stopCapture();
            return;
          }
          const id = this.capturingId;
          this._stopCapture();
          shortcutRegistry.setBinding(id, combo);
        };

        this.refreshShortcuts();
        this._unsubShortcuts = () => this.refreshShortcuts();
        // No language:changed subscription: the createPage factory's onLang
        // already does a full Alpine destroy+init, which re-runs this data-fn
        // (currentLang, the tabs map via t(...), and refreshShortcuts() below)
        // with fresh translations. shortcuts:changed is NOT covered by that
        // re-init, so we keep it — and clean it up in destroy() to avoid
        // accumulating a stale listener on every re-init.
        eventBus.on('shortcuts:changed', this._unsubShortcuts);
      },

      destroy() {
        eventBus.off('shortcuts:changed', this._unsubShortcuts);
      },
    };
  },
});
