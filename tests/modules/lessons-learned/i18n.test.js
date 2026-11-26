/**
 * Lessons Learned: Texte in resources/i18n/ui.<lang>.json — Invariante und
 * Rückfrage des Models, Texte je Kategorie und Wirkung, Zählung der
 * Maßnahmen, in beiden Sprachen; ohne die toten, die Phasen- und die
 * Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/lessons-learned/domain/model.js';

const MOD = '../../../js/modules/lessons-learned/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('lessons-learned Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['uniqueIds']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Rückfrage vor dem Löschen wie in der Altform', async () => {
    assertEqual((await ui('de')).confirm.removeLesson, 'Diese Lesson wirklich löschen?');
    assertEqual((await ui('en')).confirm.removeLesson, 'Delete this lesson? This cannot be undone.');
  });

  test('Zählung der Maßnahmen wortgleich mit der Altform', async () => {
    for (const lang of LANGS) assertEqual((await ui(lang)).actionsSummary, '{done}/{total} Actions', lang);
  });

  test('Name, Beschreibung, Einsatzhinweis, Kategorien, Wirkungen, Import', async () => {
    const keys = [
      'name', 'description', 'whenToUse', 'cat_success', 'cat_problem', 'cat_improve',
      'impact_high', 'impact_medium', 'impact_low', 'importJSON', 'importSuccess', 'importError', 'addLesson', 'addTitle', 'editTitle',
    ];
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of keys) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
    }
  });

  test('ohne Phasentexte, tote Schlüssel und Agententexte der Altform', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['phase_define', 'phase_control', 'exportJSON', 'deleteConfirm', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });

  test('DE und EN haben dieselben Schlüssel', async () => {
    assertDeepEqual(Object.keys(await ui('en')), Object.keys(await ui('de')));
  });
});
