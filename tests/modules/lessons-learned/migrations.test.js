/**
 * Tests for modules/lessons-learned/domain/migrations.js — '0→1.0' übernimmt
 * jeden Stand des alten `Lesson.fromJSON`/`Action.fromJSON`: Texte, Wertemengen
 * mit Rückfall, Phase als jeder Text, Zeitstempel, Maßnahmen nur mit Text und
 * Haken; Nicht-Objekte entfallen, fehlende ids werden fest `l<Position>`,
 * Doppelte bekommen `_`. Dazu die Vorform der goldenen Fixtures (`text` wird
 * Titel), das Altprojekt (legacy-project.json) und beide Beispiele über das Model.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0 } from '../../../js/modules/lessons-learned/domain/migrations.js';
import { State } from '../../../js/modules/lessons-learned/domain/model.js';
import { fromExample } from '../../../js/modules/lessons-learned/io/example.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'lessons-learned');

const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLES = new URL('../../../js/modules/lessons-learned/resources/examples/projects/', import.meta.url);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Eine Erfahrung in Normalform. @param {object} l */
const entry = (l) => ({
  id: '', title: '', category: 'success', phase: 'control', impact: 'medium', owner: '', description: '',
  rootCause: '', recommendation: '', actions: [], createdAt: 0, updatedAt: 0, ...l,
});

/** Alle Lessons-Zustände eines Exports. @param {any} v @param {any[]} [acc] @returns {any[]} */
function lessonStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => lessonStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'lessons-learned') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    }
    Object.values(v).forEach((x) => lessonStates(x, acc));
  }
  return acc;
}

// Die drei Instanzen der Fixture „Altprojekt“ (legacy-project.json), ohne `_schema`.
const LEGACY_A = { lessons: [
  { id: 'l1', category: 'Methodik', text: 'Temperaturführung muss automatisiert geregelt werden.', date: '2026-06-05', owner: 'Engineering', impact: 'high' },
  { id: 'l2', category: 'Kommunikation', text: 'Schichtübergabe & Rückmeldung „schriftlich“ festhalten.', date: '2026-06-08', owner: 'Produktion', impact: 'low' },
] };
const LEGACY_B = { lessons: [
  { title: 'Ohne Kennung', category: 'problem', phase: 'define', impact: 'low', owner: 'QS', description: 'Prüfplan war veraltet.', rootCause: '', recommendation: '',
    actions: [{ id: 'a1', text: 'Prüfplan anpassen', done: false, owner: 'QS', dueDate: '+7d' }, null], createdAt: 1781265600000, updatedAt: 1781265600000 },
  { id: 7, title: 'Zahl als Kennung', category: 'improve', phase: 'verify', impact: 'high', owner: '', description: '', rootCause: '', recommendation: '',
    actions: [{ text: 'Messsystem prüfen', done: true }], createdAt: 1781092800000, updatedAt: 1781092800000 },
  null,
  { id: 'b4', title: 'Doppelte Kennung A', category: 'success', phase: 3, impact: 'medium', owner: 'Team', description: '', rootCause: '', recommendation: '',
    actions: [], createdAt: 1780920000000, updatedAt: 1780920000000 },
  { id: 'b4', title: 'Doppelte Kennung B', category: 'success', phase: 'improve', impact: 'medium', owner: '', description: '', rootCause: '', recommendation: '',
    actions: [], createdAt: '-3d', updatedAt: '-3d' },
] };
const LEGACY_C = { lessons: [
  { id: 'c1', title: 'Rüstzeit halbiert durch SMED', category: 'success', phase: 'improve', impact: 'high', owner: 'M. Müller',
    description: 'Rüsten von 40 auf 18 min & ohne Nacharbeit.', rootCause: 'Interne und externe Tätigkeiten waren nicht getrennt.',
    recommendation: 'SMED-Workshop für Linie 2 „vorziehen“.',
    actions: [{ text: 'Standard für Linie 2 schreiben', done: false }, { text: 'Werkzeugwagen beschaffen', done: true }],
    createdAt: 1780488000000, updatedAt: 1780660800000 },
  { id: 'c2', title: 'Lieferant meldet Abweichungen zu spät', category: 'problem', phase: 'control', impact: 'medium', owner: 'Einkauf',
    description: '', rootCause: 'Kein vereinbarter Meldeweg.', recommendation: '',
    actions: [{ text: 'Meldeweg vertraglich festlegen', done: false }], createdAt: 1780315200000, updatedAt: 1780315200000 },
] };

suite('lessons-learned migrations — 0→1.0 wie Lesson.fromJSON', () => {
  test('leer, kein Objekt, keine Liste: keine Erfahrungen', () => {
    for (const v of [undefined, null, 5, 'x', [], {}, { lessons: 'x' }, { lessons: null }]) {
      assertEqual(json(from0(v)), json({ lessons: [] }), json(v));
    }
  });
  test('Normalform: alle Schlüssel in fester Reihenfolge, fremde entfallen', () => {
    const out = from0({ lessons: [{ id: 'a', title: 'T', extra: 1 }] });
    assertEqual(json(out), json({ lessons: [entry({ id: 'a', title: 'T' })] }));
  });
  test('Texte bleiben, Nicht-Texte werden leer', () => {
    const out = from0({ lessons: [{ id: 'a', title: 5, owner: 'O', description: null, rootCause: 'R', recommendation: [] }] });
    assertEqual(json(out.lessons[0]), json(entry({ id: 'a', owner: 'O', rootCause: 'R' })));
  });
  test('Kategorie und Wirkung: Fremdwerte auf success und medium', () => {
    const out = from0({ lessons: [
      { id: 'a', category: 'problem', impact: 'low' },
      { id: 'b', category: 'Methodik', impact: 'riesig' },
    ] });
    assertDeepEqual(out.lessons.map((l) => [l.category, l.impact]), [['problem', 'low'], ['success', 'medium']]);
  });
  test('Phase: jeder Text bleibt (auch anderer Zyklen und leer), sonst control', () => {
    const out = from0({ lessons: [{ id: 'a', phase: 'verify' }, { id: 'b', phase: '' }, { id: 'c', phase: 3 }, { id: 'd' }] });
    assertDeepEqual(out.lessons.map((l) => l.phase), ['verify', '', 'control', 'control']);
  });
  test('Zeitstempel: endliche Zahl bleibt, sonst 0', () => {
    const out = from0({ lessons: [
      { id: 'a', createdAt: 5, updatedAt: 7 }, { id: 'b', createdAt: '-3d', updatedAt: NaN }, { id: 'c', createdAt: Infinity },
    ] });
    assertDeepEqual(out.lessons.map((l) => [l.createdAt, l.updatedAt]), [[5, 7], [0, 0], [0, 0]]);
  });
  test('Maßnahmen wie Action.fromJSON: nur Text und Haken, Unbrauchbares wird leer und offen', () => {
    const out = from0({ lessons: [{ id: 'a', actions: [
      { id: 'x', text: 'T', done: true, owner: 'O', dueDate: '+7d' }, null, 'Text', { text: 5, done: 'ja' }, [],
    ] }, { id: 'b', actions: 'keine' }] });
    assertEqual(json(out.lessons[0].actions), json([
      { text: 'T', done: true }, { text: '', done: false }, { text: '', done: false }, { text: '', done: false }, { text: '', done: false },
    ]));
    assertEqual(json(out.lessons[1].actions), json([]));
  });
  test('Nicht-Objekte entfallen', () => {
    const out = from0({ lessons: [null, 5, 'x', [], { id: 'a' }] });
    assertDeepEqual(out.lessons.map((l) => l.id), ['a']);
  });
});

suite('lessons-learned migrations — ids', () => {
  test('vorhandene nichtleere Text-ids bleiben', () => {
    assertDeepEqual(from0({ lessons: [{ id: 'x' }, { id: 'l2' }] }).lessons.map((l) => l.id), ['x', 'l2']);
  });
  test('fehlend, leer oder kein Text: fest l<Position> (ab 1, Position in der Altliste)', () => {
    const out = from0({ lessons: [{}, { id: '' }, null, { id: 7 }] });
    assertDeepEqual(out.lessons.map((l) => l.id), ['l1', 'l2', 'l4']);
    assertEqual(json(from0({ lessons: [{}, { id: 7 }] })), json(from0({ lessons: [{}, { id: 7 }] })));
  });
  test('spätere Doppelte und belegte Ersatz-ids bekommen _', () => {
    const out = from0({ lessons: [{ id: 'a' }, { id: 'a' }, {}, { id: 'l3' }, { id: 'a' }] });
    assertDeepEqual(out.lessons.map((l) => l.id), ['a', 'a_', 'l3_', 'l3', 'a__']);
  });
  test('Ergebnis lädt ohne Reparatur', () => {
    const out = from0({ lessons: [{ id: 'a' }, { id: 'a' }, {}, { id: '' }] });
    const { fields } = repaired(plain(out));
    assertDeepEqual(fields, []);
  });
});

suite('lessons-learned migrations — Vorform', () => {
  test('text wird Titel, wenn title fehlt; date entfällt; createdAt 0', () => {
    const out = from0(LEGACY_A);
    assertEqual(json(out.lessons), json([
      entry({ id: 'l1', title: 'Temperaturführung muss automatisiert geregelt werden.', owner: 'Engineering', impact: 'high' }),
      entry({ id: 'l2', title: 'Schichtübergabe & Rückmeldung „schriftlich“ festhalten.', owner: 'Produktion', impact: 'low' }),
    ]));
  });
  test('ein vorhandener Titel gewinnt über text', () => {
    assertEqual(from0({ lessons: [{ id: 'a', title: 'T', text: 'X' }] }).lessons[0].title, 'T');
    assertEqual(from0({ lessons: [{ id: 'a', title: '', text: 'X' }] }).lessons[0].title, '');
  });
  for (const file of [
    'v0.2.0_single_project.json', 'v0.2.0_all_projects.json', 'v0.3.0_single_project.json', 'v0.3.0_all_projects.json',
    'v0.5.0_8d_project.json', 'v0.9.0_single_project.json', 'v1.0.0_single_project.json', 'v1.1.0_single_project.json',
    'v1.2.0_single_project.json', 'v1.3.0_single_project.json', 'v1.4.0_single_project.json', 'v1.5.0_single_project.json',
    'v1.6.0_single_project.json', 'v1.7.0_single_project.json', 'v1.8.0_single_project.json', 'v1.9.0_single_project.json',
  ]) {
    test(`goldene Fixture ${file}: Vorform lädt ohne Reparatur, Texte als Titel`, async () => {
      const states = lessonStates(await fetchJSON(new URL(file, FIXTURES)));
      assertTrue(states.length > 0, 'keine Instanz');
      for (const old of states) {
        const { m, fields } = repaired(plain(old));
        assertDeepEqual(fields, []);
        assertEqual(m.lessons.length, old.lessons.length);
        old.lessons.forEach((l, i) => {
          assertEqual(m.lessons[i].id, l.id);
          assertEqual(m.lessons[i].title, l.title ?? l.text);
          assertEqual(m.lessons[i].owner, l.owner);
        });
      }
    });
  }
});

suite('lessons-learned migrations — Altprojekt (legacy-project.json)', () => {
  test('(b) Defekte: ids fest, Doppelte mit _, null entfällt, Maßnahmen bereinigt', () => {
    const { m, fields } = repaired(plain(LEGACY_B));
    assertDeepEqual(fields, []);
    assertEqual(json(m.lessons), json([
      entry({ id: 'l1', title: 'Ohne Kennung', category: 'problem', phase: 'define', impact: 'low', owner: 'QS', description: 'Prüfplan war veraltet.',
        actions: [{ text: 'Prüfplan anpassen', done: false }, { text: '', done: false }], createdAt: 1781265600000, updatedAt: 1781265600000 }),
      entry({ id: 'l2', title: 'Zahl als Kennung', category: 'improve', phase: 'verify', impact: 'high',
        actions: [{ text: 'Messsystem prüfen', done: true }], createdAt: 1781092800000, updatedAt: 1781092800000 }),
      entry({ id: 'b4', title: 'Doppelte Kennung A', owner: 'Team', createdAt: 1780920000000, updatedAt: 1780920000000 }),
      entry({ id: 'b4_', title: 'Doppelte Kennung B', phase: 'improve' }),
    ]));
  });
  test('(c) fehlerfrei: unverändert bis auf _schema', () => {
    const m = State.fromJSON(plain(LEGACY_C));
    const { _schema, ...rest } = plain(m.toJSON());
    assertEqual(json(rest), json(LEGACY_C));
    assertDeepEqual(_schema, { name: 'lessons-learned', version: '1.0' });
  });
  test('ein Stand ohne _schema zeigt bei jedem Laden dieselben ids', () => {
    assertEqual(json(State.fromJSON(plain(LEGACY_B)).toJSON()), json(State.fromJSON(plain(LEGACY_B)).toJSON()));
  });
});

suite('lessons-learned migrations — Beispiele', () => {
  for (const file of ['lessons-pizza-pilotprojekt.json', 'lessons-learned-hubschrauber-flyer.json']) {
    test(`${file}: über fromExample streng und ohne Reparatur, ids l1…, Zeitpunkte aufgelöst`, async () => {
      const data = await fetchJSON(new URL(file, EXAMPLES));
      const ex = fromExample(plain(data), {});
      const strict = State.fromJSON(plain(ex));
      const { m, fields } = repaired(plain(ex));
      assertDeepEqual(fields, []);
      assertEqual(json(strict.toJSON()), json(m.toJSON()));
      assertDeepEqual(m.lessons.map((l) => l.id), data.lessons.map((_l, i) => `l${i + 1}`));
      for (const l of m.lessons) assertTrue(l.createdAt > 0, `${l.id} createdAt`);
    });
  }
});
