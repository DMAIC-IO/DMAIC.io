/**
 * Activity-Flowchart: JSON-Export (io/export.js) gegen die Byte-Fixture der
 * Altform (`legacy-export.json`, Instanz a des Altprojekts). Zeichengleich nach
 * den gebilligten Abweichungen: fremder Schrittschlüssel entfällt (A8), Ziele
 * auf die eigene oder eine unbekannte id werden `end` (A9), feste
 * Schlüsselfolge mit `branchId` an jedem Schritt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';
import { toJsonTree } from '../../../js/modules/activity-flowchart/io/export.js';

async function fetchText(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  // `res.text()` verschluckt im Browser die BOM; dort entscheiden die Bytes
  // (der Node-Stub von run-node.mjs liefert nur text(), mit BOM).
  if (typeof res.arrayBuffer !== 'function') return res.text();
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const ORDER = ['id', 'title', 'description', 'kind', 'decision', 'branchId', 'expanded', 'substeps'];

suite('Activity-Flowchart JSON-Export', () => {
  test('Altform zeichengleich mit der Byte-Fixture bis auf A8/A9 und die Schlüsselfolge', async () => {
    const raw = await fetchText('./legacy-export.json');
    assertTrue(raw.startsWith('﻿'), 'die Altform schrieb eine BOM');
    const legacy = raw.replace(/^\uFEFF/, '');
    const parsed = JSON.parse(legacy);
    assertEqual(JSON.stringify(parsed, null, 2), legacy, 'Fixture: Einrückung 2, kein Zeilenende');
    const want = {
      steps: parsed.steps.map((s) => {
        const out = Object.fromEntries(ORDER.map((k) => [k, s[k]]));
        if (out.decision && (out.decision.noTarget === s.id || !parsed.steps.some((x) => x.id === out.decision.noTarget))) {
          if (out.decision.noTarget !== 'end') out.decision = { ...out.decision, noTarget: 'end' };
        }
        return out;
      }),
    };
    const fx = JSON.parse(await fetchText('./legacy-project.json'));
    const m = State.fromJSON(plain(Object.values(fx.moduleStates)[0]));
    assertEqual(JSON.stringify(toJsonTree(m), null, 2), JSON.stringify(want, null, 2));
  });

  test('Schlüsselfolge, expanded aus dem Ansichtsfeld, ohne _schema und Bänder', () => {
    const m = State.fromJSON({ steps: [{ id: 'D', kind: 'decision', decision: { label: 'Q', noTarget: 'end' }, substeps: [{ id: 'x', title: 'X' }] }] });
    m.setExpanded({ id: 'D', expanded: true });
    const out = toJsonTree(m);
    assertDeepEqual(Object.keys(out), ['steps']);
    assertDeepEqual(Object.keys(out.steps[0]), ORDER);
    assertEqual(out.steps[0].expanded, true);
    assertDeepEqual(out.steps[0].decision, { label: 'Q', noTarget: 'end' });
  });

  test('der Baum ist eine Kopie', () => {
    const m = State.fromJSON({ steps: [{ id: 'a', title: 'A', substeps: [{ id: 'x', title: 'X' }] }] });
    const out = toJsonTree(m);
    out.steps[0].substeps[0].title = 'geändert';
    assertTrue(m.steps[0].substeps[0].title === 'X');
  });
});
