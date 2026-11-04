/**
 * Testseite der Interaktionsschicht (Spec C §8) — ohne Alpine. Host ist ein
 * einfaches Objekt; ein Mini-Model über defineModel trägt die Kommandos
 * `moveItem` und `updateBlock`. Nach jedem Kommando wird alles neu
 * gerendert (wie Alpine), damit die Fokus-Wiederherstellung greifen muss.
 *
 * Für die POM gibt es genau ein Objekt `globalThis.interactionPlayground`.
 */
import { EventBus } from '../../../js/core/event-bus.js';
import { defineModel, command, text, number, oneOf, list, record, object, setCommandObserver } from '../../../js/core/model.js';
import { defineGesture } from '../../../js/core/interaction/define.js';
import { attachGesture } from '../../../js/core/interaction/attach.js';
import { waitForCommand } from '../../../js/core/interaction/wait.js';

const GROUPS = ['a', 'b'];                 // 'c' steht nur im DOM → Ablehnung
const LABELS = { a: 'Liste A', b: 'Liste B', c: 'Gesperrt' };
const COLS = 3;
const STEP = 30;
const DAY = 480;

const Board = defineModel({
  fields: {
    lists: record(GROUPS, list(object({ id: text(), label: text() }))),
    blocks: list(object({ id: text(), col: number({ integer: true }), start: number(), end: number() })),
  },
  commands: {
    moveItem: command({
      params: { id: text(), to: oneOf(GROUPS), index: number({ min: 0, integer: true }) },
      run({ id, to, index }) {
        const lists = { a: [...this.lists.a], b: [...this.lists.b] };
        const from = GROUPS.find((k) => lists[k].some((x) => x.id === id));
        const [moved] = lists[from].splice(lists[from].findIndex((x) => x.id === id), 1);
        lists[to].splice(Math.min(index, lists[to].length), 0, moved);
        this.lists = lists;
      },
    }),
    updateBlock: command({
      params: {
        id: text(),
        col: number({ min: 0, max: COLS - 1, integer: true }),
        start: number({ min: 0 }),
        end: number({ max: DAY }),
      },
      run({ id, col, start, end }) {
        this.blocks = this.blocks.map((b) => (b.id === id ? { id, col, start, end } : b));
      },
    }),
  },
});

const model = Board.fromJSON({
  lists: {
    a: [{ id: 'i1', label: 'Eins' }, { id: 'i2', label: 'Zwei' }, { id: 'i3', label: 'Drei' }],
    b: [{ id: 'i4', label: 'Vier' }],
  },
  blocks: [{ id: 'k1', col: 0, start: 60, end: 120 }],
});

const bus = new EventBus();
setCommandObserver(model, (cmd, args, result) => bus.emit('command:executed', { instanceId: 'playground', command: cmd, args, result }));

const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
function el(tag, attrs = {}, label = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (label) node.textContent = label;
  return node;
}

function renderLists() {
  const lists = [...GROUPS, 'c'].map((key) => {
    const ul = el('ul', { class: 'pg-list', 'data-group': key, 'data-group-label': LABELS[key], 'data-testid': `list-${key}` });
    (model.lists[key] ?? []).forEach((it, i) => {
      const li = el('li', { class: 'pg-item', 'data-index': String(i), 'data-id': it.id, 'data-testid': `item-${it.id}` });
      li.append(el('button', { type: 'button', class: 'pg-item__grip', 'data-testid': `grip-${it.id}` }, it.label));
      ul.append(li);
    });
    return ul;
  });
  $('lists').replaceChildren(...lists);
}

function renderGrid() {
  const cols = Array.from({ length: COLS }, (_, c) => {
    const col = el('div', { class: 'pg-col', 'data-column': String(c), 'data-testid': `col-${c}` });
    for (let s = 0; s < DAY / STEP; s++) {
      col.append(el('div', { class: 'pg-slot', 'data-col': String(c), 'data-min': String(s * STEP), 'data-testid': `slot-${c}-${s}` }));
    }
    for (const b of model.blocks.filter((x) => x.col === c)) {
      const block = el('div', { class: 'pg-block', 'data-id': b.id, 'data-testid': `block-${b.id}` });
      block.style.top = `${b.start}px`;
      block.style.height = `${b.end - b.start}px`;
      block.append(
        el('button', { type: 'button', class: 'pg-block__edge', 'data-edge': 'start', 'data-id': b.id, 'data-testid': `edge-start-${b.id}` }),
        el('button', { type: 'button', class: 'pg-block__body', 'data-id': b.id, 'data-testid': `body-${b.id}` }, b.id),
        el('button', { type: 'button', class: 'pg-block__edge', 'data-edge': 'end', 'data-id': b.id, 'data-testid': `edge-end-${b.id}` }),
      );
      col.append(block);
    }
    return col;
  });
  $('grid').replaceChildren(...cols);
}

function render() {
  renderLists();
  renderGrid();
  $('state').textContent = JSON.stringify(model.toJSON());
}

let count = 0;
let clicks = 0;
bus.on('command:executed', () => { count += 1; render(); });

const host = {
  show(kind, pos) { $('preview').textContent = pos ? `${kind} ${JSON.stringify(pos)}` : ''; },
  idAt(pos) { return model.lists[pos.group][pos.index].id; },
  blockPos(id) { const b = model.blocks.find((x) => x.id === id); return { id: b.id, col: b.col, start: b.start, end: b.end }; },
  openNew(col, start, end) { $('actions').textContent += `openNew ${col} ${start} ${end}\n`; },
};

/** Spalte, Start und Ende im Tag halten; Dauer bleibt. */
function clampMove(pos) {
  const len = pos.end - pos.start;
  const col = Math.max(0, Math.min(COLS - 1, pos.col));
  const start = Math.max(0, Math.min(DAY - len, pos.start));
  return { ...pos, col, start, end: start + len };
}

const reorderItem = defineGesture({
  kind: 'reorder',
  handle: '.pg-item__grip',
  preview(pos) { this.show('reorder', pos); },
  toCommand(from, to) { return ['moveItem', { id: this.idAt(from), to: to.group, index: to.index }]; },
});

const moveBlock = defineGesture({
  kind: 'move',
  handle: '.pg-block__body',
  start(el) { return this.blockPos(el.dataset.id); },
  locate(point, ctx, from) {
    const col = ctx.columnAt(point.x);
    if (col === null) return null;
    const delta = ctx.snap(point.y - ctx.origin.y, STEP);
    return { ...from, col, start: from.start + delta, end: from.end + delta };
  },
  step(pos, dir) { return { ...pos, col: pos.col + dir.x, start: pos.start + STEP * dir.y, end: pos.end + STEP * dir.y }; },
  clamp(pos) { return clampMove(pos); },
  preview(pos) { this.show('move', pos); },
  toCommand(from, to) { return ['updateBlock', { id: to.id, col: to.col, start: to.start, end: to.end }]; },
  announce(pos) { return `Spalte ${pos.col + 1}, ${pos.start} bis ${pos.end}`; },
});

const resizeBlock = defineGesture({
  kind: 'resize',
  handle: '.pg-block__edge',
  start(el) { return this.blockPos(el.dataset.id); },
  locate(point, ctx, from) {
    const delta = ctx.snap(point.y - ctx.origin.y, STEP);
    return from.edge === 'start' ? { ...from, start: from.start + delta } : { ...from, end: from.end + delta };
  },
  step(pos, dir) {
    const d = STEP * (dir.y || dir.x);
    return pos.edge === 'start' ? { ...pos, start: pos.start + d } : { ...pos, end: pos.end + d };
  },
  clamp(pos) {
    if (pos.edge === 'start') return { ...pos, start: Math.max(0, Math.min(pos.end - STEP, pos.start)) };
    return { ...pos, end: Math.min(DAY, Math.max(pos.start + STEP, pos.end)) };
  },
  preview(pos) { this.show('resize', pos); },
  toCommand(from, to) { return ['updateBlock', { id: to.id, col: to.col, start: to.start, end: to.end }]; },
});

const drawSpan = defineGesture({
  kind: 'draw',
  handle: '.pg-slot',
  start(el) { return { col: Number(el.dataset.col), min: Number(el.dataset.min) }; },
  locate(point, ctx, from) {
    const top = ctx.root.querySelector(`[data-column="${from.col}"]`).getBoundingClientRect().top;
    return { col: from.col, min: Math.max(0, Math.min(DAY - STEP, Math.floor((point.y - top) / STEP) * STEP)) };
  },
  preview(pos) { this.show('draw', pos); },
  toAction(from, to) { this.openNew(from.col, Math.min(from.min, to.min), Math.max(from.min, to.min) + STEP); },
});

const dict = await (await fetch('../../../i18n/de.json')).json();
const t = (key, params = {}) => {
  const v = key.split('.').reduce((o, k) => o?.[k], dict);
  return typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, n) => String(params[n] ?? `{${n}}`)) : key;
};
const env = {
  execute: (name, args) => model[name](args),
  notify: (message, type) => { $('notices').textContent += `${type}: ${message}\n`; },
  t,
};

render();
attachGesture($('lists'), reorderItem, host, env);
for (const g of [moveBlock, resizeBlock, drawSpan]) attachGesture($('grid'), g, host, env);
$('lists').addEventListener('click', (e) => { if (e.target.closest('.pg-item__grip')) clicks += 1; });

let pending = null;
globalThis.interactionPlayground = {
  arm(cmd) { pending = waitForCommand(bus, { instance: 'playground', command: cmd, timeout: 5000 }); pending.catch(() => {}); },
  armed() { return pending; },
  count() { return count; },
  clicks() { return clicks; },
  state() { return model.toJSON(); },
};
document.documentElement.dataset.ready = '1';
