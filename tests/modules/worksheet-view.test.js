/**
 * Arbeitsblatt: das Viewmodel der Zielform im Browser (viewmodel/viewmodel.js)
 * mit dem echten Template (resources/view.html), den deutschen Texten
 * (resources/i18n/ui.de.json) und dem Widget `datagrid`. Prüft die
 * Verdrahtung: Einhängen, Blatt wechseln, Rückgängig nach `setCells`, ein
 * abgelehntes Viewmodel-Kommando, `worksheet:dataChanged` einmal je Frame und
 * die Fassade nach dem Löschen einer Spalte, auf die ein anderes Modul zeigt.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/worksheet/viewmodel/viewmodel.js';
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { readWorksheetModel } from '../../js/modules/worksheet/worksheet-read.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { registerFileDropDirective } from '../../js/core/file-drop-directive.js';
import { installWorksheetRevisions, createWorksheetData } from '../../js/core/worksheet-data.js';
import { registerWorksheetReader, resolveColumnRef } from '../../js/core/worksheet-columns.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const ID = 'worksheet';
const WS = 'ws-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const mounted = [];
let HTML = '';
let UI = null;

/** Deutscher Text eines Schlüssels mit `{name}`-Platzhaltern; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function prepare() {
  if (!UI) {
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    registerFileDropDirective(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    HTML = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  }
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = HTML;
}

/** Eine Arbeitsmappe mit zwei Blättern; das erste trägt Werte in C1. */
function twoSheets() {
  const m = new WorksheetModel();
  const first = m.sheets[0];
  m.setCells({ sheetId: first.id, columnId: first.columns[0].id, startRow: 0, values: [1, 2, 3] });
  m.addSheet({ name: 'Zweites' });
  m.activeSheetId = first.id;
  return m.toJSON();
}

/**
 * Das Arbeitsblatt einhängen.
 * @param {object|null} stored gespeicherter Stand
 */
async function mount(stored) {
  await prepare();
  while (mounted.length) {
    const old = mounted.pop();
    await old.mod.destroy();
    old.container.remove();
  }
  const handlers = [];
  const events = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { events.push([n, p]); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  installWorksheetRevisions(bus);
  const states = { [WS]: stored };
  const phases = { data: [{ instanceId: WS, moduleId: ID, order: 0 }] };
  const notes = [];
  const stateManager = {
    get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    set: () => {},
    getModuleState: (id) => states[id] ?? null,
    setModuleState: (id, s) => { states[id] = s; },
    getProjectCycle: () => 'dmaic',
    getActiveProjectId: () => 'p1',
    isCompleted: () => false,
  };
  const context = {
    instanceId: WS,
    stateManager,
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { confirm: async () => true, form: async () => false },
    theme: 'light',
    language: 'de',
  };
  const inst = { ...mod };
  const container = document.createElement('div');
  container.style.height = '400px';
  document.body.append(container);
  mounted.push({ mod: inst, container });
  await inst.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    inst, container, vm, notes, events, stateManager,
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
    /** `worksheet:dataChanged` dieser Instanz bisher. */
    changed: () => events.filter(([n, p]) => n === 'worksheet:dataChanged' && p?.instanceId === WS).length,
  };
}

suite('worksheet: Viewmodel der Zielform im Browser', () => {
  test('Einhängen: ein Reiter je Blatt, das aktive markiert, ein Raster', async () => {
    const h = await mount(twoSheets());
    const tabs = h.$$('.sheet-tab');
    assertEqual(tabs.length, 2);
    assertEqual(tabs[0].classList.contains('active'), true, 'erstes Blatt aktiv');
    assertEqual(h.$$('.widget-datagrid').length, 1, 'genau ein Raster');
    assertTrue(h.vm().statusDims.includes('5'), `Statuszeile nennt die Spalten: ${h.vm().statusDims}`);
  });

  test('Blatt wechseln: switchSheet setzt das aktive Blatt, der Reiter folgt', async () => {
    const h = await mount(twoSheets());
    const second = h.vm().model.sheets[1].id;
    h.vm().switchSheet({ id: second });
    await settle();
    assertEqual(h.vm().model.activeSheetId, second);
    assertTrue(h.$$('.sheet-tab')[1].classList.contains('active'), 'zweiter Reiter aktiv');
    assertEqual(h.$$('.widget-datagrid').length, 1, 'weiter genau ein Raster');
  });

  test('abgelehntes Viewmodel-Kommando: unbekanntes Blatt, nichts gewechselt', async () => {
    const h = await mount(twoSheets());
    const before = h.vm().model.activeSheetId;
    let err = null;
    try { h.vm().switchSheet({ id: 'gibt-es-nicht' }); } catch (e) { err = e; }
    assertTrue(err !== null && /unknown_sheet: gibt-es-nicht/.test(err.message), `Meldung: ${err?.message}`);
    assertEqual(h.vm().model.activeSheetId, before);
  });

  test('Rückgängig nach setCells: der Wert ist wieder leer, Wiederholen möglich', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    const col = sheet.columns[1].id;
    h.vm().model.setCells({ sheetId: sheet.id, columnId: col, startRow: 0, values: [42] });
    await settle();
    assertEqual(sheet.data.columns[1][0], 42);
    assertTrue(h.vm().canUndo, 'Rückgängig möglich');
    h.vm().undo();
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], null);
    assertTrue(h.vm().canRedo, 'Wiederholen möglich');
  });

  test('worksheet:dataChanged einmal je Frame nach drei Kommandos in einem Frame', async () => {
    const h = await mount(twoSheets());
    await frame();
    const before = h.changed();
    const sheet = h.vm().model.sheets[0];
    const col = sheet.columns[2].id;
    for (let r = 0; r < 3; r++) h.vm().model.setCells({ sheetId: sheet.id, columnId: col, startRow: r, values: [r] });
    assertEqual(h.changed(), before, 'noch nichts gesendet');
    await frame();
    await flush();
    assertEqual(h.changed(), before + 1, 'ein Ereignis für drei Kommandos');
    h.vm().switchSheet({ id: h.vm().model.sheets[1].id });
    await frame();
    await flush();
    assertEqual(h.changed(), before + 1, 'Blattwechsel ändert keine Daten');
  });

  test('Spalte gelöscht: columnRef eines anderen Moduls liefert über die Fassade null', async () => {
    const h = await mount(twoSheets());
    // Wie readSync an einer eingehängten Instanz: Lesen aus dem lebenden Model.
    registerWorksheetReader(h.stateManager, (id, options) => readWorksheetModel(h.vm().model, options));
    const sheet = h.vm().model.sheets[0];
    const ref = { instanceId: WS, sheetId: sheet.id, columnId: sheet.columns[0].id };
    const data = createWorksheetData(h.stateManager);
    assertEqual(resolveColumnRef(h.stateManager, ref)?.values.slice(0, 3).join(), '1,2,3');
    assertEqual(data.values(ref).slice(0, 3).join(), '1,2,3');
    h.vm().model.removeColumn({ sheetId: sheet.id, columnId: ref.columnId });
    await frame();
    await flush();
    assertEqual(resolveColumnRef(h.stateManager, ref), null);
    assertEqual(data.values(ref), null);
  });

  test('gridView: die Auswahl des Rasters steht je Blatt im Model und in der Statuszeile', async () => {
    const h = await mount(twoSheets());
    const sheetId = h.vm().model.activeSheetId;
    const selection = { startCol: 0, startRow: 0, endCol: 1, endRow: 2, activeCol: 0, activeRow: 0 };
    h.vm().gridView({ sheetId, colWidths: { c: 80 }, selection });
    await settle();
    assertEqual(h.vm().model.gridView[sheetId].selection.endRow, 2);
    assertEqual(h.vm().statusSelection, tr('statusSelection', { rows: 3, cols: 2 }));
  });

  test('Template: Spalte, Zeilen und Blatt über die Knöpfe, Reiter per Klick', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    const rows = sheet.data.rowCount;
    h.$('[data-action="add-col"]').click();
    await settle();
    assertEqual(h.vm().model.sheets[0].columns.length, 6, 'Spalte angehängt');
    h.$('[data-action="add-rows"]').click();
    await settle();
    assertEqual(h.vm().model.sheets[0].data.rowCount, rows + 10, 'zehn Zeilen');
    h.$('.sheet-tab-add').click();
    await settle();
    assertEqual(h.vm().model.sheets.length, 3, 'Blatt angelegt');
    assertEqual(h.vm().model.sheets[2].name, `${tr('defaultSheetName')} 3`);
    assertEqual(h.vm().model.activeSheetId, h.vm().model.sheets[2].id, 'neues Blatt aktiv');
    h.$$('.sheet-tab')[0].click();
    await settle();
    assertEqual(h.vm().model.activeSheetId, sheet.id, 'Klick auf den Reiter wechselt');
    assertEqual(h.notes.filter(([, type]) => type === 'error').length, 0, `keine Fehler: ${JSON.stringify(h.notes)}`);
  });

  test('frisches Arbeitsblatt: das erste Blatt heißt in der App-Sprache, ohne Verlaufsschritt', async () => {
    const h = await mount(null);
    assertEqual(h.vm().model.sheets[0].name, `${tr('defaultSheetName')} 1`);
    assertEqual(h.vm().canUndo, false);
  });

  test('openFormulaEditor ohne gewählte Zelle wird abgelehnt', async () => {
    const h = await mount(twoSheets());
    let err = null;
    try { h.vm().openFormulaEditor({}); } catch (e) { err = e; }
    assertTrue(err !== null, 'kein Fehler');
    assertEqual(err.message, tr('selectCellFirst'));
  });
});
