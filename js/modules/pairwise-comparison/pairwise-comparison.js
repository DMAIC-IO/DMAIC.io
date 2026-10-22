/**
 * D.Mike — Pairwise Comparison (pairwise-comparison.js)
 * createModule + Alpine view layer. Business logic lives in the State model.
 *
 * DMAIC phase: Analyze
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Kriterien anlegen und
 *   entfernen, den Vergleich starten, jedes Paar entscheiden, eine Zelle der
 *   Matrix nachträglich ändern und den angezeigten Reiter wechseln. Der
 *   Oberfläche bleiben nur die Ausgabe (CSV, JSON, Zwischenablage) und die
 *   Tastenkürzel.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { finiteOrNull } from '../../core/agent/agent-results.js';
import { requireEnum, requireIndex } from '../../core/agent/agent-argcheck.js';
import {
  State, MAX_CRITERIA, MIN_CRITERIA, VIEW_PHASES,
} from './pairwise-comparison-model.js';

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

/**
 * Die Auswertung des Paarvergleichs, sobald alle Paare entschieden sind —
 * dieselben Model-Getter, aus denen Rangliste und Summenspalte rendern.
 *
 * @typedef {object} Result
 * @property {number[]} scores  Punkte je Kriterium, in Eingabereihenfolge
 * @property {number} maxScore  höchste Punktzahl
 * @property {RankEntry[]} ranking  Rangfolge, absteigend nach Punkten
 */

/**
 * @typedef {object} RankEntry
 * @property {string} name  Kriterium
 * @property {number} score  Punkte
 * @property {number} idx  Nummer des Kriteriums ab 0
 */

/**
 * Was `read()` liefert: der persistierte Zustand und die Auswertung.
 *
 * @typedef {object} AgentRead
 * @property {string[]} criteria  die Kriterien in Eingabereihenfolge,
 *   adressiert über ihre Nummer ab 0; höchstens 15, mindestens 3 für einen
 *   Vergleich
 * @property {number[][]} matrix  die Vergleichsmatrix, matrix[i][j] sagt, wie
 *   Kriterium i gegen Kriterium j abgeschnitten hat: 1 gewonnen, 0.5
 *   unentschieden, 0 verloren. Leer, solange kein Vergleich läuft; die
 *   Diagonale ist ohne Bedeutung
 * @property {[number, number][]} pairs  die gemischte Folge der zu
 *   entscheidenden Paare, je Eintrag die zwei Kriteriennummern. Leer, solange
 *   kein Vergleich läuft
 * @property {number} currentPair  wie viele Paare schon entschieden sind — und
 *   damit der Index des nächsten in `pairs`; gleich der Länge von `pairs`
 *   heißt fertig
 * @property {'input'|'compare'|'results'} viewPhase  der angezeigte Reiter:
 *   input (Kriterien erfassen), compare (Paare entscheiden) oder results
 *   (Rangfolge und Matrix). Persistiert, gehört also zum gespeicherten Projekt
 * @property {Result|null} result  Auswertung, leer bis alle Paare entschieden sind
 */

export default createModule({
  config: {
    id: 'pairwise-comparison',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.pairwise-comparison',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d.exportCSV() },
        { icon: 'format.json', title: 'export.json', onClick: (d) => d.exportJSON() },
      ] },
    ],
  },
  Model: State,
  data(module, _t) {
    return {
      /**
       * Den Lesezustand liefern: Model-Form plus Auswertung.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead}
       */
      read(options) {
        const m = this.model;
        const result = m.resultsReachable
          ? {
            scores: m.scores.map(finiteOrNull),
            maxScore: finiteOrNull(m.maxScore),
            ranking: m.ranked.map(r => ({ name: r.name, score: finiteOrNull(r.score), idx: r.idx })),
          }
          : null;
        return readAgentState('pairwise-comparison', { ...m.toJSON(), result }, options);
      },

      // ── transient UI state (not persisted) ──
      inputValue: '',

      // Mirror legacy behavior: focus the criterion input when the input phase
      // is shown (runs on mount and after every setState/loadExample rebuild).
      /** @noagent lifecycle, kein Zustandsweg */
      init() {
        this.$nextTick(() => {
          if (this.model.viewPhase === 'input') {
            this.$el.querySelector('[data-ref="criterionInput"]')?.focus();
          }
        });
      },

      // ── phase / tabs ──
      /** @noagent view transform */
      contentClass() { return `pairwise__content--${  this.model.viewPhase}`; },
      /** @noagent view transform */
      tabClass(i) {
        const active = ['input', 'compare', 'results'].indexOf(this.model.viewPhase);
        if (i === active) return 'dmike-tab--active';
        return i < active ? 'dmike-tab--done' : '';
      },
      /**
       * @noagent Sperrzustand eines Reiters für die Oberfläche.
       * @returns {boolean} true, solange der Schritt mit Index i noch nicht erreichbar ist.
       */
      isTabLocked(i) {
        if (i === 1) return !this.model.compareReachable;
        if (i === 2) return !this.model.resultsReachable;
        return false;
      },
      /** @noagent Mausklick fokussiert keinen Reiter, damit die Pfeiltasten im Vergleichsschritt weiter abstimmen. */
      preventFocus(e) { e.preventDefault(); },
      /**
       * @noagent Reiterklick der Oberfläche; die Phase geht durch
       *   `setViewPhase`, das die Erreichbarkeit selbst prüft.
       */
      goToTab(name) {
        if (VIEW_PHASES.includes(name)) this.setViewPhase(name);
      },

      // ── input phase ──
      /** @noagent view transform */
      atMax() { return this.model.criteria.length >= MAX_CRITERIA; },
      /** @noagent view transform */
      chipNum(i) { return String(i + 1).padStart(2, '0'); },
      /** @noagent view transform */
      addBtnLabel() { return `+ ${  _t('addBtn')}`; },
      /** @noagent view transform */
      emptyHintText() { return _t('emptyHint', { n: MIN_CRITERIA }); },
      /** @noagent view transform */
      maxReachedText() { return _t('maxReached', { n: MAX_CRITERIA }); },
      /** @noagent view transform */
      startLabel() {
        const n = this.model.criteria.length;
        return n < MIN_CRITERIA
          ? _t('startBtnNeed', { n: MIN_CRITERIA - n })
          : _t('startBtnReady', { n: this.model.pairCount });
      },
      /**
       * @returns {boolean} true once enough criteria exist to start — the state in which the start button carries the send-to icon.
       * @noagent view transform
       */
      isStartReady() { return this.model.criteria.length >= MIN_CRITERIA; },
      /**
       * @noagent liest den Eingabepuffer der Oberfläche aus; der Text geht
       *   durch `addCriterion`, und eine Doppelung bekommt hier ihren
       *   Hinweis.
       */
      addCriterionFromInput() {
        const status = this.addCriterion(this.inputValue);
        this.inputValue = '';
        if (status === 'duplicate') module._context.notify(_t('duplicateWarning'));
      },

      /**
       * Hängt ein Kriterium an die Liste an.
       * @agent
       * @param {string} text der Name des Kriteriums; Leerzeichen am Rand
       *   fallen weg
       * @returns {string} `'ok'`, wenn das Kriterium angelegt wurde;
       *   `'empty'` bei leerem Text, `'duplicate'` bei einem Namen, der
       *   schon in der Liste steht, `'max'` wenn schon 15 Kriterien erfasst
       *   sind — alle drei sind Absagen, keine Fehler
       */
      addCriterion(text) {
        return this.model.addCriterion(text);
      },

      /**
       * Entfernt ein Kriterium. Ein laufender Vergleich wird dadurch
       * ungültig: Matrix, Paarfolge und Fortschritt gehen zurück auf leer.
       * @agent
       * @param {number} i die Nummer des Kriteriums, von 0 an gezählt
       * @returns {void}
       * @throws {Error} wenn `i` kein Kriterium bezeichnet
       */
      removeCriterion(i) {
        requireIndex('i', i, this.model.criteria.length - 1);
        this.model.removeCriterion(i);
      },

      /**
       * Startet den Vergleich: baut die Matrix und die gemischte Paarfolge
       * und wechselt in die Phase `compare`.
       * @agent
       * @returns {boolean} true wenn der Vergleich gestartet wurde, false
       *   wenn weniger als drei Kriterien erfasst sind — das ist eine
       *   Absage, kein Fehler
       */
      startComparison() {
        return this.model.startComparison();
      },

      /**
       * Setzt den angezeigten Reiter.
       * @agent
       * @param {string} phase der Reiter
       * @returns {boolean} true wenn gewechselt wurde, false wenn der Reiter
       *   im aktuellen Lauf nicht erreichbar ist (die Oberfläche sperrt ihn
       *   dann ebenfalls) — das ist eine Absage, kein Fehler
       * @throws {Error} wenn `phase` keiner der drei Reiter ist
       */
      setViewPhase(phase) {
        requireEnum('phase', phase, VIEW_PHASES);
        if (phase === 'compare' && !this.model.compareReachable) return false;
        if (phase === 'results' && !this.model.resultsReachable) return false;
        this.model.viewPhase = phase;
        return true;
      },

      // ── compare phase ──
      /** @noagent view transform */
      curPair() { return this.model.pairs[this.model.currentPair] || [0, 0]; },
      /** @noagent view transform */
      leftName() { return this.model.criteria[this.curPair()[0]] ?? ''; },
      /** @noagent view transform */
      rightName() { return this.model.criteria[this.curPair()[1]] ?? ''; },
      /** @noagent view transform */
      tieLabel() { return `= ${  _t('tie')}`; },
      /** @noagent view transform */
      backLabel() { return _t('backToInput'); },
      /** @noagent view transform */
      progressStyle() {
        const total = this.model.pairs.length;
        const pct = total > 0 ? (this.model.currentPair / total) * 100 : 0;
        return `width:${  pct  }%`;
      },
      /** @noagent view transform */
      progressText() { return `${this.model.currentPair  } / ${  this.model.pairs.length}`; },
      /**
       * Entscheidet das anstehende Paar für sein erstes Kriterium und rückt
       * einen Schritt vor; nach dem letzten Paar wechselt die Phase auf
       * `results`. Welches Paar anstehend ist, sagt `pairs[currentPair]`.
       * @agent
       * @returns {boolean} true wenn eine Entscheidung vermerkt wurde, false
       *   solange kein Vergleich läuft — vor `startComparison` oder nachdem
       *   alle Paare entschieden sind; das ist eine Absage, kein Fehler
       */
      chooseLeft() {
        if (!this.model.compareReachable) return false;
        const [a, b] = this.curPair();
        this.model.choose(a, b);
        return true;
      },

      /**
       * Entscheidet das anstehende Paar für sein zweites Kriterium und rückt
       * einen Schritt vor; nach dem letzten Paar wechselt die Phase auf
       * `results`.
       * @agent
       * @returns {boolean} true wenn eine Entscheidung vermerkt wurde, false
       *   solange kein Vergleich läuft — vor `startComparison` oder nachdem
       *   alle Paare entschieden sind; das ist eine Absage, kein Fehler
       */
      chooseRight() {
        if (!this.model.compareReachable) return false;
        const [a, b] = this.curPair();
        this.model.choose(b, a);
        return true;
      },

      /**
       * Erklärt das anstehende Paar für unentschieden (je 0.5) und rückt
       * einen Schritt vor.
       * @agent
       * @returns {boolean} true wenn eine Entscheidung vermerkt wurde, false
       *   solange kein Vergleich läuft — vor `startComparison` oder nachdem
       *   alle Paare entschieden sind; das ist eine Absage, kein Fehler
       */
      tieCurrent() {
        if (!this.model.compareReachable) return false;
        const [a, b] = this.curPair();
        this.model.chooseTie(a, b);
        return true;
      },

      // `backToInput` bleibt der Weg des Knopfes und ist KEIN eigener
      // Katalogeintrag: sein ganzer Inhalt ist `setViewPhase('input')`, und
      // ein zweiter agentensichtbarer Weg zu demselben Feld wäre ein
      // redundanter Eintrag mit genau einer Zuweisungsstelle weniger.
      // Dasselbe Verhältnis wie `toggleMatrix` zu `setShowMatrix` in
      // `triz-contradiction-matrix`.
      /**
       * @noagent Knopfhandler der Oberfläche; die Phase geht durch
       *   `setViewPhase`.
       */
      backToInput() { this.setViewPhase('input'); },
      /** @noagent DOM event handler — Tastaturbehandlung der Oberfläche */
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
      /** @noagent view transform */
      medalClass(pos) {
        return pos < 3 ? `pairwise__rank-item--${  ['gold', 'silver', 'bronze'][pos]}` : '';
      },
      /** @noagent view transform */
      rankDelay(pos) { return `animation-delay:${  pos * 0.05  }s`; },
      /** @noagent view transform */
      rankBarStyle(score) {
        const m = this.model.maxScore;
        const pct = m > 0 ? (score / m) * 100 : 0;
        return `width:${  pct  }%`;
      },
      /** @noagent view transform */
      rankScore(score) { return score.toFixed(1); },
      /** @noagent view transform */
      scoreFmt(i) { return this.model.scores[i].toFixed(1); },
      /** @noagent view transform */
      matrixCellClass(i, j) {
        if (i === j) return 'pairwise__matrix-cell--diag';
        const v = this.model.matrix[i][j];
        const cls = v === 1 ? 'pairwise__matrix-cell--win'
          : v === 0.5 ? 'pairwise__matrix-cell--tie'
            : 'pairwise__matrix-cell--lose';
        return `pairwise__matrix-cell--editable ${  cls}`;
      },
      /** @noagent view transform */
      matrixCellText(i, j) { return i === j ? '—' : String(this.model.matrix[i][j]); },
      /** @noagent view transform */
      cellTitle(i, j) { return i === j ? null : _t('matrixCellHint'); },
      /**
       * @noagent Zellenklick der Oberfläche; der Wert geht durch
       *   `cycleCell`.
       */
      cellClick(i, j) { this.cycleCell(i, j); },

      /**
       * Geht die Bewertung einer Matrixzelle einen Schritt weiter: 0 zu 0.5,
       * 0.5 zu 1, 1 zurück zu 0. Die Gegenzelle wird mitgeführt.
       * @agent
       * @param {number} i die Nummer des Kriteriums der Zeile, von 0 an gezählt
       * @param {number} j die Nummer des Kriteriums der Spalte, von 0 an gezählt
       * @returns {boolean} true wenn die Zelle geändert wurde, false auf der
       *   Diagonale (ein Kriterium gegen sich selbst ist keine Bewertung)
       *   und solange kein Vergleich gestartet ist — beides sind Absagen,
       *   keine Fehler
       * @throws {Error} wenn `i` oder `j` kein Kriterium bezeichnet
       */
      cycleCell(i, j) {
        const last = this.model.criteria.length - 1;
        requireIndex('i', i, last);
        requireIndex('j', j, last);
        if (i === j) return false;
        if (this.model.matrix.length === 0) return false;
        this.model.cycleCell(i, j);
        return true;
      },
      /** @noagent view transform */
      legendWinText() { return `1 = ${  _t('legendWin')}`; },
      /** @noagent view transform */
      legendTieText() { return `0.5 = ${  _t('legendTie')}`; },
      /** @noagent view transform */
      legendLoseText() { return `0 = ${  _t('legendLose')}`; },

      // ── exports ──
      /**
       * @noagent gibt eine Datei aus; ein Agent
       *   liest den Zustand über `read()`.
       */
      exportCSV() {
        if (!this.model.resultsReachable) return;
        const n = this.model.criteria.length;
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
      /**
       * @noagent gibt eine Datei aus; ein Agent
       *   liest den Zustand über `read()`.
       */
      exportJSON() {
        if (!this.model.resultsReachable) return;
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
    };
  },
});
