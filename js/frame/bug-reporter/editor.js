/**
 * D.Mike — Screenshot editor (frame/bug-reporter/editor.js)
 * Shows the captured frame scaled to the dialog, a canvas overlay for
 * markings and a tool bar. Gestures go into the annotation model in image
 * pixels; the PNG is never painted on. Imperative on purpose — pointer
 * gestures on a canvas are no case for Alpine directives.
 */
import { h } from '../../core/dom.js';
import { icon } from '../../core/icon.js';
import { createAnnotationModel, TOOLS } from './annotations.js';

const TOOL_ICON = {
  frame: 'action.draw-frame', circle: 'action.draw-circle', arrow: 'action.draw-arrow',
  line: 'action.draw-line', textbox: 'action.draw-textbox',
};
const TOOL_LABEL = {
  frame: 'toolFrame', circle: 'toolCircle', arrow: 'toolArrow', line: 'toolLine', textbox: 'toolTextbox',
};
const ARROW_HEAD = 12; // display px
const ARROW_SPREAD = 0.4; // rad

function drawItem(g, item, s) {
  g.beginPath();
  if (item.type === 'frame' || item.type === 'textbox') {
    g.rect(item.x * s, item.y * s, item.w * s, item.h * s);
  } else if (item.type === 'circle') {
    g.ellipse((item.x + item.w / 2) * s, (item.y + item.h / 2) * s, item.w / 2 * s, item.h / 2 * s, 0, 0, Math.PI * 2);
  } else if (item.type === 'arrow') {
    const [x1, y1, x2, y2] = [item.x1 * s, item.y1 * s, item.x2 * s, item.y2 * s];
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.moveTo(x2, y2); g.lineTo(x2 - ARROW_HEAD * Math.cos(a - ARROW_SPREAD), y2 - ARROW_HEAD * Math.sin(a - ARROW_SPREAD));
    g.moveTo(x2, y2); g.lineTo(x2 - ARROW_HEAD * Math.cos(a + ARROW_SPREAD), y2 - ARROW_HEAD * Math.sin(a + ARROW_SPREAD));
  } else if (item.type === 'line') {
    item.points.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  }
  g.stroke();
  if (item.type === 'textbox' && item.text) {
    g.fillText(item.text, item.x * s + 4, item.y * s + 4, Math.max(item.w * s - 8, 10));
  }
}

/**
 * Mount the screenshot editor into an empty host element.
 * @param {HTMLElement} host empty container inside the describe dialog
 * @param {{blob: Blob, width: number, height: number, t: (key: string) => string}} opts
 * @returns {{model: object, commitPending: () => void, destroy: () => void}}
 */
export function mountEditor(host, { blob, width, height, t }) {
  const model = createAnnotationModel({ width, height });
  const url = URL.createObjectURL(blob);
  let tool = 'frame';
  let scale = 1;
  let pending = null; // { index, input }

  const img = h('img', { class: 'bug-editor__image', src: url, alt: '', draggable: 'false' });
  const canvas = h('canvas', { class: 'bug-editor__canvas' });
  const stage = h('div', { class: 'bug-editor__stage' }, img, canvas);
  const toolButtons = TOOLS.map(name => h('button', {
    type: 'button', class: 'bug-editor__tool btn btn--icon', 'data-tool': name,
    title: t(TOOL_LABEL[name]), 'aria-label': t(TOOL_LABEL[name]),
    'aria-pressed': String(name === tool),
  }, icon(TOOL_ICON[name], { size: 'sm' })));
  const undoBtn = h('button', {
    type: 'button', class: 'bug-editor__undo btn btn--icon', title: t('undo'), 'aria-label': t('undo'),
  }, icon('action.undo', { size: 'sm' }));
  const root = h('div', { class: 'bug-editor' },
    h('div', { class: 'bug-editor__tools', role: 'toolbar' }, ...toolButtons, undoBtn), stage);
  host.append(root);

  function redraw() {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const style = getComputedStyle(root);
    g.strokeStyle = style.getPropertyValue('--color-accent').trim();
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 2;
    g.font = `14px ${style.fontFamily}`;
    g.textBaseline = 'top';
    for (const item of model.items()) drawItem(g, item, scale);
    const d = model.draft();
    if (d) drawItem(g, d, scale);
  }

  function layout() {
    const shown = img.clientWidth || width;
    scale = shown / width;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    model.setDisplayScale(scale);
    redraw();
  }

  function commitPending() {
    if (!pending) return;
    const { index, input } = pending;
    pending = null;
    model.setText(index, input.value);
    input.remove();
    redraw();
  }

  function discardPending() {
    if (!pending) return;
    pending.input.value = '';
    commitPending(); // empty text removes the textbox from the model
  }

  function openTextInput(item) {
    const index = model.items().length - 1;
    // data-dialog-owns-escape: the dialog service handles Escape in a
    // window capture listener, before this input sees it. The mark makes it
    // pass Escape through while the input exists, so Escape discards this
    // textbox instead of cancelling the whole report.
    const input = h('textarea', {
      class: 'bug-editor__textbox-input', placeholder: t('textboxPlaceholder'), rows: '2',
      'data-dialog-owns-escape': true,
    });
    Object.assign(input.style, {
      left: `${item.x * scale}px`, top: `${item.y * scale}px`,
      width: `${item.w * scale}px`, height: `${item.h * scale}px`,
    });
    pending = { index, input };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitPending(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); discardPending(); }
      // Keep Enter/Escape from bubbling to window-level shortcut handlers.
      ev.stopPropagation();
    });
    input.addEventListener('blur', commitPending);
    stage.append(input);
    input.focus();
  }

  const point = ev => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', ev => {
    commitPending();
    canvas.setPointerCapture(ev.pointerId);
    model.begin(tool, point(ev));
  });
  canvas.addEventListener('pointermove', ev => {
    if (!model.draft()) return;
    model.move(point(ev));
    redraw();
  });
  canvas.addEventListener('pointerup', ev => {
    if (!model.draft()) return;
    model.move(point(ev));
    const item = model.end();
    redraw();
    if (item?.type === 'textbox') openTextInput(item);
  });

  toolButtons.forEach(btn => btn.addEventListener('click', () => {
    commitPending();
    tool = btn.dataset.tool;
    toolButtons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  }));
  undoBtn.addEventListener('click', () => {
    if (pending) { discardPending(); return; }
    model.undo();
    redraw();
  });

  const ro = new ResizeObserver(layout);
  ro.observe(img);
  if (img.complete) layout(); else img.addEventListener('load', layout, { once: true });

  return {
    model,
    commitPending,
    destroy() {
      ro.disconnect();
      root.remove();
      URL.revokeObjectURL(url);
    },
  };
}
