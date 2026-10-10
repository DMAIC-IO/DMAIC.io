import { suite, test, assertEqual } from '../../test-utils.js';
import { flattenBriefing } from '../../../js/core/agent/agent-briefing.js';
import * as chapterModule from '../../../js/help/ai-assistant-help.js';
import { AI_ASSISTANT_CHAPTER_ID, AI_ASSISTANT_CHAPTER_KEY } from '../../../js/help/help-keys.js';

const aiAssistantHelp = chapterModule.default;

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
    // Existenz vor Reihenfolge: `indexOf(a) < indexOf(b)` ist bei fehlendem
    // `a` wahr (-1 < n). Ohne diese zwei Zeilen bliebe der Fall grün, wenn
    // der erste Abschnitt verschwindet — ein Test, der nicht fallieren kann.
    assertEqual(text.includes('Eins'), true, text);
    assertEqual(text.includes('Two'), true, text);
    assertEqual(text.indexOf('Eins') < text.indexOf('Two'), true, text);
  });

  test('ohne Handbuchobjekt kommt eine leere Zeichenkette, kein Wurf', () => {
    assertEqual(flattenBriefing(null, 'de'), '');
    assertEqual(flattenBriefing({}, 'de'), '');
  });

  test('ein fehlgeformtes blocks kippt die Abflachung nicht um', () => {
    // `blocks: {}` ist nicht iterierbar. Die Funktion gibt sich sonst
    // konsequent total (`null`/`{}` → `''`); an dieser Stelle warf sie.
    const nonArray = { sections: { a: { de: { title: 'Titel', blocks: {} } } } };
    assertEqual(flattenBriefing(nonArray, 'de'), 'Titel');
    const stringy = { sections: { a: { de: { title: 'Titel', blocks: 'nope' } } } };
    assertEqual(flattenBriefing(stringy, 'de'), 'Titel');
  });

  test('ein Block mit nicht-textlichem content erzeugt keine Leerzeile', () => {
    // Eine Zahl ist wahr, wird aber zu '' — ohne die zentrale Siebung in
    // `flattenBriefing` stünde dafür eine Leerzeile mitten im Text.
    const odd = { sections: { a: { de: { title: 'T', blocks: [
      { type: 'eigenart', content: 42 },
      { type: 'paragraph', content: 'Danach.' },
    ] } } } };
    assertEqual(flattenBriefing(odd, 'de'), 'T\nDanach.');
  });

  test('nicht-textliches content erzeugt in KEINEM Zweig eine Zeile', () => {
    // Die Härtung war zweigweise und endete am `default`-Zweig: `heading`
    // ergab [''], `list` ['- '], `definition` [': '] — Zeilen, in denen außer
    // der Auszeichnung nichts steht. Gesiebt wird darum ZENTRAL am Ergebnis
    // von `blockLines`, nicht in jedem Zweig einzeln.
    const odd = { sections: { a: { de: { title: 'T', blocks: [
      { type: 'heading', content: 42 },
      { type: 'list', items: [{}, 'Echt'] },
      { type: 'definition', term: null, content: undefined },
      { type: 'table', headers: [], rows: [[null]] },
      { type: 'paragraph', content: 'Danach.' },
    ] } } } };
    assertEqual(flattenBriefing(odd, 'de'), 'T\n- Echt\nDanach.');
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
    // Existenz vor Reihenfolge, sonst läuft der Fall bei fehlendem Anker
    // leer durch (-1 < n ist wahr).
    assertEqual(de.includes('Six-Sigma-Black-Belt'), true, 'de: Rolle fehlt');
    assertEqual(de.includes('angewandt, nicht gesichert'), true, 'de: Grenzen fehlen');
    assertEqual(de.indexOf('Six-Sigma-Black-Belt') < de.indexOf('angewandt, nicht gesichert'), true);
    const en = flattenBriefing(aiAssistantHelp, 'en');
    assertEqual(en.includes('Six Sigma Black Belt'), true, 'en: Rolle fehlt');
    assertEqual(en.includes('applied, not saved'), true, 'en: Grenzen fehlen');
    assertEqual(en.indexOf('Six Sigma Black Belt') < en.indexOf('applied, not saved'), true);
  });

  test('die Nullable-Form wird im Vertragsabschnitt erklärt, in beiden Sprachen', () => {
    // Das Kapitel spiegelt den Vertragsteil von `agent.usage.*` — driften die
    // zwei Quellen, sagt eine dem Agenten etwas, das die andere nicht hält.
    // Der Satz zur Nullable-Hülle gehört deshalb in BEIDE.
    const de = flattenBriefing(aiAssistantHelp, 'de');
    const en = flattenBriefing(aiAssistantHelp, 'en');
    assertEqual(de.includes('{ $nullable: … }'), true, de);
    assertEqual(de.includes('kein Schlüssel'), true, de);
    assertEqual(en.includes('{ $nullable: … }'), true, en);
    assertEqual(en.includes('not a key'), true, en);
  });

  test('die Haltbarkeit wird nicht stärker zugesichert, als sie ist', () => {
    const de = flattenBriefing(aiAssistantHelp, 'de');
    const en = flattenBriefing(aiAssistantHelp, 'en');
    // Negativ zuerst, und das ist hier der eigentliche Beweis: der
    // Agentenpfad spült den Zustand NICHT. Ohne diese Zeilen wäre der Fall
    // auch grün, wenn die alte, erfundene Zusicherung daneben stehen bliebe.
    assertEqual(de.includes('ohne etwas zu verlieren'), false, de);
    assertEqual(de.includes('spült den Zustand'), false, de);
    assertEqual(de.includes('liegt auf Platte'), false, de);
    assertEqual(en.includes('without losing anything'), false, en);
    assertEqual(en.includes('flushes the state'), false, en);
    assertEqual(en.includes('it is on disk'), false, en);
    // Und keine Obergrenze in Sekunden: `_scheduleSave()` ist eine
    // ZURÜCKSETZENDE Debounce (`js/core/state-manager.js:907-909`) — jede
    // weitere Änderung verschiebt die Frist erneut, der oberste Zustand
    // bleibt beliebig lange unpersistiert. Eine Zahl im Briefing wäre
    // dieselbe Klasse Fehler wie die ursprüngliche Zusicherung.
    assertEqual(de.includes('zwei Sekunden'), false, de);
    assertEqual(en.includes('two seconds'), false, en);
    // Und positiv: das Zusicherbare steht da — angewandt und sichtbar,
    // geschrieben nach der letzten Änderung.
    assertEqual(de.includes('angewandt, nicht gesichert'), true, de);
    assertEqual(de.includes('kurz nach der letzten Änderung'), true, de);
    assertEqual(en.includes('applied, not saved'), true, en);
    assertEqual(en.includes('once the changes have settled'), true, en);
  });
});

suite('agent-briefing — der Fundort der Kapitelkennungen', () => {
  test('die Kennungen liegen in js/help/help-keys.js', () => {
    assertEqual(AI_ASSISTANT_CHAPTER_ID, 'ai-assistant');
    assertEqual(AI_ASSISTANT_CHAPTER_KEY, 'aiAssistant');
  });

  test('das Inhaltskapitel reicht sie NICHT weiter', () => {
    // Ein Re-Export würde den Umzug wirkungslos machen: die Kernschicht
    // könnte die Kennung weiter aus dem Inhaltskapitel holen und das Kapitel
    // bliebe ein statischer Abhängigkeitsknoten von `js/core/`.
    assertEqual('AI_ASSISTANT_CHAPTER_ID' in chapterModule, false,
      Object.keys(chapterModule).join(','));
    assertEqual('AI_ASSISTANT_CHAPTER_KEY' in chapterModule, false,
      Object.keys(chapterModule).join(','));
  });

  test('das Kapitel benutzt die Kennung aus dem Fundort als moduleId', () => {
    assertEqual(aiAssistantHelp.moduleId, AI_ASSISTANT_CHAPTER_ID);
  });
});
