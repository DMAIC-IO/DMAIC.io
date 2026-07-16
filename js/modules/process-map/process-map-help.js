/**
 * D.Mike — Process Map Module Handbook (process-map-help.js)
 * Bilingual help content (DE/EN) for the process map module.
 */

export default {
  moduleId: 'process-map',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Eine {{term:process-map|Prozesskarte}} (Process Map, Flowchart) bildet einen Ablauf grafisch ab — Schritte, Entscheidungen, Inputs und Outputs werden in einer logischen Reihenfolge dargestellt. Während ein SIPOC nur den Rahmen zeigt, beschreibt die Prozesskarte die tatsächliche Reihenfolge und die Verzweigungen.',
          },
          {
            type: 'definition',
            term: 'Aktivität (Rechteck)',
            content: 'Ein einzelner Arbeitsschritt — z. B. „Bauteil messen", „Auftrag eingeben". Aktivitäten verändern den Zustand des Prozesses.',
          },
          {
            type: 'definition',
            term: 'Entscheidung (Raute)',
            content: 'Ein Verzweigungspunkt mit Ja/Nein- oder Mehrfach-Antworten. Aus einer Entscheidung gehen mindestens zwei Pfade hervor.',
          },
          {
            type: 'definition',
            term: 'Start- und Endpunkte (Ovale)',
            content: 'Definieren den Anfang und das Ende des Prozesses. Eine saubere Karte hat genau einen Start und mindestens einen Endpunkt.',
          },
          {
            type: 'definition',
            term: 'Pfeile (Flussrichtung)',
            content: 'Pfeile geben die Reihenfolge vor. Sie sollten ohne Überschneidungen lesbar sein — sonst lieber das Layout neu sortieren.',
          },
          {
            type: 'definition',
            term: 'Swim Lanes',
            content: 'Optionale horizontale oder vertikale Bahnen, die zeigen, welche Rolle, Abteilung oder welches System für einen Schritt verantwortlich ist. Macht Übergaben und Schnittstellen sofort sichtbar.',
          },
          {
            type: 'paragraph',
            content: 'Prozesskarten existieren in verschiedenen Detailtiefen — von der grob skizzierten High-Level-Karte bis zur detaillierten Standardarbeitsanweisung. Für SIPOC-Kontext reicht „grob", für Standardisierung muss es „detailliert" sein.',
          },
          {
            type: 'definition',
            term: 'Wertschöpfungsklassifikation (VA / BNVA / NVA)',
            content: 'Jeder Schritt kann als wertschöpfend (VA), geschäftlich notwendig (BNVA) oder nicht wertschöpfend (NVA) markiert werden. VA-Schritte erzeugen direkten Kundennutzen. BNVA-Schritte sind betrieblich nötig, aber kein Kundennutzen. NVA-Schritte sind Verschwendung und Kandidaten für Eliminierung. Ein Klick auf das Badge wechselt den Typ.',
          },
          {
            type: 'definition',
            term: 'Input-Typ: Prozessparameter (x) vs. Störgröße (n)',
            content: 'Jeder Input kann als Prozessparameter (x) oder Störgröße (n) klassifiziert werden. Prozessparameter sind steuerbare Eingangsgrößen — Maschineneinstellungen, Rezepturen, Sollwerte. Störgrößen sind nicht oder schwer kontrollierbar — Umgebungstemperatur, Chargenschwankungen, Bedienerstreuung. Die Unterscheidung hilft bei der späteren DOE-Planung und Ursachenanalyse.',
          },
          {
            type: 'definition',
            term: 'Loops (Rücksprünge)',
            content: 'Über das Loop-Symbol in der Kopfzeile eines Schritts kann ein Rücksprung zu einem früheren Schritt definiert werden. Die Bedingung beschreibt, wann der Loop ausgelöst wird (z. B. „Wenn Messung außerhalb Toleranz"). Zusätzliche Loop-Schritte beschreiben Aktionen, die nur im Rücksprungpfad ausgeführt werden. Eine visuelle Klammer am rechten Rand zeigt die Spannweite des Loops.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'A {{term:process-map|process map}} (flowchart) graphically depicts a workflow — steps, decisions, inputs, and outputs are arranged in logical order. While a SIPOC only shows the frame, the process map describes the actual sequence and branches.',
          },
          {
            type: 'definition',
            term: 'Activity (rectangle)',
            content: 'A single work step — e.g. "Measure part", "Enter order". Activities change the state of the process.',
          },
          {
            type: 'definition',
            term: 'Decision (diamond)',
            content: 'A branching point with yes/no or multi-answer outcomes. At least two paths leave a decision.',
          },
          {
            type: 'definition',
            term: 'Start and end (ovals)',
            content: 'Define the beginning and end of the process. A clean map has exactly one start and at least one end.',
          },
          {
            type: 'definition',
            term: 'Arrows (flow direction)',
            content: 'Arrows give the order. They should be readable without crossings — otherwise re-sort the layout.',
          },
          {
            type: 'definition',
            term: 'Swim lanes',
            content: 'Optional horizontal or vertical lanes showing which role, department, or system owns a step. Makes hand-offs and interfaces immediately visible.',
          },
          {
            type: 'paragraph',
            content: 'Process maps exist at various levels of detail — from a roughly sketched high-level map to a detailed standard operating procedure. For SIPOC context, "rough" is enough; for standardization, "detailed" is needed.',
          },
          {
            type: 'definition',
            term: 'Value classification (VA / BNVA / NVA)',
            content: 'Each step can be classified as value-adding (VA), business non-value-adding (BNVA), or non-value-adding (NVA). VA steps create direct customer value. BNVA steps are operationally necessary but provide no customer value. NVA steps are waste and candidates for elimination. Click the badge to cycle through types.',
          },
          {
            type: 'definition',
            term: 'Input type: Process Parameter (x) vs. Noise Factor (n)',
            content: 'Each input can be classified as a process parameter (x) or noise factor (n). Process parameters are controllable inputs — machine settings, recipes, set points. Noise factors are uncontrollable or hard-to-control inputs — ambient temperature, batch variation, operator variability. The distinction helps with downstream DOE planning and root cause analysis.',
          },
          {
            type: 'definition',
            term: 'Loops (feedback loops)',
            content: 'Use the loop icon in a step\'s header to define a feedback loop back to an earlier step. The condition describes when the loop triggers (e.g. "If measurement out of tolerance"). Additional loop steps describe actions that only execute on the feedback path. A visual bracket on the right edge shows the loop span.',
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
              'Zuerst Start und Ende festlegen — was ist der Auslöser, was das Endergebnis?',
              'Hauptschritte als Aktivitäten (Rechtecke) eintragen — keine Entscheidungen, nur Ablauf.',
              'Verzweigungen als Rauten ergänzen — typischerweise an den Stellen, an denen „es kommt darauf an".',
              'Pfeile verbinden — auf konsistente Flussrichtung achten (oben → unten oder links → rechts).',
              'Bei Bedarf Swim Lanes für Verantwortlichkeiten einführen.',
              'Karte mit den Ausführenden gegenlesen — Was-ist vs. Soll-Zustand klar trennen.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Eine erste Karte zeigt den Ist-Zustand („as-is"). Erst danach wird der Soll-Zustand („to-be") entwickelt — beide Versionen werden für Vorher/Nachher-Vergleiche aufbewahrt.',
          },
        ],
      },
      en: {
        title: 'Approach',
        blocks: [
          {
            type: 'list',
            items: [
              'Define start and end first — what triggers the process, what is the end result?',
              'Add the main steps as activities (rectangles) — no decisions yet, only flow.',
              'Add decisions as diamonds — typically at points where "it depends".',
              'Connect with arrows — keep flow direction consistent (top → bottom or left → right).',
              'If useful, add swim lanes for responsibilities.',
              'Review the map with the people who do the work — clearly separate as-is from to-be.',
            ],
          },
          {
            type: 'paragraph',
            content: 'A first map shows the as-is state. Only afterwards do you design the to-be state — keep both versions for before/after comparisons.',
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
            term: 'Ist mit Soll vermischt',
            content: 'Wer beim Zeichnen schon „verbessert", verliert die echte Ist-Aufnahme. Erst sauber dokumentieren, was tatsächlich passiert — auch die unschönen Workarounds. Verbessern kommt später.',
          },
          {
            type: 'definition',
            term: 'Übergaben nicht sichtbar',
            content: 'Schwachstellen liegen oft an den Schnittstellen zwischen Abteilungen. Ohne Swim Lanes bleiben diese unsichtbar.',
          },
          {
            type: 'definition',
            term: 'Zu detailreich',
            content: 'Eine Karte mit 200 Schritten liest niemand. Für die DMAIC-Analyse reichen die wesentlichen Schritte; Detail-Standards gehören in eine eigene Standardarbeitsanweisung.',
          },
          {
            type: 'definition',
            term: 'Nur eine Person befragt',
            content: 'Jede Person sieht den Prozess aus ihrer Perspektive. Eine vollständige Karte entsteht nur, wenn alle Beteiligten gehört wurden.',
          },
          {
            type: 'definition',
            term: 'Kein Update nach Änderungen',
            content: 'Prozesse ändern sich — die Karte oft nicht. Eine veraltete Karte ist schlimmer als keine, weil sie falsche Annahmen weiterträgt.',
          },
          {
            type: 'definition',
            term: 'Loops und Endlos-Schleifen',
            content: 'Schleifen ohne Ausgang sind ein Fehler im Diagramm — sie deuten oft auf eine vergessene Entscheidung oder ein fehlendes Endkriterium hin.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'As-is mixed with to-be',
            content: 'Drawing while "improving" loses the true as-is capture. First cleanly document what actually happens — including the ugly workarounds. Improvement comes later.',
          },
          {
            type: 'definition',
            term: 'Hand-offs invisible',
            content: 'Weak spots often sit at the interfaces between departments. Without swim lanes they stay invisible.',
          },
          {
            type: 'definition',
            term: 'Too much detail',
            content: 'A map with 200 steps nobody reads. For DMAIC analysis the essential steps are enough; detailed standards belong in a separate SOP.',
          },
          {
            type: 'definition',
            term: 'Only one person interviewed',
            content: 'Every person sees the process from their angle. A complete map emerges only when all participants have been heard.',
          },
          {
            type: 'definition',
            term: 'No update after changes',
            content: 'Processes change — maps often do not. An outdated map is worse than none, because it carries false assumptions forward.',
          },
          {
            type: 'definition',
            term: 'Loops without exit',
            content: 'Loops without an exit path are a diagram bug — they often point to a forgotten decision or a missing termination criterion.',
          },
        ],
      },
    },
  },
};
