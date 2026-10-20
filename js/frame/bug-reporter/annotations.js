/**
 * D.Mike — Annotation model (frame/bug-reporter/annotations.js)
 * Screenshot markings as data in IMAGE pixels (spec decision 3). The editor
 * feeds display-pixel gestures; this model converts, clamps, normalises and
 * keeps the undo order. No DOM.
 */

export const TOOLS = ['frame', 'circle', 'arrow', 'line', 'textbox'];
const MIN_SIZE = 3; // image px — anything smaller is a click, not a marking

/**
 * @param {{width: number, height: number}} image natural image size
 * @returns {object} annotation model (see plan Task 3 interface)
 */
export function createAnnotationModel({ width, height }) {
  const list = [];
  let scale = 1;
  let draft = null;

  const clamp = (v, max) => Math.min(Math.max(Math.round(v), 0), max);
  const toImage = pt => [clamp(pt.x / scale, width), clamp(pt.y / scale, height)];

  function rect(a, b) {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]),
      w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  }

  function shape() {
    if (!draft) return null;
    const { tool, start, last, points } = draft;
    if (tool === 'arrow') return { type: 'arrow', x1: start[0], y1: start[1], x2: last[0], y2: last[1] };
    if (tool === 'line') return { type: 'line', points: points.map(p => [...p]) };
    const r = rect(start, last);
    return tool === 'textbox' ? { type: 'textbox', ...r, text: '' } : { type: tool, ...r };
  }

  function bigEnough(item) {
    if (item.type === 'arrow') return Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= MIN_SIZE;
    if (item.type === 'line') return item.points.length >= 2;
    return item.w >= MIN_SIZE && item.h >= MIN_SIZE;
  }

  return {
    /** @param {number} s display px per image px */
    setDisplayScale(s) { if (s > 0) scale = s; },
    /** @param {string} tool @param {{x:number,y:number}} pt display px */
    begin(tool, pt) {
      if (!TOOLS.includes(tool)) throw new Error(`unknown tool: ${tool}`);
      const p = toImage(pt);
      draft = { tool, start: p, last: p, points: [p] };
    },
    /** @param {{x:number,y:number}} pt display px */
    move(pt) {
      if (!draft) return;
      draft.last = toImage(pt);
      if (draft.tool === 'line') draft.points.push(draft.last);
    },
    /** @returns {object|null} the committed item, or null for a click */
    end() {
      const item = shape();
      draft = null;
      if (!item || !bigEnough(item)) return null;
      list.push(item);
      return { ...item };
    },
    draft() { return shape(); },
    items() { return list.map(i => structuredClone(i)); },
    /** @param {number} index @param {string} text */
    setText(index, text) {
      const item = list[index];
      if (!item || item.type !== 'textbox') return;
      const t = String(text ?? '').trim();
      if (t) item.text = t; else list.splice(index, 1);
    },
    /** @returns {boolean} whether something was removed */
    undo() { return list.pop() !== undefined; },
    toJSON() { return { image: { width, height }, items: this.items() }; },
  };
}
