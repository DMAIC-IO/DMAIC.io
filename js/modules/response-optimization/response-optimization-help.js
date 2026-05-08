/**
 * D.Mike — Response Optimization Module Handbook
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'response-optimization',
  sections: {
    overview: {
      de: {
        title: 'Zielgrößenoptimierung',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die Zielgrößenoptimierung sucht den Faktor-Punkt, an dem alle gewählten Antworten gleichzeitig möglichst gut sind. Dazu wird jede Antwort über eine Wunschfunktion auf den Wert d ∈ [0, 1] abgebildet, und das geometrische Mittel D dieser Werte wird mittels Multi-Start Nelder–Mead über den Faktor-Bereich maximiert.',
          },
          {
            type: 'definition',
            term: 'Wunschfunktion (Derringer-Suich)',
            content: 'Drei Formen: Maximieren (lineare Skala zwischen einem nicht akzeptablen Untergrenze und einem zufriedenstellenden Wert), Minimieren (gespiegelt) und Zielwert (zweiseitig, mit Maximum genau am Ziel). Form-Parameter steuern, wie streng die Funktion in der Nähe der Grenzen wird.',
          },
          {
            type: 'definition',
            term: 'Composite D',
            content: 'D = (∏ d_i^w_i)^(1/Σw_i). Sobald irgendeine einzelne Antwort d=0 erreicht, ist D=0 — kein einzelnes Ergebnis darf außerhalb seines akzeptablen Bereichs liegen.',
          },
          {
            type: 'paragraph',
            content: 'Modelle stammen aus dem Regressionsmodul (dort „Als Modell speichern" anklicken). Die Optimierung selbst ist projekt-zentral in state.optimizations[id] gespeichert.',
          },
        ],
      },
      en: {
        title: 'Response Optimization',
        blocks: [
          {
            type: 'paragraph',
            content: 'The response optimizer finds the factor point at which every selected response is simultaneously as good as possible. Each response is mapped through a desirability function to d ∈ [0, 1], and the geometric mean D of those values is maximised over the factor box via multi-start Nelder–Mead.',
          },
          {
            type: 'definition',
            term: 'Desirability function (Derringer-Suich)',
            content: 'Three flavours: maximise (linear ramp between an unacceptable lower bound and a fully satisfactory upper bound), minimise (mirror image), and target-is-best (two-sided, peak exactly at the target). Shape parameters control how demanding the function becomes near the bounds.',
          },
          {
            type: 'definition',
            term: 'Composite D',
            content: 'D = (∏ d_i^w_i)^(1/Σw_i). The moment any individual response hits d=0, D collapses to 0 — no single response is allowed to leave its acceptable range.',
          },
          {
            type: 'paragraph',
            content: 'Models come from the Regression module (click "Save as model" there). The optimisation result itself is project-central, stored in state.optimizations[id].',
          },
        ],
      },
    },
  },
};
