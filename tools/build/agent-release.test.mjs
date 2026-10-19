import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectAgentData } from './agent-data.mjs';
import { RELEASED_MODULES, VIOLATION_REMEDIES, explainViolation, releaseDiff } from './agent-release.mjs';
import { APP_DIR } from './build.mjs';

test('Freigabe: genau die Module aus RELEASED_MODULES sind agentenfähig', () => {
  const { modules } = collectAgentData(APP_DIR);
  const diff = releaseDiff(modules);
  assert.deepEqual(diff, [], `Freigaben weichen ab (Diagnose: npm run agent:report -- --verbose):\n  ${diff.join('\n  ')}`);
});

test('RELEASED_MODULES ist sortiert und ohne Doppel', () => {
  assert.deepEqual([...RELEASED_MODULES], [...new Set(RELEASED_MODULES)].sort());
});

test('jede Verstoßart aus agent-data.mjs hat eine Abhilfe', () => {
  const source = readFileSync(join(APP_DIR, 'tools', 'build', 'agent-data.mjs'), 'utf8')
    .split('\n').filter(line => !/^\s*(\*|\/\/)/.test(line)).join('\n');
  const kinds = new Set([...source.matchAll(/[`']([a-z]+(?:_[a-z]+)+)[:`']/g)].map(m => m[1]));
  const missing = [...kinds].filter(k => !Object.hasOwn(VIOLATION_REMEDIES, k)).sort();
  assert.deepEqual(missing, [], 'Abhilfe in VIOLATION_REMEDIES (agent-release.mjs) ergänzen');
  const unused = Object.keys(VIOLATION_REMEDIES).filter(k => !kinds.has(k)).sort();
  assert.deepEqual(unused, [], 'Verstoßart gibt es in agent-data.mjs nicht mehr — Abhilfe streichen');
});

test('releaseDiff: Verstoß wörtlich mit Abhilfe, fehlendes Tag, unbekanntes und neues Modul', () => {
  const modules = {
    a: { tagged: true, available: false, reported: ['unmarked_method:onX', 'dom_detour:innerHTML@12'] },
    b: { tagged: false, available: false, reported: [] },
    c: { tagged: true, available: true, reported: [] },
    d: { tagged: true, available: true, reported: [] },
  };
  assert.deepEqual(releaseDiff(modules, ['a', 'b', 'c', 'gone']), [
    'a: unmarked_method:onX → @agent oder @noagent setzen',
    `a: dom_detour:innerHTML@12 → ${VIOLATION_REMEDIES.dom_detour}`,
    'b: Modul-Tag fehlt → @agent in den Dateikopf setzen',
    'gone: Modul nicht gefunden → aus RELEASED_MODULES streichen',
    'd: neu freigegeben → in RELEASED_MODULES aufnehmen',
  ]);
});

test('explainViolation: unbekannte Verstoßart verweist auf die Doku', () => {
  assert.equal(explainViolation('x', 'brand_new:y'), 'x: brand_new:y → siehe docs/AGENT-INTERFACE.md');
});
