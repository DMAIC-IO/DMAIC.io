import { createModule } from '../../core/template-module.js';
import { State, loadData, getCached } from './triz-contradiction-matrix-model.js';

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

const base = createModule({
  config: {
    id: 'triz-contradiction-matrix',
    engine: 'alpine',
    phase: 'improve',
    icon: 'git-merge',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    const cache = getCached();
    const lang = () => module._context.i18n.getLanguage();

    return {
      params: cache.parameters,
      principles: cache.principles,
      matrix: cache.matrix,

      optionText: (p) => `${p.id  }. ${  (p[lang()] ?? p.en).name}`,

      paramDesc: (id) => {
        if (id == null) return '';
        const p = cache.parameters.find(x => x.id === Number(id));
        return p ? (p[lang()] ?? p.en).description : '';
      },

      principleName: (pr) => (pr[lang()] ?? pr.en).name,
      principleDesc: (pr) => (pr[lang()] ?? pr.en).description,

      improvingChanged(event) {
        const v = event.target.value;
        this.model.improving = v ? Number(v) : null;
      },

      worseningChanged(event) {
        const v = event.target.value;
        this.model.worsening = v ? Number(v) : null;
      },

      swapParams() {
        const a = this.model.improving;
        this.model.improving = this.model.worsening;
        this.model.worsening = a;
      },

      toggleMatrix() {
        this.model.showMatrix = !this.model.showMatrix;
      },

      matrixToggleLabel() {
        return this.model.showMatrix ? _t('hideMatrix') : _t('showMatrix');
      },

      rowHeadLabel: (i) => String(cache.parameters[i]?.id ?? ''),
      rowHeadClass: (i, improvingId) => {
        const p = cache.parameters[i];
        return p && improvingId === p.id ? 'is-active' : '';
      },
      rowHeadTitle: (i) => {
        const p = cache.parameters[i];
        if (!p) return '';
        return `${p.id  }. ${  (p[lang()] ?? p.en).name}`;
      },

      colHeadLabel: (j) => String(cache.parameters[j]?.id ?? ''),
      colHeadClass: (j, worseningId) => {
        const p = cache.parameters[j];
        return p && worseningId === p.id ? 'is-active' : '';
      },
      colHeadTitle: (j) => {
        const p = cache.parameters[j];
        if (!p) return '';
        return `${p.id  }. ${  (p[lang()] ?? p.en).name}`;
      },

      paramId: (i) => cache.parameters[i]?.id ?? '',

      mxCellClass: (i, j, cell, improvingId, worseningId) => {
        const pI = cache.parameters[i];
        const pJ = cache.parameters[j];
        const classes = [];
        if (i === j) classes.push('is-diag');
        else if (cell === null) classes.push('is-empty');
        else classes.push('is-filled');
        if (pI && pJ && improvingId === pI.id && worseningId === pJ.id) classes.push('is-picked');
        return classes.join(' ');
      },
      mxCellTitle: (i, j, cell) => {
        const pI = cache.parameters[i];
        const pJ = cache.parameters[j];
        if (!pI || !pJ) return '';
        if (i === j) return `${pI.id  } \u2194 ${  pI.id}`;
        const name1 = (pI[lang()] ?? pI.en).name;
        const name2 = (pJ[lang()] ?? pJ.en).name;
        let t = `${pI.id  }\u2191 ${  name1  } / ${  pJ.id  }\u2193 ${  name2}`;
        if (cell) t += `: ${  cell.join(', ')}`;
        return t;
      },
      mxCellContent: (i, j, cell) => {
        if (i === j) return '\u00b7';
        return cell === null ? '' : String(cell.length);
      },

      mxCellClick(event) {
        const td = event.currentTarget;
        const improvingId = Number(td.dataset.iIdx);
        const worseningId = Number(td.dataset.jIdx);
        if (!improvingId || !worseningId || improvingId === worseningId) return;
        this.model.improving = improvingId;
        this.model.worsening = worseningId;
      },
    };
  },
});

const origInit = base.init;
base.init = async function (container, context) {
  this._container = container;
  this._context = context;
  const wrap = el('div', 'module-container triz-cm');
  const body = el('div', 'module-container__body');
  body.appendChild(el('p', 'triz-cm__hint', '\u2026'));
  wrap.appendChild(body);
  container.replaceChildren(wrap);
  try {
    await loadData();
  } catch (err) {
    console.error('[triz-contradiction-matrix] failed to load data:', err);
    const title = context.i18n.t('modules.triz-contradiction-matrix.loadError');
    const errWrap = el('div', 'module-error');
    errWrap.appendChild(el('div', 'module-error__title', title));
    errWrap.appendChild(el('div', 'module-error__message', err.message));
    container.replaceChildren(errWrap);
    return;
  }
  return origInit.call(this, container, context);
};

export default base;
