/**
 * Tests for core/command-directives.js — Kommando-Primitive x-command,
 * x-command-form, x-param, x-dialog und runUiCommand.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerCommandDirectives, runUiCommand } from '../../js/core/command-directives.js';
import { defineModel, defineForm, command, text, number, oneOf, index, list, record } from '../../js/core/model.js';

const COLS = ['a', 'b'];
const Board = defineModel({
  fields: { columns: record(COLS, list(text())) },
  commands: {
    addItem: command({
      params: { col: oneOf(COLS), text: text({ trim: true, nonEmpty: true }) },
      run({ col, text: t }) { this.columns[col].push(t); },
    }),
    setItem: command({
      params: { col: oneOf(COLS), idx: index('columns[col]', { existing: true }), text: text({ trim: true, nonEmpty: true }) },
      current({ col, idx }) { return { text: this.columns[col][idx] }; },
      run({ col, idx, text: t }) { this.columns[col][idx] = t; },
    }),
    removeItem: command({
      params: { col: oneOf(COLS), idx: index('columns[col]', { existing: true }) },
      confirm({ col, idx }) { return this.columns[col][idx] === 'wichtig' ? { key: 'confirm.removeImportant', params: { n: 1 } } : null; },
      run({ col, idx }) { this.columns[col].splice(idx, 1); },
    }),
    setLimit: command({ params: { limit: number({ min: 0, max: 9, integer: true }) }, run() {} }),
  },
});

/** Vor- und Nachname als zwei Felder, ein Text als Parameter. */
const ItemForm = defineForm({
  fields: { first: text(), last: text() },
  fromParams({ text: t = '' }) { const [first = '', ...rest] = t.split(' '); return { first, last: rest.join(' ') }; },
  toParams({ first, last }) {
    if (first.trim() === '') throw Object.assign(new Error('first is empty'), { param: 'first' });
    return { text: `${first} ${last}`.trim() };
  },
});

const I18N = { t: (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k), getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Attrappe des Dialog-Dienstes mit dem Vertrag von js/ui/dialog/dialog.js:
 * `form` leiht den Inhalt aus und gibt ihn beim Schließen zurück; der
 * confirm-Griff ruft `onConfirm` (Veto mit false).
 */
function fakeDialog(asked, answer) {
  const d = {
    open: null,
    async confirm(opts) { asked.push(opts); return answer(); },
    form(opts) {
      return new Promise((resolve) => {
        const body = document.createElement('div');
        document.body.append(body);
        const home = opts.content.parentNode;
        const next = opts.content.nextSibling;
        body.append(opts.content);
        let settled = false;
        const settle = (result) => {
          if (settled) return;
          settled = true;
          home.insertBefore(opts.content, next);
          body.remove();
          d.open = null;
          resolve(result);
        };
        const api = {
          confirm: () => { if (!settled && !(opts.onConfirm && opts.onConfirm(body) === false)) settle(true); },
          cancel: () => settle(false),
          remove: () => { if (!settled && opts.onDelete(body) !== false) settle('deleted'); },
        };
        d.open = { opts, body, api };
        opts.onMount?.(body, { confirm: api.confirm, cancel: api.cancel });
      });
    },
  };
  return d;
}

let n = 0;
const mounted = [];

function build(html, { confirmAnswer = true, columns = {} } = {}) {
  registerFieldDirective(Alpine, { i18n: I18N });
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  const notified = [];
  const asked = [];
  const dialog = fakeDialog(asked, () => confirmAnswer);
  const name = `cmdTest${++n}`;
  const model = Board.fromJSON({ columns: { a: [], b: [], ...columns } });
  Alpine.data(name, () => {
    const comp = { model, moduleId: 'ct' };
    Object.defineProperty(comp, '_ui', {
      enumerable: false,
      get() { return { model: this.model, notify: (...a) => notified.push(a), dialog, i18n: I18N, moduleId: 'ct', forms: { ItemForm } }; },
    });
    return comp;
  });
  const host = document.createElement('div');
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = html;
  host.append(root);
  return { host, root, notified, asked, dialog };
}

/** Eingebaut und im Dokument (Fokus, Ereignisse). */
async function mount(html, opts) {
  while (mounted.length) mounted.pop().remove();
  const b = build(html, opts);
  document.body.append(b.host);
  mounted.push(b.host);
  Alpine.initTree(b.host);
  await flush();
  return { ...b, model: Alpine.$data(b.root).model, $: (s) => b.root.querySelector(s) };
}

/** Nur eingebaut, nicht im Dokument — für Fehler beim Einbau (kein Beobachter baut nach). */
function mountDetached(html) {
  const b = build(html);
  Alpine.initTree(b.host);
  return b;
}

suite('runUiCommand', () => {
  test('ok/result, cancelled, error — wirft nie', async () => {
    const asked = [];
    let answer = false;
    const ui = { model: Board.fromJSON({ columns: { a: ['wichtig'], b: [] } }), notify() {}, dialog: fakeDialog(asked, () => answer), i18n: I18N, moduleId: 'ct', forms: {} };
    assertDeepEqual(await runUiCommand(ui, 'removeItem', { col: 'a', idx: 0 }), { ok: false, cancelled: true });
    assertEqual(asked[0].message, 'modules.ct.confirm.removeImportant|{"n":1}');
    assertEqual(asked[0].danger, true);
    answer = true;
    assertDeepEqual(await runUiCommand(ui, 'removeItem', { col: 'a', idx: 0 }), { ok: true, result: undefined });
    const failed = await runUiCommand(ui, 'removeItem', { col: 'a', idx: 0 });
    assertEqual(failed.ok, false);
    assertTrue(/^invalid idx 0/.test(failed.error.message));
    assertEqual(failed.error.param, 'idx');
  });
});

suite('x-command', () => {
  test('Klick führt das Kommando mit festen Argumenten aus', async () => {
    const { $, model, asked } = await mount('<button x-command="removeItem" data-arg-col="a" data-arg-idx="0">x</button>', { columns: { a: ['eins', 'zwei'] } });
    $('button').click();
    await flush();
    assertDeepEqual([...model.columns.a], ['zwei']);
    assertEqual(asked.length, 0);
  });

  test('Rückfrage aus confirm: ja führt aus', async () => {
    const { $, model, asked } = await mount('<button x-command="removeItem" data-arg-col="a" data-arg-idx="0">x</button>', { columns: { a: ['wichtig'] } });
    $('button').click();
    await flush();
    assertEqual(asked.length, 1);
    assertEqual(asked[0].danger, true);
    assertDeepEqual([...model.columns.a], []);
  });

  test('Rückfrage aus confirm: nein führt nicht aus', async () => {
    const { $, model } = await mount('<button x-command="removeItem" data-arg-col="a" data-arg-idx="0">x</button>', { columns: { a: ['wichtig'] }, confirmAnswer: false });
    $('button').click();
    await flush();
    assertDeepEqual([...model.columns.a], ['wichtig']);
  });

  test('Fehler gehen an notify', async () => {
    const { $, notified } = await mount('<button x-command="removeItem" data-arg-col="a" data-arg-idx="5">x</button>', { columns: { a: ['eins'] } });
    $('button').click();
    await flush();
    assertTrue(/^invalid idx 5/.test(notified[0][0]));
    assertEqual(notified[0][1], 'error');
  });

  test('Anker aus dem Kommando, vorhandener bleibt', async () => {
    const { $ } = await mount('<button class="a" x-command="removeItem">x</button><button class="b" x-command="removeItem" data-help-key="eigen">y</button>');
    assertEqual($('.a').getAttribute('data-help-key'), 'modules.ct.actions.removeItem.help');
    assertEqual($('.b').getAttribute('data-help-key'), 'eigen');
  });

  test('unbekanntes Kommando wirft beim Einbau', () => {
    assertThrows(() => mountDetached('<button x-command="nope">x</button>'), /unknown command "nope"; available: addItem, setItem, removeItem, setLimit/);
  });

  test('aus dem Wurzelknoten herausgenommener Knopf läuft weiter (Dialog-Körper)', async () => {
    const { $, model } = await mount('<button x-command="removeItem" data-arg-col="a" data-arg-idx="0">x</button>', { columns: { a: ['eins', 'zwei'] } });
    const btn = $('button');
    document.body.append(btn);
    try {
      btn.click();
      await flush();
      assertDeepEqual([...model.columns.a], ['zwei']);
    } finally {
      btn.remove();
    }
  });
});
