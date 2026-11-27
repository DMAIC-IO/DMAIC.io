/**
 * D.Mike — DoE-Berater: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder wizard.js (das Schema und der Baum dürfen
 * sich ändern, die Migration nicht). Jeder Schritt liefert ein einfaches
 * Objekt.
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Bereiche im Formatstand 1.1. */
const TABS_1_1 = ['overview', 'wizard', 'ccd'];

/**
 * Der Entscheidungsbaum im Formatstand 1.1: je Frage der Antwortschlüssel und
 * je Antwortmöglichkeit der nächste Schritt.
 * @type {Readonly<Record<string, { key: string, next: Readonly<Record<string, string>> }>>}
 */
const TREE_1_1 = Object.freeze({
  'phase': { key: 'phase', next: { 'define-measure': 'result:none', 'analyze': 'goal', 'improve': 'goal', 'control': 'result:evop' } },
  'goal': {
    key: 'goal',
    next: {
      screening: 'screening-curvature', interactions: 'factor-count', optimization: 'limits',
      robustness: 'robustness-type', mixture: 'result:mixture',
    },
  },
  'screening-curvature': { key: 'screeningCurvature', next: { 'yes': 'result:dsd', 'no': 'result:fractional', 'many-factors': 'result:plackett-burman' } },
  'factor-count': { key: 'factorCount', next: { few: 'factor-levels', many: 'result:fractional' } },
  'factor-levels': { key: 'factorLevels', next: { 'two': 'result:full', 'multi-or-mixed': 'result:full-general' } },
  'robustness-type': { key: 'robustnessType', next: { 'noise-factors': 'result:taguchi', 'dispersion-only': 'result:dispersion' } },
  'limits': { key: 'limits', next: { expandable: 'result:ccd-rotatable', hard: 'corners' } },
  'corners': { key: 'corners', next: { allowed: 'result:ccd-face', forbidden: 'result:box-behnken', constrained: 'result:d-optimal' } },
});

/**
 * '0→1.0': jeder Stand ohne `_schema` (alte Exporte). Nur die Form, wie das
 * alte `State.fromJSON` sie annahm: `tab` und `currentStep` als Text,
 * `answers` als Objekt, `history` als Liste; alles andere entfällt (auch
 * `result`). Der folgende Schritt normalisiert.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ tab?: string, currentStep?: string, answers?: Record<string, unknown>, history?: unknown[] }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  return {
    ...(typeof o.tab === 'string' ? { tab: o.tab } : {}),
    ...(typeof o.currentStep === 'string' ? { currentStep: o.currentStep } : {}),
    ...(isObject(o.answers) ? { answers: { ...o.answers } } : {}),
    ...(Array.isArray(o.history) ? { history: [...o.history] } : {}),
  };
}

/**
 * '1.0→1.1': der Bereich aus den drei Reitern, sonst `overview` (die
 * Altform zeigte dann keinen). Der Berater wird normalisiert: die Spur wird
 * ab `phase` nachgespielt, solange jeder Eintrag der erreichte Schritt ist
 * und eine gültige Antwort hat; `currentStep` ist, wohin dieses Präfix führt,
 * `answers` nur dessen Antworten. Ein stimmiger Stand bleibt gleich; fremde
 * Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand '1.0' (ohne `_schema`)
 * @returns {{ tab: string, currentStep: string, answers: Record<string, string>, history: string[] }}
 */
export function from1_0(old) {
  const o = isObject(old) ? old : {};
  const given = isObject(o.answers) ? o.answers : {};
  const trail = Array.isArray(o.history) ? o.history : [];
  let currentStep = 'phase';
  /** @type {Record<string, string>} */
  const answers = {};
  /** @type {string[]} */
  const history = [];
  for (const id of trail) {
    const node = Object.hasOwn(TREE_1_1, currentStep) ? TREE_1_1[currentStep] : null;
    if (!node || id !== currentStep) break;
    const opt = given[node.key];
    if (typeof opt !== 'string' || !Object.hasOwn(node.next, opt)) break;
    answers[node.key] = opt;
    history.push(id);
    currentStep = node.next[opt];
  }
  return { tab: TABS_1_1.includes(o.tab) ? o.tab : 'overview', currentStep, answers, history };
}
