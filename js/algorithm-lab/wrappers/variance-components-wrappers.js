/**
 * D.Mike — Varianzkomponenten Algorithm-Lab-Wrapper
 * (variance-components-wrappers.js)
 *
 * Dünne Adapter zwischen den Fixture-Input-/Output-Shapes der drei
 * Lab-Einträge (`variance-components-nested-anova`,
 * `variance-components-crossed-anova`, `variance-components-reml`) und
 * `computeVarianceComponents()` aus `js/engines/variance-components-engine.js`.
 * Keinerlei Rechenlogik hier — nur Umformung:
 *
 *  - **Eingang:** die Engine nimmt EIN Optionsobjekt. `signature.parameters`
 *    hat deshalb je Eintrag genau einen Parameter (`inputs`), dessen Name
 *    nicht im Fixture-Input vorkommt — damit greift der Single-Object-
 *    Fallback in `mapArgs()` (`lab-exec.js`) und das ganze Input-Objekt wird
 *    durchgereicht. Modellform bzw. Schätzer werden je Eintrag festgesetzt,
 *    damit auch das Try-It-Widget (dessen Formular nur response,
 *    factorValues und factorNames abfragt) den Eintrag rechnet, der
 *    draufsteht.
 *  - **Ausgang:** die Engine liefert den Fehlerterm als letzte Zeile in
 *    `terms`; die Fixtures (und damit der Vergleich im Validierungs-Tab)
 *    erwarten ihn getrennt unter `error`. Genau das macht `_shape()`.
 *
 * Verwendung: der Algorithm-Lab-Runner lädt via `source.file_path` +
 * `source.function_name` genau diese Exports.
 */

import { computeVarianceComponents } from '../../engines/variance-components-engine.js';

/**
 * Engine-Ergebnis in die Fixture-Shape bringen: Fehlerterm aus `terms`
 * herauslösen und als `error` danebenstellen.
 * @param {object} r Ergebnis von `computeVarianceComponents()`
 * @returns {object} dasselbe Ergebnis mit `terms` ohne Fehlerzeile und `error`
 */
function _shape(r) {
  const terms = (r.terms || []).filter((t) => t.id !== 'Error');
  const err = (r.terms || []).find((t) => t.id === 'Error') || null;
  return { ...r, terms, error: err };
}

/**
 * Lab-Wrapper: geschachteltes Modell, ANOVA/EMS-Schätzer.
 * @param {object} inputs { response, factorValues, factorNames }
 * @returns {object} siehe `_shape()`
 */
export function varianceComponentsNestedAnovaLab(inputs) {
  return _shape(computeVarianceComponents({
    ...inputs, modelForm: 'nested', estimator: 'anova',
  }));
}

/**
 * Lab-Wrapper: gekreuztes Modell, ANOVA/EMS-Schätzer.
 * @param {object} inputs { response, factorValues, factorNames }
 * @returns {object} siehe `_shape()`
 */
export function varianceComponentsCrossedAnovaLab(inputs) {
  return _shape(computeVarianceComponents({
    ...inputs, modelForm: 'crossed', estimator: 'anova',
  }));
}

/**
 * Lab-Wrapper: REML-Schätzer. Die Modellform bleibt frei — die Fixtures
 * decken sowohl den geschachtelten als auch den gekreuzten Fall ab; ohne
 * Angabe (Try-It-Formular) wird geschachtelt gerechnet.
 * @param {object} inputs { response, factorValues, factorNames, modelForm? }
 * @returns {object} siehe `_shape()`
 */
export function varianceComponentsRemlLab(inputs) {
  return _shape(computeVarianceComponents({
    ...inputs, modelForm: inputs?.modelForm || 'nested', estimator: 'reml',
  }));
}
