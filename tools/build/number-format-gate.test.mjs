import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { countNumberFormatHits, checkNumberFormat } from './number-format-gate.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { APP_DIR } from './build.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'nfgate-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

test('neue Datei mit toFixed( ist ein Fehler', () => {
  const dir = fixture({ 'js/modules/neu/a.js': 'const s = x.toFixed(2);\n' });
  const { errors } = checkNumberFormat(countNumberFormatHits(dir), {}, []);
  assert.equal(errors.length, 1);
});

test('Datei unter Baseline: kein Fehler; darüber: Fehler', () => {
  const dir = fixture({ 'js/widgets/w.js': 'a.toFixed(1); parseFloat(b);\n' });
  const hits = countNumberFormatHits(dir);
  assert.equal(hits.get('js/widgets/w.js'), 2);
  assert.deepEqual(checkNumberFormat(hits, { 'js/widgets/w.js': { count: 3 } }, []).errors, []);
  assert.equal(checkNumberFormat(hits, { 'js/widgets/w.js': { count: 1 } }, []).errors.length, 1);
});

test('Kommentare, number-format.js, min und vendor zählen nicht; type="number" in html zählt', () => {
  const dir = fixture({
    'js/modules/m/a.js': '// x.toFixed(2)\n * parseFloat(y)\n',
    'js/core/number-format.js': 'x.toFixed(2)\n',
    'js/core/a.min.js': 'x.toFixed(2)\n',
    'js/core/vendor/v.js': 'x.toFixed(2)\n',
    'js/modules/m/t.html': '<input type="number">\n',
  });
  assert.deepEqual([...countNumberFormatHits(dir)], [['js/modules/m/t.html', 1]]);
});

test('Eintrag eines umgestellten Moduls ohne reason ist ein Fehler', () => {
  const hits = new Map([['js/modules/sipoc/a.js', 1]]);
  const bl = { 'js/modules/sipoc/a.js': { count: 1 } };
  assert.equal(checkNumberFormat(hits, bl, ['sipoc']).errors.length, 1);
  bl['js/modules/sipoc/a.js'].reason = 'Rechenkontext';
  assert.deepEqual(checkNumberFormat(hits, bl, ['sipoc']).errors, []);
});

test('formatCurrency( ohne Intl ist kein Befund; Intl-Währungsformat bleibt Befund', () => {
  const ok = fixture({ 'js/modules/m/a.js': "import { formatCurrency } from '../../core/number-format.js';\nformatCurrency(1, 'EUR', 'de');\n" });
  assert.equal(countNumberFormatHits(ok).size, 0);
  const bad = fixture({ 'js/modules/m/b.js': "new Intl.NumberFormat('de', { style: 'currency', currency: 'EUR' });\n" });
  assert.equal(checkNumberFormat(countNumberFormatHits(bad), {}, []).errors.length, 1);
});

test('echter Baum entspricht der Baseline', () => {
  const baseline = JSON.parse(readFileSync(new URL('./number-format-baseline.json', import.meta.url), 'utf8'));
  const { errors } = checkNumberFormat(countNumberFormatHits(APP_DIR), baseline, CONVERTED_MODULES);
  assert.deepEqual(errors, []);
});
