/**
 * Wächter: `reference/agent-interface.md` nennt die Zahl der Fehlercodes,
 * und diese Zahl war nach einer Codeänderung falsch.
 *
 * Der Test friert die Zahl NICHT ein — der Vertrag erlaubt neue Codes
 * ausdrücklich (`reference/agent-interface.md`, Abschnitt „Vertragsversion").
 * Er verlangt nur, dass Dokument und `ERRORS` dieselbe Zahl nennen. Ein
 * neuer Code bleibt also erlaubt und zwingt lediglich dazu, den Satz
 * mitzuziehen.
 *
 * Das Dokument liegt im App-Repo, neben dem Code, den es beschreibt. Fehlt
 * es, ist das ein Fehler und kein Skip: der Vertrag von
 * `window.qprovement.interact` gehört zur App und muss in jedem Checkout
 * prüfbar sein.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_DIR = path.resolve(new URL('../..', import.meta.url).pathname);
const DOC = path.join(APP_DIR, 'reference/agent-interface.md');

/** @returns {string} der Inhalt des Vertragsdokuments; wirft, wenn es fehlt */
function readDoc() {
  return readFileSync(DOC, 'utf8');
}

test('agent-interface.md nennt genau so viele Fehlercodes, wie ERRORS führt', async () => {
  const { ERRORS } = await import(
    pathToFileURL(path.join(APP_DIR, 'js/core/agent/agent-contract.js')).href
  );
  const doc = readDoc();

  const match = doc.match(/kennt heute (\d+)\s*\n?\s*Fehlercodes/);
  assert.ok(match, 'der Satz „kennt heute N Fehlercodes" steht nicht mehr im Dokument — ' +
    'wurde er umformuliert, muss dieser Wächter mitwandern');
  assert.equal(
    Number(match[1]), Object.keys(ERRORS).length,
    `Dokument sagt ${match[1]}, ERRORS führt ${Object.keys(ERRORS).length}`,
  );
});

test('agent-interface.md führt jeden Fehlercode aus ERRORS auf', async () => {
  const { ERRORS } = await import(
    pathToFileURL(path.join(APP_DIR, 'js/core/agent/agent-contract.js')).href
  );
  const doc = readDoc();
  const missing = Object.values(ERRORS).filter(code => !doc.includes(`\`${code}\``));
  assert.deepEqual(missing, [], `im Dokument fehlen die Codes: ${missing.join(', ')}`);
});

test('agent-interface.md erklärt die Nullable-Form der Shape-Grammatik', () => {
  const doc = readDoc();
  assert.match(doc, /\$nullable/,
    'die Grammatik kennt { $nullable: … } seit der Vertragsrunde, das Dokument nennt sie nicht');
});

test('agent-interface.md nennt beide Arten des Umfangs-Deskriptors', () => {
  const doc = readDoc();
  assert.match(doc, /kind: 'tree'|kind: "tree"/,
    'der Deskriptor hat seit der Feldrunde ein kind, und tree ist die zweite Art');
  assert.match(doc, /nodeCount/,
    'ein Baum-Deskriptor meldet nodeCount und depth, nicht rowCount und columns');
});
