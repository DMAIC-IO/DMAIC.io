/**
 * Stakeholder-Analyse: Texte in resources/i18n/ui.<lang>.json — Invariante
 * und Rückfrage des Models, Texte je Quadrant, Haltung und Kategorie in
 * beiden Sprachen, ohne die toten und die Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/stakeholder-analysis/domain/model.js';

const MOD = '../../../js/modules/stakeholder-analysis/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('stakeholder-analysis Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['uniqueIds']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Rückfrage vor dem Löschen mit dem Namen; DE mit typografischen Anführungszeichen', async () => {
    const de = await ui('de');
    const en = await ui('en');
    assertTrue(de.confirm.removeStakeholder.includes('„{name}“'), de.confirm.removeStakeholder);
    assertTrue(en.confirm.removeStakeholder.includes('{name}'), en.confirm.removeStakeholder);
  });

  test('Name, Beschreibung, Einsatzhinweis und die Texte je Quadrant, Haltung und Kategorie', async () => {
    const keys = [
      'name', 'description', 'whenToUse',
      'quadManageClosely', 'quadKeepSatisfied', 'quadKeepInformed', 'quadMonitor',
      'quadManageCloselyDesc', 'quadKeepSatisfiedDesc', 'quadKeepInformedDesc', 'quadMonitorDesc',
      'supportSupporter', 'supportNeutral', 'supportCritic',
      'categoryIntern', 'categoryExtern', 'categoryCustomer', 'categorySupplier', 'categoryAuthority',
      'criticWarningLabel', 'criticWarningText', 'addStakeholder', 'editStakeholder',
    ];
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of keys) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['fieldNotes', 'deleteConfirm', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });

  test('DE und EN haben dieselben Schlüssel', async () => {
    const de = await ui('de');
    const en = await ui('en');
    assertDeepEqual(Object.keys(en), Object.keys(de));
  });
});
