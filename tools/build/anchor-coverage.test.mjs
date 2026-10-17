import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCaptions, countAnchorCoverage } from './anchor-coverage.mjs';

test('scanCaptions: Label, KPI-Beschriftung und Kopfzelle, je mit und ohne Anker', () => {
  const html = `
    <label data-help-key="modules.foo.types.Params.a" x-text="t('a')"></label>
    <label x-text="t('b')"></label>
    <div class="dmike-kpi-label" data-help-key="modules.foo.types.Result.x">X</div>
    <div class="dmike-kpi-label big">Y</div>
    <th><span :data-help-key="col.help" x-text="col.label"></span></th>
    <th>n</th>
    <th></th>`;
  const out = scanCaptions(html).map(c => [c.kind, c.anchored]);
  assert.deepEqual(out, [
    ['label', true], ['label', false],
    ['th', true], ['th', false],
    ['kpi', true], ['kpi', false],
  ]);
});

test('scanCaptions: Ausschnitt mit Inhalt und Zeilennummer unterscheidet gleiche öffnende Tags', () => {
  const html = '<table>\n  <th>n</th>\n  <th>\n    MW\n  </th>\n</table>';
  assert.deepEqual(scanCaptions(html).map(c => [c.snippet, c.line]), [
    ['<th>n</th>', 2], ['<th>MW</th>', 3],
  ]);
});

test('scanCaptions: langer Inhalt wird gekappt', () => {
  const [c] = scanCaptions(`<label>${'x'.repeat(300)}</label>`);
  assert.equal(c.snippet.length, 120);
  assert.ok(c.snippet.endsWith('…'));
});

test('scanCaptions: KPI-Beschriftung mit Anker im Inhalt zählt als verankert', () => {
  const html = '<div class="dmike-kpi-label"><span data-help-key="k">X</span></div>';
  assert.deepEqual(scanCaptions(html).map(c => [c.kind, c.anchored, c.snippet]), [
    ['kpi', true, '<div class="dmike-kpi-label"><span data-help-key="k">X</span></div>'],
  ]);
});

test('scanCaptions: ein Label, das nur sein Kontrollkästchen umschließt und keinen Text hat, zählt nicht', () => {
  assert.deepEqual(scanCaptions('<label><input type="checkbox"></label>'), []);
});

function appWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-cov-'));
  for (const [id, html] of Object.entries(files)) {
    mkdirSync(join(dir, 'js', 'modules', id), { recursive: true });
    writeFileSync(join(dir, 'js', 'modules', id, `${id}.html`), html);
  }
  return dir;
}

test('countAnchorCoverage: nur freigegebene Module, Ausnahmen zählen mit Grund als abgedeckt', () => {
  const dir = appWith({
    foo: '<label data-help-key="k">A</label><label x-text="t(\'b\')"></label><label x-text="t(\'c\')"></label>',
    bar: '<label>nicht freigegeben</label>',
  });
  const modules = { foo: { available: true }, bar: { available: false } };
  const exemptions = { foo: [{ match: "t('c')", reason: 'Fließtext' }] };
  const out = countAnchorCoverage(dir, modules, exemptions);
  assert.equal(out.total, 3);
  assert.equal(out.covered, 2);
  assert.equal(out.exempt, 1);
  assert.equal(out.missing.length, 1);
  assert.equal(out.missing[0], 'foo: foo.html:1: <label x-text="t(\'b\')"></label>');
  assert.deepEqual(out.staleExemptions, []);
});

test('countAnchorCoverage: eine Ausnahme ohne Treffer wird als veraltet gemeldet', () => {
  const dir = appWith({ foo: '<label data-help-key="k">A</label>' });
  const out = countAnchorCoverage(dir, { foo: { available: true } },
    { foo: [{ match: 'gibt es nicht', reason: 'x' }] });
  assert.deepEqual(out.staleExemptions, ['foo: gibt es nicht']);
});

test('countAnchorCoverage: eine Ausnahme ohne Grund ist ein Fehler', () => {
  const dir = appWith({ foo: '<label>A</label>' });
  assert.throws(() => countAnchorCoverage(dir, { foo: { available: true } },
    { foo: [{ match: 'label', reason: '' }] }), /Grund/);
});

test('countAnchorCoverage: Ausnahme auf Inhalt trifft nur die gemeinte Kopfzelle', () => {
  const dir = appWith({ foo: '<th>n</th><th>MW</th>' });
  const out = countAnchorCoverage(dir, { foo: { available: true } },
    { foo: [{ match: '<th>n</th>', reason: 'Stichprobenumfang je Zeile' }] });
  assert.equal(out.exempt, 1);
  assert.deepEqual(out.missing, ['foo: foo.html:1: <th>MW</th>']);
});

test('countAnchorCoverage: count meldet abweichende Trefferzahl, passende nicht', () => {
  const dir = appWith({ foo: '<th>n</th><th>n</th><th>s</th>' });
  const out = countAnchorCoverage(dir, { foo: { available: true } }, {
    foo: [
      { match: '<th>n</th>', reason: 'je Zeile', count: 3 },
      { match: '<th>s</th>', reason: 'je Zeile', count: 1 },
    ],
  });
  assert.deepEqual(out.exemptionCountMismatches, ['foo: <th>n</th>: erwartet 3, gefunden 2']);
  assert.deepEqual(out.staleExemptions, []);
});

test('countAnchorCoverage: freigegebenes Modul ohne Ordner wird übersprungen', () => {
  const dir = appWith({ foo: '<label>A</label>' });
  const out = countAnchorCoverage(dir, { foo: { available: true }, ghost: { available: true } }, {});
  assert.equal(out.total, 1);
});
