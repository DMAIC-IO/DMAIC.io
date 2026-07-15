/**
 * D.Mike — MSA Type 1 Module Handbook (msa-typ1-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 1 module.
 */

export default {
  moduleId: 'msa-typ1',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die MSA Typ-1-Studie prüft ein Messsystem auf Lage ({{term:bias|Bias}}) und Streuung ({{term:wiederholbarkeit|Wiederholbarkeit}}) — an einem einzigen Normal, mit einem Bediener, in kurzer Zeit. Sie ist der erste Schritt jeder Messsystemanalyse: zeigt sie Schwächen, lohnt sich keine weitergehende Studie (Typ 2 / {{term:gage-rr|Gage R&R}}).',
          },
          {
            type: 'definition',
            term: 'Normal (Referenzteil)',
            content: 'Ein {{term:referenzteil|Referenzteil}} oder Master mit bekanntem, rückführbarem Referenzwert. Ohne diesen Wert kann keine Lage bestimmt werden — der Bias-Anteil der Studie wäre blind.',
          },
          {
            type: 'definition',
            term: 'Wiederholmessungen',
            content: 'Typischerweise 25–50 Messungen desselben Normals mit demselben Messsystem, unter möglichst gleichbleibenden Bedingungen. Nur so wird die reine Wiederholstreuung sichtbar.',
          },
          {
            type: 'definition',
            term: 'Bias',
            content: 'Systematische Abweichung: {{term:mittelwert|Mittelwert}} der Wiederholmessungen − Referenzwert. Ein Bias ≠ 0 deutet auf eine Kalibrierabweichung oder ein systematisches Offset hin und verletzt die {{term:richtigkeit|Richtigkeit}} des Messsystems.',
          },
          {
            type: 'definition',
            term: 'Cg',
            content: '{{term:cg|Cg}} ist das Maß für die Wiederholbarkeit im Verhältnis zur Toleranz. Typische Formel: Cg = 0,2·T / (6·s), wobei T die Toleranzbreite und s die {{term:standardabweichung|Standardabweichung}} der Wiederholmessungen ist. Akzeptanz üblich Cg ≥ 1,33.',
          },
          {
            type: 'definition',
            term: 'Cgk',
            content: '{{term:cgk|Cgk}} erweitert Cg um den Bias. Cgk ≥ 1,33 gilt als akzeptabel. Cg hoch, Cgk niedrig → das Messsystem ist {{term:praezision|präzise}}, aber verschoben (Kalibrierproblem).',
          },
          {
            type: 'paragraph',
            content: 'Typ 1 ersetzt keine Gage R&R, sondern ist ihr Voraustest. Wer bereits bei Typ 1 scheitert, verschwendet Ressourcen, wenn er danach noch eine Gage-R&R-Studie aufsetzt.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The MSA Type 1 study checks a measurement system for {{term:bias|bias}} (position) and {{term:wiederholbarkeit|repeatability}} (spread) — on one single reference part, with one operator, in a short time frame. It is the first step of any measurement-system analysis: if it fails, no deeper study (Type 2 / {{term:gage-rr|Gage R&R}}) is worthwhile.',
          },
          {
            type: 'definition',
            term: 'Reference part',
            content: 'A {{term:referenzteil|reference part}} or master with a known, traceable reference value. Without this value, position cannot be judged — the bias part of the study would be blind.',
          },
          {
            type: 'definition',
            term: 'Repeat measurements',
            content: 'Typically 25–50 measurements of the same reference with the same system under conditions as constant as possible. Only then does pure repeat variation become visible.',
          },
          {
            type: 'definition',
            term: 'Bias',
            content: 'Systematic deviation: {{term:mittelwert|mean}} of repeat measurements − reference value. A bias ≠ 0 indicates a calibration offset or systematic shift and breaks the {{term:richtigkeit|trueness}} of the system.',
          },
          {
            type: 'definition',
            term: 'Cg',
            content: '{{term:cg|Cg}} measures repeatability relative to tolerance. Typical formula: Cg = 0.2·T / (6·s), where T is the tolerance width and s the {{term:standardabweichung|standard deviation}} of repeats. Accepted when Cg ≥ 1.33.',
          },
          {
            type: 'definition',
            term: 'Cgk',
            content: '{{term:cgk|Cgk}} extends Cg to include bias. Cgk ≥ 1.33 is accepted. High Cg, low Cgk → the system is {{term:praezision|precise}} but shifted (calibration issue).',
          },
          {
            type: 'paragraph',
            content: 'Type 1 does not replace Gage R&R, it is the pre-test. Failing Type 1 means running a Gage R&R afterwards wastes resources.',
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
              'Normal mit rückführbarem Referenzwert bereitstellen — idealerweise im Bereich der mittleren Spezifikation.',
              'Messsystem wie im Produktionsbetrieb einsetzen — nicht unter Laborbedingungen.',
              '25–50 Wiederholmessungen an einem Tag, ohne Neueinrichtung.',
              'Mittelwert, Standardabweichung und Bias berechnen.',
              'Cg und Cgk berechnen und mit der Akzeptanzgrenze (meist 1,33) vergleichen.',
              'Ergebnis dokumentieren; bei Scheitern Ursachen untersuchen, bevor Gage R&R startet.',
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
              'Provide a reference part with a traceable value — ideally near mid-spec.',
              'Use the system under production conditions, not lab conditions.',
              'Take 25–50 repeat measurements on one day without re-setup.',
              'Compute mean, standard deviation, and bias.',
              'Compute Cg and Cgk and compare to the acceptance limit (usually 1.33).',
              'Document the result; if it fails, investigate causes before running Gage R&R.',
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
            term: 'Ohne rückführbaren Referenzwert',
            content: 'Ein Normal ohne bekannten Wert erlaubt keine Bias-Bewertung — dann misst die Studie nur Wiederholbarkeit. Ohne Referenzwert ist das Ergebnis unvollständig.',
          },
          {
            type: 'definition',
            term: 'Optimale Laborbedingungen',
            content: 'Wer ein Messgerät an einem klimatisierten Werkstatt-Sonntag testet, bekommt ein schönes Cgk — das in der Alltagsproduktion nicht reproduzierbar ist. Der Test muss den realen Einsatz spiegeln.',
          },
          {
            type: 'definition',
            term: 'Zu wenige Messungen',
            content: 'Mit 10 Wiederholungen sind s und Bias unsicher, die Cg/Cgk-Werte instabil. 25–50 Messungen sind Standard, darunter wird es unzuverlässig.',
          },
          {
            type: 'definition',
            term: 'Messungen „optimiert"',
            content: 'Wer Ausreißer großzügig entfernt, bekommt schöne Zahlen und schlechte Realität. Alle Messungen dokumentieren; Ausreißer nur mit begründeter Ursache entfernen.',
          },
          {
            type: 'definition',
            term: 'Typ 1 bestanden = System okay',
            content: 'Typ 1 prüft nur Lage und Wiederholbarkeit an einem Teil durch einen Bediener. Streuung durch Bedienereinfluss oder Teilespanne wird erst in Typ 2 / Gage R&R sichtbar.',
          },
          {
            type: 'definition',
            term: 'Akzeptanzschwelle zu lax',
            content: 'Cg/Cgk < 1,33 sind international nicht akzeptiert. Eine hausinterne Absenkung macht die Studie wertlos, sobald Kundenaudits ins Haus kommen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'No traceable reference value',
            content: 'A reference part without a known value disables bias assessment — the study then measures only repeatability. Without a reference, the result is incomplete.',
          },
          {
            type: 'definition',
            term: 'Optimistic lab conditions',
            content: 'Testing a gage in air-conditioned calm produces nice Cgk — irreproducible in real production. The test must mirror actual use.',
          },
          {
            type: 'definition',
            term: 'Too few measurements',
            content: 'With 10 repeats, s and bias are uncertain, Cg/Cgk unstable. 25–50 repeats are standard; below that it becomes unreliable.',
          },
          {
            type: 'definition',
            term: 'Measurements "optimized"',
            content: 'Freely dropping outliers produces nice numbers and poor reality. Record all measurements; remove outliers only with a documented cause.',
          },
          {
            type: 'definition',
            term: 'Type 1 passed = system OK',
            content: 'Type 1 only checks bias and repeatability on one part by one operator. Variation from operators or part-to-part range shows up only in Type 2 / Gage R&R.',
          },
          {
            type: 'definition',
            term: 'Acceptance threshold too lax',
            content: 'Cg/Cgk < 1.33 is not internationally accepted. Lowering the bar internally makes the study worthless the moment a customer audit appears.',
          },
        ],
      },
    },
  },
};
