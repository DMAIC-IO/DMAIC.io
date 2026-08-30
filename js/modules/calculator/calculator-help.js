/**
 * D.Mike — Scientific Calculator Module Handbook (calculator-help.js)
 * Bilingual help content (DE/EN) for the calculator module.
 */

export default {
  moduleId: 'calculator',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Der wissenschaftliche Taschenrechner ist ein integrierter Helfer für schnelle Berechnungen ohne externes Tool. Er bietet drei Modi, die jeweils auf einen typischen Six-Sigma-Anwendungsfall zugeschnitten sind.',
          },
          {
            type: 'definition',
            term: 'Modus „Wissenschaftlich"',
            content: 'Klassischer Taschenrechner mit Grundrechenarten, Potenzen, Wurzeln, Logarithmen, trigonometrischen Funktionen, Konstanten (π, e) und Klammern. Geeignet für allgemeine numerische Berechnungen.',
          },
          {
            type: 'definition',
            term: 'Modus „Statistik"',
            content: 'Eingabe einer Werteliste; ausgegeben werden {{term:mittelwert|Mittelwert}}, {{term:median|Median}}, {{term:standardabweichung|Standardabweichung}}, {{term:varianz|Varianz}}, Minimum, Maximum, {{term:schiefe|Schiefe}} und Stichprobenumfang. Praktisch für eine schnelle Beschreibung kleiner Datensätze.',
          },
          {
            type: 'definition',
            term: 'Modus „Six Sigma"',
            content: 'Berechnet Cp und Cpk aus Mittelwert, Standardabweichung sowie unterer und oberer Spezifikationsgrenze. Wandelt zudem zwischen DPMO, {{term:sigma-niveau|Sigma-Niveau}} und Yield um.',
          },
          {
            type: 'paragraph',
            content: 'Der Rechner ersetzt keine vollständigen Analyse-Module — für Cpk-Studien mit Verteilungsanpassung, Kontrollkarten oder größere Datensätze sollte das jeweilige Fachmodul verwendet werden.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: 'The scientific calculator is an integrated helper for quick computations without leaving the app. It offers three modes, each tailored to a typical {{term:six-sigma|Six Sigma}} use case.',
          },
          {
            type: 'definition',
            term: 'Scientific mode',
            content: 'Classic calculator with basic arithmetic, powers, roots, logarithms, trigonometric functions, constants (π, e), and parentheses. Suitable for general numeric calculations.',
          },
          {
            type: 'definition',
            term: 'Statistics mode',
            content: 'Enter a list of values; the calculator returns {{term:mittelwert|mean}}, {{term:median|median}}, {{term:standardabweichung|standard deviation}}, {{term:varianz|variance}}, minimum, maximum, {{term:schiefe|skewness}}, and sample size. Handy for a quick description of small datasets.',
          },
          {
            type: 'definition',
            term: 'Six Sigma mode',
            content: 'Computes Cp and Cpk from mean, standard deviation, and lower/upper specification limits. Also converts between DPMO, sigma level, and yield.',
          },
          {
            type: 'paragraph',
            content: 'The calculator does not replace full analysis modules — for Cpk studies with distribution fitting, control charts, or larger datasets, use the dedicated module.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Bedienung',
        blocks: [
          {
            type: 'list',
            items: [
              'Modus oben über die Tabs auswählen (Wissenschaftlich / Statistik / Six Sigma).',
              'Zahlen und Operatoren über die Tasten oder die Tastatur eingeben.',
              'Im Statistik-Modus die Werte komma- oder zeilengetrennt einfügen — auch Copy & Paste aus dem Worksheet funktioniert.',
              'Im Six-Sigma-Modus die {{term:spezifikationsgrenzen|Spezifikationsgrenzen}}, Mittelwert und Standardabweichung eintragen — Cp/Cpk werden sofort angezeigt.',
              'DPMO ↔ Sigma-Niveau ↔ Yield: einen der drei Werte eintragen, die anderen werden automatisch berechnet.',
            ],
          },
        ],
      },
      en: {
        title: 'Operation',
        blocks: [
          {
            type: 'list',
            items: [
              'Pick a mode at the top via the tabs (Scientific / Statistics / Six Sigma).',
              'Enter numbers and operators with the on-screen keys or your keyboard.',
              'In Statistics mode, paste values separated by commas or line breaks — copy & paste from the worksheet works as well.',
              'In Six Sigma mode, enter specification limits, mean, and standard deviation — Cp/Cpk update immediately.',
              'DPMO ↔ sigma level ↔ yield: enter one of the three, the others are computed automatically.',
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
            term: 'Stichproben- vs. Populations-Standardabweichung',
            content: 'Der Statistik-Modus verwendet die Stichproben-Standardabweichung (Teiler n−1). Das ist der Standard für reale Messdaten — bei Vergleichen mit anderer Software prüfen, welche Variante dort eingestellt ist.',
          },
          {
            type: 'definition',
            term: 'Cp/Cpk ohne Normalverteilungsprüfung',
            content: 'Der Six-Sigma-Modus rechnet ohne Verteilungsannahme zu prüfen. Bei nicht-normalen Daten ist das Ergebnis irreführend — vorher mit {{term:wahrscheinlichkeitsnetz|Wahrscheinlichkeitsnetz}} oder Verteilungsanpassung absichern.',
          },
          {
            type: 'definition',
            term: 'DPMO ist nicht ppm',
            content: 'DPMO bezieht sich auf Defektmöglichkeiten pro Einheit, ppm auf Defekte pro Million. Bei mehreren Defektmöglichkeiten je Bauteil unterscheiden sich die beiden Werte deutlich.',
          },
          {
            type: 'definition',
            term: 'Trigonometrische Eingabe',
            content: 'Der Modus „Wissenschaftlich" erwartet Argumente in Radiant, sofern nicht explizit auf Grad umgeschaltet. Bei unerwarteten Ergebnissen den Winkelmodus prüfen.',
          },
          {
            type: 'definition',
            term: 'Kein Audit-Trail',
            content: 'Berechnungen werden nicht ins Projekt gespeichert. Wichtige Zwischenergebnisse direkt ins Worksheet oder den {{term:project-charter|Project Charter}} übertragen, sonst gehen sie beim Schließen verloren.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Sample vs. population standard deviation',
            content: 'The Statistics mode uses the sample standard deviation (divisor n−1). This is the standard for real measurement data — when comparing against other software, check which variant it uses.',
          },
          {
            type: 'definition',
            term: 'Cp/Cpk without normality check',
            content: 'The Six Sigma mode computes without checking the distribution assumption. For non-normal data the result is misleading — verify with a probability plot or distribution fit beforehand.',
          },
          {
            type: 'definition',
            term: 'DPMO is not ppm',
            content: 'DPMO refers to defect opportunities per unit, ppm to defects per million parts. With multiple opportunities per part the two values differ substantially.',
          },
          {
            type: 'definition',
            term: 'Trigonometric input',
            content: 'Scientific mode expects arguments in radians unless explicitly switched to degrees. If results look wrong, check the angle mode.',
          },
          {
            type: 'definition',
            term: 'No audit trail',
            content: 'Calculations are not stored in the project. Transfer important intermediate results to the worksheet or project charter, otherwise they are lost on close.',
          },
        ],
      },
    },
  },
};
