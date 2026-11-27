/**
 * D.Mike — Attributtest: Eingaben prüfen und zählen.
 *
 * Macht aus dem Stand des Models (Zusammenfassung als Zahlen) oder aus den
 * Rohwerten der Spalten geprüfte Häufigkeiten für die Engine. Rein: ohne DOM,
 * ohne i18n; Fehler sind Textschlüssel unter `modules.attribute-test`.
 */
import { isMissing, distinctValues } from './event.js';

/**
 * @typedef {object} Norm
 * @property {boolean} ok
 * @property {string} [error] Textschlüssel, wenn `ok` falsch ist
 * @property {true} [hint] der Grund ist ein Eingabehinweis, kein Fehler
 * @property {string} [kind] Testart der geprüften Eingabe
 */

/**
 * Eine Anzahl aus einer Tabellenzelle: ganze Zahl ≥ 0, Leerzeichen in der
 * Zahl erlaubt („1 200“).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseCount(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).replace(/\s+/g, '');
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * Eine positive Zahl (Umfang je Zeile, hypothetische Rate); sonst `null`.
 * @param {number|null|undefined} v
 * @returns {number|null}
 */
function positive(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Eine Anzahl aus dem Model: ganze Zahl ≥ 0, sonst `null`.
 * @param {number|null|undefined} v
 * @returns {number|null}
 */
function count(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

/** @param {unknown} v @returns {boolean} leeres Eingabefeld */
const blank = (v) => v == null;

/** Gewählter Ereigniswert, sonst der letzte Wert. */
function pickEvent(chosen, levels) {
  return chosen != null && levels.includes(chosen) ? chosen : levels[levels.length - 1];
}

/** @param {string} error @returns {Norm} */
const fail = (error) => ({ ok: false, error });
/** @param {string} error @returns {Norm} */
const hint = (error) => ({ ok: false, error, hint: true });

/** Ein Paar x/n prüfen. @returns {string|null} Fehlerschlüssel */
function checkPair(x, n) {
  if (x == null || n == null) return 'errCountInvalid';
  if (n === 0) return 'errNZero';
  if (x > n) return 'errXGreaterN';
  return null;
}

/** @returns {{ p0: number }|{ error: string }} */
function readP0(state) {
  const p0 = state.p0;
  if (typeof p0 !== 'number' || !Number.isFinite(p0) || p0 <= 0 || p0 >= 1) return { error: 'errP0Range' };
  return { p0 };
}

/** Hypothetische Differenz der Raten; leer heißt 0. */
function readDiff0(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Die Bezeichnungen der McNemar-Tafel, wie eingegeben (leer → Rückfall der Vorlage). */
function readLabels(state) {
  const l = (state.summary.pairs && state.summary.pairs.labels) || {};
  return { before: l.before || '', after: l.after || '' };
}

/**
 * Im Spaltenmodus gibt es keine eigenen McNemar-Bezeichnungen: die Namen der
 * gewählten Spalten füllen die leeren. Andere Ergebnisse bleiben, wie sie sind.
 * @param {object} norm Ergebnis des Normalisierers
 * @param {{ before?: string, after?: string }} names Spaltennamen
 * @returns {object}
 */
export function withColumnLabels(norm, names) {
  if (!norm || norm.kind !== 'mcnemar') return norm;
  const l = norm.labels || {};
  return { ...norm, labels: { before: l.before || names.before || '', after: l.after || names.after || '' } };
}

/**
 * Die Summe schon gefilterter Zählwerte einer Spalte.
 * @returns {{ x: number, rows: number }|{ error: string }}
 */
function sumCounts(values) {
  let x = 0;
  for (const v of values) {
    const c = parseCount(v);
    if (c == null) return { error: 'errCountInvalid' };
    x += c;
  }
  return { x, rows: values.length };
}

/** @param {number|null|undefined} v @returns {number|null} */
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Die Äquivalenzgrenzen in Prozentpunkten → Anteile (Differenzen; bei einer
 * Stichprobe relativ zu p₀). Fehlende Grenzen sind ein Hinweis, kein Fehler.
 * @returns {{ lower: number, upper: number }|{ error: string, hint?: true }}
 */
function readBounds(state) {
  const e = state.equiv || {};
  let lower;
  let upper;
  if (e.symmetric !== false) {
    const d = finite(e.delta);
    if (d == null) return { error: 'hintEnterBounds', hint: true };
    lower = -d / 100;
    upper = d / 100;
  } else {
    const lo = finite(e.lower);
    const up = finite(e.upper);
    if (lo == null || up == null) return { error: 'hintEnterBounds', hint: true };
    lower = lo / 100;
    upper = up / 100;
  }
  if (lower >= upper) return { error: 'errBoundsOrder' };
  if (!(lower < 0 && upper > 0)) return { error: e.samples === 1 ? 'errBoundsContainOne' : 'errBoundsContain' };
  return { lower, upper };
}

/** Eine Anteils-Eingabe (Teil 1) als Äquivalenz-Eingabe, sobald die Grenzen gelten. */
function toEquivalence(state, norm) {
  if (!norm.ok) return norm;
  const b = readBounds(state);
  if ('error' in b) return b.hint ? hint(b.error) : fail(b.error);
  const { kind, ok, ...rest } = norm;
  return { ok, kind: 'equiv', samples: kind === 'one' ? 1 : 2, ...rest, lower: b.lower, upper: b.upper };
}

/**
 * Die Zusammenfassung der gewählten Testart prüfen.
 * @param {object} state Stand des Models (`domain/model.js`)
 * @returns {object} Norm
 */
export function normalizeSummary(state) {
  const s = state.summary;
  if (state.testKind === 'equiv') {
    const base = { ...state, testKind: state.equiv && state.equiv.samples === 1 ? 'one' : 'two' };
    return toEquivalence(state, normalizeSummary(base));
  }
  if (state.testKind === 'rate1') {
    if ([s.x, s.t, s.lambda0].every(blank)) return hint('hintEnterCounts');
    const x = count(s.x);
    if (x == null) return fail('errCountInvalid');
    const t = positive(s.t);
    if (t == null) return fail('errExposure');
    const lambda0 = positive(s.lambda0);
    if (lambda0 == null) return fail('errLambda0');
    return { ok: true, kind: 'rate1', x, t, lambda0, missing: 0 };
  }
  if (state.testKind === 'rate2') {
    if ([s.x1, s.t1, s.x2, s.t2].every(blank)) return hint('hintEnterCounts');
    const x1 = count(s.x1);
    const x2 = count(s.x2);
    if (x1 == null || x2 == null) return fail('errCountInvalid');
    const t1 = positive(s.t1);
    const t2 = positive(s.t2);
    if (t1 == null || t2 == null) return fail('errExposure');
    return { ok: true, kind: 'rate2', x1, t1, x2, t2, diff0: readDiff0(s.diff0), groups: null, missing: 0 };
  }
  if (state.testKind === 'mcnemar') {
    const c = s.pairs.counts;
    if (c.every((row) => row.every(blank))) return hint('hintEnterCounts');
    const table = c.map((row) => row.map(count));
    if (table.some((row) => row.some((v) => v == null))) return fail('errCountInvalid');
    if (table.flat().every((v) => v === 0)) return fail('errNZero');
    return { ok: true, kind: 'mcnemar', table, labels: readLabels(state), missing: 0 };
  }
  if (state.testKind === 'one') {
    if (blank(s.x) && blank(s.n)) return hint('hintEnterCounts');
    const x = count(s.x);
    const n = count(s.n);
    const err = checkPair(x, n);
    if (err) return fail(err);
    const p = readP0(state);
    if ('error' in p) return fail(p.error);
    return { ok: true, kind: 'one', x, n, p0: p.p0, missing: 0 };
  }
  if (state.testKind === 'two') {
    if ([s.x1, s.n1, s.x2, s.n2].every(blank)) return hint('hintEnterCounts');
    const [x1, n1, x2, n2] = [s.x1, s.n1, s.x2, s.n2].map(count);
    const err = checkPair(x1, n1) || checkPair(x2, n2);
    if (err) return fail(err);
    return { ok: true, kind: 'two', x1, n1, x2, n2, groups: null, missing: 0 };
  }
  const t = s.table;
  if (t.counts.every((row) => row.every(blank))) return hint('hintEnterCounts');
  const counts = t.counts.map((row) => row.map(count));
  if (counts.some((row) => row.some((v) => v == null))) return fail('errCountInvalid');
  if (counts.length < 2 || counts[0].length < 2) return fail('errTableTooSmall');
  return { ok: true, kind: 'assoc', rows: [...t.rows], cols: [...t.cols], counts, missing: 0 };
}

/**
 * Die Spalten der gewählten Testart zählen. `state.eventValue` ist der
 * wirksame Ereigniswert (`effectiveEvent`).
 * @param {object} state Stand des Models
 * @param {{ response: unknown[]|null, group: unknown[]|null, rowVar: unknown[]|null,
 *   colVar: unknown[]|null, counts: unknown[]|null, before: unknown[]|null, after: unknown[]|null }} cols
 * @returns {object} Norm
 */
export function normalizeColumns(state, cols) {
  if (state.testKind === 'equiv') {
    const base = { ...state, testKind: state.equiv && state.equiv.samples === 1 ? 'one' : 'two' };
    return toEquivalence(state, normalizeColumns(base, cols));
  }

  if (state.testKind === 'rate1') {
    if (!cols.counts) return hint('hintPickColumns');
    const perRow = positive(state.exposurePerRow);
    if (perRow == null) return fail('errExposure');
    const present = cols.counts.filter((v) => !isMissing(v));
    if (present.length === 0) return fail('errExposure');
    const sum = sumCounts(present);
    if ('error' in sum) return fail(sum.error);
    const lambda0 = positive(state.summary.lambda0);
    if (lambda0 == null) return fail('errLambda0');
    return {
      ok: true, kind: 'rate1', x: sum.x, t: sum.rows * perRow, lambda0,
      missing: cols.counts.length - present.length,
    };
  }

  if (state.testKind === 'rate2') {
    if (!cols.counts || !cols.group) return hint('hintPickColumns');
    const perRow = positive(state.exposurePerRow);
    if (perRow == null) return fail('errExposure');
    const rows = [];
    let missing = 0;
    const len = Math.max(cols.counts.length, cols.group.length);
    for (let i = 0; i < len; i++) {
      const c = cols.counts[i];
      const g = cols.group[i];
      if (isMissing(c) || isMissing(g)) {
        if (!(isMissing(c) && isMissing(g))) missing++;
        continue;
      }
      rows.push([c, String(g).trim()]);
    }
    const groups = distinctValues(rows.map((r) => r[1]));
    if (groups.length !== 2) return fail('errGroupLevels');
    const sums = groups.map((g) => sumCounts(rows.filter((r) => r[1] === g).map((r) => r[0])));
    const bad = sums.find((r) => 'error' in r);
    if (bad && 'error' in bad) return fail(bad.error);
    const [s1, s2] = /** @type {{ x: number, rows: number }[]} */ (sums);
    return {
      ok: true, kind: 'rate2',
      x1: s1.x, t1: s1.rows * perRow, x2: s2.x, t2: s2.rows * perRow,
      diff0: readDiff0(state.summary.diff0), groups, missing,
    };
  }

  if (state.testKind === 'mcnemar') {
    if (!cols.before || !cols.after) return hint('hintPickColumns');
    const trim = (arr) => {
      let end = arr.length;
      while (end > 0 && isMissing(arr[end - 1])) end--;
      return arr.slice(0, end);
    };
    const before = trim(cols.before);
    const after = trim(cols.after);
    if (before.length !== after.length) return fail('errPairsLength');
    const pairs = [];
    let missing = 0;
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (isMissing(b) || isMissing(a)) {
        if (!(isMissing(b) && isMissing(a))) missing++;
        continue;
      }
      pairs.push([String(b).trim(), String(a).trim()]);
    }
    const levels = distinctValues(pairs.flat());
    if (levels.length !== 2) return fail('errPairLevels');
    const event = pickEvent(state.eventValue, levels);
    const table = [[0, 0], [0, 0]];
    for (const [b, a] of pairs) table[b === event ? 0 : 1][a === event ? 0 : 1]++;
    return { ok: true, kind: 'mcnemar', table, labels: readLabels(state), missing };
  }

  if (state.testKind === 'one') {
    if (!cols.response) return hint('hintPickColumns');
    const levels = distinctValues(cols.response);
    if (levels.length !== 2) return fail('errResponseLevels');
    const event = pickEvent(state.eventValue, levels);
    let x = 0;
    let n = 0;
    let missing = 0;
    for (const v of cols.response) {
      if (isMissing(v)) { missing++; continue; }
      n++;
      if (String(v).trim() === event) x++;
    }
    const p = readP0(state);
    if ('error' in p) return fail(p.error);
    return { ok: true, kind: 'one', x, n, p0: p.p0, missing };
  }

  if (state.testKind === 'two') {
    if (!cols.response || !cols.group) return hint('hintPickColumns');
    const pairs = [];
    let missing = 0;
    const len = Math.max(cols.response.length, cols.group.length);
    for (let i = 0; i < len; i++) {
      const r = cols.response[i];
      const g = cols.group[i];
      if (isMissing(r) || isMissing(g)) {
        if (!(isMissing(r) && isMissing(g))) missing++;
        continue;
      }
      pairs.push([String(r).trim(), String(g).trim()]);
    }
    const groups = distinctValues(pairs.map((p) => p[1]));
    if (groups.length !== 2) return fail('errGroupLevels');
    const levels = distinctValues(pairs.map((p) => p[0]));
    if (levels.length !== 2) return fail('errResponseLevels');
    const event = pickEvent(state.eventValue, levels);
    const inGroup = (g) => pairs.filter((p) => p[1] === g);
    const s1 = inGroup(groups[0]);
    const s2 = inGroup(groups[1]);
    return {
      ok: true,
      kind: 'two',
      x1: s1.filter((p) => p[0] === event).length,
      n1: s1.length,
      x2: s2.filter((p) => p[0] === event).length,
      n2: s2.length,
      groups,
      missing,
    };
  }

  if (!cols.rowVar || !cols.colVar) return hint('hintPickColumns');
  const pairs = [];
  let missing = 0;
  const len = Math.max(cols.rowVar.length, cols.colVar.length);
  for (let i = 0; i < len; i++) {
    const r = cols.rowVar[i];
    const c = cols.colVar[i];
    if (isMissing(r) || isMissing(c)) {
      if (!(isMissing(r) && isMissing(c))) missing++;
      continue;
    }
    pairs.push([String(r).trim(), String(c).trim()]);
  }
  const rows = distinctValues(pairs.map((p) => p[0]));
  const colsOut = distinctValues(pairs.map((p) => p[1]));
  if (rows.length < 2 || colsOut.length < 2) return fail('errTableTooSmall');
  const counts = rows.map(() => colsOut.map(() => 0));
  for (const [r, c] of pairs) counts[rows.indexOf(r)][colsOut.indexOf(c)]++;
  return { ok: true, kind: 'assoc', rows, cols: colsOut, counts, missing };
}
