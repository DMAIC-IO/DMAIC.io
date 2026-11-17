/**
 * D.Mike — Auswahlrechnung des Rasters (datagrid/view/selection.js)
 *
 * Reine Funktionen über die Auswahl als Ansichtszustand. Die Form entspricht
 * der gespeicherten Auswahl des Altgitters, ergänzt um `extraCols`
 * (Strg+Klick auf Spaltenköpfe, Ruling R7):
 * `{ startCol, startRow, endCol, endRow, activeCol, activeRow, extraCols }`.
 * `start*` ist der Anker, `end*` wandert beim Erweitern.
 */

/**
 * @typedef {{ startCol: number, startRow: number, endCol: number, endRow: number,
 *   activeCol: number, activeRow: number, extraCols: number[] }} GridSelection
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** @param {number} c @param {number} r @returns {GridSelection} Einzelzelle */
export function single(c, r) {
  return { startCol: c, startRow: r, endCol: c, endRow: r, activeCol: c, activeRow: r, extraCols: [] };
}

/**
 * Rechteck aus Ecken; Anker und aktive Zelle liegen auf (c0, r0).
 * @returns {GridSelection}
 */
export function rect(c0, r0, c1, r1) {
  return { startCol: c0, startRow: r0, endCol: c1, endRow: r1, activeCol: c0, activeRow: r0, extraCols: [] };
}

/** @param {GridSelection} sel @returns {{ c0: number, r0: number, c1: number, r1: number }} geordnetes Rechteck */
export function rangeOf(sel) {
  return {
    c0: Math.min(sel.startCol, sel.endCol), c1: Math.max(sel.startCol, sel.endCol),
    r0: Math.min(sel.startRow, sel.endRow), r1: Math.max(sel.startRow, sel.endRow),
  };
}

/** @param {GridSelection|null} sel @returns {boolean} genau eine Zelle, keine Zusatzspalten */
export function isSingle(sel) {
  return Boolean(sel) && sel.startCol === sel.endCol && sel.startRow === sel.endRow && !sel.extraCols.length;
}

/**
 * Bringt eine (gespeicherte oder veraltete) Auswahl in die Grenzen des Blatts.
 * @param {any} sel @param {number} nCols @param {number} nRows
 * @returns {GridSelection|null} `null`, wenn das Blatt leer ist oder die Form nicht passt
 */
export function clampSelection(sel, nCols, nRows) {
  if (!sel || typeof sel !== 'object' || nCols < 1 || nRows < 1) return null;
  const num = (v) => (Number.isInteger(v) ? v : 0);
  const cc = (v) => clamp(num(v), 0, nCols - 1);
  const cr = (v) => clamp(num(v), 0, nRows - 1);
  const extra = Array.isArray(sel.extraCols)
    ? [...new Set(sel.extraCols.filter((c) => Number.isInteger(c) && c >= 0 && c < nCols))]
    : [];
  return {
    startCol: cc(sel.startCol), startRow: cr(sel.startRow), endCol: cc(sel.endCol), endRow: cr(sel.endRow),
    activeCol: cc(sel.activeCol ?? sel.startCol), activeRow: cr(sel.activeRow ?? sel.startRow), extraCols: extra,
  };
}

/** Verschiebt das Ende (Shift+Pfeil); der Anker bleibt. */
export function extendBy(sel, dc, dr, nCols, nRows) {
  return { ...sel, endCol: clamp(sel.endCol + dc, 0, nCols - 1), endRow: clamp(sel.endRow + dr, 0, nRows - 1), extraCols: [] };
}

/** Setzt das Ende auf eine Zelle (Shift+Klick, Ziehen). */
export function extendTo(sel, c, r) {
  return { ...sel, endCol: c, endRow: r, extraCols: [] };
}

/** Neue Einzelzelle neben der aktiven, an den Rändern geklammert (Pfeile, Tab, Enter). */
export function moveBy(sel, dc, dr, nCols, nRows) {
  return single(clamp(sel.activeCol + dc, 0, nCols - 1), clamp(sel.activeRow + dr, 0, nRows - 1));
}

/** Ganze Spalte. */
export function column(c, nRows) {
  return { startCol: c, startRow: 0, endCol: c, endRow: nRows - 1, activeCol: c, activeRow: 0, extraCols: [] };
}

/** Ganze Zeile. */
export function row(r, nCols) {
  return { startCol: 0, startRow: r, endCol: nCols - 1, endRow: r, activeCol: 0, activeRow: r, extraCols: [] };
}

/** Alle Zellen; `null` bei leerem Blatt. */
export function all(nCols, nRows) {
  return nCols && nRows ? rect(0, 0, nCols - 1, nRows - 1) : null;
}

/**
 * Strg+Klick auf einen Spaltenkopf (wie `DataGrid.toggleColumnSelection`):
 * die Spalte kommt in die Vereinigung oder fällt heraus. Der Anker wird die
 * angeklickte Spalte, sonst die kleinste verbleibende.
 * @returns {GridSelection|null} `null`, wenn keine Spalte bleibt
 */
export function toggleColumn(sel, c, nRows) {
  const union = new Set(selectedColumns(sel));
  if (union.has(c)) union.delete(c); else union.add(c);
  if (!union.size) return null;
  const anchor = union.has(c) ? c : Math.min(...union);
  union.delete(anchor);
  return { ...column(anchor, nRows), extraCols: [...union].sort((a, b) => a - b) };
}

/** @param {GridSelection|null} sel @returns {number[]} gewählte Spalten, aufsteigend */
export function selectedColumns(sel) {
  if (!sel) return [];
  const { c0, c1 } = rangeOf(sel);
  const set = new Set(sel.extraCols);
  for (let c = c0; c <= c1; c++) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** @returns {boolean} Zelle liegt im Rechteck oder in einer Zusatzspalte */
export function contains(sel, c, r) {
  if (!sel) return false;
  const { c0, c1, r0, r1 } = rangeOf(sel);
  if (c >= c0 && c <= c1 && r >= r0 && r <= r1) return true;
  return sel.extraCols.includes(c);
}
