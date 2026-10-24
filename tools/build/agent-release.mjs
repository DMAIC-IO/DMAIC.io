/**
 * Die freigegebenen Module und die Abhilfe je Verstoß.
 *
 * `RELEASED_MODULES` ist die EINE festgeschriebene Liste: der Freigabetest
 * in `agent-release.test.mjs` vergleicht sie mit `collectAgentData`, der
 * E2E-Test `agent-surface.spec.js` mit dem Katalog zur Laufzeit. Ein Modul
 * kommt hinzu, wenn es freigegeben wird — absichtlich von Hand: eine lose
 * Schranke ließe eine versehentliche Freigabe und ein stilles Herausfallen
 * gleichermaßen durch.
 */

/** @type {readonly string[]} sortiert */
export const RELEASED_MODULES = Object.freeze([
  'activity-flowchart', 'attribute-control-chart', 'attribute-test', 'bar', 'boxplot',
  'calculator', 'ce-matrix', 'chart-suggestion', 'contour-plot', 'control-chart', 'correlation',
  'data-import', 'data-transformation', 'deployment-flowchart', 'distribution-fit',
  'dmaic-calendar', 'doe-advisor', 'five-why', 'fmea', 'gage-run-chart',
  'glm-regression', 'heatmap', 'histogram', 'hypothesis-test', 'individual-value-plot',
  'kano', 'lessons-learned', 'makigami', 'model-data-generator', 'mosaic', 'msa-typ1', 'msa-typ2', 'msa-typ4',
  'msa-typ5', 'msa-typ6', 'multi-vari', 'multivariate-control-chart',
  'opportunity-flowchart', 'outlier-test', 'pairwise-comparison', 'pareto',
  'pie-chart', 'probability-plot', 'process-capability', 'process-map', 'project-charter', 'raci-matrix',
  'random-generator', 'rare-event-chart', 'regression', 'resampling',
  'response-optimization', 'rest-api', 'run-chart', 'sample-size', 'short-run-chart',
  'sipoc', 'stakeholder-analysis', 'time-weighted-chart', 'todo',
  'transformed-imr-chart', 'triz-9-windows', 'triz-contradiction-matrix',
  'triz-evolution-trends', 'triz-function-analysis', 'triz-ifr', 'triz-physical-contradiction', 'triz-resources',
  'triz-sufield', 'unit-converter', 'voc-ctx-tree', 'worksheet', 'xy-plot',
]);

/**
 * Abhilfe je Verstoßart (der Teil vor dem ersten `:`), Wortlaut für den
 * Modulautor: die Kurzform der Behebungsspalte in `docs/AGENT-INTERFACE.md`
 * (privates Repo, „Prüfliste: was der Build meldet“ und „Befundarten“).
 * Vollständig gegen die Codes in `agent-data.mjs` — das prüft
 * `agent-release.test.mjs`.
 * @type {Readonly<Record<string, string>>}
 */
export const VIOLATION_REMEDIES = Object.freeze({
  unmarked_method: '@agent oder @noagent setzen',
  missing_param: '@param mit Typ ergänzen',
  missing_returns: '@returns mit Typ ergänzen',
  unresolvable_data_literal: 'data() muss ein statisch lesbares Objektliteral zurückgeben',
  unresolved_spread: 'Spread-Form vereinfachen (kein Default-Export, kein export * from)',
  unresolved_key_typedef: 'die Typedef aus keyof … an einer Anweisung der Moduldatei anlegen',
  unverified_key_set: "zusätzlich requireEnum('key', key, PARAM_KEYS) mit einer Konstanten des Moduls",
  key_set_mismatch: 'Typedef-Schlüssel und requireEnum-Menge angleichen',
  key_value_mismatch: 'Prüffunktion des Schlüssels an den Typedef-Typ angleichen (requireText ↔ string, requireNumber ↔ number, requireEnum ↔ Literalvereinigung)',
  module_tag_without_actions: 'mindestens eine schreibende @agent-Aktion anbieten oder das Modul-Tag entfernen',
  no_read_action: 'read() anbieten (…agentReadMixin(module))',
  unresolvable_model_class: 'Model: im createModule({…})-Literal auf eine importierte Klasse setzen',
  unresolved_model_class: 'Model-Klasse statisch auflösbar importieren',
  ambiguous_model_class: 'Model-Klasse eindeutig benennen (nur eine Deklaration)',
  unresolved_base_class: 'Basisklasse des Models statisch auflösbar importieren',
  self_inheriting_class: 'Vererbungskreis der Model-Klasse auflösen',
  unresolvable_tojson: 'toJSON() muss ein Objektliteral ohne Spread zurückgeben, oder @typedef AgentRead erklären',
  unreadable_state_key: 'Feldnamen zwischen toJSON() und Model-Deklaration angleichen oder das Feld annotieren',
  invalid_bulk_kind: 'Massendaten-Art auf table oder tree setzen',
  dom_detour: 'über das Model gehen, nicht am DOM vorbei (innerHTML/outerHTML/dataset)',
  unreachable_write: '@agent-Setter mit Parameter anlegen, der das Feld aus diesem Parameter zuweist',
  template_model_call: 'die Vorlage auf den Viewmodel-Sink umlegen',
  undeclared_option_source: 'die Menge als Lesefeld in @typedef AgentRead und einem eigenen read() ergänzen',
});

/**
 * Ein Verstoßcode als Zeile mit Abhilfe, z. B.
 * `worksheet: unmarked_method:onRoleDraftChange → @agent oder @noagent setzen`.
 * @param {string} moduleId
 * @param {string} code  z. B. `unmarked_method:onRoleDraftChange`
 * @returns {string}
 */
export function explainViolation(moduleId, code) {
  const remedy = VIOLATION_REMEDIES[code.split(':')[0]] ?? 'siehe docs/AGENT-INTERFACE.md';
  return `${moduleId}: ${code} → ${remedy}`;
}

/**
 * Abweichungen der Freigaben von `RELEASED_MODULES`, je Zeile begründet.
 * @param {Record<string, { tagged?: boolean, available?: boolean, reported?: string[] }>} modules
 *   Registry-Einträge aus `collectAgentData`
 * @param {readonly string[]} [released]
 * @returns {string[]} leer, wenn die Freigaben genau der Liste entsprechen
 */
export function releaseDiff(modules, released = RELEASED_MODULES) {
  const out = [];
  for (const id of released) {
    const entry = modules[id];
    if (!entry) { out.push(`${id}: Modul nicht gefunden → aus RELEASED_MODULES streichen`); continue; }
    if (entry.available === true) continue;
    if (!entry.tagged) { out.push(`${id}: Modul-Tag fehlt → @agent in den Dateikopf setzen`); continue; }
    for (const code of entry.reported ?? []) out.push(explainViolation(id, code));
  }
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available === true && !released.includes(id)) {
      out.push(`${id}: neu freigegeben → in RELEASED_MODULES aufnehmen`);
    }
  }
  return out;
}
