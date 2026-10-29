import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createResolver } from './agent-resolve.mjs';
import { readReturnKeys } from './agent-read-return.mjs';

function setup(files) {
  const root = mkdtempSync(join(tmpdir(), 'readret-'));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  const resolver = createResolver(root);
  return { resolver, sf: resolver.parse(join(root, 'js/modules/foo/foo.js')) };
}
const vm = (readBody, extra = '') => `import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
${extra}
export default createModule({ config: { id: 'foo' }, data(module) { return {
  /** @agent */
  read(options) { ${readBody} },
  /** @noagent */
  _snap() { return { s1: 1, s2: 2 }; },
}; } });`;
const TOJSON = () => ['title', 'items', 'exampleWorksheetId'];

test('Objektliteral: Eigenschaftsnamen', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState('foo', { a: 1, b, 'c': 2 }, options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['a', 'b', 'c']);
});
test('Spread von this.model.toJSON() nimmt die persistierten Schlüssel', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState('foo', { ...this.model.toJSON(), extra: 1 }, options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['title', 'items', 'exampleWorksheetId', 'extra']);
});
test('Rest-Destrukturierung zieht die herausgelösten Schlüssel ab', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`const { exampleWorksheetId: _b, ...state } = this.model.toJSON(); return readAgentState('foo', { ...state, r: 1 }, options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['title', 'items', 'r']);
});
test('delete auf einer lokalen Kopie zieht den Schlüssel ab', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`const state = this.model.toJSON(); delete state.exampleWorksheetId; return readAgentState('foo', { ...state }, options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['title', 'items']);
});
test('Hilfsmethode this._snap() wird eine Ebene aufgelöst', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState('foo', this._snap(), options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['s1', 's2']);
});
test('importierte Funktion wird aufgelöst', () => {
  const { resolver, sf } = setup({
    'js/modules/foo/foo.js': vm(`return readAgentState('foo', snap(this.model), options);`, `import { snap } from './foo-read.js';`),
    'js/modules/foo/foo-read.js': `export function snap(m) { const x = 1; return { k1: x, k2: m.y }; }`,
  });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['k1', 'k2']);
});
test('Mixin-Form this.model?.toJSON?.() ?? {} nimmt die persistierten Schlüssel', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState(module.id, this.model?.toJSON?.() ?? {}, options);`) });
  assert.deepEqual(readReturnKeys(resolver, sf, TOJSON), ['title', 'items', 'exampleWorksheetId']);
});
test('nicht auflösbar → null', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState('foo', build(), options);`) });
  assert.equal(readReturnKeys(resolver, sf, TOJSON), null);
});
test('toJSON nicht auflösbar → null', () => {
  const { resolver, sf } = setup({ 'js/modules/foo/foo.js': vm(`return readAgentState('foo', { ...this.model.toJSON() }, options);`) });
  assert.equal(readReturnKeys(resolver, sf, () => null), null);
});
