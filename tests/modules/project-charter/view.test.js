/**
 * Project charter: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage resources/view.html und Attrappen für
 * stateManager, Event-Bus, Dialog und Meldungen. Prüft das Gerüst, die
 * Problembeschreibung über das Widget `rich-text` und die Ziele (Anlegen,
 * Klemmen der Zielerreichung, Markierung vergangener Daten, Löschen mit
 * zwei Klicks).
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/project-charter/viewmodel/viewmodel.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { todayISO, addDaysISO } from '../../../js/core/local-date.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'project-charter';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const mounted = [];
let ready = false;

/** Echte Vorlage unter ihrem Schlüssel; Direktiven wie in app.js. */
async function ensureTemplate() {
  if (ready) return;
  registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = html;
    document.body.append(tpl);
  }
  ready = true;
}

/**
 * Modul einhängen.
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  await ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'pc-1': model };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId: 'pc-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: bus,
    notify: () => {},
    dialog: { confirm: async () => true, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return { container, vm, states, $: (s) => container.querySelector(s), $$: (s) => [...container.querySelectorAll(s)] };
}

/** Feld einer Zielzeile. @param {{ $$: Function }} h @param {number} i @param {string} field */
const goalField = (h, i, field) => h.$$('.pc__goal-row')[i].querySelector(`[data-field="${field}"]`);

/** Wert tippen und das Feld verlassen (input, dann change). @param {HTMLInputElement} el @param {string} v */
function type(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

suite('project-charter view: Gerüst und Problembeschreibung', () => {
  test('Modul hängt ein: Problem, Ziele, Organigramm-Bereich', async () => {
    const h = await mount();
    assertTrue(h.$('.project-charter') !== null, 'kein Modulcontainer');
    assertEqual(h.$$('.pc__section').length, 3);
    assertTrue(h.$('.pc__org-section') !== null, 'Organigramm-Bereich fehlt');
    assertTrue(h.$('.pc__no-goals') !== null, 'Hinweis ohne Ziele fehlt');
  });

  test('x-field auf model.problemStatement rendert das Widget rich-text', async () => {
    const h = await mount({ problemStatement: 'Lieferzeit **zu lang**' });
    const editor = h.$('.pc__problem .rich-text__editor');
    assertTrue(editor !== null, 'kein Editor im Wirtselement');
    assertEqual(editor.getAttribute('contenteditable'), 'true');
    assertEqual(editor.querySelector('strong')?.textContent, 'zu lang');
    assertEqual(editor.getAttribute('aria-label'), 'problemStatement');
    assertTrue(h.$('.pc__problem .rich-text__count') !== null, 'Zähler fehlt');
  });

  test('Tippen im Editor schreibt Markdown ins Model', async () => {
    const h = await mount();
    const editor = h.$('.pc__problem .rich-text__editor');
    editor.textContent = 'Neu';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.problemStatement, 'Neu');
  });
});

suite('project-charter view: Ziele', () => {
  test('Ziel hinzufügen legt eine Zeile an und fokussiert ihre Beschreibung', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    assertEqual(h.vm().model.goals.length, 1);
    assertEqual(h.$$('.pc__goal-row').length, 1);
    assertEqual(h.$('.pc__no-goals'), null);
    assertEqual(document.activeElement, goalField(h, 0, 'description'));
    h.$('.pc__add-btn').click();
    await settle();
    assertEqual(document.activeElement, goalField(h, 1, 'description'));
  });

  test('Zielerreichung ist ein Zahlfeld 0..100 (Pfeiltasten, Spinner)', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    const input = goalField(h, 0, 'achievementLevel');
    assertEqual(input.type, 'number');
    assertEqual(input.min, '0');
    assertEqual(input.max, '100');
    type(input, '55');
    await settle();
    assertEqual(h.vm().model.goals[0].achievementLevel, 55);
  });

  test('Zielerreichung 150 wird beim Verlassen auf 100 geklemmt, ohne Ablehnung', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    const input = goalField(h, 0, 'achievementLevel');
    type(input, '150');
    await settle();
    assertEqual(h.vm().model.goals[0].achievementLevel, 100);
    assertEqual(input.value, '100');
    assertEqual(input.getAttribute('aria-invalid'), null);
    assertTrue(h.$('.pc__zeg-done') !== null, 'Häkchen bei 100 fehlt');
    assertTrue(h.$('.pc__zeg-wrap').classList.contains('pc__zeg-level--done'), 'Farbstufe fehlt');
    type(input, '-10');
    await settle();
    assertEqual(h.vm().model.goals[0].achievementLevel, 0);
    assertEqual(input.value, '0');
    assertTrue(h.$('.pc__zeg-wrap').classList.contains('pc__zeg-level--low'), 'Farbstufe low fehlt');
  });

  test('Zieldatum gestern wird markiert, heute nicht', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    const input = goalField(h, 0, 'targetDate');
    type(input, addDaysISO(todayISO(), -1));
    await settle();
    assertEqual(h.vm().model.goals[0].targetDate, addDaysISO(todayISO(), -1));
    assertTrue(input.classList.contains('pc__date--past'), 'gestern nicht markiert');
    type(input, todayISO());
    await settle();
    assertTrue(!input.classList.contains('pc__date--past'), 'heute markiert');
  });

  test('Löschen: erster Klick fragt nach, zweiter löscht', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    const id = h.vm().model.goals[0].id;
    h.$('.pc__del-btn').click();
    await settle();
    assertEqual(h.vm().state.confirmGoalId, id);
    assertTrue(h.$('.pc__del-btn').classList.contains('btn--danger'), 'keine Nachfrage sichtbar');
    assertEqual(h.vm().model.goals.length, 1);
    h.$('.pc__del-btn').click();
    await settle();
    assertEqual(h.vm().model.goals.length, 0);
    assertEqual(h.vm().state.confirmGoalId, null);
  });

  test('Klick außerhalb der Zeile nimmt die Nachfrage zurück', async () => {
    const h = await mount();
    h.$('.pc__add-btn').click();
    await settle();
    h.$('.pc__del-btn').click();
    await settle();
    h.$('.pc__no-goals, .dmike-split__output-section').click();
    await settle();
    assertEqual(h.vm().state.confirmGoalId, null);
    assertEqual(h.vm().model.goals.length, 1);
  });

  test('Vorschau der Zeilen-Geste markiert gezogene und Zielzeile', async () => {
    const h = await mount({
      goals: ['a', 'b', 'c'].map((id) => ({ id, description: id, targetDate: '', metric: '', targetValue: '', achievementLevel: 0 })),
    });
    h.vm().state.goalDragPreview = { id: 'c', index: 0 };
    await settle();
    const rows = h.$$('.pc__goal-row');
    assertTrue(rows[2].classList.contains('dmike-table__row--dragging'), 'gezogene Zeile');
    assertTrue(rows[0].classList.contains('dmike-table__row--drop-target'), 'Zielzeile');
  });
});
