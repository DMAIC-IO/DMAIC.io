import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectAgentData } from './agent-data.mjs';
import { APP_DIR } from './build.mjs';
import { viaHelpGaps, fieldsWithoutWritePath, countHelpCoverage, lookup, helpExists, helpKeys, STRUCTURE_JARGON, typedefHelpSuffixes, readHelpTables } from './agent-report.mjs';

/** Ein Minimal-App-Verzeichnis mit nur den i18n-Dateien. */
function i18nFixture(de, en = de) {
  const root = mkdtempSync(join(tmpdir(), 'agent-report-'));
  mkdirSync(join(root, 'i18n'), { recursive: true });
  writeFileSync(join(root, 'i18n', 'de.json'), JSON.stringify(de));
  writeFileSync(join(root, 'i18n', 'en.json'), JSON.stringify(en));
  return root;
}

const MODULES = {
  foo: {
    available: true,
    actions: { read: { params: [] }, setProblem: { params: [{ name: 'text' }] } },
    fields: { problem: {} },
  },
  bar: { available: false, actions: {}, fields: {} },
};

test('countHelpCoverage counts only released modules', async () => {
  const root = i18nFixture({
    modules: {
      foo: {
        whenToUse: 'wann',
        actions: { read: { help: 'r' }, setProblem: { help: 's', params: { text: 't' } } },
        fields: { problem: { help: 'p' } },
      },
      // `bar` ist nicht freigegeben und hat KEINEN einzigen Schlüssel — es
      // darf die Zahl weder heben noch senken.
    },
  });
  const out = countHelpCoverage(root, MODULES);
  assert.deepEqual(out.actions, { total: 2, covered: 2 });
  assert.deepEqual(out.params, { total: 1, covered: 1 });
  assert.deepEqual(out.fields, { total: 1, covered: 1 });
  assert.deepEqual(out.whenToUse, { total: 1, covered: 1 });
  assert.deepEqual(out.missing, []);
});

test('countHelpCoverage names every gap, per language', async () => {
  const root = i18nFixture(
    { modules: { foo: { actions: { read: { help: 'r' } } } } },   // de
    { modules: { foo: { actions: { read: { help: 'r' } } } } },   // en
  );
  const out = countHelpCoverage(root, MODULES);
  assert.equal(out.actions.covered, 1);
  assert.ok(out.missing.some(m => m.includes('modules.foo.actions.setProblem.help')));
  assert.ok(out.missing.some(m => m.includes('foo.whenToUse')));
  // Eine Lücke in BEIDEN Sprachen wird zweimal genannt, je Sprache einmal.
  assert.deepEqual(
    out.missing.filter(m => m.endsWith('modules.foo.whenToUse')).sort(),
    ['de: modules.foo.whenToUse', 'en: modules.foo.whenToUse'],
  );
});

test('countHelpCoverage treats a key present in only ONE language as missing', async () => {
  const root = i18nFixture(
    { modules: { foo: { whenToUse: 'wann', actions: { read: { help: 'r' } } } } },
    { modules: { foo: { actions: { read: { help: 'r' } } } } },
  );
  const out = countHelpCoverage(root, MODULES);
  assert.equal(out.whenToUse.covered, 0);
  assert.ok(out.missing.some(m => m.includes('en:') && m.includes('foo.whenToUse')));
  // Und die Sprache, die den Schlüssel HAT, wird nicht angeschwärzt — sonst
  // ginge der Fall oben auch durch, wenn die Lücke pauschal für beide
  // Sprachen gemeldet würde.
  assert.equal(out.missing.filter(m => m === 'de: modules.foo.whenToUse').length, 0);
});

/* ── Der geteilte Rückfall ─────────────────────────────────────────────────
   `agent-catalog.js:contextHelp` löst in genau dieser Reihenfolge auf:
   Modulschlüssel → `modules.shared.<suffix>` → JSDoc-Prosa. Der geteilte
   Schlüssel gehört zum geteilten `read()` aus `agent-read-mixin.js` — ohne
   ihn müsste jedes der 72 Module denselben Satz in beide Sprachbäume
   kopieren. Zählte die Abdeckung ihn nicht mit, wiese sie eine Lücke aus,
   die es für den Agenten gar nicht gibt, und träte damit genau zu der
   Doppelpflege an, die der Rückfall vermeidet. */
test('countHelpCoverage honours the shared fallback modules.shared.<suffix>', async () => {
  const modules = {
    foo: { available: true, actions: { read: { params: [{ name: 'options' }] } }, fields: {} },
  };
  const tree = {
    modules: {
      foo: { whenToUse: 'wann' },
      shared: { actions: { read: { help: 'r', params: { options: 'o' } } } },
    },
  };
  const out = countHelpCoverage(i18nFixture(tree), modules);
  assert.deepEqual(out.actions, { total: 1, covered: 1 });
  assert.deepEqual(out.params, { total: 1, covered: 1 });
  assert.deepEqual(out.missing, []);
});

test('countHelpCoverage does NOT apply a shared fallback to whenToUse', async () => {
  // `whenToUse` ist modulspezifische Prosa („wann nehme ich dieses Werkzeug")
  // und hat per Form keinen geteilten Pfad — ein geteilter Satz wäre dort
  // sinnlos und würde eine echte Lücke verdecken.
  const modules = { foo: { available: true, actions: {}, fields: {} } };
  const tree = { modules: { shared: { whenToUse: 'egal' } } };
  const out = countHelpCoverage(i18nFixture(tree), modules);
  assert.deepEqual(out.whenToUse, { total: 1, covered: 0 });
});

/* ── Der leere String ──────────────────────────────────────────────────────
   Ein vorhandener, aber leerer Schlüssel ist keine Hilfe: die Fläche erzeugt
   einen Knopf, der ein leeres Panel öffnet, und der Agent bekommt einen
   leeren Hilfetext statt der JSDoc-Prosa. Er zählt deshalb als Lücke. */
test('countHelpCoverage counts an empty string as a gap, not as coverage', async () => {
  const modules = { foo: { available: true, actions: { read: { params: [] } }, fields: {} } };
  const tree = { modules: { foo: { whenToUse: '   ', actions: { read: { help: '' } } } } };
  const out = countHelpCoverage(i18nFixture(tree), modules);
  assert.deepEqual(out.actions, { total: 1, covered: 0 });
  assert.deepEqual(out.whenToUse, { total: 1, covered: 0 });
  assert.equal(out.missing.length, 4);   // zwei Schlüssel × zwei Sprachen
});

/* ── Robustheit der Auflösung ───────────────────────────────────────────────
   Beides kommt im echten Baum vor, solange 69 Module nicht freigegeben sind:
   ein `modules.<id>`-Teilbaum, der gar nicht existiert, und ein Zwischenglied,
   das ein String ist (ein Modul, dessen Eintrag versehentlich ein Satz wäre).
   Ein naives `o[k]` auf einem String liefert `undefined` statt zu werfen —
   aber `o['length']` wäre eine Zahl, und ein Schlüsselsegment ist nicht
   garantiert kein Eigenschaftsname von String.prototype. */
test('countHelpCoverage survives an absent subtree and a string intermediate segment', async () => {
  const modules = {
    foo: { available: true, actions: { read: { params: [] } }, fields: { length: {} } },
  };
  const tree = { modules: { foo: 'kein Objekt' } };
  let out;
  assert.doesNotThrow(() => { out = countHelpCoverage(i18nFixture(tree), modules); });
  assert.deepEqual(out.actions, { total: 1, covered: 0 });
  assert.deepEqual(out.fields, { total: 1, covered: 0 });
  assert.deepEqual(out.whenToUse, { total: 1, covered: 0 });
});

/* ── Der echte Baum ─────────────────────────────────────────────────────────
   Hier wird NICHT „alles muss 100 % sein" zugesichert — eine
   fehlende Kontexthilfe ist ausdrücklich eine ausgewiesene Lücke und
   blockiert nicht; das harte i18n-Tor der freigegebenen Module steht in
   `agent-data.test.mjs`. Zugesichert wird, dass die Zahl die echte
   Auflösungskette benutzt: ein synthetisches freigegebenes Modul neben den
   echten hat über das geteilte `read()` den Parameter `options`, aber im
   echten Baum keinen modulspezifischen Schlüssel dafür. Ohne den geteilten
   Rückfall wiese der Report hier eine Phantomlücke aus. Synthetisch, damit
   der Fall nicht an einem Modul hängt, das bei seiner Umstellung einen
   eigenen Schlüssel bekommt. */
test('countHelpCoverage resolves the real tree through the documented chain', async () => {
  const { collectAgentData } = await import('./agent-data.mjs');
  const { APP_DIR } = await import('./build.mjs');
  const { modules } = await collectAgentData(APP_DIR);
  const SYNTHETIC = '__agent-report-test-shared-read__';
  const out = countHelpCoverage(APP_DIR, {
    ...modules,
    [SYNTHETIC]: { available: true, actions: { read: { params: [{ name: 'options' }] } }, fields: {} },
  });
  assert.ok(out.actions.total > 1, 'kein echtes freigegebenes Modul — die Zahl prüfte nichts');
  assert.deepEqual(
    out.missing.filter(m => m.includes(`${SYNTHETIC}.actions.read.`)),
    [],
  );
  // Gegenprobe: ein Parameter ohne geteilten Rückfall IST eine Lücke.
  const gap = countHelpCoverage(APP_DIR, {
    [SYNTHETIC]: { available: true, actions: { read: { params: [{ name: '__nope__' }] } }, fields: {} },
  });
  assert.ok(gap.missing.some(m => m.includes(`${SYNTHETIC}.actions.read.params.__nope__`)), 'Gegenprobe ohne Lücke');
});

/* ── Die geteilte Auflösung ────────────────────────────────────────────────
   `lookup` und `helpExists` sind exportiert, weil das i18n-Tor in
   `agent-data.test.mjs` dieselbe Kette braucht. Sie werden deshalb HIER
   direkt festgenagelt — und nur hier, statt den Fall in beiden Dateien zu
   wiederholen. Der leere String ist der Fall, den der echte Baum nicht
   hergibt (dort ist kein Schlüssel leer), der aber beide Verbraucher
   betrifft. */

test('lookup: leerer und nur aus Leerzeichen bestehender Wert gilt als nicht vorhanden', async () => {
  const tree = { a: { voll: 'text', leer: '', blank: '   \n ' } };
  assert.equal(lookup(tree, 'a.voll'), 'text');
  assert.equal(lookup(tree, 'a.leer'), undefined);
  assert.equal(lookup(tree, 'a.blank'), undefined);
});

test('lookup: bricht an einem Nicht-Objekt ab, statt String-Eigenschaften zu finden', async () => {
  const tree = { a: 'kein Objekt' };
  assert.equal(lookup(tree, 'a.length'), undefined);
  assert.equal(lookup(tree, 'a.b.c'), undefined);
  assert.equal(lookup(tree, 'fehlt.ganz'), undefined);
  assert.equal(lookup({ a: { b: 5 } }, 'a.b'), undefined, 'eine Zahl ist kein Hilfetext');
});

test('helpKeys / helpExists: Modulschlüssel zuerst, modules.shared als Rückfall', async () => {
  // EINE Schablone mit `shared` als Ersatz-Modulkennung, nicht zwei
  // verschiedene. Kein Hilfetext trägt `agent` im Schlüsselnamen: der
  // Nutzen gilt dem Menschen, dass ein Agent denselben Satz liest, ist eine
  // Folge.
  assert.deepEqual(helpKeys('foo', 'actions.read.help'),
    ['modules.foo.actions.read.help', 'modules.shared.actions.read.help']);

  const own = { modules: { foo: { actions: { read: { help: 'eigen' } } } } };
  const shared = { modules: { shared: { actions: { read: { help: 'geteilt' } } } } };
  assert.equal(helpExists(own, 'foo', 'actions.read.help'), true);
  assert.equal(helpExists(shared, 'foo', 'actions.read.help'), true);
  assert.equal(helpExists({}, 'foo', 'actions.read.help'), false);
  // Und der leere Modulschlüssel verdeckt den geteilten NICHT.
  const emptyOwn = {
    modules: {
      foo: { actions: { read: { help: '' } } },
      shared: { actions: { read: { help: 'geteilt' } } },
    },
  };
  assert.equal(helpExists(emptyOwn, 'foo', 'actions.read.help'), true);
  assert.equal(helpExists({ modules: { foo: { actions: { read: { help: '' } } } } },
    'foo', 'actions.read.help'), false);
});

test('ein Feldschlüssel ist ein Objekt mit help, nicht eine Zeichenkette', async () => {
  // `lookup` gilt ein Nicht-String als nicht vorhanden. Ohne das `.help`-
  // Suffix fiele die Feldabdeckung von 18/18 auf 0/18 — und zwar lautlos.
  const tree = { modules: { foo: { fields: { problem: { help: 'der Satz' } } } } };
  assert.equal(lookup(tree, 'modules.foo.fields.problem.help'), 'der Satz');
  assert.equal(lookup(tree, 'modules.foo.fields.problem'), undefined);
});

test('countHelpCoverage: eine Lücke nennt BEIDE Kandidatenorte', async () => {
  const modules = {
    foo: { available: true, actions: { read: { params: [{ name: 'options' }] } }, fields: {} },
  };
  const out = countHelpCoverage(i18nFixture({ modules: { foo: { whenToUse: 'wann' } } }), modules);
  // Ein Autor, der nur den Modulschlüssel sähe, legte den Satz 72-mal an,
  // statt den geteilten zu füllen.
  assert.ok(out.missing.every(m => m.includes('modules.shared.')),
    `Lückenzeilen nennen den geteilten Ort nicht: ${out.missing.join(' | ')}`);
  assert.ok(out.missing.some(m => m.includes('modules.foo.actions.read.help')
    && m.includes('modules.shared.actions.read.help')));
  // `whenToUse` hat keinen zweiten Kandidaten und bleibt einteilig.
  const plain = countHelpCoverage(i18nFixture({ modules: { foo: {} } }), {
    foo: { available: true, actions: {}, fields: {} },
  });
  assert.deepEqual(plain.missing, ['de: modules.foo.whenToUse', 'en: modules.foo.whenToUse']);
});

test('countHelpCoverage: missingKeys zählt Schlüssel, missing zählt Sprachfälle', async () => {
  const modules = { foo: { available: true, actions: { read: { params: [] } }, fields: {} } };
  // Ein Schlüssel fehlt in beiden Sprachen, einer nur im Englischen.
  const out = countHelpCoverage(i18nFixture(
    { modules: { foo: { whenToUse: 'wann' } } },
    { modules: { foo: {} } },
  ), modules);
  assert.equal(out.missing.length, 3, 'zwei Sprachfälle für read.help, einer für whenToUse');
  assert.deepEqual(out.missingKeys.sort(),
    ['modules.foo.actions.read.help', 'modules.foo.whenToUse']);
});

test('countHelpCoverage zählt jede Typedef-Property einmal je Modul, verschachtelt', async () => {
  // `Params` hängt am Setter UND am Lesefeld — ein Satz, also einmal gezählt.
  const params = { alpha: { type: 'string' }, k1: { type: 'string' } };
  const modules = {
    foo: {
      available: true,
      actions: { setParam: { params: [], keysOf: 'Params', keys: params } },
      fields: {
        params: { keysOf: 'Params', keys: params },
        result: { keysOf: 'Result', keys: {
          Cg: { type: 'number' },
          biasTest: { type: 'BiasTest', keysOf: 'BiasTest', keys: { p: { type: 'number' } } },
        } },
      },
    },
  };
  const tree = { modules: { foo: {
    whenToUse: 'w',
    actions: { setParam: { help: 's' } },
    fields: { params: { help: 'p' }, result: { help: 'r' } },
    types: { Params: { alpha: 'Das Niveau.' }, Result: { Cg: 'Die Fähigkeit.', biasTest: 'Der Test.' } },
  } } };
  const out = countHelpCoverage(i18nFixture(tree), modules);
  assert.deepEqual(out.keys, { total: 5, covered: 3 });
  assert.deepEqual(out.missingKeys.filter(k => k.includes('.types.')).sort(),
    ['modules.foo.types.BiasTest.p', 'modules.foo.types.Params.k1']);
});

test('typedefHelpSuffixes: jede Typedef-Property eines Eintrags genau einmal', async () => {
  const entry = {
    actions: { setParam: { keysOf: 'Params', keys: { a: {} } } },
    fields: { params: { keysOf: 'Params', keys: { a: {} } },
      result: { keysOf: 'Result', keys: { t: { keysOf: 'T', keys: { x: {} } } } } },
  };
  assert.deepEqual(typedefHelpSuffixes(entry), ['types.Params.a', 'types.Result.t', 'types.T.x']);
});

test('STRUCTURE_JARGON: fängt Strukturschreibweise, lässt Fachsprache durch', async () => {
  for (const bad of ['als { instanceId, sheetId, columnId }', 'oder null', 'die Schlüssel aus activeParams für setParam',
    'ruft read() auf', 'returns null when empty', 'Werte wie [1, 2]', 'der `value`-Slot', 'Spalte über columnId']) {
    assert.ok(STRUCTURE_JARGON.test(bad), bad);
  }
  for (const good of ['Der Sollwert des Referenzteils.', 'Anteil der Toleranz (k₁), üblich 0,2.',
    'Nullhypothese und nullbasierte Zählung', 'Untere Spezifikationsgrenze (USG/LSL).', 'Cg ≥ 1,33 gilt als fähig.',
    'Compared with the null deviance it shows how much the predictors explain.',
    'Under the null hypothesis the mean is zero.']) {
    assert.ok(!STRUCTURE_JARGON.test(good), good);
  }
});

test('countHelpCoverage: eine Aktion eines Teil-Viewmodels liest ihren Satz aus dem verschachtelten Baum', async () => {
  const root = i18nFixture({
    modules: { sb: {
      whenToUse: 'wann',
      actions: { draft: { addQuestion: { help: 'Frage anlegen', params: { text: 'Fragetext' } } } },
    } },
  });
  const out = countHelpCoverage(root, {
    sb: { available: true, actions: { 'draft.addQuestion': { params: [{ name: 'text' }] } }, fields: {} },
  });
  assert.deepEqual(out.actions, { total: 1, covered: 1 });
  assert.deepEqual(out.params, { total: 1, covered: 1 });
  assert.deepEqual(out.missing, []);
});

test('viaHelpGaps: jede [via]-Aktion steht in der Feldhilfe beider Sprachen', async () => {
  const modules = { m: { available: true, fields: { f: { via: ['go', 'stop'] } } } };
  const dir = mkdtempSync(join(tmpdir(), 'via-'));
  mkdirSync(join(dir, 'i18n'));
  writeFileSync(join(dir, 'i18n', 'de.json'), JSON.stringify({ modules: { m: { fields: { f: { help: 'mit go() und stop()' } } } } }));
  writeFileSync(join(dir, 'i18n', 'en.json'), JSON.stringify({ modules: { m: { fields: { f: { help: 'via go()' } } } } }));
  assert.deepEqual(viaHelpGaps(dir, modules), ['en: modules.m.fields.f.help nennt stop nicht']);
});

test('viaHelpGaps: der echte Baum hat keine Lücken', async () => {
  const { modules } = await collectAgentData(APP_DIR);
  assert.deepEqual(viaHelpGaps(APP_DIR, modules), []);
});

test('fieldsWithoutWritePath: weder zugewiesen noch [via] heißt ohne Schreibweg', async () => {
  const modules = { m: { available: true, fields: { a: {}, b: { via: ['go'] }, c: {} } },
                    n: { available: false, fields: { z: {} } } };
  assert.deepEqual(fieldsWithoutWritePath(modules, { m: ['c'], n: [] }), { model: ['m.a'], derived: [] });
});

test('fieldsWithoutWritePath: erklärte (derived) Felder zählen getrennt von Model-Feldern', async () => {
  const modules = { m: { available: true, fields: { a: {}, d: { derived: true }, e: { derived: true, via: ['go'] } } } };
  assert.deepEqual(fieldsWithoutWritePath(modules, { m: [] }), { model: ['m.a'], derived: ['m.d'] });
});

test('viaHelpGaps: ein gewöhnliches Wort ist keine Nennung der Aktion', async () => {
  const modules = { m: { available: true, fields: { f: { via: ['back'] } } } };
  const dir = mkdtempSync(join(tmpdir(), 'via-'));
  mkdirSync(join(dir, 'i18n'));
  writeFileSync(join(dir, 'i18n', 'de.json'), JSON.stringify({ modules: { m: { fields: { f: { help: 'zurück mit back() möglich' } } } } }));
  writeFileSync(join(dir, 'i18n', 'en.json'), JSON.stringify({ modules: { m: { fields: { f: { help: 'go back one step' } } } } }));
  assert.deepEqual(viaHelpGaps(dir, modules), ['en: modules.m.fields.f.help nennt back nicht']);
});

test('viaHelpGaps: Aktionsnamen mit $ oder Punkt brechen den Abgleich nicht', async () => {
  const modules = { m: { available: true, fields: { f: { via: ['part.add$x'] } } } };
  const dir = mkdtempSync(join(tmpdir(), 'via-'));
  mkdirSync(join(dir, 'i18n'));
  for (const l of ['de', 'en']) writeFileSync(join(dir, 'i18n', `${l}.json`), JSON.stringify({ modules: { m: { fields: { f: { help: 'mit part.add$x() geht es' } } } } }));
  assert.deepEqual(viaHelpGaps(dir, modules), []);
});

/** Temp-App mit alter i18n und einem Modul `neu` in neuer Form. */
function newFormFixture({ ui = true, ctx = true } = {}) {
  const root = i18nFixture({ modules: { foo: { name: 'Foo' } } });
  const dir = join(root, 'js', 'modules', 'neu', 'resources', 'i18n');
  mkdirSync(dir, { recursive: true });
  for (const lang of ['de', 'en']) {
    if (ui) writeFileSync(join(dir, `ui.${lang}.json`), JSON.stringify({ $schema: 'x', name: 'Neu', description: 'Kurz', whenToUse: `Wann ${lang}` }));
    if (ctx) writeFileSync(join(dir, `context-help.${lang}.json`), JSON.stringify({ $schema: 'x', fields: { problem: { help: `Problem ${lang}` } },
      actions: { read: { help: 'Liest.' }, setProblem: { help: 'Setzt.', params: { text: 'Text.' } } } }));
  }
  return root;
}

const NEU = { neu: { available: true, actions: { read: { params: [] }, setProblem: { params: [{ name: 'text' }] } }, fields: { problem: {} } } };

test('readHelpTables mischt ui und context-help umgestellter Module ein, ohne $schema', async () => {
  const tables = readHelpTables(newFormFixture(), ['neu']);
  assert.equal(tables.de.modules.neu.whenToUse, 'Wann de');
  assert.equal(tables.en.modules.neu.fields.problem.help, 'Problem en');
  assert.equal('$schema' in tables.de.modules.neu, false);
  assert.equal(tables.de.modules.foo.name, 'Foo', 'alte Form bleibt');
});

test('readHelpTables mischt tief wie die Laufzeit: Altbestand und context-help behalten beide', async () => {
  const root = i18nFixture({ modules: { neu: { fields: { a: { help: 'alt a' } } } } });
  const dir = join(root, 'js', 'modules', 'neu', 'resources', 'i18n');
  mkdirSync(dir, { recursive: true });
  for (const lang of ['de', 'en']) writeFileSync(join(dir, `context-help.${lang}.json`), JSON.stringify({ fields: { b: { help: 'neu b' } } }));
  const { de } = readHelpTables(root, ['neu']);
  assert.equal(de.modules.neu.fields.a.help, 'alt a');
  assert.equal(de.modules.neu.fields.b.help, 'neu b');
});

test('countHelpCoverage zählt die Kontexthilfe eines umgestellten Moduls aus seinen Dateien', async () => {
  const out = countHelpCoverage(newFormFixture(), NEU, ['neu']);
  assert.deepEqual(out.missing, []);
  assert.deepEqual([out.whenToUse.covered, out.actions.covered, out.params.covered, out.fields.covered], [1, 2, 1, 1]);
});

test('countHelpCoverage: fehlende context-help-Datei ist eine Lücke, kein Absturz', async () => {
  const out = countHelpCoverage(newFormFixture({ ctx: false }), NEU, ['neu']);
  assert.equal(out.whenToUse.covered, 1);
  assert.ok(out.missing.some((m) => m.startsWith('de: modules.neu.fields.problem.help')), out.missing.join('\n'));
});

test('ohne umgestellte Module: nur i18n/<lang>.json', async () => {
  const out = countHelpCoverage(newFormFixture(), NEU, []);
  assert.equal(out.whenToUse.covered, 0);
});

/* Ein umgestelltes Modul im Wegwerf-Verzeichnis: das Modell importiert
   core/model.js über die file://-URL der echten Datei. */
const CORE_MODEL_URL = pathToFileURL(join(import.meta.dirname, '..', '..', 'js', 'core', 'model.js')).href;

/** @param {object} help context-help-Baum (beide Sprachen) */
function convertedFixture(help) {
  const root = i18nFixture({});
  const dir = join(root, 'js', 'modules', 'demo');
  mkdirSync(join(dir, 'domain'), { recursive: true });
  mkdirSync(join(dir, 'viewmodel'), { recursive: true });
  mkdirSync(join(dir, 'resources', 'i18n'), { recursive: true });
  writeFileSync(join(dir, 'domain', 'model.js'), `import { defineModel, command, text, boolean } from '${CORE_MODEL_URL}';
export const State = defineModel({
  fields: { title: text() },
  commands: { rename: command({ params: { title: text() }, returns: boolean(), run({ title }) { this.title = title; return true; } }) },
});
`);
  writeFileSync(join(dir, 'viewmodel', 'viewmodel.js'),
    "export default createModule({ commands: { reset: command({ params: {}, run() {} }) } });\n");
  for (const lang of ['de', 'en']) {
    writeFileSync(join(dir, 'resources', 'i18n', `ui.${lang}.json`), JSON.stringify({ whenToUse: 'wann' }));
    writeFileSync(join(dir, 'resources', 'i18n', `context-help.${lang}.json`), JSON.stringify(help));
  }
  return root;
}

test('countHelpCoverage zählt die Aktionen, Parameter und Schlüssel eines umgestellten Moduls', async () => {
  const root = convertedFixture({
    fields: { title: { help: 't' } },
    actions: {
      read: { help: 'r', params: { options: 'o' } },
      rename: { help: 'n', params: { command: 'c', title: 't' } },
      reset: { params: { command: 'c' } },
    },
  });
  const { modules } = await collectAgentData(root, { converted: ['demo'] });
  const out = countHelpCoverage(root, modules, ['demo']);
  assert.deepEqual(out.missingKeys, ['modules.demo.actions.reset.help']);
  assert.deepEqual(out.actions, { total: 3, covered: 2 });
  assert.deepEqual(out.params, { total: 3, covered: 3 });
  assert.deepEqual(out.keys, { total: 1, covered: 1 });
  assert.deepEqual(out.fields, { total: 1, covered: 1 });
});

test('typedefHelpSuffixes: Erweiterung von datasets mit Satz unter fields.<feld>.<pfad>.help', async () => {
  const { defineModel, datasets, object, oneOf, number, columnRef } = await import('../../js/core/model.js');
  const { schemaAgentEntry } = await import('../../js/core/agent/agent-schema.js');
  const ext = object({
    mode: oneOf(['none', 'constant']),
    constant: object({ yPlus: number({ optional: true }) }, { optional: true }),
  }, { variantKey: 'mode' });
  const M = defineModel({ fields: { datasets: datasets({ x: columnRef() }, { extension: object({ errorBars: ext }) }) } });
  assert.deepEqual(typedefHelpSuffixes({ fields: schemaAgentEntry(M).fields }), [
    'fields.datasets.errorBars.constant.help', 'fields.datasets.errorBars.constant.yPlus.help',
    'fields.datasets.errorBars.help', 'fields.datasets.errorBars.mode.help', 'fields.datasets.x.help',
  ]);
  const P = defineModel({ fields: { datasets: datasets({ x: columnRef() }) } });
  assert.deepEqual(typedefHelpSuffixes({ fields: schemaAgentEntry(P).fields }), []);
});
