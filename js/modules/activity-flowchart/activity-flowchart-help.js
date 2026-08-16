/**
 * D.Mike — Activity Flowchart Module Help (activity-flowchart-help.js)
 * Bilingual help content (DE/EN) for the activity flowchart module.
 */
export default {
  moduleId: 'activity-flowchart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau',
        blocks: [
          { type: 'paragraph', content: 'Das Activity-Flowchart bildet eine Kette aus Aktivitäten (Rechtecke) und Entscheidungen (Rauten) von links nach rechts ab. Jede Entscheidung hat zwei Verzweigungen — „Ja" und „Nein" — die auf den nächsten Schritt, das Prozessende oder einen früheren Schritt (Nacharbeits-Bogen) zeigen können.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The Activity Flowchart renders a left-to-right chain of activities (rectangles) and decisions (diamonds). Each decision has two branches — "Yes" and "No" — that can point to the next step, the process end, or an earlier step (a rework loop).' },
        ],
      },
    },

    whenToUse: {
      de: {
        title: 'Wann verwenden?',
        blocks: [
          { type: 'paragraph', content: 'Das Activity Flowchart eignet sich in der Analyze-Phase, wenn ein Ablauf mit klaren Entscheidungspunkten und möglichen Rücksprüngen dokumentiert werden soll — z. B. Freigabe-, Prüf- oder Genehmigungsprozesse. Im Unterschied zur Prozesskarte verzichtet es bewusst auf Swim Lanes, Input/Output-Klassifikation und Wertschöpfungstypen und konzentriert sich auf die reine Ablauflogik inklusive Verzweigungen.' },
        ],
      },
      en: {
        title: 'When to use',
        blocks: [
          { type: 'paragraph', content: 'The Activity Flowchart fits the Analyze phase when a workflow needs clear decision points and possible loop-backs — e.g. approval, review, or sign-off processes. Unlike the process map, it deliberately drops swim lanes, input/output classification, and value-type tags, focusing purely on flow logic including branches.' },
        ],
      },
    },

    howToUse: {
      de: {
        title: 'Bedienung',
        blocks: [
          { type: 'paragraph', content: 'Über „Aktivität hinzufügen" wird ein neuer Schritt am Ende der Kette angelegt, über „Entscheidung hinzufügen" eine Raute mit Ja/Nein-Ausgängen. Ein Klick auf ein Ja/Nein-Label öffnet den Target-Picker, in dem der nächste Schritt, das Prozessende oder ein beliebiger anderer Schritt als Ziel gewählt werden kann. Über „Importieren aus …" lassen sich Schritte aus einer bestehenden SIPOC- oder Process-Map-Instanz übernehmen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: 'Use "Add activity" to append a new step at the end of the chain, and "Add decision" for a diamond with Yes/No outputs. Clicking a Yes/No label opens the target picker, where the next step, the process end, or any other step can be chosen as the target. "Import from …" pulls steps in from an existing SIPOC or Process Map instance.' },
        ],
      },
    },

    reworkLoops: {
      de: {
        title: 'Rework-Loops',
        blocks: [
          { type: 'paragraph', content: 'Zeigt eine Entscheidung auf einen früheren statt auf den nächsten Schritt, entsteht ein Nacharbeits-Bogen (Rework-Loop) — das Ziel ist am Yes/No-Label sichtbar (Titel des Ziel-Schritts). Ein visueller Bogen über die betroffenen Schritte ist noch nicht gerendert; das folgt in einem späteren Task. Jede Schleife braucht einen erreichbaren Ausgang, sonst bleibt der Prozess in der Analyse hängen; ein Ziel „Prozessende" auf mindestens einem Zweig verhindert das.' },
        ],
      },
      en: {
        title: 'Rework loops',
        blocks: [
          { type: 'paragraph', content: 'When a decision points back to an earlier step instead of the next one, a rework loop appears — the target is visible on the Yes/No label (the target step\'s title). A visual arc spanning the affected steps is not rendered yet; that follows in a later task. Every loop needs a reachable exit, otherwise the process gets stuck in the analysis; setting "process end" on at least one branch prevents that.' },
        ],
      },
    },
  },
};
