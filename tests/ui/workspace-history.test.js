/**
 * Workspace: Rückgängig/Wiederholen im Tab-Bereich und die Kürzel dazu.
 */
import { suite, test, assertEqual, assertTrue, beforeEach, afterEach } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';
import { setContextHelpConfig } from '../../js/core/context-help.js';

const TABLE = {
  'history.undo': 'Rückgängig',
  'history.redo': 'Wiederholen',
  'history.undoHelp': 'Nimmt die letzte Änderung zurück.',
  'history.redoHelp': 'Stellt die zurückgenommene Änderung wieder her.',
};

const i18n = {
  exists: (key) => Object.prototype.hasOwnProperty.call(TABLE, key),
  t: (key) => TABLE[key] ?? key,
  tf: () => (key) => TABLE[key] ?? key,
  getLanguage: () => 'de',
};

const HISTORY_ACTIONS = [
  { icon: 'action.undo', title: 'history.undo', history: 'undo' },
  { icon: 'action.redo', title: 'history.redo', history: 'redo' },
  { icon: 'action.download', title: 'history.undo' },
];

/** Eine Modulinstanz-Attrappe; `can` und `steps` lassen sich vom Test lesen. */
function makeInstance({ withHistory = true } = {}) {
  const flags = { undo: false, redo: false };
  const steps = [];
  const effects = [];
  const inst = {
    i18nKey: 'modules.probe',
    flags,
    steps,
    getActions: () => (withHistory ? HISTORY_ACTIONS : [{ icon: 'action.download', title: 'history.undo' }]),
    getActionData: () => ({}),
    historyCan: (dir) => flags[dir],
    historyStep(dir) { steps.push(dir); return true; },
    bindEffect: (fn) => { effects.push(fn); fn(); return () => {}; },
    rerun: () => effects.forEach((fn) => fn()),
  };
  return inst;
}

function makeWorkspace(inst, { completed = false } = {}) {
  const ws = Object.create(Workspace.prototype);
  ws._actionEffectDisposers = [];
  ws._i18n = i18n;
  ws._stateManager = { isCompleted: () => completed };
  ws._instances = new Map([['i1', inst]]);
  ws._activeInstanceId = 'i1';
  ws._tabsEl = document.createElement('div');
  ws._actionsEl = document.createElement('div');
  return ws;
}

const historyButtons = (ws) => [...ws._actionsEl.querySelectorAll('button[data-history]')];

suite('Workspace — Verlaufsknöpfe', () => {
  beforeEach(() => { setContextHelpConfig({ i18n }); });
  afterEach(() => {
    document.querySelectorAll('#dmike-context-help-descriptions').forEach((n) => n.remove());
  });

  test('Instanz mit history: zwei Knöpfe vor dem Export-Eintrag, anfangs gesperrt', () => {
    const inst = makeInstance();
    const ws = makeWorkspace(inst);
    ws._renderActions();
    const btns = [...ws._actionsEl.querySelectorAll('button')];
    assertEqual(btns[0].dataset.history, 'undo');
    assertEqual(btns[1].dataset.history, 'redo');
    assertTrue(btns[0].disabled && btns[1].disabled, 'beide gesperrt');
    assertEqual(btns.length >= 3, true, 'Export-Eintrag folgt');
  });

  test('nach einem Schritt wird der Knopf aktiv; Klick ruft historyStep', () => {
    const inst = makeInstance();
    const ws = makeWorkspace(inst);
    ws._renderActions();
    inst.flags.undo = true;
    inst.rerun();
    const [undo, redo] = historyButtons(ws);
    assertEqual(undo.disabled, false);
    assertEqual(redo.disabled, true);
    undo.click();
    assertEqual(inst.steps.join(','), 'undo');
  });

  test('Knopf trägt title und aria-describedby, kein data-help-key', () => {
    const inst = makeInstance();
    const ws = makeWorkspace(inst);
    ws._renderActions();
    const [undo] = historyButtons(ws);
    assertEqual(undo.getAttribute('title'), 'Rückgängig');
    const ref = undo.getAttribute('aria-describedby');
    assertTrue(Boolean(ref), 'aria-describedby fehlt');
    assertEqual(document.getElementById(ref).textContent, TABLE['history.undoHelp']);
    assertEqual(undo.hasAttribute('data-help-key'), false);
  });

  test('Instanz ohne history: keine Knöpfe', () => {
    const ws = makeWorkspace(makeInstance({ withHistory: false }));
    ws._renderActions();
    assertEqual(historyButtons(ws).length, 0);
  });

  test('verborgene Aktionen (ownToolbar): keine Verlaufs- und Exportknöpfe im Tab-Bereich, Strg+Z greift weiter', () => {
    const inst = makeInstance();
    inst.getActions = () => HISTORY_ACTIONS.map((a) => ({ ...a, hidden: true }));
    const ws = makeWorkspace(inst);
    ws._renderActions();
    assertEqual(ws._actionsEl.querySelectorAll('button').length, 0, 'kein Knopf');
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'z' });
    Object.defineProperty(ev, 'target', { value: document.body });
    ws._onHistoryKey(ev);
    assertEqual(inst.steps.join(','), 'undo');
  });

  test('abgeschlossenes Projekt: keine Knöpfe', () => {
    const ws = makeWorkspace(makeInstance(), { completed: true });
    ws._renderActions();
    assertEqual(historyButtons(ws).length, 0);
  });
});

suite('Workspace — Verlaufskürzel', () => {
  let ws; let inst; let handler;
  // Der Handler hängt am Ziel selbst und stoppt die Weitergabe: andere
  // Dokument-Handler der Läuferseite (liegengebliebene Gitter) sollen die
  // Prüfung von `defaultPrevented` nicht verfälschen.
  const press = (target, init) => {
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 'z', ...init });
    const local = (e) => { e.stopPropagation(); handler(e); };
    target.addEventListener('keydown', local);
    target.dispatchEvent(ev);
    target.removeEventListener('keydown', local);
    return ev;
  };
  const setup = (opts) => {
    inst = makeInstance(opts);
    ws = makeWorkspace(inst);
    handler = (e) => ws._onHistoryKey(e);
  };

  test('Strg+Z auf body ruft historyStep("undo"), Strg+Y und Strg+Shift+Z rufen "redo"', () => {
    setup();
    const ev = press(document.body);
    press(document.body, { key: 'y' });
    press(document.body, { key: 'Z', shiftKey: true });
    assertEqual(inst.steps.join(','), 'undo,redo,redo');
    assertTrue(ev.defaultPrevented, 'Browser-Rückgängig unterdrückt');
  });

  for (const [name, make] of [
    ['<input>', () => document.createElement('input')],
    ['<textarea>', () => document.createElement('textarea')],
    ['[contenteditable]', () => { const d = document.createElement('div'); d.setAttribute('contenteditable', 'true'); return d; }],
  ]) {
    test(`Fokus in ${name}: Kürzel greift nicht`, () => {
      setup();
      const el = make();
      document.body.append(el);
      try {
        const ev = press(el);
        assertEqual(inst.steps.length, 0);
        assertEqual(ev.defaultPrevented, false, 'Browser-Rückgängig bleibt');
      } finally { el.remove(); }
    });
  }

  test('Tab ohne history: Kürzel greift nicht', () => {
    setup({ withHistory: false });
    press(document.body);
    assertEqual(inst.steps.length, 0);
  });

  /** Der Container der aktiven Instanz, am Dokument; `style` verdeckt ihn. */
  const withContainer = (style) => {
    const el = document.createElement('div');
    el.style.cssText = style;
    document.body.append(el);
    ws._containers = new Map([['i1', el]]);
    return el;
  };

  test('verdeckter Arbeitsbereich (visibility: hidden, Dashboard): Kürzel greift nicht', () => {
    setup();
    const el = withContainer('visibility: hidden');
    press(document.body);
    assertEqual(inst.steps.length, 0);
    el.remove();
  });

  test('sichtbarer Arbeitsbereich: Kürzel greift', () => {
    setup();
    const el = withContainer('');
    press(document.body);
    assertEqual(inst.steps.join(','), 'undo');
    el.remove();
  });

  test('Fokus in einem offenen Dialog: Kürzel greift nicht', () => {
    setup();
    const el = withContainer('');
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    const ok = document.createElement('button');
    dlg.append(ok);
    document.body.append(dlg);
    press(ok);
    assertEqual(inst.steps.length, 0);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    const b2 = document.createElement('button');
    modal.append(b2);
    document.body.append(modal);
    press(b2);
    assertEqual(inst.steps.length, 0);
    dlg.remove(); modal.remove(); el.remove();
  });
});
