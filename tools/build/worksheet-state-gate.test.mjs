import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APP_DIR } from './build.mjs';
import { findWorksheetStateAccess, WORKSHEET_STATE_ALLOW } from './worksheet-state-gate.mjs';

const ALLOW = [{ path: 'js/modules/worksheet/', reason: 'das Arbeitsblatt selbst' }];
const RAW = 'const s = stateManager.getModuleState(id).sheets.find(x => x.id === a);';

test('Gate: Rohzugriff außerhalb erlaubter Pfade ist ein Befund', () => {
  assert.deepEqual(findWorksheetStateAccess([{ path: 'js/modules/foo/foo.js', text: RAW }], ALLOW), ['js/modules/foo/foo.js']);
});

test('Gate: unter js/modules/worksheet/ kein Befund', () => {
  assert.deepEqual(findWorksheetStateAccess([{ path: 'js/modules/worksheet/worksheet.js', text: RAW }], ALLOW), []);
});

test('Gate: parsed.sheets ohne getModuleState( ist kein Befund', () => {
  assert.deepEqual(findWorksheetStateAccess([{ path: 'js/x.js', text: 'const a = parsed.sheets;' }], ALLOW), []);
});

test('Gate: Ausnahme mit Begründung ist kein Befund', () => {
  const allow = [...ALLOW, { path: 'js/core/x.js', reason: 'generisch' }];
  assert.deepEqual(findWorksheetStateAccess([{ path: 'js/core/x.js', text: RAW }], allow), []);
});

test('Gate: Ausnahme ohne Begründung wirft', () => {
  assert.throws(() => findWorksheetStateAccess([], [{ path: 'js/core/x.js', reason: '' }]), /reason|Begründung/);
});

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'chunks') walk(p, out); }
    else if (e.name.endsWith('.js') && !e.name.endsWith('.min.js') && !e.name.endsWith('.generated.js')) out.push(p);
  }
  return out;
}

test('Gate: der echte Baum js/ hat keinen Rohzugriff auf Arbeitsblatt-Stände', () => {
  const files = walk(join(APP_DIR, 'js')).map(p => ({ path: relative(APP_DIR, p), text: readFileSync(p, 'utf8') }));
  const hits = findWorksheetStateAccess(files, WORKSHEET_STATE_ALLOW);
  assert.deepEqual(hits, [], 'Arbeitsblätter lesen über ctx.instances.readSync / readWorksheet (Spec F1.14a §4.1)');
});
