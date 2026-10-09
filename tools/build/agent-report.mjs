#!/usr/bin/env node
/**
 * agent-report — Abdeckung der Agentenfläche als Zahl (Spec §9).
 *
 * „n von 72 Modulen agentenfähig, pro Release messbar." Berichtend: Exit
 * immer 0. Das Gate ist der Build (`npm run build:check`), der die generierte
 * Registry stale-prüft — nicht dieses Skript.
 *
 *   node tools/build/agent-report.mjs            # Abdeckung + Verstoßübersicht
 *   node tools/build/agent-report.mjs --verbose  # jeden Verstoß einzeln
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAgentData } from './agent-data.mjs';
import { APP_DIR } from './build.mjs';

const LANGS = ['de', 'en'];

/** Dotted-Path-Auflösung, die an einem Nicht-Objekt abbricht statt zu raten. */
function lookup(tree, key) {
  let node = tree;
  for (const segment of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[segment];
  }
  // Ein leerer Schlüssel ist keine Hilfe: die Fläche erzeugt einen Knopf, der
  // ein leeres Panel öffnet, und der Agent bekommt statt der JSDoc-Prosa
  // einen leeren Satz. Er zählt deshalb als Lücke, nicht als Abdeckung.
  return typeof node === 'string' && node.trim() !== '' ? node : undefined;
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
 * Modulschlüssel → geteilter Schlüssel (`agent.shared.<suffix>`). Der
 * geteilte Rückfall gehört zum geteilten `read()` aus `agent-read-mixin.js`;
 * zählte die Abdeckung ihn nicht mit, wiese sie eine Lücke aus, die es für
 * den Agenten nicht gibt — und verlangte genau die Doppelpflege in 72
 * Modulen, die der Rückfall vermeidet. `whenToUse` hat keinen geteilten
 * Rückfall: es ist modulspezifische Prosa.
 *
 * @param {string} appDir  Wurzel von app/dev
 * @param {Record<string, object>} modules  die Registry-Einträge
 * @returns {{ actions: {total:number,covered:number}, params: {total:number,covered:number},
 *             fields: {total:number,covered:number}, whenToUse: {total:number,covered:number},
 *             missing: string[] }}
 */
export function countHelpCoverage(appDir, modules) {
  const tables = {};
  for (const lang of LANGS) {
    tables[lang] = JSON.parse(readFileSync(join(appDir, 'i18n', `${lang}.json`), 'utf8'));
  }

  const out = {
    actions: { total: 0, covered: 0 },
    params: { total: 0, covered: 0 },
    fields: { total: 0, covered: 0 },
    whenToUse: { total: 0, covered: 0 },
    missing: [],
  };

  /**
   * @param {string} bucket  Zähler in `out`
   * @param {string} key  der Schlüssel, der in der Lücke genannt wird
   * @param {(tree: object) => string|undefined} exists  die Auflösungskette
   */
  const check = (bucket, key, exists) => {
    out[bucket].total++;
    const gaps = LANGS.filter(lang => exists(tables[lang]) === undefined);
    if (gaps.length === 0) { out[bucket].covered++; return; }
    for (const lang of gaps) out.missing.push(`${lang}: ${key}`);
  };

  /** Modulschlüssel, sonst geteilter Schlüssel — wie `contextHelp`. */
  const agentKey = (bucket, id, suffix) => check(
    bucket,
    `modules.${id}.agent.${suffix}`,
    tree => lookup(tree, `modules.${id}.agent.${suffix}`) ?? lookup(tree, `agent.shared.${suffix}`),
  );

  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    check('whenToUse', `modules.${id}.whenToUse`, tree => lookup(tree, `modules.${id}.whenToUse`));
    for (const [name, action] of Object.entries(entry.actions ?? {})) {
      agentKey('actions', id, `actions.${name}.help`);
      for (const param of action.params ?? []) {
        agentKey('params', id, `actions.${name}.params.${param.name}`);
      }
    }
    for (const name of Object.keys(entry.fields ?? {})) {
      agentKey('fields', id, `fields.${name}`);
    }
  }
  return out;
}

/** Der CLI-Teil. Berichtend: Exit immer 0. */
function main() {
  const verbose = process.argv.includes('--verbose');
  const { modules, coverage } = collectAgentData(APP_DIR);

  console.log(`Agentenfläche: ${coverage.available} von ${coverage.total} Modulen freigegeben`);

  const byCode = new Map();
  for (const [id, entry] of Object.entries(modules)) {
    for (const code of entry.reported) {
      const kind = code.split(':')[0];
      if (!byCode.has(kind)) byCode.set(kind, []);
      byCode.get(kind).push(`${id}: ${code}`);
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
  console.log(`  Felder:    ${help.fields.covered}/${help.fields.total} (${pct(help.fields)})`);
  if (help.missing.length > 0 && !verbose) {
    console.log(`  ${help.missing.length} Lücke(n) — mit --verbose einzeln benannt.`);
  }
  if (verbose) for (const row of [...help.missing].sort()) console.log(`    fehlt — ${row}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
