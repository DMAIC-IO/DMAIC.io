import { createModule } from '../../core/template-module.js';
import { State, Lesson, Action } from './lessons-learned-model.js';
import { resolveEpochOffset } from '../../core/date-offset.js';
import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';

const CATEGORY_KEYS = ['success', 'problem', 'improve'];
const IMPACT_KEYS = ['high', 'medium', 'low'];

const m = createModule({
  config: {
    id: 'lessons-learned',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.lessons-learned',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.json', title: 'export.json', onClick: (d) => d.exportJSON() },
      ] },
      { icon: 'action.upload', title: 'importJSON', onClick: (d) => d.openImport() },
      { icon: 'action.add', title: 'addLesson', variant: 'primary', onClick: (d) => d.openAddModal() },
    ],
  },
  Model: State,
  data(module, _t) {
    return {
      filter: 'all',
      search: '',
      openCards: [],
      lessonDraft: {
        title: '',
        category: 'success',
        phase: 'control',
        impact: 'medium',
        owner: '',
        description: '',
        rootCause: '',
        recommendation: '',
        actions: [],
      },
      draftActionInput: '',

      // Option lists for the in-template form selects.
      categoryOptions: CATEGORY_KEYS,
      impactOptions: IMPACT_KEYS,

      // Phase options follow the active cycle (label from global phases.*).
      phaseOptions() {
        const cycleId = module._context.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
        return getPhaseIds(cycleId).map(k => ({
          value: k,
          label: module._context.i18n.t(`phases.${  k}`),
        }));
      },

      // ── Draft action-tag helpers (modal form) ─────────────────
      addDraftAction() {
        const val = (this.draftActionInput || '').trim();
        if (!val) return;
        this.lessonDraft.actions.push({ text: val, done: false, uid: Lesson.uid() });
        this.draftActionInput = '';
      },

      removeDraftAction(uid) {
        this.lessonDraft.actions = this.lessonDraft.actions.filter(a => a.uid !== uid);
      },

      // Delegated remove: a per-tag @click inside the borrowed x-for cannot
      // resolve component methods in Alpine CSP (scope chain breaks across the
      // borrow). A single handler on the container — outside the x-for — works.
      onActionTagsClick(event) {
        const btn = event.target.closest('.ll__action-tag-remove');
        if (!btn) return;
        this.removeDraftAction(btn.dataset.uid);
      },

      stats() {
        return this.model.computeStats();
      },

      filteredLessons() {
        let list = [...this.model.lessons];
        if (this.filter !== 'all') {
          list = list.filter(l => l.category === this.filter);
        }
        const q = this.search.toLowerCase().trim();
        if (q) {
          list = list.filter(l =>
            (l.title || '').toLowerCase().includes(q) ||
            (l.description || '').toLowerCase().includes(q) ||
            (l.owner || '').toLowerCase().includes(q) ||
            (l.recommendation || '').toLowerCase().includes(q) ||
            (l.rootCause || '').toLowerCase().includes(q)
          );
        }
        return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      },

      catLabel: (k) => _t(`cat_${  k}`),
      impactLabel: (k) => _t(`impact_${  k}`),
      phaseLabel: (p) => _t(`phase_${  p}`),

      formatDate(ts) {
        if (!ts) return '';
        const lang = module._context.language === 'de' ? 'de-DE' : 'en-US';
        return new Date(ts).toLocaleDateString(lang);
      },

      actionsSummary(lesson) {
        const done = lesson.actions.filter(a => a.done).length;
        const total = lesson.actions.length;
        return total > 0 ? `${done}/${total} Actions` : '';
      },

      setFilter(category) {
        this.filter = category;
      },

      chevronIcon(lesson) {
        return this.openCards.includes(lesson.id) ? 'nav.expand-down' : 'nav.expand-right';
      },

      toggleCard(id) {
        const idx = this.openCards.indexOf(id);
        if (idx === -1) {
          this.openCards.push(id);
        } else {
          this.openCards.splice(idx, 1);
        }
      },

      toggleAction(lesson, idx) {
        if (lesson.actions[idx]) {
          lesson.actions[idx].done = !lesson.actions[idx].done;
        }
      },

      deleteLesson(lesson) {
        const self = this;
        module._context.confirmPopout(_t('deleteConfirm'), { danger: true }).then(confirmed => {
          if (!confirmed) return;
          const idx = self.model.lessons.findIndex(l => l.id === lesson.id);
          if (idx !== -1) {
            self.model.lessons.splice(idx, 1);
            self.openCards = self.openCards.filter(id => id !== lesson.id);
          }
        });
      },

      // Reset the draft, optionally seeding it from an existing lesson.
      _resetDraft(lesson) {
        const cyclePhases = this.phaseOptions().map(o => o.value);
        const defaultPhase = lesson?.phase || cyclePhases[cyclePhases.length - 1] || 'control';
        this.lessonDraft.title = lesson?.title || '';
        this.lessonDraft.category = lesson?.category || 'success';
        this.lessonDraft.phase = defaultPhase;
        this.lessonDraft.impact = lesson?.impact || 'medium';
        this.lessonDraft.owner = lesson?.owner || '';
        this.lessonDraft.description = lesson?.description || '';
        this.lessonDraft.rootCause = lesson?.rootCause || '';
        this.lessonDraft.recommendation = lesson?.recommendation || '';
        this.lessonDraft.actions = (lesson?.actions || []).map(a => ({ text: a.text, done: a.done, uid: Lesson.uid() }));
        this.draftActionInput = '';
      },

      async openAddModal() {
        const self = this;
        this._resetDraft(null);
        await module._context.showModal.form(
          _t('addTitle'),
          this.$refs.lessonForm,
          {
            confirmLabel: _t('common.save'),
            cancelLabel: _t('common.cancel'),
            onMount: (modalEl) => {
              // Focus synchronously — the borrowed Alpine node is already in the
              // DOM here. A deferred focus would steal focus mid-fill and corrupt
              // x-model inputs (e.g. the action-input field).
              modalEl.querySelector('[data-field="title"]')?.focus();
            },
            onConfirm: (modalEl) => {
              const title = (self.lessonDraft.title || '').trim();
              if (!title) {
                modalEl.querySelector('[data-field="title"]')?.focus();
                return false;
              }
              const lessonModel = Lesson.fromJSON({
                id: Lesson.uid(),
                title,
                category: self.lessonDraft.category || 'success',
                phase: self.lessonDraft.phase || 'control',
                impact: self.lessonDraft.impact || 'medium',
                owner: (self.lessonDraft.owner || '').trim(),
                description: (self.lessonDraft.description || '').trim(),
                rootCause: (self.lessonDraft.rootCause || '').trim(),
                recommendation: (self.lessonDraft.recommendation || '').trim(),
                actions: self.lessonDraft.actions.map(a => ({ text: a.text, done: a.done })),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              self.model.lessons.push(lessonModel);
            },
          }
        );
      },

      async openEditModal(lesson) {
        const self = this;
        this._resetDraft(lesson);
        await module._context.showModal.form(
          _t('editTitle'),
          this.$refs.lessonForm,
          {
            confirmLabel: _t('common.save'),
            cancelLabel: _t('common.cancel'),
            onMount: (modalEl) => {
              // Focus synchronously — the borrowed Alpine node is already in the
              // DOM here. A deferred focus would steal focus mid-fill and corrupt
              // x-model inputs (e.g. the action-input field).
              modalEl.querySelector('[data-field="title"]')?.focus();
            },
            onConfirm: (modalEl) => {
              const title = (self.lessonDraft.title || '').trim();
              if (!title) {
                modalEl.querySelector('[data-field="title"]')?.focus();
                return false;
              }
              const existing = self.model.lessons.find(l => l.id === lesson.id);
              if (!existing) return;
              existing.title = title;
              existing.category = self.lessonDraft.category || 'success';
              existing.phase = self.lessonDraft.phase || 'control';
              existing.impact = self.lessonDraft.impact || 'medium';
              existing.owner = (self.lessonDraft.owner || '').trim();
              existing.description = (self.lessonDraft.description || '').trim();
              existing.rootCause = (self.lessonDraft.rootCause || '').trim();
              existing.recommendation = (self.lessonDraft.recommendation || '').trim();
              existing.actions = self.lessonDraft.actions.map(a => Action.fromJSON(a));
              existing.updatedAt = Date.now();
            },
          }
        );
      },

      exportJSON() {
        const data = this.model.lessons.map(l => l.toJSON());
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `lessons-learned_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },

      openImport() {
        module._container.querySelector('[data-ref="fileImport"]')?.click();
      },

      handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const self = this;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
              for (const l of data) {
                self.model.lessons.push(Lesson.fromJSON(l));
              }
              module._context.notify?.(_t('importSuccess', { count: data.length }));
            }
          } catch (_err) {
            module._context.notify?.(_t('importError'));
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      },
    };
  },
});

const origLoad = m.loadExample;
if (origLoad) {
  m.loadExample = async function (payload) {
    if (!payload?.data) return;
    const data = JSON.parse(JSON.stringify(payload.data));
    if (Array.isArray(data.lessons)) {
      data.lessons.forEach(l => {
        l.createdAt = resolveEpochOffset(l.createdAt);
      });
    }
    return origLoad.call(this, { ...payload, data });
  };
}

export default m;
