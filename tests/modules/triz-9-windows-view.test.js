/**
 * TRIZ 9-Windows: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Raster mit Beschriftungen,
 * Platzhaltern und Koordinaten, Hilfe-Anker, Titel, Beschriftungen und
 * Fenstertexte über `x-model` (gespeicherter Stand gültig, je ein
 * Verlaufsschritt), Bild über die Datei-Eingabe und das Ablegen, Fehltexte,
 * Entfernen mit Rückfrage, Großansicht, Rückgängig und Wiederholen, ids je
 * Instanz und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerFileDropDirective } from '../../js/core/file-drop-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import mod from '../../js/modules/triz-9-windows/viewmodel/viewmodel.js';
import { State } from '../../js/modules/triz-9-windows/domain/model.js';

const ID = 'triz-9-windows';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Wartet, bis `fn` wahr ist (höchstens rund 2 s). @param {() => boolean} fn */
async function until(fn) {
  for (let i = 0; i < 200 && !fn(); i++) await new Promise((r) => setTimeout(r, 10));
  await settle();
}

/**
 * Sichtbarkeit eines `x-show`-Elements nach einer Änderung prüfen. Alpine
 * blendet bei sichtbarem Dokument erst im nächsten Bild (requestAnimationFrame)
 * ein oder aus, `settle()` reicht dafür nicht: also auf den Zustand warten.
 * @param {HTMLElement} el @param {''|'none'} want @param {string} [msg]
 */
async function assertDisplay(el, want, msg) {
  await until(() => el.style.display === want);
  assertEqual(el.style.display, want, msg);
}

/** Text des Moduls unter einem Punktpfad, `{name}` aus `params`; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

async function prepare() {
  if (!prepared) {
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    registerFileDropDirective(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** Das 40×40-PNG der Fixture als Daten-URL. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAMElEQVR42u3NQQkAAAgEsOtkScMZyhKCn8H+S/W8iFgsFovFYrFYLBaLxWKxWHxnAbNKjEj+a4EuAAAAAElFTkSuQmCC';

/** Stand aus der Fixture `legacy-project.json` (mit `_schema` '1.0', wie die Altform ihn schrieb). */
const LEGACY = {
  _schema: { name: ID, version: '1.0' },
  systemTitle: 'Lastenrad für Bäckerei & Café <Größe XL> "Typ Kurier"',
  colLabels: ['Früher', '', 'Morgen'],
  rowLabels: ['Bauteil', 'Gerät', ''],
  cells: [
    [
      { text: 'Handkurbel mit Holzgriff\nKette ohne Schutz', image: null },
      { text: 'Riemenantrieb & Nabenschaltung <8 Gänge>', image: null },
      { text: 'Mittelmotor „leise“ — Drehmoment > 90 Nm', image: PNG },
    ],
    [
      { text: 'Lastenrad ohne Motor; schwer am Hang', image: null },
      { text: 'E-Lastenrad mit Kühlbox\nReichweite ca. 60 km', image: null },
      { text: '', image: null },
    ],
    [
      { text: 'Lieferung zu Fuß in der Altstadt', image: null },
      { text: 'Ladezonen & Fahrradstraßen "nur Anlieger"', image: PNG },
      { text: 'Autofreie Innenstadt mit Mikro-Depots\nZustellung < 15 min', image: null },
    ],
  ],
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Ein echtes PNG (Leinwand), als Datei.
 * @param {string} name @returns {Promise<File>}
 */
async function pngFile(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(30, 90, 200)';
  g.fillRect(0, 0, 8, 8);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean }} [opts] `keep`: vorher eingehängte Instanzen bleiben
 */
async function mount(instanceId, model, { keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const confirms = [];
  /** @type {any[]} */
  const shows = [];
  const answer = { ok: true };
  let closed = 0;
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'eightd',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: fakeChartManager(),
    notify: (...args) => { notes.push(args); },
    dialog: {
      confirm: async (opts) => { confirms.push(opts); return answer.ok; },
      show(opts) {
        shows.push(opts);
        let open = true;
        return { close: () => { if (!open) return; open = false; closed += 1; opts.onClose?.(); }, setTitle() {} };
      },
    },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const cell = (r, c) => q(`.triz-9w__cell[data-r="${r}"][data-c="${c}"]`);
  return {
    inst, states, notes, confirms, shows, answer, container, q, qa, cell,
    closed: () => closed,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    title: () => /** @type {HTMLInputElement} */ (q('[data-role="system-title"]')),
    colInput: (c) => /** @type {HTMLInputElement} */ (q(`[data-role="col-label"][data-c="${c}"]`)),
    rowInput: (r) => /** @type {HTMLInputElement} */ (q(`[data-role="row-label"][data-r="${r}"]`)),
    cellText: (r, c) => /** @type {HTMLTextAreaElement} */ (q(`[data-role="cell-text"][data-r="${r}"][data-c="${c}"]`)),
    coord: (r, c) => cell(r, c).querySelector('.triz-9w__cell-coord'),
    upload: (r, c) => /** @type {HTMLElement} */ (cell(r, c).querySelector('.triz-9w__upload')),
    fileInput: (r, c) => /** @type {HTMLInputElement} */ (cell(r, c).querySelector('[data-ref="file-input"]')),
    preview: (r, c) => /** @type {HTMLImageElement|null} */ (cell(r, c).querySelector('img[data-action="enlarge"]')),
    clearBtn: (r, c) => /** @type {HTMLButtonElement|null} */ (cell(r, c).querySelector('[data-action="clear-image"]')),
    images: () => plain(Alpine.$data(container.querySelector('[x-data]')).model.cells).map((row) => row.map((x) => x.image)),
    texts: () => plain(Alpine.$data(container.querySelector('[x-data]')).model.cells).map((row) => row.map((x) => x.text)),
    /** Ins Feld wechseln, Text tippen und das Feld verlassen. */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Datei über die Eingabe der Datei-Eingabe wählen (wie der Dateidialog). */
    choose: async (r, c, file) => {
      const input = /** @type {HTMLInputElement} */ (cell(r, c).querySelector('[data-ref="file-input"]'));
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    click: async (el) => { el.click(); await settle(); },
  };
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('triz-9-windows: Viewmodel im Browser', () => {
  test('Leerzustand: drei Spalten-, drei Zeilenbeschriftungen, neun Fenster, Platzhalter und Koordinaten aus den Vorgaben', async () => {
    const h = await mount('9w-1', null);
    assertEqual(h.qa('[data-role="col-label"]').length, 3);
    assertEqual(h.qa('[data-role="row-label"]').length, 3);
    assertEqual(h.qa('.triz-9w__cell').length, 9);
    assertEqual(h.qa('[data-role="cell-text"]').length, 9);
    const cols = [tr('colPast'), tr('colPresent'), tr('colFuture')];
    const rows = [tr('rowSub'), tr('rowSys'), tr('rowSuper')];
    for (let i = 0; i < 3; i++) {
      assertEqual(h.colInput(i).value, '');
      assertEqual(h.colInput(i).placeholder, cols[i]);
      assertEqual(h.colInput(i).getAttribute('aria-label'), tr('colAxisAria', { idx: i + 1 }));
      assertEqual(h.rowInput(i).value, '');
      assertEqual(h.rowInput(i).placeholder, rows[i]);
      assertEqual(h.rowInput(i).getAttribute('aria-label'), tr('rowAxisAria', { idx: i + 1 }));
    }
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        assertEqual(h.coord(r, c).textContent, `${rows[r]} · ${cols[c]}`);
        assertEqual(h.cellText(r, c).placeholder, tr('cellPlaceholder'));
        assertEqual(h.upload(r, c).style.display, '', `Bildknopf ${r}/${c} verborgen`);
        assertEqual(h.preview(r, c), null);
        assertEqual(h.fileInput(r, c).getAttribute('accept'), 'image/*');
      }
    }
    // Reihenfolge der Fenster in Zeilen und Spalten.
    assertDeepEqual(h.qa('.triz-9w__cell').map((el) => `${el.dataset.r}/${el.dataset.c}`),
      ['0/0', '0/1', '0/2', '1/0', '1/1', '1/2', '2/0', '2/1', '2/2']);
    assertEqual(h.title().placeholder, tr('systemPlaceholder'));
    assertEqual(h.q('.triz-9w__corner').title, tr('cornerTip'));
    assertEqual(h.q('.triz-9w__corner-rows').textContent.trim(), tr('axisRows'));
    assertEqual(h.q('.triz-9w__corner-cols').textContent.trim(), tr('axisCols'));
    assertEqual(h.q('.triz-9w__upload-btn').title, tr('addImage'));
    assertEqual(h.q('.triz-9w__upload-btn').textContent.trim(), tr('addImage'));
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Hilfe-Anker: Titel, beide Achsen, je Koordinate einer; Bild- und Löschknöpfe leer', async () => {
    const h = await mount('9w-1', plain(LEGACY));
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === k).length;
    assertEqual(count(`modules.${ID}.fields.systemTitle.help`), 1);
    assertEqual(count(`modules.${ID}.fields.rowLabels.help`), 1);
    assertEqual(count(`modules.${ID}.fields.colLabels.help`), 1);
    assertEqual(count(`modules.${ID}.fields.cells.help`), 9);
    assertEqual(keys.length, 12, keys.join(', '));
    assertEqual(h.q('.triz-9w__title-label').getAttribute('data-help-key'), `modules.${ID}.fields.systemTitle.help`);
    assertEqual(h.q('.triz-9w__corner-rows > span').getAttribute('data-help-key'), `modules.${ID}.fields.rowLabels.help`);
    assertEqual(h.q('.triz-9w__corner-cols > span').getAttribute('data-help-key'), `modules.${ID}.fields.colLabels.help`);
    for (const el of h.qa('.triz-9w__cell-coord-anchor')) {
      assertEqual(el.getAttribute('data-help-key'), `modules.${ID}.fields.cells.help`);
      assertTrue(!!el.querySelector('.triz-9w__cell-coord'), 'Koordinate nicht im Anker');
    }
    const uploads = h.qa('.triz-9w__upload-btn');
    assertEqual(uploads.length, 9);
    for (const el of uploads) assertEqual(el.getAttribute('data-help-key'), '');
    const clears = h.qa('.triz-9w__image-clear');
    assertEqual(clears.length, 2);
    for (const el of clears) {
      assertEqual(el.getAttribute('data-help-key'), '');
      assertTrue(el.hasAttribute('data-confirm-delete'), 'Löschknopf ohne Rückfrage');
      assertEqual(el.getAttribute('x-command'), 'clearImage');
      assertEqual(el.title, tr('clearImage'));
      assertEqual(el.getAttribute('aria-label'), tr('clearImage'));
      assertEqual(el.querySelector('[data-icon]').getAttribute('data-icon'), 'action.close');
      assertEqual(el.textContent.trim(), '');
    }
  });

  test('Titel, Beschriftung und Fenstertext schreiben ins Model, gespeichert gültig, je ein Verlaufsschritt, die anderen Fenster bleiben', async () => {
    const h = await mount('9w-1', null);
    const vm = h.vm();
    await h.type(h.title(), 'Lastenrad & Café <XL>');
    assertEqual(vm.model.systemTitle, 'Lastenrad & Café <XL>');
    assertEqual(h.states['9w-1'].systemTitle, 'Lastenrad & Café <XL>');
    assertValid(h.states['9w-1']);

    await h.type(h.colInput(1), 'Heute');
    assertDeepEqual(plain(vm.model.colLabels), ['', 'Heute', '']);
    assertDeepEqual(h.states['9w-1'].colLabels, ['', 'Heute', '']);
    assertEqual(typeof h.states['9w-1'].colLabels[1], 'string');
    assertValid(h.states['9w-1']);
    assertEqual(h.coord(0, 1).textContent, `${tr('rowSub')} · Heute`);
    assertEqual(h.coord(2, 1).textContent, `${tr('rowSuper')} · Heute`);
    assertEqual(h.colInput(0).value, '');
    assertEqual(h.colInput(2).value, '');

    await h.type(h.rowInput(2), 'Stadt');
    assertDeepEqual(plain(vm.model.rowLabels), ['', '', 'Stadt']);
    assertDeepEqual(h.states['9w-1'].rowLabels, ['', '', 'Stadt']);
    assertValid(h.states['9w-1']);
    assertEqual(h.coord(2, 0).textContent, `Stadt · ${tr('colPast')}`);

    await h.type(h.cellText(1, 2), 'Zeile 1\n"Spalte" 2 & <mehr>');
    const want = [['', '', ''], ['', '', 'Zeile 1\n"Spalte" 2 & <mehr>'], ['', '', '']];
    assertDeepEqual(h.texts(), want);
    assertDeepEqual(h.states['9w-1'].cells.map((row) => row.map((x) => x.text)), want);
    assertValid(h.states['9w-1']);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      assertEqual(h.cellText(r, c).value, want[r][c], `Fenster ${r}/${c}`);
    }

    // Vier Eingaben, vier Schritte: rückwärts in umgekehrter Reihenfolge.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Fenster) ohne Wirkung');
    await settle();
    assertEqual(h.cellText(1, 2).value, '');
    assertEqual(h.rowInput(2).value, 'Stadt');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Zeile) ohne Wirkung');
    await settle();
    assertEqual(h.rowInput(2).value, '');
    assertEqual(h.colInput(1).value, 'Heute');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Spalte) ohne Wirkung');
    await settle();
    assertEqual(h.colInput(1).value, '');
    assertEqual(h.states['9w-1'].colLabels[1], '');
    assertEqual(h.coord(0, 1).textContent, `${tr('rowSub')} · ${tr('colPresent')}`);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Titel) ohne Wirkung');
    await settle();
    assertEqual(h.title().value, '');
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Eingabe');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Titel) ohne Wirkung');
    await settle();
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Spalte) ohne Wirkung');
    await settle();
    assertEqual(h.title().value, 'Lastenrad & Café <XL>');
    assertEqual(h.colInput(1).value, 'Heute');
    assertEqual(h.states['9w-1'].colLabels[1], 'Heute');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Bild über die Datei-Eingabe: Model, Vorschau, Knopf verborgen, ein Schritt; dieselbe Datei nach dem Entfernen erneut', async () => {
    const h = await mount('9w-1', null);
    const vm = h.vm();
    const file = await pngFile('skizze.png');
    await h.choose(2, 1, file);
    await until(() => !!vm.model.cells[2][1].image);
    const url = vm.model.cells[2][1].image;
    assertTrue(url.startsWith('data:image/png;base64,'), url.slice(0, 30));
    assertDeepEqual(h.images(), [[null, null, null], [null, null, null], [null, url, null]]);
    assertEqual(h.states['9w-1'].cells[2][1].image, url);
    assertValid(h.states['9w-1']);
    assertEqual(h.preview(2, 1).getAttribute('src'), url);
    assertEqual(h.preview(2, 1).alt, tr('imageAlt', { row: tr('rowSuper'), col: tr('colPresent') }));
    await assertDisplay(h.upload(2, 1), 'none');
    assertEqual(h.upload(2, 0).style.display, '');
    assertEqual(h.fileInput(2, 1).value, '');
    assertTrue(h.inst.historyCan('undo'), 'kein Verlaufsschritt');

    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Bild) ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells[2][1].image, null);
    assertEqual(h.preview(2, 1), null);
    await assertDisplay(h.upload(2, 1), '');
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Bild');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Bild) ohne Wirkung');
    await settle();
    assertEqual(h.preview(2, 1).getAttribute('src'), url);

    // Entfernen und dieselbe Datei erneut wählen.
    await h.click(h.clearBtn(2, 1));
    await until(() => vm.model.cells[2][1].image === null);
    await h.choose(2, 1, file);
    await until(() => !!vm.model.cells[2][1].image);
    assertEqual(vm.model.cells[2][1].image, url);
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Ablegen auf dem Bildknopf: Zeile und Spalte des Knopfs, ein Schritt', async () => {
    const h = await mount('9w-1', null);
    const vm = h.vm();
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: { files: [await pngFile('drop.png')] } });
    h.upload(0, 2).querySelector('.triz-9w__upload-btn').dispatchEvent(e);
    await until(() => !!vm.model.cells[0][2].image);
    const imgs = h.images();
    assertTrue(imgs[0][2].startsWith('data:image/png;base64,'), String(imgs[0][2]).slice(0, 30));
    assertEqual(imgs.flat().filter(Boolean).length, 1);
    await assertDisplay(h.upload(0, 2), 'none');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells[0][2].image, null);
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Bild');
  });

  test('Kein Bild oder zu groß: übersetzte Meldung, Model unverändert', async () => {
    const h = await mount('9w-1', null);
    const vm = h.vm();
    await vm.uploadImage(new File(['x'], 'notiz.txt', { type: 'text/plain' }), { row: '1', col: '1' });
    await settle();
    await vm.uploadImage(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'gross.png', { type: 'image/png' }), { row: '1', col: '1' });
    await settle();
    assertDeepEqual(h.notes, [[tr('imageTypeError'), 'error'], [tr('imageTooLarge'), 'error']]);
    assertDeepEqual(h.images(), [[null, null, null], [null, null, null], [null, null, null]]);
    assertEqual(h.inst.historyCan('undo'), false);
    // Über die Eingabe: ebenso, die Eingabe ist danach leer.
    await h.choose(1, 1, new File(['x'], 'notiz.txt', { type: 'text/plain' }));
    await until(() => h.notes.length === 3);
    assertDeepEqual(h.notes[2], [tr('imageTypeError'), 'error']);
    assertEqual(h.fileInput(1, 1).value, '');
    assertEqual(vm.model.cells[1][1].image, null);
  });

  test('Entfernen mit Rückfrage: Abbrechen lässt das Bild, Bestätigen entfernt es in einem Schritt, der Text bleibt', async () => {
    const h = await mount('9w-1', plain(LEGACY));
    const vm = h.vm();
    h.answer.ok = false;
    await h.click(h.clearBtn(0, 2));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, 'common.confirmDelete');
    assertEqual(vm.model.cells[0][2].image, PNG);
    assertEqual(h.inst.historyCan('undo'), false);

    h.answer.ok = true;
    await h.click(h.clearBtn(0, 2));
    await until(() => vm.model.cells[0][2].image === null);
    assertEqual(h.confirms.length, 2);
    assertEqual(vm.model.cells[0][2].text, LEGACY.cells[0][2].text);
    assertEqual(vm.model.cells[2][1].image, PNG);
    assertEqual(h.states['9w-1'].cells[0][2].image, null);
    assertValid(h.states['9w-1']);
    assertEqual(h.preview(0, 2), null);
    await assertDisplay(h.upload(0, 2), '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Entfernen) ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells[0][2].image, PNG);
    assertEqual(h.preview(0, 2).getAttribute('src'), PNG);
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Entfernen');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells[0][2].image, null);
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Großansicht: Klick auf das Vorschaubild, Titel und Bild; Schließen räumt auf; ohne Bild nichts; Abbau schließt', async () => {
    const h = await mount('9w-1', plain(LEGACY));
    const vm = h.vm();
    assertEqual(vm.enlargedImageSrc, '');
    const open = h.preview(2, 1).closest('button');
    assertTrue(open.classList.contains('triz-9w__image-open'), 'Vorschaubild nicht im Knopf');
    assertEqual(open.type, 'button');
    await h.click(h.preview(2, 1));
    assertDeepEqual(plain(vm.state.enlarged), { row: 2, col: 1 });
    assertEqual(h.shows.length, 1);
    assertEqual(h.shows[0].title, tr('imageAlt', { row: tr('rowSuper'), col: tr('colPresent') }));
    assertEqual(h.shows[0].size, 'wide');
    const content = h.shows[0].content;
    assertTrue(content.classList.contains('triz-9w__enlarged'), content.className);
    assertEqual(vm.enlargedImageSrc, PNG);
    assertEqual(content.querySelector('img').getAttribute('src'), PNG);
    h.shows[0].onClose();
    await settle();
    assertEqual(vm.state.enlarged, null);
    assertEqual(vm.enlargedImageSrc, '');

    vm.enlarge(1, 1);
    vm.enlarge(3, 0);
    await settle();
    assertEqual(h.shows.length, 1, 'ein Fenster ohne Bild öffnet nichts');
    assertEqual(vm.state.enlarged, null);

    await h.click(h.preview(0, 2));
    assertEqual(h.shows.length, 2);
    assertEqual(h.shows[1].title, tr('imageAlt', { row: 'Bauteil', col: 'Morgen' }));
    // Die Großansicht ist kein Verlaufsschritt und ändert den Stand nicht.
    assertEqual(h.inst.historyCan('undo'), false);
    const closedBefore = h.closed();
    unmountAll();
    assertEqual(h.closed(), closedBefore + 1, 'Abbau schließt die Großansicht nicht');
  });

  test('zwei Instanzen: eindeutige ids, label[for] und aria-labelledby im eigenen Modul, Eingaben in B lassen A stehen', async () => {
    const a = await mount('9w-a', null);
    const b = await mount('9w-b', null, { keep: true });
    const ids = [...document.querySelectorAll('.triz-9w [id]')].map((el) => el.id);
    assertEqual(ids.length, 20);
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    for (const h of [a, b]) {
      const labels = h.container.querySelectorAll('label[for]');
      assertEqual(labels.length, 1);
      const target = document.getElementById(labels[0].htmlFor);
      assertTrue(!!target && h.container.contains(target) && target === h.title(), 'label[for] zeigt nicht auf den eigenen Titel');
      const areas = h.qa('[data-role="cell-text"]');
      assertEqual(areas.length, 9);
      for (const ta of areas) {
        const coord = document.getElementById(ta.getAttribute('aria-labelledby'));
        assertTrue(!!coord && h.container.contains(coord), `${ta.getAttribute('aria-labelledby')} zeigt nicht ins eigene Modul`);
        assertEqual(coord, h.coord(Number(ta.dataset.r), Number(ta.dataset.c)));
      }
    }
    await a.type(a.title(), 'A');
    await b.type(b.title(), 'B');
    await b.type(b.colInput(0), 'Gestern');
    await b.type(b.cellText(0, 0), 'nur B');
    await b.choose(1, 1, await pngFile('b.png'));
    await until(() => !!b.vm().model.cells[1][1].image);
    assertEqual(a.vm().model.systemTitle, 'A');
    assertDeepEqual(plain(a.vm().model.colLabels), ['', '', '']);
    assertEqual(a.vm().model.cells[0][0].text, '');
    assertEqual(a.vm().model.cells[1][1].image, null);
    assertEqual(b.vm().model.systemTitle, 'B');
    assertEqual(b.vm().model.cells[0][0].text, 'nur B');
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt, read() mit Bildgrößen', async () => {
    const h = await mount('9w-1', plain(LEGACY));
    assertEqual(h.title().value, LEGACY.systemTitle);
    assertDeepEqual([0, 1, 2].map((i) => h.colInput(i).value), LEGACY.colLabels);
    assertDeepEqual([0, 1, 2].map((i) => h.rowInput(i).value), LEGACY.rowLabels);
    assertEqual(h.colInput(1).placeholder, tr('colPresent'));
    assertEqual(h.rowInput(2).placeholder, tr('rowSuper'));
    const rows = ['Bauteil', 'Gerät', tr('rowSuper')];
    const cols = ['Früher', tr('colPresent'), 'Morgen'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      assertEqual(h.coord(r, c).textContent, `${rows[r]} · ${cols[c]}`);
      assertEqual(h.cellText(r, c).value, LEGACY.cells[r][c].text, `Fenster ${r}/${c}`);
      const withImage = LEGACY.cells[r][c].image !== null;
      assertEqual(h.preview(r, c)?.getAttribute('src') ?? null, LEGACY.cells[r][c].image, `Bild ${r}/${c}`);
      assertEqual(h.upload(r, c).style.display, withImage ? 'none' : '', `Bildknopf ${r}/${c}`);
    }
    assertEqual(h.inst.historyCan('undo'), false);
    const read = h.vm().read({ fields: ['systemTitle', 'colLabels', 'rowLabels', 'cells'] });
    const { _schema, ...fields } = plain(LEGACY);
    assertDeepEqual(read, {
      ...fields,
      cells: fields.cells.map((row) => row.map((x) => ({ text: x.text, image: x.image === null ? null : { $omitted: true, bytes: JSON.stringify(PNG).length } }))),
    });
    assertTrue(!JSON.stringify(h.vm().read()).includes('data:image/'), 'read() enthält Bilddaten');
    unmountAll();
  });
});
