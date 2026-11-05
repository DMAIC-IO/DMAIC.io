/**
 * Tests für Werkzeugleisten-Einträge mit `{ command, args }`
 * (`resolveActions`, `Workspace._buildActionButton`, Untereinträge).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';
import { resolveActions } from '../../js/ui/resolve-actions.js';
import { defineModel, command, text, list } from '../../js/core/model.js';

const Doc = defineModel({
  fields: { items: list(text()) },
  commands: {
    clear: command({
      params: {},
      confirm() { return this.items.length > 1 ? { key: 'confirm.clear', params: { n: this.items.length } } : null; },
      run() { this.items.splice(0); },
    }),
    add: command({ params: { text: text({ nonEmpty: true }) }, run({ text: t }) { this.items.push(t); } }),
  },
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const tf = (k) => k;

function setup(items, answer = true) {
  const model = Doc.fromJSON({ items });
  const asked = [];
  const notified = [];
  const ui = {
    model,
    notify: (...a) => notified.push(a),
    dialog: { confirm: async (o) => { asked.push(o); return answer; } },
    i18n: { t: (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k), getLanguage: () => 'de' },
    moduleId: 'ws',
    forms: {},
  };
  const inst = { i18nKey: 'modules.ws', getActionData: () => ({ _ui: ui }) };
  const ws = Object.create(Workspace.prototype);
  ws._actionEffectDisposers = [];
  return { model, asked, notified, inst, ws };
}

suite('Werkzeugleiste: Einträge mit { command, args }', () => {
  test('resolveActions reicht command und args durch, agentAction = command', () => {
    const [vm] = resolveActions([{ icon: 'action.download', title: 't', command: 'add', args: { text: 'a' } }], tf);
    assertEqual(vm.command, 'add');
    assertDeepEqual(vm.args, { text: 'a' });
    assertEqual(vm.agentAction, 'add');
    const [plain] = resolveActions([{ icon: 'action.download', title: 't' }], tf);
    assertEqual(plain.command, null);
    assertDeepEqual(plain.args, {});
  });

  test('Klick führt das Kommando aus', async () => {
    const { model, inst, ws } = setup([]);
    const [vm] = resolveActions([{ icon: 'action.download', title: 't', command: 'add', args: { text: 'neu' } }], tf);
    const btn = ws._buildActionButton(vm, inst);
    assertEqual(btn.dataset.agentAction, 'add');
    btn.click();
    await flush();
    assertDeepEqual([...model.items], ['neu']);
  });

  test('mit Rückfrage: nein lässt alles stehen', async () => {
    const { model, asked, inst, ws } = setup(['a', 'b'], false);
    const [vm] = resolveActions([{ icon: 'action.download', title: 't', command: 'clear' }], tf);
    ws._buildActionButton(vm, inst).click();
    await flush();
    assertEqual(asked[0].message, 'modules.ws.confirm.clear|{"n":2}');
    assertEqual(asked[0].danger, true);
    assertDeepEqual([...model.items], ['a', 'b']);
  });

  test('mit Rückfrage: ja führt aus', async () => {
    const { model, inst, ws } = setup(['a', 'b'], true);
    const [vm] = resolveActions([{ icon: 'action.download', title: 't', command: 'clear' }], tf);
    ws._buildActionButton(vm, inst).click();
    await flush();
    assertDeepEqual([...model.items], []);
  });

  test('Fehler per notify', async () => {
    const { notified, inst, ws } = setup([]);
    const [vm] = resolveActions([{ icon: 'action.download', title: 't', command: 'add', args: { text: '' } }], tf);
    ws._buildActionButton(vm, inst).click();
    await flush();
    assertEqual(notified[0][1], 'error');
  });

  test('Untereintrag im Dropdown mit command', async () => {
    const { model, inst, ws } = setup([]);
    const [vm] = resolveActions([{ icon: 'action.download', title: 'menu', children: [{ icon: 'action.download', title: 'x', command: 'add', args: { text: 'kind' } }] }], tf);
    const wrap = ws._buildActionDropdown(vm, inst);
    wrap.querySelector('.workspace__action-item').click();
    await flush();
    assertDeepEqual([...model.items], ['kind']);
  });
});
