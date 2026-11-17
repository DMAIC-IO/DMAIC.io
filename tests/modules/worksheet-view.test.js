/**
 * Arbeitsblatt: das Viewmodel der Zielform im Browser (viewmodel/viewmodel.js)
 * mit dem echten Template (resources/view.html), den deutschen Texten
 * (resources/i18n/ui.de.json) und dem Widget `datagrid`. Prüft die
 * Verdrahtung: Einhängen, Blatt wechseln, Rückgängig nach `setCells`, ein
 * abgelehntes Viewmodel-Kommando, `worksheet:dataChanged` einmal je Frame und
 * die Fassade nach dem Löschen einer Spalte, auf die ein anderes Modul zeigt.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/worksheet/viewmodel/viewmodel.js';
import { WorksheetModel } from '../../js/modules/worksheet/domain/model.js';
import { readWorksheetModel, readWorksheetStored } from '../../js/modules/worksheet/domain/read.js';
import { createInstances } from '../../js/core/instances.js';
import { sheetCsv } from '../../js/modules/worksheet/io/export.js';
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
 * @param {{ completed?: boolean, form?: Function, workspace?: boolean }} [opts]
 *   `completed`: Projekt abgeschlossen; `form`: Ersatz für `dialog.form`;
 *   `workspace`: Container liegt im Arbeitsbereich (F4)
 */
async function mount(stored, opts = {}) {
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
  const saves = [];
  const project = { completed: opts.completed === true };
  const stateManager = {
    get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    set: () => {},
    getModuleState: (id) => states[id] ?? null,
    setModuleState: (id, s) => { states[id] = s; saves.push(s); },
    getProjectCycle: () => 'dmaic',
    getActiveProjectId: () => 'p1',
    isCompleted: () => project.completed,
  };
  const context = {
    instanceId: WS,
    stateManager,
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { confirm: async () => true, form: opts.form ?? (async () => false) },
    theme: 'light',
    language: 'de',
  };
  const inst = { ...mod };
  const container = document.createElement('div');
  container.style.height = '400px';
  if (opts.workspace) container.classList.add('app-workspace');
  document.body.append(container);
  mounted.push({ mod: inst, container });
  await inst.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    inst, container, vm, notes, events, stateManager, saves, project,
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
    // Wie readSync an einer eingehängten Instanz: der echte Lese-Haken `vm.read`.
    registerWorksheetReader(h.stateManager, (id, options) => h.vm().read(options));
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

  test('Lese-Haken: vm.read und readDetached liefern die Lesefläche des Arbeitsblatts, readStored den gespeicherten Stand', async () => {
    const stored = twoSheets();
    const h = await mount(stored);
    const sheet = h.vm().model.sheets[0];
    const opts = { sheetId: sheet.id, columns: [sheet.columns[0].id] };
    const live = h.vm().read(opts);
    assertDeepEqual(live, readWorksheetModel(h.vm().model, opts));
    assertEqual(live.columns[0].values.slice(0, 3).join(), '1,2,3');
    const model = mod.loadDetached(stored, { instanceId: 'ws-2', eventBus: null, stateManager: h.stateManager });
    assertDeepEqual(mod.readDetached(model, {}, opts), live);
    assertEqual(mod.readStored, readWorksheetStored);
    assertDeepEqual(mod.readStored(stored, opts), live);
  });

  test('Lese-Haken im Effekt: vm.read legt keine Abhängigkeiten an (Köpfe, Formeln, Zellen)', async () => {
    const h = await mount(twoSheets());
    const vm = h.vm();
    const sheet = vm.model.sheets[0];
    let runs = 0;
    const runner = Alpine.effect(() => { runs += 1; vm.read({ fields: ['sheets', 'columns', 'rows', 'formulas'] }); });
    assertEqual(runs, 1);
    // Direkt am reaktiven Model, ohne Kommando: kein Lesen im Effekt darf davon abhängen.
    sheet.columns[0].name = 'Neu';
    sheet.formulas[sheet.columns[1].id] = { 0: '=1' };
    await flush();
    Alpine.release(runner);
    assertEqual(runs, 1);
  });

  test('instances.readSync ohne Mount: ein Altstand wird migriert gelesen, ein aktueller über readStored', async () => {
    const h = await mount(twoSheets());
    const legacy = {
      sheets: [{ id: 's-alt', name: 'Alt', state: { rowCount: 2, columns: [{ id: 'c-a', name: 'A', type: 'numeric', values: [4, 5] }] } }],
      activeSheetId: 's-alt', sheetCounter: 1,
    };
    const states = { 'ws-alt': legacy, 'ws-neu': twoSheets() };
    const phases = { data: [{ instanceId: 'ws-alt', moduleId: ID, order: 0 }, { instanceId: 'ws-neu', moduleId: ID, order: 1 }] };
    const sm = {
      get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, st) => { states[id] = st; },
      isCompleted: () => false,
      getProjectCycle: () => 'dmaic',
    };
    const svc = createInstances({
      stateManager: sm,
      moduleRegistry: { loadModule: async () => mod, getLoaded: () => mod },
      workspace: { getLiveViewmodel: () => null, isPending: () => false },
      eventBus: { emit() {}, on() {}, off() {} },
      createData: () => ({}),
    });
    const alt = svc.readSync('ws-alt', { sheetId: 's-alt', columns: ['c-a'] });
    assertEqual(alt.columns[0].values.join(), '4,5');
    assertEqual(states['ws-alt']._schema?.version, '1.0', 'einmal migriert zurückgeschrieben');
    const neu = svc.readSync('ws-neu', { fields: ['sheets'] });
    assertDeepEqual(neu.sheets.map((s) => s.name), ['Sheet 1', 'Zweites']);
    void h;
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
    assertTrue(err !== null, 'Fehler erwartet');
    assertEqual(err.message, tr('selectCellFirst'));
  });

  // ─── Fix-Runde 1 ─────────────────────────────────────────────

  test('undo/redo sind Viewmodel-Kommandos der Agentenfläche: false bei leerem Verlauf, sonst true', async () => {
    const h = await mount(twoSheets());
    const { actions } = h.inst.agentEntry;
    assertTrue(Boolean(actions.undo) && Boolean(actions.redo), 'undo und redo für Agenten');
    assertEqual(h.vm().undo({}), false, 'leerer Verlauf');
    assertEqual(h.vm().redo({}), false, 'nichts zu wiederholen');
    const sheet = h.vm().model.sheets[0];
    h.vm().model.setCells({ sheetId: sheet.id, columnId: sheet.columns[1].id, startRow: 0, values: [42] });
    await settle();
    const before = h.events.length;
    assertEqual(h.vm().undo({}), true);
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], null, 'zurückgenommen');
    assertTrue(h.events.slice(before).some(([n, p]) => n === 'command:executed' && p.command === 'undo'), 'command:executed für undo');
    assertEqual(h.vm().canUndo, false, 'undo legt selbst keinen Schritt an');
    assertEqual(h.vm().canRedo, true);
    assertEqual(h.vm().redo({}), true);
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], 42, 'wiederholt');
    assertEqual(h.vm().canUndo, true);
    assertEqual(h.vm().canRedo, false, 'redo legt selbst keinen Schritt an');
  });

  test('undo/redo ohne Schritt senden kein worksheet:dataChanged, mit Schritt genau eines', async () => {
    const h = await mount(twoSheets());
    await frame();
    await flush();
    const before = h.changed();
    assertEqual(h.vm().undo({}), false);
    assertEqual(h.vm().redo({}), false);
    await frame();
    await flush();
    assertEqual(h.changed(), before, 'leerer Verlauf: kein Ereignis');
    const sheet = h.vm().model.sheets[0];
    h.vm().model.setCells({ sheetId: sheet.id, columnId: sheet.columns[1].id, startRow: 0, values: [3] });
    await frame();
    await flush();
    const afterSet = h.changed();
    assertEqual(h.vm().undo({}), true);
    await frame();
    await flush();
    assertEqual(h.changed(), afterSet + 1, 'Rückgängig meldet über die Umkehr-Kommandos');
  });

  test('undo im abgeschlossenen Projekt: false, nichts geändert', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    h.vm().model.setCells({ sheetId: sheet.id, columnId: sheet.columns[1].id, startRow: 0, values: [7] });
    await settle();
    h.project.completed = true;
    assertEqual(h.vm().undo({}), false);
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], 7);
  });

  test('Knöpfe Rückgängig/Wiederholen der Werkzeugleiste rufen die Kommandos', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    h.vm().model.setCells({ sheetId: sheet.id, columnId: sheet.columns[1].id, startRow: 0, values: [5] });
    await settle();
    h.$('[data-action="undo"]').click();
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], null);
    h.$('[data-action="redo"]').click();
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], 5);
  });

  test('Verlauf und Export erscheinen nicht doppelt in der Leiste des Arbeitsbereichs', async () => {
    const h = await mount(twoSheets());
    const actions = h.inst.getActions();
    assertTrue(actions.some((a) => a.history === 'undo'), 'Strg+Z des Arbeitsbereichs findet den Verlauf');
    assertTrue(actions.every((a) => a.hidden === true), `alle Kern-Aktionen verborgen: ${JSON.stringify(actions.map((a) => a.title))}`);
  });

  test('F4 bei offenem Zelleneditor: Bearbeitung abgebrochen, Text im Formel-Editor', async () => {
    let seen = null;
    const h = await mount(twoSheets(), {
      workspace: true,
      form: async () => { seen = { text: h.vm().state.formulaText, target: { ...h.vm().state.formulaTarget } }; return false; },
    });
    const sheet = h.vm().model.sheets[0];
    const cell = h.$('td[data-col-idx="1"][data-row-idx="2"]');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true, cancelable: true }));
    const ed = h.$('.cell-editor');
    assertTrue(ed !== null, 'Zelleneditor offen');
    ed.value = '=1+1';
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true, cancelable: true }));
    await settle();
    assertEqual(h.$('.cell-editor'), null, 'Zelleneditor zu');
    assertTrue(seen !== null, 'Formel-Editor geöffnet');
    assertEqual(seen.text, '=1+1', 'Text übernommen');
    assertEqual(seen.target.columnId, sheet.columns[1].id);
    assertEqual(seen.target.row, 2);
    assertEqual(h.vm().model.sheets[0].data.columns[1][2], null, 'nichts geschrieben');
  });

  test('Formel-Editor auf einer gesperrten Spalte: schließt still, nichts geschrieben', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    h.vm().model.setColumnMeta({ sheetId: sheet.id, columnId: sheet.columns[1].id, meta: { lock: 'hard' } });
    h.vm().state.formulaTarget = { sheetId: sheet.id, columnId: sheet.columns[1].id, row: 0 };
    h.vm().state.formulaText = '=1+1';
    assertEqual(h.vm().applyFormula(), true, 'Dialog schließt');
    assertEqual(h.notes.length, 0, `keine Meldung: ${JSON.stringify(h.notes)}`);
    assertEqual(h.vm().model.sheets[0].data.columns[1][0], null);
  });

  test('Formel-Editor: abgelehnte Formel meldet übersetzt und bleibt offen', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    h.vm().state.formulaTarget = { sheetId: sheet.id, columnId: sheet.columns[1].id, row: 99999 };
    h.vm().state.formulaText = '=1+1';
    assertEqual(h.vm().applyFormula(), false, 'Dialog bleibt offen');
    assertDeepEqual(h.notes, [[tr('formulaFailed'), 'error']]);
  });

  test('abgeschlossenes Projekt: Raster nur lesend, kein Umbenennen beim Einhängen, kein Speichern', async () => {
    const h = await mount(null, { completed: true });
    assertEqual(h.vm().gridConfig.readOnly, true);
    assertEqual(h.vm().model.sheets[0].name, 'Sheet 1', 'nicht umbenannt');
    assertEqual(h.saves.length, 0, 'nichts gespeichert');
  });

  test('offenes Projekt: Raster bearbeitbar', async () => {
    const h = await mount(twoSheets());
    assertEqual(h.vm().gridConfig.readOnly, false);
  });

  test('Einhängen ohne gespeicherten Stand: sofort gespeichert, einmal worksheet:dataChanged', async () => {
    const h = await mount(null);
    assertEqual(h.saves.length >= 1, true, 'sofort gespeichert');
    assertEqual(h.saves[0].sheets[0].name, `${tr('defaultSheetName')} 1`, 'mit dem Namen in der App-Sprache');
    await frame();
    await flush();
    assertEqual(h.changed(), 1, 'ein Ereignis');
  });

  test('Einhängen eines Altstands: migriert sofort gespeichert, einmal worksheet:dataChanged', async () => {
    const legacy = await (await fetch(new URL('./worksheet/fixtures/fresh-two-sheets.json', import.meta.url))).json();
    const h = await mount(legacy);
    assertEqual(h.saves.length >= 1, true, 'sofort gespeichert');
    assertEqual(h.saves[0]._schema?.version, '1.0', 'in der Zielform');
    await frame();
    await flush();
    assertEqual(h.changed(), 1, 'ein Ereignis');
  });

  test('Einhängen eines aktuellen Stands: nichts gespeichert, kein Ereignis', async () => {
    const h = await mount(twoSheets());
    await frame();
    await flush();
    assertEqual(h.saves.length, 0);
    assertEqual(h.changed(), 0);
  });

  test('confirmRoles: alle Rollen ein Schritt im Verlauf', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    const [a, b] = sheet.columns;
    const roles0 = [a.role, b.role];
    h.vm().confirmRoles({ sheetId: sheet.id, roles: [{ columnId: a.id, role: 'categorical' }, { columnId: b.id, role: 'ordinal' }] });
    await settle();
    assertDeepEqual(h.vm().model.sheets[0].columns.slice(0, 2).map((c) => c.role), ['categorical', 'ordinal']);
    assertEqual(h.vm().undo({}), true);
    await settle();
    assertDeepEqual(h.vm().model.sheets[0].columns.slice(0, 2).map((c) => c.role), roles0, 'ein Rückgängig nimmt beide zurück');
    assertEqual(h.vm().canUndo, false);
  });

  test('confirmRoles: eine unpassende Rolle bleibt, mit Warnung in der Konsole', async () => {
    const h = await mount(twoSheets());
    const sheet = h.vm().model.sheets[0];
    const role0 = sheet.columns[0].role;
    const warned = [];
    const ow = console.warn;
    console.warn = (...args) => warned.push(args.join(' '));
    try {
      h.vm().confirmRoles({ sheetId: sheet.id, roles: [{ columnId: sheet.columns[0].id, role: 'gibt-es-nicht' }] });
    } finally { console.warn = ow; }
    assertEqual(h.vm().model.sheets[0].columns[0].role, role0);
    assertTrue(warned.some((w) => w.includes('setColumnRole')), `Warnung: ${warned.join(' | ')}`);
  });

  test('exportAs csv: Datei data.csv mit BOM und dem Text der Altform, keine Meldung', async () => {
    const h = await mount(twoSheets());
    const blobs = [];
    const names = [];
    const { createObjectURL } = URL;
    const { click } = HTMLAnchorElement.prototype;
    URL.createObjectURL = (b) => { blobs.push(b); return 'blob:test'; };
    HTMLAnchorElement.prototype.click = function stubClick() { names.push(this.download); };
    try {
      h.vm().exportAs({ format: 'csv' });
      await settle();
    } finally {
      URL.createObjectURL = createObjectURL;
      HTMLAnchorElement.prototype.click = click;
    }
    assertDeepEqual(names, ['data.csv']);
    // Blob.text() schluckte das BOM: roh dekodieren.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blobs[0].arrayBuffer());
    const sheet = h.vm().model.sheets[0];
    assertEqual(text, `\ufeff${sheetCsv(sheet, 'de')}`);
    assertTrue(text.startsWith('\ufeffsep=;\r\nC1;'), 'Form der Altform');
    assertEqual(h.notes.length, 0, 'kein Erfolgs-Toast');
  });

  test('importFile: CSV ersetzt das Blatt (ein Schritt), Excel meldet nicht unterstützt', async () => {
    const h = await mount(twoSheets());
    assertEqual(h.$('[x-file-drop]').getAttribute('data-file-drop-accept'), '.csv,.tsv');
    await h.vm().importFile(new File(['x'], 'mappe.xlsx'));
    assertDeepEqual(h.notes.at(-1), [tr('importUnsupported', { ext: 'xlsx' }), 'error']);
    await h.vm().importFile(new File(['A;B\n1;2\n3;4\n'], 'daten.csv'));
    await settle();
    const sheet = h.vm().model.sheets[0];
    assertEqual(sheet.columns[0].name, 'A');
    assertEqual(sheet.data.columns[1][1], 4);
    assertEqual(h.notes.at(-1)[1], 'success');
    assertEqual(h.vm().undo({}), true);
    await settle();
    assertEqual(h.vm().model.sheets[0].data.columns[0].slice(0, 3).join(), '1,2,3', 'ein Rückgängig stellt das Blatt wieder her');
  });

  // Das Raster meldet die Auswahl entprellt (300 ms). Ein Knopf der Werkzeugleiste
  // direkt nach dem Klick in eine Zelle las sonst die ALTE Auswahl: „Löschen“
  // leerte die vorher gewählte Zelle, der Formel-Editor öffnete dort.
  test('Werkzeugleiste direkt nach einem Zellklick: Löschen trifft die neue Auswahl', async () => {
    const h = await mount(twoSheets());
    const click = (c, r) => {
      const cell = h.$(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    };
    click(0, 0);
    await new Promise((r) => setTimeout(r, 400)); // die erste Auswahl ist gemeldet
    click(0, 2);
    h.$('[data-action="delete"]').click();
    await settle();
    assertDeepEqual(h.vm().model.sheets[0].data.columns[0].slice(0, 3), [1, 2, null], 'neue Zelle geleert, alte unberührt');
  });

  test('Werkzeugleiste direkt nach einem Zellklick: der Formel-Editor öffnet an der neuen Zelle', async () => {
    let seen = null;
    const h = await mount(twoSheets(), {
      form: async () => { seen = { ...h.vm().state.formulaTarget }; return false; },
    });
    const click = (c, r) => {
      const cell = h.$(`td[data-col-idx="${c}"][data-row-idx="${r}"]`);
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    };
    click(0, 0);
    await new Promise((r) => setTimeout(r, 400));
    click(1, 2);
    h.$('[data-action="formula-editor"]').click();
    await settle();
    assertTrue(seen !== null, 'Formel-Editor geöffnet');
    assertEqual(seen.columnId, h.vm().model.sheets[0].columns[1].id);
    assertEqual(seen.row, 2);
  });

  test('destroy: eine noch nicht gemeldete Auswahl des Rasters landet im gespeicherten Stand', async () => {
    const h = await mount(twoSheets());
    const cell = h.$('td[data-col-idx="2"][data-row-idx="3"]');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    const sheetId = h.vm().model.activeSheetId;
    await h.inst.destroy();
    mounted.length = 0;
    h.container.remove();
    const saved = h.saves.at(-1);
    assertEqual(saved?.gridView?.[sheetId]?.selection?.activeRow, 3, 'Auswahl gespeichert');
  });
});
