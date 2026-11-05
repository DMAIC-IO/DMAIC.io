/**
 * D.Mike — Kommando-Primitive (command-directives.js)
 *
 * Bausteine, die ein Kommando des deklarativen Models (core/model.js) aus
 * der Oberfläche auslösen, ohne Handler im Viewmodel:
 *
 * - `x-command="cmd"` am Knopf: Klick führt das Kommando aus.
 *
 * Feste Argumente stehen als `data-arg-<kebab>` am Element und werden beim
 * Auslösen gelesen (`data-arg-from-col` → `fromCol`). Liefert `confirm` der
 * Kommando-Definition eine Rückfrage, fragt nur die Oberfläche
 * (`runUiCommand`), nie ein direkter Aufruf.
 *
 * Die Komponente liefert ihren Griff `_ui` (createModule): Model, notify,
 * dialog, i18n, moduleId, forms. Die Direktive merkt sich beim Einbau die
 * Daten der Komponente und liest `_ui` erst beim Auslösen — so läuft sie
 * auch weiter, wenn das Element später aus der Komponente heraus in einen
 * Dialog verschoben wird. CSP-tauglich: kein Ausdruck wird ausgewertet, der
 * Direktivenwert ist ein Name.
 */
import { commandDefOf, confirmOf, fromAttr } from './model.js';

const registered = new WeakSet();
/** Formular-Element → Steuerung. */
const FORMS = new WeakMap();
/** Inhalt eines offenen Dialogs → Abschluss bei Erfolg. */
const OPEN_DIALOGS = new WeakMap();

/** @param {string} directive @returns {Error} */
function missingUiError(directive) {
  return new Error(`${directive}: no command handle (_ui) — use it inside a createModule component with a defineModel model`);
}

/**
 * Der Griff `_ui` der umgebenden Komponente (jetzt gelesen).
 * @param {any} Alpine @param {HTMLElement} el @param {string} directive für die Meldung
 * @returns {{ model: any, notify: Function, dialog: any, i18n: any, moduleId: string, forms: Record<string, any> }}
 */
function uiOf(Alpine, el, directive) {
  const ui = Alpine.$data(el)?._ui;
  if (!ui) throw missingUiError(directive);
  return ui;
}

/** @param {{ model: any }} ui @param {string} name @returns {any} die Kommando-Definition */
function commandDef(ui, name) {
  return commandDefOf(ui.model, name);
}

/** @param {HTMLElement} el @param {string} key */
function setHelpKey(el, key) {
  if (!el.hasAttribute('data-help-key')) el.setAttribute('data-help-key', key);
}

/**
 * Die festen Argumente aus den `data-arg-*` eines Elements, gewandelt nach
 * der Spec des Parameters. Ein unbekannter Name bleibt Text — das Kommando
 * lehnt ihn ab.
 * @param {HTMLElement} el @param {Record<string, object>} params
 * @returns {Record<string, any>}
 * @throws {Error} für Parameter der Art object, list, record
 */
export function readFixedArgs(el, params) {
  const out = {};
  for (const [key, text] of Object.entries(el.dataset)) {
    if (!key.startsWith('arg') || key.length === 3) continue;
    const name = key.charAt(3).toLowerCase() + key.slice(4);
    out[name] = Object.hasOwn(params, name) ? fromAttr(params[name], text) : text;
  }
  return out;
}

/**
 * Ein Kommando aus der Oberfläche: Rückfrage (`confirm` der Definition,
 * immer als `danger`), dann das Kommando. Wirft nie.
 * @param {{ model: any, dialog: any, i18n: any, moduleId: string }} ui
 * @param {string} name @param {object} args
 * @returns {Promise<{ ok: true, result: any } | { ok: false, error: any } | { ok: false, cancelled: true }>}
 */
export async function runUiCommand(ui, name, args) {
  try {
    const ask = confirmOf(ui.model, name, args);
    if (ask) {
      const ok = await ui.dialog.confirm({ message: ui.i18n.t(`modules.${ui.moduleId}.${ask.key}`, ask.params), danger: true });
      if (!ok) return { ok: false, cancelled: true };
    }
    return { ok: true, result: ui.model[name](args) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Liegt `el` im Inhalt eines offenen Dialogs, diesen als erfolgreich schließen.
 * @param {HTMLElement} el
 */
function closeDialogAround(el) {
  for (let node = el; node; node = node.parentElement) {
    const finish = OPEN_DIALOGS.get(node);
    if (finish) { finish(); return; }
  }
}

/**
 * Die Direktiven registrieren. Vor `Alpine.start()` aufrufen; je Alpine-Instanz einmal.
 * @param {any} Alpine der Default-Export von csp.js
 * @returns {void}
 */
export function registerCommandDirectives(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);

  Alpine.directive('command', (el, { expression }, { cleanup }) => {
    const name = expression.trim();
    const data = Alpine.$data(el);
    const ui = data?._ui;
    if (!ui) throw missingUiError('x-command');
    const { params } = commandDef(ui, name);
    readFixedArgs(el, params);
    setHelpKey(el, `modules.${ui.moduleId}.actions.${name}.help`);
    const onClick = async () => {
      const current = data._ui;
      const r = await runUiCommand(current, name, readFixedArgs(el, params));
      if (r.ok) closeDialogAround(el);
      else if ('error' in r) current.notify(r.error?.message ?? String(r.error), 'error');
    };
    el.addEventListener('click', onClick);
    cleanup(() => el.removeEventListener('click', onClick));
  });
}

export { uiOf, commandDef, setHelpKey, closeDialogAround, FORMS, OPEN_DIALOGS };
