/**
 * Tests für das Widget rich-text — Einhängen über x-field, Tippen, Wert von außen,
 * Einfügen als Klartext, Kürzel, Zähler und Grenze, Schreibschutz.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { setReadonlyLock } from '../../js/core/readonly-lock.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { defineModel, richText } from '../../js/core/model.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const Limited = defineModel({ fields: { body: richText({ maxLength: 10000 }) } });
const Free = defineModel({ fields: { body: richText() } });

const texts = {
  'richText.bold': 'Fett (Strg+B)', 'richText.italic': 'Kursiv (Strg+I)', 'richText.count': '{n} / {max}',
  'richText.boldShort': 'F', 'richText.italicShort': 'K',
};
const i18n = {
  t: (k, p = {}) => (k in texts ? texts[k].replace(/\{(\w+)\}/g, (_, x) => String(p[x])) : k),
  exists: (k) => k in texts,
  getLanguage: () => 'de',
};
let n = 0;
let registered = false;
async function mountEditor(Model, { initial = '' } = {}) {
  if (!registered) { registerFieldDirective(Alpine, { i18n, widgets: WIDGETS }); registered = true; }
  if (!Alpine.version) Alpine.start();
  const name = `rtWidget${++n}`;
  const model = new Model();
  if (initial) model.body = initial;
  const services = { eventBus: { on() {}, off() {} }, stateManager: { get: () => undefined }, i18n, moduleId: 'demo' };
  Alpine.data(name, () => {
    const comp = { model, moduleId: 'demo' };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
    return comp;
  });
  const host = document.createElement('div');
  host.innerHTML = `<div x-data="${name}"><div class="rt" x-field="model.body" aria-label="Beschreibung" placeholder="Hier schreiben"></div></div>`;
  document.body.append(host);
  Alpine.initTree(host);
  await flush();
  const field = host.querySelector('.rt');
  return {
    host, field, editor: host.querySelector('[contenteditable]'),
    model: () => Alpine.$data(host.firstElementChild).model,
  };
}
const type = (editor, text) => {
  editor.focus();
  editor.textContent = text;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
};
const paste = (editor, plain, html) => {
  const dt = new DataTransfer();
  if (html) dt.setData('text/html', html);
  dt.setData('text/plain', plain);
  editor.focus();
  document.getSelection().selectAllChildren(editor);
  document.getSelection().collapseToEnd();
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  editor.dispatchEvent(ev);
  return ev;
};

suite('Widget rich-text', () => {
  test('Editor trägt Rolle, mehrzeilig, Platzhalter und Beschriftung', async () => {
    const { host, editor } = await mountEditor(Limited);
    assertEqual(editor.getAttribute('contenteditable'), 'true');
    assertEqual(editor.getAttribute('role'), 'textbox');
    assertEqual(editor.getAttribute('aria-multiline'), 'true');
    assertEqual(editor.getAttribute('data-placeholder'), 'Hier schreiben');
    assertEqual(editor.getAttribute('aria-label'), 'Beschreibung');
    host.remove();
  });

  test('Knöpfe tragen i18n-Beschriftung', async () => {
    const { host } = await mountEditor(Limited);
    const bold = host.querySelector('[data-cmd="bold"]');
    const italic = host.querySelector('[data-cmd="italic"]');
    assertEqual(bold.getAttribute('aria-label'), 'Fett (Strg+B)');
    assertEqual(italic.getAttribute('aria-label'), 'Kursiv (Strg+I)');
    assertEqual(bold.title, 'Fett (Strg+B)');
    assertTrue(bold.textContent !== 'B' && italic.textContent !== 'I', 'Glyphen aus i18n');
    host.remove();
  });

  test('Tippen schreibt Markdown ins Model', async () => {
    const { host, editor, model } = await mountEditor(Limited);
    type(editor, 'hallo');
    assertEqual(model().body, 'hallo');
    editor.replaceChildren(document.createTextNode('a '), Object.assign(document.createElement('strong'), { textContent: 'b' }));
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    assertEqual(model().body, 'a **b**');
    host.remove();
  });

  test('Wert von außen: Anzeige neu, gleicher Wert lässt die Auswahl stehen', async () => {
    const { host, editor, model } = await mountEditor(Limited);
    model().body = 'x **fett**';
    await flush();
    assertEqual(editor.querySelector('strong').textContent, 'fett');
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.firstChild, 1);
    range.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    const first = editor.firstChild;
    model().body = 'x **fett**';
    await flush();
    assertTrue(editor.firstChild === first, 'DOM nicht neu gebaut');
    assertTrue(document.getSelection().anchorNode === first && document.getSelection().anchorOffset === 1, 'Auswahl bleibt');
    host.remove();
  });

  test('Einfügen nimmt nur Klartext', async () => {
    const { host, editor, model } = await mountEditor(Limited);
    const ev = paste(editor, 'eins', '<b>zwei</b><script>1</script>');
    assertTrue(ev.defaultPrevented);
    assertEqual(model().body, 'eins');
    assertTrue(editor.querySelector('b, script') === null);
    host.remove();
  });

  test('Strg+B setzt Fettdruck', async () => {
    const { host, editor, model } = await mountEditor(Limited, { initial: 'ab' });
    editor.focus();
    document.getSelection().selectAllChildren(editor);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
    assertEqual(model().body, '**ab**');
    host.remove();
  });

  test('Knopf Kursiv setzt Kursivdruck, ohne die Auswahl zu verlieren', async () => {
    const { host, editor, model } = await mountEditor(Limited, { initial: 'ab' });
    editor.focus();
    document.getSelection().selectAllChildren(editor);
    const btn = host.querySelector('[data-cmd="italic"]');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(down);
    assertTrue(down.defaultPrevented);
    btn.click();
    assertEqual(model().body, '*ab*');
    host.remove();
  });

  test('Zähler nur mit maxLength, in der Form n / max', async () => {
    const a = await mountEditor(Limited, { initial: '**ab** c' });
    assertEqual(a.host.querySelector('.rich-text__count').textContent, '4 / 10000');
    a.host.remove();
    const b = await mountEditor(Free);
    assertTrue(b.host.querySelector('.rich-text__count') === null);
    b.host.remove();
  });

  test('10 001 Zeichen: Ablehnung im Wertkanal, Model und Zähler bleiben beim letzten gültigen Wert', async () => {
    const { host, field, editor, model } = await mountEditor(Limited, { initial: 'gut' });
    paste(editor, 'a'.repeat(10001));
    await flush();
    assertEqual(model().body, 'gut');
    assertEqual(field.getAttribute('aria-invalid'), 'true');
    assertEqual(host.querySelector('.rich-text__count').textContent, '3 / 10000');
    assertEqual(editor.textContent, 'gut');
    host.remove();
  });

  test('10 000 Zeichen mit Fettdruck sind gültig, danach löscht die Ablehnung die Markierung', async () => {
    const { host, field, editor, model } = await mountEditor(Limited);
    paste(editor, 'a'.repeat(10001));
    assertEqual(field.getAttribute('aria-invalid'), 'true');
    model().body = `**${'a'.repeat(10000)}**`;
    await flush();
    assertEqual(host.querySelector('.rich-text__count').textContent, '10000 / 10000');
    type(editor, 'kurz');
    assertEqual(model().body, 'kurz');
    assertTrue(!field.hasAttribute('aria-invalid'));
    host.remove();
  });

  test('Schreibschutz sperrt den Editor', async () => {
    const { host, editor } = await mountEditor(Limited);
    setReadonlyLock(host, true);
    assertEqual(editor.getAttribute('contenteditable'), 'false');
    setReadonlyLock(host, false);
    assertEqual(editor.getAttribute('contenteditable'), 'true');
    host.remove();
  });

  test('Werkzeugleiste: role toolbar mit Beschriftung; Knopf wirkt auch per Tastatur (Klick durch Enter)', async () => {
    const { host, editor, model } = await mountEditor(Limited, { initial: 'ab' });
    assertEqual(host.querySelector('[role="toolbar"]').getAttribute('aria-label'), 'richText.toolbar');
    editor.focus();
    document.getSelection().selectAllChildren(editor);
    const btn = host.querySelector('[data-cmd="bold"]');
    btn.focus();
    btn.click();
    assertEqual(model().body, '**ab**');
    assertTrue(document.activeElement === editor, 'Fokus zurück im Editor');
    host.remove();
  });

  test('gesperrter Editor: Klick auf die Werkzeugleiste ändert nichts, auch nicht andere Editoren', async () => {
    const a = await mountEditor(Limited, { initial: 'aa' });
    const b = await mountEditor(Limited, { initial: 'bb' });
    a.editor.focus();
    document.getSelection().selectAllChildren(a.editor);
    setReadonlyLock(b.host, true);
    b.host.querySelector('[data-cmd="bold"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assertEqual(a.model().body, 'aa');
    assertEqual(b.model().body, 'bb');
    setReadonlyLock(b.host, false);
    a.host.remove(); b.host.remove();
  });

  test('zwei Editoren: die Werkzeugleiste von B ändert A nicht, auch wenn die Auswahl in A liegt', async () => {
    const a = await mountEditor(Limited, { initial: 'aa' });
    const b = await mountEditor(Limited, { initial: 'bb' });
    a.editor.focus();
    document.getSelection().selectAllChildren(a.editor);
    b.host.querySelector('[data-cmd="bold"]').click();
    assertEqual(a.model().body, 'aa');
    assertTrue(a.editor.querySelector('strong') === null);
    assertTrue(document.activeElement === b.editor, 'B hat den Fokus');
    b.editor.focus();
    document.getSelection().selectAllChildren(b.editor);
    b.host.querySelector('[data-cmd="bold"]').click();
    assertEqual(b.model().body, '**bb**');
    assertEqual(a.model().body, 'aa');
    a.host.remove(); b.host.remove();
  });
});
