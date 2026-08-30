/**
 * D.Mike — Contour Plot Help (contour-plot-help.js)
 * Bilingual handbook content (DE / EN).
 */

export default {
  de: {
    methodology: {
      title: 'Methodik',
      blocks: [
        {
          type: 'text',
          content: 'Ein Konturdiagramm (Contour Plot) visualisiert eine Antwortfläche z = f(x, y) als farbige 2D-Karte. Es zeigt, wie eine Zielgröße (z. B. Ausbeute, Rauheit) von zwei Einflussfaktoren abhängt — typisch für Ergebnisse aus DoE-Regressionsmodellen.',
        },
        {
          type: 'heading',
          content: 'Modelltypen',
        },
        {
          type: 'table',
          headers: ['Modell', 'Formel', 'Anwendung'],
          rows: [
            ['Quadratisch', 'β₀ + β₁x + β₂y + β₃x² + β₄y² + β₅xy', '{{term:response-surface|Response Surface Methodology}} (RSM), CCD, {{term:box-behnken|Box-Behnken}}'],
            ['Linear + Interaktion', 'β₀ + β₁x + β₂y + β₅xy', 'Faktorielle Versuchspläne (2k)'],
            ['Eigene Formel', 'Beliebiger JS-Ausdruck: Math.*-Aufrufe und arithmetische Ausdrücke werden voll unterstützt', 'Komplexe oder nicht-polynomiale Modelle'],
          ],
        },
        {
          type: 'heading',
          content: 'Darstellung',
        },
        {
          type: 'list',
          items: [
            'Farbfläche: Jeder Pixel wird gemäß z-Wert eingefärbt (Farbschema wählbar)',
            '{{term:isolinie|Konturlinien}}: Marching-Squares-Algorithmus berechnet Isolinien für gleichmäßig verteilte z-Stufen',
            'Datenpunkte: Optionale Überlagerung tatsächlicher Messpunkte (x; y; z)',
            'Tooltip: Hover zeigt exakte x/y/z-Werte an jeder Position',
          ],
        },
      ],
    },
    example: {
      title: 'Beispiel',
      blocks: [
        {
          type: 'text',
          content: 'Ein CCD-Versuchsplan untersucht den Einfluss von Temperatur und Druck auf die Ausbeute. Das quadratische {{term:regression|Regressionsmodell}} lautet:',
        },
        {
          type: 'text',
          content: 'z = 50 + 8x + 5y − 3x² − 2y² + 1.5xy',
        },
        {
          type: 'list',
          items: [
            'Koeffizienten β₀=50, β₁=8, β₂=5, β₃=−3, β₄=−2, β₅=1.5 eingeben',
            '«Konturdiagramm zeichnen» klicken',
            'Optimum bei ca. x=1.6, y=1.8 (Ausbeute ≈ 59%)',
            'Datenpunkte aus einer Datentabelle zuordnen, um Modellqualität zu prüfen',
          ],
        },
      ],
    },
    interpretation: {
      title: 'Interpretation',
      blocks: [
        {
          type: 'list',
          items: [
            'Enge Konturlinien = steiler Gradient (starker Einfluss des Faktors)',
            'Weite Konturlinien = flacher Gradient (geringer Einfluss)',
            'Geschlossene Konturen = lokales Optimum (Maximum oder Minimum)',
            'Sattelpunkt: Konturen kreuzen sich — kein echtes Extremum',
            'Das Optimum wird aus dem Raster abgelesen und als «Optimum (Max)» angezeigt',
          ],
        },
        {
          type: 'heading',
          content: 'Farbschemata',
        },
        {
          type: 'table',
          headers: ['Schema', 'Empfehlung'],
          rows: [
            ['Viridis', 'Standard — perceptuell gleichmäßig, druckfreundlich'],
            ['Plasma', 'Hoher Kontrast für feine Unterschiede'],
            ['Thermal', 'Intuitiv: blau=kalt/niedrig, rot=heiß/hoch'],
            ['Grün-Verlauf', 'Für Berichte mit Firmenfarben'],
            ['Graustufen', 'Für Schwarz-Weiß-Druck'],
          ],
        },
      ],
    },
    pitfalls: {
      title: 'Häufige Fehler',
      blocks: [
        {
          type: 'list',
          items: [
            'Achsengrenzen zu eng: Wichtige Bereiche der Antwortfläche werden abgeschnitten.',
            'Modell-Extrapolation: Das Konturdiagramm zeigt die Modellantwort, nicht die Realität. Außerhalb des Versuchsbereichs kann das Modell stark abweichen.',
            'Zu wenige Konturstufen: Feine Strukturen gehen verloren. Mindestens 8–10 Stufen empfohlen.',
            'Datenpunkte nicht prüfen: Immer die tatsächlichen Messpunkte einblenden, um die Modellqualität visuell zu beurteilen.',
            'Rasterauflösung zu niedrig: Bei komplexen Modellen können Artefakte auftreten. Auf mindestens 80–100 setzen.',
          ],
        },
      ],
    },
  },

  en: {
    methodology: {
      title: 'Methodology',
      blocks: [
        {
          type: 'text',
          content: 'A contour plot visualizes a response surface z = f(x, y) as a color-coded 2D map. It shows how a {{term:zielgroesse|response variable}} (e.g., yield, roughness) depends on two input factors — typical for results from DoE regression models.',
        },
        {
          type: 'heading',
          content: 'Model Types',
        },
        {
          type: 'table',
          headers: ['Model', 'Formula', 'Application'],
          rows: [
            ['Quadratic', 'β₀ + β₁x + β₂y + β₃x² + β₄y² + β₅xy', 'Response Surface Methodology (RSM), CCD, Box-Behnken'],
            ['Linear + {{term:wechselwirkung|Interaction}}', 'β₀ + β₁x + β₂y + β₅xy', 'Factorial designs (2k)'],
            ['Custom Formula', 'Any JS expression: Math.* calls and arithmetic expressions are fully supported', 'Complex or non-polynomial models'],
          ],
        },
        {
          type: 'heading',
          content: 'Visualization',
        },
        {
          type: 'list',
          items: [
            'Color fill: Each pixel is colored according to its z-value (color scheme selectable)',
            '{{term:isolinie|Contour lines}}: Marching squares algorithm computes isolines at evenly spaced z-levels',
            'Data points: Optional overlay of actual measurement points (x; y; z)',
            'Tooltip: Hover shows exact x/y/z values at any position',
          ],
        },
      ],
    },
    example: {
      title: 'Example',
      blocks: [
        {
          type: 'text',
          content: 'A CCD experiment investigates the effect of temperature and pressure on yield. The quadratic regression model is:',
        },
        {
          type: 'text',
          content: 'z = 50 + 8x + 5y − 3x² − 2y² + 1.5xy',
        },
        {
          type: 'list',
          items: [
            'Enter coefficients β₀=50, β₁=8, β₂=5, β₃=−3, β₄=−2, β₅=1.5',
            'Click "Draw Contour Plot"',
            'Optimum at approximately x=1.6, y=1.8 (yield ≈ 59%)',
            'Assign data points from a worksheet to visually assess model quality',
          ],
        },
      ],
    },
    interpretation: {
      title: 'Interpretation',
      blocks: [
        {
          type: 'list',
          items: [
            'Closely spaced contour lines = steep gradient (strong factor influence)',
            'Widely spaced contour lines = flat gradient (weak influence)',
            'Closed contours = local optimum (maximum or minimum)',
            'Saddle point: Contours cross — no true extremum',
            'The optimum is read from the grid and shown as "Optimum (Max)"',
          ],
        },
        {
          type: 'heading',
          content: 'Color Schemes',
        },
        {
          type: 'table',
          headers: ['Scheme', 'Recommendation'],
          rows: [
            ['Viridis', 'Default — perceptually uniform, print-friendly'],
            ['Plasma', 'High contrast for subtle differences'],
            ['Thermal', 'Intuitive: blue=cold/low, red=hot/high'],
            ['Green Gradient', 'For reports with corporate colors'],
            ['Grayscale', 'For black-and-white printing'],
          ],
        },
      ],
    },
    pitfalls: {
      title: 'Common Pitfalls',
      blocks: [
        {
          type: 'list',
          items: [
            'Axis limits too narrow: Important regions of the response surface are cut off.',
            'Model extrapolation: The contour plot shows the model response, not reality. Outside the experimental region, the model may deviate significantly.',
            'Too few contour levels: Fine structures are lost. At least 8–10 levels recommended.',
            'Not checking data points: Always overlay actual measurement points to visually assess model quality.',
            'Grid resolution too low: Complex models may show artifacts. Set to at least 80–100.',
          ],
        },
      ],
    },
  },
};
