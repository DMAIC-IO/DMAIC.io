/**
 * Kano: Migration '0→1.0' (domain/migrations.js) — die Fälle des alten
 * `State.fromJSON` in der neuen Form, `origin` entfällt, Antworten neben der
 * Skala werden leer, Elemente ohne Text-id entfallen; dazu die Altinstanz aus
 * Task 0 gegen das `read()` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { from0 } from '../../../js/modules/kano/domain/migrations.js';
import { State } from '../../../js/modules/kano/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

setModelName(State, 'kano');

const plain = (v) => JSON.parse(JSON.stringify(v));
const origin = { surveyInstanceId: 'sb1', questionId: 'q1' };
const NO_TREE = { list: () => [], read() { throw new Error('x'); } };

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

suite('kano Migration 0→1.0', () => {
  test('leerer Altstand: Vorgaben', () => {
    assertDeepEqual(from0({}), {
      source: { instanceId: null, level: 'need' }, options: { importance: true },
      items: [], respondents: [], answers: {}, activeRespondentId: null,
    });
  });
  test('unbekannte Ebene → need, Fremdtypen bei source, options, items, answers ohne Wurf', () => {
    const out = from0({ source: 'quatsch', options: 42, items: 'kaputt', answers: [1, 2, 3] });
    assertDeepEqual(out.source, { instanceId: null, level: 'need' });
    assertEqual(out.options.importance, true);
    assertDeepEqual(out.items, []);
    assertDeepEqual(out.answers, {});
    assertEqual(from0({ source: { level: 'quatsch', instanceId: 5 } }).source.level, 'need');
    assertEqual(from0({ source: { level: 'req', instanceId: 't' } }).source.level, 'req');
    assertEqual(from0({ options: { importance: false } }).options.importance, false);
    assertEqual(from0({ options: { importance: 0 } }).options.importance, true);
  });
  test('Merkmale und Befragte: Felder normalisiert, ohne Text-id (auch leer) entfallen, origin entfällt', () => {
    const out = from0({
      items: [{ id: 'i1', label: 'A', origin, missing: 1, nodeId: 7, path: null, fremd: true }, { id: '' }, { label: 'ohne' }, null, { id: 3 }],
      respondents: [{ id: 'r1', name: 'A', origin }, { id: 'r2' }, { id: '' }],
    });
    assertDeepEqual(out.items, [{ id: 'i1', nodeId: null, label: 'A', path: '', missing: true }]);
    assertDeepEqual(out.respondents, [{ id: 'r1', name: 'A' }, { id: 'r2', name: '' }]);
  });
  test('Antworten nur auf bekannte ids und als Objekt; Werte neben der Skala oder kein Ganzzahlwert → leer', () => {
    const out = from0({
      items: [{ id: 'i1' }, { id: 'i2' }],
      respondents: [{ id: 'r1' }],
      answers: {
        r1: { i1: { f: 1, d: 5, w: 9 }, i2: { f: '5', d: 6, w: 10 }, geist: { f: 2, d: 2, w: 2 }, kaputt: 3 },
        phantom: { i1: { f: 1, d: 1, w: 1 } },
      },
    });
    assertDeepEqual(out.answers, { r1: { i1: { f: 1, d: 5, w: 9 }, i2: { f: null, d: null, w: null } } });
    assertDeepEqual(from0({ items: [{ id: 'i' }], respondents: [{ id: 'r' }], answers: { r: { i: { f: 0, d: 2.5, w: 1 } } } }).answers.r.i,
      { f: null, d: null, w: 1 });
  });
  test('aktive Befragte: bekannt, sonst die erste, sonst null', () => {
    assertEqual(from0({ respondents: [{ id: 'r1' }, { id: 'r2' }], activeRespondentId: 'r2' }).activeRespondentId, 'r2');
    assertEqual(from0({ respondents: [{ id: 'r1' }], activeRespondentId: 'weg' }).activeRespondentId, 'r1');
    assertEqual(from0({ activeRespondentId: 'weg' }).activeRespondentId, null);
  });
  test('fremde Schlüssel entfallen', () => {
    assertDeepEqual(Object.keys(from0({ fremd: 1, treeList: [] })),
      ['source', 'options', 'items', 'respondents', 'answers', 'activeRespondentId']);
  });
  test('doppelte ids lädt das Model mit Reparatur: die spätere entfällt', () => {
    const m = /** @type {any} */ (State.fromJSON({ items: [{ id: 'a', label: '1' }, { id: 'a', label: '2' }], respondents: [{ id: 'r' }, { id: 'r', name: 'x' }] }, { repair: true }));
    assertDeepEqual(m.items.map((i) => i.label), ['1']);
    assertDeepEqual(m.respondents.map((r) => r.name), ['']);
  });
  test('Altinstanz aus Task 0: lädt ohne Reparatur, Felder und Auswertung wie das read() der Altform', async () => {
    const fx = await fetchJson('./legacy-project.json');
    const old = (await fetchJson('./legacy-read.json'))['legacy-project'];
    const repaired = [];
    const m = /** @type {any} */ (State.fromJSON(plain(fx.kano), { repair: true, onRepair: (f) => repaired.push(f) }));
    assertDeepEqual(repaired, []);
    const strip = (xs) => xs.map(({ origin: _o, ...rest }) => rest);
    assertDeepEqual(plain(m.items), strip(old.items));
    assertDeepEqual(plain(m.respondents), strip(old.respondents));
    assertEqual(m.source.level, old.source.level);
    assertEqual(m.source.instanceId, fx.kano.source.instanceId);
    assertDeepEqual(plain(m.options), old.options);
    assertEqual(m.activeRespondentId, 'r2');
    // Neben der Skala: die Altform hielt w 12 und f 7, die Auswertung zählte sie nicht.
    assertDeepEqual(plain(m.answers.r1.k4), { f: 3, d: 3, w: null });
    assertDeepEqual(plain(m.answers.r3.k4), { f: null, d: 3, w: null });
    assertEqual(Object.hasOwn(m.answers, 'r-unbekannt'), false);
    const d = plain(evaluateDerived(m, /** @type {any} */ (NO_TREE), ['evaluation'], (k) => k));
    assertDeepEqual(d.evaluation, old.evaluation);
  });
});
