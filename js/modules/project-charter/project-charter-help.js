/**
 * D.Mike — Project Charter Module Handbook (project-charter-help.js)
 * Bilingual help content (DE/EN) for the project charter module.
 */

export default {
  moduleId: 'project-charter',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der {{term:project-charter|Project Charter}} ist das Gründungsdokument eines Six-Sigma-Projekts. Er beschreibt knapp und nachvollziehbar, warum das Projekt nötig ist, was es erreichen soll, wer beteiligt ist und in welchem Rahmen gearbeitet wird. Er ist das erste Tool der Define-Phase und wird im Tollgate-Review als Referenz herangezogen.',
          },
          {
            type: 'definition',
            term: 'Problemstellung (Problem Statement)',
            content: 'Beschreibt knapp das aktuelle Problem mit Fakten: Was passiert? Wo, wann, wie oft? Welche Auswirkung hat es? Bewusst ohne Ursachen und ohne Lösungen — die werden später in Analyze und Improve erarbeitet.',
          },
          {
            type: 'definition',
            term: 'Projektziele',
            content: 'Was soll am Ende erreicht werden? Jedes Ziel bekommt eine Zeile mit Beschreibung, Zieldatum, Messgröße und Zielwert. „Ausschuss von 4,2 % auf 1,5 % senken bis 31.12." ist ein gutes Ziel; „Qualität verbessern" ist keins.',
          },
          {
            type: 'definition',
            term: 'ZEG (Zielerreichungsgrad)',
            content: 'Wie weit ist das Ziel erreicht? 0 = nicht begonnen, 100 = vollständig erreicht. Den Wert im Lauf des Projekts nachführen — so zeigt der Projektauftrag jederzeit den Stand.',
          },
          {
            type: 'definition',
            term: 'Abgrenzung (Scope)',
            content: 'Was ist Teil des Projekts und was nicht? Halten Sie das in der Problembeschreibung fest. Eine klare Abgrenzung verhindert {{term:projektumfang|Scope Creep}} — z. B. „Nur Produktionslinie 3, nicht die Endmontage".',
          },
          {
            type: 'definition',
            term: 'Organigramm (Team und Rollen)',
            content: 'Sponsor, Projektleiter (Black/Green Belt), Kernteam. Klar dokumentierte Rollen vermeiden später Zuständigkeitslücken. Zuständigkeiten im Detail regelt die RACI-Matrix, Interessen und Einfluss die Stakeholder-Analyse.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:project-charter|project charter}} is the founding document of a {{term:six-sigma|Six Sigma}} project. It describes briefly and traceably why the project is needed, what it should achieve, who is involved, and within which boundaries the work happens. It is the first tool of the Define phase and is used as a reference in tollgate reviews.',
          },
          {
            type: 'definition',
            term: 'Problem statement',
            content: 'Briefly describes the current problem with facts: what is happening, where, when, how often, and with what impact? Deliberately without causes and without solutions — those come later in Analyze and Improve.',
          },
          {
            type: 'definition',
            term: 'Project goals',
            content: 'What should be achieved at the end? Each goal gets a row with description, target date, metric, and target value. "Reduce scrap from 4.2 % to 1.5 % by Dec 31" is a good goal; "improve quality" is not.',
          },
          {
            type: 'definition',
            term: 'GAL (goal achievement level)',
            content: 'How far has the goal been reached? 0 = not started, 100 = fully achieved. Keep the value up to date during the project — that way the charter always shows the current state.',
          },
          {
            type: 'definition',
            term: 'Scope',
            content: 'What is part of the project and what is not? Record this in the problem statement. A clear boundary prevents scope creep — e.g. "Only production line 3, not final assembly".',
          },
          {
            type: 'definition',
            term: 'Org chart (team and roles)',
            content: 'Sponsor, project leader (Black/Green Belt), core team. Clearly documented roles avoid responsibility gaps later. The RACI matrix covers responsibilities in detail, the stakeholder analysis covers interests and influence.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen',
        blocks: [
          {
            type: 'list',
            items: [
              '{{term:problembeschreibung|Problemstellung}} in 2–4 Sätzen formulieren — mit Fakten, ohne Vermutungen.',
              'In der Problembeschreibung auch festhalten, was NICHT Teil des Projekts ist.',
              'Ziele anlegen, jeweils mit Messgröße, Zielwert und Zieldatum.',
              'Im Organigramm Team und Rollen eintragen, mindestens Sponsor und Projektleiter.',
              'Den ZEG der Ziele im Projektverlauf nachführen.',
              'Charter mit Sponsor abstimmen und freigeben — er ist die Basis für alles, was folgt.',
            ],
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Write the problem statement in 2–4 sentences — with facts, no speculation.',
              'In the problem statement, also record what is NOT part of the project.',
              'Create goals, each with metric, target value, and target date.',
              'Add team and roles in the org chart, at minimum sponsor and project leader.',
              'Keep the GAL of each goal up to date as the project progresses.',
              'Align the charter with the sponsor and get sign-off — it is the basis for everything that follows.',
            ],
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
            term: 'Lösung in der Problemstellung',
            content: 'Sätze wie „Wir brauchen eine neue Maschine" sind keine Problemstellung — sie nehmen die Lösung vorweg. Beim Verfassen prüfen: Beschreibt der Satz das Symptom oder schon die Antwort?',
          },
          {
            type: 'definition',
            term: 'Unmessbare Ziele',
            content: '„Effizienz steigern", „Mitarbeiter motivieren" sind keine Ziele. Jedes Ziel braucht eine Zahl, eine Einheit und ein Datum — sonst lässt es sich am Ende des Projekts nicht prüfen.',
          },
          {
            type: 'definition',
            term: 'Zu großer Scope',
            content: 'Six-Sigma-Projekte sollten typischerweise in 3–6 Monaten abgeschlossen sein. Wer „den gesamten Werksprozess optimieren" will, scheitert. Lieber das Projekt klein schneiden und nachschärfen.',
          },
          {
            type: 'definition',
            term: 'Kein Sponsor-Commitment',
            content: 'Ohne aktiven Sponsor (Ressourcen, Eskalationsweg, politischer Rückhalt) kommen Projekte spätestens in Improve ins Stocken. Der Sponsor im Organigramm ist nicht symbolisch — der Sponsor muss informiert und eingebunden sein.',
          },
          {
            type: 'definition',
            term: 'Charter wird nie aktualisiert',
            content: 'Im Lauf des Projekts ändern sich Ziele, Scope und Beteiligte. Der Charter sollte ein lebendes Dokument sein — Änderungen mit Datum festhalten, statt veralteten Stand zu konservieren.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Solution in the problem statement',
            content: 'Sentences like "We need a new machine" are not problem statements — they jump to a solution. While writing, ask: does the sentence describe the symptom or the answer?',
          },
          {
            type: 'definition',
            term: 'Immeasurable goals',
            content: '"Increase efficiency", "motivate employees" are not goals. Every goal needs a number, a unit, and a date — otherwise it cannot be verified at the end of the project.',
          },
          {
            type: 'definition',
            term: 'Scope too large',
            content: 'Six Sigma projects should typically finish in 3–6 months. Wanting to "optimize the entire plant process" leads to failure. Cut the project small and refine later.',
          },
          {
            type: 'definition',
            term: 'No sponsor commitment',
            content: 'Without an active sponsor (resources, escalation path, political backing), projects stall at the latest in Improve. The sponsor in the org chart is not symbolic — the sponsor must be informed and engaged.',
          },
          {
            type: 'definition',
            term: 'Charter is never updated',
            content: 'During the project, goals, scope, and participants change. The charter should be a living document — record changes with a date instead of preserving an outdated state.',
          },
        ],
      },
    },
  },
};
