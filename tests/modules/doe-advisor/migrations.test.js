/**
 * Tests for modules/doe-advisor/domain/migrations.js — '0→1.0' reicht nur die
 * Form durch (wie das alte `State.fromJSON`), '1.0→1.1' setzt einen fremden
 * Reiter auf die Übersicht und normalisiert den Berater; jeder Fall des alten
 * `fromJSON`, beide Golden-Fixtures und die Instanzen des Altprojekts.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0, from1_0 } from '../../../js/modules/doe-advisor/domain/migrations.js';
import { State } from '../../../js/modules/doe-advisor/domain/model.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'doe-advisor');

const SCHEMA = { _schema: { name: 'doe-advisor', version: '1.1' } };
const V10 = { _schema: { name: 'doe-advisor', version: '1.0' } };
const FRESH = { currentStep: 'phase', answers: {}, history: [] };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur wie der Kern; meldet reparierte Felder. @param {object} j */
function load(j) {
  const fields = [];
  const m = State.fromJSON(plain(j), { repair: true, onRepair: (f) => fields.push(f) });
  return { state: plain(m.toJSON()), fields };
}

/** Alle Zustände des Moduls in einem Export. @param {any} v @param {any[]} [acc] @returns {any[]} */
function states(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => states(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'doe-advisor') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    } else Object.values(v).forEach((x) => states(x, acc));
  }
  return acc;
}

suite('doe-advisor Migration 0→1.0', () => {
  test('nur die Form: Texte, Objekt, Liste; fremde Schlüssel entfallen', () => {
    assertDeepEqual(from0({ tab: 'x', currentStep: 'y', answers: { a: 1 }, history: [1], result: 'r', extra: 2 }),
      { tab: 'x', currentStep: 'y', answers: { a: 1 }, history: [1] });
    assertDeepEqual(from0({ tab: 3, currentStep: null, answers: [], history: 'phase' }), {});
    assertDeepEqual(from0(null), {});
    assertDeepEqual(from0([1]), {});
  });
});

suite('doe-advisor Migration 1.0→1.1', () => {
  test('stimmiger Stand bleibt, Reiter bleibt', () => {
    const s = { tab: 'ccd', currentStep: 'result:box-behnken', answers: { phase: 'improve', goal: 'optimization', limits: 'hard', corners: 'forbidden' }, history: ['phase', 'goal', 'limits', 'corners'] };
    assertDeepEqual(from1_0(s), s);
  });
  test('fremder Reiter wird die Übersicht (die Altform zeigte keinen Bereich)', () => {
    assertEqual(from1_0({ tab: 'results' }).tab, 'overview');
    assertEqual(from1_0({}).tab, 'overview');
  });
  test('jeder Fall des alten fromJSON: Formfehler ergeben den frischen Berater', () => {
    for (const bad of [{}, { currentStep: 42 }, { answers: 'x' }, { answers: [] }, { history: 'phase' }, { currentStep: 'quatsch', answers: {}, history: [] }]) {
      const { tab, ...rest } = from1_0(bad);
      assertEqual(tab, 'overview');
      assertDeepEqual(rest, FRESH);
    }
  });
  test('Spur ab phase nachgespielt, solange gültig', () => {
    assertDeepEqual(from1_0({ tab: 'wizard', currentStep: 'corners', answers: { phase: 'improve', goal: 'nope', limits: 'hard' }, history: ['phase', 'goal', 'limits'] }),
      { tab: 'wizard', currentStep: 'goal', answers: { phase: 'improve' }, history: ['phase'] });
    assertDeepEqual(from1_0({ tab: 'wizard', currentStep: 'phase', answers: { phase: 'analyze', goal: 'mixture' }, history: ['phase', 'goal'] }),
      { tab: 'wizard', currentStep: 'result:mixture', answers: { phase: 'analyze', goal: 'mixture' }, history: ['phase', 'goal'] });
  });
});

suite('doe-advisor Migration über das Model', () => {
  test('Golden v0.3.0 (einzeln und alle Projekte): frischer Berater auf dem gespeicherten Reiter', async () => {
    const found = [
      ...states(await fetchJSON(new URL('v0.3.0_single_project.json', FIXTURES))),
      ...states(await fetchJSON(new URL('v0.3.0_all_projects.json', FIXTURES))),
    ];
    assertEqual(found.length, 2);
    for (const s of found) {
      const { state, fields } = load(s);
      assertEqual(s.tab, 'wizard');
      assertDeepEqual(state, { ...SCHEMA, ...FRESH, tab: 'wizard' });
      assertDeepEqual(fields, []);
    }
  });
  test('Altprojekt (Task 0): beide Instanzen ohne Reparatur, Inhalt unverändert', () => {
    const a = { ...V10, tab: 'wizard', currentStep: 'corners', answers: { phase: 'improve', goal: 'optimization', limits: 'hard' }, history: ['phase', 'goal', 'limits'] };
    const b = { ...V10, tab: 'ccd', currentStep: 'result:box-behnken', answers: { phase: 'improve', goal: 'optimization', limits: 'hard', corners: 'forbidden' }, history: ['phase', 'goal', 'limits', 'corners'] };
    for (const j of [a, b]) {
      const { state, fields } = load(j);
      const { _schema, ...rest } = j;
      assertDeepEqual(state, { ...SCHEMA, currentStep: rest.currentStep, answers: rest.answers, history: rest.history, tab: rest.tab });
      assertDeepEqual(fields, []);
    }
  });
  test('Stand 1.0 mit unstimmigem Berater wird normalisiert, nicht verworfen', () => {
    const { state } = load({ ...V10, tab: 'wizard', currentStep: 'result:none', answers: { phase: 'improve' }, history: ['phase'] });
    assertDeepEqual(state, { ...SCHEMA, currentStep: 'goal', answers: { phase: 'improve' }, history: ['phase'], tab: 'wizard' });
  });
  test('Stand ohne _schema läuft durch beide Schritte', () => {
    const { state } = load({ tab: 'wizard', currentStep: 'goal', answers: { phase: 'improve' }, history: ['phase'], result: 'x' });
    assertDeepEqual(state, { ...SCHEMA, currentStep: 'goal', answers: { phase: 'improve' }, history: ['phase'], tab: 'wizard' });
  });
});
