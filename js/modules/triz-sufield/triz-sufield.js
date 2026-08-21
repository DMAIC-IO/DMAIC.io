import { createModule } from '../../core/template-module.js';
import { State, diagnose } from './triz-sufield-model.js';

//test
const DATA_PATH = 'js/modules/triz-sufield/data/standards.json';
let _dataPromise = null;
function loadData() {
  if (_dataPromise) return _dataPromise;
  _dataPromise = fetch(DATA_PATH, { cache: 'no-cache' })
    .then(r => r.json())
    .then(d => d.standards);
  return _dataPromise;
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)  }…` : str;
}

export default createModule({
  config: {
    id: 'triz-sufield',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-sufield',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      FIELDS: ['M', 'A', 'T', 'C', 'E', 'Mg'],
      LINKS: ['useful', 'insufficient', 'excessive', 'harmful', 'missing'],
      standards: null,
      classList: [],

      // ── Diagnosis ──
      diagSituation() {
        const s = this.model;
        return diagnose(s.s1, s.s2, s.field, s.link).situation;
      },
      suggestedClassesLabel() {
        return `${_t('suggestedClasses')  }:`;
      },
      suggestedClassList() {
        const s = this.model;
        return diagnose(s.s1, s.s2, s.field, s.link).suggestedClasses;
      },

      // ── SVG diagram ──
      diagramEdgeClass() {
        const link = this.model.link;
        return link ? `triz-sf__edge--${  link}` : 'triz-sf__edge--empty';
      },
      diagramEdgeColor() {
        const link = this.model.link;
        if (link === 'useful') return 'var(--color-success, #2ea043)';
        if (link === 'insufficient') return 'var(--color-warning, #d29922)';
        if (link === 'excessive') return 'var(--color-accent, #2e7dd9)';
        if (link === 'harmful') return 'var(--color-error, #c93c3c)';
        return 'var(--color-text-tertiary)';
      },
      diagramDashArray() {
        const link = this.model.link;
        if (link === 'insufficient') return '6 4';
        if (link === 'harmful') return '2 4';
        if (link === 'missing') return '2 6';
        return null;
      },
      diagramMarkerEnd() {
        return this.model.link === 'missing' ? null : 'url(#triz-sf-arrow)';
      },
      diagramSideDash() {
        return this.model.field ? '0' : '2 4';
      },
      diagramFieldLabel() {
        const field = this.model.field;
        return field ? _t(`field.${  field}`) : _t('fieldEmpty');
      },
      diagramS1Text() {
        return truncate(this.model.s1 || _t('s1Placeholder'), 22);
      },
      diagramS2Text() {
        return truncate(this.model.s2 || _t('s2Placeholder'), 22);
      },

      // ── Pipe filters ──
      situationLabel: (s) => _t(`situation.${  s}`),
      fieldOptionLabel: (f) => _t(`field.${  f}`),
      linkOptionLabel: (l) => _t(`link.${  l}`),

      // ── i18n helpers ──
      className: (c) => _t(`class.${  c  }.name`),
      classDesc: (c) => _t(`class.${  c  }.description`),
      classCount: (arr) => `(${  arr ? arr.length : 0  })`,

      // ── Language-aware standard display ──
      stdTitle(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.title : '';
      },
      stdDesc(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.description : '';
      },
      stdTrigger(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.trigger : '';
      },
      stdExample(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.example : '';
      },

      // ── Recompute classList from model state ──
      _recompute() {
        if (!this.standards || this.classList.length === 0) return;
        const s = this.model;
        const diag = diagnose(s.s1, s.s2, s.field, s.link);
        const suggested = diag.suggestedClasses;
        const allShown = s.filterMode === 'all';
        for (const item of this.classList) {
          const numKey = Number(item.key);
          const visible = allShown || suggested.includes(numKey);
          if(visible !== item.visible) {
            item.visible = visible
          }
          const open = this.model.expandedClasses.includes(numKey);
          if(open!==item.open) {
            item.open = open;
          }
        }
      },

      // ── Class visibility / expansion ──
      classToggled(cls, event) {
        const arr = this.model.expandedClasses;
        const numKey = Number(cls.key);
        const idx = arr.indexOf(numKey);
        if (event.currentTarget.open) {
          if (idx === -1) arr.push(numKey);
        } else if (idx !== -1) arr.splice(idx, 1);
        this._recompute();
      },

      // ── Select helpers ──
      isFieldSelected(f) { return this.model.field === f; },
      isLinkSelected(l) { return this.model.link === l; },
      fieldChanged(event) {
        const val = event.target.value;
        this.model.field = this.FIELDS.includes(val) ? val : '';
        this._recompute();
      },
      linkChanged(event) {
        const val = event.target.value;
        this.model.link = this.LINKS.includes(val) ? val : '';
        this._recompute();
      },
      s1Changed(event) {
        this.model.s1 = event.target.value;
        this._recompute();
      },
      s2Changed(event) {
        this.model.s2 = event.target.value;
        this._recompute();
      },

      // ── Filter ──
      isFilterAuto() {
        const m = this.model.filterMode;
        return m === 'auto' || m === '';
      },
      isFilterAll() {
        return this.model.filterMode === 'all';
      },
      filterChanged(event) {
        this.model.filterMode = event.target.value;
        this._recompute();
      },

      // ── Standard selection / notes ──
      isStandardSelected(s) { return Boolean(this.model.selected[s.id]); },
      noteValue(s) { return this.model.notes[s.id] || ''; },
      standardSelectedClass(s) {
        return this.model.selected[s.id] ? 'is-selected' : '';
      },
      noteChanged(s, event) {
        if (event.target.value) this.model.notes[s.id] = event.target.value;
        else delete this.model.notes[s.id];
      },
      selectChanged(s, event) {
        if (event.target.checked) this.model.selected[s.id] = true;
        else delete this.model.selected[s.id];
      },

      // ── Init: load standards, auto-expand classes ──
      init() {
        loadData().then(data => {
          const mapped = {};
          for (const s of data) {
            const key = String(s.class);
            if (!mapped[key]) mapped[key] = [];
            mapped[key].push(s);
          }
          this.standards = mapped;
          if (this.model.expandedClasses.length === 0) {
            const model = this.model;
            const diag = diagnose(model.s1, model.s2, model.field, model.link);
            diag.suggestedClasses.forEach(c => model.expandedClasses.push(c));
          }
          this.classList = Object.keys(mapped).map(key => ({
            key,
            standards: mapped[key],
            visible: true,
            open: false,
          }));
          this._recompute();
        });
      },
    };
  },
});
