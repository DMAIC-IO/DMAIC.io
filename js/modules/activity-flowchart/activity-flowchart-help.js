/**
 * D.Mike — Activity Flowchart Module Help (activity-flowchart-help.js)
 * Placeholder handbook (DE/EN) — full content follows in a later task.
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
  },
};
