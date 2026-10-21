#!/usr/bin/env node
/**
 * agent-report — Abdeckung der Agentenfläche als Zahl (Spec §9).
 *
 * „n von 72 Modulen agentenfähig, pro Release messbar" — dazu die Kontexthilfen
 * die Beschriftungen mit Anker (`anchor-coverage.mjs`) und die Hilfetexte mit Anker
 * (`help-anchor-coverage.mjs`). Berichtend: Exit
 * immer 0. Das Gate ist der Build (`npm run build:check`), der die generierte
 * Registry stale-prüft, dazu `test:build` mit der Freigabeliste
 * (`agent-release.test.mjs`) und der Anker-Abdeckung — nicht dieses Skript.
 *
 *   node tools/build/agent-report.mjs            # Abdeckung + Verstoßübersicht
 *   node tools/build/agent-report.mjs --verbose  # jeden Verstoß einzeln
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAgentData } from './agent-data.mjs';
import { countAnchorCoverage } from './anchor-coverage.mjs';
import { explainViolation } from './agent-release.mjs';
import { APP_DIR } from './build.mjs';

const LANGS = ['de', 'en'];

/**
 * Dotted-Path-Auflösung, die an einem Nicht-Objekt abbricht statt zu raten.
 *
 * Ein vorhandener, aber LEERER Schlüssel gilt als nicht vorhanden: die Fläche
 * erzeugte sonst einen Knopf, der ein leeres Panel öffnet, und der Agent
 * bekäme statt der JSDoc-Prosa einen leeren Satz. Das ist bewusst strenger
 * als die Laufzeit (`i18n.exists()` sagt dort `true`) — in die sichere
 * Richtung: ein leerer Schlüssel ist fällige Arbeit, keine Abdeckung.
 *
 * Exportiert, weil das i18n-Tor in `agent-data.test.mjs` dieselbe Auflösung
 * braucht. Zwei Kopien hiervon könnten auseinanderlaufen, und der
 * Fehlerfall wäre der unangenehmste: der Report meldete 100 %, während das
 * Tor rot ist — oder umgekehrt.
 *
 * @param {object} tree  ein geparster i18n-Baum
 * @param {string} key  Punktpfad
 * @returns {string|undefined}
 */
export function lookup(tree, key) {
  let node = tree;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[segment];
  }
  return typeof node === 'string' && node.trim() !== '' ? node : undefined;
}

/**
 * Strukturjargon in einem Hilfesatz: Objekt-/Listenschreibweise, `null`,
 * Backticks, Methodennamen (`setParam`, `read()`) und die Bezeichner eines
 * Spaltenbezugs.
 *
 * `null` vor `deviance`, `hypothesis`, `model` ist Statistik-Fachsprache
 * (null deviance) und kein Befund.
 *
 * Ein Satz, auf den ein `data-help-key` der Oberfläche zeigt, liest auch ein
 * Mensch (Alt-Taste) — und die Struktur steht für den Agenten ohnehin im
 * JSDoc-Typ daneben (`type` in `module.describe`). Für einen verankerten Satz
 * ist dieser Jargon deshalb ein Befund; für einen unverankerten (abgeleitete
 * Felder wie `activeParams`, `read`) bleibt er erlaubt.
 */
export const STRUCTURE_JARGON = /[{}[\]`]|\bnull\b(?!\s+(?:deviance|hypothesis|model)\b)|\b(?:set|get|add|remove|read|run|clear|schedule|select|toggle)[A-Z]\w*|\w+\(\)|\b(?:instanceId|columnId|sheetId)\b/;

/**
 * Die Kandidatenschlüssel eines Hilfetextes, in Auflösungsreihenfolge.
 *
 * EINE Schablone, mit `shared` als Ersatz-Modulkennung: der geteilte
 * Rückfall gehört zum geteilten `read()` aus `agent-read-mixin.js`, und
 * zwei verschiedene Schablonen wären zwei Gelegenheiten, sie
 * unterschiedlich falsch zu schreiben.
 *
 * Kein `agent` im Namen: der Nutzen gilt dem Menschen, der denselben Satz
 * als Tooltip, als Vorlesetext und im Kontextfenster bekommt. Dass ein
 * Agent ihn ebenfalls liest, ist eine Folge, kein Zweck.
 *
 * @param {string} moduleId
 * @param {string} suffix  z. B. `actions.read.help` oder `fields.problem.help`
 * @returns {[string, string]}
 */
export function helpKeys(moduleId, suffix) {
  return [`modules.${moduleId}.${suffix}`, `modules.shared.${suffix}`];
}

/**
 * Löst eine Kontexthilfe über die dokumentierte Kette auf.
 *
 * @param {object} tree  ein geparster i18n-Baum
 * @param {string} moduleId
 * @param {string} suffix
 * @returns {boolean}
 */
export function helpExists(tree, moduleId, suffix) {
  return helpKeys(moduleId, suffix).some(key => lookup(tree, key) !== undefined);
}

/**
 * Die i18n-Suffixe aller erklärten Typedef-Properties eines Registry-Eintrags
 * — Setter-Schlüssel (`actions.<a>.keys`) und Kennzahlen von Lesefeldern
 * (`fields.<f>.keys`), verschachtelt. Jede Property genau einmal: eine
 * Typedef an zwei Stellen hat EINEN Satz (`types.<Typedef>.<property>`).
 *
 * @param {{ actions?: Record<string, object>, fields?: Record<string, object> }} entry
 * @returns {string[]} sortiert, z. B. `types.Result.Cg`
 */
export function typedefHelpSuffixes(entry) {
  const out = new Set();
  const walk = (node) => {
    if (!node?.keys || !node.keysOf) return;
    for (const [key, child] of Object.entries(node.keys)) {
      out.add(`types.${node.keysOf}.${key}`);
      walk(child);
    }
  };
  for (const action of Object.values(entry.actions ?? {})) walk(action);
  for (const field of Object.values(entry.fields ?? {})) walk(field);
  return [...out].sort();
}

/**
 * Abdeckung der Kontexthilfen über die FREIGEGEBENEN Module.
 *
 * Spec §8, Regel 2: eine fehlende Kontexthilfe ist eine ausgewiesene Lücke
 * mit Abdeckungszahl, kein Fehler — fällige Arbeit, die niemanden aufhält.
 * Gezählt werden nur freigegebene Module: bei den anderen wäre die Lücke
 * trivial und die Zahl nichtssagend.
 *
 * Ein Schlüssel zählt nur, wenn er in BEIDEN Sprachen existiert. Eine halbe
 * Übersetzung ist in einer zweisprachigen App keine Abdeckung.
 *
 * Aufgelöst wird über dieselbe Kette wie `agent-catalog.js:contextHelp`:
 * Modulschlüssel → geteilter Schlüssel (`modules.shared.<suffix>`). Der
 * geteilte Rückfall gehört zum geteilten `read()` aus `agent-read-mixin.js`;
 * zählte die Abdeckung ihn nicht mit, wiese sie eine Lücke aus, die es für
 * den Agenten nicht gibt — und verlangte genau die Doppelpflege in 72
 * Modulen, die der Rückfall vermeidet.
 *
 * `whenToUse` ist die eine Ausnahme, und zwar ABSICHTLICH STRENGER als die
 * Laufzeit: `agent-catalog.js:whenToUse` fällt auf
 * `modules.<id>.description` zurück, und die hat jedes der 72 Module — die
 * Zeile stünde damit für immer auf 100 % und meldete nichts. Eine generische
 * Modulbeschreibung ist keine Wann-nehme-ich-das-Anleitung. Gezählt wird
 * deshalb nur modulspezifische `whenToUse`-Prosa; eine Lücke dort ist
 * fällige Arbeit, keine kaputte Fläche.
 *
 * @param {string} appDir  Wurzel von app/dev
 * @param {Record<string, object>} modules  die Registry-Einträge
 * @returns {{ actions: {total:number,covered:number}, params: {total:number,covered:number},
 *             keys: {total:number,covered:number},
 *             fields: {total:number,covered:number}, whenToUse: {total:number,covered:number},
 *             missing: string[], missingKeys: string[] }}
 *   `missing` nennt jede Lücke JE SPRACHE (ein überall fehlender Schlüssel
 *   erscheint zweimal), `missingKeys` jeden betroffenen Schlüssel genau
 *   einmal — die Zahl, die ein Mensch meint, wenn er „wie viele Lücken"
 *   fragt.
 */
export function countHelpCoverage(appDir, modules) {
  const tables = {};
  for (const lang of LANGS) {
    tables[lang] = JSON.parse(readFileSync(join(appDir, 'i18n', `${lang}.json`), 'utf8'));
  }

  const out = {
    actions: { total: 0, covered: 0 },
    params: { total: 0, covered: 0 },
    keys: { total: 0, covered: 0 },
    fields: { total: 0, covered: 0 },
    whenToUse: { total: 0, covered: 0 },
    missing: [],
    missingKeys: [],
  };

  /**
   * @param {string} bucket  Zähler in `out`
   * @param {string[]} keys  Kandidatenschlüssel in Auflösungsreihenfolge;
   *   der erste ist der kanonische, alle werden in der Lückenzeile genannt,
   *   damit der Autor nicht in die falsche Datei geschickt wird
   */
  const check = (bucket, keys) => {
    out[bucket].total++;
    const gaps = LANGS.filter(
      lang => !keys.some(key => lookup(tables[lang], key) !== undefined),
    );
    if (gaps.length === 0) { out[bucket].covered++; return; }
    const where = keys.length > 1 ? `${keys[0]} (oder ${keys.slice(1).join(', ')})` : keys[0];
    for (const lang of gaps) out.missing.push(`${lang}: ${where}`);
    out.missingKeys.push(keys[0]);
  };

  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    // Kein `modules.shared`-Kandidat und kein `description`-Rückfall — siehe
    // der Absatz oben: diese Zeile ist absichtlich strenger als die Laufzeit.
    check('whenToUse', [`modules.${id}.whenToUse`]);
    for (const [name, action] of Object.entries(entry.actions ?? {})) {
      check('actions', helpKeys(id, `actions.${name}.help`));
      for (const param of action.params ?? []) {
        check('params', helpKeys(id, `actions.${name}.params.${param.name}`));
      }

    }
    for (const name of Object.keys(entry.fields ?? {})) {
      check('fields', helpKeys(id, `fields.${name}.help`));
    }
    for (const suffix of typedefHelpSuffixes(entry)) check('keys', helpKeys(id, suffix));
  }
  return out;
}

/** Der CLI-Teil. Berichtend: Exit immer 0. */
async function main() {
  const verbose = process.argv.includes('--verbose');
  const { modules, coverage } = collectAgentData(APP_DIR);

  console.log(`Agentenfläche: ${coverage.available} von ${coverage.total} Modulen freigegeben`);

  const byCode = new Map();
  for (const [id, entry] of Object.entries(modules)) {
    for (const code of entry.reported) {
      const kind = code.split(':')[0];
      if (!byCode.has(kind)) byCode.set(kind, []);
      byCode.get(kind).push(explainViolation(id, code));
    }
  }

  if (byCode.size === 0) {
    console.log('Keine Befunde.');
  } else {
    console.log('\nBefunde (berichtend — hart erst bei gesetztem Modul-Tag):');
    for (const kind of [...byCode.keys()].sort()) {
      const rows = byCode.get(kind);
      const moduleCount = new Set(rows.map(r => r.split(':')[0])).size;
      console.log(`  ${kind}: ${rows.length} in ${moduleCount} Modulen`);
      if (verbose) for (const row of rows.sort()) console.log(`    ${row}`);
    }
  }

  const help = countHelpCoverage(APP_DIR, modules);
  const pct = (c) => (c.total === 0 ? '—' : `${Math.round((c.covered / c.total) * 100)} %`);
  console.log('\nKontexthilfen der freigegebenen Module (zweisprachig gezählt):');
  console.log(`  whenToUse: ${help.whenToUse.covered}/${help.whenToUse.total} (${pct(help.whenToUse)})`);
  console.log(`  Aktionen:  ${help.actions.covered}/${help.actions.total} (${pct(help.actions)})`);
  console.log(`  Parameter: ${help.params.covered}/${help.params.total} (${pct(help.params)})`);
  console.log(`  Schlüssel: ${help.keys.covered}/${help.keys.total} (${pct(help.keys)})`);
  console.log(`  Felder:    ${help.fields.covered}/${help.fields.total} (${pct(help.fields)})`);
  const anchors = countAnchorCoverage(APP_DIR, modules);
  const exemptNote = anchors.exempt > 0 ? `, davon ${anchors.exempt} begründet ausgenommen` : '';
  console.log(`  Beschriftungen mit Anker: ${anchors.covered}/${anchors.total} (${pct(anchors)})${exemptNote}`);
  // Dynamisch statt oben importiert: help-anchor-coverage.mjs braucht
  // typedefHelpSuffixes aus dieser Datei — ein statischer Import in beide
  // Richtungen wäre ein Zyklus.
  const { countHelpAnchorCoverage } = await import('./help-anchor-coverage.mjs');
  const helpAnchors = await countHelpAnchorCoverage(APP_DIR, modules);
  const helpExempt = helpAnchors.exempt > 0 ? `, davon ${helpAnchors.exempt} begründet ausgenommen` : '';
  console.log(`  Hilfetexte mit Anker: ${helpAnchors.covered}/${helpAnchors.total} (${pct(helpAnchors)})${helpExempt}`);
  if (help.missingKeys.length > 0 && !verbose) {
    console.log(`  ${help.missingKeys.length} Schlüssel mit Lücke `
      + `(${help.missing.length} Sprachfälle) — mit --verbose einzeln benannt.`);
  }
  if (verbose) for (const row of [...help.missing].sort()) console.log(`    fehlt — ${row}`);
  if (verbose) {
    for (const row of anchors.missing) console.log(`    ohne Anker — ${row}`);
    for (const row of anchors.staleExemptions) console.log(`    Ausnahme ohne Treffer — ${row}`);
  } else if (anchors.staleExemptions.length > 0) {
    console.log(`  ${anchors.staleExemptions.length} Ausnahme(n) ohne Treffer — mit --verbose einzeln benannt.`);
  }
  for (const row of anchors.exemptionCountMismatches) console.log(`    Ausnahme mit falscher Trefferzahl — ${row}`);

  const gapModules = Object.entries(helpAnchors.perModule).filter(([, r]) => r.covered < r.total);
  if (verbose) {
    const share = ([, r]) => r.covered / r.total;
    for (const [id, r] of gapModules.sort((a, b) => share(a) - share(b) || a[0].localeCompare(b[0]))) {
      console.log(`    Hilfetexte je Modul — ${id}: ${r.covered}/${r.total}`);
    }
    for (const row of helpAnchors.missing) console.log(`    ohne Hilfe-Anker — ${row}`);
    for (const row of helpAnchors.staleExemptions) console.log(`    Hilfe-Ausnahme ohne Treffer — ${row}`);
  } else if (gapModules.length > 0 || helpAnchors.staleExemptions.length > 0) {
    console.log(`  Hilfetexte ohne Anker: ${helpAnchors.missing.length} in ${gapModules.length} Modulen, `
      + `${helpAnchors.staleExemptions.length} Hilfe-Ausnahme(n) ohne Treffer — mit --verbose einzeln benannt.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Bewusst kein Top-Level-await: main() importiert help-anchor-coverage.mjs,
  // das seinerseits diese Datei importiert — ein wartendes Modul wäre ein Deadlock.
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}
