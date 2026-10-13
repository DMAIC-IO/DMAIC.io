/**
 * D.Mike — Widerspruchsmatrix (TRIZ) (triz-contradiction-matrix.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: verbesserndes und
 *   verschlechterndes Merkmal, die Problemnotiz und die Matrixanzeige. Die
 *   39 Merkmale und die empfohlenen Prinzipien sind feste Tabellendaten und
 *   kein Zustand.
 */
import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId } from '../../core/agent/agent-argcheck.js';
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
    icon: 'module.triz-contradiction-matrix',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    const cache = getCached();
    const lang = () => module._context.i18n.getLanguage();

    return {
      ...agentReadMixin(module),

      params: cache.parameters,
      principles: cache.principles,
      matrix: cache.matrix,

      /** @noagent view transform */
      optionText: (p) => `${p.id  }. ${  (p[lang()] ?? p.en).name}`,

      /** @noagent view transform */
      paramDesc: (id) => {
        if (id == null) return '';
        const p = cache.parameters.find(x => x.id === Number(id));
        return p ? (p[lang()] ?? p.en).description : '';
      },

      /** @noagent view transform */
      principleName: (pr) => (pr[lang()] ?? pr.en).name,
      /** @noagent view transform */
      principleDesc: (pr) => (pr[lang()] ?? pr.en).description,

      /**
       * @noagent packt ein Änderungsereignis aus; der Wert geht durch
       *   `setImproving`.
       */
      improvingChanged(event) {
        const v = event.target.value;
        this.setImproving(v ? Number(v) : null);
      },

      /**
       * @noagent packt ein Änderungsereignis aus; der Wert geht durch
       *   `setWorsening`.
       */
      worseningChanged(event) {
        const v = event.target.value;
        this.setWorsening(v ? Number(v) : null);
      },

      // ── Zustands-Sinks: ein Setter je Feld (Plan E2) ──────────────
      // Die Merkmalsnummer ist die `id` eines Eintrags der geladenen
      // Merkmalstabelle (`parameters.json`), kein Einfügeindex — darum
      // `requireKnownId` gegen die tatsächlich geladenen ids. Die Meldung
      // zählt sie auf, damit ein Agent den gültigen Bereich auch dann
      // erfährt, wenn er die Tabelle nicht kennt.

      /**
       * Setzt das Merkmal, das verbessert werden soll.
       * @agent
       * @param {number|null} param Nummer des Merkmals, 1 bis 39; `null`
       *   nimmt die Wahl zurück
       * @returns {void}
       * @throws {Error} wenn kein Merkmal diese Nummer trägt
       */
      setImproving(param) {
        if (param === null || param === undefined) { this.model.improving = null; return; }
        requireKnownId('improving', Number(param), cache.parameters.map(p => p.id));
        this.model.improving = Number(param);
      },

      /**
       * Setzt das Merkmal, das sich dabei verschlechtert.
       * @agent
       * @param {number|null} param Nummer des Merkmals, 1 bis 39; `null`
       *   nimmt die Wahl zurück
       * @returns {void}
       * @throws {Error} wenn kein Merkmal diese Nummer trägt
       */
      setWorsening(param) {
        if (param === null || param === undefined) { this.model.worsening = null; return; }
        requireKnownId('worsening', Number(param), cache.parameters.map(p => p.id));
        this.model.worsening = Number(param);
      },

      /**
       * Setzt die Problemnotiz zum Widerspruch.
       * @agent
       * @param {string} text die Problemnotiz
       * @returns {void}
       */
      setProblemNote(text) { this.model.problemNote = String(text ?? ''); },

      /**
       * Legt fest, ob die vollständige 39×39-Matrix angezeigt wird.
       * @agent
       * @param {boolean} visible `true` zeigt die Matrix, `false` verbirgt sie
       * @returns {void}
       */
      setShowMatrix(visible) { this.model.showMatrix = Boolean(visible); },

      /**
       * Tauscht verbesserndes und verschlechterndes Merkmal gegeneinander.
       * @agent
       * @returns {void}
       */
      swapParams() {
        const a = this.model.improving;
        this.model.improving = this.model.worsening;
        this.model.worsening = a;
      },

      /**
       * Schaltet die Anzeige der vollständigen 39×39-Matrix um.
       * @agent
       * @returns {void}
       */
      toggleMatrix() {
        this.model.showMatrix = !this.model.showMatrix;
      },

      /** @noagent view transform */
      matrixToggleLabel() {
        return this.model.showMatrix ? _t('hideMatrix') : _t('showMatrix');
      },

      /** @noagent view transform */
      rowHeadLabel: (i) => String(cache.parameters[i]?.id ?? ''),
      /** @noagent view transform */
      rowHeadClass: (i, improvingId) => {
        const p = cache.parameters[i];
        return p && improvingId === p.id ? 'is-active' : '';
      },
      /** @noagent view transform */
      rowHeadTitle: (i) => {
        const p = cache.parameters[i];
        if (!p) return '';
        return `${p.id  }. ${  (p[lang()] ?? p.en).name}`;
      },

      /** @noagent view transform */
      colHeadLabel: (j) => String(cache.parameters[j]?.id ?? ''),
      /** @noagent view transform */
      colHeadClass: (j, worseningId) => {
        const p = cache.parameters[j];
        return p && worseningId === p.id ? 'is-active' : '';
      },
      /** @noagent view transform */
      colHeadTitle: (j) => {
        const p = cache.parameters[j];
        if (!p) return '';
        return `${p.id  }. ${  (p[lang()] ?? p.en).name}`;
      },

      /** @noagent view transform */
      paramId: (i) => cache.parameters[i]?.id ?? '',

      /** @noagent view transform */
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
      /** @noagent view transform */
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
      /** @noagent view transform */
      mxCellContent: (i, j, cell) => {
        if (i === j) return '\u00b7';
        return cell === null ? '' : String(cell.length);
      },

      /**
       * @noagent packt ein Klickereignis aus; die beiden Werte gehen durch
       *   `setImproving` und `setWorsening`.
       */
      mxCellClick(event) {
        const td = event.currentTarget;
        const improvingId = Number(td.dataset.iIdx);
        const worseningId = Number(td.dataset.jIdx);
        if (!improvingId || !worseningId || improvingId === worseningId) return;
        this.setImproving(improvingId);
        this.setWorsening(worseningId);
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
