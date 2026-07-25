/**
 * D.Mike — Kano Engine (kano-engine.js)
 *
 * Reine Auswertung des Kano-Fragebogens. Kein DOM, kein State, kein i18n.
 *
 * Skalen (als Zahl gespeichert, Klartext kommt aus i18n):
 *   funktional / dysfunktional: 1 = würde mich sehr freuen … 5 = würde mich sehr stören
 *   Wichtigkeit (dritte Frage): 1 = völlig unwichtig … 9 = außerordentlich wichtig
 *
 * Kategorien: M (Basis), O (Leistung), A (Begeisterung), I (indifferent),
 *             R (reversed), Q (questionable)
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

/** Kategorien in absteigender Stärke — zugleich die Tie-Break-Reihenfolge. */
export const CATEGORIES = ['M', 'O', 'A', 'I', 'R', 'Q'];

/**
 * Kanonische Kano-Auswertungstabelle (Kano et al. 1984).
 * Zeile = funktionale Antwort 1..5, Spalte = dysfunktionale Antwort 1..5.
 */
const TABLE = [
  ['Q', 'A', 'A', 'A', 'O'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'I', 'I', 'I', 'M'],
  ['R', 'R', 'R', 'R', 'Q'],
];

/** @returns {boolean} true, wenn v eine ganze Zahl im Bereich 1..5 ist */
function onScale5(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

/** @returns {boolean} true, wenn v eine ganze Zahl im Bereich 1..9 ist */
function onScale9(v) {
  return Number.isInteger(v) && v >= 1 && v <= 9;
}

/**
 * Klassifiziert ein Antwortpaar nach der Kano-Tabelle.
 * @param {number|null} f funktionale Antwort (1..5)
 * @param {number|null} d dysfunktionale Antwort (1..5)
 * @returns {'M'|'O'|'A'|'I'|'R'|'Q'|null} null, wenn eine Antwort fehlt oder außerhalb der Skala liegt
 */
export function classify(f, d) {
  if (!onScale5(f) || !onScale5(d)) return null;
  return TABLE[f - 1][d - 1];
}

/**
 * Aggregiert die Antworten aller Befragten zu einem Item.
 *
 * Gesamtkategorie ist der Modalwert; bei Gleichstand gewinnt die stärkere
 * Kategorie in der Reihenfolge M > O > A > I > R > Q, und `tie` wird gesetzt.
 * CS = (A+O)/(A+O+M+I), DS = -(O+M)/(A+O+M+I) — R und Q stehen bewusst nicht
 * im Nenner, sie sind keine Präferenz. Nenner 0 ⇒ cs/ds sind null, nie NaN.
 *
 * @param {Array<{f: number|null, d: number|null, w: number|null}>} itemAnswers
 * @param {{ importance: boolean }} options
 * @returns {{counts: object, n: number, unanswered: number,
 *            category: string|null, tie: boolean,
 *            cs: number|null, ds: number|null,
 *            importanceMean: number|null, importanceN: number}}
 */
export function aggregate(itemAnswers, options) {
  const counts = { M: 0, O: 0, A: 0, I: 0, R: 0, Q: 0 };
  let n = 0;
  let unanswered = 0;
  let wSum = 0;
  let importanceN = 0;
  const useImportance = Boolean(options?.importance);

  for (const a of itemAnswers || []) {
    const cat = classify(a?.f ?? null, a?.d ?? null);
    if (cat) { counts[cat]++; n++; } else { unanswered++; }
    if (useImportance && onScale9(a?.w ?? null)) { wSum += a.w; importanceN++; }
  }

  let category = null;
  let tie = false;
  if (n > 0) {
    const max = Math.max(...CATEGORIES.map((c) => counts[c]));
    const leaders = CATEGORIES.filter((c) => counts[c] === max);
    category = leaders[0];          // CATEGORIES ist bereits nach Stärke sortiert
    tie = leaders.length > 1;
  }

  const denom = counts.A + counts.O + counts.M + counts.I;
  const cs = denom > 0 ? (counts.A + counts.O) / denom : null;
  const ds = denom > 0 ? -(counts.O + counts.M) / denom : null;

  return {
    counts, n, unanswered, category, tie, cs, ds,
    importanceMean: importanceN > 0 ? wSum / importanceN : null,
    importanceN,
  };
}

/** Rang je Kategorie für die Sortierung; null (keine Kategorie) landet zuletzt. */
const CATEGORY_RANK = Object.fromEntries(CATEGORIES.map((c, i) => [c, i]));

/**
 * Wertet alle Items über alle Befragten aus.
 *
 * Sortierung der Zeilen: Kategorierang (M > O > A > I > R > Q, ohne Kategorie
 * zuletzt), dann mittlere Wichtigkeit absteigend, dann CS absteigend. Damit ist
 * die Reihenfolge deterministisch; bei vollständigem Gleichstand bleibt die
 * Eingabereihenfolge erhalten (Array.sort ist stabil).
 *
 * @param {Array<{id: string, label: string, path: string, missing: boolean}>} items
 * @param {Array<{id: string, name: string}>} respondents
 * @param {object} answers { [respondentId]: { [itemId]: { f, d, w } } }
 * @param {{ importance: boolean }} options
 * @returns {{ rows: object[], totals: { items: number, respondents: number,
 *             completeness: number, qShare: number } }}
 */
export function evaluate(items, respondents, answers, options) {
  const itemList = items || [];
  const respList = respondents || [];

  const rows = itemList.map((item) => {
    const itemAnswers = respList.map((r) => {
      const byItem = answers && answers[r.id] ? answers[r.id] : {};
      return byItem[item.id] || { f: null, d: null, w: null };
    });
    return {
      itemId: item.id,
      label: item.label,
      path: item.path,
      missing: Boolean(item.missing),
      ...aggregate(itemAnswers, options),
    };
  });

  rows.sort((a, b) => {
    const ra = a.category ? CATEGORY_RANK[a.category] : CATEGORIES.length;
    const rb = b.category ? CATEGORY_RANK[b.category] : CATEGORIES.length;
    if (ra !== rb) return ra - rb;
    const wa = a.importanceMean ?? -Infinity;
    const wb = b.importanceMean ?? -Infinity;
    if (wa !== wb) return wb - wa;
    return (b.cs ?? -Infinity) - (a.cs ?? -Infinity);
  });

  const classified = rows.reduce((s, r) => s + r.n, 0);
  const qTotal = rows.reduce((s, r) => s + r.counts.Q, 0);
  const cells = itemList.length * respList.length;

  return {
    rows,
    totals: {
      items: itemList.length,
      respondents: respList.length,
      completeness: cells > 0 ? classified / cells : 0,
      qShare: classified > 0 ? qTotal / classified : 0,
    },
  };
}
