/**
 * D.Mike — Multi-Vari module help content (Task 20).
 *
 * Step 4 of the brief asked for a manual browser check of the help panel
 * (three sections, DE and EN). This is the programmatic stand-in: it pins
 * the module's help registration in the generated registry the app actually
 * boots from — `js/core/help-registry.generated.js`, built by
 * `tools/build/help-data.mjs` from `js/modules/multi-vari/multi-vari-help.js` —
 * and checks all three sections carry non-empty DE and EN titles/blocks.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { HELP } from '../../js/core/help-registry.generated.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];

suite('Multi-Vari: Hilfeinhalte im generierten Registry', () => {
  test('das Modul ist unter "multi-vari" registriert', () => {
    assertTrue(!!HELP['multi-vari'], 'HELP["multi-vari"] fehlt');
    assertEqual(HELP['multi-vari'].moduleId, 'multi-vari');
  });

  test('alle drei Abschnitte existieren mit DE- und EN-Inhalt', () => {
    const { sections } = HELP['multi-vari'];
    for (const id of SECTION_IDS) {
      const section = sections[id];
      assertTrue(!!section, `Abschnitt "${id}" fehlt`);
      for (const lang of ['de', 'en']) {
        const localized = section[lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0,
          `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0,
          `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', () => {
    const overviewDe = HELP['multi-vari'].sections.overview.de;
    const joined = JSON.stringify(overviewDe);
    assertTrue(/[äöüÄÖÜß]/.test(joined), 'Kein Unicode-Umlaut im deutschen Übersichtsabschnitt gefunden');
  });
});
