/**
 * D.Mike — Deployment Flowchart Module Help (deployment-flowchart-help.js)
 * Bilingual help content (DE/EN) for the deployment flowchart module.
 */
export default {
  moduleId: 'deployment-flowchart',
  sections: {
    overview: {
      de: {
        title: 'Aufbau',
        blocks: [
          { type: 'paragraph', content: 'Das {{term:swimlane|Deployment Flowchart}} (auch Swimlane- oder Cross-Functional-Flowchart) zeigt einen Prozess als Kette von Schritten, die auf horizontale Bänder — die Lanes — verteilt sind. Jede Lane steht für eine Rolle oder Abteilung. Die Reihenfolge der Schritte läuft von links nach rechts durch die Kette; der Wechsel von einer Lane in eine andere ist eine Übergabe. Genau diese Übergaben sind der Grund für die Darstellung: an ihnen entstehen Wartezeiten, Missverständnisse und Verantwortungslücken.' },
        ],
      },
      en: {
        title: 'Structure',
        blocks: [
          { type: 'paragraph', content: 'The {{term:swimlane|Deployment Flowchart}} (also swimlane or cross-functional flowchart) shows a process as a chain of steps distributed across horizontal bands — the lanes. Each lane stands for a role or department. Steps run left to right through the chain; moving from one lane to another is a hand-off. Those hand-offs are the whole point of the view: they are where waiting time, misunderstandings, and ownership gaps appear.' },
        ],
      },
    },

    whenToUse: {
      de: {
        title: 'Wann verwenden?',
        blocks: [
          { type: 'paragraph', content: 'Das Deployment Flowchart eignet sich in der Analyze-Phase, wenn ein Prozess über mehrere Rollen oder Abteilungen läuft und die Frage „Wer macht was — und wo wird übergeben?" beantwortet werden muss. Viele Lane-Wechsel bei wenigen Schritten sind ein starkes Signal für Reibungsverluste. Im Unterschied zum Activity Flowchart bildet es keine Verzweigungen ab, im Unterschied zum Opportunity Flowchart keine Wert-Einstufung — sondern ausschließlich die Zuständigkeit.' },
        ],
      },
      en: {
        title: 'When to use',
        blocks: [
          { type: 'paragraph', content: 'The Deployment Flowchart fits the Analyze phase when a process spans several roles or departments and the question is "who does what — and where is it handed over?". Many lane switches across few steps is a strong signal for friction. Unlike the Activity Flowchart it shows no branching, and unlike the Opportunity Flowchart no value classification — only ownership.' },
        ],
      },
    },

    howToUse: {
      de: {
        title: 'Bedienung',
        blocks: [
          { type: 'paragraph', content: '„Rolle hinzufügen" legt eine neue Lane an; der Name wird direkt in der Seitenleiste eingetippt. „Schritt hinzufügen" hängt den neuen Schritt ans Ende der Kette an — immer in der Lane „Nicht zugeordnet", und die Ansicht springt gleich dorthin. Wem der Schritt gehört, entscheidet man danach bewusst per Drag auf ein Rollen-Band. Karten werden an der blauen Nummer gegriffen. Zieht man eine Karte in ein anderes Band, wechselt die Zuständigkeit — ihre Position in der Kette bleibt. Zieht man sie stattdessen auf einen Pfeil zwischen zwei Karten, ändert sich ihre Position in der Kette und die Rolle bleibt — auch dann, wenn der Pfeil in einem anderen Rollen-Band liegt. Über „Detail-Schritte" lässt sich jede Karte in Unter-Schritte aufklappen. Über „Importieren aus …" werden Schritte aus einer Process Map oder SIPOC übernommen.' },
        ],
      },
      en: {
        title: 'How to use',
        blocks: [
          { type: 'paragraph', content: '"Add role" creates a new lane; type its name directly in the sidebar. "Add step" appends the new step at the end of the chain — always in the "Unassigned" lane, and the view jumps straight there. Who owns the step is a deliberate second decision, made by dragging its card onto a role band. Cards are grabbed by their blue number. Drag one into another band to change ownership — its place in the chain is kept. Drop it on an arrow between two cards instead and its place in the chain changes while the role is kept — even when that arrow sits in another role\'s band. "Detail steps" expands any card into sub-steps. "Import from …" pulls steps in from a Process Map or SIPOC.' },
        ],
      },
    },

    lanes: {
      de: {
        title: 'Die Lane „Nicht zugeordnet"',
        blocks: [
          { type: 'paragraph', content: 'Neben den selbst angelegten Rollen gibt es eine reservierte Lane „Nicht zugeordnet". Sie entsteht automatisch, sobald ein Schritt keine Rolle hat — etwa nach einem Import aus Process Map oder SIPOC, die beide keine Rollen-Information mitbringen. Diese Lane lässt sich weder umbenennen noch löschen: sie ist der Auffangbereich, damit nie ein Schritt ohne sichtbare Zeile existiert. Wird eine Rolle gelöscht, wandern ihre Schritte dorthin — sie gehen nie mit der Rolle verloren.' },
        ],
      },
      en: {
        title: 'The "Unassigned" lane',
        blocks: [
          { type: 'paragraph', content: 'Alongside your own roles there is a reserved "Unassigned" lane. It appears automatically as soon as a step has no role — for example after importing from a Process Map or SIPOC, neither of which carries role information. This lane can neither be renamed nor deleted: it is the catch-all that guarantees no step exists without a visible row. Deleting a role moves its steps there — they are never lost with the role.' },
        ],
      },
    },
  },
};
