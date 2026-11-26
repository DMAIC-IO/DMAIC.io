/**
 * Tests for modules/todo/domain/list.js — Status, Zählung, Überfälligkeit,
 * die nächsten fälligen Aufgaben, die Verantwortlichen und die angezeigte
 * Folge (Filter, Suche, Sortierung) wie in der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  STATUSES, SORT_COLUMNS, statusCounts, isOverdue, nextDueItems, owners, visibleItems,
} from '../../../js/modules/todo/domain/list.js';

const mk = (status, due = '', extra = {}) => ({ id: `${status}-${due}`, text: status, owner: '', due, status, cal: false, ...extra });
const VIEW = { filterStatus: 'all', filterOwner: 'all', search: '', sortCol: 'due', sortAsc: true };

suite('todo list: Status und Hilfen der Kachel', () => {
  test('vier Status und vier Sortierspalten in Listenreihenfolge', () => {
    assertDeepEqual([...STATUSES], ['open', 'in-progress', 'done', 'blocked']);
    assertDeepEqual([...SORT_COLUMNS], ['text', 'owner', 'due', 'status']);
  });

  test('statusCounts zählt jeden Status, null wo keiner', () => {
    assertDeepEqual(statusCounts([mk('open'), mk('open'), mk('blocked')]), { open: 2, 'in-progress': 0, done: 0, blocked: 1 });
  });

  test('isOverdue: vor heute und nicht erledigt; unlesbares oder fehlendes Datum nie', () => {
    assertEqual(isOverdue(mk('open', '2026-10-09'), '2026-10-10'), true);
    assertEqual(isOverdue(mk('open', '2026-10-10'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('done', '2026-01-01'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('open', '09.10.2026'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('open', 'KW 23'), '2026-10-10'), false);
    assertEqual(isOverdue(mk('open', ''), '2026-10-10'), false);
  });

  test('nextDueItems: nicht erledigt, nach Datum, ohne und unlesbar zuletzt, begrenzt', () => {
    const items = [mk('open', ''), mk('open', '2026-12-01'), mk('done', '2026-01-01'),
      mk('blocked', '2026-11-01'), mk('in-progress', 'x'), mk('open', '2026-11-15')];
    assertEqual(nextDueItems(items, 10).map((i) => i.due).join('|'), '2026-11-01|2026-11-15|2026-12-01||x');
    assertEqual(nextDueItems(items, 2).length, 2);
  });

  test('owners: ohne Leere und Doppelte, getrimmt, sortiert', () => {
    const items = [mk('open', '', { owner: 'Max ' }), mk('open', '', { owner: '' }), mk('open', '', { owner: 'Anna' }), mk('open', '', { owner: 'Max' })];
    assertDeepEqual(owners(items), ['Anna', 'Max']);
  });
});

suite('todo list: angezeigte Folge', () => {
  const items = [
    { id: 'a', text: 'B-Aufgabe', owner: 'Max', due: '2026-01-01', status: 'blocked', cal: false },
    { id: 'b', text: 'a-Aufgabe', owner: 'erika', due: '2026-12-31', status: 'open', cal: false },
    { id: 'c', text: 'Ohne Datum', owner: 'Max', due: '', status: 'done', cal: false },
  ];
  const ids = (list) => list.map((i) => i.id);

  test('liefert dieselben Objekte, keine Kopien, und lässt die Liste stehen', () => {
    const shown = visibleItems(items, { ...VIEW, sortCol: 'text' });
    assertTrue(shown.every((i) => items.includes(i)));
    assertDeepEqual(ids(items), ['a', 'b', 'c']);
  });

  test('Sortierung je Spalte, Text und Verantwortlicher ohne Groß-/Kleinschreibung, leeres Datum zuletzt', () => {
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'text' })), ['b', 'a', 'c']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'owner' })), ['b', 'a', 'c']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'due' })), ['a', 'b', 'c']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'status' })), ['b', 'c', 'a']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'status', sortAsc: false })), ['a', 'c', 'b']);
  });

  test('manual behält die gespeicherte Folge', () => {
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, sortCol: 'manual', sortAsc: false })), ['a', 'b', 'c']);
  });

  test('Statusfilter, Filter auf den Verantwortlichen (getrimmt) und Suche in Text und Verantwortlichem', () => {
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, filterStatus: 'open' })), ['b']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, filterOwner: 'Max' })), ['a', 'c']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, search: 'ERIKA' })), ['b']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, search: 'datum' })), ['c']);
    assertDeepEqual(ids(visibleItems(items, { ...VIEW, filterStatus: 'done', search: 'aufgabe' })), []);
  });
});
