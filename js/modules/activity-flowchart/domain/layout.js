/**
 * D.Mike — Activity-Flowchart: Bandzeilen und Rasterlayout.
 *
 * Reine Funktionen über der Schrittliste. Die Zeilen sind die Bänder von oben
 * nach unten (Hauptpfad, dann je Raute ihr Band, tiefenzuerst unter dem Band,
 * in dem die Raute steht). Das Layout vergibt jedem Schritt eine Spalte:
 * gepackt je Band, eine Raute reicht ihre Spalte an ihr Band weiter, ein
 * Rückwärtsband läuft nach links, und der Hauptpfad weicht aus, wo ein Umweg
 * Platz für seinen Ausgang braucht.
 */
import { MAIN_BRANCH, BRANCH_PREFIX } from './branches.js';

/**
 * @typedef {{ id: string, kind: string, branchId: string, decision: { label: string, noTarget: string }|null }} LayoutStep
 * @typedef {{ id: string, ownerId: string|null, label: string, depth: number }} BandRow
 * @typedef {{ colOf: Map<string, number>, count: number }} Layout
 */

/**
 * Die übersetzte Beschriftung eines Bands.
 * @param {LayoutStep|null} owner die Raute des Bands, beim Hauptpfad `null`
 * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
 * @returns {string}
 */
export function bandLabel(owner, t) {
  if (!owner) return t('mainPath');
  return t('bandLabel', { q: owner.decision?.label || t('unnamedDecision') });
}

/**
 * Die Bandzeilen von oben nach unten.
 * @param {LayoutStep[]} steps
 * @param {(owner: LayoutStep|null) => string} label Beschriftung je Band
 * @returns {BandRow[]}
 */
export function bandRows(steps, label) {
  /** @type {BandRow[]} */
  const rows = [];
  /** @param {string} branchId @param {LayoutStep|null} owner @param {number} depth */
  const walk = (branchId, owner, depth) => {
    rows.push({ id: branchId, ownerId: owner ? owner.id : null, label: label(owner), depth });
    steps
      .filter((s) => s.kind === 'decision' && s.branchId === branchId)
      .forEach((d) => walk(BRANCH_PREFIX + d.id, d, depth + 1));
  };
  walk(MAIN_BRANCH, null, 0);
  return rows;
}

/**
 * Wohin der Umweg einer Raute führt und in welche Richtung ihr Band läuft. Ein
 * Ziel weiter vorn in der Kette ist eine Nacharbeitsschleife (Band läuft nach
 * links); `'end'` oder ein unbekanntes Ziel ist eine Sackgasse.
 * @param {LayoutStep[]} steps @param {LayoutStep} decision
 * @returns {{ target: LayoutStep, backward: boolean }|null}
 */
export function bandFlow(steps, decision) {
  const own = steps.findIndex((s) => s.id === decision?.id);
  const id = decision?.decision?.noTarget || 'end';
  if (id === 'end') return null;
  const i = steps.findIndex((s) => s.id === id);
  if (i === -1) return null;
  return { target: steps[i], backward: i < own };
}

/**
 * Spalte je Schritt (1-basiert) und die Zahl der Spalten.
 *
 * Jedes Band packt seine Schritte in seiner Laufrichtung; eine Raute reicht ihre
 * Spalte an ihr Band weiter, so steht die erste Umwegkarte direkt unter ihr.
 * Der Ausgang eines Bands braucht eine eigene Spalte zwischen seiner letzten
 * Karte und dem Wiedereinstieg, ein Umweg muss sein Ziel also um zwei Spalten
 * verfehlen. Wo er das nicht tut, rückt die Kette: vorwärts rücken das Ziel und
 * alles danach außer dem Umweg selbst, rückwärts alles hinter dem Ziel samt
 * Umweg. Wiederholt, bis nichts mehr rückt.
 * @param {LayoutStep[]} steps
 * @returns {Layout}
 */
export function layoutOf(steps) {
  /** @type {Map<string, number>} */
  const colOf = new Map();
  const next = new Map([[MAIN_BRANCH, 1]]);
  const dir = new Map([[MAIN_BRANCH, 1]]);
  for (const s of steps) {
    const c = next.get(s.branchId) ?? 1;
    colOf.set(s.id, c);
    next.set(s.branchId, c + (dir.get(s.branchId) ?? 1));
    if (s.kind === 'decision') {
      next.set(BRANCH_PREFIX + s.id, c);
      dir.set(BRANCH_PREFIX + s.id, bandFlow(steps, s)?.backward ? -1 : 1);
    }
  }

  const indexOf = new Map(steps.map((s, i) => [s.id, i]));
  for (let guard = 0; guard < steps.length + 1; guard++) {
    let shifted = false;
    for (const d of steps) {
      if (d.kind !== 'decision') continue;
      const flow = bandFlow(steps, d);
      if (!flow) continue;
      const band = BRANCH_PREFIX + d.id;
      const members = steps.filter((s) => s.branchId === band);
      const cols = [colOf.get(d.id), ...members.map((s) => colOf.get(s.id))].map(Number);
      const targetCol = Number(colOf.get(flow.target.id));
      const from = Number(indexOf.get(flow.target.id));
      const need = flow.backward
        ? targetCol + 2 - Math.min(...cols)
        : Math.max(...cols) + 2 - targetCol;
      if (need <= 0) continue;
      const own = flow.backward ? new Set() : new Set([d.id, ...members.map((s) => s.id)]);
      const start = flow.backward ? from + 1 : from;
      steps.forEach((s, i) => {
        if (i >= start && !own.has(s.id)) colOf.set(s.id, Number(colOf.get(s.id)) + need);
      });
      shifted = true;
    }
    if (!shifted) break;
  }

  let count = 0;
  colOf.forEach((c) => { count = Math.max(count, c); });
  return { colOf, count };
}

/**
 * Die Signatur, von der das Layout abhängt: ids, Arten, Bänder und Ziele —
 * keine Texte.
 * @param {LayoutStep[]} steps @returns {string}
 */
export function chainSignature(steps) {
  return steps.map((s) => [s.id, s.kind, s.branchId, s.decision?.noTarget ?? ''].join('\u0001')).join('\u0002');
}

/** Merker je Model: letzte Signatur und ihr Layout. */
const memo = new WeakMap();

/**
 * `layoutOf` mit einem Merker je Model: dieselbe Kette liefert dasselbe Objekt,
 * jede Karte, Bahn und Marke fragt so nur einmal je Stand.
 * @param {{ steps: LayoutStep[] }} model
 * @returns {Layout}
 */
export function layoutFor(model) {
  const key = chainSignature(model.steps);
  const hit = memo.get(model);
  if (hit && hit.key === key) return hit.layout;
  const layout = layoutOf(model.steps);
  memo.set(model, { key, layout });
  return layout;
}
