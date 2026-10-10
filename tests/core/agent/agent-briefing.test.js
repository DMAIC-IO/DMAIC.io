import { suite, test, assertEqual } from '../../test-utils.js';
import { flattenBriefing } from '../../../js/core/agent/agent-briefing.js';
import aiAssistantHelp from '../../../js/help/ai-assistant-help.js';

const helpDef = {
  sections: {
    eins: {
      de: {
        title: 'Eins',
        blocks: [
          { type: 'paragraph', content: 'Ein {{term:dmaic|DMAIC}}-Satz mit **fett**.' },
          { type: 'heading', content: 'Zwischentitel' },
          { type: 'list', items: ['Erstens', 'Zweitens'] },
          { type: 'definition', term: 'Begriff', content: 'Erklärung.' },
          { type: 'table', headers: ['Kopf A', 'Kopf B'], rows: [['Zelle A', 'Zelle B']] },
        ],
      },
      en: { title: 'One', blocks: [{ type: 'paragraph', content: 'An English sentence.' }] },
    },
    zwei: { en: { title: 'Two', blocks: [{ type: 'paragraph', content: 'Only English.' }] } },
  },
};

suite('agent-briefing — eine Quelle, Klartext für den Agenten', () => {
  test('die Abschnittsüberschriften und die Blöcke kommen als Klartext', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('Eins'), true, text);
    assertEqual(text.includes('Zwischentitel'), true, text);
    // Eine Definition wird „Begriff: Erklärung", nicht nur die Erklärung.
    assertEqual(text.includes('Begriff: Erklärung.'), true, text);
  });

  test('eine Liste wird zu je einer Zeile mit Aufzählungsstrich', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('- Erstens'), true, text);
    assertEqual(text.includes('- Zweitens'), true, text);
  });

  test('eine Tabelle wird zu Kopfzeile und Datenzeilen', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('Kopf A | Kopf B'), true, text);
    assertEqual(text.includes('Zelle A | Zelle B'), true, text);
  });

  test('das term-Markup wird zur Beschriftung aufgelöst, nicht mitgeschleppt', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('DMAIC-Satz'), true, text);
    assertEqual(text.includes('{{term:'), false, text);
  });

  test('die Markdown-Betonung fällt weg — ein Agent liest Klartext', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('**'), false, text);
    assertEqual(text.includes('fett'), true, text);
  });

  test('ein Abschnitt ohne die aktive Sprache fällt auf Englisch zurück', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.includes('Only English.'), true, text);
    // Und der deutsche Abschnitt bleibt deutsch — der Rückfall gilt je
    // Abschnitt, nicht für das ganze Kapitel.
    assertEqual(text.includes('An English sentence.'), false, text);
  });

  test('die Abschnittsreihenfolge der Quelle bleibt erhalten', () => {
    const text = flattenBriefing(helpDef, 'de');
    assertEqual(text.indexOf('Eins') < text.indexOf('Two'), true, text);
  });

  test('ohne Handbuchobjekt kommt eine leere Zeichenkette, kein Wurf', () => {
    assertEqual(flattenBriefing(null, 'de'), '');
    assertEqual(flattenBriefing({}, 'de'), '');
  });
});

suite('agent-briefing — das echte Kapitel „KI-Assistent"', () => {
  /** Die sechs Abschnitte, in der Reihenfolge, die die Quelle meint. */
  const SECTIONS = ['rolle', 'arbeitsweise', 'ausschliesslich', 'vertrag', 'fehlgriffe', 'grenzen'];

  test('das Kapitel hat genau diese sechs Abschnitte in dieser Reihenfolge', () => {
    assertEqual(Object.keys(aiAssistantHelp.sections).join(','), SECTIONS.join(','));
  });

  test('jeder Abschnitt ist in BEIDEN Sprachen vollständig', () => {
    for (const name of SECTIONS) {
      const section = aiAssistantHelp.sections[name];
      for (const lang of ['de', 'en']) {
        assertEqual(typeof section?.[lang]?.title, 'string', `${name}.${lang}.title`);
        assertEqual(section[lang].title.length > 0, true, `${name}.${lang}.title leer`);
        assertEqual(Array.isArray(section[lang].blocks) && section[lang].blocks.length > 0,
          true, `${name}.${lang}.blocks leer`);
      }
    }
  });

  test('beide Sprachen flachen zu Klartext ohne Renderer-Anweisungen ab', () => {
    for (const lang of ['de', 'en']) {
      const text = flattenBriefing(aiAssistantHelp, lang);
      assertEqual(text.length > 500, true, `${lang}: nur ${text.length} Zeichen`);
      assertEqual(text.includes('{{term:'), false, lang);
      assertEqual(text.includes('**'), false, lang);
    }
  });

  test('die Rolle steht vor den Grenzen — die Reihenfolge ist die Aussage', () => {
    const de = flattenBriefing(aiAssistantHelp, 'de');
    assertEqual(de.indexOf('Six-Sigma-Black-Belt') < de.indexOf('liegt auf Platte'), true);
    const en = flattenBriefing(aiAssistantHelp, 'en');
    assertEqual(en.indexOf('Six Sigma Black Belt') < en.indexOf('it is on disk'), true);
  });
});
