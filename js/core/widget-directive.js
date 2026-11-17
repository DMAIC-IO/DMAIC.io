/**
 * D.Mike — Direktive x-widget (widget-directive.js)
 *
 * `<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel">`
 * hängt ein Widget aus der Registry ein. Jede Eingabe `x-widget-<prop>`
 * (kebab-case) ist ein Pfad im Scope des Hosts; sie wird in einem Effect
 * gelesen, gegen die Feldart des Widgets geprüft und reaktiv gespiegelt.
 * Ein Zeichenkettenliteral (`x-widget-algo-id="'grr'"`) ist ein fester Wert:
 * einmal geprüft, ohne Effect.
 * `x-widget-value` bindet einen Wert über den Wertkanal (prüfender Setter).
 * Ausgang: `command(name, args)` in den Mount-Optionen führt ein Kommando des
 * Hosts aus (Model vor Viewmodel, wie `x-command`) und liefert dessen Ergebnis;
 * einen unbekannten Namen meldet es per console.warn und gibt `{ ok: false }`.
 * Das Widget besitzt sein Element allein: eigener Daten-Stack an der
 * Wurzel, kein `x-data` — Namen des Hosts fallen nicht durch. Fehlbindungen
 * werfen nicht (Alpine initialisierte sonst die Geschwister nicht), sie
 * zeigen das Widget im Fehlerzustand und gehen per console.warn hinaus.
 */
import { checkValue } from './model.js';
import { TableData } from './table-data.js';
import { openChannel } from './value-channel.js';
import { cloneTemplate } from './dom.js';
import { clearRejection, markRejection } from './param-input.js';
import { isUiCommand, runUiCommand } from './command-directives.js';

const registered = new WeakMap();
/** Zeichenkettenliteral als gebundener Wert: `'text'` (ohne Apostroph im Inneren). */
export const WIDGET_LITERAL = /^'([^']*)'$/;
const PROP_ATTR = /^x-widget-([a-z][a-z0-9-]*)$/;

/** @param {string} kebab @returns {string} */
const camel = (kebab) => kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** @param {string} name @returns {string} */
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Pfad lesen (`a.b.c`); CSP: kein Ausdruck.
 * @param {object} scope @param {string} path @returns {any}
 */
function readPath(scope, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}

/**
 * Das Widget mit passendem `forKind` zu einer Feldbeschreibung (`list(columnRef)` zählt als `columnRef`).
 * @param {Record<string, { schema: any }>} widgets @param {object} spec @returns {string|null}
 */
export function widgetForKind(widgets, spec) {
  const kind = spec.kind === 'list' && /** @type {any} */ (spec).item?.kind === 'columnRef' ? 'columnRef' : spec.kind;
  return Object.keys(widgets).find((n) => widgets[n].schema?.forKind === kind) ?? null;
}

/**
 * Eingabewert tief kopieren. Gelesen wird durch die reaktive Hülle (jede verschachtelte Lesung wird verfolgt),
 * geschrieben in eine einfache Kopie; Schlüssel mit `undefined` fallen weg, Zahlen müssen endlich sein
 * (`NaN`/`Infinity` werden mit Feldname gemeldet statt still zu `null`). Danach `structuredClone` für Sonderwerte (Date, Map, …).
 * @param {any} Alpine @param {any} value @param {string} field @returns {any}
 */
function cloneInput(Alpine, value, field) {
  const bad = (at, v, why) => new Error(`invalid ${at} ${String(v)}; allowed: ${why}`);
  const seen = new WeakSet();
  const bare = (v, at) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw bad(at, v, 'any finite number');
    if (typeof v === 'function' || typeof v === 'symbol') throw bad(at, v, 'plain data');
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw bad(at, '[circular]', 'plain data');
    seen.add(v);
    try {
      if (Array.isArray(v)) return Array.from({ length: v.length }, (_, i) => bare(v[i], `${at}[${i}]`));
      if (Object.getPrototypeOf(v) === Object.prototype) {
        const out = {};
        for (const k of Object.keys(v)) {
          const x = v[k];
          if (x !== undefined) out[k] = bare(x, `${at}.${k}`);
        }
        return out;
      }
      return Alpine.raw(v);
    } finally { seen.delete(v); }
  };
  const copy = bare(value, field);
  try { return structuredClone(copy); } catch (err) { throw bad(field, Object.prototype.toString.call(copy), `plain data (${err.message})`); }
}

/**
 * Ein Widget an `el` einhängen. Auch von `x-field` für Widget-Feldarten benutzt.
 * @param {any} Alpine
 * @param {HTMLElement} el Wirtselement
 * @param {string} name
 * @param {{ schema: any, mount: Function, view?: Function, template?: string }|undefined} entry
 * @param {{ valuePath: string|null, channel?: import('./value-channel.js').ValueChannel, i18n: any, effect: Function, cleanup: Function }} opts `channel`: der schon geöffnete Wertkanal (von `x-field`)
 * @returns {void}
 */
export function mountWidget(Alpine, el, name, entry, { valuePath, channel, i18n, effect, cleanup }) {
  const where = `x-widget="${name}"`;
  const root = document.createElement('div');
  root.className = 'widget-root';
  el.append(root);
  const fail = (message) => {
    root.classList.add('widget-root--error');
    root.textContent = i18n.t('common.widget.bindError', { message });
    console.warn(`${where}: ${message}`);
  };
  if (!entry) { fail(`unknown widget ${name}`); return; }
  if (!entry.schema) { fail(`widget ${name} has no schema`); return; }
  if (typeof entry.mount !== 'function') { fail(`widget ${name} has no mount function`); return; }
  const { schema } = entry;
  const host = Alpine.$data(el);
  const services = Alpine.raw(host._ui?.services ?? null);
  if (!services) { fail('no services in scope (module or tile of the new form)'); return; }

  const bound = new Map();
  for (const attr of el.getAttributeNames()) {
    const m = PROP_ATTR.exec(attr);
    if (!m || m[1] === 'value') continue;
    bound.set(camel(m[1]), el.getAttribute(attr).trim());
  }
  for (const p of bound.keys()) if (!Object.hasOwn(schema.props, p)) { fail(`unknown input x-widget-${kebab(p)}`); return; }
  for (const [p, s] of Object.entries(schema.props)) {
    if (!bound.has(p) && s.optional !== true) { fail(`missing x-widget-${kebab(p)}`); return; }
  }
  if (valuePath !== null && !schema.value) { fail(`${name} takes no x-widget-value`); return; }

  // Das Widget ist lebendig, bis sein Element abgebaut wird; das Aufräumen steht vor dem Einhängen,
  // damit ein Abbau während des Mounts nichts zurücklässt.
  let alive = true;
  let handle = null;
  cleanup(() => {
    alive = false;
    handle?.destroy?.();
    handle = null;
    Alpine.destroyTree(root);
    root.remove();
  });

  const props = Alpine.reactive({});
  // Bewusst nicht reaktiv: sonst läse jeder Effekt über `showError` die Fehler der anderen Eingaben mit.
  const errors = {};
  const crashed = new Set();
  let mounted = false;
  let released = false;
  const showError = () => root.classList.toggle('widget-root--error', Object.keys(errors).length > 0 || crashed.size > 0);
  /**
   * Alle Effekte des Widgets (Eingaben und Mount) laufen hier durch: ein werfender Lauf bliebe sonst in Alpines Flush stecken
   * und hielte die ganze Reaktivität an. Nach Abbau oder Mount-Fehler tut ein Effekt nichts mehr und liest nichts mehr.
   * `key` benennt den Effekt stabil (`prop:<Eingabe>` beziehungsweise `<widget>#<laufende Nummer>` je Mount-Effekt).
   */
  const guarded = (key, fn, ...rest) => effect(() => {
    if (!alive || released) return;
    try {
      fn();
      if (crashed.delete(key) && mounted) showError();
    } catch (err) {
      crashed.add(key);
      console.warn(`${where}: ${err?.message ?? err}`);
      if (mounted) showError();
      else root.classList.add('widget-root--error');
    }
  }, ...rest);
  /** Mount fehlgeschlagen: Effekte stilllegen, Fehlerzustand zeigen. */
  const abort = (message) => {
    released = true;
    handle?.destroy?.();
    handle = null;
    root.replaceChildren();
    fail(message);
  };

  for (const [p, path] of bound) {
    const spec = schema.props[p];
    const lit = WIDGET_LITERAL.exec(path);
    if (lit) {
      try { props[p] = checkValue(spec, `${name}.${p}`, lit[1]); } catch (err) { errors[p] = String(err.message); }
      continue;
    }
    guarded(`prop:${p}`, () => {
      try {
        const raw = readPath(host, path);
        if (spec.kind === 'table') {
          // Nur Art und Identität (P7): kein checkValue, kein Kopieren — sonst O(n) je Effekt.
          const t = Alpine.raw(raw);
          if (t === undefined && spec.optional === true) props[p] = undefined;
          else if (t instanceof TableData) props[p] = t;
          else throw new Error(`${name}.${p}: expected a TableData`);
        } else props[p] = raw === undefined && spec.optional === true
          ? undefined
          : checkValue(spec, `${name}.${p}`, cloneInput(Alpine, raw ?? null, `${name}.${p}`));
        delete errors[p];
      } catch (err) {
        errors[p] = String(err.message);
        // Beim Einhängen meldet `fail` gesammelt; erst Wiederläufe warnen selbst.
        if (mounted) console.warn(`${where}: ${err.message}`);
      }
      if (mounted) showError();
    });
  }
  if (Object.keys(errors).length) { abort(Object.values(errors).join('; ')); return; }

  try {
    let value = null;
    if (valuePath !== null) {
      const ch = channel ?? openChannel(Alpine, el, valuePath, { where: 'x-widget-value', i18n });
      const set = (v) => {
        const ok = ch.set(v);
        if (ok) clearRejection(el);
        else markRejection(el, ch.rejected.message);
        return ok;
      };
      value = { spec: ch.spec, name: ch.name, get: ch.get, set, get rejected() { return ch.rejected; } };
    }
    const data = Alpine.reactive({ ...(entry.view ? entry.view({ props, value, services }) : {}), props });
    Object.defineProperty(Alpine.raw(data), '_ui', { value: { services }, enumerable: false, configurable: true });
    root._x_dataStack = [data];
    if (entry.template) root.append(...cloneTemplate(entry.template));
    let mountEffects = 0;
    const guardedEffect = (fn, ...rest) => guarded(`${name}#${mountEffects++}`, fn, ...rest);
    /** Kommando des Hosts; `_ui` erst beim Aufruf gelesen. Wirft nie. */
    const command = async (cmd, args = {}) => {
      const ui = host._ui;
      if (!isUiCommand(ui, cmd)) {
        const error = new Error(`unknown command ${cmd}`);
        console.warn(`${where}: ${error.message}`);
        return { ok: false, error };
      }
      return runUiCommand(ui, cmd, args);
    };
    handle = entry.mount(root, { props, value, services, effect: guardedEffect, command });
    if (!alive) { handle?.destroy?.(); handle = null; return; }
    mounted = true;
    showError();
    Alpine.initTree(root);
  } catch (err) {
    released = true;
    if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
    abort(String(err.message));
  }
}

/**
 * `x-widget` registrieren; je Alpine-Instanz einmal wirksam, weitere Aufrufe ergänzen die Widgets.
 * @param {any} Alpine
 * @param {{ i18n: any, widgets: Record<string, any> }} deps
 * @returns {void}
 */
export function registerWidgetDirective(Alpine, { i18n, widgets }) {
  let reg = registered.get(Alpine);
  if (reg) { reg.i18n = i18n; Object.assign(reg.widgets, widgets); return; }
  reg = { i18n, widgets: { ...widgets } };
  registered.set(Alpine, reg);
  Alpine.directive('widget', (el, { expression }, { effect, cleanup }) => {
    const name = String(expression).trim();
    mountWidget(Alpine, el, name, reg.widgets[name], {
      valuePath: el.hasAttribute('x-widget-value') ? el.getAttribute('x-widget-value').trim() : null,
      i18n: reg.i18n, effect, cleanup,
    });
  });
}
