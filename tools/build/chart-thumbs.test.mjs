/**
 * chart-thumbs.test.mjs — guards the one dynamic icon() call the static
 * icon-refs lint cannot see.
 *
 * js/modules/chart-suggestion/chart-suggestion.js builds `icon(`chart.${name}`)`
 * from KNOWN_THUMBS at runtime, plus the 'generic' fallback for any type not in
 * that set. A literal-matching lint (tools/build/icon-refs.mjs) only sees the
 * template literal, not the names it can produce — so a KNOWN_THUMBS entry
 * without a matching icon-map.json entry would ship as a silent blank icon.
 * This test reads both sources directly and cross-checks them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadIconMap } from './icon-map.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHART_SUGGESTION_PATH = `${ROOT}js/modules/chart-suggestion/chart-suggestion.js`;
const ICON_MAP_PATH = `${ROOT}assets/icons/icon-map.json`;

/**
 * @param {string} source  chart-suggestion.js file contents
 * @returns {string[]}  the chart type names listed in its KNOWN_THUMBS set
 */
function extractKnownThumbs(source) {
  const match = source.match(/KNOWN_THUMBS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(match, 'KNOWN_THUMBS set not found in chart-suggestion.js — has it been renamed/moved?');
  const names = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(names.length > 0, 'KNOWN_THUMBS set parsed as empty — regex likely out of sync');
  return names;
}

test('every KNOWN_THUMBS chart type has a chart.<type> icon-map entry', () => {
  const source = readFileSync(CHART_SUGGESTION_PATH, 'utf8');
  const map = loadIconMap(ICON_MAP_PATH);
  const knownThumbs = extractKnownThumbs(source);

  const missing = knownThumbs
    .map((name) => `chart.${name}`)
    .filter((iconName) => !(iconName in map));

  assert.deepEqual(missing, [], `KNOWN_THUMBS names missing from icon-map.json: ${missing.join(', ')}`);
});

test('the chart-thumb fallback name has a chart.generic icon-map entry', () => {
  const map = loadIconMap(ICON_MAP_PATH);
  assert.ok('chart.generic' in map, 'chart.generic missing from icon-map.json — chartThumbNode() falls back to it for unknown types');
});
