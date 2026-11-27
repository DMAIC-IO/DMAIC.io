/**
 * Activity-Flowchart: Texte in resources/i18n/ui.<lang>.json — ein Text je
 * Invariante, die Oberflächentexte der Ansicht, ohne die toten Schlüssel und
 * die Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';

const MOD = '../../../js/modules/activity-flowchart/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('activity-flowchart Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Oberflächentexte der Ansicht in beiden Sprachen', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'titlePlaceholder', 'descriptionPlaceholder',
        'substepsLabel', 'addSubstep', 'substepPlaceholder', 'decisionPlaceholder', 'addStep', 'addDecision',
        'addStepToBand', 'addDecisionToBand', 'deleteStep', 'insertHere', 'emptyHint', 'importFrom', 'importTitle',
        'importHint', 'importConfirm', 'importEmptyHint', 'importDone', 'importFailed', 'yes', 'no', 'pickEntry',
        'pickEntryTitle', 'clearRejoin', 'unnamedStep', 'mainPath', 'bandLabel', 'unnamedDecision',
        'stepGrip', 'substepGrip', 'gestureBand', 'bandNotBefore', 'notDecision', 'targetNotInBand']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(t.gestureBand.includes('{band}'), `${lang} gestureBand mit {band}`);
      assertTrue(t.bandLabel.includes('{q}'), `${lang} bandLabel mit {q}`);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['exportImageComingSoon', 'end', 'actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });

  test('DE und EN haben dieselben Schlüssel', async () => {
    assertDeepEqual(Object.keys(await ui('en')), Object.keys(await ui('de')));
  });
});
