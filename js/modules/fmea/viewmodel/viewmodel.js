/**
 * D.Mike — FMEA: Viewmodel.
 *
 * Inhalt, Kommandos, Invarianten und die Bewertung liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Felder
 * binden `x-model`/`x-field`, Methode und Art `x-set`, Anlegen, Löschen und
 * Zuklappen `x-command`. Hier bleiben die Anzeige (Abzeichen, Kartenklassen,
 * Skalentexte, Titel der Stufen), die Skalenzellen (schreiben nur bei
 * Änderung), der Hinweis nach dem Sortieren und das Burndown-Fenster
 * (Widget im geliehenen Knoten). Export: die Risikotabelle (CSV, XLSX).
 */
import { createModule } from '../../../core/template-module.js';
import { resolveDateOffset } from '../../../core/date-offset.js';
import { setFields } from '../../../core/model.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  METHODS, FMEA_TYPES, rating, rpn, ap, projRpn, projAp, projS, projO, projD,
  needsJustification, isHighSeverity, suggestsSpecialChar,
} from '../domain/rating.js';
import { S_BANDS, O_BANDS, D_BANDS, AP_TABLE, AP_CATEGORY, bandLabel } from '../domain/ap.js';
import { RPN_ROWS, RPN_SECOND, scaleRow } from '../domain/scales.js';
import { toRows } from '../io/table.js';
import { UiState } from './state.js';

/** @typedef {import('../domain/model.types.js').StateFields['risks'][number]} Risk */
/** @typedef {'sev'|'occ'|'det'} Dim */

/** Dimensionen der Skalen in Anzeigereihenfolge. */
const DIMS = /** @type {const} */ (['sev', 'occ', 'det']);
/** Überschrift je Dimension. */
const DIM_TITLE = { sev: 'scaleSeverity', occ: 'scaleOccurrence', det: 'scaleDetection' };
/** Spaltenköpfe der RPN-Skalen je Dimension (Stufe, Bedeutung, zweite Spalte). */
const RPN_HEADS = {
  sev: ['scaleValue', 'scaleMeaning', 'scaleDescription'],
  occ: ['scaleValue', 'scaleProbability', 'scaleRate'],
  det: ['scaleValue', 'scaleDetect', 'scaleDescription'],
};

/** Eine Linie des Burndowns: Punkte mit Verbindung, Plan gestrichelt. */
const LINE = (/** @type {string} */ name, /** @type {number[]} */ x, /** @type {number[]} */ y, /** @type {string} */ color, /** @type {'dash'|'solid'} */ dash) => ({
  name, x, y, color, symbol: 'circle',
  connectLine: { show: true, dash, width: dash === 'solid' ? 2.5 : 2, color },
});

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  config: {
    actions: [
      { icon: 'action.glossary', title: 'scales', onClick: (/** @type {any} */ d) => d.toggleScale(),
        dynamicText: (/** @type {any} */ d, /** @type {(k: string) => string} */ tf) => tf(d?.state?.scaleVisible ? 'scalesHide' : 'scalesShow') },
      { icon: 'chart.run-chart', title: 'burndown', onClick: (/** @type {any} */ d) => d.showBurndown() },
      { icon: 'nav.expand-down', title: 'sortByPriority', command: 'sortByPriority' },
      { icon: 'action.add', title: 'addRisk', variant: 'primary', command: 'addRisk' },
    ],
  },
  /** @type {import('./state.types.js').FmeaExports} */
  exports: {
    fileName: 'fmea',
    table() { return toRows(this.model, this.t); },
  },
  /**
   * Eine neue FMEA beginnt mit Methode und Art aus den Einstellungen der App
   * (unbekannte Werte: Vorgabe des Models).
   * @param {{ stateManager: { get: (key: string) => any } }} ctx
   */
  createDefault(ctx) {
    const m = new State();
    const s = ctx.stateManager.get('settings.fmea');
    /** @type {Record<string, string>} */
    const values = {};
    if (s && typeof s === 'object') {
      if (METHODS.includes(s.defaultMethod)) values.method = s.defaultMethod;
      if (FMEA_TYPES.includes(s.defaultType)) values.fmeaType = s.defaultType;
    }
    setFields(m, values);
    return m;
  },
  /**
   * Relative Zieldaten des Beispiels (`+30d`) werden zum Datum ab heute.
   * @param {any} data @returns {any}
   */
  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.risks)) {
      result.risks.forEach((/** @type {any} */ r) => {
        if (Array.isArray(r.actions)) {
          r.actions.forEach((/** @type {any} */ a) => { a.date = resolveDateOffset(a.date); });
        }
      });
    }
    return result;
  },
  /** @type {import('./state.types.js').FmeaViewFn} */
  view(ctx) {
    /** @type {((e: any) => void)|null} */
    let onCommand = null;
    /** @type {{ close: () => void }|null} */
    let dialog = null;
    return {
      /** @returns {boolean} Bewertung nach Aufgabenpriorität */
      get isAp() { return this.model.method === 'ap'; },
      /** Schlüssel der Burndown-Einstellungen in der Altform. */
      get legacyEditKey() { return 'scatter'; },

      // ─── Methode und Art ─────────────────────────────────
      /** @param {string} m @returns {string} */
      methodClass(m) { return this.model.method === m ? 'btn--active' : ''; },
      /** @param {string} type @returns {string} */
      typeClass(type) { return this.model.fmeaType === type ? 'btn--active' : ''; },

      // ─── Risikokarte ─────────────────────────────────────
      /** @param {number} i @returns {string} „R-001“ */
      riskNum(i) { return `R-${String(i + 1).padStart(3, '0')}`; },
      /** @param {Risk} risk @returns {boolean} */
      isCollapsed(risk) { return this.model.collapsed.includes(risk.id); },
      /** @param {Risk} risk @returns {string} */
      collapseIcon(risk) { return this.isCollapsed(risk) ? 'nav.expand-right' : 'nav.expand-down'; },
      /** DOM-id je Instanz. @param {string} name @returns {string} */
      fieldId(name) { return `fmea-${name}-${ctx.instanceId}`; },
      /** id eines Risikofelds je Instanz. @param {Risk} risk @param {string} name @returns {string} */
      riskFieldId(risk, name) { return this.fieldId(`${name}-${risk.id}`); },
      /** id der Stufenauswahl je Instanz. @param {Risk} risk @param {Dim} dim @returns {string} */
      sodId(risk, dim) { return this.riskFieldId(risk, dim); },
      /** @param {Risk} risk @returns {'true'|'false'} für aria-expanded des Zuklappers */
      expandedAttr(risk) { return this.isCollapsed(risk) ? 'false' : 'true'; },
      /** @param {Risk} risk @returns {number} */
      rpnOf(risk) { return rpn(risk); },
      /** @param {Risk} risk @returns {string} */
      apOf(risk) { return ap(risk) ?? ''; },
      /** @param {Risk} risk @returns {number} */
      projRpnOf(risk) { return projRpn(risk); },
      /** @param {number} v @returns {string} „RPN 504“, ohne Wert „RPN —“ */
      rpnText(v) { return v ? `RPN ${v}` : 'RPN —'; },
      /** @param {Risk} risk @returns {string} */
      riskRpnText(risk) { return this.rpnText(rpn(risk)); },
      /** @param {Risk} risk @returns {string} Farbstufe des Abzeichens */
      badgeClass(risk) { return `fmea__rpn-badge--${rating(this.model.method).category(risk)}`; },
      /** @param {Risk} risk @returns {string} Farbstufe des Zielabzeichens */
      projBadgeClass(risk) { return `fmea__rpn-badge--${rating(this.model.method).projCategory(risk)}`; },
      /** @param {Risk} risk @returns {string} „AP H“ bzw. „RPN 504“ */
      badgeText(risk) { return this.isAp ? `AP ${ap(risk) || '—'}` : this.rpnText(rpn(risk)); },
      /** @param {Risk} risk @returns {string} „Ziel AP M“ bzw. „Ziel 120“ */
      projBadgeText(risk) {
        if (this.isAp) return `${this.t('target')} AP ${projAp(risk) || '—'}`;
        const v = projRpn(risk);
        return `${this.t('target')} ${v || '—'}`;
      },
      /** @param {Risk} risk @returns {string} „AP M“ bzw. „RPN 120“ */
      projValueText(risk) { return this.isAp ? `AP ${projAp(risk) || '—'}` : this.rpnText(projRpn(risk)); },
      /** @param {Risk} risk @returns {string} Leuchtstufe, zugeklappt, S ≥ 9 */
      cardClass(risk) {
        const cat = rating(this.model.method).category(risk);
        return [
          cat === 'none' ? '' : `fmea__risk-card--${cat}`,
          this.isCollapsed(risk) ? 'fmea__risk-card--collapsed' : '',
          this.showSevere(risk) ? 'fmea__risk-card--severe' : '',
        ].filter(Boolean).join(' ');
      },
      /** @param {Risk} risk @returns {boolean} AP H ohne Maßnahme und Begründung */
      showUnjustified(risk) { return this.isAp && needsJustification(risk); },
      /** @param {Risk} risk @returns {boolean} Pflicht bei AP H, sonst sichtbar, sobald gefüllt */
      showJustification(risk) { return this.showUnjustified(risk) || risk.justification.trim() !== ''; },
      /** @param {Risk} risk @returns {string} */
      justificationClass(risk) { return this.showUnjustified(risk) ? 'fmea__justification-input--required' : ''; },
      /** @param {Risk} risk @returns {string} */
      justificationRequired(risk) { return this.showUnjustified(risk) ? 'true' : 'false'; },
      /** @param {Risk} risk @returns {boolean} RPN und S ≥ 9 */
      showSevere(risk) { return !this.isAp && isHighSeverity(risk); },
      /** @param {Risk} risk @returns {boolean} S ≥ 9 ohne besonderes Merkmal */
      showSpecialHint(risk) { return suggestsSpecialChar(risk); },
      /** @param {Risk} risk @returns {string} Abzeichen CC/SC */
      specialCharClass(risk) { return risk.specialChar ? `fmea__badge--${risk.specialChar.toLowerCase()}` : ''; },
      /** @param {Risk} risk @returns {string} */
      projSDisp(risk) { return risk.sev ? String(projS(risk)) : '—'; },
      /** @param {Risk} risk @returns {string} */
      projODisp(risk) { return risk.occ ? String(projO(risk)) : '—'; },
      /** @param {Risk} risk @returns {string} */
      projDDisp(risk) { return risk.det ? String(projD(risk)) : '—'; },

      // ─── Kennzahlen ──────────────────────────────────────
      /** @returns {string} */
      get statAvg() { const a = this.stats.avg; return a == null ? '—' : String(a); },
      /** @returns {string} */
      get statMax() { const m = this.stats.max; return m ? String(m) : '—'; },
      /** @returns {string} */
      get statRated() { return String(this.stats.rated ?? 0); },
      /** @returns {string} */
      get statHighLabel() { return this.t(this.isAp ? 'statApHigh' : 'statHigh'); },
      /** @returns {string} */
      get statMediumLabel() { return this.t(this.isAp ? 'statApMedium' : 'statMedium'); },
      /** @returns {string} */
      get statLowLabel() { return this.t(this.isAp ? 'statApLow' : 'statLow'); },

      // ─── Skalen ──────────────────────────────────────────
      /** @returns {string} */
      get scaleRefClass() { return this.state.scaleVisible ? 'fmea__scale-ref--visible' : ''; },
      /** Skalen ein- oder ausblenden. */
      toggleScale() { this.state.scaleVisible = !this.state.scaleVisible; },
      /**
       * Eigener Skalentext, sonst der mitgelieferte der aktiven Sprache.
       * @param {string} key @returns {string}
       */
      scaleText(key) {
        const custom = this.model.scales[key];
        return custom != null ? custom : this.t(key);
      },
      /**
       * Eine Skalenzelle verlassen: schreibt nur, wenn der Text vom
       * angezeigten abweicht.
       * @param {FocusEvent} event
       */
      scaleEdited(event) {
        const el = /** @type {HTMLElement} */ (event.target);
        const key = el.dataset.scale ?? '';
        const text = (el.textContent || '').trim();
        if (text === this.scaleText(key)) return;
        try {
          this.model.setScaleValue({ key, text });
        } catch (err) {
          console.warn('fmea: Skalentext nicht übernommen', err);
          el.textContent = this.scaleText(key);
        }
      },
      /** Die drei RPN-Skalen mit Köpfen und Zeilen. */
      get rpnScales() {
        return DIMS.map((dim) => ({
          dim,
          title: DIM_TITLE[dim],
          heads: RPN_HEADS[dim],
          rows: RPN_ROWS.map((r) => ({ label: r.label, key: r[dim], second: `${r[dim]}${RPN_SECOND[dim]}` })),
        }));
      },
      /** Die Dimensionen der AP-Skalen. */
      get apDims() { return DIMS; },
      /** @param {Dim} dim @returns {string} */
      apDimTitle(dim) { return DIM_TITLE[dim]; },
      /** Zeilen 10 → 1 einer AP-Skala der aktiven Art. @param {Dim} dim */
      apScaleRows(dim) {
        const rows = [];
        for (let v = 10; v >= 1; v--) {
          const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
          rows.push({ key: base, value: String(v), meaningKey: `${base}.meaning`, criterionKey: `${base}.criterion` });
        }
        return rows;
      },
      /** Spaltenköpfe der AP-Matrix („D 7–10“ …). */
      get apDHeads() { return D_BANDS.map((b) => ({ key: bandLabel(b), text: `${this.t('abbrD')} ${bandLabel(b)}` })); },
      /** Die AP-Nachschlagematrix. */
      get apMatrixRows() {
        const rows = [];
        for (const [si, sb] of S_BANDS.entries()) {
          if (sb[0] === 1) {
            rows.push({ key: 's1', s: '1', o: '1–10',
              cells: D_BANDS.map((_, di) => ({ key: `s1-${di}`, ap: 'L', cls: `fmea__ap-cell--${AP_CATEGORY.L}` })) });
            continue;
          }
          for (const [oi, ob] of O_BANDS.entries()) {
            rows.push({ key: `${si}-${oi}`, s: bandLabel(sb), o: bandLabel(ob),
              cells: [...AP_TABLE[si][oi]].map((a, di) => ({ key: `${si}-${oi}-${di}`, ap: a, cls: `fmea__ap-cell--${AP_CATEGORY[/** @type {'H'|'M'|'L'} */ (a)]}` })) });
          }
        }
        return rows;
      },
      /**
       * Titel einer Stufe in der Auswahl: AP-Skala der Art, sonst die
       * RPN-Zeile der Stufe.
       * @param {Dim} dim @param {number} v @returns {string}
       */
      levelTitle(dim, v) {
        if (this.isAp) {
          const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
          return `${this.scaleText(`${base}.meaning`)} – ${this.scaleText(`${base}.criterion`)}`;
        }
        const k = RPN_ROWS[scaleRow(v)][dim];
        const second = this.scaleText(`${k}${RPN_SECOND[dim]}`);
        return dim === 'occ' ? `${this.scaleText(k)} (${second})` : `${this.scaleText(k)} – ${second}`;
      },
      /** @param {number} v @returns {string} */
      sevTitle(v) { return this.levelTitle('sev', v); },
      /** @param {number} v @returns {string} */
      occTitle(v) { return this.levelTitle('occ', v); },
      /** @param {number} v @returns {string} */
      detTitle(v) { return this.levelTitle('det', v); },

      // ─── Burndown ────────────────────────────────────────
      computed: {
        /** Plan und Ist der aktiven Methode; ohne Daten ohne Reihen. */
        burndownChart() {
          const bd = this.burndown;
          const t = (/** @type {string} */ k) => this.t(k);
          let series = [];
          if (bd?.kind === 'ap') {
            series = [
              LINE(t('burndownHPlan'), bd.planX, bd.planH ?? [], 'var(--color-warning)', 'dash'),
              LINE(t('burndownHActual'), bd.actX, bd.actH ?? [], 'var(--color-warning)', 'solid'),
              LINE(t('burndownHmPlan'), bd.planX, bd.planHM ?? [], 'var(--color-info)', 'dash'),
              LINE(t('burndownHmActual'), bd.actX, bd.actHM ?? [], 'var(--color-info)', 'solid'),
            ];
          } else if (bd) {
            series = [
              LINE(t('burndownPlan'), bd.planX, bd.planY ?? [], 'var(--color-text-tertiary)', 'dash'),
              LINE(t('burndownActual'), bd.actX, bd.actY ?? [], 'var(--color-accent)', 'solid'),
            ];
          }
          return {
            series,
            title: t('burndownTitle'),
            yLabel: bd?.kind === 'ap' ? t('burndownRiskCount') : 'RPN',
            yMin: 0,
            showLegend: true,
            xAxis: /** @type {'date'} */ ('date'),
            xDateFormat: /** @type {'short'} */ ('short'),
          };
        },
      },
      /**
       * Das Burndown-Fenster öffnen: ohne Daten ein Hinweis; sonst entsteht
       * das Widget im Halter und der Halter geht an den Dialogdienst.
       */
      async showBurndown() {
        if (!this.burndown) {
          ctx.notify(this.t('burndownNoData'));
          return;
        }
        dialog?.close();
        this.state.burndownOpen = true;
        await this.$nextTick();
        const content = this.$refs.burndown;
        if (!content || !this.state.burndownOpen) return;
        const handle = ctx.dialog.show({
          title: this.t('burndownTitle'),
          size: 'wide',
          content,
          onClose: () => {
            if (dialog === handle) dialog = null;
            this.state.burndownOpen = false;
          },
        });
        dialog = handle;
      },

      /** Nach dem Sortieren (Oberfläche oder Agent) ein Hinweis mit der Methode. */
      init() {
        onCommand = (e) => {
          if (e?.instanceId === ctx.instanceId && e.command === 'sortByPriority') {
            ctx.notify(this.t(this.model.method === 'ap' ? 'sortedByAP' : 'sortedByRPN'));
          }
        };
        ctx.eventBus?.on?.('command:executed', onCommand);
      },
      /** Beobachter abmelden, ein offenes Fenster schließen. */
      destroy() {
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
        dialog?.close();
      },
    };
  },
});
