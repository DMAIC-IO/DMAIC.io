/**
 * Wächter: `docs/AGENT-INTERFACE.md` nennt die Zahl der Fehlercodes, und
 * diese Zahl war nach einer Codeänderung falsch.
 *
 * Der Test friert die Zahl NICHT ein — der Vertrag erlaubt neue Codes
 * ausdrücklich (`docs/AGENT-INTERFACE.md`, Abschnitt „Vertragsversion").
 * Er verlangt nur, dass Dokument und `ERRORS` dieselbe Zahl nennen. Ein
 * neuer Code bleibt also erlaubt und zwingt lediglich dazu, den Satz
 * mitzuziehen.
 *
 * Zwei Repos, ein Dateibaum: `docs/AGENT-INTERFACE.md` liegt im privaten
 * Repo (DMAIC-private), eine Ebene über `app/dev/`. In einem eigenständigen
 * Checkout des öffentlichen App-Repos (DMAIC.io.git) — z. B. im Nightly/
 * Release-Workflow — existiert dieser Pfad nicht, weil das private Repo dort
 * nicht als Elternverzeichnis vorhanden ist. Darum SKIP statt FAIL, wenn das
 * Dokument fehlt: `npm run test:build` darf im öffentlichen Checkout nicht
 * rot werden, nur weil eine private Doku nicht erreichbar ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_DIR = path.resolve(new URL('../..', import.meta.url).pathname);
const DOC = path.resolve(APP_DIR, '../../docs/AGENT-INTERFACE.md');
const docMissing = !existsSync(DOC);
const skip = docMissing
  ? 'docs/AGENT-INTERFACE.md nicht erreichbar — eigenständiges App-Repo-Checkout ohne das private Elternrepo'
  : false;

test('AGENT-INTERFACE.md nennt genau so viele Fehlercodes, wie ERRORS führt', { skip }, async () => {
  const { ERRORS } = await import(
    pathToFileURL(path.join(APP_DIR, 'js/core/agent/agent-contract.js')).href
  );
  const doc = readFileSync(DOC, 'utf8');

  const match = doc.match(/kennt heute (\d+)\s*\n?\s*Fehlercodes/);
  assert.ok(match, 'der Satz „kennt heute N Fehlercodes" steht nicht mehr im Dokument — ' +
    'wurde er umformuliert, muss dieser Wächter mitwandern');
  assert.equal(
    Number(match[1]), Object.keys(ERRORS).length,
    `Dokument sagt ${match[1]}, ERRORS führt ${Object.keys(ERRORS).length}`,
  );
});

test('AGENT-INTERFACE.md erklärt die Nullable-Form der Shape-Grammatik', { skip }, () => {
  const doc = readFileSync(DOC, 'utf8');
  assert.match(doc, /\$nullable/,
    'die Grammatik kennt { $nullable: … } seit der Vertragsrunde, das Dokument nennt sie nicht');
});

test('AGENT-INTERFACE.md nennt beide Arten des Umfangs-Deskriptors', { skip }, () => {
  const doc = readFileSync(DOC, 'utf8');
  assert.match(doc, /kind: 'tree'|kind: "tree"/,
    'der Deskriptor hat seit der Feldrunde ein kind, und tree ist die zweite Art');
  assert.match(doc, /nodeCount/,
    'ein Baum-Deskriptor meldet nodeCount und depth, nicht rowCount und columns');
});
