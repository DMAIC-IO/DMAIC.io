/**
 * D.Mike — Regression Module Handbook (regression-help.js)
 * Bilingual help content (DE/EN) for the regression analysis module.
 */

export default {
  moduleId: 'regression',
  sections: {
    overview: {
      de: {
        title: 'Überblick',
        blocks: [
          {
            type: 'paragraph',
            content: 'Die {{term:regression|Regression}} beschreibt den Zusammenhang zwischen einer abhängigen Variable (Y, {{term:zielgroesse|Zielgröße}}) und einer oder mehreren unabhängigen Variablen (X, Einflussgrößen) durch ein mathematisches Modell. Während die {{term:korrelation|Korrelation}} nur fragt „bewegen sie sich gemeinsam?", liefert die Regression eine Gleichung, mit der Y vorhergesagt oder verstanden werden kann.',
          },
          {
            type: 'definition',
            term: 'Einfache lineare Regression',
            content: '{{term:lineare-regression|Einfache lineare Regression}} — eine X-Variable, ein Y. Modell: Y = β₀ + β₁·X + ε. β₀ ist der Achsenabschnitt, β₁ die Steigung, ε der Restfehler. Der häufigste Einstieg.',
          },
          {
            type: 'definition',
            term: 'Multiple Regression',
            content: 'Bei der multiplen {{term:lineare-regression|linearen Regression}} kommen mehrere X-Variablen hinzu: Y = β₀ + β₁·X₁ + β₂·X₂ + … + ε. Erlaubt es, den Effekt jeder Variable bei Konstanthalten der anderen zu schätzen.',
          },
          {
            type: 'definition',
            term: 'R² (Bestimmtheitsmaß)',
            content: '{{term:r-quadrat|R²}} ist der Anteil der Streuung in Y, der durch das Modell erklärt wird. 0 = Modell erklärt nichts, 1 = perfekte Erklärung. R² = 0,85 heißt: 85 % der Y-Variation lässt sich auf die X erklären.',
          },
          {
            type: 'definition',
            term: 'Adjustiertes R²',
            content: '{{term:adjustiertes-r-quadrat|Adjustiertes R²}} korrigiert R² für die Anzahl der Variablen. Wichtig bei multipler Regression: zusätzliche X erhöhen R² immer, das adjustierte R² nur, wenn sie wirklich beitragen.',
          },
          {
            type: 'definition',
            term: 'p-Wert pro Koeffizient',
            content: 'Testet, ob ein Koeffizient signifikant von 0 verschieden ist. p < 0,05 → die Variable trägt nachweisbar zum Modell bei.',
          },
          {
            type: 'definition',
            term: 'Residuen',
            content: '{{term:residuen|Residuen}} sind die Differenz zwischen tatsächlichem Y und vorhergesagtem Y. Eine gute Regression hat zufällig verteilte Residuen ohne Muster — Muster deuten auf nicht erfasste Effekte hin.',
          },
        ],
      },
      en: {
        title: 'Overview',
        blocks: [
          {
            type: 'paragraph',
            content: '{{term:regression|Regression}} describes the relation between a dependent variable (Y, {{term:zielgroesse|response}}) and one or more independent variables (X, predictors) through a mathematical model. Where {{term:korrelation|correlation}} only asks "do they move together?", regression delivers an equation that lets Y be predicted or understood.',
          },
          {
            type: 'definition',
            term: 'Simple linear regression',
            content: '{{term:lineare-regression|Simple linear regression}} — one X, one Y. Model: Y = β₀ + β₁·X + ε. β₀ is the intercept, β₁ the slope, ε the residual error. The most common entry point.',
          },
          {
            type: 'definition',
            term: 'Multiple regression',
            content: 'Multiple {{term:lineare-regression|linear regression}} adds several X variables: Y = β₀ + β₁·X₁ + β₂·X₂ + … + ε. Allows estimating the effect of each variable while holding the others constant.',
          },
          {
            type: 'definition',
            term: 'R² (coefficient of determination)',
            content: '{{term:r-quadrat|R²}} — share of Y variation explained by the model. 0 = model explains nothing, 1 = perfect explanation. R² = 0.85 means: 85% of Y variation is explained by the X.',
          },
          {
            type: 'definition',
            term: 'Adjusted R²',
            content: '{{term:adjustiertes-r-quadrat|Adjusted R²}} corrects R² for the number of variables. Important in multiple regression: adding X always raises R², but adjusted R² only rises if they truly contribute.',
          },
          {
            type: 'definition',
            term: 'p-value per coefficient',
            content: 'Tests whether a coefficient differs significantly from 0. p < 0.05 → the variable demonstrably contributes to the model.',
          },
          {
            type: 'definition',
            term: 'Residuals',
            content: '{{term:residuen|Residuals}} — difference between observed Y and predicted Y. A good regression has randomly scattered residuals without pattern — patterns indicate missed effects.',
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
              'Vor der Regression Streudiagramme erstellen — passen die Daten zu einem linearen Modell?',
              'Modell anpassen (Y und X auswählen, Software laufen lassen).',
              'R² und p-Werte prüfen — ist das Modell überhaupt sinnvoll?',
              'Residuen prüfen: zufällige Streuung um null, keine Muster, keine Trichter.',
              'Modell auf neue Daten anwenden — sagt es wirklich vorher, was es soll?',
              'Bei multipler Regression auf {{term:multikollinearitaet|Multikollinearität}} prüfen (VIF) und überflüssige X entfernen.',
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
              'Before regression, make scatter plots — do the data fit a linear model?',
              'Fit the model (pick Y and X, run the software).',
              'Check R² and p-values — does the model make sense at all?',
              'Inspect residuals: random scatter around zero, no patterns, no funnels.',
              'Apply the model to new data — does it actually predict what it should?',
              'For multiple regression, check {{term:multikollinearitaet|multicollinearity}} (VIF) and drop redundant X.',
            ],
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'paragraph',
            content: 'Ein hoher R²-Wert ist nicht automatisch ein gutes Modell. Wichtiger sind: passen die Vorhersagen für Werte außerhalb der Trainingsdaten, sind die Residuen unauffällig, und macht das Modell inhaltlich Sinn? Ein Modell mit R² = 0,99 und systematischen Residuen ist wertloser als eines mit R² = 0,7 und sauberen Residuen.',
          },
          {
            type: 'paragraph',
            content: 'Vorhersagen außerhalb des beobachteten X-Bereichs (Extrapolation) sind riskant. Das Modell „weiß" nichts über das, was es nicht gesehen hat — die lineare Beziehung könnte dort längst zu Ende sein.',
          },
        ],
      },
      en: {
        title: 'Interpretation',
        blocks: [
          {
            type: 'paragraph',
            content: 'A high R² is not automatically a good model. More important: do predictions hold for values outside the training data, are residuals well-behaved, and does the model make domain sense? A model with R² = 0.99 and systematic residuals is worth less than one with R² = 0.7 and clean residuals.',
          },
          {
            type: 'paragraph',
            content: 'Predictions outside the observed X range (extrapolation) are risky. The model "knows" nothing about what it has not seen — the linear relation may have ended long ago.',
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
            term: 'Lineares Modell für nichtlineare Daten',
            content: 'Ein gekrümmter Zusammenhang wird durch eine Gerade nur grob beschrieben. Die Residuen zeigen eine deutliche Krümmung — das ist das Signal, ein nichtlineares oder transformiertes Modell zu probieren.',
          },
          {
            type: 'definition',
            term: 'Multikollinearität',
            content: 'Bei {{term:multikollinearitaet|Multikollinearität}} sind zwei X stark korreliert und das Modell kann ihre Einzelbeiträge nicht trennen — die Koeffizienten werden instabil und schwer interpretierbar. VIF-Werte > 5 sind ein Warnsignal.',
          },
          {
            type: 'definition',
            term: 'Overfitting',
            content: '{{term:overfitting|Overfitting}} — ein Modell mit zu vielen X für zu wenige Beobachtungen passt sich an Zufallsrauschen an. R² wirkt großartig, neue Daten enttäuschen. Faustregel: mindestens 10 Beobachtungen pro Koeffizient.',
          },
          {
            type: 'definition',
            term: 'Heteroskedastizität ignoriert',
            content: 'Bei {{term:heteroskedastizitaet|Heteroskedastizität}} wächst die Streuung der Residuen mit X (Trichter), die Standardfehler sind verzerrt — p-Werte und Konfidenzintervalle stimmen nicht mehr. Transformation oder gewichtete Regression hilft.',
          },
          {
            type: 'definition',
            term: 'Extrapolation',
            content: 'Das Modell für Werte außerhalb des Trainingsbereichs einsetzen — riskant, weil dort nichts geprüft wurde. Vorhersagen nur im Bereich der beobachteten X als belastbar betrachten.',
          },
          {
            type: 'definition',
            term: 'Kausale Sprache bei beobachteten Daten',
            content: 'Eine Regression auf Beobachtungsdaten beschreibt Zusammenhänge, beweist aber keine Ursache. Kausale Aussagen brauchen ein Experiment ({{term:doe|DoE}}) oder sehr starke Argumente.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Linear model for nonlinear data',
            content: 'A curved relation is only roughly captured by a straight line. Residuals show clear curvature — that is the signal to try a nonlinear or transformed model.',
          },
          {
            type: 'definition',
            term: 'Multicollinearity',
            content: 'With {{term:multikollinearitaet|multicollinearity}} — when two X are strongly correlated — the model cannot separate their individual effects; coefficients become unstable and hard to interpret. VIF > 5 is a warning sign.',
          },
          {
            type: 'definition',
            term: 'Overfitting',
            content: '{{term:overfitting|Overfitting}} — a model with too many X for too few observations fits random noise. R² looks great, new data disappoints. Rule of thumb: at least 10 observations per coefficient.',
          },
          {
            type: 'definition',
            term: 'Heteroscedasticity ignored',
            content: 'With {{term:heteroskedastizitaet|heteroscedasticity}} — residual scatter grows with X (funnel shape) — standard errors are biased and p-values and confidence intervals lie. Transformation or weighted regression helps.',
          },
          {
            type: 'definition',
            term: 'Extrapolation',
            content: 'Using the model outside the training range — risky because nothing has been validated there. Treat predictions as reliable only inside the observed X range.',
          },
          {
            type: 'definition',
            term: 'Causal language on observational data',
            content: 'A regression on observational data describes relations but does not prove causation. Causal claims need an experiment ({{term:doe|DoE}}) or very strong arguments.',
          },
        ],
      },
    },
  },
};
