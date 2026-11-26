/**
 * D.Mike — Paarweiser Vergleich: Model.
 *
 * Kriterien, die gemischte Paarfolge, die Vergleichsmatrix und der
 * Fortschritt; der angezeigte Reiter ist ein Ansichtsfeld. Jede Änderung der
 * Kriterien leert den Lauf und zeigt die Eingabe. Punkte und Rangfolge sind
 * abgeleitet. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, criteria, matrix, pairs, currentPair, viewPhase }`.
 * Dass der Reiter zum Lauf passt, sichert die Invariante `reachablePhase` —
 * beim Laden repariert (auf `input`), beim Schreiben abgelehnt. Matrixform und
 * Paarnummern prüft das Model nicht (nicht strenger als die Altform).
 */
import {
  defineModel, command, list, number, text, oneOf, index,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { finiteOrNull } from '../../../core/agent/agent-results.js';
import { from0 } from './migrations.js';
import {
  MAX_CRITERIA, MIN_CRITERIA, PHASES, makePairs, zeroMatrix, scores, ranked,
  compareReachable, resultsReachable, phaseReachable, nextCell, mirrorCell,
} from './run.js';

export { MAX_CRITERIA, MIN_CRITERIA, PHASES };

/**
 * Lehnt ab, mit `param` `text` und dem Hinweis `hintKey` für das Formular.
 * @param {string} value @param {boolean} ok @param {string} allowed @param {string} hintKey
 */
function requireText(value, ok, allowed, hintKey) {
  try {
    requireForm('text', value, ok, allowed);
  } catch (err) {
    throw Object.assign(err, { hintKey });
  }
}

/**
 * Lehnt ein Kommando ab, solange kein Vergleich läuft.
 * @param {{ pairs: ReadonlyArray<unknown>, currentPair: number }} m @param {string} name
 */
function requireRunning(m, name) {
  requireForm('command', name, compareReachable(m), 'a command while a comparison is running');
}

/**
 * Die Auswertung des Paarvergleichs, sobald alle Paare entschieden sind.
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

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Kriterien in Eingabereihenfolge, adressiert über ihre Nummer ab 0 */
    criteria: list(text(), { agentWrite: false }),
    /** matrix[i][j]: wie Kriterium i gegen j abgeschnitten hat (1, 0.5, 0); leer ohne Lauf */
    matrix: list(list(number()), { agentWrite: false }),
    /** die gemischte Folge der zu entscheidenden Paare, je Eintrag zwei Kriteriennummern */
    pairs: list(list(number({ integer: true })), { agentWrite: false }),
    /** wie viele Paare schon entschieden sind — der Index des nächsten in `pairs` */
    currentPair: number({ integer: true, agentWrite: false }),
  },
  view: {
    /** der angezeigte Reiter */
    viewPhase: oneOf(['input', 'compare', 'results']),
  },
  invariants: {
    reachablePhase: {
      fields: ['viewPhase', 'pairs', 'currentPair'],
      test(m) { return phaseReachable(m.viewPhase, m); },
      repair(m) { m._v.viewPhase = 'input'; },
    },
  },
  commands: {
    addCriterion: command({
      params: { text: text({ trim: true, nonEmpty: true }) },
      returns: number({ integer: true }),
      run({ text: name }) {
        requireText(name, !this.criteria.includes(name), 'a name not yet in the list', 'duplicateWarning');
        requireText(name, this.criteria.length < MAX_CRITERIA, `at most ${MAX_CRITERIA} criteria`, 'maxReached');
        this.criteria.push(name);
        this.clearRun();
        return this.criteria.length - 1;
      },
    }),
    removeCriterion: command({
      params: { i: index('criteria', { existing: true }) },
      run({ i }) {
        this.criteria.splice(i, 1);
        this.clearRun();
      },
    }),
    startComparison: command({
      run() {
        requireForm('command', 'startComparison', this.criteria.length >= MIN_CRITERIA,
          `a command with at least ${MIN_CRITERIA} criteria`);
        const n = this.criteria.length;
        this.matrix = zeroMatrix(n);
        this.pairs = makePairs(n);
        this.currentPair = 0;
        this.viewPhase = 'compare';
      },
    }),
    chooseLeft: command({
      run() {
        requireRunning(this, 'chooseLeft');
        const [a, b] = this.pairs[this.currentPair];
        this.decide(a, b, 1);
      },
    }),
    chooseRight: command({
      run() {
        requireRunning(this, 'chooseRight');
        const [a, b] = this.pairs[this.currentPair];
        this.decide(b, a, 1);
      },
    }),
    tieCurrent: command({
      run() {
        requireRunning(this, 'tieCurrent');
        const [a, b] = this.pairs[this.currentPair];
        this.decide(a, b, 0.5);
      },
    }),
    cycleCell: command({
      params: { i: index('criteria', { existing: true }), j: index('criteria', { existing: true }) },
      run({ i, j }) {
        requireForm('j', j, j !== i, 'a criterion other than i');
        requireForm('command', 'cycleCell', this.matrix.length > 0, 'a command once a comparison was started');
        const next = nextCell(this.matrix[i][j]);
        this.setCells(i, j, next);
      },
    }),
  },
  derived: {
    /**
     * Die Auswertung: Punkte je Kriterium und Rangfolge; null, solange nicht
     * alle Paare entschieden sind.
     * @this {import('./model.types.js').StateModel}
     * @returns {Result|null}
     */
    result() {
      if (!resultsReachable(this)) return null;
      const sc = scores(this.matrix);
      return {
        scores: sc.map(finiteOrNull),
        maxScore: finiteOrNull(Math.max(0, ...sc)),
        ranking: ranked(this.criteria, sc).map((r) => ({ name: r.name, score: finiteOrNull(r.score), idx: r.idx })),
      };
    },
  },
}) {
  /**
   * Inhalt hat der Vergleich, sobald es ein Kriterium gibt.
   * @returns {boolean}
   */
  hasContent() {
    return this.criteria.length > 0;
  }

  /** Leert Matrix, Paare und Fortschritt und zeigt die Eingabe. */
  clearRun() {
    this.matrix = [];
    this.pairs = [];
    this.currentPair = 0;
    this.viewPhase = 'input';
  }

  /**
   * Schreibt eine Zelle und ihre Gegenzelle als neue Matrix.
   * @param {number} i @param {number} j @param {number} v Wert für matrix[i][j]
   */
  setCells(i, j, v) {
    const m = this.matrix.map((row) => row.slice());
    m[i][j] = v;
    m[j][i] = mirrorCell(v);
    this.matrix = m;
  }

  /**
   * Vermerkt die Entscheidung des anstehenden Paars und rückt vor; nach dem
   * letzten Paar zeigt die Ansicht das Ergebnis.
   * @param {number} winner @param {number} other @param {number} v 1 für Sieg, 0.5 für gleichwertig
   */
  decide(winner, other, v) {
    this.setCells(winner, other, v);
    this.currentPair += 1;
    if (this.currentPair >= this.pairs.length) this.viewPhase = 'results';
  }
}
