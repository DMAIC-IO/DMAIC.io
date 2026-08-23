/**
 * D.Mike — Stakeholder Analysis Module (stakeholder-analysis.js)
 * Define phase: identify, assess, and plan communication with stakeholders
 * using the Power/Interest matrix.
 *
 * Spec: docs/modules/STAKEHOLDER-ANALYSIS.md
 */

import { createModule } from '../../core/template-module.js';
import { draggablePopout } from '../../ui/draggable-popout.js';
import { Stakeholder, State, QUAD_ORDER } from './stakeholder-analysis-model.js';

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
      // ── Draggable popout shell (drag + position handlers) ──
      ...draggablePopout(),

      // ── Transient modal state (NOT persisted) ──
      modalOpen: false,
      modalEditId: null,
      modalData: { name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '' },

      // ── View transforms: avatars / initials ──
      avatarColor: (name) => avatarColorOf(name),
      initials: (name) => initialsOf(name),

      // ── View transforms: quadrant / strategy ──
      quadLabel: (q) => _t(`quad${  pascal(q)}`),
      quadDesc: (q) => _t(`quad${  pascal(q)  }Desc`),
      strategyColor: (q) => STRATEGY_COLOR[q],
      strategyBg: (q) => STRATEGY_BG[q],
      strategyStyle: (q) => `background:${  STRATEGY_BG[q]  };color:${  STRATEGY_COLOR[q]}`,

      // ── View transforms: support (ternary mirrors legacy: unknown → critic styling) ──
      supportPct: (s) => (s === 'supporter' ? 100 : s === 'neutral' ? 50 : 20),
      supportColor: (s) => (s === 'supporter' ? 'var(--color-success)' : s === 'neutral' ? 'var(--color-warning)' : 'var(--color-error)'),
      supportLabel: (s) => _raw(`support${  capFirst(s)}`),
      supportBadgeClass: (s) => `sha__support-badge sha__support-badge--${  s}`,

      // ── View transforms: category (mirrors legacy key construction 1:1) ──
      catLabel: (c) => _raw(`category${  capFirst(c)}`),

      // ── View transforms: meters / dots / styles ──
      meterStyle: (pct, bg) => `width:${  pct  }%;background:${  bg}`,
      dotClass: (i, level) => `sha__level-dot${  i <= level ? ' sha__level-dot--filled' : ''}`,
      roleText: (sh) => sh.role || '—',

      // ── Axis labels (arrow rendered as icon in the template, not text) ──
      axisYLabel() { return this.t('axisPower'); },
      axisXLabel() { return this.t('axisInterest'); },

      // ── Grouped / sorted lists (read from reactive model) ──
      chipsFor(quad) {
        return this.model.stakeholders.filter((s) => s.quadrant === quad);
      },
      sortedStakeholders() {
        return [...this.model.stakeholders].sort(
          (a, b) => QUAD_ORDER.indexOf(a.quadrant) - QUAD_ORDER.indexOf(b.quadrant)
        );
      },

      // ── Communication plan ──
      commFreq(sh) { return this.t(COMM_PLANS[sh.quadrant].freq); },
      commChannel(sh) { return this.t(COMM_PLANS[sh.quadrant].channel); },
      commContent(sh) { return this.t(COMM_PLANS[sh.quadrant].content); },
      commAction(sh) { return this.t(COMM_PLANS[sh.quadrant].action); },
      commQuadLine(sh) {
        return `${this.quadLabel(sh.quadrant)  } · ${  this.catLabel(sh.category)}`;
      },

      // ── Modal ──
      modalTitle() {
        return this.modalEditId ? this.t('editStakeholder') : this.t('addStakeholder');
      },
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
      closeModal() {
        this.modalOpen = false;
        this.popoutResetPosition();
      },
      saveModal() {
        const d = this.modalData;
        const name = (d.name || '').trim();
        if (!name) return;
        const sh = Stakeholder.fromJSON({
          id: this.modalEditId || undefined,
          name,
          role: (d.role || '').trim(),
          power: parseInt(d.power, 10),
          interest: parseInt(d.interest, 10),
          support: d.support,
          category: d.category,
          notes: (d.notes || '').trim(),
        });
        if (this.modalEditId) {
          const idx = this.model.stakeholders.findIndex((s) => s.id === this.modalEditId);
          if (idx !== -1) this.model.stakeholders.splice(idx, 1, sh);
          else this.model.stakeholders.push(sh);
        } else {
          this.model.stakeholders.push(sh);
        }
        this.closeModal();
      },
      async deleteStakeholder(sh) {
        const ok = await module._context.confirmPopout(
          this.t('deleteConfirm', { name: sh.name }), { danger: true }
        );
        if (!ok) return;
        const idx = this.model.stakeholders.findIndex((s) => s.id === sh.id);
        if (idx !== -1) this.model.stakeholders.splice(idx, 1);
      },
    };
  },
});
