/**
 * D.Mike — Stakeholder-Analyse: Viewmodel.
 *
 * Inhalt, Kommandos und der Quadrant je Beteiligtem liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Anlegen
 * und Bearbeiten laufen über ein verborgenes Formular im Dialog
 * (`x-dialog`, `x-command-form`), Löschen über `x-command` mit der Rückfrage
 * des Kommandos. Die Wertanzeige der Regler liest die Formularwerte (`form`).
 * Hier bleibt die Darstellung: Karten, Matrix, Übersicht und
 * Kommunikationsplan.
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  SUPPORT_VALUES, quadrantOf, isKeyCritic, criticalCritics, byQuadrant,
} from '../domain/quadrant.js';

/** @typedef {import('../domain/model.types.js').StateModel} StakeholderModel */
/** @typedef {import('../domain/model.types.js').StateFields['stakeholders'][number]} Entry */

/** Zahl der Kürzelfarben (`--sha-avatar-0` … `--sha-avatar-9`). */
const AVATAR_COUNT = 10;

/** Text je Quadrant (Name; Erklärsatz mit `Desc`). */
const QUAD_KEY = {
  'manage-closely': 'quadManageClosely',
  'keep-satisfied': 'quadKeepSatisfied',
  'keep-informed': 'quadKeepInformed',
  monitor: 'quadMonitor',
};

/** Text je Haltung der Wertemenge. */
const SUPPORT_KEY = { supporter: 'supportSupporter', neutral: 'supportNeutral', critic: 'supportCritic' };

/** Text je Kategorie der Wertemenge. */
const CATEGORY_KEY = {
  intern: 'categoryIntern',
  extern: 'categoryExtern',
  kunde: 'categoryCustomer',
  lieferant: 'categorySupplier',
  behoerde: 'categoryAuthority',
};

/** Kommunikationsplan je Quadrant: Taktung, Weg, Inhalt, Vorgehen. */
const COMM_PLANS = {
  'manage-closely': { freq: 'commWeekly', channel: 'commPersonal', content: 'commContentDetailed', action: 'commActionEngage' },
  'keep-satisfied': { freq: 'commBiweekly', channel: 'commEmail', content: 'commContentSummary', action: 'commActionInform' },
  'keep-informed': { freq: 'commMonthly', channel: 'commNewsletter', content: 'commContentProgress', action: 'commActionFeedback' },
  monitor: { freq: 'commQuarterly', channel: 'commIntranet', content: 'commContentGeneral', action: 'commActionObserve' },
};

/** Farbe der Balken je Art. */
const METER_COLOR = { power: 'var(--color-accent)', interest: 'var(--color-info)' };

/** @param {string} s Haltung @returns {string} Tonklasse; Unbekanntes wie ein Kritiker */
const toneOf = (s) => (SUPPORT_VALUES.includes(s) ? s : 'critic');

/** @param {string} s Haltung @returns {number} Balkenlänge in Prozent */
const supportPctOf = (s) => (s === 'supporter' ? 100 : s === 'neutral' ? 50 : 20);

/** @param {string} s Haltung @returns {string} Balkenfarbe */
const supportColorOf = (s) => (s === 'supporter' ? 'var(--color-success)' : s === 'neutral' ? 'var(--color-warning)' : 'var(--color-error)');

/** @param {string} name @returns {number} Index der Kürzelfarbe aus dem Namens-Hash */
function avatarIndex(name) {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % AVATAR_COUNT;
}

export default createModule({
  descriptor,
  Model: State,
  history: true,
  /** @type {import('../../../core/template-module.js').ViewFn<StakeholderModel, {}>} */
  view() {
    return {
      // ─── Listen ───────────────────────────────────────────
      /** Ohne Beteiligte. */
      get isEmpty() { return this.model.stakeholders.length === 0; },
      /** Mit Beteiligten. */
      get hasStakeholders() { return this.model.stakeholders.length > 0; },
      /** Die Beteiligten nach Quadrantenrang (Übersicht, Kommunikationsplan). */
      get sorted() { return byQuadrant(this.model.stakeholders); },
      /** Die Stufen 1–5 der Punktreihen. */
      get levels() { return [1, 2, 3, 4, 5]; },
      /** Die Haltungen der Legende. */
      get supportTones() { return SUPPORT_VALUES; },

      // ─── Karten ───────────────────────────────────────────
      /** @param {string} name @returns {string} Farbklasse des Kürzels */
      avatarClass(name) { return `sha__avatar--c${avatarIndex(name)}`; },
      /** @param {string} name @returns {string} bis zu zwei Anfangsbuchstaben */
      initials(name) {
        return String(name || '').split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 2);
      },
      /** @param {Entry} sh @returns {string} die Rolle oder ein Gedankenstrich */
      roleText(sh) { return sh.role || '—'; },
      /**
       * Länge und Farbe eines Balkens der Karte.
       * @param {Entry} sh @param {'power'|'interest'|'support'} kind
       * @returns {string}
       */
      meterStyle(sh, kind) {
        if (kind === 'support') return `width:${supportPctOf(sh.support)}%;background:${supportColorOf(sh.support)}`;
        return `width:${sh[kind] * 20}%;background:${METER_COLOR[kind]}`;
      },

      // ─── Quadranten ───────────────────────────────────────
      /** @param {string} q @returns {string} Name des Quadranten */
      quadLabel(q) { return this.t(QUAD_KEY[q]); },
      /** @param {string} q @returns {string} Erklärsatz des Quadranten */
      quadDesc(q) { return this.t(`${QUAD_KEY[q]}Desc`); },
      /** @param {Entry} sh @returns {string} Name des Quadranten des Beteiligten */
      strategyLabel(sh) { return this.quadLabel(quadrantOf(sh)); },
      /** @param {Entry} sh @returns {string} Farbklasse des Quadranten des Beteiligten */
      strategyClass(sh) { return `sha__q--${quadrantOf(sh)}`; },
      /** @param {string} q @returns {Entry[]} die Beteiligten eines Quadranten */
      chipsFor(q) { return this.model.stakeholders.filter((s) => quadrantOf(s) === q); },
      /** @param {Entry} sh @returns {string} Klasse des Chips, hervorgehoben für Schlüssel-Kritiker */
      chipClass(sh) { return isKeyCritic(sh) ? 'sha__chip sha__chip--alert' : 'sha__chip'; },
      /** @param {string} s Haltung @returns {string} Klasse des Haltungspunkts */
      chipDotClass(s) { return `sha__chip-dot sha__chip-dot--${toneOf(s)}`; },
      /** Die Kritiker im Quadranten „eng managen“. */
      get keyCritics() { return criticalCritics(this.model.stakeholders); },
      /** Gibt es Schlüssel-Kritiker? */
      get hasKeyCritics() { return this.keyCritics.length > 0; },
      /** Warntext mit den Namen der Schlüssel-Kritiker. */
      get criticWarningText() {
        return this.t('criticWarningText', { names: this.keyCritics.map((s) => s.name).join(', ') });
      },

      // ─── Haltung und Kategorie ────────────────────────────
      /** @param {string} s @returns {string} Name der Haltung; Unbekanntes wie gespeichert */
      supportLabel(s) { return Object.hasOwn(SUPPORT_KEY, s) ? this.t(SUPPORT_KEY[s]) : s; },
      /** @param {string} s @returns {string} Klasse der Haltungsmarke */
      supportBadgeClass(s) { return `sha__support-badge sha__support-badge--${s}`; },
      /** @param {string} c @returns {string} Name der Kategorie; Unbekanntes wie gespeichert */
      catLabel(c) { return Object.hasOwn(CATEGORY_KEY, c) ? this.t(CATEGORY_KEY[c]) : c; },
      /** @param {number} i @param {number} level @returns {string} Klasse eines Stufenpunkts */
      dotClass(i, level) { return i <= level ? 'sha__level-dot sha__level-dot--filled' : 'sha__level-dot'; },

      // ─── Kommunikationsplan ───────────────────────────────
      /** @param {Entry} sh @returns {string} */
      commFreq(sh) { return this.t(COMM_PLANS[quadrantOf(sh)].freq); },
      /** @param {Entry} sh @returns {string} */
      commChannel(sh) { return this.t(COMM_PLANS[quadrantOf(sh)].channel); },
      /** @param {Entry} sh @returns {string} */
      commContent(sh) { return this.t(COMM_PLANS[quadrantOf(sh)].content); },
      /** @param {Entry} sh @returns {string} */
      commAction(sh) { return this.t(COMM_PLANS[quadrantOf(sh)].action); },
      /** @param {Entry} sh @returns {string} Quadrant und Kategorie in einer Zeile */
      commQuadLine(sh) { return `${this.strategyLabel(sh)} · ${this.catLabel(sh.category)}`; },
    };
  },
});
