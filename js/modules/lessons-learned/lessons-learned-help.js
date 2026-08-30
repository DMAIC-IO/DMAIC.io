/**
 * D.Mike — Lessons Learned Module Handbook (lessons-learned-help.js)
 * Bilingual help content (DE/EN) for the lessons learned module.
 */

export default {
  moduleId: 'lessons-learned',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:lessons-learned|Lessons Learned}} dokumentieren Erkenntnisse aus einem laufenden oder abgeschlossenen Projekt — was hat funktioniert, was nicht, und welche Schlussfolgerung ergibt sich daraus für zukünftige Projekte. Sie sind das organisationale Gedächtnis der Six-Sigma-Praxis und gehören in die Control-Phase, am besten aber kontinuierlich gepflegt.',
          },
          {
            type: 'definition',
            term: 'Erkenntnis (Lesson)',
            content: 'Ein einzelner, in sich geschlossener Lerneintrag mit Beschreibung, Kontext, Ursache und Empfehlung. Jede Lesson sollte für sich verständlich sein — auch ohne Kenntnis des Originalprojekts.',
          },
          {
            type: 'definition',
            term: 'Was lief gut / nicht gut',
            content: 'Lessons Learned umfassen beides: Erfolge, die wiederholt werden sollen, und Fehler, die vermieden werden sollen. Eine Sammlung nur aus Misserfolgen wirkt schnell deprimierend.',
          },
          {
            type: 'definition',
            term: 'Empfehlung',
            content: 'Konkrete, umsetzbare Handlungsanweisung für künftige Projekte — nicht „besser machen", sondern z. B. „Kick-off mit allen Schichten durchführen, nicht nur Frühschicht".',
          },
          {
            type: 'definition',
            term: 'Kategorisierung',
            content: 'Lessons werden nach DMAIC-Phase, Themenbereich oder Wirkung sortiert. Das macht sie später durchsuchbar — sonst verstauben sie als Liste.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:lessons-learned|Lessons learned}} document insights from a running or completed project — what worked, what did not, and what conclusion follows for future projects. They are the organizational memory of Six Sigma practice and belong in the Control phase, but are best kept continuously.',
          },
          {
            type: 'definition',
            term: 'Lesson',
            content: 'A single, self-contained learning entry with description, context, cause, and recommendation. Every lesson should make sense on its own — without knowledge of the original project.',
          },
          {
            type: 'definition',
            term: 'What went well / not well',
            content: 'Lessons learned cover both: successes to repeat and failures to avoid. A collection of failures only quickly becomes depressing.',
          },
          {
            type: 'definition',
            term: 'Recommendation',
            content: 'A concrete, actionable instruction for future projects — not "do better", but e.g. "run kick-off with all shifts, not just morning shift".',
          },
          {
            type: 'definition',
            term: 'Categorization',
            content: 'Lessons are sorted by DMAIC phase, topic, or impact. This makes them searchable later — otherwise they gather dust as a flat list.',
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
              'Lessons während des Projekts laufend sammeln — nicht erst am Ende. Was nach drei Monaten noch erinnert wird, ist nur ein Bruchteil des Erlebten.',
              'Am Projektende einen kurzen Workshop ansetzen: „Was lief gut, was nicht, was würden wir anders machen?".',
              'Jede Erkenntnis als eigene Lesson erfassen — mit Beschreibung, Ursache und Empfehlung.',
              'Sachlich formulieren, keine Schuldzuweisungen — Lessons sind kein Bewertungswerkzeug.',
              'Mit DMAIC-Phase und Thema kategorisieren.',
              'In die organisationsweite Sammlung übertragen, damit andere Projekte davon profitieren.',
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
              'Collect lessons continuously during the project — not only at the end. What is still remembered after three months is only a fraction of what was experienced.',
              'Run a short workshop at project end: "What went well, what not, what would we do differently?".',
              'Capture each insight as its own lesson — with description, cause, and recommendation.',
              'Phrase factually, no blame — lessons are not an evaluation tool.',
              'Categorize by DMAIC phase and topic.',
              'Transfer into the organization-wide collection so other projects can benefit.',
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
            term: 'Erst am Projektende erfasst',
            content: 'Wer wartet, vergisst. Lessons Learned funktionieren am besten, wenn sie unmittelbar nach den auslösenden Ereignissen festgehalten werden — sonst bleiben nur die spektakulärsten übrig.',
          },
          {
            type: 'definition',
            term: 'Schuldzuweisung statt Erkenntnis',
            content: '„Person X hat versagt" ist keine Lesson, sondern ein Vorwurf. Lessons beschreiben Strukturen, nicht Personen — sonst funktioniert das Format nicht und niemand trägt mehr ehrlich bei.',
          },
          {
            type: 'definition',
            term: 'Unkonkrete Empfehlungen',
            content: '„Besser kommunizieren" ist keine Empfehlung, sondern eine Floskel. Eine gute Empfehlung ist so konkret, dass jemand sie ohne Rückfragen umsetzen kann.',
          },
          {
            type: 'definition',
            term: 'Dokument verschwindet',
            content: 'Ohne zentrale Ablage und Suchfunktion landet die Sammlung im Projektordner und wird nie wiedergefunden. Eine durchsuchbare zentrale Datenbank ist Pflicht — sonst lernt nur das Projektteam, nicht die Organisation.',
          },
          {
            type: 'definition',
            term: 'Nur Fehler werden festgehalten',
            content: 'Erfolge sind genauso wichtig — sonst wird das Format zur Mängelliste. Bewusst nach „was lief gut" fragen.',
          },
          {
            type: 'definition',
            term: 'Kein Folge-Mechanismus',
            content: 'Lessons sind nutzlos, wenn sie nicht in Standards, Templates oder Schulungen einfließen. Pro Lesson definieren: Wo wird sie wirksam, wer trägt sie weiter?',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Captured only at project end',
            content: 'Waiting means forgetting. Lessons learned work best when recorded immediately after the triggering events — otherwise only the most spectacular ones remain.',
          },
          {
            type: 'definition',
            term: 'Blame instead of insight',
            content: '"Person X failed" is not a lesson but an accusation. Lessons describe structures, not people — otherwise the format breaks and nobody contributes honestly anymore.',
          },
          {
            type: 'definition',
            term: 'Unspecific recommendations',
            content: '"Communicate better" is not a recommendation but a platitude. A good recommendation is concrete enough for someone to act on it without follow-up questions.',
          },
          {
            type: 'definition',
            term: 'Document disappears',
            content: 'Without a central store and search, the collection ends up in a project folder and is never found again. A searchable central database is mandatory — otherwise only the project team learns, not the organization.',
          },
          {
            type: 'definition',
            term: 'Only failures recorded',
            content: 'Successes matter just as much — otherwise the format turns into a defect list. Deliberately ask "what went well".',
          },
          {
            type: 'definition',
            term: 'No follow-up mechanism',
            content: 'Lessons are useless if they do not flow into standards, templates, or training. For every lesson define: where does it take effect, who carries it forward?',
          },
        ],
      },
    },
  },
};
