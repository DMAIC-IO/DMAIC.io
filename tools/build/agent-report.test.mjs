import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countHelpCoverage, lookup, helpExists, helpKeys } from './agent-report.mjs';

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

test('countHelpCoverage counts only released modules', () => {
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

test('countHelpCoverage names every gap, per language', () => {
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

test('countHelpCoverage treats a key present in only ONE language as missing', () => {
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
test('countHelpCoverage honours the shared fallback modules.shared.<suffix>', () => {
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

test('countHelpCoverage does NOT apply a shared fallback to whenToUse', () => {
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
test('countHelpCoverage counts an empty string as a gap, not as coverage', () => {
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
test('countHelpCoverage survives an absent subtree and a string intermediate segment', () => {
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
   Hier wird NICHT „alles muss 100 % sein" zugesichert — Spec §8 Regel 2 sagt
   ausdrücklich, dass eine fehlende Kontexthilfe eine ausgewiesene Lücke ist
   und nicht blockiert; das harte i18n-Tor der freigegebenen Module steht in
   `agent-data.test.mjs`. Zugesichert wird, dass die Zahl die echte
   Auflösungskette benutzt: `five-why` hat über das geteilte `read()` den
   Parameter `options`, aber keinen modulspezifischen Schlüssel dafür. Ohne
   den geteilten Rückfall wiese der Report hier eine Phantomlücke aus. */
test('countHelpCoverage resolves the real tree through the documented chain', async () => {
  const { collectAgentData } = await import('./agent-data.mjs');
  const { APP_DIR } = await import('./build.mjs');
  const { modules } = collectAgentData(APP_DIR);
  const out = countHelpCoverage(APP_DIR, modules);
  assert.ok(out.actions.total > 0, 'kein freigegebenes Modul — die Zahl prüfte nichts');
  assert.ok(modules['five-why']?.actions?.read?.params?.some(p => p.name === 'options'),
    'five-why.read hat den Parameter options nicht mehr — dieser Fall prüft nichts');
  assert.deepEqual(
    out.missing.filter(m => m.includes('five-why.actions.read.params.options')),
    [],
  );
});

/* ── Die geteilte Auflösung ────────────────────────────────────────────────
   `lookup` und `helpExists` sind exportiert, weil das i18n-Tor in
   `agent-data.test.mjs` dieselbe Kette braucht. Sie werden deshalb HIER
   direkt festgenagelt — und nur hier, statt den Fall in beiden Dateien zu
   wiederholen. Der leere String ist der Fall, den der echte Baum nicht
   hergibt (dort ist kein Schlüssel leer), der aber beide Verbraucher
   betrifft. */

test('lookup: leerer und nur aus Leerzeichen bestehender Wert gilt als nicht vorhanden', () => {
  const tree = { a: { voll: 'text', leer: '', blank: '   \n ' } };
  assert.equal(lookup(tree, 'a.voll'), 'text');
  assert.equal(lookup(tree, 'a.leer'), undefined);
  assert.equal(lookup(tree, 'a.blank'), undefined);
});

test('lookup: bricht an einem Nicht-Objekt ab, statt String-Eigenschaften zu finden', () => {
  const tree = { a: 'kein Objekt' };
  assert.equal(lookup(tree, 'a.length'), undefined);
  assert.equal(lookup(tree, 'a.b.c'), undefined);
  assert.equal(lookup(tree, 'fehlt.ganz'), undefined);
  assert.equal(lookup({ a: { b: 5 } }, 'a.b'), undefined, 'eine Zahl ist kein Hilfetext');
});

test('helpKeys / helpExists: Modulschlüssel zuerst, modules.shared als Rückfall', () => {
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

test('ein Feldschlüssel ist ein Objekt mit help, nicht eine Zeichenkette', () => {
  // `lookup` gilt ein Nicht-String als nicht vorhanden. Ohne das `.help`-
  // Suffix fiele die Feldabdeckung von 18/18 auf 0/18 — und zwar lautlos.
  const tree = { modules: { foo: { fields: { problem: { help: 'der Satz' } } } } };
  assert.equal(lookup(tree, 'modules.foo.fields.problem.help'), 'der Satz');
  assert.equal(lookup(tree, 'modules.foo.fields.problem'), undefined);
});

test('countHelpCoverage: eine Lücke nennt BEIDE Kandidatenorte', () => {
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

test('countHelpCoverage: missingKeys zählt Schlüssel, missing zählt Sprachfälle', () => {
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
