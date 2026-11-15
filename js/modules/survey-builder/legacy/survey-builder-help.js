/**
 * D.Mike — Survey builder handbook (survey-builder-help.js)
 * Bilingual help content (DE/EN) for the survey-builder module.
 */

export default {
  moduleId: 'survey-builder',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der Fragebogen-Generator führt eine {{term:customer-survey|Kundenbefragung}} vom Entwurf bis zur Auswertung, ohne dass die Daten das Projekt verlassen: Fragebogen zusammenstellen, als eigenständige HTML-Datei verschicken, die zurückgeschickten Antwortdateien einlesen und auswerten.',
          },
          {
            type: 'paragraph',
            content: 'Die Empfänger brauchen nichts außer einem Browser. Die HTML-Datei läuft auch offline und ohne Installation; am Ende speichert sie eine kleine JSON-Datei mit den Antworten, die per E-Mail zurückkommt. Es gibt keinen Server und keinen Rückkanal im Netz.',
          },
          {
            type: 'definition',
            term: 'Entwurf',
            content: 'Kopf, Abschnitte und Fragen anlegen, Bedingungen setzen und den Fragebogen in der Vorschau durchklicken. „Fragebogen exportieren“ erzeugt die allgemeine Datei ohne Empfängerbezug.',
          },
          {
            type: 'definition',
            term: 'Empfänger',
            content: 'Je Empfänger eine eigene HTML-Datei erzeugen. Die Liste zeigt, wer welche Version bekommen und wer schon geantwortet hat.',
          },
          {
            type: 'definition',
            term: 'Auswertung',
            content: 'Antwortdateien einlesen, je Frage auswerten, filtern, nach einer Einfachauswahl-Frage gruppieren und einen Bericht exportieren. Freitexte gehen in den {{term:voc|VoC}}-Baum, Kano-Fragen an das Kano-Modul.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The survey builder takes a {{term:customer-survey|customer survey}} from draft to evaluation without the data ever leaving the project: build the questionnaire, send it as a self-contained HTML file, import the returned answer files and evaluate them.',
          },
          {
            type: 'paragraph',
            content: 'Recipients need nothing but a browser. The HTML file works offline and without installation; at the end it saves a small JSON file with the answers, which comes back by e-mail. There is no server and no online return channel.',
          },
          {
            type: 'definition',
            term: 'Draft',
            content: 'Create the header, sections and questions, set conditions and click through the questionnaire in the preview. "Export questionnaire" creates the general file without a recipient.',
          },
          {
            type: 'definition',
            term: 'Recipients',
            content: 'Create one HTML file per recipient. The list shows who received which version and who has already answered.',
          },
          {
            type: 'definition',
            term: 'Results',
            content: 'Import answer files, evaluate each question, filter, group by a single-choice question and export a report. Free texts go to the {{term:voc|VoC}} tree, Kano questions to the Kano module.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'paragraph',
            content: 'Zuerst die Frage klären, die die Befragung beantworten soll, dann die Fragetypen wählen: Einfach- und Mehrfachauswahl für Zuordnungen, die Bewertungsmatrix (1 bis 5) für Zufriedenheit, die Kano-Frage für Anforderungen nach dem {{term:kano-fragebogen|Kano-Fragebogen}}, Freitext für alles, was sich nicht vorhersehen lässt.',
          },
          {
            type: 'paragraph',
            content: 'Eine Einfachauswahl-Frage zur Kundengruppe am Anfang lohnt sich doppelt: Sie steuert über Bedingungen, welche Abschnitte jemand sieht, und sie ist später die Grundlage für den Gruppenvergleich. Bedingungen verweisen immer auf Antworten weiter vorn; ausgeblendete Fragen sind nie Pflicht.',
          },
          {
            type: 'paragraph',
            content: 'Nach dem ersten Versand zählt jede Strukturänderung als neue Version. Empfänger mit einer älteren Version sind in der Liste markiert und können eine neue Datei bekommen; ihre Antworten werden trotzdem eingelesen, unbekannte Antworten fallen dabei weg.',
          },
          {
            type: 'paragraph',
            content: 'In der Auswertung gilt: erst filtern, dann gruppieren. Gruppenwerte, die um mindestens 0,5 vom Gesamtmittel abweichen, sind hervorgehoben; Gruppen mit weniger als fünf Antworten tragen den Hinweis „wenig Antworten“. Die Übergabe an das Kano-Modul nimmt immer alle Antworten, unabhängig vom Filter.',
          },
        ],
      },
      en: {
        title: 'Method',
        blocks: [
          {
            type: 'paragraph',
            content: 'First settle the question the survey has to answer, then pick the question types: single and multiple choice for classification, the rating matrix (1 to 5) for satisfaction, the Kano question for requirements following the {{term:kano-fragebogen|Kano questionnaire}}, free text for everything that cannot be foreseen.',
          },
          {
            type: 'paragraph',
            content: 'A single-choice question about the customer group at the start pays off twice: through conditions it controls which sections someone sees, and later it is the basis of the group comparison. Conditions always refer to answers further up; hidden questions are never required.',
          },
          {
            type: 'paragraph',
            content: 'After the first send, every structural change counts as a new version. Recipients holding an older version are marked in the list and can receive a new file; their answers are still imported, and answers that no longer match a question are dropped.',
          },
          {
            type: 'paragraph',
            content: 'In the evaluation, filtering comes first, then grouping. Group values that deviate from the overall mean by at least 0.5 are highlighted; groups with fewer than five responses carry the note "few responses". The hand-over to the Kano module always takes all responses, regardless of the filter.',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          {
            type: 'definition',
            term: 'Kleine Gruppen überbewerten',
            content: 'Drei Antworten je Gruppe zeigen eine Richtung, keinen Beleg. Der Gruppenvergleich rechnet keine Signifikanz; der Hinweis „wenig Antworten“ ist ernst gemeint.',
          },
          {
            type: 'definition',
            term: 'Nach dem Versand umbauen',
            content: 'Wer Optionen löscht oder den Fragetyp ändert, nachdem schon Antworten da sind, verliert die passenden Antworten. Neue Fragen und Optionen ergänzen ist unkritisch.',
          },
          {
            type: 'definition',
            term: 'Anonymität falsch verstehen',
            content: '„Anonym auswerten“ blendet Namen in der Auswertung und im Bericht aus. Die Empfängerliste selbst bleibt bestehen, damit der Rücklauf sichtbar ist.',
          },
          {
            type: 'definition',
            term: 'Leitende Fragen stellen',
            content: 'Formulierungen wie „Wie sehr schätzen Sie unseren schnellen Support?“ geben die Antwort vor. Neutral fragen und die Bewertung der Skala überlassen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Over-reading small groups',
            content: 'Three responses per group show a direction, not proof. The group comparison computes no significance; the "few responses" note is meant seriously.',
          },
          {
            type: 'definition',
            term: 'Restructuring after sending',
            content: 'Deleting options or changing a question type once answers have arrived loses the matching answers. Adding new questions and options is harmless.',
          },
          {
            type: 'definition',
            term: 'Misreading anonymity',
            content: '"Evaluate anonymously" hides names in the evaluation and in the report. The recipient list itself stays, so the response rate remains visible.',
          },
          {
            type: 'definition',
            term: 'Asking leading questions',
            content: 'Wording such as "How much do you value our fast support?" dictates the answer. Ask neutrally and leave the judgement to the scale.',
          },
        ],
      },
    },
  },
};
