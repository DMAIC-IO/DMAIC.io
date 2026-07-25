/**
 * D.Mike — Kano Model (kano-model.js)
 *
 * Persistierter Zustand des Kano-Moduls plus die zugehörige Geschäftslogik.
 * Kein DOM, kein i18n, keine View-Getter.
 *
 * Persistierte Form:
 *   { source: { instanceId, level }, options: { importance },
 *     items: [{ id, nodeId, label, path, missing }],
 *     respondents: [{ id, name }],
 *     answers: { [respondentId]: { [itemId]: { f, d, w } } },
 *     activeRespondentId }
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { LEVELS } from './kano-link.js';

/** Leeres Antwortobjekt — bewusst als Funktion, damit nie eine Referenz geteilt wird. */
const emptyAnswer = () => ({ f: null, d: null, w: null });

/** @returns {string} stabile, eindeutige ID */
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export class State {
  /** @type {{ instanceId: string|null, level: 'need'|'driver'|'req' }} */
  source = { instanceId: null, level: 'need' };
  /** @type {{ importance: boolean }} */
  options = { importance: true };
  /** @type {Array<{id: string, nodeId: string|null, label: string, path: string, missing: boolean}>} */
  items = [];
  /** @type {Array<{id: string, name: string}>} */
  respondents = [];
  /** @type {object} { [respondentId]: { [itemId]: { f, d, w } } } */
  answers = {};
  /** @type {string|null} */
  activeRespondentId = null;

  // ─── Items ──────────────────────────────────────────────────

  /** Ersetzt die Item-Liste (Ergebnis von applyDiff). */
  setItems(items) {
    this.items = Array.isArray(items) ? items : [];
  }

  /** Löscht ein Item samt aller Antworten dazu. */
  deleteItem(itemId) {
    this.items = this.items.filter((i) => i.id !== itemId);
    for (const byItem of Object.values(this.answers)) {
      delete byItem[itemId];
    }
  }

  // ─── Befragte ───────────────────────────────────────────────

  /** @returns {string} id der neuen Befragten; die erste wird aktiv */
  addRespondent(name) {
    const r = { id: uid(), name: name || '' };
    this.respondents.push(r);
    if (!this.activeRespondentId) this.activeRespondentId = r.id;
    return r.id;
  }

  renameRespondent(id, name) {
    const r = this.respondents.find((x) => x.id === id);
    if (r) r.name = name || '';
  }

  /** Löscht eine:n Befragte:n samt Antworten und hält die Auswahl gültig. */
  deleteRespondent(id) {
    this.respondents = this.respondents.filter((r) => r.id !== id);
    delete this.answers[id];
    if (this.activeRespondentId === id) {
      this.activeRespondentId = this.respondents.length ? this.respondents[0].id : null;
    }
  }

  // ─── Antworten ──────────────────────────────────────────────

  /**
   * Setzt einen Antwortwert. Fehlende Zwischenebenen werden angelegt.
   * @param {string} respondentId
   * @param {string} itemId
   * @param {'f'|'d'|'w'} field
   * @param {number|null} value
   */
  setAnswer(respondentId, itemId, field, value) {
    if (!['f', 'd', 'w'].includes(field)) return;
    if (!this.answers[respondentId]) this.answers[respondentId] = {};
    if (!this.answers[respondentId][itemId]) this.answers[respondentId][itemId] = emptyAnswer();
    this.answers[respondentId][itemId][field] = value === null ? null : Number(value);
  }

  /** @returns {{f: number|null, d: number|null, w: number|null}} nie undefined */
  answerOf(respondentId, itemId) {
    return this.answers[respondentId]?.[itemId] || emptyAnswer();
  }

  /** @returns {boolean} true, sobald ein Item oder ein:e Befragte:r existiert */
  hasContent() {
    return this.items.length > 0 || this.respondents.length > 0;
  }

  // ─── Serialisierung ─────────────────────────────────────────

  toJSON() {
    return JSON.parse(JSON.stringify({
      source: this.source,
      options: this.options,
      items: this.items,
      respondents: this.respondents,
      answers: this.answers,
      activeRespondentId: this.activeRespondentId,
    }));
  }

  /**
   * Tolerante Deserialisierung: unbekannte Felder fliegen raus, fehlende
   * bekommen Defaults, Antworten zu unbekannten IDs werden verworfen.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const level = LEVELS.includes(d.source?.level) ? d.source.level : 'need';
    s.source = {
      instanceId: typeof d.source?.instanceId === 'string' ? d.source.instanceId : null,
      level,
    };
    s.options = { importance: d.options?.importance !== false };

    s.items = Array.isArray(d.items)
      ? d.items.filter((i) => i && typeof i.id === 'string').map((i) => ({
        id: i.id,
        nodeId: typeof i.nodeId === 'string' ? i.nodeId : null,
        label: typeof i.label === 'string' ? i.label : '',
        path: typeof i.path === 'string' ? i.path : '',
        missing: Boolean(i.missing),
      }))
      : [];

    s.respondents = Array.isArray(d.respondents)
      ? d.respondents.filter((r) => r && typeof r.id === 'string')
        .map((r) => ({ id: r.id, name: typeof r.name === 'string' ? r.name : '' }))
      : [];

    const itemIds = new Set(s.items.map((i) => i.id));
    const respIds = new Set(s.respondents.map((r) => r.id));
    s.answers = {};
    for (const [rid, byItem] of Object.entries(d.answers || {})) {
      if (!respIds.has(rid) || !byItem || typeof byItem !== 'object') continue;
      const kept = {};
      for (const [iid, a] of Object.entries(byItem)) {
        if (!itemIds.has(iid) || !a || typeof a !== 'object') continue;
        kept[iid] = {
          f: Number.isInteger(a.f) ? a.f : null,
          d: Number.isInteger(a.d) ? a.d : null,
          w: Number.isInteger(a.w) ? a.w : null,
        };
      }
      s.answers[rid] = kept;
    }

    s.activeRespondentId = respIds.has(d.activeRespondentId)
      ? d.activeRespondentId
      : (s.respondents.length ? s.respondents[0].id : null);

    return s;
  }
}
