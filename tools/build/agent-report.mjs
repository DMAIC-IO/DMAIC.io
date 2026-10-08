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
import { collectAgentData } from './agent-data.mjs';
import { APP_DIR } from './build.mjs';

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

if (byCode.size === 0) { console.log('Keine Befunde.'); process.exit(0); }

console.log('\nBefunde (berichtend — hart erst bei gesetztem Modul-Tag):');
for (const kind of [...byCode.keys()].sort()) {
  const rows = byCode.get(kind);
  const moduleCount = new Set(rows.map(r => r.split(':')[0])).size;
  console.log(`  ${kind}: ${rows.length} in ${moduleCount} Modulen`);
  if (verbose) for (const row of rows.sort()) console.log(`    ${row}`);
}
