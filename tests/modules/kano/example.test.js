/**
 * Kano: Beispiel mit Baum (domain/example.js, viewmodel/example.js). Der
 * Stapel läuft in einem kleinen Nachbau von `interact` gegen das echte Model
 * des Baum-Moduls (Referenzen `$from`, ganz oder gar nicht); geprüft werden
 * die drei Lagen, das Umhängen der Knoten-ids und die Ablehnungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertRejects } from '../../test-utils.js';
import { State as Tree } from '../../../js/modules/voc-ctx-tree/domain/model.js';
import { setFields } from '../../../js/core/model.js';
import {
  exampleTreeStack, newNodeIds, relinkKano, detachKano, hasOwnStyles,
} from '../../../js/modules/kano/domain/example.js';
import { beforeLoadExample } from '../../../js/modules/kano/viewmodel/example.js';
import { flatten } from '../../../js/modules/kano/domain/link.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {any} v @param {Map<string, any>} done */
function resolve(v, done) {
  if (Array.isArray(v)) return v.map((x) => resolve(x, done));
  if (v && typeof v === 'object') {
    if (typeof v.$from === 'string') return v.path.split('.').reduce((o, k) => o?.[k], done.get(v.$from));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, done)]));
  }
  return v;
}

/**
 * Eine Projektwelt mit Baum-Instanzen (echtes Model) und `interact` wie der
 * Kern: Schritte nacheinander, Referenzen aufgelöst, bei einem Fehler bleibt
 * alles wie vorher.
 * @param {Record<string, any>} [trees] instanceId → gespeicherter Stand
 */
function world(trees = {}) {
  /** @type {Map<string, any>} */
  let models = new Map(Object.entries(trees).map(([id, s]) => [id, Tree.fromJSON(s)]));
  const stacks = [];
  let seq = 0;
  return {
    stacks,
    models: () => models,
    instances: {
      list: ({ modules } = {}) => (modules && !modules.includes('voc-ctx-tree') ? []
        : [...models.keys()].map((instanceId) => ({ instanceId, moduleId: 'voc-ctx-tree', phase: 'define', title: '' }))),
      read: async (id) => {
        const m = models.get(id);
        if (!m) throw Object.assign(new Error('unknown_instance'), { code: 'unknown_instance' });
        return { vocs: plain(m.vocs) };
      },
      interact: async (stack) => {
        stacks.push(stack);
        const next = new Map([...models].map(([id, m]) => [id, Tree.fromJSON(plain(m.toJSON()))]));
        const done = new Map();
        const results = [];
        try {
          for (const op of stack) {
            let result;
            if (op.op === 'instance.open') {
              result = { instanceId: op.instance, module: 'kano', phase: 'define' };
            } else if (op.op === 'module.add') {
              seq += 1;
              const instanceId = `tree-new-${seq}`;
              next.set(instanceId, new Tree());
              result = { instanceId, module: op.module, phase: 'define' };
            } else {
              const id = resolve(op.instance, done);
              const m = next.get(id);
              if (!m) throw new Error(`unknown instance ${id}`);
              if (op.op === 'instance.set') {
                setFields(m, resolve(op.values, done));
                result = { instanceId: id, values: op.values };
              } else {
                result = { instanceId: id, method: op.method, value: m[op.method](resolve(op.args[0], done)) };
              }
            }
            if (op.id) done.set(op.id, result);
            results.push({ id: op.id, result });
          }
        } catch (error) {
          return { ok: false, error: String(error), results };
        }
        models = next;
        return { ok: true, results };
      },
    },
  };
}

/** Modul-Instanz, auf der der Hook läuft. */
function host(w, { confirm = true, detached = false } = {}) {
  const asked = [];
  return {
    asked,
    _context: {
      instanceId: 'kano-1',
      instances: w.instances,
      detached,
      dialog: { confirm: async (o) => { asked.push(o); return confirm; } },
      i18n: { tf: () => (k) => `T:${k}` },
    },
  };
}

/** Knoten-ids eines Baums auf einer Ebene samt Text. */
const nodes = (vocs, level) => flatten({ vocs }, level).map((c) => c.label);

suite('kano: Beispiel mit Baum (Stapel)', () => {
  test('Stapel ohne Baum: module.add zuerst, Referenzen je Knoten, Eltern über $from', () => {
    const tree = { vocs: [{ id: 'v1', text: 'V', source: 'S', needs: [{ id: 'n1', text: 'N', drivers: [
      { id: 'd1', text: 'D', type: 'ctd', requirements: [{ id: 'r1', text: 'R', target: 'T', measure: 'M' }] }] }] }] };
    const { stack, refs } = exampleTreeStack({ tree, instanceId: null });
    assertDeepEqual(stack[0], { op: 'module.add', id: 'tree', module: 'voc-ctx-tree' });
    assertDeepEqual(stack.map((s) => s.method ?? s.op), ['module.add', 'addVoc', 'addNeed', 'addDriver', 'addRequirement']);
    assertDeepEqual(stack[1].instance, { $from: 'tree', path: 'instanceId' });
    assertDeepEqual(stack[4].args[0], {
      vocId: { $from: 'voc:v1', path: 'value' }, needId: { $from: 'need:n1', path: 'value' },
      drvId: { $from: 'drv:d1', path: 'value' }, text: 'R', target: 'T', measure: 'M',
    });
    assertEqual(stack[3].args[0].type, 'ctd');
    assertDeepEqual(refs, { v1: 'voc:v1', n1: 'need:n1', d1: 'drv:d1', r1: 'req:r1' });
  });

  test('Stapel ohne Baum: zum Schluss die eigene Instanz wieder anzeigen (module.add wechselt die Ansicht)', () => {
    const tree = { vocs: [{ id: 'v1', text: 'V', needs: [] }] };
    const { stack } = exampleTreeStack({ tree, instanceId: null, showAfter: 'kano-1' });
    assertDeepEqual(stack.at(-1), { op: 'instance.open', instance: 'kano-1' });
    assertEqual(stack.filter((s) => s.op === 'instance.open').length, 1);
    assertEqual(exampleTreeStack({ tree, instanceId: null }).stack.some((s) => s.op === 'instance.open'), false);
    assertEqual(exampleTreeStack({ tree, instanceId: 't1', showAfter: 'kano-1' }).stack.some((s) => s.op === 'instance.open'), false,
      'ohne module.add bleibt die Ansicht');
  });

  test('Stapel an vorhandenen Baum: kein module.add, zuerst removeVoc je alter Stimme', () => {
    const { stack } = exampleTreeStack({ tree: { vocs: [{ id: 'v1', text: 'V', needs: [] }] }, instanceId: 't1', clearVocIds: ['a', 'b'] });
    assertDeepEqual(stack.map((s) => s.method), ['removeVoc', 'removeVoc', 'addVoc']);
    assertDeepEqual(stack[0], { op: 'instance.call', module: 'voc-ctx-tree', instance: 't1', method: 'removeVoc', args: [{ vocId: 'a' }] });
    assertEqual(stack[2].args[0].source, '');
  });

  test('Darstellung nur, wenn sie von der Vorgabe abweicht', () => {
    assertEqual(hasOwnStyles({}), false);
    assertEqual(hasOwnStyles({ borderWidth: 1, colors: {} }), false);
    assertEqual(hasOwnStyles({ borderWidth: 2, colors: {} }), true);
    const tree = { vocs: [], styles: { borderWidth: 2, colors: { voc: 'rgba(1,2,3,1)' } } };
    const { stack } = exampleTreeStack({ tree, instanceId: 't1' });
    assertDeepEqual(stack, [{ op: 'instance.set', module: 'voc-ctx-tree', instance: 't1', values: { styles: tree.styles } }]);
  });

  test('Umhängen: neue ids aus den Ergebnissen, unbekannte werden null; losgelöst ohne Bezug', () => {
    const ids = newNodeIds({ results: [{ id: 'need:n1', result: { value: 'X1' } }, { result: {} }] }, { n1: 'need:n1', n2: 'need:n2' });
    assertDeepEqual(ids, { n1: 'X1' });
    const kano = { source: { instanceId: null, level: 'need' }, items: [{ id: 'k1', nodeId: 'n1' }, { id: 'k2', nodeId: 'n2' }, { id: 'k3', nodeId: null }] };
    const out = relinkKano(kano, 'T', ids);
    assertDeepEqual(out.source, { instanceId: 'T', level: 'need' });
    assertDeepEqual(out.items.map((i) => i.nodeId), ['X1', null, null]);
    assertEqual(kano.items[0].nodeId, 'n1', 'Eingabe unverändert');
    const det = detachKano(kano);
    assertEqual(det.source.instanceId, null);
    assertDeepEqual(det.items.map((i) => i.nodeId), [null, null, null]);
  });
});

suite('kano: Beispiel mit Baum (drei Lagen)', () => {
  test('Lage 1, kano-lieferservice: Baum entsteht, Merkmale hängen an den neuen Bedürfnissen', async () => {
    const data = await fetchJson('../../../js/modules/kano/resources/examples/projects/kano-lieferservice.json');
    const w = world();
    const h = host(w);
    const out = await beforeLoadExample.call(h, data);
    assertEqual(w.stacks.length, 1);
    assertEqual(w.stacks[0][0].op, 'module.add');
    assertEqual(w.stacks[0].some((s) => s.op === 'instance.set'), false, 'Vorgabe-Darstellung wird nicht geschrieben');
    assertDeepEqual(w.stacks[0].at(-1), { op: 'instance.open', instance: 'kano-1' }, 'Ansicht zurück auf Kano');
    const [id] = [...w.models().keys()];
    assertEqual(out.source.instanceId, id);
    const tree = w.models().get(id);
    const needs = flatten({ vocs: plain(tree.vocs) }, 'need');
    assertDeepEqual(out.items.map((i) => i.nodeId), data.kano.items.map((i) => needs.find((n) => n.label === i.label)?.nodeId ?? null));
    assertTrue(out.items.every((i) => i.nodeId !== null && !i.nodeId.startsWith('need-')), 'neue ids');
    assertEqual(h.asked.length, 0);
  });

  test('Lage 2, kano-hubschrauber-flyer in leeren Baum: Ebene driver, d1–d3 umgehängt, k1 bleibt ohne Bezug', async () => {
    const data = await fetchJson('../../../js/modules/kano/resources/examples/projects/kano-hubschrauber-flyer.json');
    const w = world({ t1: new Tree().toJSON() });
    const out = await beforeLoadExample.call(host(w), data);
    assertEqual(w.stacks[0].some((s) => s.op === 'module.add'), false);
    assertEqual(out.source.instanceId, 't1');
    assertEqual(out.source.level, 'driver');
    const tree = w.models().get('t1');
    assertDeepEqual(nodes(plain(tree.vocs), 'driver'), ['Flugzeit', 'Streuung der Flugzeit', 'Autorotation']);
    const drivers = flatten({ vocs: plain(tree.vocs) }, 'driver');
    // Alte Treiber-ids in Baumreihenfolge d1, d2, d3 → neue ids an gleicher Stelle.
    const byOld = { d1: drivers[0].nodeId, d2: drivers[1].nodeId, d3: drivers[2].nodeId };
    for (const item of out.items) {
      const before = data.kano.items.find((i) => i.id === item.id);
      assertEqual(item.nodeId, before.nodeId === null ? null : byOld[before.nodeId], item.id);
    }
    assertEqual(out.items.find((i) => i.id === 'k1').nodeId, null);
    assertEqual(plain(tree.vocs)[0].needs[0].drivers[0].requirements[0].target, '≥ 3,0 s');
  });

  test('Lage 3: Rückfrage; Ja überschreibt, Nein und ausgehängt laden ohne Baumbezug', async () => {
    const data = await fetchJson('../../../js/modules/kano/resources/examples/projects/kano-lieferservice.json');
    const full = () => {
      const t = new Tree();
      t.addVoc({ text: 'Alt' });
      return t.toJSON();
    };
    const yes = world({ t1: full() });
    const hy = host(yes);
    const outYes = await beforeLoadExample.call(hy, data);
    assertEqual(hy.asked.length, 1);
    assertEqual(hy.asked[0].message, 'T:confirm.overwriteTree');
    assertEqual(hy.asked[0].danger, true);
    assertDeepEqual(plain(yes.models().get('t1').vocs).map((v) => v.text), [data.tree.vocs[0].text]);
    assertEqual(outYes.source.instanceId, 't1');
    assertTrue(outYes.items.every((i) => i.nodeId !== null));

    const no = world({ t1: full() });
    const outNo = await beforeLoadExample.call(host(no, { confirm: false }), data);
    assertEqual(no.stacks.length, 0);
    assertEqual(outNo.source.instanceId, null);
    assertTrue(outNo.items.every((i) => i.nodeId === null));
    assertDeepEqual(plain(no.models().get('t1').vocs).map((v) => v.text), ['Alt']);

    const det = world({ t1: full() });
    const hd = host(det, { detached: true });
    const outDet = await beforeLoadExample.call(hd, data);
    assertEqual(hd.asked.length, 0);
    assertEqual(det.stacks.length, 0);
    assertEqual(outDet.source.instanceId, null);
  });

  test('Lage 1 ausgehängt (Szenario): Baum entsteht, keine Ansicht wird geöffnet', async () => {
    const data = await fetchJson('../../../js/modules/kano/resources/examples/projects/kano-lieferservice.json');
    const w = world();
    const out = await beforeLoadExample.call(host(w, { detached: true }), data);
    assertEqual(w.stacks[0][0].op, 'module.add');
    assertEqual(w.stacks[0].some((s) => s.op === 'instance.open'), false);
    assertEqual(out.source.instanceId, [...w.models().keys()][0]);
  });

  test('scheitert der Stapel, wirft der Hook und der Baum bleibt', async () => {
    const w = world({ t1: new Tree().toJSON() });
    const bad = { tree: { vocs: [{ id: 'v1', text: 'V', needs: [{ id: 'n1', text: '', drivers: [] }] }] }, kano: { source: { instanceId: null, level: 'need' }, items: [] } };
    await assertRejects(() => beforeLoadExample.call(host(w), bad), /tree stack failed/);
    assertEqual(w.models().get('t1').vocs.length, 0);
  });
});
