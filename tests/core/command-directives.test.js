/**
 * Tests for core/command-directives.js — Kommando-Primitive x-command,
 * x-command-form, x-param, x-dialog und runUiCommand.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerCommandDirectives, runUiCommand, openDialogAt } from '../../js/core/command-directives.js';
import { defineModel, defineForm, command, text, number, oneOf, index, list, record, runCommand } from '../../js/core/model.js';

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
    pickItem: command({
      params: { col: oneOf(COLS), idx: number({ integer: true }), text: text() },
      current() { throw new Error('Eintrag gibt es nicht mehr'); },
      run() {},
    }),
    plainFail: command({ params: { text: text() }, run() { throw new Error('run must be synchronous'); } }),
    boom: command({ params: { text: text() }, run() { null.x; } }),
    guarded: command({ params: { text: text() }, run() { throw Object.assign(new Error('nein'), { invariant: 'noGo' }); } }),
    limitText: command({ params: { limit: number({ min: 0, max: 9, integer: true }), text: text() }, run() { throw new Error('zu groß'); } }),
    setLimit: command({ params: { limit: number({ min: 0, max: 9, integer: true }), rate: number({ min: 0, max: 1, default: 0.5 }) }, run() {} }),
    taken: command({ params: { text: text() }, run() { throw Object.assign(new Error('vergeben'), { param: 'text', hintKey: 'nameTaken' }); } }),
    clash: command({ params: { text: text() }, run() { throw Object.assign(new Error('Doppel'), { param: 'labels', hintKey: 'labelsClash' }); } }),
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

/** Viewmodel-Kommandos wie aus createModule({ commands }): `this` ist die Komponente. */
const VM_COMMANDS = {
  pickType: command({
    params: { type: oneOf(['bar', 'pie']), n: number({ integer: true }) },
    run({ type, n: count }) { this.picked.push({ type, n: count }); return type; },
  }),
  dropAll: command({
    params: {},
    confirm() { return { key: 'confirm.dropAll' }; },
    run() { this.picked.push('dropped'); },
  }),
  setNote: command({
    params: { note: text({ trim: true, nonEmpty: true }) },
    current() { return { note: this.note }; },
    run({ note }) { this.note = note; },
  }),
  markDone: command({ current() { return {}; }, run() { this.picked.push('done'); } }),
  markWith: command({ current() { return { x: 1 }; }, run() {} }),
};

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
    const comp = { model, moduleId: 'ct', picked: [], note: 'alt' };
    for (const [cmd, def] of Object.entries(VM_COMMANDS)) {
      comp[cmd] = function viewmodelCommand(args) { return runCommand(cmd, def, this, this.model, args); };
    }
    Object.defineProperty(comp, '_ui', {
      enumerable: false,
      get() { return { model: this.model, notify: (...a) => notified.push(a), dialog, i18n: I18N, moduleId: 'ct', forms: { ItemForm }, vmCommands: VM_COMMANDS, component: this }; },
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
  return { ...b, model: Alpine.$data(b.root).model, vm: Alpine.$data(b.root), $: (s) => b.root.querySelector(s) };
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

  // Ohne Rückfrage läuft das Kommando im Aufruf selbst, nicht erst nach einem
  // Mikrotask: das Raster meldet `gridView` über runUiCommand, und eine Aktion
  // direkt danach (Löschen im Arbeitsblatt) liest die Auswahl synchron.
  test('ohne Rückfrage läuft das Kommando synchron im Aufruf', async () => {
    const ui = { model: Board.fromJSON({ columns: { a: ['eins', 'zwei'], b: [] } }), notify() {}, dialog: fakeDialog([], () => true), i18n: I18N, moduleId: 'ct', forms: {} };
    const pending = runUiCommand(ui, 'removeItem', { col: 'a', idx: 0 });
    assertDeepEqual([...ui.model.columns.a], ['zwei'], 'vor dem ersten await ausgeführt');
    assertDeepEqual(await pending, { ok: true, result: undefined });

    const seen = [];
    const component = { note(args) { seen.push(args.v); } };
    const vmUi = { ...ui, component, vmCommands: { note: { params: { v: { type: 'number' } } } } };
    const vmPending = runUiCommand(vmUi, 'note', { v: 1 });
    assertDeepEqual(seen, [1], 'Viewmodel-Kommando ebenso');
    assertEqual((await vmPending).ok, true);
  });

  test('run wirft synchron → { ok: false, error }', async () => {
    const M = defineModel({ name: 'B', version: '1.0', fields: {}, commands: { boom: command({ params: {}, run() { throw new Error('kaputt'); } }) } });
    const ui = { model: new M(), notify() {}, dialog: fakeDialog([], () => true), i18n: I18N, moduleId: 'ct', forms: {} };
    const r = await runUiCommand(ui, 'boom', {});
    assertEqual(r.ok, false);
    assertEqual(r.error.message, 'kaputt');
  });

  test('run liefert ein Promise → { ok: false } mit Hinweis auf asyncTask', async () => {
    const M = defineModel({ name: 'C', version: '1.0', fields: {}, commands: { later: command({ params: {}, run() { return Promise.reject(new Error('spät')); } }) } });
    const ui = { model: new M(), notify() {}, dialog: fakeDialog([], () => true), i18n: I18N, moduleId: 'ct', forms: {} };
    const r = await runUiCommand(ui, 'later', {});
    assertEqual(r.ok, false);
    assertEqual(r.error.message, 'command later: run must be synchronous — use asyncTask');
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

  test('Löschknopf ohne Rückfrage des Kommandos: fragt allgemein, genau einmal', async () => {
    const html = '<button x-command="removeItem" data-arg-col="a" data-arg-idx="0"><span data-icon="action.delete"></span></button>';
    const { $, model, asked } = await mount(html, { columns: { a: ['eins'] } });
    $('button').click();
    await flush();
    assertEqual(asked.length, 1);
    assertEqual(asked[0].message, 'common.confirmDelete');
    assertDeepEqual([...model.columns.a], []);
  });

  test('Löschknopf mit Rückfrage des Kommandos: nur diese, nicht zusätzlich die allgemeine', async () => {
    const html = '<button x-command="removeItem" data-arg-col="a" data-arg-idx="0" data-confirm-delete>x</button>';
    const { $, model, asked } = await mount(html, { columns: { a: ['wichtig'] } });
    $('button').click();
    await flush();
    assertDeepEqual(asked.map((a) => a.message), ['modules.ct.confirm.removeImportant|{"n":1}']);
    assertDeepEqual([...model.columns.a], []);
  });

  test('data-confirm-delete="off" fragt ohne Rückfrage des Kommandos nicht', async () => {
    const html = '<button x-command="removeItem" data-arg-col="a" data-arg-idx="0" data-confirm-delete="off"><span data-icon="action.delete"></span></button>';
    const { $, model, asked } = await mount(html, { columns: { a: ['eins'] } });
    $('button').click();
    await flush();
    assertEqual(asked.length, 0);
    assertDeepEqual([...model.columns.a], []);
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
    assertThrows(() => mountDetached('<button x-command="nope">x</button>'), /unknown command "nope"; available: addItem, setItem, removeItem, pickItem, plainFail, boom, guarded, limitText, setLimit/);
  });

  test('Viewmodel-Kommando: Klick ruft die Methode der Komponente mit festen Argumenten', async () => {
    const { $, vm, notified } = await mount('<button x-command="pickType" data-arg-type="pie" data-arg-n="3">x</button>');
    assertEqual($('button').getAttribute('data-help-key'), 'modules.ct.actions.pickType.help');
    $('button').click();
    await flush();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.picked)), [{ type: 'pie', n: 3 }]);
    assertEqual(notified.length, 0);
  });

  test('Viewmodel-Kommando: Prüffehler gehen an notify', async () => {
    const { $, vm, notified } = await mount('<button x-command="pickType" data-arg-type="line" data-arg-n="1">x</button>');
    $('button').click();
    await flush();
    assertEqual(vm.picked.length, 0);
    assertTrue(/^invalid type "line"/.test(notified[0][0]));
    assertEqual(notified[0][1], 'error');
  });

  test('Viewmodel-Kommando: Rückfrage aus confirm, nein führt nicht aus', async () => {
    const { $, vm, asked } = await mount('<button x-command="dropAll">x</button>', { confirmAnswer: false });
    $('button').click();
    await flush();
    assertEqual(asked[0].message, 'modules.ct.confirm.dropAll');
    assertEqual(vm.picked.length, 0);
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

const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); };
const changeTo = (el, v) => { typeIn(el, v); el.dispatchEvent(new Event('change')); };
const submitForm = async (form) => { form.requestSubmit(); await flush(); };

suite('x-param — Neuformatierung beim Verlassen', () => {
  test('de: 0.5 getippt → nach change und blur „0,5“', async () => {
    const { $ } = await mount('<form x-command-form="setLimit" data-arg-limit="1"><input x-param="rate"></form>');
    const input = $('input');
    typeIn(input, '0.5');
    assertEqual(input.value, '0.5', 'beim Tippen bleibt der Text stehen');
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('blur'));
    assertEqual(input.value, '0,5');
  });

  test('en: 0,5 getippt → nach change und blur „0.5“', async () => {
    I18N.getLanguage = () => 'en';
    try {
      const { $ } = await mount('<form x-command-form="setLimit" data-arg-limit="1"><input x-param="rate"></form>');
      const input = $('input');
      typeIn(input, '0,5');
      input.dispatchEvent(new Event('change'));
      input.dispatchEvent(new Event('blur'));
      assertEqual(input.value, '0.5');
    } finally {
      I18N.getLanguage = () => 'de';
    }
  });
});

suite('x-command-form', () => {
  test('Startwerte aus current', async () => {
    const { $ } = await mount('<form x-command-form="setItem" data-arg-col="a" data-arg-idx="1"><input x-param="text"></form>', { columns: { a: ['eins', 'zwei'] } });
    assertEqual($('input').value, 'zwei');
    assertEqual(Alpine.$data($('input')).form.text, 'zwei');
  });

  test('alle freien Felder auf dem Startwert: kein Absenden', async () => {
    const { $, model, notified } = await mount('<form x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>');
    await submitForm($('form'));
    assertEqual(model.columns.a.length, 0);
    assertEqual(notified.length, 0);
    assertEqual($('input').getAttribute('aria-invalid'), null);
  });

  test('Absenden führt aus und setzt zurück', async () => {
    const { $, model } = await mount('<form x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>');
    typeIn($('input'), 'neu');
    await submitForm($('form'));
    assertDeepEqual([...model.columns.a], ['neu']);
    assertEqual($('input').value, '');
    assertEqual(Alpine.$data($('input')).form.text, '');
  });

  test('Ablehnung mit err.param markiert das freie Feld und fokussiert es', async () => {
    const { $, model, notified } = await mount('<form x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>');
    typeIn($('input'), '   ');
    await submitForm($('form'));
    assertEqual(model.columns.a.length, 0);
    assertEqual($('input').getAttribute('aria-invalid'), 'true');
    assertEqual($('input').title, 'common.inputRejectedPlain');
    assertEqual(document.activeElement, $('input'));
    assertEqual(notified.length, 0);
    typeIn($('input'), 'x');
    assertEqual($('input').getAttribute('aria-invalid'), null);
  });

  test('Programmierfehler: übersetzter Hinweis und console.error', async () => {
    const { $, notified } = await mount('<form x-command-form="boom"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    const orig = console.error;
    let count = 0;
    console.error = () => { count++; };
    try { await submitForm($('form')); } finally { console.error = orig; }
    assertEqual(count, 1);
    assertEqual(notified[0][0], 'common.inputRejectedPlain');
  });

  test('einfacher Error ohne param/invariant: übersetzter Hinweis und genau ein console.error', async () => {
    const { $, notified } = await mount('<form x-command-form="plainFail"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    const orig = console.error;
    const logged = [];
    console.error = (...a) => logged.push(a);
    try { await submitForm($('form')); } finally { console.error = orig; }
    assertEqual(logged.length, 1);
    assertEqual(logged[0][0].message, 'run must be synchronous');
    assertEqual(notified[0][0], 'common.inputRejectedPlain');
  });

  test('Invariante: Hinweis des Moduls', async () => {
    const { $, notified } = await mount('<form x-command-form="guarded"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    await submitForm($('form'));
    assertEqual(notified[0][0], 'modules.ct.invariants.noGo');
  });

  test('eigener Hinweis (hintKey) am freien Feld statt des allgemeinen', async () => {
    const { $, notified } = await mount('<form x-command-form="taken"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    await submitForm($('form'));
    assertEqual($('input').getAttribute('aria-invalid'), 'true');
    assertEqual($('input').title, 'modules.ct.nameTaken');
    assertEqual(notified.length, 0);
  });

  test('eigener Hinweis (hintKey) ohne passendes Feld: als Meldung, ohne console.error', async () => {
    const { $, notified } = await mount('<form x-command-form="clash"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    const orig = console.error;
    let count = 0;
    console.error = () => { count++; };
    try { await submitForm($('form')); } finally { console.error = orig; }
    assertEqual(count, 0);
    assertEqual(notified[0][0], 'modules.ct.labelsClash');
    assertEqual(notified[0][1], 'error');
  });

  test('fester Parameter in der Ablehnung: einfacher Hinweis ohne Bereich', async () => {
    const { $, notified } = await mount('<form x-command-form="limitText" data-arg-limit="99"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    await submitForm($('form'));
    assertEqual(notified[0][0], 'common.inputRejectedPlain');
  });

  test('sonstige Fehler an notify (Parameter weder fest noch frei)', async () => {
    const { $, notified } = await mount('<form x-command-form="addItem"><input x-param="text"></form>');
    typeIn($('input'), 'x');
    await submitForm($('form'));
    assertEqual(notified[0][0], 'common.inputRejectedPlain');
    assertEqual(notified[0][1], 'error');
  });

  test('Formular-Schema: fromParams für Startwerte, toParams beim Absenden', async () => {
    const { $, model } = await mount(
      '<form x-command-form="setItem" data-command-form-schema="ItemForm" data-arg-col="a" data-arg-idx="0"><input class="f" x-param="first"><input class="l" x-param="last"></form>',
      { columns: { a: ['Ada Lovelace'] } },
    );
    assertEqual($('.f').value, 'Ada');
    assertEqual($('.l').value, 'Lovelace');
    typeIn($('.l'), 'Byron');
    await submitForm($('form'));
    assertEqual(model.columns.a[0], 'Ada Byron');
  });

  test('Fehler aus toParams mit param markiert das Formularfeld', async () => {
    const { $, model } = await mount(
      '<form x-command-form="setItem" data-command-form-schema="ItemForm" data-arg-col="a" data-arg-idx="0"><input class="f" x-param="first"><input class="l" x-param="last"></form>',
      { columns: { a: ['Ada Lovelace'] } },
    );
    typeIn($('.f'), '');
    await submitForm($('form'));
    assertEqual($('.f').getAttribute('aria-invalid'), 'true');
    assertEqual(model.columns.a[0], 'Ada Lovelace');
  });

  test('Anker am Formular aus dem Kommando', async () => {
    const { $ } = await mount('<form x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>');
    assertEqual($('form').getAttribute('data-help-key'), 'modules.ct.actions.addItem.help');
  });

  test('fest und frei zugleich wirft beim Einbau', () => {
    assertThrows(() => mountDetached('<form x-command-form="addItem" data-arg-col="a" data-arg-text="x"><input x-param="text"></form>'),
      /x-param="text": text is also a fixed argument/);
  });

  test('unbekanntes data-command-form-schema wirft beim Einbau', () => {
    assertThrows(() => mountDetached('<form x-command-form="addItem" data-command-form-schema="Nope"></form>'), /unknown form "Nope"; available: ItemForm/);
  });

  test('x-command-form nur an einem <form>', () => {
    assertThrows(() => mountDetached('<div x-command-form="addItem"></div>'), /x-command-form must sit on a <form>/);
  });
});

suite('x-command-form mit Viewmodel-Kommando', () => {
  test('Startwerte aus current der Komponente, Absenden ruft die Methode', async () => {
    const { $, vm } = await mount('<form x-command-form="setNote"><input x-param="note"></form>');
    assertEqual($('form').getAttribute('data-help-key'), 'modules.ct.actions.setNote.help');
    assertEqual($('input').value, 'alt');
    typeIn($('input'), 'neu');
    await submitForm($('form'));
    assertEqual(vm.note, 'neu');
  });

  test('Ablehnung markiert das freie Feld', async () => {
    const { $, vm } = await mount('<form x-command-form="setNote"><input x-param="note"></form>');
    typeIn($('input'), '  ');
    await submitForm($('form'));
    assertEqual(vm.note, 'alt');
    assertEqual($('input').getAttribute('aria-invalid'), 'true');
  });

  test('x-dialog öffnet das Formular mit current und schließt bei Erfolg', async () => {
    const { $, vm, dialog } = await mount('<button class="open" x-dialog="noteForm">n</button><div hidden><form x-ref="noteForm" x-command-form="setNote"><input x-param="note"></form></div>');
    assertEqual($('.open').getAttribute('data-help-key'), 'modules.ct.actions.setNote.help');
    vm.note = 'vorher';
    $('.open').click();
    await flush();
    assertEqual(dialog.open.body.querySelector('input').value, 'vorher');
    typeIn(dialog.open.body.querySelector('input'), 'nachher');
    dialog.open.api.confirm();
    await flush();
    await flush();
    assertEqual(vm.note, 'nachher');
    assertEqual(dialog.open, null);
  });

  test('current ohne params: leer baut das Formular, ein Rückgabewert wird verständlich abgelehnt', async () => {
    const { $ } = await mount('<form x-command-form="markDone"><button type="submit">ok</button></form>');
    assertEqual($('form').getAttribute('data-help-key'), 'modules.ct.actions.markDone.help');
    assertThrows(() => mountDetached('<form x-command-form="markWith"></form>'), /markWith: current returns values, but the command takes no parameters/);
  });
});

suite('x-param', () => {
  test('Anker: Parameter des Kommandos, Feld nur im Formular-Schema, vorhandener bleibt', async () => {
    const { $ } = await mount(
      '<form class="p" x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>'
      + '<form class="q" x-command-form="setItem" data-command-form-schema="ItemForm" data-arg-col="a" data-arg-idx="0"><input class="f" x-param="first"><input class="own" x-param="last" data-help-key="eigen"></form>',
      { columns: { a: ['x y'] } },
    );
    assertEqual($('.p input').getAttribute('data-help-key'), 'modules.ct.actions.addItem.params.text');
    assertEqual($('.f').getAttribute('data-help-key'), 'modules.ct.forms.ItemForm.first.help');
    assertEqual($('.own').getAttribute('data-help-key'), 'eigen');
  });

  test('Attribute aus der Spec (Zahl)', async () => {
    const { $ } = await mount('<form x-command-form="setLimit"><input x-param="limit"></form>');
    assertEqual($('input').type, 'text');
    assertEqual($('input').getAttribute('inputmode'), 'numeric');
    for (const a of ['min', 'max', 'step']) assertEqual($('input').getAttribute(a), null, a);
  });

  test('Zahlenfeld zeigt den Wert in der App-Sprache (de: Komma)', async () => {
    const { $ } = await mount('<form x-command-form="setLimit"><input x-param="rate"></form>');
    assertEqual($('input').value, '0,5');
  });

  test('Prüfung bei change markiert, der Wert bleibt in form', async () => {
    const { $ } = await mount('<form x-command-form="addItem" data-arg-col="a"><input x-param="text"></form>');
    changeTo($('input'), '  ');
    assertEqual($('input').getAttribute('aria-invalid'), 'true');
    assertEqual(Alpine.$data($('input')).form.text, '  ');
  });

  test('ohne umschließendes Formular oder mit unbekanntem Namen wirft', () => {
    assertThrows(() => mountDetached('<input x-param="text">'), /x-param="text" needs an enclosing <form x-command-form>/);
    assertThrows(() => mountDetached('<form x-command-form="addItem"><input x-param="nope"></form>'), /x-param="nope": not a parameter of addItem/);
    assertThrows(() => mountDetached('<form x-command-form="setItem" data-command-form-schema="ItemForm"><input x-param="nope"></form>'), /x-param="nope": not a field of ItemForm/);
  });
});

const EDIT = `
  <button class="edit" x-dialog="editForm" data-arg-col="a" data-arg-idx="0" data-dialog-title="Bearbeiten">e</button>
  <div hidden><form x-ref="editForm" x-command-form="setItem"><textarea x-param="text"></textarea></form></div>`;

suite('x-dialog', () => {
  test('öffnet den Ref, kopiert die Argumente und entfernt sie beim Schließen', async () => {
    const { $, dialog } = await mount(EDIT, { columns: { a: ['eins'] } });
    const form = $('form');
    const area = $('textarea');
    $('.edit').click();
    const { opts, api } = dialog.open;
    assertEqual(opts.title, 'Bearbeiten');
    assertEqual(opts.confirmLabel, 'common.save');
    assertEqual(opts.hideConfirm, false);
    assertEqual(form.getAttribute('data-arg-idx'), '0');
    assertEqual(area.value, 'eins');
    assertEqual(document.activeElement, area);
    assertEqual(area.selectionStart, 4);
    api.cancel();
    await flush();
    assertEqual(dialog.open, null);
    assertEqual(form.getAttribute('data-arg-idx'), null);
  });

  test('Bestätigen ohne Änderung schließt wie Abbrechen', async () => {
    const { $, dialog, model } = await mount(EDIT, { columns: { a: ['eins'] } });
    $('.edit').click();
    dialog.open.api.confirm();
    await flush();
    assertEqual(dialog.open, null);
    assertEqual(model.columns.a[0], 'eins');
  });

  test('schließt nur bei Erfolg; Markierung weg nach dem Schließen', async () => {
    const { $, dialog, model } = await mount(EDIT, { columns: { a: ['eins'] } });
    const area = $('textarea');
    $('.edit').click();
    typeIn(area, '  ');
    dialog.open.api.confirm();
    await flush();
    assertTrue(dialog.open !== null, 'Ablehnung: bleibt offen');
    assertEqual(area.getAttribute('aria-invalid'), 'true');
    typeIn(area, 'neu');
    dialog.open.api.confirm();
    await flush();
    assertEqual(dialog.open, null);
    assertEqual(model.columns.a[0], 'neu');
    assertEqual(area.getAttribute('aria-invalid'), null);
  });

  test('data-dialog-command überschreibt das Kommando für dieses Öffnen', async () => {
    const { $, dialog, model } = await mount(`
      <button class="new" x-dialog="itemForm" data-arg-col="a">n</button>
      <button class="edit" x-dialog="itemForm" data-dialog-command="setItem" data-arg-col="a" data-arg-idx="0">e</button>
      <div hidden><form x-ref="itemForm" x-command-form="addItem"><input x-param="text"></form></div>`, { columns: { a: ['eins'] } });
    const input = $('input');
    $('.edit').click();
    assertEqual(input.value, 'eins');
    typeIn(input, 'zwei');
    dialog.open.api.confirm();
    await flush();
    assertDeepEqual([...model.columns.a], ['zwei']);
    $('.new').click();
    assertEqual(input.value, '');
    typeIn(input, 'drei');
    dialog.open.api.confirm();
    await flush();
    assertDeepEqual([...model.columns.a], ['zwei', 'drei']);
  });

  test('data-dialog-delete: Löschen im Fuß mit denselben Argumenten', async () => {
    const { $, dialog, model } = await mount(EDIT.replace('data-dialog-title', 'data-dialog-delete="removeItem" data-dialog-title'), { columns: { a: ['eins'] } });
    $('.edit').click();
    assertEqual(typeof dialog.open.opts.onDelete, 'function');
    dialog.open.api.remove();
    await flush();
    assertDeepEqual([...model.columns.a], []);
    assertEqual(dialog.open, null);
  });

  test('ohne Formular: kein Bestätigen-Knopf, x-command darin schließt bei Erfolg', async () => {
    const { $, dialog, model } = await mount(`
      <button class="ask" x-dialog="askRef">?</button>
      <div hidden><div x-ref="askRef"><button class="yes" x-command="removeItem" data-arg-col="a" data-arg-idx="0">ja</button></div></div>`, { columns: { a: ['eins'] } });
    $('.ask').click();
    assertEqual(dialog.open.opts.hideConfirm, true);
    dialog.open.body.querySelector('.yes').click();
    await flush();
    assertEqual(dialog.open, null);
    assertDeepEqual([...model.columns.a], []);
  });

  test('Anker am Knopf aus dem Kommando des Formulars bzw. data-dialog-command', async () => {
    const { $ } = await mount(`${EDIT}<button class="other" x-dialog="editForm" data-dialog-command="addItem">o</button>`);
    assertEqual($('.edit').getAttribute('data-help-key'), 'modules.ct.actions.setItem.help');
    assertEqual($('.other').getAttribute('data-help-key'), 'modules.ct.actions.addItem.help');
  });

  test('unbekannter Ref wirft beim Einbau', () => {
    assertThrows(() => mountDetached('<button x-dialog="nope">x</button>'), /x-dialog="nope": no element with x-ref="nope"/);
  });
});

suite('x-dialog: Fehler beim Öffnen und Argumente des Formulars', () => {
  /** Fängt unbehandelte Zurückweisungen und console.error während `fn`. */
  async function watch(fn) {
    const rejections = [];
    const errors = [];
    const onRejection = (e) => { rejections.push(e.reason); e.preventDefault(); };
    const original = console.error;
    window.addEventListener('unhandledrejection', onRejection);
    console.error = (...a) => errors.push(a);
    try {
      await fn();
      await flush();
      await flush();
    } finally {
      console.error = original;
      window.removeEventListener('unhandledrejection', onRejection);
    }
    return { rejections, errors };
  }

  test('Position gibt es nicht mehr: Meldung an den Nutzer, Steuerung zurückgesetzt', async () => {
    const { $, dialog, model, notified } = await mount(`
      <button class="edit" x-dialog="itemForm" data-dialog-command="pickItem" data-arg-col="a" data-arg-idx="5">e</button>
      <div hidden><form x-ref="itemForm" x-command-form="addItem" data-arg-col="b"><input x-param="text"></form></div>`, { columns: { a: ['eins'] } });
    const { rejections, errors } = await watch(async () => { $('.edit').click(); });
    assertEqual(rejections.length, 0, 'keine unbehandelte Zurückweisung');
    assertEqual(errors.length, 0, 'keine Konsolenmeldung');
    assertEqual(dialog.open, null);
    assertEqual(notified.length, 1);
    assertEqual(notified[0][1], 'error');
    assertEqual(notified[0][0], 'Eintrag gibt es nicht mehr');
    typeIn($('input'), 'neu');
    $('form').requestSubmit();
    await flush();
    assertDeepEqual([...model.columns.b], ['neu']);
  });

  test('Programmierfehler beim Öffnen: Konsole, keine Meldung, keine Zurückweisung', async () => {
    const { $, dialog, notified } = await mount(`
      <button class="edit" x-dialog="itemForm" data-arg-col="a">e</button>
      <div hidden><form x-ref="itemForm" x-command-form="addItem"><input x-param="col"><input x-param="text"></form></div>`);
    const { rejections, errors } = await watch(async () => { $('.edit').click(); });
    assertEqual(rejections.length, 0);
    assertEqual(errors.length, 1);
    assertTrue(/also a fixed argument/.test(String(errors[0][0]?.message)), 'Konflikt fest/frei');
    assertEqual(notified.length, 0);
    assertEqual(dialog.open, null);
  });

  test('eigenes data-arg-* des Formulars bleibt nach dem Schließen erhalten', async () => {
    const { $, dialog } = await mount(`
      <button class="edit" x-dialog="itemForm" data-arg-col="b" data-arg-idx="0">e</button>
      <div hidden><form x-ref="itemForm" x-command-form="setItem" data-arg-col="a"><input x-param="text"></form></div>`, { columns: { a: ['x'], b: ['y'] } });
    const form = $('form');
    const input = $('input');
    $('.edit').click();
    assertEqual(form.getAttribute('data-arg-col'), 'b');
    assertEqual(input.value, 'y');
    dialog.open.api.cancel();
    await flush();
    assertEqual(form.getAttribute('data-arg-col'), 'a');
    assertEqual(form.getAttribute('data-arg-idx'), null);
  });
});

suite('Startwerte data-default-arg-*', () => {
  test('Inline-Formular: Startwert beim Einbau und nach dem Leeren, änderbar', async () => {
    const { $, model } = await mount('<form x-command-form="addItem" data-default-arg-col="b"><input x-param="col"><input x-param="text"></form>');
    assertEqual($('[x-param="col"]').value, 'b');
    $('[x-param="text"]').value = 'neu';
    $('[x-param="text"]').dispatchEvent(new Event('input'));
    $('form').requestSubmit();
    await flush();
    assertDeepEqual([...model.columns.b], ['neu']);
    assertEqual($('[x-param="col"]').value, 'b');
  });

  test('current liegt über dem Startwert', async () => {
    const { $, dialog } = await mount(
      '<button x-dialog="f" data-dialog-command="setItem" data-arg-col="a" data-arg-idx="0" data-default-arg-text="Vorgabe">e</button>'
      + '<form x-ref="f" x-command-form="setItem"><input x-param="text"></form>', { columns: { a: ['Stand'] } });
    $('button').click();
    await flush();
    assertEqual(dialog.open.body.querySelector('[x-param="text"]').value, 'Stand');
    dialog.open.api.cancel();
    await flush();
  });

  test('x-dialog überträgt Startwerte und setzt sie danach zurück', async () => {
    const { $, dialog } = await mount(
      '<button x-dialog="f" data-default-arg-col="b">n</button>'
      + '<form x-ref="f" x-command-form="addItem"><input x-param="col"><input x-param="text"></form>');
    $('button').click();
    await flush();
    const form = dialog.open.body.querySelector('form');
    assertEqual(form.querySelector('[x-param="col"]').value, 'b');
    dialog.open.api.cancel();
    await flush();
    assertTrue(!$('form').hasAttribute('data-default-arg-col'));
  });

  test('unbekannter Name und Konflikt mit data-arg-* werfen beim Einbau', () => {
    assertThrows(() => mountDetached('<form x-command-form="addItem" data-default-arg-nope="x"><input x-param="text"></form>'),
      /unknown default argument "nope"; available: col, text/);
    assertThrows(() => mountDetached('<form x-command-form="addItem" data-arg-col="a" data-default-arg-col="b"><input x-param="text"></form>'),
      /data-default-arg-col: col is also a fixed argument \(data-arg-\*\)/);
    assertThrows(() => mountDetached('<button x-dialog="f" data-default-arg-nope="1">x</button><form x-ref="f" x-command-form="addItem"></form>'),
      /unknown default argument "nope"; available: col, text/);
  });

  test('ungültiger Startwert beim Öffnen: Meldung über notify', async () => {
    const { $, notified, dialog } = await mount(
      '<button x-dialog="f" data-default-arg-col="z">n</button><form x-ref="f" x-command-form="addItem"><input x-param="col"><input x-param="text"></form>');
    $('button').click();
    await flush();
    assertEqual(dialog.open, null);
    assertEqual(notified.length, 1);
    assertTrue(/invalid col "z"/.test(notified[0][0]));
  });
});

suite('Dialog aus Code und x-dialog.dblclick', () => {
  test('openDialogAt: Startwerte und Titel aus Code', async () => {
    const { root, dialog, model } = await mount('<form x-ref="f" x-command-form="addItem"><input x-param="col"><input x-param="text"></form>');
    const done = openDialogAt(Alpine, root, 'f', { defaults: { col: 'b', text: 'Entwurf' }, title: 'Neu' });
    await flush();
    assertEqual(dialog.open.opts.title, 'Neu');
    const text = dialog.open.body.querySelector('[x-param="text"]');
    assertEqual(text.value, 'Entwurf');
    // Unverändert abgesendet hieße „abbrechen“ (onUnchanged) — also eine Änderung.
    text.value = 'Entwurf 2';
    text.dispatchEvent(new Event('input'));
    dialog.open.api.confirm();
    await done;
    assertDeepEqual([...model.columns.b], ['Entwurf 2']);
    assertTrue(!root.querySelector('form').hasAttribute('data-default-arg-text'));
  });

  test('openDialogAt: feste Argumente und Löschen', async () => {
    const { root, dialog, model } = await mount('<form x-ref="f" x-command-form="setItem"><input x-param="text"></form>', { columns: { a: ['x', 'y'] } });
    const done = openDialogAt(Alpine, root, 'f', { command: 'setItem', args: { col: 'a', idx: 1 }, delete: 'removeItem' });
    await flush();
    assertEqual(dialog.open.body.querySelector('[x-param="text"]').value, 'y');
    dialog.open.api.remove();
    await done;
    assertDeepEqual([...model.columns.a], ['x']);
  });

  test('x-dialog.dblclick öffnet erst beim Doppelklick', async () => {
    const { $, dialog } = await mount('<div class="cell" x-dialog.dblclick="f" data-default-arg-col="b"></div><form x-ref="f" x-command-form="addItem"><input x-param="col"><input x-param="text"></form>');
    $('.cell').click();
    await flush();
    assertEqual(dialog.open, null);
    $('.cell').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();
    assertEqual(dialog.open.body.querySelector('[x-param="col"]').value, 'b');
    dialog.open.api.cancel();
    await flush();
  });
});
