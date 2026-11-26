/**
 * Tests for modules/stakeholder-analysis/domain/migrations.js — '0→1.0' nur
 * die Form, '1.0→1.1' jeder Fall des alten `Stakeholder.fromJSON`: Texte,
 * Stufen wie `clampLevel`, Haltung und Kategorie wörtlich oder Vorgabe,
 * fremde Schlüssel und Nicht-Objekte entfallen, ids fest aus der Position
 * und mit `_` bei Kollision und Doppelten. Dazu die goldenen Fixtures, das
 * Altprojekt aus den E2E-Fixtures und beide Beispiele ohne `_schema`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { from0, from1_0 } from '../../../js/modules/stakeholder-analysis/domain/migrations.js';
import { State } from '../../../js/modules/stakeholder-analysis/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'stakeholder-analysis');

const SCHEMA = { _schema: { name: 'stakeholder-analysis', version: '1.1' } };
const V1_0 = { name: 'stakeholder-analysis', version: '1.0' };
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);
const EXAMPLES = new URL('../../../js/modules/stakeholder-analysis/resources/examples/projects/', import.meta.url);
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {URL} url @returns {Promise<any>} */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Lesefläche ohne Mount, alle Zeilen. @param {object} m */
function read(m) {
  const entry = schemaAgentEntry(State);
  return readSchemaModel(entry, m, { fields: ['stakeholders', 'quadrants'] }, evaluateDerived(m, /** @type {any} */ (undefined)));
}

/** Ein Eintrag in Normalform. @param {object} e */
const entry = (e) => ({ id: '', name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '', ...e });

/** Alle Zustände von stakeholder-analysis in einer Exportdatei (auch verschachtelt). */
function stakeholderStates(v, acc = []) {
  if (Array.isArray(v)) v.forEach((x) => stakeholderStates(x, acc));
  else if (v && typeof v === 'object') {
    if (v.phases && v.moduleStates) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'stakeholder-analysis') acc.push(v.moduleStates[e.instanceId] ?? e.state);
        }
      }
    } else if (v.phases) {
      for (const list of Object.values(v.phases)) {
        for (const e of Array.isArray(list) ? list : []) {
          if (e?.moduleId === 'stakeholder-analysis' && e.state) acc.push(e.state);
        }
      }
    }
    Object.values(v).forEach((x) => stakeholderStates(x, acc));
  }
  return acc;
}

/** Instanz (a) der E2E-Fixture `stakeholder-analysis/legacy-project.json` (ohne `_schema`). */
const LEGACY_A = {
  stakeholders: [
    { id: 's1', name: 'Werksleitung', power: 5, interest: 4, category: 'manage-closely', notes: 'Sponsor' },
    { id: 's2', name: 'Qualitätsprüfung Öl & Späne', power: 3, interest: 5, category: 'keep-informed', notes: 'Prüfplan „M3“ abstimmen' },
    { id: 's3', name: 'Betriebsrat', power: 4, interest: 2, category: 'keep-satisfied', notes: '' },
  ],
};
/** Instanz (b) derselben Fixture (`_schema` '1.0'). */
const LEGACY_B = {
  _schema: V1_0,
  stakeholders: [
    { name: 'Lieferant Müller GmbH', role: 'Zulieferer', power: 7, interest: '4', support: '', category: 'extern', notes: 'Liefertermine wöchentlich abstimmen' },
    { id: 'b2', name: 'Einkauf', role: 'Strategischer Einkauf', power: 2, interest: 2, support: 'resistor', category: 'Sponsor', notes: '' },
    { id: 'b3', name: 'Kundenservice', role: '', power: '4.7', interest: 5, support: 'critic', category: 'kunde', notes: 'Beschwerden bündeln' },
  ],
};

suite('stakeholder-analysis Migration — 0→1.0 (nur die Form)', () => {
  test('Liste bleibt unverändert, fremde Schlüssel oben entfallen', () => {
    const list = [{ id: 'x', foo: 1 }, 5, null];
    assertEqual(json(from0({ stakeholders: list, extra: true })), json({ stakeholders: list }));
  });
  test('ohne Liste, mit Nicht-Liste und für Nicht-Objekte: leere Liste', () => {
    for (const old of [{}, { stakeholders: 'oops' }, null, undefined, 5, []]) {
      assertEqual(json(from0(old)), json({ stakeholders: [] }), json(old));
    }
  });
});

suite('stakeholder-analysis Migration — 1.0→1.1 (wie Stakeholder.fromJSON)', () => {
  const one = (e) => from1_0({ stakeholders: [e] }).stakeholders;
  test('gültiger Eintrag bleibt wörtlich', () => {
    const e = entry({ id: 'i', name: 'Bob', role: 'r', power: 2, interest: 3, support: 'critic', category: 'kunde', notes: 'n' });
    assertEqual(json(one(e)), json([e]));
  });
  test('Texte: Nicht-Text wird leer', () => {
    assertEqual(json(one({ id: 'a', name: 5, role: null, notes: {} })), json([entry({ id: 'a' })]));
  });
  test('Stufen wie clampLevel: geklemmt, ganzzahliger Anteil, Zahltext, sonst 3', () => {
    const cases = [[0, 1], [99, 5], [7, 5], ['4', 4], ['4.7', 4], [4.7, 4], ['abc', 3], [null, 3], [undefined, 3], [true, 3], [-2, 1], ['2x', 2]];
    for (const [v, want] of cases) {
      assertEqual(one({ id: 'a', power: v })[0].power, want, `power ${json(v)}`);
      assertEqual(one({ id: 'a', interest: v })[0].interest, want, `interest ${json(v)}`);
    }
  });
  test('Haltung und Kategorie: nichtleerer Text wörtlich, sonst Vorgabe', () => {
    assertEqual(one({ id: 'a', support: 'resistor', category: 'Sponsor' })[0].support, 'resistor');
    assertEqual(one({ id: 'a', support: 'resistor', category: 'Sponsor' })[0].category, 'Sponsor');
    assertEqual(one({ id: 'a', category: 'manage-closely' })[0].category, 'manage-closely');
    for (const v of ['', 42, null, undefined]) {
      assertEqual(one({ id: 'a', support: v })[0].support, 'neutral', json(v));
      assertEqual(one({ id: 'a', category: v })[0].category, 'intern', json(v));
    }
  });
  test('fremde Schlüssel entfallen, Reihenfolge der Schlüssel fest', () => {
    assertDeepEqual(Object.keys(one({ foo: 1, notes: 'x', id: 'a', quadrant: 'monitor' })[0]),
      ['id', 'name', 'role', 'power', 'interest', 'support', 'category', 'notes']);
  });
  test('Nicht-Objekte und Listen entfallen', () => {
    const out = from1_0({ stakeholders: [5, null, 'x', ['a'], { id: 'k', name: 'K' }] }).stakeholders;
    assertEqual(json(out), json([entry({ id: 'k', name: 'K' })]));
  });
  test('fehlende oder leere id: fest s<Position>, bei jedem Lesen gleich', () => {
    const old = { stakeholders: [{ name: 'A' }, { id: '', name: 'B' }, { id: 7, name: 'C' }] };
    const ids = from1_0(plain(old)).stakeholders.map((s) => s.id);
    assertDeepEqual(ids, ['s1', 's2', 's3']);
    assertDeepEqual(from1_0(plain(old)).stakeholders.map((s) => s.id), ids);
  });
  test('Ersatz-id kollidiert mit vorhandener (auch späterer): _ angehängt; vorhandene id bleibt', () => {
    const out = from1_0({ stakeholders: [{ name: 'A' }, { id: 's1', name: 'B' }, { name: 'C' }, { id: 's3_', name: 'D' }] }).stakeholders;
    assertDeepEqual(out.map((s) => s.id), ['s1_', 's1', 's3', 's3_']);
    const out2 = from1_0({ stakeholders: [{ id: 's3', name: 'X' }, { id: 's3_', name: 'Y' }, { name: 'Z' }] }).stakeholders;
    assertDeepEqual(out2.map((s) => s.id), ['s3', 's3_', 's3__']);
  });
  test('doppelte id: die spätere bekommt _, Daten bleiben', () => {
    const out = from1_0({ stakeholders: [{ id: 'b2', name: 'A' }, { id: 'b2', name: 'B' }, { id: 'b2', name: 'C' }, { id: 'b2_', name: 'D' }] }).stakeholders;
    assertDeepEqual(out.map((s) => [s.id, s.name]), [['b2', 'A'], ['b2__', 'B'], ['b2___', 'C'], ['b2_', 'D']]);
    assertEqual(new Set(out.map((s) => s.id)).size, 4);
  });
  test('ohne Liste und für Nicht-Objekte: leere Liste', () => {
    for (const old of [{}, { stakeholders: 'oops' }, null, undefined]) {
      assertEqual(json(from1_0(old)), json({ stakeholders: [] }), json(old));
    }
  });
  test('liefert ein einfaches Objekt', () => {
    const out = from1_0({ stakeholders: [{ id: 'a' }] });
    assertEqual(Object.getPrototypeOf(out), Object.prototype);
    assertEqual(Object.getPrototypeOf(out.stakeholders[0]), Object.prototype);
  });
});

suite('stakeholder-analysis Migration — beide Schritte über das Model', () => {
  test('Stand ohne _schema läuft durch 0→1.0 und 1.0→1.1, lädt streng', () => {
    const m = State.fromJSON({ stakeholders: [{ name: 'A', power: 9 }, 3] });
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: [entry({ id: 's1', name: 'A', power: 5 })] }));
  });
  test('Stand 1.0 läuft nur durch 1.0→1.1', () => {
    const m = State.fromJSON({ _schema: V1_0, stakeholders: [{ id: 'x', name: 'A', support: 'resistor' }] });
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: [entry({ id: 'x', name: 'A', support: 'resistor' })] }));
  });
  test('doppelte ids im Altstand: keine Reparatur nötig, beide Einträge bleiben', () => {
    const { m, fields } = repaired({ _schema: V1_0, stakeholders: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] });
    assertDeepEqual(fields, []);
    assertDeepEqual(m.stakeholders.map((s) => s.id), ['a', 'a_']);
  });
});

suite('stakeholder-analysis Migration — Altprojekt (E2E-Fixture)', () => {
  test('Instanz a (ohne _schema): Quadrant als Kategorie bleibt, Rolle leer, Haltung neutral', () => {
    const { m, fields } = repaired(plain(LEGACY_A));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: [
      entry({ id: 's1', name: 'Werksleitung', power: 5, interest: 4, category: 'manage-closely', notes: 'Sponsor' }),
      entry({ id: 's2', name: 'Qualitätsprüfung Öl & Späne', power: 3, interest: 5, category: 'keep-informed', notes: 'Prüfplan „M3“ abstimmen' }),
      entry({ id: 's3', name: 'Betriebsrat', power: 4, interest: 2, category: 'keep-satisfied' }),
    ] }));
  });
  test('Instanz b (1.0): Ersatz-id s1, Stufen geklemmt, Fremdwerte bleiben', () => {
    const { m, fields } = repaired(plain(LEGACY_B));
    assertDeepEqual(fields, []);
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: [
      entry({ id: 's1', name: 'Lieferant Müller GmbH', role: 'Zulieferer', power: 5, interest: 4, category: 'extern', notes: 'Liefertermine wöchentlich abstimmen' }),
      entry({ id: 'b2', name: 'Einkauf', role: 'Strategischer Einkauf', power: 2, interest: 2, support: 'resistor', category: 'Sponsor' }),
      entry({ id: 'b3', name: 'Kundenservice', power: 4, interest: 5, support: 'critic', category: 'kunde', notes: 'Beschwerden bündeln' }),
    ] }));
    assertEqual(json(read(m).quadrants), json([
      { id: 's1', quadrant: 'manage-closely' }, { id: 'b2', quadrant: 'monitor' }, { id: 'b3', quadrant: 'manage-closely' },
    ]));
  });
});

suite('stakeholder-analysis Migration — goldene Fixtures', () => {
  const FILES = ['v0.2.0_single_project.json', 'v0.2.0_all_projects.json', 'v0.3.0_single_project.json', 'v0.3.0_all_projects.json', 'v0.5.0_8d_project.json'];
  test('jede Instanz lädt ohne Reparatur; ids, Namen, Stufen, Kategorie und Notizen wörtlich', async () => {
    let n = 0;
    for (const file of FILES) {
      for (const old of stakeholderStates(await fetchJSON(new URL(file, FIXTURES)))) {
        n += 1;
        assertEqual(old._schema, undefined, file);
        const { m, fields } = repaired(plain(old));
        assertDeepEqual(fields, [], file);
        const want = old.stakeholders.map((e) => entry({
          id: e.id, name: e.name, role: e.role ?? '', power: e.power, interest: e.interest,
          support: e.support || 'neutral', category: e.category || 'intern', notes: e.notes ?? '',
        }));
        assertEqual(json(m.toJSON()), json({ ...SCHEMA, stakeholders: want }), file);
      }
    }
    assertTrue(n >= 3, `nur ${n} Instanzen gefunden`);
  });
  test('v0.2.0_single_project: der Quadrant als Kategorie bleibt Kategorie', async () => {
    const [old] = stakeholderStates(await fetchJSON(new URL('v0.2.0_single_project.json', FIXTURES)));
    const m = State.fromJSON(plain(old));
    assertEqual(m.stakeholders[0].category, 'manage-closely');
    assertEqual(m.stakeholders[0].id, 's1');
  });
});

suite('stakeholder-analysis Migration — Beispiele ohne _schema', () => {
  const ROW = ['id', 'name', 'role', 'power', 'interest', 'support', 'category', 'notes'];
  const CASES = [
    ['stakeholders-pizza-lieferung.json', ['manage-closely', 'manage-closely', 'monitor', 'keep-informed', 'manage-closely', 'keep-satisfied', 'monitor']],
    ['stakeholder-analysis-hubschrauber-flyer.json', ['manage-closely', 'keep-informed', 'monitor', 'monitor']],
  ];
  for (const [file, quads] of CASES) {
    test(`${file}: lädt ohne Reparatur, ids s1… bleiben, read() wie die Altform`, async () => {
      const data = await fetchJSON(new URL(file, EXAMPLES));
      assertEqual(data._schema, undefined);
      const { m, fields } = repaired(plain(data));
      assertDeepEqual(fields, []);
      const out = read(m);
      assertEqual(json(out.stakeholders), json(data.stakeholders));
      assertDeepEqual(out.stakeholders.map((s) => s.id), data.stakeholders.map((_, i) => `s${i + 1}`));
      assertEqual(json(out.quadrants), json(data.stakeholders.map((s, i) => ({ id: s.id, quadrant: quads[i] }))));
      for (const s of out.stakeholders) assertDeepEqual(Object.keys(s), ROW);
    });
  }
});
