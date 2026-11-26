/**
 * D.Mike — RACI-Matrix: Viewmodel.
 *
 * Inhalt, Kommandos, Invarianten und die Prüfung je Aktivität liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Anlegen
 * läuft über zwei Formulare (`x-command-form`), Rolle und Löschen über
 * `x-command`, Umsortieren über die Geste `reorder`. Hier bleiben die
 * Anzeige (Rollenklassen, Warnsymbole, Beschriftungen) und das
 * Inline-Umbenennen: es hält Art, id und Entwurf im UI-State und übernimmt
 * den Namen über `renameActivity` bzw. `renameStakeholder`. Exporte: die
 * Matrix als Tabelle (CSV, XLSX).
 */
import { createModule } from '../../../core/template-module.js';
import descriptor from '../module.js';
import { State, ROLES } from '../domain/model.js';
import { cellKey } from '../domain/check.js';
import { reorder } from '../interaction/reorder.js';
import { toRows } from '../io/table.js';
import { UiState } from './state.js';

/** Höchstlänge einer neuen Aktivität bzw. eines neuen Stakeholders (nur `maxlength` der Eingaben). */
const ACTIVITY_MAXLEN = 200;
const STAKEHOLDER_MAXLEN = 120;

/** @typedef {{ id: string, name: string }} Entry */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [reorder],
  /** @type {import('./state.types.js').RaciMatrixExports} */
  exports: {
    fileName: 'raci-matrix',
    table() { return toRows(this.model, this.t); },
  },
  /** @type {import('./state.types.js').RaciMatrixViewFn} */
  view(ctx) {
    /** Name des Eintrags beim Öffnen des Umbenennen-Felds. @type {string|null} */
    let openedName = null;
    return {
      /** Die vier Rollen in Zyklusreihenfolge. @returns {ReadonlyArray<string>} */
      get roles() { return ROLES; },
      /** Höchstlänge einer Aktivität. */
      get activityMaxlen() { return ACTIVITY_MAXLEN; },
      /** Höchstlänge eines Stakeholders. */
      get stakeholderMaxlen() { return STAKEHOLDER_MAXLEN; },

      /** @param {string} r @returns {string} „R = Responsible (führt aus)“ */
      legendLabel(r) { return `${r} = ${this.t(`role${r}`)}`; },
      /** Farbklasse einer Rolle; ohne Rolle leer. @param {string} r @returns {string} */
      roleClass(r) { return ROLES.includes(r) ? `raci__role--${r}` : ''; },
      /** Rolle der Zelle oder leer. @param {Entry} act @param {Entry} sh @returns {string} */
      roleOf(act, sh) { return this.model.assignments[cellKey(act.id, sh.id)] ?? ''; },
      /** Schlüssel der Zelle (für `:key`). @param {Entry} act @param {Entry} sh @returns {string} */
      cellKeyOf(act, sh) { return cellKey(act.id, sh.id); },
      /** @param {string} key @returns {string} „+ Aktivität“ */
      addLabel(key) { return `+ ${this.t(key)}`; },
      /** Eckkopf „Aktivität \ Stakeholder“. */
      get cornerLabel() { return `${this.t('activity')} \\ ${this.t('stakeholder')}`; },
      /** @param {string} name @returns {string} „Name — Doppelklick zum Umbenennen“ */
      renameTitle(name) { return `${name} — ${this.t('renameHint')}`; },

      // ─── Prüfung ──────────────────────────────────────────
      /** Die Ansicht zeigt Befunde erst, wenn es Aktivitäten und Stakeholder gibt. */
      get warningsActive() { return this.model.activities.length > 0 && this.model.stakeholders.length > 0; },
      /**
       * Der Befund einer Aktivität, wenn die Ansicht ihn zeigt.
       * @param {Entry} act @returns {{ activityId: string, issues: string[] }|null}
       */
      warningFor(act) {
        if (!this.warningsActive) return null;
        const list = this.warnings;
        return Array.isArray(list) ? (list.find((w) => w.activityId === act.id) ?? null) : null;
      },
      /** @param {Entry} act @returns {boolean} */
      hasWarning(act) { return this.warningFor(act) !== null; },
      /** Übersetzte Befunde, mit „, “ verbunden. @param {Entry} act @returns {string} */
      warnTitle(act) {
        const w = this.warningFor(act);
        return w ? w.issues.map((i) => this.t(`warn_${i}`)).join(', ') : '';
      },
      /**
       * Klassen einer Zeile: Warnrand und Einfügemarke der Geste.
       * @param {Entry} act @param {number} idx @returns {string}
       */
      rowClass(act, idx) {
        const p = this.state.dropPreview;
        const cls = [];
        if (this.hasWarning(act)) cls.push('raci__row--warn');
        if (p && p.group === 'activities' && p.index === idx) cls.push('dmike-table__row--drop-target');
        return cls.join(' ');
      },

      // ─── Umbenennen ───────────────────────────────────────
      /** @param {'activity'|'stakeholder'} kind @param {string} id @returns {boolean} */
      isRenaming(kind, id) {
        const r = this.state.renaming;
        return r !== null && r.kind === kind && r.id === id;
      },
      /**
       * Der Eintrag des offenen Umbenennen-Felds, oder null.
       * @returns {Entry|null}
       */
      get renameTarget() {
        const r = this.state.renaming;
        if (!r) return null;
        const list = r.kind === 'activity' ? this.model.activities : this.model.stakeholders;
        return list.find((x) => x.id === r.id) ?? null;
      },
      /**
       * Umbenennen-Feld öffnen, mit dem Namen füllen, fokussieren und markieren.
       * @param {'activity'|'stakeholder'} kind @param {string} id
       */
      startRename(kind, id) {
        const list = kind === 'activity' ? this.model.activities : this.model.stakeholders;
        const entry = list.find((x) => x.id === id);
        if (!entry) return;
        openedName = entry.name;
        this.state.renameDraft = entry.name;
        this.state.renaming = { kind, id };
        this.$nextTick(() => {
          const input = /** @type {HTMLInputElement|null} */ (this.$root.querySelector('.raci__rename-input'));
          if (input) { input.focus(); input.select(); }
        });
      },
      /** Tasten im Umbenennen-Feld: Enter übernimmt (Feld verlassen), Esc verwirft. @param {KeyboardEvent} event */
      onRenameKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          /** @type {HTMLElement} */ (event.target).blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.state.renaming = null;
        }
        event.stopPropagation();
      },
      /**
       * Den Entwurf übernehmen. Nichts zu tun, wenn der Eintrag fehlt, der
       * Entwurf leer ist oder dem (getrimmten) Namen gleicht — ein Altname mit
       * Rand-Leerzeichen bleibt dann wörtlich stehen; sonst ein Kommando.
       */
      commitRename() {
        const r = this.state.renaming;
        if (!r) return;
        const entry = this.renameTarget;
        const draft = String(this.state.renameDraft ?? '').trim();
        this.state.renaming = null;
        if (!entry || draft === '' || draft === entry.name.trim()) return;
        try {
          if (r.kind === 'activity') this.model.renameActivity({ activityId: r.id, value: draft });
          else this.model.renameStakeholder({ stakeholderId: r.id, value: draft });
        } catch (err) {
          console.warn('raci-matrix: Name nicht übernommen', err);
          ctx.notify(this.t('renameFailed'), 'error');
        }
      },

      /**
       * Verschwindet der umbenannte Eintrag oder ändert sich sein Name von
       * außen (Agent, Rückgängig, Löschen), schließt das Feld ohne zu
       * übernehmen.
       */
      init() {
        this.$watch(() => {
          const r = this.state.renaming;
          if (!r) return '';
          const entry = this.renameTarget;
          return entry ? `${r.kind}:${r.id}:${entry.name}` : `${r.kind}:${r.id}:`;
        }, () => {
          if (!this.state.renaming) return;
          const entry = this.renameTarget;
          if (!entry || entry.name !== openedName) this.state.renaming = null;
        });
      },
    };
  },
});
