/**
 * D.Mike — Pairwise Comparison (pairwise-comparison.js)
 * createModule + Alpine view layer. Business logic lives in the State model.
 *
 * DMAIC phase: Analyze
 */

import { createModule } from '../../core/template-module.js';
import { State, MAX_CRITERIA, MIN_CRITERIA } from './pairwise-comparison-model.js';

/**
 * Trigger a client-side file download. This builds a transient download anchor,
 * NOT module UI — all visible DOM lives in pairwise-comparison.html.
 */
function downloadFile(content, filename, type) {
  const blob = new Blob([`\uFEFF${  content}`], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default createModule({
  config: {
    id: 'pairwise-comparison',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'scale',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    return {
      // ── transient UI state (not persisted) ──
      inputValue: '',

      // Mirror legacy behavior: focus the criterion input when the input phase
      // is shown (runs on mount and after every setState/loadExample rebuild).
      init() {
        this.$nextTick(() => {
          if (this.model.viewPhase === 'input') {
            this.$el.querySelector('[data-ref="criterionInput"]')?.focus();
          }
        });
      },

      // ── phase / tabs ──
      contentClass() { return `pairwise__content--${  this.model.viewPhase}`; },
      tabClass(i) {
        const active = ['input', 'compare', 'results'].indexOf(this.model.viewPhase);
        const cls = [];
        if (i === active) cls.push('pairwise__tab--active');
        else if (i < active) cls.push('pairwise__tab--done');
        if (i === 1 && !this.model.compareReachable) cls.push('pairwise__tab--disabled');
        if (i === 2 && !this.model.resultsReachable) cls.push('pairwise__tab--disabled');
        return cls.join(' ');
      },
      goToTab(name) {
        if (name === 'input') this.model.viewPhase = 'input';
        else if (name === 'compare' && this.model.compareReachable) this.model.viewPhase = 'compare';
        else if (name === 'results' && this.model.resultsReachable) this.model.viewPhase = 'results';
      },

      // ── input phase ──
      atMax() { return this.model.criteria.length >= MAX_CRITERIA; },
      chipNum(i) { return String(i + 1).padStart(2, '0'); },
      addBtnLabel() { return `+ ${  _t('addBtn')}`; },
      emptyHintText() { return _t('emptyHint', { n: MIN_CRITERIA }); },
      maxReachedText() { return _t('maxReached', { n: MAX_CRITERIA }); },
      startLabel() {
        const n = this.model.criteria.length;
        return n < MIN_CRITERIA
          ? _t('startBtnNeed', { n: MIN_CRITERIA - n })
          : _t('startBtnReady', { n: this.model.pairCount });
      },
      addCriterion() {
        const status = this.model.addCriterion(this.inputValue);
        this.inputValue = '';
        if (status === 'duplicate') module._context.notify(_t('duplicateWarning'));
      },
      removeCriterion(i) { this.model.removeCriterion(i); },
      startComparison() { this.model.startComparison(); },

      // ── compare phase ──
      curPair() { return this.model.pairs[this.model.currentPair] || [0, 0]; },
      leftName() { return this.model.criteria[this.curPair()[0]] ?? ''; },
      rightName() { return this.model.criteria[this.curPair()[1]] ?? ''; },
      tieLabel() { return `= ${  _t('tie')}`; },
      backLabel() { return _t('backToInput'); },
      progressStyle() {
        const total = this.model.pairs.length;
        const pct = total > 0 ? (this.model.currentPair / total) * 100 : 0;
        return `width:${  pct  }%`;
      },
      progressText() { return `${this.model.currentPair  } / ${  this.model.pairs.length}`; },
      chooseLeft() { const [a, b] = this.curPair(); this.model.choose(a, b); },
      chooseRight() { const [a, b] = this.curPair(); this.model.choose(b, a); },
      tieCurrent() { const [a, b] = this.curPair(); this.model.chooseTie(a, b); },
      backToInput() { this.model.viewPhase = 'input'; },
      compareKey(e) {
        if (this.model.viewPhase !== 'compare') return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        if (this.model.currentPair >= this.model.pairs.length) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.chooseLeft(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.chooseRight(); }
        else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); this.tieCurrent(); }
      },

      // ── results phase ──
      medalClass(pos) {
        return pos < 3 ? `pairwise__rank-item--${  ['gold', 'silver', 'bronze'][pos]}` : '';
      },
      rankDelay(pos) { return `animation-delay:${  pos * 0.05  }s`; },
      rankBarStyle(score) {
        const m = this.model.maxScore;
        const pct = m > 0 ? (score / m) * 100 : 0;
        return `width:${  pct  }%`;
      },
      rankScore(score) { return score.toFixed(1); },
      scoreFmt(i) { return this.model.scores[i].toFixed(1); },
      matrixCellClass(i, j) {
        if (i === j) return 'pairwise__matrix-cell--diag';
        const v = this.model.matrix[i][j];
        const cls = v === 1 ? 'pairwise__matrix-cell--win'
          : v === 0.5 ? 'pairwise__matrix-cell--tie'
            : 'pairwise__matrix-cell--lose';
        return `pairwise__matrix-cell--editable ${  cls}`;
      },
      matrixCellText(i, j) { return i === j ? '—' : String(this.model.matrix[i][j]); },
      cellTitle(i, j) { return i === j ? null : _t('matrixCellHint'); },
      cellClick(i, j) { if (i !== j) this.model.cycleCell(i, j); },
      legendWinText() { return `1 = ${  _t('legendWin')}`; },
      legendTieText() { return `0.5 = ${  _t('legendTie')}`; },
      legendLoseText() { return `0 = ${  _t('legendLose')}`; },

      // ── exports ──
      exportCSV() {
        const n = this.model.criteria.length;
        if (n === 0) return;
        const scores = this.model.scores;
        const esc = (s) => /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        let csv = 'sep=;\n';
        csv += `;${  this.model.criteria.map(esc).join(';')  };${  _t('sum')  }\n`;
        for (let i = 0; i < n; i++) {
          csv += `${esc(this.model.criteria[i])  };`;
          for (let j = 0; j < n; j++) csv += `${i === j ? '-' : this.model.matrix[i][j]  };`;
          csv += `${scores[i].toFixed(1)  }\n`;
        }
        downloadFile(csv, 'pairwise-comparison.csv', 'text/csv');
        module._context.notify(_t('exportedCSV'));
      },
      exportJSON() {
        const n = this.model.criteria.length;
        if (n === 0) return;
        const scores = this.model.scores;
        const ranked = this.model.criteria
          .map((name, i) => ({ name, score: scores[i], rank: 0 }))
          .sort((a, b) => b.score - a.score)
          .map((r, i) => ({ ...r, rank: i + 1 }));
        const out = {
          tool: 'pairwise-comparison',
          timestamp: new Date().toISOString(),
          criteria: this.model.criteria,
          matrix: this.model.matrix,
          scores,
          ranking: ranked,
        };
        downloadFile(JSON.stringify(out, null, 2), 'pairwise-comparison.json', 'application/json');
        module._context.notify(_t('exportedJSON'));
      },
      copyResults() {
        const n = this.model.criteria.length;
        if (n === 0) return;
        const scores = this.model.scores;
        const ranked = this.model.criteria
          .map((name, i) => ({ name, score: scores[i] }))
          .sort((a, b) => b.score - a.score);
        const text = `${_t('copyHeader')  }\n${  ranked
          .map((r, i) => `${i + 1}. ${r.name} (${r.score.toFixed(1)} ${_t('points')})`)
          .join('\n')}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            () => module._context.notify(_t('copied')),
            () => module._context.notify(_t('copyFailed')),
          );
        } else {
          module._context.notify(_t('copyFailed'));
        }
      },
    };
  },
});
