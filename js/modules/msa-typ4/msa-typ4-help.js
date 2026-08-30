/**
 * DMAIC.io — MSA Type 4 Module Handbook (msa-typ4-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 4 module.
 *
 * Sections (both languages, symmetric):
 *   - goal:     Was macht dieses Modul?
 *   - data:     Datenanforderungen
 *   - formulas: Formeln (AIAG + VDA 5)
 *   - verdict:  Bewertung & Ampeln
 */

export default {
  moduleId: 'msa-typ4',
  sections: {
    goal: {
      de: {
        title: 'Ziel des Verfahrens',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Verfahren 4 ({{term:linearitaet|Linearität}}) prüft, ob ein Messsystem <em>über seinen gesamten Arbeitsbereich</em> gleichmäßig misst — oder ob die {{term:bias|systematische Abweichung}} mit steigendem Referenzwert driftet. Während MSA Typ 1 nur einen einzelnen Punkt auf der Skala bewertet, deckt Typ 4 den kompletten Bereich zwischen unterer und oberer Spezifikationsgrenze ab.',
          },
          {
            type: 'definition',
            term: 'Linearität',
            content: 'Änderung des Bias über den Messbereich. Ein lineares Messsystem hat an jedem Referenzpunkt denselben (idealerweise null) Bias. Ein nichtlineares System zeigt eine Drift: kleine Werte werden z. B. zu klein, große Werte zu groß gemessen.',
          },
          {
            type: 'definition',
            term: 'Bias',
            content: 'Systematische Abweichung an einem einzelnen Referenzpunkt: {{term:mittelwert|Mittelwert}} der Wiederholmessungen minus Referenzwert. Wird für jeden Referenzpunkt separat berechnet.',
          },
          {
            type: 'definition',
            term: 'Prozessvarianz (PV)',
            content: 'Bezugsgröße, gegen die die Linearitätsabweichung normiert wird. Zwei Modi: <em>Toleranz</em> (PV = USL − LSL) für Fähigkeitsstudien oder <em>6·σ<sub>P</sub></em> aus einer laufenden Prozessstreuung. AIAG bevorzugt PV, VDA 5 stets die Toleranz.',
          },
          {
            type: 'paragraph',
            content: 'Ein Typ-4-Fehler ist tückisch: Das Messsystem kann in der Mitte des Bereichs (z. B. am Kalibrierpunkt) fehlerfrei sein, während es an den Rändern der Spezifikation systematisch daneben liegt. Klassische Ursachen sind nichtlineare Sensoren, Verschleiß der Skala oder Software-Kalibrierungen, die nur einen Punkt berücksichtigen.',
          },
        ],
      },
      en: {
        title: 'Purpose of the Study',
        blocks: [
          {
            type: 'paragraph',
            content: 'MSA Type 4 ({{term:linearitaet|linearity}}) checks whether a measurement system reads consistently <em>across its entire operating range</em> — or whether the systematic deviation drifts as the reference value grows. While MSA Type 1 only evaluates a single point on the scale, Type 4 covers the complete range between the lower and upper {{term:spezifikationsgrenzen|specification limits}}.',
          },
          {
            type: 'definition',
            term: 'Linearity',
            content: 'Change of bias across the measurement range. A linear measurement system shows the same (ideally zero) bias at every reference point. A non-linear system exhibits drift: small values may read too low, large values too high.',
          },
          {
            type: 'definition',
            term: 'Bias',
            content: 'Systematic deviation at a single reference point: {{term:mittelwert|mean}} of the repeat measurements minus the reference value. Computed separately for each reference point.',
          },
          {
            type: 'definition',
            term: 'Process Variation (PV)',
            content: 'Reference figure used to normalize the linearity deviation. Two modes: <em>Tolerance</em> (PV = USL − LSL) for capability studies, or <em>6·σ<sub>P</sub></em> derived from ongoing process spread. AIAG prefers PV, VDA 5 always uses the tolerance.',
          },
          {
            type: 'paragraph',
            content: 'A Type 4 failure is insidious: the system may be flawless in the middle of the range (e.g. at the calibration point) while systematically off near the specification edges. Classic causes are non-linear sensors, worn scales or single-point software calibrations.',
          },
        ],
      },
    },

    data: {
      de: {
        title: 'Datenanforderungen',
        blocks: [
          {
            type: 'list',
            items: [
              'Zwei Spalten aus der Datensammlung, long/tidy: eine Spalte <strong>Referenz</strong>, eine Spalte <strong>Messwert</strong>. Jede Zeile ist eine Einzelmessung.',
              'Mindestens fünf unterschiedliche Referenzwerte, die den gesamten Messbereich abdecken — bevorzugt gleichmäßig zwischen LSL und USL verteilt.',
              'Mindestens drei Wiederholmessungen pro Referenzwert; üblich sind 10–12. Mehr Wiederholungen stabilisieren die {{term:standardabweichung|Standardabweichung}} pro Punkt.',
              'Ein Prüfer, ein Messmittel, kurze Zeitspanne — Wiederholbedingungen wie in Typ 1.',
              'Rückführbare Referenzteile (zertifiziertes Master-Set), sonst ist die Bias-Bewertung blind.',
            ],
          },
          {
            type: 'definition',
            term: 'Long/tidy statt wide',
            content: 'Nicht eine Spalte je Referenzpunkt anlegen, sondern zwei lange Spalten: eine für die Referenz, eine für den Messwert. Diese Struktur ist die einzige, die das Modul verarbeitet, und entspricht dem Vorgehen von Minitab und JMP.',
          },
          {
            type: 'definition',
            term: 'Toleranz vs. σ_P',
            content: 'Bei Fähigkeitsstudien (Freigabe eines neuen Messmittels) LSL/USL eintragen. Bei Prozessunsicherheitsbudgets (VDA 5, laufende Serie) statt der Toleranz die Prozessstreuung σ<sub>P</sub> nutzen; die Formel wechselt intern zu PV = 6·σ<sub>P</sub>.',
          },
        ],
      },
      en: {
        title: 'Data Requirements',
        blocks: [
          {
            type: 'list',
            items: [
              'Two columns from the worksheet, long/tidy layout: one <strong>reference</strong> column, one <strong>measured</strong> column. Each row is one individual measurement.',
              'At least five distinct reference values that cover the whole measurement range — ideally evenly spaced between LSL and USL.',
              'At least three repeat measurements per reference; 10–12 are common. More repeats stabilize the {{term:standardabweichung|standard deviation}} per point.',
              'One operator, one instrument, short time frame — repeatability conditions as in Type 1.',
              'Traceable reference parts (certified master set); otherwise bias assessment is blind.',
            ],
          },
          {
            type: 'definition',
            term: 'Long/tidy layout instead of wide',
            content: 'Do not create one column per reference point. Instead create two long columns: one for the reference, one for the measured value. This is the only layout the module accepts and matches how Minitab and JMP handle Type 4 data.',
          },
          {
            type: 'definition',
            term: 'Tolerance vs. σ_P',
            content: 'For capability studies (release of a new gage) enter LSL/USL. For process-uncertainty budgets (VDA 5, running production) use the process spread σ<sub>P</sub> instead of the tolerance; the formula switches internally to PV = 6·σ<sub>P</sub>.',
          },
        ],
      },
    },

    formulas: {
      de: {
        title: 'Formeln (AIAG + VDA 5)',
        blocks: [
          {
            type: 'paragraph',
            content: 'Kern von Typ 4 ist eine {{term:lineare-regression|lineare Regression}} aller Einzel-Bias-Werte b<sub>ij</sub> = y<sub>ij</sub> − x<sub>ref,i</sub> gegen den Referenzwert x<sub>ref,i</sub>. Aus dieser {{term:regression|Regression}} leiten sich sowohl die AIAG-Kennzahlen als auch der VDA-5-Unsicherheitsbeitrag ab.',
          },
          {
            type: 'definition',
            term: 'Regressionsmodell',
            content: 'b<sub>ij</sub> = a · x<sub>ref,i</sub> + b̂ + ε. Steigung a ≠ 0 heißt: der Bias wächst systematisch mit dem Referenzwert (Linearitätsfehler). Achsenabschnitt b̂ ≠ 0 heißt: über den ganzen Bereich verschobenes Messsystem (konstanter Offset).',
          },
          {
            type: 'definition',
            term: 'Bias je Referenzpunkt',
            content: 'Für jeden Referenzwert x<sub>ref,i</sub> mit n<sub>i</sub> Wiederholungen: b<sub>i</sub> = ȳ<sub>i</sub> − x<sub>ref,i</sub>. Der Einstichproben-t-Test t = b<sub>i</sub>·√n<sub>i</sub>/s<sub>i</sub> prüft H<sub>0</sub>: b<sub>i</sub> = 0. Ist der p-Wert < α, ist der Bias an diesem Punkt statistisch signifikant.',
          },
          {
            type: 'definition',
            term: 'AIAG %Linearität',
            content: '%Lin = 100 · |a| · Range(x<sub>ref</sub>) / PV. Range ist die Differenz zwischen dem größten und kleinsten Referenzwert. PV ist entweder die Toleranz T = USL − LSL oder 6·σ<sub>P</sub>.',
          },
          {
            type: 'definition',
            term: 'AIAG %Bias-Peak',
            content: '%Bias<sub>max</sub> = 100 · max<sub>i</sub>|b<sub>i</sub>| / PV. Zeigt den schlimmsten einzelnen Bias-Punkt normiert auf die Bezugsgröße.',
          },
          {
            type: 'definition',
            term: 'VDA 5 Unsicherheitsbeitrag u_BI',
            content: 'u<sub>BI</sub> = √( max<sub>i</sub>|b<sub>i</sub>|² + (SE(a)·Range)² ). Kombiniert den größten beobachteten Bias-Betrag mit der Unsicherheit der Steigung, hochgerechnet über den Messbereich.',
          },
          {
            type: 'definition',
            term: 'VDA 5 erweiterte Unsicherheit U',
            content: 'U = 2 · u<sub>BI</sub> (Erweiterungsfaktor k = 2 für ca. 95 % Überdeckung). U wird direkt für die Ampelbewertung gegen die Toleranz verwendet.',
          },
          {
            type: 'definition',
            term: 'VDA 5 Q_MS,BI',
            content: 'Q<sub>MS,BI</sub> = U / T · 100 % — Anteil der Toleranz T, den der Bias-/Linearitätsbeitrag aufbraucht. Zusammen mit den anderen Q-Anteilen ({{term:wiederholbarkeit|Wiederholbarkeit}}, Vergleich, Auflösung) ergibt sich das gesamte Q<sub>MS</sub>.',
          },
        ],
      },
      en: {
        title: 'Formulas (AIAG + VDA 5)',
        blocks: [
          {
            type: 'paragraph',
            content: 'Type 4 boils down to a {{term:lineare-regression|linear regression}} of individual bias values b<sub>ij</sub> = y<sub>ij</sub> − x<sub>ref,i</sub> against the reference value x<sub>ref,i</sub>. Both the AIAG KPIs and the VDA 5 uncertainty contribution are derived from this regression.',
          },
          {
            type: 'definition',
            term: 'Regression model',
            content: 'b<sub>ij</sub> = a · x<sub>ref,i</sub> + b̂ + ε. Slope a ≠ 0 means the bias grows systematically with the reference (linearity error). Intercept b̂ ≠ 0 means a constant offset across the whole range.',
          },
          {
            type: 'definition',
            term: 'Per-reference bias',
            content: 'For each reference x<sub>ref,i</sub> with n<sub>i</sub> repeats: b<sub>i</sub> = ȳ<sub>i</sub> − x<sub>ref,i</sub>. The one-sample {{term:t-test|t-test}} t = b<sub>i</sub>·√n<sub>i</sub>/s<sub>i</sub> tests H<sub>0</sub>: b<sub>i</sub> = 0. If the p-value < α, bias at that point is statistically significant.',
          },
          {
            type: 'definition',
            term: 'AIAG %Linearity',
            content: '%Lin = 100 · |a| · Range(x<sub>ref</sub>) / PV. Range is the difference between the largest and smallest reference. PV is either the tolerance T = USL − LSL or 6·σ<sub>P</sub>.',
          },
          {
            type: 'definition',
            term: 'AIAG peak %Bias',
            content: '%Bias<sub>max</sub> = 100 · max<sub>i</sub>|b<sub>i</sub>| / PV. Shows the worst individual bias point normalized to the reference figure.',
          },
          {
            type: 'definition',
            term: 'VDA 5 uncertainty contribution u_BI',
            content: 'u<sub>BI</sub> = √( max<sub>i</sub>|b<sub>i</sub>|² + (SE(a)·Range)² ). Combines the largest observed bias magnitude with the slope uncertainty extrapolated across the measurement range.',
          },
          {
            type: 'definition',
            term: 'VDA 5 expanded uncertainty U',
            content: 'U = 2 · u<sub>BI</sub> (coverage factor k = 2 for approximately 95 % coverage). U is used directly against the tolerance in the traffic-light verdict.',
          },
          {
            type: 'definition',
            term: 'VDA 5 Q_MS,BI',
            content: 'Q<sub>MS,BI</sub> = U / T · 100 % — share of the tolerance T consumed by the bias/linearity contribution. Together with the other Q-shares (repeatability, reproducibility, resolution) it makes up the total Q<sub>MS</sub>.',
          },
        ],
      },
    },

    verdict: {
      de: {
        title: 'Bewertung & Ampeln',
        blocks: [
          {
            type: 'paragraph',
            content: 'Das Modul zeigt eine Ampel für die aktive Norm. AIAG bewertet %Linearität und %Bias-Peak, VDA 5 bewertet Q<sub>MS,BI</sub>. Beide Normen führen häufig zum selben Ergebnis, können bei grenzwertigen Fällen aber divergieren — dann entscheidet der Kunde bzw. die Freigabespezifikation.',
          },
          {
            type: 'definition',
            term: 'AIAG-Ampel — grün',
            content: '%Linearität und %Bias-Peak beide unter 5 %, und weder Steigung noch Achsenabschnitt sind statistisch signifikant (p ≥ α). Das Messsystem misst linear und unverzerrt über den gesamten Bereich.',
          },
          {
            type: 'definition',
            term: 'AIAG-Ampel — gelb',
            content: 'Der schlechtere der beiden Werte (%Linearität oder %Bias-Peak) liegt zwischen 5 % und 10 %, und keine Regressionskennzahl ist signifikant. Bedingt einsetzbar; Ursache untersuchen, bevor die Studie in eine Freigabe mündet.',
          },
          {
            type: 'definition',
            term: 'AIAG-Ampel — rot',
            content: 'Mindestens einer der beiden Werte übersteigt 10 %, oder Steigung / Achsenabschnitt sind signifikant (p < α). Das Messsystem ist nicht linear oder systematisch verschoben — nicht freigeben, Kalibrierung oder Sensortausch prüfen.',
          },
          {
            type: 'definition',
            term: 'VDA-5-Ampel — grün',
            content: 'Q<sub>MS,BI</sub> ≤ 15 %. Der Bias-Beitrag zur {{term:messunsicherheit|Messunsicherheit}} ist so klein, dass er die Prozessfähigkeit nicht relevant belastet.',
          },
          {
            type: 'definition',
            term: 'VDA-5-Ampel — gelb',
            content: 'Q<sub>MS,BI</sub> zwischen 15 % und 30 %. Bedingt tauglich; das Messsystem darf verwendet werden, wenn die restlichen Q-Anteile und die Prozessreserve dies zulassen.',
          },
          {
            type: 'definition',
            term: 'VDA-5-Ampel — rot',
            content: 'Q<sub>MS,BI</sub> > 30 %. Der Linearitäts-/Bias-Beitrag frisst mehr als 30 % der Toleranz — nicht tauglich, Messmittel überarbeiten oder ersetzen.',
          },
          {
            type: 'paragraph',
            content: 'Ergänzend markiert die Tabelle je Referenzpunkt eine Zeilen-Ampel: grün wenn der t-Test nicht signifikant ist, gelb bei signifikantem Bias unter 10 % PV, rot bei signifikantem Bias über 10 % PV. So sieht man auf einen Blick, welcher konkrete Referenzpunkt die Ampel kippt.',
          },
        ],
      },
      en: {
        title: 'Verdict & Traffic Lights',
        blocks: [
          {
            type: 'paragraph',
            content: 'The module displays one traffic light for the active standard. AIAG evaluates %Linearity and peak %Bias, VDA 5 evaluates Q<sub>MS,BI</sub>. The two standards typically agree, but may diverge in borderline cases — the customer or release specification then decides.',
          },
          {
            type: 'definition',
            term: 'AIAG light — green',
            content: 'Both %Linearity and peak %Bias below 5 %, and neither slope nor intercept is statistically significant (p ≥ α). The system reads linearly and without bias across the entire range.',
          },
          {
            type: 'definition',
            term: 'AIAG light — yellow',
            content: 'The worse of the two values (%Linearity or peak %Bias) lies between 5 % and 10 %, with no significant regression coefficient. Conditionally usable; investigate the cause before releasing the system.',
          },
          {
            type: 'definition',
            term: 'AIAG light — red',
            content: 'At least one of the two values exceeds 10 %, or slope / intercept are significant (p < α). The system is non-linear or systematically shifted — do not release; check calibration or replace the sensor.',
          },
          {
            type: 'definition',
            term: 'VDA 5 light — green',
            content: 'Q<sub>MS,BI</sub> ≤ 15 %. The bias contribution to measurement uncertainty is small enough not to burden {{term:prozessfaehigkeit|process capability}}.',
          },
          {
            type: 'definition',
            term: 'VDA 5 light — yellow',
            content: 'Q<sub>MS,BI</sub> between 15 % and 30 %. Conditionally usable; the system may be used if the remaining Q-shares and the process margin allow it.',
          },
          {
            type: 'definition',
            term: 'VDA 5 light — red',
            content: 'Q<sub>MS,BI</sub> > 30 %. The linearity/bias contribution eats more than 30 % of the tolerance — not usable, rework or replace the gage.',
          },
          {
            type: 'paragraph',
            content: 'The per-reference table additionally shades each row: green when the t-test is not significant, yellow when bias is significant but below 10 % PV, red when bias is significant and above 10 % PV. This makes it obvious at a glance which reference point tips the light.',
          },
        ],
      },
    },
  },
};
