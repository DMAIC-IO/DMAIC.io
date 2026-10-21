import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import {
  createResolver, findCreateModuleMember, findImportSource, findLocalDeclaration,
  functionFromMember, memberName, resolveSpecifier, returnObjectLiteral,
} from './agent-resolve.mjs';

/** Parse a snippet the way the generator does. */
function sourceOf(code, name = 'x.js') {
  return ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

/** @returns {string} Wurzel eines Wegwerf-Baums, Pfade relativ dazu. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'resolve-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

/** Die erste Funktionsdeklaration einer Quelle. */
function firstFunction(sf) {
  return sf.statements.find(ts.isFunctionDeclaration);
}

test('returnObjectLiteral: finds the return literal of a block body', () => {
  const sf = sourceOf('function f() { return { a: 1 }; }');
  assert.ok(returnObjectLiteral(firstFunction(sf)));
});

test('returnObjectLiteral: does NOT descend into a nested callback', () => {
  // Die naive Suche erwischt hier `{ id: r.id }` und beschreibt dann ein
  // Viewmodel, das es nicht gibt.
  const sf = sourceOf('function f(rows) { rows.map(r => { return { id: r.id }; }); return rows; }');
  assert.equal(returnObjectLiteral(firstFunction(sf)), null);
});

test('returnObjectLiteral: skips a non-literal return and keeps looking', () => {
  const sf = sourceOf('function f(x) { if (!x) return null; return { a: 1 }; }');
  assert.ok(returnObjectLiteral(firstFunction(sf)));
});

test('returnObjectLiteral: handles a parenthesised arrow body', () => {
  const sf = sourceOf('const f = () => ({ a: 1 });');
  const fn = findLocalDeclaration('f', sf).initializer;
  assert.ok(returnObjectLiteral(fn));
});

test('findLocalDeclaration: finds a const declared inside a function body', () => {
  // Das `_core`-Muster von process-map liegt INNERHALB von `data()`.
  const sf = sourceOf('function data() { const _core = mix(); return { ..._core }; }');
  assert.ok(findLocalDeclaration('_core', sf));
  assert.equal(findLocalDeclaration('nope', sf), null);
});

test('findImportSource: resolves a named import and its alias', () => {
  const sf = sourceOf("import { a, b as c } from './m.js';");
  assert.deepEqual(findImportSource('a', sf), { specifier: './m.js', originalName: 'a' });
  assert.deepEqual(findImportSource('c', sf), { specifier: './m.js', originalName: 'b' });
  assert.equal(findImportSource('b', sf), null);
});

test('resolveSpecifier: a bare package name is no source, a missing file neither', () => {
  const root = tree({ 'a/x.js': 'export const x = 1;' });
  assert.equal(resolveSpecifier('typescript', join(root, 'a/y.js')), null);
  assert.equal(resolveSpecifier('./gone.js', join(root, 'a/y.js')), null);
  assert.equal(resolveSpecifier('./x.js', join(root, 'a/y.js')), join(root, 'a/x.js'));
});

test('findCreateModuleMember / memberName / functionFromMember work together', () => {
  const sf = sourceOf('createModule({ config: {}, data(m) { return {}; } });');
  const member = findCreateModuleMember(sf, 'data');
  assert.equal(memberName(member), 'data');
  assert.ok(functionFromMember(member));
  assert.equal(findCreateModuleMember(sf, 'nope'), null);
});

test('findCreateModuleMember: follows createModule(definition) to a const object literal in the file', () => {
  // hypothesis-test: `const definition = { … }; const mod = createModule(definition);`
  // (the definition is shared with unit tests via `definition.data`).
  const sf = sourceOf('const definition = { config: {}, data(m) { return { a() {} }; } };\n'
    + 'const mod = createModule(definition);');
  const member = findCreateModuleMember(sf, 'data');
  assert.equal(memberName(member), 'data');
  assert.ok(functionFromMember(member));
  assert.equal(findCreateModuleMember(sf, 'nope'), null);
});

test('findCreateModuleMember: an identifier that is no object literal resolves to nothing (fail closed)', () => {
  const sf = sourceOf('const definition = build();\nconst mod = createModule(definition);');
  assert.equal(findCreateModuleMember(sf, 'data'), null);
});

test('createResolver: parses each file exactly once', () => {
  const root = tree({ 'm.js': 'export const x = 1;' });
  const resolver = createResolver(root);
  assert.equal(resolver.parse(join(root, 'm.js')), resolver.parse(join(root, 'm.js')));
});

test('createResolver: a spread of a function yields no members', () => {
  // `{...fn}` hat keine eigenen Eigenschaften — eine Funktionsdeklaration ist
  // daher KEIN Treffer der Spread-Auflösung.
  const root = tree({ 'm.js': 'export function fn() { return { a() {} }; }' });
  const sf = sourceOf("import { fn } from './m.js';\nconst vm = { ...fn };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.equal(members.size, 0);
  assert.deepEqual(unresolved, ['fn']);
});

test('createResolver: a missing import target is unresolved, not a crash', () => {
  const root = tree({ 'keep.js': '' });
  const sf = sourceOf("import { mix } from './gone.js';\nconst vm = { ...mix };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.deepEqual(unresolved, ['mix']);
});

test('createResolver: an aliased import resolves under its original name', () => {
  const root = tree({ 'm.js': 'export const base = { a() {} };' });
  const sf = sourceOf("import { base as alias } from './m.js';\nconst vm = { ...alias };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.deepEqual([...members.keys()], ['a']);
  assert.deepEqual(unresolved, []);
});

test('createResolver: a method call callee is not resolvable', () => {
  const root = tree({ 'keep.js': '' });
  const sf = sourceOf('const vm = { ...helpers.build() };', join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  assert.deepEqual(createResolver(root).collectMembers(literal, sf).unresolved, ['helpers.build()']);
});

test('createResolver: later members win, in source order', () => {
  const root = tree({ 'm.js': 'export const base = { a() { return 1; } };' });
  const sf = sourceOf("import { base } from './m.js';\nconst vm = { ...base, a() { return 2; } };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members } = createResolver(root).collectMembers(literal, sf);
  assert.equal(members.get('a').sf, sf);
});

test('createResolver: the same mixin spread twice — the SECOND occurrence wins', () => {
  // Befund 1 der Fix-Runde: ein Besuchs-Set hätte das zweite Vorkommen
  // übersprungen und damit das laufzeitlich GEWINNENDE. Der Pfadschutz gibt
  // ein Literal beim Zurückkehren wieder frei, also läuft es erneut durch.
  const root = tree({ 'm.js': 'export const base = { a() { return 1; } };' });
  const sf = sourceOf(
    "import { base } from './m.js';\nconst vm = { ...base, a() { return 2; }, ...base };",
    join(root, 'v.js'),
  );
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.deepEqual(unresolved, []);
  // `a` kommt aus dem ZWEITEN Spread, nicht aus dem eigenen Mitglied.
  assert.notEqual(members.get('a').sf, sf);
  assert.equal(members.get('a').sf.fileName, join(root, 'm.js'));
});

test('createResolver: a self-referential mixin terminates silently', () => {
  const root = tree({ 'm.js': 'export const loop = { ...loop, a() {} };' });
  const sf = sourceOf("import { loop } from './m.js';\nconst vm = { ...loop };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.deepEqual([...members.keys()], ['a']);
  assert.deepEqual(unresolved, []);        // ein Zyklus ist aufgelöst, nicht blind
});

test('createResolver: hitting the depth limit is reported, not silently dropped', () => {
  // Eine Kette aus 13 Mixins, die einander spreizen. Der Dateikopf sagt
  // „Stillschweigen ist hier die einzige verbotene Antwort" — der Treffer der
  // Tiefengrenze muss also ein `unresolved`-Eintrag werden.
  const files = { 'v.js': '' };
  for (let i = 0; i < 12; i += 1) {
    files[`m${i}.js`] = `import { mix${i + 1} } from './m${i + 1}.js';\n`
      + `export const mix${i} = { ...mix${i + 1} };\n`;
  }
  files['m12.js'] = 'export const mix12 = { deep() {} };\n';
  const root = tree(files);
  const sf = sourceOf("import { mix0 } from './m0.js';\nconst vm = { ...mix0 };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.equal(members.has('deep'), false, 'die Kette darf nicht bis unten durchlaufen');
  assert.deepEqual(unresolved, ['mix12']);
});

test('createResolver: a chain just within the depth limit still resolves', () => {
  const files = {};
  for (let i = 0; i < 11; i += 1) {
    files[`m${i}.js`] = `import { mix${i + 1} } from './m${i + 1}.js';\n`
      + `export const mix${i} = { ...mix${i + 1} };\n`;
  }
  files['m11.js'] = 'export const mix11 = { deep() {} };\n';
  const root = tree(files);
  const sf = sourceOf("import { mix0 } from './m0.js';\nconst vm = { ...mix0 };", join(root, 'v.js'));
  const literal = findLocalDeclaration('vm', sf).initializer;
  const { members, unresolved } = createResolver(root).collectMembers(literal, sf);
  assert.deepEqual([...members.keys()], ['deep']);
  assert.deepEqual(unresolved, []);
});

test('findLocalDeclaration warnt bei zwei Deklarationen desselben Namens', () => {
  const sf = sourceOf(`function outer() { class State {} }\nexport class State {}`);
  const res = findLocalDeclaration('State', sf);
  assert.ok(res, 'nichts gefunden');
  assert.equal(res.ambiguous, true, 'keine Kollisionswarnung');
});
