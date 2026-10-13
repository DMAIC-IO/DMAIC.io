/**
 * D.Mike — Stakeholder Analysis Module (stakeholder-analysis.js)
 * Define phase: identify, assess, and plan communication with stakeholders
 * using the Power/Interest matrix.
 *
 * Spec: docs/modules/STAKEHOLDER-ANALYSIS.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Beteiligte anlegen,
 *   ändern und entfernen — Name, Rolle, Macht, Interesse, Haltung, Kategorie
 *   und Notiz. Der Oberfläche bleiben der Formulardialog samt seinem
 *   Entwurf, die Rückfrage vor dem Löschen und die Maus-Gestik des
 *   verschiebbaren Fensters.
 */

import { createModule } from '../../core/template-module.js';
import { draggablePopout } from '../../ui/draggable-popout.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId } from '../../core/agent/agent-argcheck.js';
import {
  Stakeholder, State, QUAD_ORDER, SUPPORT_VALUES, CATEGORY_VALUES,
} from './stakeholder-analysis-model.js';

// Macht und Interesse laufen von 1 bis 5. `requireIndex` passt darauf nicht:
// es ist 0-basiert, meldete „allowed: 0..5" und ließe die 0 durch, die das
// Model still auf 1 klemmte (Ruling 51). Die erklärte Wertemenge ist der
// richtige Prüfer.
const LEVELS = [1, 2, 3, 4, 5];

const AVATAR_COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#eab308', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1',
];

const STRATEGY_COLOR = {
  'manage-closely': 'var(--color-error)',
  'keep-satisfied': 'var(--color-warning)',
  'keep-informed': 'var(--color-accent)',
  'monitor': 'var(--color-success)',
};

const STRATEGY_BG = {
  'manage-closely': 'rgba(239, 68, 68, 0.1)',
  'keep-satisfied': 'rgba(234, 179, 8, 0.1)',
  'keep-informed': 'rgba(59, 130, 246, 0.1)',
  'monitor': 'rgba(34, 197, 94, 0.1)',
};

const COMM_PLANS = {
  'manage-closely': { freq: 'commWeekly', channel: 'commPersonal', content: 'commContentDetailed', action: 'commActionEngage' },
  'keep-satisfied': { freq: 'commBiweekly', channel: 'commEmail', content: 'commContentSummary', action: 'commActionInform' },
  'keep-informed': { freq: 'commMonthly', channel: 'commNewsletter', content: 'commContentProgress', action: 'commActionFeedback' },
  'monitor': { freq: 'commQuarterly', channel: 'commIntranet', content: 'commContentGeneral', action: 'commActionObserve' },
};

/** PascalCase a kebab/single word, e.g. 'manage-closely' → 'ManageClosely'. */
function pascal(s) {
  return String(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Capitalise the first letter only (mirrors the legacy key construction 1:1). */
function capFirst(s) {
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function avatarColorOf(name) {
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsOf(name) {
  return String(name || '').split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 2);
}

export default createModule({
  config: {
    id: 'stakeholder-analysis',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.stakeholder-analysis',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    // Resolve a module-scoped key, returning the prefixed key string when missing —
    // exactly like the legacy renderer (so extended support/category values render
    // identically to before the migration).
    const _raw = (key) => module._context.i18n.t(`modules.stakeholder-analysis.${  key}`);
    return {
      ...agentReadMixin(module),

      // ── Draggable popout shell (drag + position handlers) ──
      ...draggablePopout(),

      // ── Transient modal state (NOT persisted) ──
      modalOpen: false,
      modalEditId: null,
      modalData: { name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '' },

      // ── View transforms: avatars / initials ──
      /** @noagent view transform: die Farbe des Namenskürzels. */
      avatarColor: (name) => avatarColorOf(name),
      /** @noagent view transform: das Namenskürzel. */
      initials: (name) => initialsOf(name),

      // ── View transforms: quadrant / strategy ──
      /** @noagent view transform: der übersetzte Name eines Quadranten. */
      quadLabel: (q) => _t(`quad${  pascal(q)}`),
      /** @noagent view transform: der Erklärsatz eines Quadranten. */
      quadDesc: (q) => _t(`quad${  pascal(q)  }Desc`),
      /** @noagent view transform: die Farbe eines Quadranten. */
      strategyColor: (q) => STRATEGY_COLOR[q],
      /** @noagent view transform: die Hintergrundfarbe eines Quadranten. */
      strategyBg: (q) => STRATEGY_BG[q],
      /** @noagent view transform: Farbe und Hintergrund als Stilangabe. */
      strategyStyle: (q) => `background:${  STRATEGY_BG[q]  };color:${  STRATEGY_COLOR[q]}`,

      // ── View transforms: support (ternary mirrors legacy: unknown → critic styling) ──
      /** @noagent view transform: die Haltung als Balkenlänge. */
      supportPct: (s) => (s === 'supporter' ? 100 : s === 'neutral' ? 50 : 20),
      /** @noagent view transform: die Farbe der Haltung. */
      supportColor: (s) => (s === 'supporter' ? 'var(--color-success)' : s === 'neutral' ? 'var(--color-warning)' : 'var(--color-error)'),
      /** @noagent view transform: der übersetzte Name der Haltung. */
      supportLabel: (s) => _raw(`support${  capFirst(s)}`),
      /** @noagent view transform: die Klasse der Haltungsmarke. */
      supportBadgeClass: (s) => `sha__support-badge sha__support-badge--${  s}`,

      // ── View transforms: category (mirrors legacy key construction 1:1) ──
      /** @noagent view transform: der übersetzte Name der Kategorie. */
      catLabel: (c) => _raw(`category${  capFirst(c)}`),

      // ── View transforms: meters / dots / styles ──
      /** @noagent view transform: Breite und Farbe eines Balkens. */
      meterStyle: (pct, bg) => `width:${  pct  }%;background:${  bg}`,
      /** @noagent view transform: die Klasse eines Stufenpunkts. */
      dotClass: (i, level) => `sha__level-dot${  i <= level ? ' sha__level-dot--filled' : ''}`,
      /** @noagent view transform: die Rolle, oder ein Gedankenstrich. */
      roleText: (sh) => sh.role || '—',

      // ── Axis labels (arrow rendered as icon in the template, not text) ──
      /** @noagent view transform: die Beschriftung der Hochachse. */
      axisYLabel() { return this.t('axisPower'); },
      /** @noagent view transform: die Beschriftung der Querachse. */
      axisXLabel() { return this.t('axisInterest'); },

      // ── Grouped / sorted lists (read from reactive model) ──
      /** @noagent view transform: die Beteiligten eines Quadranten. */
      chipsFor(quad) {
        return this.model.stakeholders.filter((s) => s.quadrant === quad);
      },
      /** @noagent view transform: die Beteiligten nach Quadrantenrang. */
      sortedStakeholders() {
        return [...this.model.stakeholders].sort(
          (a, b) => QUAD_ORDER.indexOf(a.quadrant) - QUAD_ORDER.indexOf(b.quadrant)
        );
      },

      // ── Communication plan ──
      /** @noagent view transform: die empfohlene Taktung. */
      commFreq(sh) { return this.t(COMM_PLANS[sh.quadrant].freq); },
      /** @noagent view transform: der empfohlene Weg. */
      commChannel(sh) { return this.t(COMM_PLANS[sh.quadrant].channel); },
      /** @noagent view transform: der empfohlene Inhalt. */
      commContent(sh) { return this.t(COMM_PLANS[sh.quadrant].content); },
      /** @noagent view transform: die empfohlene Vorgehensweise. */
      commAction(sh) { return this.t(COMM_PLANS[sh.quadrant].action); },
      /** @noagent view transform: Quadrant und Kategorie in einer Zeile. */
      commQuadLine(sh) {
        return `${this.quadLabel(sh.quadrant)  } · ${  this.catLabel(sh.category)}`;
      },

      // ── Modal ──
      /** @noagent view transform: die Überschrift des Formulars. */
      modalTitle() {
        return this.modalEditId ? this.t('editStakeholder') : this.t('addStakeholder');
      },
      /**
       * @noagent öffnet den Formulardialog und füllt seinen Entwurf; ein
       * Agent darf keinen Dialog öffnen — er blockierte den Stapel (E3).
       */
      openModal(existing) {
        this.modalEditId = existing ? existing.id : null;
        const src = existing || { name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '' };
        this.modalData = {
          name: src.name, role: src.role,
          power: src.power, interest: src.interest,
          support: src.support, category: src.category, notes: src.notes,
        };
        this.popoutResetPosition();
        this.modalOpen = true;
      },
      /** @noagent schließt den Formulardialog. */
      closeModal() {
        this.modalOpen = false;
        this.popoutResetPosition();
      },
      /**
       * @noagent schließt den Formulardialog ab. Die Schieberegler liefern
       * ihre Stufen als Zeichenkette, deshalb das `parseInt` hier; geschrieben
       * wird über `addStakeholder` bzw. `updateStakeholder`, dieselben Senken
       * wie die der Agentenfläche.
       */
      saveModal() {
        const d = this.modalData;
        const data = {
          name: d.name || '',
          role: d.role || '',
          power: parseInt(d.power, 10),
          interest: parseInt(d.interest, 10),
          support: d.support,
          category: d.category,
          notes: d.notes || '',
        };
        const known = this.modalEditId
          && this.model.stakeholders.some((s) => s.id === this.modalEditId);
        const written = known
          ? this.updateStakeholder(this.modalEditId, data)
          : this.addStakeholder(data) !== null;
        // Ein leerer Name ist die fachliche Absage beider Senken; das Formular
        // bleibt dann offen, damit der Nutzer ihn nachtragen kann.
        if (!written) return;
        this.closeModal();
      },

      /**
       * @noagent fragt vor dem Löschen zurück; ein Agent darf keine Rückfrage
       * auslösen — er blockierte den Stapel (E3). Delegiert an
       * `removeStakeholder`.
       */
      async deleteStakeholder(sh) {
        const ok = await module._context.confirmPopout(
          this.t('deleteConfirm', { name: sh.name }), { danger: true }
        );
        if (!ok) return;
        if (this.model.stakeholders.some((s) => s.id === sh.id)) this.removeStakeholder(sh.id);
      },

      /**
       * Legt einen Beteiligten an.
       * @agent
       * @param {object} data der Beteiligte: `name` (nötig), und wahlweise
       *   `role`, `power`, `interest`, `support`, `category` und `notes`
       * @returns {string|null} die id des neuen Beteiligten, oder null wenn der
       *   Name leer war und nichts angelegt wurde
       * @throws {Error} wenn `data` kein Objekt ist, `power` oder `interest`
       *   keine ganze Zahl von 1 bis 5 ist oder `support` oder `category`
       *   einen Wert ausserhalb ihrer Wertemenge tragen
       */
      addStakeholder(data) {
        this._requireStakeholderData(data);
        const name = String(data.name ?? '').trim();
        // Ein leerer Name ist eine fachliche Absage, kein ungültiges Argument:
        // das Formular verwirft ihn genauso und legt nichts an.
        if (!name) return null;
        const sh = Stakeholder.fromJSON({
          name,
          role: String(data.role ?? '').trim(),
          power: data.power ?? 3,
          interest: data.interest ?? 3,
          support: data.support ?? 'neutral',
          category: data.category ?? 'intern',
          notes: String(data.notes ?? '').trim(),
        });
        this.model.stakeholders.push(sh);
        return sh.id;
      },

      /**
       * Ändert die genannten Felder eines Beteiligten; alle übrigen bleiben
       * stehen.
       * @agent
       * @param {string} id id des Beteiligten
       * @param {object} data die zu ändernden Felder — `name`, `role`,
       *   `power`, `interest`, `support`, `category` oder `notes`
       * @returns {boolean} true wenn geändert wurde, false wenn ein
       *   mitgegebener Name leer war und alles stehen blieb
       * @throws {Error} wenn kein Beteiligter diese id trägt, `data` kein
       *   Objekt ist, `power` oder `interest` keine ganze Zahl von 1 bis 5 ist
       *   oder `support` oder `category` einen Wert ausserhalb ihrer
       *   Wertemenge tragen
       */
      updateStakeholder(id, data) {
        requireKnownId('id', id, this.model.stakeholders.map((s) => s.id));
        this._requireStakeholderData(data);
        const sh = this.model.stakeholders.find((s) => s.id === id);
        if (data.name !== undefined) {
          const name = String(data.name).trim();
          // Siehe `addStakeholder`: ein leerer Name ist eine Absage.
          if (!name) return false;
          sh.name = name;
        }
        if (data.role !== undefined) sh.role = String(data.role).trim();
        if (data.power !== undefined) sh.power = data.power;
        if (data.interest !== undefined) sh.interest = data.interest;
        if (data.support !== undefined) sh.support = data.support;
        if (data.category !== undefined) sh.category = data.category;
        if (data.notes !== undefined) sh.notes = String(data.notes).trim();
        return true;
      },

      /**
       * Entfernt einen Beteiligten.
       * @agent
       * @param {string} id id des Beteiligten
       * @returns {void}
       * @throws {Error} wenn kein Beteiligter diese id trägt
       */
      removeStakeholder(id) {
        requireKnownId('id', id, this.model.stakeholders.map((s) => s.id));
        const idx = this.model.stakeholders.findIndex((s) => s.id === id);
        this.model.stakeholders.splice(idx, 1);
      },

      /**
       * Prüft die Wertemengen eines Beteiligten-Objekts. Ein fehlendes
       * Argument (`undefined`) ist ein Fehler und kein leeres Objekt — sonst
       * legte ein Aufruf ohne Argument stillschweigend nichts an und meldete
       * Erfolg (Ruling 55).
       */
      _requireStakeholderData(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error(`invalid data ${JSON.stringify(data)}; allowed: an object with at least a name`);
        }
        if (data.power !== undefined) requireEnum('power', data.power, LEVELS);
        if (data.interest !== undefined) requireEnum('interest', data.interest, LEVELS);
        if (data.support !== undefined) requireEnum('support', data.support, SUPPORT_VALUES);
        if (data.category !== undefined) requireEnum('category', data.category, CATEGORY_VALUES);
      },
    };
  },
});
