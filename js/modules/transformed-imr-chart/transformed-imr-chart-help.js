/**
 * D.Mike — Transformed I-MR Module Handbook
 */

export default {
  moduleId: 'transformed-imr-chart',
  sections: {
    overview: {
      de: {
        title: 'Box-Cox-transformierte I-MR',
        blocks: [
          {
            type: 'paragraph',
            content: 'Klassische Shewhart-Karten setzen näherungsweise Normalverteilung voraus. Bei rechtsschiefen Daten (Zeit, Kosten, Defektraten) werden die Grenzen verzerrt: zu viele Falsch-Alarme oben, zu wenige unten. Das Modul bringt die Daten via Box-Cox auf die normale Skala, rechnet dort I-MR und transformiert die Grenzen für die Anzeige zurück auf die Originalskala.',
          },
          {
            type: 'definition',
            term: 'Box-Cox-Transform',
            content: 'y = (xᵏ − 1) / λ für λ ≠ 0, y = ln(x) für λ = 0. λ wird per Anderson-Darling-Optimierung gesucht (Gitter [-3, 3], Schritt 0,05) oder manuell gesetzt.',
          },
          {
            type: 'definition',
            term: 'Karte und Grenzen',
            content: 'Die Karte plottet auf der transformierten Skala — dort sind UCL/LCL und Zonen statistisch sinnvoll. Die Tabelle zeigt Grenzen auf beiden Skalen, damit Operatoren Grenzwerte in den Originaleinheiten ablesen können.',
          },
          {
            type: 'paragraph',
            content: 'Voraussetzung: alle Werte müssen strikt positiv sein. Bei null oder negativen Werten benötigt man eine Verschiebung (z. B. x + |min| + 1) oder eine andere Transform-Familie (Yeo-Johnson, Log+1).',
          },
        ],
      },
      en: {
        title: 'Box-Cox Transformed I-MR',
        blocks: [
          {
            type: 'paragraph',
            content: 'Classic Shewhart charts assume approximate normality. For right-skewed data (lifetime, cost, defect rate) the limits become biased: too many false alarms above the {{term:mittelwert|mean}}, too few below. This module brings the data onto a normal scale via Box-Cox, computes I-MR there, and back-transforms the limits to the original scale for display.',
          },
          {
            type: 'definition',
            term: 'Box-Cox transform',
            content: 'y = (x^λ − 1) / λ for λ ≠ 0, y = ln(x) for λ = 0. λ is found via Anderson-Darling optimisation (grid [-3, 3], step 0.05) or set manually.',
          },
          {
            type: 'definition',
            term: 'Chart and limits',
            content: 'The chart plots on the transformed scale — there UCL/LCL and zones are statistically meaningful. A table shows limits on both scales so operators can read action limits in the original units.',
          },
          {
            type: 'paragraph',
            content: 'Prerequisite: all values must be strictly positive. For zero or negative values either shift (x + |min| + 1) or use a different transform family (Yeo-Johnson, Log+1).',
          },
        ],
      },
    },

    pitfalls: {
      de: {
        title: 'Stolperfallen',
        blocks: [
          { type: 'definition', term: 'Auto-λ ohne Plausibilitätsprüfung', content: 'Die Anderson-Darling-Suche findet immer ein Minimum — auch wenn die Daten gar nicht durch Box-Cox normalisierbar sind. Vorher Verteilung anschauen (Histogramm, P-P-Plot).' },
          { type: 'definition', term: 'Rück-Transformation lügt nicht', content: 'Die zurückgerechneten Grenzen sind nicht symmetrisch um die Mittellinie — das ist korrekt: rechtsschiefe Originaldaten erlauben mehr Spielraum nach oben als nach unten. Wer das anders erwartet, hat die Verteilung nicht verstanden.' },
          { type: 'definition', term: 'λ ändert sich mit jedem neuen Punkt', content: 'Im Live-Modus passt sich λ an neue Daten an. Für Phase-II-Monitoring λ einfrieren (manueller Modus mit dem Phase-I-λ).' },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          { type: 'definition', term: 'Auto-λ without sanity check', content: 'The Anderson-Darling search always finds a minimum — even when the data cannot be normalised by Box-Cox at all. Inspect the distribution first (histogram, P-P plot).' },
          { type: 'definition', term: 'Back-transformed limits are asymmetric', content: 'Re-projected limits are NOT symmetric about the centre line — that is correct: right-skewed originals leave more room above than below. Anyone expecting symmetry has misread the distribution.' },
          { type: 'definition', term: 'λ drifts with new data', content: 'In live mode λ adapts to new data. For Phase-II monitoring freeze λ (manual mode with the Phase-I λ).' },
        ],
      },
    },
  },
};
