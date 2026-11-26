/**
 * Aufgabenliste: die Kachel (tile/tile.js) ohne DOM. Größe, Präfix,
 * Einstellungen, Anzeige-Daten gegen die Werte der Altkachel (gespeicherter
 * Stand in Altform, die Kachel migriert beim Lesen), `topN`, `showDone`, der
 * Leerzustand und das Zieldatum nach App-Sprache.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import tile from '../../../js/modules/todo/tile/tile.js';
import descriptor from '../../../js/modules/todo/module.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';

/** i18n wie im Dashboard ohne Texte: jeder Schlüssel steht für sich. @param {string} lang */
const i18nOf = (lang) => ({ t: (k) => k, getLanguage: () => lang });

/** @param {any} state @param {object} [overrides] @param {string} [lang] */
function vmOf(state, overrides = {}, lang = 'de') {
  const settings = resolveSettings(validateSchema(tile.settings), overrides);
  return tile.viewModel({ tileId: 't', instanceId: 'i', state, settings, i18n: i18nOf(lang), theme: 'light',
    chartManager: null, stateManager: null });
}

/** Stand der Altkachel-Tests (ohne `_schema`). */
const TODO_STATE = {
  items: [
    { id: 'a', text: 'Past', owner: 'Ann', due: '2000-01-01', status: 'open' },
    { id: 'b', text: 'Future', owner: 'Bob', due: '2999-01-01', status: 'blocked' },
    { id: 'c', text: 'Undated', status: 'in-progress' },
    { id: 'd', text: 'Finished', due: '2000-01-01', status: 'done' },
  ],
};

suite('todo Kachel: Vertrag', () => {
  test('Größe, Präfix und Vorlage; Deskriptor wie im Manifest', () => {
    assertDeepEqual(tile.size, { defaultW: 3, defaultH: 10, minW: 2, minH: 6 });
    assertEqual(tile.titlePrefix, 'Todo');
    assertEqual(tile.template, 'js/modules/todo/resources/tile.html');
    assertEqual(descriptor.id, 'todo');
    assertEqual(descriptor.group, 'team');
    assertDeepEqual(descriptor.allowedPhases, ['define']);
    assertDeepEqual(descriptor.cycles.eightd, { phase: 'team', allowedPhases: ['team', 'containment'] });
  });

  test('ohne eigenes enumerate: die Kachel-Id ist todo:<instanceId> wie bisher', () => {
    assertEqual(tile.enumerate, undefined);
  });

  test('Einstellungen: topN 1–10 (5), showDone (aus), Etiketten der Altkachel', () => {
    const { topN, showDone } = tile.settings;
    assertEqual(topN.type, 'number');
    assertEqual(topN.min, 1);
    assertEqual(topN.max, 10);
    assertEqual(topN.default, 5);
    assertEqual(showDone.type, 'boolean');
    assertEqual(showDone.default, false);
    assertEqual(topN.helpKey, 'modules.todo.tile.settings.topN.help');
    assertEqual(showDone.helpKey, 'modules.todo.tile.settings.showDone.help');
  });
});

suite('todo Kachel: Anzeige', () => {
  test('Zähler, Balken und nächste Aufgaben wie die Altkachel', () => {
    const vm = vmOf(TODO_STATE);
    assertEqual(vm.empty, null);
    assertDeepEqual(vm.summary.map((s) => [s.status, s.count]), [['open', '1'], ['in-progress', '1'], ['blocked', '1']]);
    assertEqual(vm.segments[0].style, 'width:33.33333333333333%;background:var(--color-text-tertiary)');
    assertEqual(vm.nextLabel, 'dashboard.todoNextDue');
    assertDeepEqual(vm.next.map((n) => n.text), ['Past', 'Future', 'Undated']);
    assertDeepEqual(vm.next[0], { modifier: 'dashboard-todo__overdue', title: 'dashboard.todoOverdue', text: 'Past', owner: 'Ann', due: '01.01.2000' });
    assertDeepEqual(vm.next[2], { modifier: '', title: null, text: 'Undated', owner: null, due: '—' });
  });

  test('Zieldatum nach App-Sprache; Text ohne Datum bleibt', () => {
    assertEqual(vmOf(TODO_STATE, {}, 'en').next[0].due, '01/01/2000');
    // Englisch wie der Kalender: Tag vor Monat (en-GB)
    assertEqual(vmOf({ items: [{ id: 'y', text: 'T', due: '2026-03-04', status: 'open' }] }, {}, 'en').next[0].due, '04/03/2026');
    const vm = vmOf({ items: [{ id: 'x', text: 'KW', due: 'KW 23', status: 'open' }] });
    assertEqual(vm.next[0].due, 'KW 23');
    assertEqual(vm.next[0].modifier, '');
  });

  test('topN begrenzt die Liste', () => {
    assertEqual(vmOf(TODO_STATE, { topN: 1 }).next.length, 1);
  });

  test('showDone zählt erledigte mit', () => {
    assertDeepEqual(vmOf(TODO_STATE).segments.map((s) => s.key), ['open', 'in-progress', 'blocked']);
    assertDeepEqual(vmOf(TODO_STATE, { showDone: true }).segments.map((s) => s.key), ['open', 'in-progress', 'done', 'blocked']);
  });

  test('Leerzustand ohne Aufgaben, auch ohne Stand', () => {
    for (const s of [{ items: [] }, undefined, null]) {
      const vm = vmOf(s);
      assertEqual(vm.empty, 'dashboard.todoEmpty');
      assertDeepEqual(vm.summary, []);
      assertDeepEqual(vm.segments, []);
      assertEqual(vm.nextLabel, null);
    }
  });
});
