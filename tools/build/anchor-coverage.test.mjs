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
  assert.match(out.missing[0], /^foo: foo\.html: <label x-text="t\('b'\)">/);
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
