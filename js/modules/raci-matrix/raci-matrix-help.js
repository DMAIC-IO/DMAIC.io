/**
 * D.Mike — RACI Matrix Module Handbook (raci-matrix-help.js)
 * Bilingual help content (DE/EN) for the RACI matrix module.
 */

export default {
  moduleId: 'raci-matrix',
  sections: {
    overview: {
      de: {
        title: 'Aufbau einer RACI-Matrix',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:raci|RACI-Matrix}} klärt für jede Aufgabe oder Aktivität in einem Projekt, wer welche Rolle hat. Die vier Buchstaben stehen für vier klar definierte Verantwortungsarten. Sie verhindert Doppelarbeit, Zuständigkeitslücken und unklare Entscheidungswege.',
          },
          {
            type: 'definition',
            term: 'R — Responsible (Durchführend)',
            content: 'Wer macht die Arbeit tatsächlich? Pro Aufgabe können mehrere Personen „R" sein, sollten es aber selten — sonst zerfasert die Verantwortung.',
          },
          {
            type: 'definition',
            term: 'A — Accountable (Rechenschaftspflichtig)',
            content: 'Wer ist letztendlich verantwortlich für das Ergebnis und trifft die finale Entscheidung? Pro Aufgabe genau eine Person — nicht null, nicht zwei. „A" trägt den Hut, „R" macht die Arbeit.',
          },
          {
            type: 'definition',
            term: 'C — Consulted (Konsultiert)',
            content: 'Wer wird vor der Entscheidung um Input gefragt? Zweiwege-Kommunikation. Typischerweise Fachexperten, deren Wissen unverzichtbar ist, die aber nicht entscheiden.',
          },
          {
            type: 'definition',
            term: 'I — Informed (Informiert)',
            content: 'Wer wird über das Ergebnis informiert? Einwege-Kommunikation. Stakeholder, die den Stand kennen müssen, aber keine aktive Rolle haben.',
          },
          {
            type: 'definition',
            term: 'Aufgaben (Zeilen) und Personen (Spalten)',
            content: 'Die Matrix listet links die Aufgaben oder Liefergegenstände, oben die Rollen oder Personen. In jeder Zelle steht der Buchstabe (R/A/C/I), oft auch leer, wenn keine Beteiligung besteht.',
          },
        ],
      },
      en: {
        title: 'Anatomy of a RACI Matrix',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:raci|RACI matrix}} clarifies, for every task or activity in a project, who has which role. The four letters stand for four clearly defined types of responsibility. It prevents duplicated work, responsibility gaps, and unclear decision paths.',
          },
          {
            type: 'definition',
            term: 'R — Responsible',
            content: 'Who actually does the work? Multiple people can be "R" per task but should be rare — otherwise responsibility frays.',
          },
          {
            type: 'definition',
            term: 'A — Accountable',
            content: 'Who is ultimately accountable for the result and makes the final decision? Exactly one person per task — not zero, not two. "A" wears the hat, "R" does the work.',
          },
          {
            type: 'definition',
            term: 'C — Consulted',
            content: 'Who is asked for input before the decision? Two-way communication. Typically subject-matter experts whose knowledge is essential but who do not decide.',
          },
          {
            type: 'definition',
            term: 'I — Informed',
            content: 'Who is informed about the result? One-way communication. Stakeholders who need to know the status but have no active role.',
          },
          {
            type: 'definition',
            term: 'Tasks (rows) and people (columns)',
            content: 'The matrix lists tasks or deliverables on the left and roles or people across the top. Each cell carries the letter (R/A/C/I) or remains empty if there is no involvement.',
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
              'Aufgaben oder Liefergegenstände aus dem Projektplan auflisten — als Zeilen.',
              'Beteiligte Personen oder Rollen als Spalten eintragen.',
              'Pro Aufgabe genau einen „A" vergeben — die letzte Instanz.',
              'Mindestens einen „R" pro Aufgabe — die ausführende Hand.',
              '„C" sparsam einsetzen — nur, wenn der Input wirklich gebraucht wird, sonst entstehen Engpässe.',
              '„I" für alle, die das Ergebnis kennen müssen, ohne mitzuentscheiden.',
              'Matrix mit dem Team gegenlesen und freigeben — Konflikte klären, bevor das Projekt läuft.',
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
              'List tasks or deliverables from the project plan — as rows.',
              'Add involved people or roles as columns.',
              'Assign exactly one "A" per task — the final authority.',
              'At least one "R" per task — the doing hand.',
              'Use "C" sparingly — only when the input is truly needed, otherwise bottlenecks appear.',
              '"I" for everyone who needs to know the result without participating in the decision.',
              'Review the matrix with the team and get sign-off — resolve conflicts before the project runs.',
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
            term: 'Mehrere „A" pro Aufgabe',
            content: 'Wenn zwei Personen rechenschaftspflichtig sind, ist niemand wirklich verantwortlich. Bei Konflikt eskaliert nichts, bei Erfolg streiten sich beide um den Lorbeer. Pro Zeile genau ein „A".',
          },
          {
            type: 'definition',
            term: 'Kein „A"',
            content: 'Eine Aufgabe ohne „A" ist Niemandsland — sie wird liegen bleiben oder unter falschen Annahmen erledigt. Jede Zeile braucht einen Hutträger.',
          },
          {
            type: 'definition',
            term: 'Zu viele „C"',
            content: 'Wer drei Experten konsultieren muss, verliert Tempo. Konsultation kostet Zeit — nur die wirklich nötigen einbinden, der Rest reicht als „I".',
          },
          {
            type: 'definition',
            term: '„R" und „A" verwechseln',
            content: 'Der „R" macht die Arbeit, der „A" verantwortet das Ergebnis. Oft ist das dieselbe Person, manchmal aber gerade nicht — z. B. wenn ein Operator ausführt und der Schichtleiter verantwortet.',
          },
          {
            type: 'definition',
            term: 'Matrix wird nicht gelebt',
            content: 'Eine RACI-Matrix in der Schublade nutzt niemandem. Sie sollte am Projektstart kommuniziert werden und bei jeder Rollenänderung aktualisiert werden.',
          },
          {
            type: 'definition',
            term: 'Spaltenwahl: Person vs. Rolle',
            content: 'Personen wechseln, Rollen sind stabiler. Bei langlaufenden Projekten lieber Rollen („Schichtleiter") als Namen verwenden — sonst muss die Matrix bei jedem Personalwechsel umgestrickt werden.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Multiple "A" per task',
            content: 'When two people are accountable, no one really is. On conflict nothing escalates, on success both fight for credit. Exactly one "A" per row.',
          },
          {
            type: 'definition',
            term: 'No "A"',
            content: 'A task without "A" is no-man\'s land — it will be left alone or done under wrong assumptions. Every row needs a hat wearer.',
          },
          {
            type: 'definition',
            term: 'Too many "C"',
            content: 'Having to consult three experts kills speed. Consultation costs time — only involve the truly necessary, the rest are "I".',
          },
          {
            type: 'definition',
            term: 'Confusing "R" and "A"',
            content: '"R" does the work, "A" is accountable for the result. Often the same person, sometimes deliberately not — e.g. an operator does it, a shift lead is accountable.',
          },
          {
            type: 'definition',
            term: 'Matrix is not lived',
            content: 'A RACI matrix in the drawer helps no one. It should be communicated at project start and updated on every role change.',
          },
          {
            type: 'definition',
            term: 'Column choice: person vs. role',
            content: 'People change, roles are more stable. For long-running projects, prefer roles ("shift lead") to names — otherwise the matrix has to be reworked on every staff change.',
          },
        ],
      },
    },
  },
};
