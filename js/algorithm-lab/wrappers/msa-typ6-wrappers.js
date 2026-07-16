/**
 * DMAIC.io — MSA Typ 6 Algorithm-Lab-Wrapper (msa-typ6-wrappers.js)
 *
 * Dünner Adapter zwischen der Fixture-/Try-It-Input-Shape (identisch mit
 * der `analyze()`-Signatur in `js/engines/msa-typ6-engine.js`) und dem
 * FLACHEN Ausgabeformat, das der Fixture-Runner (tools/lab-test-runner)
 * und das Algorithm-Lab-Try-It-Widget erwarten. Alle Rechenlogik lebt in
 * `msa-typ6-engine.js` — hier wird nur umgeformt:
 *  - primary.{cl,ucl,lcl,sigma}  → top-level {cl,ucl,lcl,sigma}
 *  - secondary.{cl,ucl,lcl}      → top-level {secondary_cl,secondary_ucl,secondary_lcl}
 *  - primary.series / secondary.series → primary_series / secondary_series
 *  - primary.violations          → top-level violations (roh, [{index,ruleId}])
 *  - meta.warnings ({code,params}) → top-level warnings (reine Code-Strings)
 * `drift` und `verdict` werden unverändert durchgereicht.
 *
 * Verwendung: der Algorithm-Lab-Runner (`tools/lab-test-runner/run.mjs`)
 * lädt via `source.file_path` + `source.function_name` genau diesen Export.
 * `signature.parameters` hat genau einen Parameter, dessen Name nicht im
 * Fixture-Input vorkommt — dadurch aktiviert der Runner seinen
 * Single-Object-Fallback und übergibt das gesamte Input-Objekt.
 */

import { analyze } from '../../engines/msa-typ6-engine.js';

/**
 * Try-It-/Fixture-Wrapper um `msa-typ6-engine.analyze()`.
 * @param {object} inputs siehe `validate()`/`analyze()` in msa-typ6-engine.js
 * @returns {object} flaches Ergebnisobjekt für Algorithm-Lab-Anzeige und
 *   Fixture-Vergleich (cl, ucl, lcl, sigma, secondary_cl/ucl/lcl,
 *   primary_series, secondary_series, violations, drift, verdict, warnings)
 */
export function msaTyp6StabilityLab(inputs) {
  const r = analyze(inputs);
  return {
    cl: r.primary.cl,
    ucl: r.primary.ucl,
    lcl: r.primary.lcl,
    sigma: r.primary.sigma,
    secondary_cl: r.secondary.cl,
    secondary_ucl: r.secondary.ucl,
    secondary_lcl: r.secondary.lcl,
    primary_series: r.primary.series,
    secondary_series: r.secondary.series,
    violations: r.primary.violations,
    drift: r.drift,
    verdict: r.verdict,
    warnings: r.meta.warnings.map((w) => w.code),
  };
}
