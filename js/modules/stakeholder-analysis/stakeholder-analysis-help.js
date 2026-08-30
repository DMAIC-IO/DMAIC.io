/**
 * D.Mike — Stakeholder Analysis Module Handbook (stakeholder-analysis-help.js)
 * Bilingual help content (DE/EN) for the stakeholder analysis module.
 */

export default {
  moduleId: 'stakeholder-analysis',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:stakeholder|Stakeholder-Analyse}} identifiziert alle Personen und Gruppen, die ein Six-Sigma-Projekt beeinflussen oder von ihm betroffen sind, und ordnet sie nach ihrem Einfluss und ihrer Haltung zum Projekt. Sie ist ein zentrales Werkzeug der Define-Phase und bildet die Grundlage für gezielte Kommunikation und Change Management.',
          },
          {
            type: 'definition',
            term: 'Stakeholder',
            content: 'Eine Person oder Gruppe, die das Projekt entweder beeinflussen kann oder vom Ergebnis betroffen ist — z. B. Sponsor, Operatoren, Kunden, IT, Betriebsrat, Vertrieb. Wer übersehen wird, kann später bremsen oder blockieren.',
          },
          {
            type: 'definition',
            term: 'Einfluss / Macht',
            content: 'Wie stark kann diese Person das Projekt fördern oder behindern? Hoher Einfluss = formelle Entscheidungsmacht oder informelle Autorität.',
          },
          {
            type: 'definition',
            term: 'Interesse / Betroffenheit',
            content: 'Wie sehr betrifft sie das Ergebnis? Hohes Interesse = das Projektergebnis ändert ihren Alltag oder ihre Ziele direkt.',
          },
          {
            type: 'definition',
            term: 'Power-Interest-Matrix',
            content: 'Stakeholder werden in vier Quadranten eingeordnet: hoch/hoch („Eng managen"), hoch/niedrig („Zufrieden halten"), niedrig/hoch („Gut informieren"), niedrig/niedrig („Beobachten"). Jeder Quadrant verlangt einen anderen Kommunikationsansatz.',
          },
          {
            type: 'definition',
            term: 'Aktuelle und gewünschte Haltung',
            content: 'Wo steht der Stakeholder heute (Befürworter, neutral, Gegner) und wo soll er stehen, damit das Projekt gelingt? Die Differenz markiert den Handlungsbedarf.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:stakeholder|Stakeholder analysis}} identifies all individuals and groups who influence a Six Sigma project or are affected by it, and classifies them by their influence and attitude toward the project. It is a central tool of the Define phase and forms the basis for targeted communication and change management.',
          },
          {
            type: 'definition',
            term: 'Stakeholder',
            content: 'A person or group that can either influence the project or is affected by its outcome — e.g. sponsor, operators, customers, IT, works council, sales. Those overlooked may later slow or block progress.',
          },
          {
            type: 'definition',
            term: 'Influence / power',
            content: 'How strongly can this person promote or hinder the project? High power = formal decision authority or informal influence.',
          },
          {
            type: 'definition',
            term: 'Interest / impact',
            content: 'How much does the result affect them? High interest = the project outcome directly changes their daily work or goals.',
          },
          {
            type: 'definition',
            term: 'Power-interest matrix',
            content: 'Stakeholders are placed in four quadrants: high/high ("Manage closely"), high/low ("Keep satisfied"), low/high ("Keep informed"), low/low ("Monitor"). Each quadrant calls for a different communication approach.',
          },
          {
            type: 'definition',
            term: 'Current and target stance',
            content: 'Where does the stakeholder stand today (supporter, neutral, opponent) and where should they stand for the project to succeed? The gap marks the action need.',
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
              'Stakeholder-Liste erstellen — alle Funktionen und Ebenen einbeziehen, die der Prozess berührt.',
              'Für jeden Stakeholder Einfluss und Interesse einschätzen (z. B. Skala 1–5).',
              'In die Power-Interest-Matrix eintragen — jeder Stakeholder bekommt einen Quadranten.',
              'Aktuelle Haltung erfassen (gegnerisch / neutral / unterstützend) und gewünschte Haltung definieren.',
              'Pro Stakeholder eine Kommunikationsstrategie ableiten — z. B. wöchentliches Update, persönliches Gespräch, Workshop-Einbindung.',
              'Die Liste regelmäßig aktualisieren — Stakeholder ändern Haltung, neue tauchen auf, alte fallen weg.',
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
              'Build the stakeholder list — include all functions and levels the process touches.',
              'Estimate influence and interest for each (e.g. scale 1–5).',
              'Place each stakeholder in the power-interest matrix — every entry gets a quadrant.',
              'Capture the current stance (opponent / neutral / supporter) and define the target stance.',
              'Derive a communication strategy per stakeholder — e.g. weekly update, one-on-one talk, workshop participation.',
              'Refresh the list regularly — stakeholders change stance, new ones appear, old ones leave.',
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
            term: 'Wichtige Stakeholder vergessen',
            content: 'Vor allem indirekt Betroffene (IT, Einkauf, Compliance) werden gerne übersehen — und blockieren später aus dem Hintergrund. Beim Brainstorming bewusst alle Schnittstellen abklopfen.',
          },
          {
            type: 'definition',
            term: 'Macht mit Hierarchie verwechseln',
            content: 'Einfluss ist nicht gleich Position. Ein erfahrener Maschinenführer kann mehr Veränderungsmacht haben als ein hoher Manager, der weit weg vom Prozess sitzt. Echte Wirkkraft einschätzen, nicht das Organigramm.',
          },
          {
            type: 'definition',
            term: 'Gegner ignorieren',
            content: 'Stakeholder mit ablehnender Haltung werden gerne aus dem Plan ausgeklammert. Das ist gefährlich — gerade sie brauchen die meiste Aufmerksamkeit. Bewusst auf sie zugehen.',
          },
          {
            type: 'definition',
            term: 'Statische Analyse',
            content: 'Stakeholder-Haltungen ändern sich. Eine einmal erstellte Matrix veraltet schnell. Mindestens an jedem Tollgate aktualisieren.',
          },
          {
            type: 'definition',
            term: 'Vertrauliche Bewertungen',
            content: 'Eine Power-Interest-Matrix mit Einschätzungen wie „Gegner" gehört nicht in offene Projektordner. Vertraulich behandeln, sonst entstehen politische Probleme.',
          },
          {
            type: 'definition',
            term: 'Kommunikation ohne Strategie',
            content: '„Wir informieren regelmäßig per E-Mail" ist keine Strategie. Pro Stakeholder konkret festlegen: Was sollen sie wissen, in welcher Form, wie oft, wer macht es?',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Missing important stakeholders',
            content: 'Indirectly affected groups (IT, purchasing, compliance) are easy to miss — and later block from the background. When brainstorming, deliberately walk through all interfaces.',
          },
          {
            type: 'definition',
            term: 'Confusing power with hierarchy',
            content: 'Influence is not equal to position. An experienced operator may have more change-making power than a senior manager far from the process. Estimate real impact, not the org chart.',
          },
          {
            type: 'definition',
            term: 'Ignoring opponents',
            content: 'Stakeholders with a negative stance tend to be excluded from the plan. That is dangerous — they need the most attention. Approach them deliberately.',
          },
          {
            type: 'definition',
            term: 'Static analysis',
            content: 'Stakeholder stances change. A matrix built once ages quickly. Refresh at least at every tollgate.',
          },
          {
            type: 'definition',
            term: 'Confidential assessments',
            content: 'A power-interest matrix with labels like "opponent" does not belong in open project folders. Treat as confidential, otherwise political problems arise.',
          },
          {
            type: 'definition',
            term: 'Communication without a strategy',
            content: '"We send a regular email" is not a strategy. Per stakeholder, define concretely: what should they know, in which form, how often, who delivers it?',
          },
        ],
      },
    },
  },
};
