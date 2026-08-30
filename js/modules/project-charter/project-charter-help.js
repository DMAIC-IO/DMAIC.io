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
            term: 'Zieldefinition',
            content: 'Was soll am Ende erreicht werden? Ziele werden als nummerierte Liste mit messbaren Größen formuliert (Ausgangs-, Erwartungs- und Grenzwert — ZEG). „Ausschuss von 4,2 % auf 1,5 % senken bis 31.12." ist ein gutes Ziel; „Qualität verbessern" ist keins.',
          },
          {
            type: 'definition',
            term: 'Scope (Umfang)',
            content: 'Was ist Teil des Projekts und was nicht? Eine klare Abgrenzung verhindert Scope Creep — z. B. „Nur Produktionslinie 3, nicht die Endmontage".',
          },
          {
            type: 'definition',
            term: 'Team und Rollen',
            content: 'Sponsor, Projektleiter (Black/Green Belt), Kernteam, Stakeholder. Klar dokumentierte Rollen vermeiden später Zuständigkeitslücken.',
          },
          {
            type: 'definition',
            term: 'Zeit- und Meilensteinplan',
            content: 'Übersicht über die wichtigsten Termine, mindestens die {{term:dmaic|DMAIC}}-Tollgates. Ein realistischer Plan ist wichtiger als ein ehrgeiziger.',
          },
          {
            type: 'definition',
            term: 'Business Case',
            content: 'Quantitative Begründung: Welcher Nutzen entsteht (Einsparung, Umsatz, Qualität, Sicherheit)? Welche Kosten sind beteiligt? Der Sponsor sollte daraus die Investition ableiten können.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:project-charter|project charter}} is the founding document of a Six Sigma project. It describes briefly and traceably why the project is needed, what it should achieve, who is involved, and within which boundaries the work happens. It is the first tool of the Define phase and is used as a reference in tollgate reviews.',
          },
          {
            type: 'definition',
            term: 'Problem statement',
            content: 'Briefly describes the current problem with facts: what is happening, where, when, how often, and with what impact? Deliberately without causes and without solutions — those come later in Analyze and Improve.',
          },
          {
            type: 'definition',
            term: 'Goal definition',
            content: 'What should be achieved at the end? Goals are formulated as a numbered list with measurable values (baseline, target, and threshold — BTT). "Reduce scrap from 4.2 % to 1.5 % by Dec 31" is a good goal; "improve quality" is not.',
          },
          {
            type: 'definition',
            term: 'Scope',
            content: 'What is part of the project and what is not? A clear boundary prevents scope creep — e.g. "Only production line 3, not final assembly".',
          },
          {
            type: 'definition',
            term: 'Team and roles',
            content: 'Sponsor, project leader (Black/Green Belt), core team, stakeholders. Clearly documented roles avoid responsibility gaps later.',
          },
          {
            type: 'definition',
            term: 'Schedule and milestones',
            content: 'Overview of the key dates, at minimum the DMAIC tollgates. A realistic plan is more important than an ambitious one.',
          },
          {
            type: 'definition',
            term: 'Business case',
            content: 'Quantitative justification: which benefit is created (savings, revenue, quality, safety)? Which costs are involved? The sponsor should be able to derive the investment from it.',
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
              'Problemstellung in 2–4 Sätzen formulieren — mit Fakten, ohne Vermutungen.',
              'Ziele als nummerierte Liste anlegen, jeweils mit Ausgangswert (heute), Erwartung (Soll) und Grenzwert (akzeptables Minimum).',
              'Scope und Out-of-Scope klar abgrenzen — was wird NICHT bearbeitet.',
              'Team und Rollen eintragen, mindestens Sponsor und Projektleiter.',
              'Zeitplan mit den fünf DMAIC-Tollgates entwerfen.',
              'Business Case ergänzen — Schätzung der Einsparung und der Projektkosten.',
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
              'Create goals as a numbered list, each with baseline (today), target (intended), and threshold (acceptable minimum).',
              'Clearly delimit scope and out-of-scope — what will NOT be addressed.',
              'Add team and roles, at minimum sponsor and project leader.',
              'Sketch a schedule with the five DMAIC tollgates.',
              'Add the business case — estimated savings and project cost.',
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
            content: 'Ohne aktiven Sponsor (Ressourcen, Eskalationsweg, politischer Rückhalt) kommen Projekte spätestens in Improve ins Stocken. Sponsor-Eintrag im Charter ist nicht symbolisch — der Sponsor muss informiert und eingebunden sein.',
          },
          {
            type: 'definition',
            term: 'Charter wird nie aktualisiert',
            content: 'Im Lauf des Projekts ändern sich Ziele, Scope und Beteiligte. Der Charter sollte ein lebendes Dokument sein — Änderungen mit Datum festhalten, statt veralteten Stand zu konservieren.',
          },
          {
            type: 'definition',
            term: 'Business Case beschönigt',
            content: 'Übertriebene Einsparungsversprechen rächen sich im Control-Tollgate. Lieber konservativ schätzen und am Ende positiv überraschen.',
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
            content: 'Without an active sponsor (resources, escalation path, political backing), projects stall at the latest in Improve. The sponsor entry in the charter is not symbolic — the sponsor must be informed and engaged.',
          },
          {
            type: 'definition',
            term: 'Charter is never updated',
            content: 'During the project, goals, scope, and participants change. The charter should be a living document — record changes with a date instead of preserving an outdated state.',
          },
          {
            type: 'definition',
            term: 'Business case oversold',
            content: 'Inflated savings promises come back to bite you in the Control tollgate. Estimate conservatively and surprise positively at the end.',
          },
        ],
      },
    },
  },
};
