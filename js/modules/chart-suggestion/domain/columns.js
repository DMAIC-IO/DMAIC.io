/**
 * D.Mike — Diagramm-Vorschlag: Spaltenhilfen. Rein.
 *
 * Zahlen- und Datumsleser, Gruppierungen für die Vorschau sowie die lebende
 * Spaltenliste samt Bezugsprüfung und gezeigter Wahl.
 */
import { CHART_COLORS } from '../../../core/chart/chart-colors.js';
import { refToKey } from '../../../core/worksheet-columns.js';
import { readColumn, columnLabel } from '../../../core/source-columns.js';
import { parseNumber } from '../../../core/number-format.js';
import { requireKnownId } from '../../../core/agent/agent-argcheck.js';

/**
 * @typedef {{ id: string, name: string, role: string, type: string, values: any[], roleConfirmed: boolean }} LiveColumn
 */

/**
 * Erste stetige Spalte als Zeitreihe; mit Datumsspalte nach Datum sortiert.
 * @param {object[]} date Datumsspalten (die erste zählt)
 * @param {object[]} cont stetige Spalten (die erste zählt)
 * @returns {{ values: number[], valueName: string, xLabel: string }|null} null ohne stetige Spalte
 */
export function collectTimeOrderedSeries(date, cont) {
  if (cont.length === 0) return null;
  const valueCol = cont[0];
  const dateCol = date[0];
  const rawVals = valueCol.values || [];
  let values;
  if (dateCol && Array.isArray(dateCol.values)) {
    const N = Math.min(dateCol.values.length, rawVals.length);
    const pairs = [];
    for (let i = 0; i < N; i++) {
      const dt = parseDateValue(dateCol.values[i]);
      const v = toNum(rawVals[i]);
      if (dt !== null && Number.isFinite(v)) pairs.push({ d: dt, v });
    }
    pairs.sort((a, b) => a.d - b.d);
    values = pairs.map(p => p.v);
  } else {
    values = rawVals.map(toNum).filter(Number.isFinite);
  }
  return { values, valueName: valueCol.name || '', xLabel: dateCol ? (dateCol.name || '') : '' };
}

/**
 * Arithmetisches Mittel; leer ergibt 0.
 * @param {number[]} arr
 * @returns {number}
 */
export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

/**
 * Zeitstempel in Millisekunden aus Date, Zahl oder Text.
 * @param {unknown} v
 * @returns {number|null} null, wenn leer oder nicht lesbar
 */
export function parseDateValue(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) { const t = v.getTime(); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const d = new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Linien über der Zeit: je Gruppenstufe oder je stetiger Spalte eine Reihe.
 * @param {object[]} date Datumsspalten (die erste zählt)
 * @param {object[]} cont stetige Spalten
 * @param {object[]} cat kategoriale Spalten
 * @returns {{ groups: Array<{ name: string, points: Array<{ d: number, v: number }> }>, xLabel: string, yLabel: string }|null}
 */
export function collectDateLineGroups(date, cont, cat) {
  if (date.length < 1 || cont.length < 1) return null;
  const dateCol = date[0];
  const rawDates = dateCol.values || [];
  if (cont.length === 1 && cat.length === 1) {
    const yCol = cont[0], gCol = cat[0];
    const yRaw = yCol.values || [], gRaw = gCol.values || [];
    const N = Math.min(rawDates.length, yRaw.length, gRaw.length);
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      const dt = parseDateValue(rawDates[i]);
      const yn = toNum(yRaw[i]);
      if (dt === null || !Number.isFinite(yn)) continue;
      const key = gRaw[i] == null ? '' : String(gRaw[i]);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ d: dt, v: yn });
    }
    return { groups: Array.from(buckets, ([name, points]) => ({ name, points })), xLabel: dateCol.name || '', yLabel: yCol.name || '' };
  }
  const groups = cont.map((yCol, idx) => {
    const yRaw = yCol.values || [];
    const n = Math.min(rawDates.length, yRaw.length);
    const points = [];
    for (let i = 0; i < n; i++) {
      const dt = parseDateValue(rawDates[i]);
      const yn = toNum(yRaw[i]);
      if (dt !== null && Number.isFinite(yn)) points.push({ d: dt, v: yn });
    }
    return { name: yCol.name || `Y${idx + 1}`, points };
  });
  return { groups, xLabel: dateCol.name || '', yLabel: cont.length === 1 ? (cont[0].name || '') : '' };
}


/**
 * Axis titles for the grouped value charts (boxplot, individual value plot),
 * matching the group layout of boxplotGroups(): one response by factor, one
 * response alone, or several responses side by side.
 * @param {object[]} cont continuous columns
 * @param {object[]} cat categorical / ordinal columns
 * @param {{ variable: string, value: string }} labels Achsentitel für den Fall mehrerer Antworten
 * @returns {{xLabel: string, yLabel: string}}
 */
export function groupedAxisLabels(cont, cat, labels) {
  if (cont.length > 1 && cat.length === 0) return { xLabel: labels.variable, yLabel: labels.value };
  return { xLabel: cat.length >= 1 ? (cat[0].name || '') : '', yLabel: cont[0]?.name || '' };
}

/**
 * Gruppen für Boxplot und Einzelwertdiagramm: mehrere Antworten nebeneinander,
 * eine Antwort allein oder eine Antwort nach Faktor.
 * @param {object[]} cont stetige Spalten
 * @param {object[]} cat kategoriale Spalten
 * @returns {Array<{ name: string, values: number[], color: string }>|null}
 */
export function boxplotGroups(cont, cat) {
  if (cont.length === 0) return null;
  if (cont.length > 1 && cat.length === 0) {
    return cont.map((c, i) => ({ name: c.name || `c${i + 1}`, values: (c.values || []).map(toNum).filter(Number.isFinite), color: CHART_COLORS[i % CHART_COLORS.length] }));
  }
  if (cont.length === 1 && cat.length === 0) {
    const c = cont[0];
    return [{ name: c.name || '', values: (c.values || []).map(toNum).filter(Number.isFinite), color: CHART_COLORS[0] }];
  }
  if (cont.length === 1 && cat.length >= 1) {
    const cVals = cont[0].values || [], gVals = cat[0].values || [];
    const buckets = new Map();
    const n = Math.min(cVals.length, gVals.length);
    for (let i = 0; i < n; i++) {
      const key = gVals[i] == null ? '' : String(gVals[i]);
      const num = toNum(cVals[i]);
      if (!Number.isFinite(num)) continue;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(num);
    }
    return Array.from(buckets.entries()).map(([name, values], i) => ({ name, values, color: CHART_COLORS[i % CHART_COLORS.length] }));
  }
  return null;
}

/**
 * Häufigkeit je Stufe; leere Werte zählen nicht.
 * @param {any[]} values
 * @returns {{ categories: string[], counts: number[] }}
 */
export function countCategories(values) {
  const counts = new Map();
  for (const v of values) {
    if (v == null || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { categories: Array.from(counts.keys()), counts: Array.from(counts.values()) };
}

/**
 * Kreuztabelle zweier kategorialer Spalten: Stufen von A als Kategorien, Stufen von B als Gruppen.
 * @param {{ values: any[] }} colA
 * @param {{ values: any[] }} colB
 * @returns {{ categories: string[], groups: Array<{ name: string, values: number[], color: string }> }}
 */
export function crossTabCategorical(colA, colB) {
  const aVals = colA.values || [], bVals = colB.values || [];
  const n = Math.min(aVals.length, bVals.length);
  const aCats = [], bCats = [];
  const aIdx = new Map(), bIdx = new Map();
  const counts = [];
  for (let i = 0; i < n; i++) {
    const av = aVals[i], bv = bVals[i];
    if (av == null || av === '' || bv == null || bv === '') continue;
    const ak = String(av), bk = String(bv);
    if (!aIdx.has(ak)) { aIdx.set(ak, aCats.length); aCats.push(ak); counts.push([]); }
    if (!bIdx.has(bk)) { bIdx.set(bk, bCats.length); bCats.push(bk); }
    const ai = aIdx.get(ak), bi = bIdx.get(bk);
    if (counts[ai][bi] == null) counts[ai][bi] = 0;
    counts[ai][bi] += 1;
  }
  const groups = bCats.map((bName, bi) => ({ name: bName, values: aCats.map((_, ai) => counts[ai][bi] || 0), color: CHART_COLORS[bi % CHART_COLORS.length] }));
  return { categories: aCats, groups };
}

/**
 * Zahl aus Wert oder Text, Komma als Dezimaltrenner.
 * @param {unknown} v
 * @returns {number} NaN, wenn leer oder keine Zahl
 */
export function toNum(v) {
  if (v == null || v === '') return NaN;
  const n = parseNumber(/** @type {string|number} */ (v));
  return n === null ? NaN : n;
}


/**
 * Die gewählten Spalten live aus dem Arbeitsblatt, gelesen über den Leser
 * `src` (`core/source.js`). Nicht auflösbare Bezüge fallen weg.
 * @param {Array<{ instanceId: string, sheetId?: string, columnId: string }>} refs
 * @param {import('../../../core/source-reader.js').Source} src
 * @returns {LiveColumn[]}
 */
export function liveColumns(refs, src) {
  const out = [];
  for (const ref of refs) {
    const col = readColumn(src, ref);
    if (!col) continue;
    out.push({
      id: ref.columnId,
      name: columnLabel(col),
      role: col.role,
      type: col.type,
      values: col.values,
      roleConfirmed: col.roleConfirmed === true,
    });
  }
  return out;
}

/**
 * Prüft die Bezüge für `setColumns`: nicht leer, jeder wählbar, jeder einmal, ein Blatt.
 * @param {unknown} refs
 * @param {string[]} pickableKeys Schlüssel der wählbaren Spalten (`refToKey`)
 * @returns {void}
 * @throws {Error} bei leerer, unbekannter, doppelter oder blattübergreifender Auswahl
 */
export function checkRefs(refs, pickableKeys) {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: a non-empty list of column references`);
  }
  for (const ref of refs) requireKnownId('ref', refToKey(ref), pickableKeys);
  if (new Set(refs.map(refToKey)).size !== refs.length) {
    throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: each column once`);
  }
  const { instanceId, sheetId } = refs[0];
  if (refs.some((r) => r.instanceId !== instanceId || r.sheetId !== sheetId)) {
    throw new Error(`invalid refs ${JSON.stringify(refs)}; allowed: columns of one sheet`);
  }
}

/**
 * Gezeigte Wahl: `pick`, wenn unter den Vorschlägen, sonst der Spitzenreiter.
 * @param {Array<{ type: string }>} suggestions
 * @param {string|null} pick
 * @returns {string|null}
 */
export function shownType(suggestions, pick) {
  if (pick && suggestions.some((s) => s.type === pick)) return pick;
  return suggestions[0]?.type ?? null;
}
