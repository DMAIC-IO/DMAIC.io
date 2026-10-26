/**
 * D.Mike — Annotation model (frame/bug-reporter/annotations.js)
 * Screenshot markings as data in IMAGE pixels. The editor
 * feeds display-pixel gestures; this model converts, clamps, normalises and
 * keeps the undo order. It also holds the crop: markings stay in pixels of
 * the whole image, toJSON() shifts them into the crop. No DOM.
 */

export const TOOLS = ['frame', 'circle', 'arrow', 'line', 'textbox'];
const MIN_SIZE = 3; // image px — anything smaller is a click, not a marking
export const MIN_CROP = 16; // image px — smallest crop edge

/**
 * Move one edge of a crop rectangle to `pos`; the opposite edge stays put.
 * Keeps the rectangle inside the image and at least MIN_CROP wide/high.
 * @param {{x:number,y:number,w:number,h:number}} rect current crop (image px)
 * @param {'left'|'right'|'top'|'bottom'} edge
 * @param {number} pos new edge coordinate (image px)
 * @param {{width:number,height:number}} image natural image size
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function dragCropEdge(rect, edge, pos, { width, height }) {
  const p = Math.round(pos);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  if (edge === 'left') left = Math.min(Math.max(p, 0), right - MIN_CROP);
  else if (edge === 'right') right = Math.max(Math.min(p, width), left + MIN_CROP);
  else if (edge === 'top') top = Math.min(Math.max(p, 0), bottom - MIN_CROP);
  else if (edge === 'bottom') bottom = Math.max(Math.min(p, height), top + MIN_CROP);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function bounds(item) {
  if (item.type === 'arrow') {
    return { x: Math.min(item.x1, item.x2), y: Math.min(item.y1, item.y2),
      w: Math.abs(item.x2 - item.x1), h: Math.abs(item.y2 - item.y1) };
  }
  if (item.type === 'line') {
    const xs = item.points.map(p => p[0]);
    const ys = item.points.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return item;
}

function shift(item, dx, dy) {
  if (item.type === 'arrow') {
    return { ...item, x1: item.x1 - dx, y1: item.y1 - dy, x2: item.x2 - dx, y2: item.y2 - dy };
  }
  if (item.type === 'line') return { ...item, points: item.points.map(([x, y]) => [x - dx, y - dy]) };
  return { ...item, x: item.x - dx, y: item.y - dy };
}

/**
 * @param {{width: number, height: number}} image natural image size
 * @returns {object} annotation model (see plan Task 3 interface)
 */
export function createAnnotationModel({ width, height }) {
  const list = [];
  const history = []; // undo order: { item } or { crop: <crop before> }
  let crop = { x: 0, y: 0, w: width, h: height };
  let scale = 1;
  let draft = null;

  const clamp = (v, min, max) => Math.min(Math.max(Math.round(v), min), max);
  const toImage = pt => [
    clamp(pt.x / scale + crop.x, crop.x, crop.x + crop.w),
    clamp(pt.y / scale + crop.y, crop.y, crop.y + crop.h),
  ];
  const isWhole = () => crop.x === 0 && crop.y === 0 && crop.w === width && crop.h === height;

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
    const b = bounds(item);
    if (item.type === 'arrow') return Math.hypot(item.x2 - item.x1, item.y2 - item.y1) >= MIN_SIZE;
    if (item.type === 'line') return Math.max(b.w, b.h) >= MIN_SIZE;
    return item.w >= MIN_SIZE && item.h >= MIN_SIZE;
  }

  function visible(item) {
    const b = bounds(item);
    return b.x <= crop.x + crop.w && b.x + b.w >= crop.x && b.y <= crop.y + crop.h && b.y + b.h >= crop.y;
  }

  return {
    /** @param {number} s display px per image px */
    setDisplayScale(s) { if (s > 0) scale = s; },
    /** @param {string} tool @param {{x:number,y:number}} pt display px, relative to the crop */
    begin(tool, pt) {
      if (!TOOLS.includes(tool)) throw new Error(`unknown tool: ${tool}`);
      const p = toImage(pt);
      draft = { tool, start: p, last: p, points: [p] };
    },
    /** @param {{x:number,y:number}} pt display px, relative to the crop */
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
      history.push({ item });
      return { ...item };
    },
    /** Drop the current draft without committing it. */
    cancel() { draft = null; },
    draft() { return shape(); },
    items() { return list.map(i => structuredClone(i)); },
    /** @param {number} index @param {string} text */
    setText(index, text) {
      const item = list[index];
      if (!item || item.type !== 'textbox') return;
      const t = String(text ?? '').trim();
      if (t) { item.text = t; return; }
      list.splice(index, 1);
      history.splice(history.findIndex(e => e.item === item), 1);
    },
    /** @returns {{x:number,y:number,w:number,h:number}} current crop in image px */
    crop() { return { ...crop }; },
    /**
     * Set the crop (clamped to the image) as one undo step.
     * @param {{x:number,y:number,w:number,h:number}} r image px
     * @returns {boolean} whether the crop changed
     */
    setCrop(r) {
      const x = clamp(r.x, 0, width - MIN_CROP);
      const y = clamp(r.y, 0, height - MIN_CROP);
      const next = {
        x, y,
        w: clamp(r.x + r.w, x + MIN_CROP, width) - x,
        h: clamp(r.y + r.h, y + MIN_CROP, height) - y,
      };
      if (next.x === crop.x && next.y === crop.y && next.w === crop.w && next.h === crop.h) return false;
      history.push({ crop });
      crop = next;
      return true;
    },
    /** @returns {boolean} whether something was undone */
    undo() {
      const entry = history.pop();
      if (!entry) return false;
      if (entry.item) list.splice(list.indexOf(entry.item), 1);
      else crop = entry.crop;
      return true;
    },
    /**
     * Uncropped: markings in image px. Cropped: `image` is the crop size,
     * `crop` its place in the captured image, markings are shifted into the
     * crop and those wholly outside it are left out.
     */
    toJSON() {
      if (isWhole()) return { image: { width, height }, items: this.items() };
      return {
        image: { width: crop.w, height: crop.h },
        crop: { ...crop },
        items: this.items().filter(visible).map(i => shift(i, crop.x, crop.y)),
      };
    },
  };
}
