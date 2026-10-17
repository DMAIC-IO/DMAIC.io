/**
 * Tests for core/agent/agent-catalog.js — the catalog, the validator's world
 * snapshot, and module.describe. Spec §3.1, §7, §8, §9.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import {
  buildCatalog, buildInstanceList, buildWorld, allowedPhasesFor, describeModule, isSingleton,
} from '../../../js/core/agent/agent-catalog.js';
import { buildUsage } from '../../../js/core/agent/agent-usage.js';
import { OPS } from '../../../js/core/agent/agent-contract.js';
import { pathExistsInShape } from '../../../js/core/agent/agent-shape.js';
import { getAllPhaseIds } from '../../../js/core/cycles/cycles.js';

const DEFS = [
  { id: 'worksheet', phase: 'data', group: 'collect' },
  { id: 'five-why',  phase: 'define', cycles: { dmaic: { phase: 'define' } } },
  { id: 'regression', phase: 'analyze', cycles: { dmaic: { phase: 'analyze', allowedPhases: ['measure'] } } },
  { id: 'kano', phase: 'define', cycles: { dmadv: { phase: 'define' } } },   // keine dmaic-Zuordnung
];

// Das Test-`t` liefert für unbekannte Schlüssel `undefined`, nie den
// Schlüssel selbst — ein fehlender i18n-Schlüssel in der Implementierung
// muss den Test rot machen (Ruling R5), nicht lautlos "bestehen".
const I18N_TABLE = {
  'modules.worksheet.name': 'Datensammlung',
  'modules.worksheet.description': 'Tabellarische Datenerfassung',
  'modules.five-why.name': '5-Why Analyse',
  'modules.five-why.description': 'Ursachenanalyse mit verzweigten Fragepfaden',
  'modules.five-why.whenToUse': 'Wenn ein Einzelvorfall bis zur Wurzel verfolgt werden soll.',
  'modules.regression.name': 'Regression',
  'modules.regression.description': 'Zusammenhang zweier Größen',
  'modules.kano.name': 'Kano',
  'modules.kano.description': 'Kundenanforderungen klassifizieren',
  'agent.errors.unknownSection': 'Modul "{module}" hat keinen Handbuchabschnitt "{section}".',
  'agent.errors.unknownModule': 'Modul "{module}" gibt es nicht.',
  'agent.usage.intro': 'Qprovement ist ein Six-Sigma-Werkzeugkasten im Browser.',
  'agent.usage.call': 'window.qprovement.interact() liefert diese Beschreibung.',
  'agent.usage.actionForm': 'Eine Aktion ist { op, … } mit den Feldern aus dem Aktionskatalog.',
  'agent.usage.refForm': 'Eine Referenz ist { $from, path }.',
  'agent.usage.nullableForm': '{ $nullable: … } heißt: diese Form oder null.',
  'agent.usage.batchForm': 'Der ganze Stapel wird geprüft, bevor irgendetwas ausgeführt wird.',
  'agent.usage.errorForm': 'Jeder Eintrag liefert { ok, result } oder { ok: false, error, message }.',
  'agent.usage.availability': 'Module ohne Freigabe erscheinen mit available: false.',
  'agent.usage.limits': 'Du bekommst Zahlen, keine Bilder.',
  'agent.usage.viewSwitch': 'instance.call wechselt die Ansicht.',
  'agent.usage.keysForm': 'keys beschreibt jeden Schlüssel einer Aktion oder eines Felds.',
  'modules.worksheet.actions.importCsv.help': 'Ersetzt den Inhalt des aktiven Blatts durch die übergebenen CSV-Daten.',
  'modules.worksheet.actions.importCsv.params.csv': 'Der vollständige CSV-Text, inklusive Kopfzeile, falls vorhanden.',
  'modules.worksheet.fields.rows.help': 'Die Datenzeilen des aktiven Blatts, in Spaltenreihenfolge.',
  // Die geteilten Schlüssel des `read()`-Mixins: der Code ist zentral, der
  // Text war es nicht — ohne diesen Rückfall müsste jedes Modul dieselben
  // zwei Strings in beide Sprachdateien kopieren.
  'modules.shared.actions.read.help': 'Liefert den vollständigen Lesezustand dieser Instanz.',
  'modules.shared.actions.read.params.options': 'Optionale Auswahl der Massenfelder und Zeilenbereiche.',
};

const I18N = {
  getLanguage: () => 'de',
  // `exists` muss dieselbe Tabelle spiegeln wie `t` — eine Aufzählung der
  // Schlüsselformen würde die neuen Hilfeschlüssel nie erfassen und die
  // Fälle unten lautlos nichts prüfen lassen.
  exists: (key) => key === 'modules.five-why.whenToUse'
    || (key.startsWith('modules.shared.')
      && Object.prototype.hasOwnProperty.call(I18N_TABLE, key))
    || /^modules\.(worksheet|five-why|regression|kano)\.(name|description)$/.test(key)
    || (/^modules\.[a-z0-9-]+\./.test(key)
      && Object.prototype.hasOwnProperty.call(I18N_TABLE, key)),
  t: (key, params) => {
    if (!Object.prototype.hasOwnProperty.call(I18N_TABLE, key)) return undefined;
    let out = I18N_TABLE[key];
    if (params) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v));
    return out;
  },
};

const REGISTRY = {
  'worksheet':  { tagged: true, available: true, violations: [], actions: { read: { params: [{ name: 'options', type: 'object', optional: true, help: 'JSDoc-Prosa zu options' }], returns: 'object', help: 'Liest alles' }, importCsv: { params: [{ name: 'csv', type: 'string', optional: false, help: 'CSV-Text' }], returns: 'boolean', help: '' } }, fields: { rows: { type: 'any[][]', help: 'Zeilen', bulk: true, derived: true } } },
  'five-why':   { tagged: false, available: false, violations: [], actions: {}, fields: { problem: { type: 'string', help: 'Problemstellung', bulk: false } } },
  'regression': { tagged: false, available: false, violations: [], actions: {}, fields: {} },
  'kano':       { tagged: false, available: false, violations: [], actions: {}, fields: {} },
};

function makeRegistry() {
  return {
    getAll: () => DEFS,
    get: (id) => DEFS.find(d => d.id === id),
    getActiveCycle: () => 'dmaic',
  };
}

function makeStateManager(phases) {
  return { get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined) };
}

const PHASES = {
  data:   [{ instanceId: 'ws-1', moduleId: 'worksheet', order: 0, state: {} }],
  define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0, state: {}, customName: 'Lagerausfall' }],
  analyze: [],
  extras: [],
};

suite('agent catalog — allowed phases', () => {
  test('a data module is only allowed in the data area', () => {
    assertDeepEqual(allowedPhasesFor(DEFS[0], 'dmaic'), ['data']);
  });

  test('a cycle-mapped module allows its primary phase first', () => {
    assertDeepEqual(allowedPhasesFor(DEFS[1], 'dmaic'), ['define']);
  });

  test('allowedPhases are appended after the primary phase', () => {
    assertDeepEqual(allowedPhasesFor(DEFS[2], 'dmaic'), ['analyze', 'measure']);
  });

  test('a module without a mapping for the active cycle lands in extras', () => {
    assertDeepEqual(allowedPhasesFor(DEFS[3], 'dmaic'), ['extras']);
  });
});

suite('agent catalog — module catalog', () => {
  test('lists ALL modules, not just released ones', () => {
    const catalog = buildCatalog({ moduleRegistry: makeRegistry(), i18n: I18N, registry: REGISTRY });
    assertDeepEqual(catalog.map(m => m.id), ['worksheet', 'five-why', 'regression', 'kano']);
  });

  test('available mirrors the generated registry', () => {
    const catalog = buildCatalog({ moduleRegistry: makeRegistry(), i18n: I18N, registry: REGISTRY });
    assertEqual(catalog.find(m => m.id === 'worksheet').available, true);
    assertEqual(catalog.find(m => m.id === 'five-why').available, false);
  });

  test('whenToUse prefers the dedicated key', () => {
    const catalog = buildCatalog({ moduleRegistry: makeRegistry(), i18n: I18N, registry: REGISTRY });
    assertEqual(catalog.find(m => m.id === 'five-why').whenToUse,
      'Wenn ein Einzelvorfall bis zur Wurzel verfolgt werden soll.');
  });

  test('whenToUse falls back to the existing description', () => {
    const catalog = buildCatalog({ moduleRegistry: makeRegistry(), i18n: I18N, registry: REGISTRY });
    assertEqual(catalog.find(m => m.id === 'worksheet').whenToUse, 'Tabellarische Datenerfassung');
  });

  test('a module missing from the registry is listed as unavailable, not dropped', () => {
    const catalog = buildCatalog({ moduleRegistry: makeRegistry(), i18n: I18N, registry: {} });
    assertEqual(catalog.length, 4);
    assertTrue(catalog.every(m => m.available === false));
  });
});

suite('agent catalog — instance list', () => {
  test('is flat across all phases and carries type, name and phase', () => {
    const list = buildInstanceList({ stateManager: makeStateManager(PHASES), i18n: I18N });
    assertDeepEqual(list, [
      { id: 'ws-1', module: 'worksheet', name: 'Datensammlung', phase: 'data' },
      { id: 'fw-1', module: 'five-why', name: 'Lagerausfall', phase: 'define' },
    ]);
  });

  test('an empty project yields an empty list, not null', () => {
    assertDeepEqual(buildInstanceList({ stateManager: makeStateManager({}), i18n: I18N }), []);
  });
});

suite('agent catalog — validator world', () => {
  test('the world has exactly the shape validateBatch consumes', () => {
    const world = buildWorld({ moduleRegistry: makeRegistry(), stateManager: makeStateManager(PHASES), i18n: I18N, registry: REGISTRY });
    assertEqual(typeof world.t, 'function');
    assertDeepEqual(world.phases, getAllPhaseIds('dmaic'));
    assertDeepEqual(world.modules.get('regression').allowedPhases, ['analyze', 'measure']);
    assertDeepEqual(world.instances.get('fw-1'), { module: 'five-why', phase: 'define' });
  });

  test('methods is null for a module without the release and a list for a released one', () => {
    const world = buildWorld({ moduleRegistry: makeRegistry(), stateManager: makeStateManager(PHASES), i18n: I18N, registry: REGISTRY });
    assertEqual(world.modules.get('five-why').methods, null);
    assertDeepEqual(world.modules.get('worksheet').methods.sort(), ['importCsv', 'read']);
  });

  // Review-Befund I1: die Singleton-Regel wird aus `def.singleton` an GENAU
  // dieser einen Stelle gelesen (`isSingleton`) und von Prüfer und
  // Ops-Verteidigung gemeinsam benutzt — nicht ein zweites Mal buchstabiert.
  test('the world carries the singleton flag of each module', () => {
    const world = buildWorld({ moduleRegistry: makeRegistry(), stateManager: makeStateManager(PHASES), i18n: I18N, registry: REGISTRY });
    assertEqual(world.modules.get('five-why').singleton, false);
    assertEqual(world.modules.get('worksheet').singleton, false);
  });

  // Ruling K6 (Koordinator): world.phases muss die Phasen-IDs des AKTIVEN
  // ZYKLUS tragen, nicht die bislang im Projektzustand befüllten Schlüssel —
  // sonst lehnt validateBatch jede Aktion mit `phase` fälschlich ab, sobald
  // eine Phase noch keine Instanz hat (z. B. ein frisches Projekt).
  test('phases come from the active cycle, not from already-touched state', () => {
    const world = buildWorld({ moduleRegistry: makeRegistry(), stateManager: makeStateManager({}), i18n: I18N, registry: REGISTRY });
    assertDeepEqual(world.phases, getAllPhaseIds('dmaic'));
    assertTrue(world.phases.length > 0);
  });

  test('buildWorld carries the completed flag of the project', () => {
    const world = buildWorld({
      moduleRegistry: makeRegistry(), stateManager: makeStateManager(PHASES), i18n: I18N,
      registry: REGISTRY, completed: true,
    });
    assertEqual(world.completed, true);
  });

  test('buildWorld defaults the completed flag to false when omitted', () => {
    const world = buildWorld({
      moduleRegistry: makeRegistry(), stateManager: makeStateManager(PHASES), i18n: I18N, registry: REGISTRY,
    });
    assertEqual(world.completed, false);
  });
});

suite('agent catalog — module.describe', () => {
  const HELP = {
    moduleId: 'five-why',
    sections: {
      overview: { de: { title: 'Überblick', blocks: [{ type: 'paragraph', content: 'Die 5-Why-Methode …' }] },
                  en: { title: 'Overview', blocks: [] } },
      practice: { de: { title: 'Praxis', blocks: [] }, en: { title: 'Practice', blocks: [] } },
    },
  };
  const deps = { moduleRegistry: makeRegistry(), i18n: I18N, registry: REGISTRY, getHelp: async () => HELP };

  test('lists the handbook sections without their prose by default', async () => {
    const out = await describeModule(deps, 'five-why');
    assertDeepEqual(out.sections, [{ id: 'overview', title: 'Überblick' }, { id: 'practice', title: 'Praxis' }]);
    assertEqual(out.prose, null);
  });

  test('sections: [id] adds exactly that section’s blocks', async () => {
    const out = await describeModule(deps, 'five-why', ['overview']);
    assertDeepEqual(Object.keys(out.prose), ['overview']);
    assertEqual(out.prose.overview.blocks[0].content, 'Die 5-Why-Methode …');
  });

  test('module.describe mit unbekanntem Modul meldet unknown_module statt einer Leerbeschreibung', async () => {
    // Ein Name, den die Modulregistry nicht kennt, bekam eine leere
    // Pseudo-Beschreibung mit `phase: 'extras'` — eine Antwort ohne Fehler für
    // ein Modul, das es nicht gibt. Erreichbar nur über eine Referenz, weil
    // Prüfstufe 5 einen wörtlichen Modulnamen abfängt.
    const out = await describeModule(deps, 'gibt-es-nicht');
    assertEqual(out.ok, false);
    assertEqual(out.error, 'unknown_module');
    assertDeepEqual(out.available, ['worksheet', 'five-why', 'regression', 'kano']);
  });

  test('ein bekanntes, aber nicht freigegebenes Modul bleibt eine Beschreibung', async () => {
    // `available: false` heißt beschrieben, nicht steuerbar — das ist KEIN
    // Fehler und muss weiter durchkommen.
    const out = await describeModule(deps, 'regression');
    assertEqual(out.ok, undefined, 'eine Beschreibung trägt kein ok-Feld');
    assertEqual(out.available, false);
    assertEqual(out.module, 'regression');
    assertEqual(out.phase, 'analyze');
  });

  test('an unknown section id is reported with the valid ids', async () => {
    const out = await describeModule(deps, 'five-why', ['nope']);
    assertEqual(out.ok, false);
    assertEqual(out.error, 'unknown_section');
    assertDeepEqual(out.available, ['overview', 'practice']);
  });

  test('actions and fields come from the generated registry', async () => {
    const out = await describeModule(deps, 'worksheet');
    assertDeepEqual(out.actions.map(a => a.name).sort(), ['importCsv', 'read']);
    assertEqual(out.actions.find(a => a.name === 'importCsv').params[0].type, 'string');
    assertEqual(out.fields.find(f => f.name === 'rows').bulk, true);
  });

  test('i18n context help wins over the JSDoc prose, for actions and their params', async () => {
    const out = await describeModule(deps, 'worksheet');
    const action = out.actions.find(a => a.name === 'importCsv');
    assertEqual(action.help, 'Ersetzt den Inhalt des aktiven Blatts durch die übergebenen CSV-Daten.');
    assertEqual(action.params[0].help, 'Der vollständige CSV-Text, inklusive Kopfzeile, falls vorhanden.');
  });

  test('a declared read surface is marked derived, a Model-derived one is not', async () => {
    // Der Extraktor erzeugt `derived: true` an jedem Feld, das aus einem
    // `@typedef {object} AgentRead` stammt. Ohne dieses Durchreichen kann ein
    // Agent eine erklärte Lesefläche nicht von der persistierten Model-Form
    // unterscheiden — und die Marke wäre erzeugt, aber von niemandem gelesen.
    const declared = await describeModule(deps, 'worksheet');
    assertEqual(declared.fields.find(f => f.name === 'rows').derived, true);
    const modelDerived = await describeModule(deps, 'five-why');
    assertEqual(modelDerived.fields.find(f => f.name === 'problem').derived, false);
  });

  test('ein generischer Setter beschreibt jeden Schlüssel einzeln — i18n vor JSDoc', async () => {
    // `setParam(key, value)` bündelt viele Eingaben. Die Registry trägt die
    // erklärte Schlüsselfläche (`keys`), und describe gibt je Schlüssel Typ
    // und Satz heraus — derselbe Satz, den die Oberfläche am Label zeigt.
    const registry = { ...REGISTRY, worksheet: { ...REGISTRY.worksheet, actions: {
      ...REGISTRY.worksheet.actions,
      setParam: {
        params: [{ name: 'key', type: "'alpha'|'k1'", optional: false, help: 'welcher' },
                 { name: 'value', type: 'string', optional: false, help: 'der Wert' }],
        returns: 'void', help: 'Setzt einen Parameter.',
        keysOf: 'Params',
        keys: { alpha: { type: 'string', help: 'JSDoc alpha' }, k1: { type: "'0.2'|'0.1'", help: 'JSDoc k1' } },
      },
    } } };
    const table = { ...I18N_TABLE, 'modules.worksheet.types.Params.alpha': 'Das Signifikanzniveau.' };
    const i18n = { ...I18N,
      exists: (key) => I18N.exists(key) || key === 'modules.worksheet.types.Params.alpha',
      t: (key, params) => (key in table ? table[key] : I18N.t(key, params)) };
    const out = await describeModule({ ...deps, registry, i18n }, 'worksheet');
    const action = out.actions.find(a => a.name === 'setParam');
    assertDeepEqual(action.keys, [
      { name: 'alpha', type: 'string', help: 'Das Signifikanzniveau.', keys: [] },
      { name: 'k1', type: "'0.2'|'0.1'", help: 'JSDoc k1', keys: [] },
    ]);
    // Eine verlässliche Form statt „mal da, mal nicht": die Vertragsform
    // (`OPS['module.describe'].result`) nennt `keys` an jeder Aktion.
    assertDeepEqual(out.actions.find(a => a.name === 'importCsv').keys, [],
      'eine Aktion ohne Schlüsselfläche trägt eine leere keys-Liste');
  });

  test('ein Ergebnisfeld beschreibt jede Kennzahl, verschachtelte Typedefs eingeschlossen', async () => {
    // Derselbe Satz je Typedef-Property (`types.<Typedef>.<property>`), egal
    // ob die Typedef an einem Setter oder an einem Lesefeld hängt.
    const registry = { ...REGISTRY, worksheet: { ...REGISTRY.worksheet, fields: {
      ...REGISTRY.worksheet.fields,
      result: {
        type: 'Result|null', help: 'das Ergebnis', bulk: false, derived: true, keysOf: 'Result',
        keys: {
          Cg: { type: 'number|null', help: 'JSDoc Cg' },
          biasTest: { type: 'BiasTest', help: 'JSDoc Test', keysOf: 'BiasTest',
            keys: { p: { type: 'number|null', help: 'JSDoc p' } } },
        },
      },
    } } };
    const table = { ...I18N_TABLE,
      'modules.worksheet.types.Result.Cg': 'Die Fähigkeit des Messsystems.',
      'modules.worksheet.types.BiasTest.p': 'Der p-Wert des Bias-Tests.' };
    const i18n = { ...I18N,
      exists: (key) => I18N.exists(key) || key.startsWith('modules.worksheet.types.') && key in table,
      t: (key, params) => (key in table ? table[key] : I18N.t(key, params)) };
    const out = await describeModule({ ...deps, registry, i18n }, 'worksheet');
    const result = out.fields.find(f => f.name === 'result');
    assertDeepEqual(result.keys, [
      { name: 'Cg', type: 'number|null', help: 'Die Fähigkeit des Messsystems.', keys: [] },
      { name: 'biasTest', type: 'BiasTest', help: 'JSDoc Test',
        keys: [{ name: 'p', type: 'number|null', help: 'Der p-Wert des Bias-Tests.', keys: [] }] },
    ]);
    assertDeepEqual(out.fields.find(f => f.name === 'rows').keys, []);
  });

  test('die Vertragsform von module.describe nennt keys an Aktionen, Feldern und Schlüsseln', () => {
    // Der Agent liest diese Form beim ersten interact() — und der Prüfer
    // lässt eine Referenz nur durch, wenn ihr Pfad in ihr steht.
    const shape = OPS['module.describe'].result;
    for (const path of ['actions.0.keys.0.help', 'fields.0.keys.0.type', 'fields.0.keys.0.keys']) {
      assertEqual(pathExistsInShape(shape, path).ok, true, `${path} fehlt in der Vertragsform`);
    }
  });

  test('i18n context help wins over the JSDoc prose for fields', async () => {
    const out = await describeModule(deps, 'worksheet');
    assertEqual(out.fields.find(f => f.name === 'rows').help,
      'Die Datenzeilen des aktiven Blatts, in Spaltenreihenfolge.');
  });

  test('the shared read key covers a module that carries no read key of its own', async () => {
    // `worksheet` hat keinen eigenen `actions.read.*`-Schlüssel. Ohne diesen
    // Rückfall bekäme der Agent die englische JSDoc-Prosa („Liest alles") —
    // und jedes der 72 Module müsste denselben Text kopieren.
    const out = await describeModule(deps, 'worksheet');
    const read = out.actions.find(a => a.name === 'read');
    assertEqual(read.help, 'Liefert den vollständigen Lesezustand dieser Instanz.');
    assertEqual(read.params[0].help, 'Optionale Auswahl der Massenfelder und Zeilenbereiche.');
  });

  test('a module-specific read key still wins over the shared one', async () => {
    const own = 'modules.worksheet.actions.read.help';
    const i18n = {
      ...I18N,
      exists: (key) => key === own || I18N.exists(key),
      t: (key, params) => (key === own ? 'Liest Blätter, Zeilen und die aktive Auswahl.' : I18N.t(key, params)),
    };
    const out = await describeModule({ ...deps, i18n }, 'worksheet');
    assertEqual(out.actions.find(a => a.name === 'read').help,
      'Liest Blätter, Zeilen und die aktive Auswahl.');
  });

  test('without any key the JSDoc prose is still the last resort', async () => {
    const i18n = {
      ...I18N,
      exists: (key) => (key.startsWith('modules.shared.') ? false : I18N.exists(key)),
    };
    const out = await describeModule({ ...deps, i18n }, 'worksheet');
    assertEqual(out.actions.find(a => a.name === 'read').help, 'Liest alles');
  });

  test('a module without a handbook describes with an empty section list', async () => {
    const out = await describeModule({ ...deps, getHelp: async () => null }, 'worksheet');
    assertDeepEqual(out.sections, []);
    assertEqual(out.prose, null);
  });
});

suite('agent usage contract', () => {
  test('derives the op list from the contract rather than repeating it', () => {
    const usage = buildUsage(I18N);
    assertEqual(usage.contract, 1);
    assertDeepEqual(Object.keys(usage.ops).sort(), [
      'catalog.read', 'instance.call', 'instance.open',
      'module.add', 'module.describe', 'module.remove', 'project.read',
    ]);
    assertDeepEqual(usage.ops['module.add'].params.module, { type: 'string', required: true });
  });

  test('names every error code the surface can return', () => {
    const usage = buildUsage(I18N);
    assertTrue(usage.errors.includes('consent_denied'));
    assertTrue(usage.errors.includes('module_not_agent_ready'));
    assertTrue(usage.errors.includes('validation_failed'));
  });

  test('carries the prose fields the agent needs, all non-empty', () => {
    const usage = buildUsage(I18N);
    for (const key of ['intro', 'call', 'actionForm', 'refForm', 'nullableForm', 'batchForm', 'errorForm', 'availability', 'limits', 'viewSwitch', 'keysForm']) {
      assertTrue(typeof usage[key] === 'string' && usage[key].length > 0, `usage.${key} missing`);
    }
  });

  test('die Nullable-Hülle, die der Vertrag wörtlich ausliefert, ist auch erklärt', () => {
    const usage = buildUsage(I18N);
    // `ops` gibt die Ergebnisform unverändert an den Agenten weiter — er
    // liest dort `view: { $nullable: … }`. Die Zusage muss deshalb BEIM
    // AGENTEN ankommen; ein Fall, der nur die Sprachdatei prüft, hätte den
    // Widerspruch zwischen `ops` und der Prosa nicht gefunden.
    assertTrue(Object.prototype.hasOwnProperty.call(usage.ops['project.read'].result.view, '$nullable'),
      'die Fläche liefert die Nullable-Hülle wörtlich aus');
    assertTrue(usage.nullableForm.includes('$nullable'),
      `nullableForm nennt die Hülle nicht: ${usage.nullableForm}`);
  });
});

suite('agent catalog — isSingleton', () => {
  test('true only for an explicit singleton flag', () => {
    assertEqual(isSingleton({ id: 'project-charter', singleton: true }), true);
    assertEqual(isSingleton({ id: 'five-why' }), false);
    assertEqual(isSingleton({ id: 'five-why', singleton: false }), false);
  });

  test('a missing definition is not a singleton', () => {
    assertEqual(isSingleton(null), false);
    assertEqual(isSingleton(undefined), false);
  });
});
