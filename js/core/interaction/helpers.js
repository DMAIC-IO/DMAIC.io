/**
 * Reine Positionsrechnung für Gesten (Spec C §4, §5): Einfügeindex, Raster,
 * Spalte, Tiefenvergleich und der Kontext `ctx` für `locate`/`step`/`clamp`.
 */

/**
 * Tiefenvergleich zweier Positionen (reine Objekte, Arrays, Primitive).
 * @param {any} a @param {any} b @returns {boolean}
 */
export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

/**
 * Liegt der Punkt im Rechteck?
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {{ x: number, y: number }} point @returns {boolean}
 */
export function inside(rect, point) {
  return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
}

/**
 * Einfügeindex über die Mittelpunkte: Index des ersten Elements, dessen Mitte
 * hinter dem Zeiger liegt; sonst die Länge (anhängen).
 * @param {ArrayLike<{ getBoundingClientRect: () => DOMRect|object }>} items in DOM-Reihenfolge
 * @param {{ x: number, y: number }} point Client-Koordinaten
 * @param {'x'|'y'} [axis='y']
 * @returns {number} in [0, items.length]
 */
export function listIndexAt(items, point, axis = 'y') {
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const r = items[i].getBoundingClientRect();
    const mid = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
    if ((axis === 'x' ? point.x : point.y) < mid) return i;
  }
  return n;
}

/**
 * Auf ein Raster runden.
 * @param {number} value @param {number} step @returns {number} nie `-0`
 */
export function snap(value, step) {
  return Math.round(value / step) * step || 0;
}

/**
 * Index der Spalte, deren waagrechte Ausdehnung `x` enthält.
 * @param {ArrayLike<{ getBoundingClientRect: () => DOMRect|object }>} columns
 * @param {number} x @returns {number|null}
 */
export function columnAt(columns, x) {
  for (let i = 0; i < columns.length; i++) {
    const r = columns[i].getBoundingClientRect();
    if (x >= r.left && x < r.right) return i;
  }
  return null;
}

/**
 * Der Kontext `ctx` einer Geste.
 * @param {Element} root Container
 * @param {{ x: number, y: number }|null} [origin] Druckpunkt; `null` bei Tastatur
 * @param {'x'|'y'} [axis='y'] Achse der Liste (`reorder`)
 * @returns {Readonly<{ root: Element, origin: {x:number,y:number}|null, axis: 'x'|'y',
 *   columnAt: (x: number, selector?: string) => number|null, snap: typeof snap,
 *   listIndexAt: (items: ArrayLike<Element>, point: {x:number,y:number}, axis?: 'x'|'y') => number }>}
 */
export function makeContext(root, origin = null, axis = 'y') {
  return Object.freeze({
    root,
    origin,
    axis,
    columnAt: (x, selector = '[data-column]') => columnAt([...root.querySelectorAll(selector)], x),
    snap,
    listIndexAt: (items, point, ax = axis) => listIndexAt(items, point, ax),
  });
}
