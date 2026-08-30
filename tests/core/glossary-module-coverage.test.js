/**
 * Glossar — Modul-Abdeckung und Katalog-Integrität.
 *
 * Zwei Lücken haben diesen Test ausgelöst: die sieben TRIZ-Module trugen
 * keinen einzigen Glossarbegriff (das Glossar war rein statistisch geprägt,
 * eine TRIZ-Kategorie fehlte), und `msa-typ4` (Linearität) war das einzige
 * MSA-Verfahren ohne Begriffe — Typ 1/2/5/6 hatten längst welche.
 *
 * Der Test liest die gebündelten Daten (glossary-data.generated.js), läuft
 * also erst nach `npm run build` gegen den aktuellen Stand von glossary/.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { GLOSSARY_CATALOG, GLOSSARY_TERMS } from '../../js/core/glossary-data.generated.js';
import MODULE_MANIFEST from '../../js/modules/manifest.js';

const TERMS = Object.values(GLOSSARY_TERMS);
const TERM_IDS = new Set(Object.keys(GLOSSARY_TERMS));
const CATEGORY_IDS = new Set((GLOSSARY_CATALOG.categories || []).map(c => c.id));
const MODULE_IDS = new Set(MODULE_MANIFEST.map(m => m.id));

/** @param {string} moduleId @returns {string[]} IDs der Begriffe dieses Moduls. */
function termsForModule(moduleId) {
  return TERMS.filter(t => (t.modules || []).includes(moduleId)).map(t => t.id);
}

suite('Glossar: Modul-Abdeckung', () => {
  test('jedes TRIZ-Modul trägt mindestens einen Glossarbegriff', () => {
    const trizModules = MODULE_MANIFEST.map(m => m.id).filter(id => id.startsWith('triz-'));
    assertTrue(trizModules.length > 0, 'Manifest enthält TRIZ-Module');
    const empty = trizModules.filter(id => termsForModule(id).length === 0);
    assertEqual(empty.length, 0, `TRIZ-Module ohne Glossarbegriff: ${JSON.stringify(empty)}`);
  });

  test('der Katalog führt eine TRIZ-Kategorie', () => {
    assertTrue(CATEGORY_IDS.has('triz'), 'Kategorie "triz" fehlt in glossary/index.json');
  });

  test('msa-typ4 (Linearität) trägt Begriffe wie die übrigen MSA-Verfahren', () => {
    const msaModules = MODULE_MANIFEST.map(m => m.id).filter(id => id.startsWith('msa-typ'));
    const empty = msaModules.filter(id => termsForModule(id).length === 0);
    assertEqual(empty.length, 0, `MSA-Module ohne Glossarbegriff: ${JSON.stringify(empty)}`);
  });

  test('der Begriff "linearitaet" ist msa-typ4 zugeordnet', () => {
    assertTrue(TERM_IDS.has('linearitaet'), 'Begriff "linearitaet" fehlt');
    assertTrue((GLOSSARY_TERMS.linearitaet?.modules || []).includes('msa-typ4'),
      'linearitaet ist nicht mit msa-typ4 verknüpft');
  });
});

suite('Glossar: Katalog-Integrität', () => {
  test('jeder Index-Eintrag ist als Begriff auflösbar', () => {
    const missing = (GLOSSARY_CATALOG.terms || []).filter(idx => !GLOSSARY_TERMS[idx.id]).map(i => i.id);
    assertEqual(missing.length, 0, `Im Index gelistet, aber ohne Datei: ${JSON.stringify(missing)}`);
  });

  test('id, Kategorie und Index-Eintrag stimmen je Begriff überein', () => {
    const byId = new Map((GLOSSARY_CATALOG.terms || []).map(i => [i.id, i]));
    const bad = TERMS
      .filter(t => byId.get(t.id)?.category !== t.category)
      .map(t => `${t.id}: ${t.category} ≠ ${byId.get(t.id)?.category}`);
    assertEqual(bad.length, 0, `Kategorie weicht vom Index ab: ${JSON.stringify(bad)}`);
  });

  test('jede Kategorie eines Begriffs ist im Katalog deklariert', () => {
    const bad = TERMS.filter(t => !CATEGORY_IDS.has(t.category)).map(t => `${t.id} → ${t.category}`);
    assertEqual(bad.length, 0, `Unbekannte Kategorien: ${JSON.stringify(bad)}`);
  });

  test('jede deklarierte Kategorie wird von mindestens einem Begriff genutzt', () => {
    const used = new Set(TERMS.map(t => t.category));
    const orphan = [...CATEGORY_IDS].filter(c => !used.has(c));
    assertEqual(orphan.length, 0, `Kategorien ohne Begriffe: ${JSON.stringify(orphan)}`);
  });

  test('jede seeAlso-Referenz zeigt auf einen existierenden Begriff', () => {
    const bad = [];
    for (const t of TERMS) {
      for (const ref of (t.seeAlso || [])) if (!TERM_IDS.has(ref)) bad.push(`${t.id} → ${ref}`);
    }
    assertEqual(bad.length, 0, `Tote seeAlso-Referenzen: ${JSON.stringify(bad)}`);
  });

  test('jede modules-Referenz zeigt auf ein Modul im Manifest', () => {
    const bad = [];
    for (const t of TERMS) {
      for (const ref of (t.modules || [])) if (!MODULE_IDS.has(ref)) bad.push(`${t.id} → ${ref}`);
    }
    assertEqual(bad.length, 0, `Unbekannte Modul-IDs: ${JSON.stringify(bad)}`);
  });

  test('jeder Begriff ist zweisprachig und nennt mindestens eine Quelle', () => {
    const bad = [];
    for (const t of TERMS) {
      for (const lang of ['de', 'en']) {
        if (!t.title?.[lang]) bad.push(`${t.id}: title.${lang}`);
        if (!t.short?.[lang]) bad.push(`${t.id}: short.${lang}`);
        if (!Array.isArray(t.definition?.[lang]) || t.definition[lang].length === 0) {
          bad.push(`${t.id}: definition.${lang}`);
        }
      }
      if (!Array.isArray(t.sources) || t.sources.length === 0) bad.push(`${t.id}: sources`);
      if (!Array.isArray(t.modules) || t.modules.length === 0) bad.push(`${t.id}: modules`);
    }
    assertEqual(bad.length, 0, `Unvollständige Begriffe: ${JSON.stringify(bad)}`);
  });
});
