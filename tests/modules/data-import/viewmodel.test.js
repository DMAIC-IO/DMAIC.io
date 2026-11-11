/**
 * Datenimport: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, einer schlanken Vorlage und Attrappen für stateManager,
 * Event-Bus und Meldungen. Prüft den Lauf `parse` (Quelle in der Closure,
 * Entprellung, nur das Ergebnis des letzten Laufs), das Klemmen des aktiven
 * Blatts, das Senden über den Schreibplan und die Typbeschriftung der Vorschau.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/data-import/viewmodel/viewmodel.js';
import { setFields } from '../../../js/core/model.js';

const ID = 'data-import';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

/** Texte mit Parametern sichtbar; sonst der Schlüssel. */
const tf = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="dataImport"></div>';
  document.body.append(tpl);
}

/**
 * Modul einhängen. Der Store kennt die Phase `data` mit dieser Instanz; ein
 * neu angelegter Worksheet meldet sich sofort als aktiv (nicht eingehängt:
 * der Schreibplan läuft über den Store).
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'di-1': model };
  const phases = { data: [{ instanceId: 'di-1', moduleId: 'data-import', order: 0 }] };
  const notes = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  bus.on('module:added', ({ instanceId }) => queueMicrotask(() => bus.emit('module:activated', { instanceId })));
  const context = {
    instanceId: 'di-1',
    stateManager: {
      get(path) {
        if (path === 'phases') return phases;
        if (path.startsWith('phases.')) return phases[path.slice(7)];
        return undefined;
      },
      set(path, value) { phases[path.slice(7)] = value; },
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      removeModuleState: (id) => { delete states[id]; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k) => k, tf: () => tf, getLanguage: () => 'de' },
    eventBus: bus,
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await flush();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    vm, notes, states, phases,
    /** Einen Ablauf starten und sein Ergebnis liefern. */
    run: (name, args) => vm()._asyncTaskHost.start(name, args),
    /** Die auto-Abläufe zu Ende kommen lassen. */
    settle: () => vm()._asyncTaskHost.settle(5000),
  };
}

const CSV = 'A;B\n1;2\n3;4\n';
const csvOptions = (vm, over) => ({ csv: { ...vm.model.options.csv, ...over }, xlsx: { ...vm.model.options.xlsx }, aqdef: { ...vm.model.options.aqdef } });

suite('data-import: Viewmodel im Browser', () => {
  test('importText liest CSV ein; read() nennt die Spalten mit Typ', async () => {
    const h = await mount();
    const out = await h.run('importText', { text: CSV, format: 'csv' });
    assertEqual(out.status, 'done');
    assertDeepEqual(out.value, { sheets: 1 });
    const read = h.vm().read();
    assertDeepEqual(read.asyncTasks.parse.value.sheets[0].columns, [{ name: 'A', type: 'numeric' }, { name: 'B', type: 'numeric' }]);
    assertEqual(read.asyncTasks.parse.value.sheets[0].rowCount, 2);
    assertEqual(read.file.source, 'text');
    assertEqual(read.file.formatId, 'csv');
    assertDeepEqual(read.activeParams, ['options.csv.preset', 'options.csv.delimiter', 'options.csv.hasHeader', 'options.csv.skipRows']);
  });

  test('ein leerer Text ergibt null und einen Fehler unter asyncTasks.parse.error', async () => {
    const h = await mount();
    const out = await h.run('importText', { text: '', format: 'csv' });
    assertEqual(out.status, 'done');
    assertEqual(out.value, null);
    const status = h.vm().read().asyncTasks.parse;
    assertTrue(typeof status.error === 'string' && status.error !== '', 'Fehlertext fehlt');
    assertEqual(status.value, null);
  });

  test('format xlsx wird abgewiesen; der Grund nennt format', async () => {
    const h = await mount();
    const out = await h.run('importText', { text: CSV, format: 'xlsx' });
    assertEqual(out.status, 'rejected');
    assertTrue(/format/.test(out.reason), out.reason);
    assertEqual(h.vm().read().file, null);
  });

  test('zwei schnelle Wechsel des Trennzeichens: read() zeigt das Ergebnis des letzten Laufs', async () => {
    const h = await mount();
    await h.run('importText', { text: CSV, format: 'csv' });
    const vm = h.vm();
    setFields(vm.model, { options: csvOptions(vm, { delimiter: 'comma' }) });
    await flush();
    setFields(vm.model, { options: csvOptions(vm, { delimiter: 'semicolon' }) });
    await h.settle();
    const sheets = vm.read().asyncTasks.parse.value.sheets;
    assertEqual(sheets[0].columns.length, 2);
    assertEqual(vm.previewColumns.length, 2);
  });

  test('activeSheet über der Blattzahl: Vorschau und Senden nehmen Blatt 0', async () => {
    const h = await mount();
    await h.run('importText', { text: 'Tag;Preis\n2026-01-01;1,50 €\n2026-01-02;2,25 €\n', format: 'csv' });
    const vm = h.vm();
    setFields(vm.model, { activeSheet: 2 });
    await h.settle();
    assertEqual(vm.previewMeta, [tf('sheetCount', { count: 1 }), tf('columnCount', { count: 2 }), tf('rowCount', { count: 2 })].join(' · '));
    const out = await h.run('sendToWorksheet');
    assertEqual(out.status, 'done');
    const ws = h.states[out.value.instanceId];
    const cols = ws.sheets[0].state.columns;
    assertEqual(cols[0].name, 'Tag');
    assertEqual(cols[1].name, 'Preis');
  });

  test('selectSheet außerhalb der Blätter wirft mit param index', async () => {
    const h = await mount();
    await h.run('importText', { text: CSV, format: 'csv' });
    let err = null;
    try { h.vm().selectSheet({ index: 2 }); } catch (e) { err = e; }
    assertEqual(err?.param, 'index');
    h.vm().selectSheet({ index: 0 });
    assertEqual(h.vm().model.activeSheet, 0);
  });

  test('sendToWorksheet: neues Arbeitsblatt mit Spaltentypen date und currency', async () => {
    const h = await mount();
    await h.run('importText', { text: 'Tag;Preis\n2026-01-01;1,50 €\n2026-01-02;2,25 €\n2026-01-03;3,00 €\n', format: 'csv' });
    const out = await h.run('sendToWorksheet');
    assertEqual(out.status, 'done');
    const ws = h.states[out.value.instanceId];
    assertTrue(Boolean(ws), 'kein Arbeitsblatt im Store');
    const cols = ws.sheets[0].state.columns;
    assertEqual(cols[0].type, 'date');
    assertEqual(cols[1].type, 'currency');
    assertDeepEqual(cols[1].values.slice(0, 3), [1.5, 2.25, 3]);
    assertTrue(h.phases.data.some((i) => i.instanceId === out.value.instanceId), 'nicht in der Phase');
    assertDeepEqual(h.notes.at(-1), [tf('sentToWorksheet', { count: 2 }), 'success']);
  });

  test('sendToWorksheet direkt nach einer Optionsänderung sendet das neue Ergebnis', async () => {
    const h = await mount();
    await h.run('importText', { text: 'A;B;C\n1;2;3\n4;5;6\n', format: 'csv' });
    const vm = h.vm();
    assertEqual(vm.shownSheet.columns.length, 3);
    setFields(vm.model, { options: csvOptions(vm, { delimiter: 'comma' }) });
    const out = await h.run('sendToWorksheet');
    assertEqual(out.status, 'done');
    const cols = h.states[out.value.instanceId].sheets[0].state.columns.filter((c) => c.name);
    assertEqual(cols.length, 1);
    assertEqual(cols[0].name, 'A;B;C');
  });

  test('sendToWorksheet während parse läuft: wartet und sendet das neue Ergebnis', async () => {
    const h = await mount();
    await h.run('importText', { text: CSV, format: 'csv' });
    const vm = h.vm();
    assertEqual(vm.shownSheet.columns.length, 2);
    setFields(vm.model, { options: csvOptions(vm, { delimiter: 'comma' }) });
    await flush();
    assertEqual(vm.read().asyncTasks.parse.running, true);
    const out = await h.run('sendToWorksheet');
    assertEqual(out.status, 'done');
    const cols = h.states[out.value.instanceId].sheets[0].state.columns.filter((c) => c.name);
    assertEqual(cols.length, 1);
    assertEqual(cols[0].name, 'A;B');
  });

  test('sendToWorksheet abgebrochen, während er auf parse wartet: nichts gesendet', async () => {
    const h = await mount();
    await h.run('importText', { text: CSV, format: 'csv' });
    const vm = h.vm();
    setFields(vm.model, { options: csvOptions(vm, { delimiter: 'comma' }) });
    await flush();
    const before = h.phases.data.length;
    const pending = h.run('sendToWorksheet');
    vm._asyncTaskHost.cancel('sendToWorksheet');
    assertEqual((await pending).status, 'cancelled');
    await h.settle();
    await flush();
    assertEqual(h.phases.data.length, before, 'trotz Abbruch ein Worksheet angelegt');
  });

  test('sendToWorksheet ohne Daten liefert null', async () => {
    const h = await mount();
    const out = await h.run('sendToWorksheet');
    assertEqual(out.status, 'done');
    assertEqual(out.value, null);
  });

  test('typeLabel einer Datumsspalte ist t(typeDate)', async () => {
    const h = await mount();
    await h.run('importText', { text: 'Tag;Wert\n2026-01-01;1\n2026-01-02;2\n', format: 'csv' });
    const vm = h.vm();
    assertEqual(vm.previewColumns[0].typeLabel, vm.t('typeDate'));
    assertEqual(vm.previewColumns[1].typeLabel, vm.t('typeNumeric'));
  });

  test('file ohne Quelle (instance.set): Wert null, kein Fehler', async () => {
    const h = await mount();
    const vm = h.vm();
    setFields(vm.model, { file: { name: 'a.csv', size: 3, formatId: 'csv', source: 'file' } });
    await h.settle();
    const status = vm.read().asyncTasks.parse;
    assertEqual(status.value, null);
    assertEqual(status.error, null);
  });

  test('gespeicherte Datei nach dem Neuladen: Status ohne Fehler, kein Wert, auch mit activeSheet 3', async () => {
    const h = await mount({
      _schema: { version: '1.0' },
      file: { name: 'b.xlsx', size: 10, formatId: 'xlsx', source: 'file' },
      options: { csv: {}, xlsx: { hasHeader: true }, aqdef: {} },
      activeSheet: 3,
    });
    await h.settle();
    const status = h.vm().read().asyncTasks.parse;
    assertEqual(status.value, null);
    assertEqual(status.error, null);
    assertEqual(h.vm().read().activeSheet, 3);
    assertDeepEqual(h.vm().previewColumns, []);
  });
});
