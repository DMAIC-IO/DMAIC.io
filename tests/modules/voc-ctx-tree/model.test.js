/**
 * Tests for modules/voc-ctx-tree/domain/model.js — Schema und Vorgaben,
 * gespeicherte Stände '1.0', Versionsprüfung, die vier Invarianten (streng,
 * mit Reparatur, beim Schreiben), alle Kommandos samt Ablehnungen, `current`
 * und `confirm`, Auswahl, `reorderNodes` je Ebene, `hasContent`, Lesefläche
 * und Agentenkatalog; dazu die Fälle der alten Suite in der neuen Form.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/voc-ctx-tree/domain/model.js';
import { DEFAULT_COLORS, allIds } from '../../../js/modules/voc-ctx-tree/domain/tree.js';
import { setModelName, confirmOf, currentOf } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'voc-ctx-tree');

const SCHEMA = { _schema: { name: 'voc-ctx-tree', version: '1.0' } };
const json = (v) => JSON.stringify(v);
const plain = (v) => JSON.parse(JSON.stringify(v));
const STYLES = { borderWidth: 1, colors: { ...DEFAULT_COLORS } };

const req = (id, text, target = '', measure = '') => ({ id, text, target, measure });
const drv = (id, text, type, requirements = []) => ({ id, text, type, requirements });
const need = (id, text, drivers = []) => ({ id, text, drivers });
const voc = (id, text, source, needs = []) => ({ id, text, source, needs });

const VOCS = [
  voc('v1', 'Kalt', 'Umfrage', [
    need('n1', 'Heiß', [
      drv('d1', 'Temperatur', 'ctq', [req('r1', '≥ 50 °C', '50', 'Thermometer'), req('r2', 'Box')]),
      drv('d2', 'Zeit', 'ctd'),
    ]),
    need('n2', 'Freundlich'),
  ]),
  voc('v2', 'Teuer', ''),
];
const STORED = { ...SCHEMA, vocs: VOCS, styles: STYLES, activeVocId: 'v1' };

/** @returns {any} */
const stored = () => State.fromJSON(plain(STORED));
/** @param {object} m */
const fieldsOf = (m) => { const { _schema, ...rest } = plain(m.toJSON()); return rest; };

/** @param {() => any} fn @returns {any} */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

suite('voc-ctx-tree Model — Schema und Vorgaben', () => {
  test('zwei Felder, ein Ansichtsfeld, vierzehn Kommandos, vier Invarianten, keine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['vocs', 'styles']);
    assertDeepEqual(Object.keys(State.schema.view), ['activeVocId']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addVoc', 'updateVoc', 'removeVoc', 'setActiveVoc', 'addNeed', 'updateNeed', 'removeNeed',
      'addDriver', 'updateDriver', 'removeDriver', 'addRequirement', 'updateRequirement', 'removeReq', 'reorderNodes',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['uniqueIds', 'validColors', 'borderWidthStep', 'knownActiveVoc']);
    for (const inv of Object.values(State.schema.invariants)) assertEqual(typeof inv.repair, 'function');
    assertDeepEqual([...State.schema.invariants.knownActiveVoc.fields], ['activeVocId']);
    assertDeepEqual(Object.keys(State.schema.derived ?? {}), []);
  });
  test('Baum: vier Ebenen inline, Massenfeld, nicht per instance.set', () => {
    const f = State.schema.fields.vocs;
    assertEqual(f.bulk, true);
    assertEqual(f.bulkKind, 'tree');
    assertEqual(f.agentWrite, false);
    assertDeepEqual(Object.keys(f.item.shape), ['id', 'text', 'source', 'needs']);
    const n = f.item.shape.needs.item;
    assertDeepEqual(Object.keys(n.shape), ['id', 'text', 'drivers']);
    const d = n.shape.drivers.item;
    assertDeepEqual(Object.keys(d.shape), ['id', 'text', 'type', 'requirements']);
    assertDeepEqual(Object.keys(d.shape.requirements.item.shape), ['id', 'text', 'target', 'measure']);
  });
  test('Vorgabe: leer, Vorgabestil, keine Auswahl, kein Inhalt', () => {
    const m = new State();
    assertEqual(json(m.toJSON()), json({ ...SCHEMA, vocs: [], styles: STYLES, activeVocId: null }));
    assertEqual(m.hasContent(), false);
  });
});

suite('voc-ctx-tree Model — gespeicherter Stand 1.0', () => {
  test('lädt streng, ohne Reparatur, toJSON zeichengleich', () => {
    assertEqual(thrown(() => stored()), null);
    assertDeepEqual(repaired(plain(STORED)).fields, []);
    assertEqual(json(stored().toJSON()), json(STORED));
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(STORED)).toJSON()), json(STORED));
  });
  test('läuft ohne Migrationsschritt: Art xyz ist in 1.0 ungültig', () => {
    const j = plain(STORED);
    j.vocs[0].needs[0].drivers[0].type = 'xyz';
    assertTrue(thrown(() => State.fromJSON(j)) instanceof Error);
  });
  test('höhere und unlesbare Version werden abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...plain(STORED), _schema: { name: 'voc-ctx-tree', version: '2.0' } }), /_schema\.version/);
    assertThrows(() => loadModel(State, { ...plain(STORED), _schema: { name: 'voc-ctx-tree', version: '2.0' } }), /_schema\.version/);
    assertThrows(() => State.fromJSON({ ...plain(STORED), _schema: { version: 'x' } }), /_schema\.version/);
  });
});

suite('voc-ctx-tree Model — Invarianten', () => {
  test('uniqueIds: Doppel über Ebenen streng abgewiesen; Reparatur hängt _ an', () => {
    const j = plain(STORED);
    j.vocs[1].id = 'r1';
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'uniqueIds');
    const { m, fields } = repaired(plain(j));
    assertDeepEqual(fields, ['vocs']);
    assertDeepEqual(allIds(m.vocs), ['v1', 'n1', 'd1', 'r1', 'r2', 'd2', 'n2', 'r1_']);
  });
  test('uniqueIds: leere id wird ersetzt', () => {
    const j = plain(STORED);
    j.vocs[0].needs[1].id = '';
    const { m } = repaired(j);
    assertEqual(m.vocs[0].needs[1].id, '_');
  });
  test('validColors: ungültige Farbe streng abgewiesen, Reparatur setzt die Vorgabe', () => {
    const j = plain(STORED);
    j.styles.colors.ctq = '#00ff00';
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'validColors');
    const { m, fields } = repaired(j);
    assertDeepEqual(fields, ['styles']);
    assertEqual(m.styles.colors.ctq, DEFAULT_COLORS.ctq);
  });
  test('borderWidthStep: 3.7 streng abgewiesen, Reparatur 3.5; außerhalb 0–4 schon vom Feld', () => {
    const j = plain(STORED);
    j.styles.borderWidth = 3.7;
    assertEqual(thrown(() => State.fromJSON(plain(j)))?.invariant, 'borderWidthStep');
    assertEqual(repaired(j).m.styles.borderWidth, 3.5);
    const k = plain(STORED);
    k.styles.borderWidth = 5;
    assertTrue(thrown(() => State.fromJSON(k)) instanceof Error);
  });
  test('knownActiveVoc: unbekannte Auswahl heilt still', () => {
    const m = State.fromJSON({ ...plain(STORED), activeVocId: 'zz' });
    assertEqual(m.activeVocId, null);
  });
  test('Schreiben: ungültige Farbe und Zwischenstufe rollen zurück', () => {
    const m = stored();
    assertEqual(thrown(() => { m.styles = { borderWidth: 1, colors: { ...DEFAULT_COLORS, voc: 'rgb(300,0,0)' } }; })?.invariant, 'validColors');
    assertEqual(thrown(() => { m.styles = { borderWidth: 1.2, colors: { ...DEFAULT_COLORS } }; })?.invariant, 'borderWidthStep');
    assertEqual(json(fieldsOf(m)), json(fieldsOf(stored())));
    m.styles = { borderWidth: 2.5, colors: { ...DEFAULT_COLORS, voc: 'rgba(1,2,3,1.00)' } };
    assertEqual(m.styles.borderWidth, 2.5);
    assertEqual(m.styles.colors.voc, 'rgba(1,2,3,1.00)');
  });
  test('Schreiben: unbekannte Auswahl wird abgewiesen', () => {
    const m = stored();
    assertEqual(thrown(() => { m.activeVocId = 'zz'; })?.invariant, 'knownActiveVoc');
    assertEqual(m.activeVocId, 'v1');
  });
});

suite('voc-ctx-tree Model — Kundenstimmen', () => {
  test('addVoc: getrimmt, Herkunft optional, liefert eine neue id und wählt aus', () => {
    const m = new State();
    const a = m.addVoc({ text: '  Kalt  ' });
    const b = m.addVoc({ text: 'B', source: ' Umfrage ' });
    assertTrue(typeof a === 'string' && a !== '' && a !== b);
    assertEqual(json(m.vocs), json([voc(a, 'Kalt', ''), voc(b, 'B', 'Umfrage')]));
    assertEqual(m.activeVocId, b);
    assertEqual(m.hasContent(), true);
  });
  test('addVoc: leerer oder fehlender Text abgelehnt mit param text', () => {
    const m = new State();
    assertEqual(thrown(() => m.addVoc({ text: '  ' }))?.param, 'text');
    assertEqual(thrown(() => m.addVoc(/** @type {any} */ ({})))?.param, 'text');
    assertEqual(thrown(() => m.addVoc(/** @type {any} */ ({ text: 'a', source: 5 })))?.param, 'source');
    assertEqual(m.vocs.length, 0);
  });
  test('updateVoc ändert Text und Herkunft; current liefert sie; unbekannte id abgelehnt', () => {
    const m = stored();
    assertDeepEqual(currentOf(m, 'updateVoc', { vocId: 'v1' }), { text: 'Kalt', source: 'Umfrage' });
    m.updateVoc({ vocId: 'v1', text: ' Lauwarm ', source: '' });
    assertEqual(m.vocs[0].text, 'Lauwarm');
    assertEqual(m.vocs[0].source, '');
    assertEqual(thrown(() => m.updateVoc({ vocId: 'zz', text: 'x', source: '' }))?.param, 'vocId');
    assertEqual(thrown(() => m.updateVoc({ vocId: 'v1', text: '', source: '' }))?.param, 'text');
    assertEqual(thrown(() => currentOf(m, 'updateVoc', { vocId: 'zz' }))?.param, 'vocId');
  });
  test('removeVoc: fragt nach; die aktive → erste verbleibende; die letzte → null; inaktive lässt Auswahl', () => {
    const m = stored();
    assertDeepEqual(confirmOf(m, 'removeVoc', { vocId: 'v1' }), { key: 'confirm.removeVoc' });
    m.setActiveVoc({ vocId: 'v2' });
    m.removeVoc({ vocId: 'v1' });
    assertEqual(m.activeVocId, 'v2');
    m.removeVoc({ vocId: 'v2' });
    assertEqual(m.activeVocId, null);
    assertEqual(m.vocs.length, 0);
    const k = stored();
    k.removeVoc({ vocId: 'v1' });
    assertEqual(k.activeVocId, 'v2');
    assertEqual(thrown(() => k.removeVoc({ vocId: 'zz' }))?.param, 'vocId');
  });
  test('setActiveVoc: bekannte id oder null; unbekannte abgelehnt; nicht für den Agenten', () => {
    const m = stored();
    m.setActiveVoc({ vocId: 'v2' });
    assertEqual(m.activeVocId, 'v2');
    m.setActiveVoc({ vocId: null });
    assertEqual(m.activeVocId, null);
    assertEqual(thrown(() => m.setActiveVoc({ vocId: 'zz' }))?.param, 'vocId');
    assertEqual(State.schema.commands.setActiveVoc.params.vocId.agentWrite, false);
  });
});

suite('voc-ctx-tree Model — Bedürfnisse, Treiber, Anforderungen', () => {
  test('addNeed / updateNeed / removeNeed', () => {
    const m = stored();
    const id = m.addNeed({ vocId: 'v2', text: ' Günstig ' });
    assertEqual(json(m.vocs[1].needs), json([need(id, 'Günstig')]));
    assertDeepEqual(currentOf(m, 'updateNeed', { vocId: 'v2', needId: id }), { text: 'Günstig' });
    m.updateNeed({ vocId: 'v2', needId: id, text: 'Billig' });
    assertEqual(m.vocs[1].needs[0].text, 'Billig');
    m.removeNeed({ vocId: 'v1', needId: 'n1' });
    assertDeepEqual(m.vocs[0].needs.map((n) => n.id), ['n2']);
  });
  test('addDriver: Art optional (ctq), getrimmt; updateDriver ändert Text und Art', () => {
    const m = stored();
    const a = m.addDriver({ vocId: 'v1', needId: 'n2', text: ' Ton ' });
    const b = m.addDriver({ vocId: 'v1', needId: 'n2', text: 'Preis', type: 'ctc' });
    assertEqual(json(m.vocs[0].needs[1].drivers), json([drv(a, 'Ton', 'ctq'), drv(b, 'Preis', 'ctc')]));
    assertDeepEqual(currentOf(m, 'updateDriver', { vocId: 'v1', needId: 'n2', drvId: b }), { text: 'Preis', type: 'ctc' });
    m.updateDriver({ vocId: 'v1', needId: 'n2', drvId: a, text: 'Stimme', type: 'ctd' });
    assertEqual(json(m.vocs[0].needs[1].drivers[0]), json(drv(a, 'Stimme', 'ctd')));
    m.removeDriver({ vocId: 'v1', needId: 'n2', drvId: a });
    assertDeepEqual(m.vocs[0].needs[1].drivers.map((d) => d.id), [b]);
  });
  test('addRequirement: Ziel und Messung optional und getrimmt; update und remove', () => {
    const m = stored();
    const a = m.addRequirement({ vocId: 'v1', needId: 'n1', drvId: 'd2', text: 'Schnell' });
    const b = m.addRequirement({ vocId: 'v1', needId: 'n1', drvId: 'd2', text: 'S', target: ' 30 ', measure: ' Uhr ' });
    assertEqual(json(m.vocs[0].needs[0].drivers[1].requirements), json([req(a, 'Schnell'), req(b, 'S', '30', 'Uhr')]));
    assertDeepEqual(currentOf(m, 'updateRequirement', { vocId: 'v1', needId: 'n1', drvId: 'd1', reqId: 'r1' }),
      { text: '≥ 50 °C', target: '50', measure: 'Thermometer' });
    m.updateRequirement({ vocId: 'v1', needId: 'n1', drvId: 'd2', reqId: a, text: 'X', target: '', measure: 'M' });
    assertEqual(json(m.vocs[0].needs[0].drivers[1].requirements[0]), json(req(a, 'X', '', 'M')));
    m.removeReq({ vocId: 'v1', needId: 'n1', drvId: 'd2', reqId: a });
    assertDeepEqual(m.vocs[0].needs[0].drivers[1].requirements.map((r) => r.id), [b]);
  });
  const REJECT = [
    ['addNeed unbekannte Stimme', 'addNeed', { vocId: 'zz', text: 'x' }, 'vocId'],
    ['addNeed leerer Text', 'addNeed', { vocId: 'v1', text: '' }, 'text'],
    ['updateNeed unbekanntes Bedürfnis', 'updateNeed', { vocId: 'v1', needId: 'zz', text: 'x' }, 'needId'],
    ['updateNeed Bedürfnis einer anderen Stimme', 'updateNeed', { vocId: 'v2', needId: 'n1', text: 'x' }, 'needId'],
    ['removeNeed unbekannt', 'removeNeed', { vocId: 'v1', needId: 'zz' }, 'needId'],
    ['addDriver Art xyz', 'addDriver', { vocId: 'v1', needId: 'n1', text: 'x', type: 'xyz' }, 'type'],
    ['addDriver leerer Text', 'addDriver', { vocId: 'v1', needId: 'n1', text: ' ' }, 'text'],
    ['updateDriver unbekannt', 'updateDriver', { vocId: 'v1', needId: 'n1', drvId: 'zz', text: 'x', type: 'ctq' }, 'drvId'],
    ['updateDriver ohne Art', 'updateDriver', { vocId: 'v1', needId: 'n1', drvId: 'd1', text: 'x' }, 'type'],
    ['removeDriver unbekannt', 'removeDriver', { vocId: 'v1', needId: 'n2', drvId: 'd1' }, 'drvId'],
    ['addRequirement unbekannter Treiber', 'addRequirement', { vocId: 'v1', needId: 'n1', drvId: 'zz', text: 'x' }, 'drvId'],
    ['updateRequirement unbekannt', 'updateRequirement', { vocId: 'v1', needId: 'n1', drvId: 'd1', reqId: 'zz', text: 'x', target: '', measure: '' }, 'reqId'],
    ['updateRequirement leerer Text', 'updateRequirement', { vocId: 'v1', needId: 'n1', drvId: 'd1', reqId: 'r1', text: '', target: '', measure: '' }, 'text'],
    ['removeReq unbekannt', 'removeReq', { vocId: 'v1', needId: 'n1', drvId: 'd2', reqId: 'r1' }, 'reqId'],
  ];
  for (const [what, cmd, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}, Zustand unverändert`, () => {
      const m = stored();
      assertEqual(thrown(() => m[cmd](args))?.param, param);
      assertEqual(json(fieldsOf(m)), json(fieldsOf(stored())));
    });
  }
  test('Bearbeiten eines verschwundenen Knotens wird abgelehnt (current und Kommando)', () => {
    const m = stored();
    m.removeNeed({ vocId: 'v1', needId: 'n2' });
    assertEqual(thrown(() => currentOf(m, 'updateNeed', { vocId: 'v1', needId: 'n2' }))?.param, 'needId');
    assertEqual(thrown(() => m.updateNeed({ vocId: 'v1', needId: 'n2', text: 'x' }))?.param, 'needId');
  });
  test('neue ids sind im ganzen Baum eindeutig', () => {
    const m = stored();
    const ids = [m.addVoc({ text: 'a' }), m.addNeed({ vocId: 'v1', text: 'b' }), m.addDriver({ vocId: 'v1', needId: 'n1', text: 'c' })];
    assertEqual(new Set([...allIds(m.vocs)]).size, allIds(m.vocs).length);
    for (const id of ids) assertTrue(allIds(m.vocs).includes(id));
  });
});

suite('voc-ctx-tree Model — reorderNodes', () => {
  test('Bedürfnis an die Stelle des ersten', () => {
    const m = stored();
    assertEqual(m.reorderNodes({ kind: 'need', vocId: 'v1', fromId: 'n2', toId: 'n1' }), true);
    assertDeepEqual(m.vocs[0].needs.map((n) => n.id), ['n2', 'n1']);
  });
  test('Treiber nach hinten', () => {
    const m = stored();
    m.reorderNodes({ kind: 'driver', vocId: 'v1', needId: 'n1', fromId: 'd1', toId: 'd2' });
    assertDeepEqual(m.vocs[0].needs[0].drivers.map((d) => d.id), ['d2', 'd1']);
  });
  test('Anforderungen', () => {
    const m = stored();
    m.reorderNodes({ kind: 'req', vocId: 'v1', needId: 'n1', drvId: 'd1', fromId: 'r2', toId: 'r1' });
    assertDeepEqual(m.vocs[0].needs[0].drivers[0].requirements.map((r) => r.id), ['r2', 'r1']);
  });
  test('gleiche id liefert false und ändert nichts', () => {
    const m = stored();
    assertEqual(m.reorderNodes({ kind: 'need', vocId: 'v1', fromId: 'n1', toId: 'n1' }), false);
    assertEqual(json(fieldsOf(m)), json(fieldsOf(stored())));
  });
  const REJECT = [
    ['unbekannte Ebene', { kind: 'voc', vocId: 'v1', fromId: 'n1', toId: 'n2' }, 'kind'],
    ['unbekannte Stimme', { kind: 'need', vocId: 'zz', fromId: 'n1', toId: 'n2' }, 'vocId'],
    ['Treiber ohne needId', { kind: 'driver', vocId: 'v1', fromId: 'd1', toId: 'd2' }, 'needId'],
    ['Anforderung ohne drvId', { kind: 'req', vocId: 'v1', needId: 'n1', fromId: 'r1', toId: 'r2' }, 'drvId'],
    ['fromId nicht Geschwister', { kind: 'need', vocId: 'v1', fromId: 'd1', toId: 'n2' }, 'fromId'],
    ['toId nicht Geschwister', { kind: 'driver', vocId: 'v1', needId: 'n1', fromId: 'd1', toId: 'r1' }, 'toId'],
  ];
  for (const [what, args, param] of REJECT) {
    test(`${what}: abgelehnt mit param ${param}`, () => {
      const m = stored();
      assertEqual(thrown(() => m.reorderNodes(/** @type {any} */ (args)))?.param, param);
      assertEqual(json(fieldsOf(m)), json(fieldsOf(stored())));
    });
  }
});

suite('voc-ctx-tree Model — hasContent', () => {
  test('leer false; Stimme true; nur geänderter Stil zählt auch', () => {
    const m = new State();
    assertEqual(m.hasContent(), false);
    const id = m.addVoc({ text: 'a' });
    assertEqual(m.hasContent(), true);
    m.removeVoc({ vocId: id });
    assertEqual(m.hasContent(), false);
    m.styles = { borderWidth: 2, colors: { ...DEFAULT_COLORS } };
    assertEqual(m.hasContent(), true);
  });
});

suite('voc-ctx-tree Model — Lesefläche und Katalog', () => {
  const entryOf = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entryOf, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() mit fields: vocs als Baum in gespeicherter Form, styles; ohne activeVocId', () => {
    const out = read(stored(), { fields: ['vocs', 'styles'] });
    assertEqual(json(out.vocs), json(VOCS));
    assertEqual(json(out.styles), json(STYLES));
    assertTrue(!Object.hasOwn(read(stored()), 'activeVocId'));
  });
  test('read() ohne Option: vocs nur als Umfang', () => {
    const out = read(stored());
    assertTrue(!Array.isArray(out.vocs), json(out.vocs));
  });
  test('Katalog: read und die Kommandos ohne setActiveVoc; settable nur styles', () => {
    assertDeepEqual(Object.keys(entryOf.actions), [
      'read', 'addVoc', 'updateVoc', 'removeVoc', 'addNeed', 'updateNeed', 'removeNeed',
      'addDriver', 'updateDriver', 'removeDriver', 'addRequirement', 'updateRequirement', 'removeReq', 'reorderNodes',
    ]);
    assertDeepEqual(Object.keys(entryOf.actions.reorderNodes.keys), ['kind', 'vocId', 'needId', 'drvId', 'fromId', 'toId']);
    assertDeepEqual(entryOf.settable, ['styles']);
    assertDeepEqual(entryOf.invariants, ['uniqueIds', 'validColors', 'borderWidthStep', 'knownActiveVoc']);
  });
});
