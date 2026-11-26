/**
 * VoC → CTx-Baum: Texte in resources/i18n/ui.<lang>.json — Invarianten und
 * Rückfrage des Models, Treiberarten, Kachel, ohne die toten und die
 * Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue, assertEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';

const MOD = '../../../js/modules/voc-ctx-tree/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('voc-ctx-tree Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });
  test('Rückfrage, Treiberarten, Abzeichen, Export und Kachel', async () => {
    const keys = ['name', 'description', 'whenToUse', 'typeQuality', 'typeDelivery', 'typeCost', 'badgeVoc', 'badgeNeed',
      'badgeReq', 'exportCtx', 'reqShort', 'addVoc', 'editVoc', 'addNeed', 'editNeed', 'addDriver', 'editDriver', 'addReq', 'editReq'];
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of keys) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      assertTrue(nonEmpty(t.confirm.removeVoc), `${lang} confirm.removeVoc`);
      assertTrue(nonEmpty(t.tile.vocUnit), `${lang} tile.vocUnit`);
    }
    assertEqual((await ui('de')).typeQuality, 'Qualität');
  });
  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['emptyTree', 'deleteVocConfirm', 'actions', 'fields', 'types']) {
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
