/**
 * Tests for modules/doe-advisor/domain/model.js — Schema und Vorgaben, die
 * Wertemengen gleich wizard.js, gespeicherter Stand '1.1', die Invariante
 * `wizardConsistent` (streng, Reparatur, Schreiben), die drei Kommandos samt
 * Ablehnungen und Rückgaben, `restart` ohne Schreiben, `hasContent`, die
 * Ableitungen in de/en, Lesefläche und Agentenkatalog.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, STEP_IDS, CURRENT_STEPS, ALL_OPTIONS, TABS } from '../../../js/modules/doe-advisor/domain/model.js';
import * as W from '../../../js/modules/doe-advisor/domain/wizard.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'doe-advisor');

const SCHEMA = { _schema: { name: 'doe-advisor', version: '1.1' } };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Stub-Übersetzer. @param {string} key */
const T = (key) => `T:${key}`;

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** @param {object} m */
const wizardOf = (m) => ({ currentStep: m.currentStep, answers: plain(m.answers), history: plain(m.history) });

/** Ein Model nach den Antworten. @param {string[]} opts */
function walked(opts) {
  const m = new State();
  for (const opt of opts) m.answer({ opt });
  return m;
}

const STORED = {
  ...SCHEMA,
  currentStep: 'corners',
  answers: { phase: 'improve', goal: 'optimization', limits: 'hard' },
  history: ['phase', 'goal', 'limits'],
  tab: 'wizard',
};

suite('doe-advisor Model — Schema und Vorgaben', () => {
  test('drei Felder, ein Ansichtsfeld, drei Kommandos, eine Invariante, zwei Ableitungen', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['currentStep', 'answers', 'history']);
    assertDeepEqual(Object.keys(State.schema.view), ['tab']);
    assertDeepEqual(Object.keys(State.schema.commands), ['answer', 'back', 'restart']);
    assertDeepEqual(Object.keys(State.schema.invariants), ['wizardConsistent']);
    assertDeepEqual(Object.keys(State.schema.derived), ['currentOptions', 'recommendation']);
    for (const f of ['currentStep', 'answers', 'history']) assertEqual(State.schema.fields[f].agentWrite, false, f);
  });
  test('Wertemengen gleich wizard.js', () => {
    assertDeepEqual(STEP_IDS, [...W.STEP_IDS]);
    assertDeepEqual(CURRENT_STEPS, [...W.STEP_IDS, ...W.RESULT_STEPS]);
    assertDeepEqual(ALL_OPTIONS, [...W.ALL_OPTIONS]);
    assertDeepEqual(TABS, ['overview', 'wizard', 'ccd']);
    const shape = State.schema.fields.answers.shape;
    assertDeepEqual(Object.keys(shape), W.STEPS.map((s) => s.key));
    for (const s of W.STEPS) {
      assertDeepEqual([...shape[s.key].values], [...s.options], s.key);
      assertEqual(shape[s.key].optional, true, s.key);
    }
  });
  test('Vorgabe: erste Frage, Übersicht, kein Inhalt', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, currentStep: 'phase', answers: {}, history: [], tab: 'overview' }));
    assertEqual(m.hasContent(), false);
  });
  test('hasContent: der Reiter zählt nicht, eine Antwort schon', () => {
    const m = new State();
    m.tab = 'ccd';
    assertEqual(m.hasContent(), false);
    m.answer({ opt: 'improve' });
    assertEqual(m.hasContent(), true);
  });
});

suite('doe-advisor Model — gespeicherter Stand 1.1', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich', () => {
    assertEqual(thrown(() => State.fromJSON(plain(STORED))), null);
    const { m, fields } = repaired(plain(STORED));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json(STORED));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(STORED)).toJSON()), json(STORED));
  });
  test('höhere Version wird abgewiesen', () => {
    assertTrue(thrown(() => State.fromJSON({ ...plain(STORED), _schema: { name: 'doe-advisor', version: '2.0' } })) instanceof Error);
  });
});

suite('doe-advisor Model — Invariante wizardConsistent', () => {
  test('Spur passt nicht zum Schritt: streng abgewiesen, mit Reparatur normalisiert', () => {
    const j = { ...plain(STORED), currentStep: 'goal' };
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'wizardConsistent');
    const { m, fields } = repaired(plain(j));
    assertTrue(fields.length > 0);
    assertDeepEqual(wizardOf(m), { currentStep: 'corners', answers: STORED.answers, history: STORED.history });
  });
  test('Antwort ohne Spur entfällt beim Reparieren', () => {
    const { m } = repaired({ ...SCHEMA, currentStep: 'phase', answers: { phase: 'improve' }, history: [], tab: 'overview' });
    assertDeepEqual(wizardOf(m), W.freshWizard());
  });
  test('Schreiben eines unstimmigen Stands rollt zurück', () => {
    const m = State.fromJSON(plain(STORED));
    const err = thrown(() => { m.currentStep = 'phase'; });
    assertEqual(err?.invariant, 'wizardConsistent');
    assertEqual(m.currentStep, 'corners');
  });
});

suite('doe-advisor Model — answer', () => {
  test('rückt vor, liefert den neuen Schritt, schreibt Antwort und Spur', () => {
    const m = new State();
    assertEqual(m.answer({ opt: 'improve' }), 'goal');
    assertEqual(m.execute({ type: 'answer', opt: 'optimization' }), 'limits');
    assertEqual(m.answer({ opt: 'expandable' }), 'result:ccd-rotatable');
    assertDeepEqual(wizardOf(m), {
      currentStep: 'result:ccd-rotatable',
      answers: { phase: 'improve', goal: 'optimization', limits: 'expandable' },
      history: ['phase', 'goal', 'limits'],
    });
  });
  test('alle 28 Blätter des Baums enden wie in wizard.js', () => {
    const visit = (opts) => {
      const s = opts.reduce((acc, o) => W.answered(acc, o), W.freshWizard());
      if (W.isResultStep(s.currentStep)) {
        assertDeepEqual(wizardOf(walked(opts)), s, opts.join('/'));
        return 1;
      }
      return W.optionsOf(s.currentStep).reduce((n, o) => n + visit([...opts, o]), 0);
    };
    assertEqual(visit([]), 28);
  });
  test('unbekannte Möglichkeit: die Parameterart nennt alle 23', () => {
    const m = new State();
    const err = thrown(() => m.answer({ opt: /** @type {any} */ ('quatsch') }));
    assertEqual(err?.param, 'opt');
    assertTrue(String(err?.message).includes('constrained'), err?.message);
    assertDeepEqual(wizardOf(m), W.freshWizard());
  });
  test('Möglichkeit eines anderen Schritts: die Meldung nennt die der offenen Frage', () => {
    const m = new State();
    const err = thrown(() => m.answer({ opt: 'screening' }));
    assertEqual(err?.param, 'opt');
    assertTrue(String(err?.message).includes('invalid opt "screening"; allowed: define-measure, analyze, improve, control'), err?.message);
  });
  test('auf einer Empfehlung: Ablehnung mit Hinweis noOpenQuestion', () => {
    const m = walked(['control']);
    const err = thrown(() => m.answer({ opt: 'improve' }));
    assertEqual(err?.param, 'opt');
    assertEqual(err?.hintKey, 'hints.noOpenQuestion');
    assertEqual(m.currentStep, 'result:evop');
  });
});

suite('doe-advisor Model — back und restart', () => {
  test('back verwirft die letzte Antwort und liefert die Frage', () => {
    const m = walked(['improve', 'optimization', 'expandable']);
    assertEqual(m.back({}), 'limits');
    assertDeepEqual(wizardOf(m), { currentStep: 'limits', answers: { phase: 'improve', goal: 'optimization' }, history: ['phase', 'goal'] });
  });
  test('back auf der ersten Frage: Ablehnung mit Hinweis atFirstQuestion', () => {
    const m = new State();
    const err = thrown(() => m.back({}));
    assertEqual(err?.param, 'command');
    assertEqual(err?.hintKey, 'hints.atFirstQuestion');
  });
  test('restart räumt ab und liefert phase', () => {
    const m = walked(['improve', 'interactions']);
    assertEqual(m.restart({}), 'phase');
    assertDeepEqual(wizardOf(m), W.freshWizard());
  });
  test('restart auf frischem Stand schreibt nichts', () => {
    const m = new State();
    const { answers, history } = m;
    assertEqual(m.restart({}), 'phase');
    assertTrue(m.answers === answers && m.history === history);
  });
  test('der Reiter bleibt bei allen drei Kommandos', () => {
    const m = new State();
    m.tab = 'ccd';
    m.answer({ opt: 'improve' });
    m.back({});
    m.answer({ opt: 'control' });
    m.restart({});
    assertEqual(m.tab, 'ccd');
  });
});

suite('doe-advisor Model — Ableitungen', () => {
  /** @param {object} m @param {(k: string) => string} [t] */
  const derived = (m, t = T) => evaluateDerived(m, /** @type {any} */ (undefined), undefined, t);
  test('currentOptions: Möglichkeiten der offenen Frage, leer auf einer Empfehlung', () => {
    assertDeepEqual(derived(new State()).currentOptions, ['define-measure', 'analyze', 'improve', 'control']);
    assertDeepEqual(derived(walked(['improve'])).currentOptions, ['screening', 'interactions', 'optimization', 'robustness', 'mixture']);
    assertDeepEqual(derived(walked(['control'])).currentOptions, []);
  });
  test('recommendation: null vor der Empfehlung und bei result:none', () => {
    assertEqual(derived(walked(['improve'])).recommendation, null);
    assertEqual(derived(walked(['define-measure'])).recommendation, null);
  });
  test('recommendation: fünf Angaben aus designs.<id>', () => {
    assertDeepEqual(derived(walked(['improve', 'optimization', 'hard', 'forbidden'])).recommendation, {
      designId: 'box-behnken',
      name: 'T:designs.box-behnken.name',
      factors: 'T:designs.box-behnken.factors',
      levels: 'T:designs.box-behnken.levels',
      effort: 'T:designs.box-behnken.effort',
    });
  });
  test('recommendation in de und en aus ui.<lang>.json', async () => {
    for (const lang of ['de', 'en']) {
      const res = await fetch(new URL(`../../../js/modules/doe-advisor/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
      const ui = await res.json();
      const t = (key) => key.split('.').reduce((o, k) => o?.[k], ui);
      const r = derived(walked(['improve', 'optimization', 'expandable']), t).recommendation;
      assertEqual(r.designId, 'ccd-rotatable');
      assertEqual(r.name, ui.designs['ccd-rotatable'].name, lang);
      assertEqual(r.factors, '2–6', lang);
      assertEqual(r.effort, ui.designs['ccd-rotatable'].effort, lang);
    }
  });
});

suite('doe-advisor Model — Lesefläche und Katalog', () => {
  const entryOf = schemaAgentEntry(State);
  test('read(): drei Felder und zwei Ableitungen, ohne Reiter', () => {
    const m = State.fromJSON(plain(STORED));
    const out = readSchemaModel(entryOf, m, undefined, evaluateDerived(m, /** @type {any} */ (undefined), undefined, T));
    assertDeepEqual(Object.keys(out).sort(), ['answers', 'currentOptions', 'currentStep', 'history', 'recommendation']);
    assertDeepEqual(plain(out.answers), STORED.answers);
    assertDeepEqual(out.currentOptions, ['allowed', 'forbidden', 'constrained']);
    assertEqual(out.recommendation, null);
  });
  test('Katalog: read und die drei Kommandos; nichts per instance.set', () => {
    assertDeepEqual(Object.keys(entryOf.actions), ['read', 'answer', 'back', 'restart']);
    assertDeepEqual(Object.keys(entryOf.actions.answer.keys), ['opt']);
    assertDeepEqual(entryOf.settable, []);
    assertDeepEqual(entryOf.invariants, ['wizardConsistent']);
  });
});
