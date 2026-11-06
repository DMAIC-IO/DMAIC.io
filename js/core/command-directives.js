/**
 * D.Mike — Kommando-Primitive (command-directives.js)
 *
 * Bausteine, die ein Kommando des deklarativen Models (core/model.js) aus
 * der Oberfläche auslösen, ohne Handler im Viewmodel:
 *
 * - `x-command="cmd"` am Knopf: Klick führt das Kommando aus.
 * - `x-command-form="cmd"` am `<form>` mit `x-param="name"` an den freien Feldern.
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
import { commandDefOf, confirmOf, fromAttr, currentOf, defaultOf, checkValue, cloneJSON } from './model.js';
import { requireKnownId } from './validate.js';
import { applyAttributes, readElement, writeElement, rejectionHint } from './field-directive.js';
import { clearRejection, markRejection } from './param-input.js';

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
 * @returns {{ model: any, notify: Function, dialog: any, i18n: any, moduleId: string, instanceId?: string, forms: Record<string, any> }}
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

/** Programmierfehler, die nicht als Ablehnung einer Eingabe gelten. */
const isBug = (err) => err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError;

/**
 * Das Öffnen scheiterte am Stand der Daten (z. B. die Position, die `current`
 * lesen soll, gibt es nicht mehr) — eine Meldung für den Nutzer. Alles andere,
 * was beim Öffnen wirft (unbekanntes Kommando, fest/frei-Konflikt, fehlender
 * Ref, Programmierfehler), ist ein Fehler der Vorlage und geht in die Konsole.
 */
class StartStateError extends Error {
  /** @param {any} cause */
  constructor(cause) { super(cause?.message ?? String(cause), { cause }); }
}

/**
 * Die Steuerung eines `<form x-command-form>`: Werte, Startwerte, Absenden,
 * Markieren. Fest ist ein Parameter mit `data-arg-*`, frei einer mit
 * `x-param`; mit `data-form` sind die freien Felder die des Formular-Schemas.
 * @param {any} Alpine @param {HTMLFormElement} formEl @param {string} baseCommand
 */
function createFormController(Alpine, formEl, baseCommand) {
  const ui = () => uiOf(Alpine, formEl, 'x-command-form');
  const formName = formEl.dataset.form ?? null;
  const forms = ui().forms ?? {};
  if (formName !== null) requireKnownId('form', formName, Object.keys(forms));
  const formDef = formName !== null ? forms[formName] : null;
  const values = Alpine.reactive({});
  /** @type {Map<string, { el: HTMLElement, spec: object }>} */
  const free = new Map();
  let command = baseCommand;
  /** @type {{ onSuccess: () => void, onUnchanged: () => void }|null} */
  let dialog = null;
  let start = {};

  const params = () => commandDef(ui(), command).params;
  const fixed = () => readFixedArgs(formEl, params());
  const specOf = (name) => (formDef ? formDef.schema.fields[name] : params()[name]);

  /**
   * Jeder Pflicht-Positionsparameter (index/idOf) ist fest — erst dann kann
   * `current` den Stand lesen. Ein Dialog-Formular vor dem ersten Öffnen ist
   * es nicht.
   */
  const complete = () => {
    const fx = fixed();
    return Object.entries(params()).every(([k, s]) => s.optional === true
      || (s.kind !== 'index' && s.kind !== 'idOf') || Object.hasOwn(fx, k));
  };

  /** Startwerte: Vorgaben, darüber current, mit Schema über fromParams. */
  const startValues = (withCurrent) => {
    const fx = fixed();
    const ps = params();
    const p = {};
    for (const [k, s] of Object.entries(ps)) if (!Object.hasOwn(fx, k)) p[k] = defaultOf(s);
    Object.assign(p, fx, withCurrent ? currentOf(ui().model, command, fx) : {});
    if (!formDef) return Object.fromEntries(Object.keys(ps).filter((k) => !Object.hasOwn(fx, k)).map((k) => [k, p[k]]));
    const mapped = formDef.fromParams(p) ?? {};
    return Object.fromEntries(Object.entries(formDef.schema.fields)
      .map(([k, s]) => [k, Object.hasOwn(mapped, k) ? mapped[k] : defaultOf(s)]));
  };

  const reset = (withCurrent) => {
    const next = startValues(withCurrent);
    for (const k of Object.keys(values)) if (!Object.hasOwn(next, k)) delete values[k];
    Object.assign(values, next);
    start = cloneJSON(next);
    for (const [name, { el, spec }] of free) {
      clearRejection(el);
      writeElement(el, spec, values[name]);
    }
  };

  const reject = (u, error) => {
    const hit = typeof error?.param === 'string' ? free.get(error.param) : undefined;
    if (!hit) { u.notify(error?.message ?? String(error), 'error'); return; }
    markRejection(hit.el, rejectionHint(hit.spec, u.i18n));
    hit.el.focus();
  };

  const submit = async () => {
    const names = [...free.keys()];
    if (!names.some((k) => JSON.stringify(values[k]) !== JSON.stringify(start[k]))) {
      dialog?.onUnchanged();
      return;
    }
    const u = ui();
    const fx = fixed();
    let args;
    try {
      const current = cloneJSON(values);
      const own = formDef ? formDef.toParams(current, fx) : Object.fromEntries(names.map((k) => [k, current[k]]));
      args = { ...own, ...fx };
    } catch (error) {
      reject(u, error);
      return;
    }
    const r = await runUiCommand(u, command, args);
    if (r.ok) {
      if (dialog) dialog.onSuccess();
      else reset(complete());
    } else if ('error' in r) {
      reject(u, r.error);
    }
  };

  return {
    values,
    formName,
    get command() { return command; },
    fixed,
    specOf,
    complete,
    reset,
    submit,
    /** @param {string} name @param {HTMLElement} el @param {object} spec */
    register(name, el, spec) { free.set(name, { el, spec }); },
    /** @param {string} name */
    unregister(name) { free.delete(name); },
    /** @param {string} name @param {string} moduleId @returns {string} */
    helpKeyOf(name, moduleId) {
      return formDef && !Object.hasOwn(params(), name)
        ? `modules.${moduleId}.forms.${formName}.${name}.help`
        : `modules.${moduleId}.actions.${command}.params.${name}`;
    },
    /**
     * Im Dialog öffnen: Kommando für dieses Öffnen, Startwerte mit current.
     * @param {{ command?: string, onSuccess: () => void, onUnchanged: () => void }} opts
     */
    open({ command: cmd, onSuccess, onUnchanged }) {
      command = cmd ?? baseCommand;
      commandDef(ui(), command);
      const fx = fixed();
      for (const name of free.keys()) {
        if (Object.hasOwn(fx, name)) throw new Error(`x-param="${name}": ${name} is also a fixed argument (data-arg-*)`);
      }
      dialog = { onSuccess, onUnchanged };
      try {
        reset(true);
      } catch (err) {
        throw isBug(err) ? err : new StartStateError(err);
      }
    },
    /** Nach dem Schließen: Kommando zurück, Markierungen weg. */
    close() {
      dialog = null;
      command = baseCommand;
      reset(complete());
    },
    /** Fokus auf das erste freie Feld, Cursor am Ende. */
    focusFirst() {
      const first = [...free.values()].map((f) => f.el)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
      if (!first) return;
      first.focus();
      if (first.tagName === 'TEXTAREA' || first.type === 'text') first.setSelectionRange(first.value.length, first.value.length);
    },
  };
}

/**
 * Das Element mit `x-ref="<ref>"` der umgebenden Komponente — registriert
 * (auch während es im Dialog ausgeliehen ist) oder noch im Template.
 * @param {any} Alpine @param {HTMLElement} el @param {string} ref
 * @returns {HTMLElement|null}
 */
function findRef(Alpine, el, ref) {
  const root = Alpine.closestRoot(el);
  // `_x_refs` ist Alpines Ablage der registrierten Refs.
  return root?._x_refs?.[ref] ?? root?.querySelector(`[x-ref="${CSS.escape(ref)}"]`) ?? null;
}

/** @param {HTMLElement} target @returns {HTMLFormElement|null} der Ref selbst oder das Formular darin */
function formIn(target) {
  return target.matches('form[x-command-form]') ? /** @type {HTMLFormElement} */ (target) : target.querySelector('form[x-command-form]');
}

/**
 * Den Ref im Dialog-Dienst öffnen. `onConfirm` sendet ab und liefert
 * `false`; geschlossen wird erst bei Erfolg über den confirm-Griff (dann
 * liefert `onConfirm` `true`). So wirft `onConfirm` nie, und eine Rückfrage
 * aus `confirm()` läuft asynchron dazwischen.
 * @param {any} Alpine @param {HTMLElement} el der Knopf @param {string} ref
 */
async function openDialog(Alpine, el, ref) {
  const ui = uiOf(Alpine, el, 'x-dialog');
  const target = findRef(Alpine, el, ref);
  if (!target) throw new Error(`x-dialog="${ref}": no element with x-ref="${ref}"`);
  const formEl = formIn(target);
  const ctl = formEl ? FORMS.get(formEl) : undefined;
  /** Vorheriger Wert (oder `null`) der Formular-Attribute, die der Knopf überschreibt. */
  const previous = new Map();
  const restoreArgs = () => {
    for (const [name, value] of previous) {
      if (value === null) formEl.removeAttribute(name); else formEl.setAttribute(name, value);
    }
  };
  if (formEl) {
    for (const { name, value } of [...el.attributes]) {
      if (name.startsWith('data-arg-')) { previous.set(name, formEl.getAttribute(name)); formEl.setAttribute(name, value); }
    }
  }
  let done = false;
  let api = null;
  const finish = () => { done = true; api?.confirm(); };
  try {
    ctl?.open({ command: el.dataset.dialogCommand, onSuccess: finish, onUnchanged: () => api?.cancel() });
  } catch (err) {
    restoreArgs();
    ctl?.close();
    throw err;
  }
  OPEN_DIALOGS.set(target, finish);
  const del = el.dataset.dialogDelete;
  try {
    await ui.dialog.form({
      title: el.dataset.dialogTitle ?? '',
      content: target,
      confirmLabel: ui.i18n.t(el.dataset.dialogConfirm ?? 'common.save'),
      hideConfirm: !ctl,
      onMount: (_body, handle) => { api = handle; ctl?.focusFirst(); },
      onConfirm: () => {
        if (done || !ctl) return true;
        ctl.submit();
        return false;
      },
      ...(del ? {
        onDelete: () => {
          if (done) return true;
          runUiCommand(ui, del, readFixedArgs(el, commandDef(ui, del).params)).then((r) => {
            if (r.ok) finish();
            else if ('error' in r) ui.notify(r.error?.message ?? String(r.error), 'error');
          });
          return false;
        },
      } : {}),
    });
  } finally {
    OPEN_DIALOGS.delete(target);
    restoreArgs();
    ctl?.close();
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

  Alpine.directive('command-form', (el, { expression }, { cleanup }) => {
    if (el.tagName !== 'FORM') throw new Error(`x-command-form must sit on a <form>, got <${el.tagName.toLowerCase()}>`);
    const name = expression.trim();
    const ui = uiOf(Alpine, el, 'x-command-form');
    commandDef(ui, name);
    const ctl = createFormController(Alpine, el, name);
    FORMS.set(el, ctl);
    Alpine.addScopeToNode(el, { form: ctl.values });
    setHelpKey(el, `modules.${ui.moduleId}.actions.${name}.help`);
    ctl.reset(ctl.complete());
    const onSubmit = (e) => { e.preventDefault(); ctl.submit(); };
    el.addEventListener('submit', onSubmit);
    cleanup(() => { el.removeEventListener('submit', onSubmit); FORMS.delete(el); });
  });

  Alpine.directive('param', (el, { expression }, { effect, cleanup }) => {
    const name = expression.trim();
    const formEl = el.closest('form');
    const ctl = formEl ? FORMS.get(formEl) : undefined;
    if (!ctl) throw new Error(`x-param="${name}" needs an enclosing <form x-command-form>`);
    const spec = ctl.specOf(name);
    if (!spec) {
      throw new Error(`x-param="${name}": ${ctl.formName !== null ? `not a field of ${ctl.formName}` : `not a parameter of ${ctl.command}`}`);
    }
    if (Object.hasOwn(ctl.fixed(), name)) throw new Error(`x-param="${name}": ${name} is also a fixed argument (data-arg-*)`);
    const ui = () => uiOf(Alpine, el, 'x-param');
    applyAttributes(el, spec);
    setHelpKey(el, ctl.helpKeyOf(name, ui().moduleId));
    ctl.register(name, el, spec);

    effect(() => writeElement(el, spec, ctl.values[name]));

    const onInput = () => {
      ctl.values[name] = readElement(el, spec);
      clearRejection(el);
    };
    const onChange = () => {
      const raw = readElement(el, spec);
      ctl.values[name] = raw;
      try {
        checkValue(spec, name, raw, { root: ui().model, params: { ...ctl.fixed(), ...cloneJSON(ctl.values) } });
        clearRejection(el);
      } catch (err) {
        if (isBug(err)) throw err;
        markRejection(el, rejectionHint(spec, ui().i18n));
      }
    };
    const live = el.type !== 'checkbox' && el.tagName !== 'SELECT';
    if (live) el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    cleanup(() => {
      if (live) el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
      ctl.unregister(name);
    });
  });

  Alpine.directive('dialog', (el, { expression }, { cleanup }) => {
    const ref = expression.trim();
    const ui = uiOf(Alpine, el, 'x-dialog');
    const target = findRef(Alpine, el, ref);
    if (!target) throw new Error(`x-dialog="${ref}": no element with x-ref="${ref}"`);
    for (const cmd of [el.dataset.dialogCommand, el.dataset.dialogDelete]) if (cmd) commandDef(ui, cmd);
    const cmd = el.dataset.dialogCommand ?? formIn(target)?.getAttribute('x-command-form')?.trim();
    if (cmd) setHelpKey(el, `modules.${ui.moduleId}.actions.${cmd}.help`);
    const onClick = () => {
      openDialog(Alpine, el, ref).catch((err) => {
        const current = Alpine.$data(el)?._ui;
        if (err instanceof StartStateError && current) current.notify(err.message, 'error');
        else console.error(err);
      });
    };
    el.addEventListener('click', onClick);
    cleanup(() => el.removeEventListener('click', onClick));
  });
}
