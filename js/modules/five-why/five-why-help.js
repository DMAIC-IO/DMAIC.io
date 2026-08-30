/**
 * D.Mike — 5-Why Module Handbook (five-why-help.js)
 * Bilingual help content (DE/EN) for the 5-Why module.
 */

export default {
  moduleId: 'five-why',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:five-why|5-Why-Methode}} (auch 5×Warum) ist eine einfache, aber wirkungsvolle Technik zur {{term:ursachenanalyse|Wurzelursachenanalyse}}. Ausgehend von einem konkreten Problem wird wiederholt „Warum?" gefragt — typischerweise fünfmal — bis eine grundlegende Ursache erreicht ist, deren Beseitigung das Problem nachhaltig löst.',
          },
          {
            type: 'definition',
            term: 'Problemstellung',
            content: 'Der Ausgangspunkt: ein konkretes, beobachtetes Problem oder eine Abweichung. Je präziser formuliert, desto zielführender die nachfolgenden „Warum?"-Fragen.',
          },
          {
            type: 'definition',
            term: '„Warum?"-Kette',
            content: 'Auf jede Antwort folgt erneut die Frage „Warum?". Jede Ebene führt eine Stufe näher an die Wurzel. Die Zahl 5 ist eine Faustregel — manche Probleme lösen sich nach 3, andere brauchen 7 oder mehr.',
          },
          {
            type: 'definition',
            term: 'Wurzelursache',
            content: 'Die letzte Antwort, jenseits derer „Warum?" keine technisch oder organisatorisch beeinflussbare Antwort mehr liefert. Hier setzt die Verbesserungsmaßnahme an.',
          },
          {
            type: 'definition',
            term: 'Verzweigungen',
            content: 'Manchmal gibt es zu einer Frage mehrere plausible Antworten. Dann verzweigt sich die Kette in mehrere parallele Stränge — jeder davon kann zu einer eigenen Wurzelursache führen.',
          },
          {
            type: 'paragraph',
            content: '5-Why ist günstig, schnell und team-tauglich. Es eignet sich besonders für klar abgegrenzte Einzelvorfälle. Bei komplexen, mehrfaktoriellen Problemen sind {{term:ishikawa|Ishikawa}} und {{term:fmea|FMEA}} besser geeignet.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The {{term:five-why|5-Why method}} (also "5 Whys") is a simple but powerful technique for {{term:ursachenanalyse|root-cause analysis}}. Starting from a concrete problem, you repeatedly ask "why?" — typically five times — until you reach a fundamental cause whose removal solves the problem sustainably.',
          },
          {
            type: 'definition',
            term: 'Problem statement',
            content: 'The starting point: a concrete, observed problem or deviation. The more precisely it is phrased, the better the following "why?" questions work.',
          },
          {
            type: 'definition',
            term: '"Why?" chain',
            content: 'Every answer is followed by another "why?". Each level moves one step closer to the root. The number 5 is a rule of thumb — some problems resolve after 3, others need 7 or more.',
          },
          {
            type: 'definition',
            term: 'Root cause',
            content: 'The last answer beyond which "why?" no longer yields a technically or organizationally actionable answer. This is where the improvement action attaches.',
          },
          {
            type: 'definition',
            term: 'Branches',
            content: 'Sometimes a question has several plausible answers. The chain then branches into parallel strands — each may lead to its own root cause.',
          },
          {
            type: 'paragraph',
            content: '5-Why is cheap, fast, and team-friendly. It suits clearly bounded individual incidents. For complex, multi-factor problems, Ishikawa and {{term:fmea|FMEA}} are better tools.',
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
              'Problem konkret beschreiben — was ist passiert, wo, wann, wie oft?',
              '„Warum?" fragen und die plausibelste Antwort eintragen.',
              'Auf die Antwort erneut „Warum?" anwenden — und so weiter.',
              'Wenn sich mehrere Antworten anbieten, verzweigen — jeder Strang wird einzeln verfolgt.',
              'Stoppen, sobald eine technisch oder organisatorisch adressierbare Wurzel erreicht ist.',
              'Maßnahme an der Wurzel ableiten — nicht an einem Symptom auf einer höheren Ebene.',
              'Wirksamkeit der Maßnahme nach Umsetzung mit Daten überprüfen.',
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
              'Describe the problem concretely — what happened, where, when, how often?',
              'Ask "why?" and enter the most plausible answer.',
              'Apply "why?" to the answer — and so on.',
              'If several answers fit, branch — each strand is followed individually.',
              'Stop as soon as a technically or organizationally actionable root is reached.',
              'Derive the action at the root — not at a symptom on a higher level.',
              'Verify the effectiveness of the action with data after implementation.',
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
            term: 'Schuldzuweisung statt Ursache',
            content: 'Antworten wie „Mitarbeiter hat nicht aufgepasst" sind keine Wurzelursachen, sondern Schuldzuweisungen. Weiterfragen: Warum konnte es passieren, dass eine Unaufmerksamkeit zum Problem wird? Liegt es an Schulung, Standardarbeit, Sichtprüfung?',
          },
          {
            type: 'definition',
            term: 'Zu früh aufhören',
            content: 'Die erste plausible Antwort ist selten die Wurzel. Wer nach „Warum 2" stoppt, behandelt ein Symptom. Mindestens so weit gehen, bis die Antwort etwas im Prozess oder System beschreibt.',
          },
          {
            type: 'definition',
            term: 'Zu lang weiterfragen',
            content: 'Irgendwann landet man bei „weil es so viel kostet" oder „weil die Branche so ist" — Antworten, die das Team nicht ändern kann. An dieser Stelle stoppen und auf der vorherigen Ebene ansetzen.',
          },
          {
            type: 'definition',
            term: 'Nur ein Strang',
            content: 'Bei komplexen Problemen führt nicht eine einzige Kette zur Lösung. Wenn mehrere Antworten plausibel sind, verzweigen — sonst werden wichtige Ursachen übersehen.',
          },
          {
            type: 'definition',
            term: 'Ohne Daten verifizieren',
            content: 'Die Antworten in einer Why-Kette sind Hypothesen. Vor der Maßnahme — oder spätestens danach — mit Daten prüfen, ob die identifizierte Wurzel tatsächlich der Treiber war.',
          },
          {
            type: 'definition',
            term: 'Allein gemacht',
            content: 'Eine Why-Kette von einer einzelnen Person reproduziert deren Vorannahmen. Im Team und mit den Personen, die den Prozess kennen, ist das Ergebnis robuster.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Blame instead of cause',
            content: 'Answers like "the operator was not paying attention" are not root causes but blame. Keep asking: why could inattention turn into a problem? Is it training, standard work, visual inspection?',
          },
          {
            type: 'definition',
            term: 'Stopping too early',
            content: 'The first plausible answer is rarely the root. Stopping after "why 2" treats a symptom. Go at least until the answer describes something in the process or system.',
          },
          {
            type: 'definition',
            term: 'Asking too long',
            content: 'Eventually you arrive at "because it costs so much" or "because that\'s how the industry is" — answers the team cannot change. Stop here and act on the previous level.',
          },
          {
            type: 'definition',
            term: 'Only one strand',
            content: 'For complex problems, one chain rarely produces the full solution. When several answers are plausible, branch — otherwise important causes are missed.',
          },
          {
            type: 'definition',
            term: 'Not verified with data',
            content: 'Answers in a why chain are hypotheses. Before — or at the latest after — the action, check with data whether the identified root was actually the driver.',
          },
          {
            type: 'definition',
            term: 'Done alone',
            content: 'A why chain from one person reproduces that person\'s assumptions. In a team with the people who know the process, the result is more robust.',
          },
        ],
      },
    },
  },
};
