/**
 * D.Mike — Time-Weighted Control Chart Module Handbook (time-weighted-chart-help.js)
 * Bilingual help content (DE/EN).
 */

export default {
  moduleId: 'time-weighted-chart',
  sections: {
    overview: {
      de: {
        title: 'Zeitgewichtete Regelkarten',
        blocks: [
          {
            type: 'paragraph',
            content: 'Klassische Shewhart-Karten (I-MR, X̄-R) sind unempfindlich gegenüber kleinen, anhaltenden Verschiebungen — ein Drift von 1σ wird oft erst nach 40–50 Punkten erkannt. Zeitgewichtete Karten integrieren Information über mehrere Beobachtungen hinweg und erkennen genau diese Muster sehr viel schneller.',
          },
          {
            type: 'definition',
            term: 'EWMA — Exponentially Weighted Moving Average',
            content: 'Jeder Wert ist ein gewichteter Durchschnitt aus aktueller Beobachtung und vorherigem EWMA: zᵢ = λ·xᵢ + (1−λ)·zᵢ₋₁. Der Glättungsparameter λ steuert das „Gedächtnis": kleines λ (0,05–0,1) reagiert auf sehr kleine Verschiebungen, größeres λ (0,3–0,4) verhält sich Shewhart-ähnlich.',
          },
          {
            type: 'definition',
            term: 'CUSUM — Cumulative Sum',
            content: 'Summiert die Abweichungen vom Sollwert auf, beginnt aber erst zu „zählen", wenn die Abweichung größer als ein Schlupf k ist. Zwei einseitige Summen C⁺ und C⁻ erkennen Aufwärts- bzw. Abwärtsverschiebungen. Signal, sobald eine der beiden Summen die Grenze h überschreitet.',
          },
          {
            type: 'paragraph',
            content: 'Beide Karten werden in der Control-Phase eingesetzt, wenn ein Prozess bereits eingefahren ist (Sollwert μ₀ und σ bekannt) und kleine, schleichende Drifts früh erkannt werden sollen — typische Anwendung: chemische Prozesse, Werkzeugverschleiß, Eichdrift.',
          },
        ],
      },
      en: {
        title: 'Time-Weighted Control Charts',
        blocks: [
          {
            type: 'paragraph',
            content: 'Classic Shewhart charts (I-MR, X̄-R) are insensitive to small persistent shifts — a 1σ drift is often only detected after 40–50 points. Time-weighted charts integrate information across multiple observations and pick up exactly those patterns much faster.',
          },
          {
            type: 'definition',
            term: 'EWMA — Exponentially Weighted Moving Average',
            content: 'Each value is a weighted average of the current observation and the previous EWMA: zᵢ = λ·xᵢ + (1−λ)·zᵢ₋₁. The smoothing parameter λ controls memory: small λ (0.05–0.1) detects very small shifts, larger λ (0.3–0.4) behaves more like a Shewhart chart.',
          },
          {
            type: 'definition',
            term: 'CUSUM — Cumulative Sum',
            content: 'Accumulates deviations from the target but only starts "counting" once the deviation exceeds a slack k. Two one-sided sums C⁺ and C⁻ detect upward / downward shifts. A signal fires as soon as either sum crosses the limit h.',
          },
          {
            type: 'paragraph',
            content: 'Both charts are used in the Control phase when a process is already running (target μ₀ and σ known) and small slow drifts must be detected early — typical use: chemical processes, tool wear, gauge drift.',
          },
        ],
      },
    },

    methodology: {
      de: {
        title: 'Vorgehen und Parameterwahl',
        blocks: [
          {
            type: 'list',
            items: [
              'Sollwert μ₀ und Streuung σ aus einem stabilen Vorlauf bestimmen (Baseline).',
              'σ vorzugsweise aus mittlerer Spannweite MR̄/d₂ schätzen (robuster gegen Sonderursachen als Stichproben-SD).',
              'Verschiebungsgröße festlegen, die früh erkannt werden soll — z. B. 1σ.',
              'EWMA: λ ≈ 0,1 für 1σ-Shifts; L = 2,7 (statt 3,0) bei kleinen λ, sonst L = 3.',
              'CUSUM: k = 0,5σ und h = 4σ oder 5σ — diese Kombination erkennt 1σ-Shifts in ~10 Punkten.',
              'Karte laufen lassen und auf erste Signale (Punkt außerhalb Grenzen) reagieren.',
            ],
          },
          {
            type: 'paragraph',
            content: 'Faustregel zur Verschiebungsgröße: für eine Δ·σ-Shift wähle k = Δ/2. Damit ist das CUSUM-Verfahren auf diese Verschiebung optimal abgestimmt.',
          },
        ],
      },
      en: {
        title: 'Procedure and Parameter Choice',
        blocks: [
          {
            type: 'list',
            items: [
              'Determine target μ₀ and standard deviation σ from a stable baseline.',
              'Prefer σ̂ from mean moving range MR̄/d₂ (more robust to special causes than the sample SD).',
              'Decide which shift size you want to detect early — e.g. 1σ.',
              'EWMA: λ ≈ 0.1 for 1σ shifts; use L = 2.7 (instead of 3.0) when λ is small.',
              'CUSUM: k = 0.5σ and h = 4σ or 5σ — this combination flags 1σ shifts within ~10 points.',
              'Run the chart and react to the first signal (point outside the limits).',
            ],
          },
          {
            type: 'paragraph',
            content: 'Rule of thumb for shift size: to detect a Δ·σ shift, choose k = Δ/2. The CUSUM procedure is then tuned optimally to that shift.',
          },
        ],
      },
    },

    interpretation: {
      de: {
        title: 'Lesen und Reagieren',
        blocks: [
          {
            type: 'list',
            items: [
              'EWMA: Die zᵢ-Linie kreuzt UCL/LCL → Sonderursache. Die Grenzen weiten sich zu Beginn (Einschwingphase) und nähern sich asymptotisch dem Steady-State.',
              'CUSUM: C⁺ steigt → positive Verschiebung; C⁻ steigt → negative Verschiebung. Signal sobald eine Summe die horizontale Grenze h überschreitet.',
              'Beide Karten zeigen den Beginn der Verschiebung deutlich später als ihr eigentliches Auftreten — die nötige Aufzinsung kostet Reaktionszeit, gewinnt aber Sensitivität.',
              'Nach einem Signal: Ursache untersuchen, Prozess korrigieren, beide Summen / EWMA neu starten.',
            ],
          },
        ],
      },
      en: {
        title: 'Reading and Reacting',
        blocks: [
          {
            type: 'list',
            items: [
              'EWMA: the zᵢ line crosses UCL/LCL → special cause. The limits widen at the start (transient) and approach the steady-state asymptotically.',
              'CUSUM: C⁺ rising → upward shift; C⁻ rising → downward shift. Signal as soon as either sum crosses the horizontal limit h.',
              'Both charts show the beginning of a shift later than its actual onset — the integration costs reaction time but gains sensitivity.',
              'After a signal: investigate the cause, correct the process, and reset the sums / EWMA.',
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
            term: 'Falsche σ-Schätzung',
            content: 'Wird σ aus einer Stichprobe mit Sonderursachen berechnet, sind die Grenzen zu weit. Immer aus einer als stabil bestätigten Baseline schätzen — vorzugsweise mit MR̄/d₂.',
          },
          {
            type: 'definition',
            term: 'EWMA bei Shewhart-Aufgaben',
            content: 'EWMA reagiert träge auf große, plötzliche Sprünge. Für Hardcore-Ausreißer ist eine I-MR-Karte schneller. EWMA und Shewhart parallel zu betreiben ist üblich (zweistufige Überwachung).',
          },
          {
            type: 'definition',
            term: 'CUSUM nicht zurücksetzen',
            content: 'Nach einer Korrektur müssen C⁺ und C⁻ auf 0 zurückgesetzt werden — sonst trägt die alte Abweichung weiter zum nächsten Signal bei.',
          },
          {
            type: 'definition',
            term: 'Autokorrelation ignoriert',
            content: 'Beide Verfahren setzen unabhängige Beobachtungen voraus. Bei autokorrelierten Daten (Chargenprozesse, kontinuierliche Messreihen) liefern sie zu viele Falsch-Alarme. Erst entkorrelieren oder eine Modell-Residuen-Karte verwenden.',
          },
          {
            type: 'definition',
            term: 'k und h willkürlich gewählt',
            content: 'Andere Werte als die Standardpaare (k=0,5/h=4 oder 5) ändern das ARL-Verhalten drastisch. Wer abweicht, sollte ARL-Tabellen oder Simulation zu Rate ziehen.',
          },
        ],
      },
      en: {
        title: 'Pitfalls',
        blocks: [
          {
            type: 'definition',
            term: 'Wrong σ estimate',
            content: 'If σ is computed from a sample with special causes, the limits are too wide. Always estimate from a confirmed-stable baseline — preferably from MR̄/d₂.',
          },
          {
            type: 'definition',
            term: 'EWMA on Shewhart problems',
            content: 'EWMA is sluggish for large, sudden jumps. For genuine outliers an I-MR chart reacts faster. Running EWMA and Shewhart in parallel is common (two-tier monitoring).',
          },
          {
            type: 'definition',
            term: 'Not resetting CUSUM',
            content: 'After a correction, both C⁺ and C⁻ must be reset to 0 — otherwise the old deviation keeps contributing to the next signal.',
          },
          {
            type: 'definition',
            term: 'Ignoring autocorrelation',
            content: 'Both methods assume independent observations. With autocorrelated data (batch processes, continuous measurements) they fire too many false alarms. Decorrelate first or use a model-residual chart.',
          },
          {
            type: 'definition',
            term: 'Arbitrary k and h',
            content: 'Values other than the standard pairs (k=0.5/h=4 or 5) drastically change the ARL behavior. If you deviate, consult ARL tables or run a simulation.',
          },
        ],
      },
    },
  },
};
