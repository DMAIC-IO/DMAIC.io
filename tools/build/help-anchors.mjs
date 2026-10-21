/**
 * Hilfe-Anker der Oberfläche: jeder Hilfeschlüssel, den eine Vorlage, ein
 * Modul-Skript oder ein geteilter Baustein an ein Element hängt.
 *
 * EIN Sammler für zwei Verbraucher: die i18n-Tore in `agent-data.test.mjs`
 * (jeder Anker löst in beiden Sprachen auf, kein Strukturjargon) und die
 * Kennzahl „Hilfetexte mit Anker“ in `help-anchor-coverage.mjs`. Zwei
 * Sammler könnten auseinanderlaufen — das Tor prüfte dann andere Anker, als
 * die Kennzahl zählt.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Alle `data-help-key`-Werte aus den Vorlagen eines Moduls. */
export function helpKeysInTemplates(appDir, moduleId) {
  const dir = join(appDir, 'js', 'modules', moduleId);
  const keys = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(join(dir, file), 'utf8');
    // Nur das wörtliche Merkmal: `:data-help-key="col.help"` ist ein
    // Alpine-Ausdruck, kein Schlüssel (msa-typ1, Statistiktabelle) — deren
    // Ziele sind Typedef-Sätze und stehen schon im Typedef-Tor.
    for (const m of html.matchAll(/(?<![:\w-])data-help-key="([^"]+)"/g)) keys.push([file, m[1]]);
  }
  return keys;
}

/**
 * Wörtliche Hilfeschlüssel, die ein Modul oder ein geteilter Baustein zur
 * Laufzeit an ein Element hängt: DatasetPicker-Slots (`helpKey`,
 * `addHelpKey`), Kacheln und Spalten (`help`). Nur Literale in einfachen
 * Anführungszeichen, die mit `modules.` beginnen — zusammengesetzte
 * Schlüssel erfasst dieser Ausdruck nicht. Ausgenommen sind Handbuchdateien
 * (`*-help.js`, kein Kontexthilfe-Anker) und Kommentare (`helpKeysInScripts`
 * entfernt sie vorher).
 */
export const LITERAL_HELP_KEY = /\b(?:helpKey|addHelpKey|help)\s*:\s*'(modules\.[^']+)'/g;

/** Leistenknopf mit Agentenaktion: `workspace.js:describeAction` hängt `modules.<id>.actions.<name>.help` an. */
const AGENT_ACTION = /\bagentAction\s*:\s*'(\w+)'/g;
/** Dateilokale Präfix-Konstante, z. B. `const HELP = 'modules.foo.types.';`. */
const HELP_PREFIX_CONST = /\bconst\s+(\w+)\s*=\s*'(modules\.[^']*)'/g;
/** Zusammengesetzter Schlüssel aus Präfix-Konstante und Rest: `help: \`${HELP}Result.x\``. */
const TEMPLATE_HELP_KEY = /\b(?:helpKey|addHelpKey|help)\s*:\s*`\$\{(\w+)\}([\w.-]+)`/g;

/** Geteilte Bausteine, deren wörtliche Schlüssel für jedes Modul gelten. */
export const SHARED_ANCHOR_SOURCES = ['js/core/stats-panel.js'];

/**
 * Alle Hilfeschlüssel, die die Skripte eines Moduls statisch preisgeben:
 * die Literale (`LITERAL_HELP_KEY`), Leistenknöpfe mit `agentAction` (als
 * `modules.<id>.actions.<name>.help`) und zusammengesetzte Schlüssel
 * `help: \`${HELP}…\``, sofern `HELP` eine dateilokale Konstante
 * `const HELP = 'modules.…'` ist; andere Ausdrücke bleiben unsichtbar.
 */
export function helpKeysInScripts(appDir, moduleId) {
  const dir = join(appDir, 'js', 'modules', moduleId);
  const keys = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js') || file.endsWith('-help.js')) continue;
    const js = readFileSync(join(dir, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of js.matchAll(LITERAL_HELP_KEY)) keys.push([file, m[1]]);
    for (const m of js.matchAll(AGENT_ACTION)) keys.push([file, `modules.${moduleId}.actions.${m[1]}.help`]);
    const prefixes = new Map([...js.matchAll(HELP_PREFIX_CONST)].map(m => [m[1], m[2]]));
    for (const m of js.matchAll(TEMPLATE_HELP_KEY)) {
      if (prefixes.has(m[1])) keys.push([file, prefixes.get(m[1]) + m[2]]);
    }
  }
  return keys;
}

/** Alle wörtlichen Hilfeschlüssel der geteilten Bausteine. */
export function helpKeysInSharedSources(appDir) {
  const keys = [];
  for (const rel of SHARED_ANCHOR_SOURCES) {
    const js = readFileSync(join(appDir, rel), 'utf8');
    for (const m of js.matchAll(LITERAL_HELP_KEY)) keys.push([rel, m[1]]);
  }
  return keys;
}

/**
 * Hilfeschlüssel, die eine Vorlage erst zur Laufzeit zusammensetzt
 * (`:data-help-key="…"`) — für `helpKeysInTemplates` unsichtbar. Jede Familie
 * zählt ihre Schlüssel aus der Quelle auf, die auch die Oberfläche benutzt.
 *
 * @type {Array<{ moduleId: string, keys: () => Promise<string[]> | string[] }>}
 */
export const BOUND_HELP_KEY_FAMILIES = [
  {
    moduleId: 'attribute-test',
    keys: async () => {
      const { STAT_ROWS } = await import('../../js/modules/attribute-test/attribute-test-report.js');
      return Object.entries(STAT_ROWS).flatMap(([kind, rows]) =>
        rows.map((key) => `modules.attribute-test.stats.${kind}.${key}`));
    },
  },
  {
    moduleId: 'outlier-test',
    keys: async () => {
      const { METRIC_KEYS, ESD_STEP_KEYS } = await import('../../js/modules/outlier-test/outlier-test-model.js');
      return [
        ...METRIC_KEYS.map((k) => `modules.outlier-test.types.MethodMetrics.${k}`),
        ...ESD_STEP_KEYS.map((k) => `modules.outlier-test.types.EsdStep.${k}`),
      ];
    },
  },
  {
    moduleId: 'random-generator',
    keys: async () => {
      const { DISTRIBUTIONS } = await import('../../js/engines/random-variates-engine.js');
      return Object.entries(DISTRIBUTIONS).flatMap(([dist, d]) =>
        (d.params ?? []).flatMap((p) => [
          `modules.random-generator.dist.${dist}.${p.id}.label`,
          `modules.random-generator.types.DistParams.${dist}.${p.id}`,
        ]));
    },
  },
];

/**
 * Alle Hilfe-Anker eines Moduls: Vorlage, Modul-Skripte, geteilte Bausteine
 * und die zur Laufzeit gebundenen Familien dieses Moduls.
 *
 * @param {string} appDir  Wurzel von app/dev
 * @param {string} moduleId
 * @param {typeof BOUND_HELP_KEY_FAMILIES} [families]  austauschbar für Tests
 * @returns {Promise<Set<string>>}
 */
export async function anchorKeysOf(appDir, moduleId, families = BOUND_HELP_KEY_FAMILIES) {
  const keys = new Set();
  for (const [, key] of helpKeysInTemplates(appDir, moduleId)) keys.add(key);
  for (const [, key] of helpKeysInScripts(appDir, moduleId)) keys.add(key);
  for (const [, key] of helpKeysInSharedSources(appDir)) keys.add(key);
  for (const family of families) {
    if (family.moduleId !== moduleId) continue;
    for (const key of await family.keys()) keys.add(key);
  }
  return keys;
}
