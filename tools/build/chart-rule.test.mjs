/**
 * Chart rule: modules on this list draw every chart,
 * plot and diagram through context.chartManager — no own <svg>, no
 * createElementNS, no direct modebar SVG export helpers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../js/modules');

const CHART_RULE_MODULES = ['voc-ctx-tree', 'project-charter', 'triz-function-analysis', 'histogram'];

const FORBIDDEN = [
  { name: 'createElementNS', re: /createElementNS\s*\(/ },
  { name: 'inline <svg>', re: /<svg[\s>]/ },
  { name: 'exportSvgAsPNG/exportSvgAsFile', re: /exportSvgAs(PNG|File)/ },
];

for (const mod of CHART_RULE_MODULES) {
  test(`${mod} draws no own SVG`, () => {
    const dir = join(MODULES_DIR, mod);
    const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
    assert.ok(files.length > 0, `${mod} has source files`);
    const hits = [];
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const { name, re } of FORBIDDEN) if (re.test(src)) hits.push(`${f}: ${name}`);
    }
    assert.deepEqual(hits, []);
  });
}
