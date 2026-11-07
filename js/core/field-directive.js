/**
 * D.Mike — Direktive x-field (field-directive.js)
 *
 * `x-field="model.alpha"` bindet ein Formularfeld an ein Feld des
 * deklarativen Models (core/model.js): setzt `type`/`min`/`max`/`step` aus
 * dem Schema, schreibt über den prüfenden Setter, zeigt eine Ablehnung
 * (`aria-invalid` + Hinweis mit Bereich) und setzt das Feld bei einer
 * abgelehnten Eingabe auf den gültigen Wert zurück. Das Dezimalkomma liest
 * `parseDecimalInput`. Fehlt ein `data-help-key`, entsteht er aus dem
 * Feldnamen. Ersetzt für Schema-Module das param-input-Mixin.
 *
 * `x-field="state.name"` bindet ebenso an ein Feld des UI-State
 * (`defineState`): der State hat keine prüfenden Setter, darum prüft die
 * Direktive mit `checkValue`, bevor sie schreibt. Der Anker heißt dann
 * `modules.<id>.state.<name>.help`.
 *
 * Pfade (`core/field-path.js`): `model.<feld>`, `state.<feld>`,
 * `model.<liste>[i].<feld>` und `<eintrag>.<feld>` aus einem `x-for`. Felder
 * in Listeneinträgen prüft `checkValue` gegen die Element-Spec; der Anker
 * heißt `modules.<id>.fields.<liste>.<feld>.help`. `type="date"`/`"time"`
 * kommt aus den Feldarten `date()`/`time()`.
 *
 * `x-set="<pfad>"` an einer Gruppe (kein `input`/`select`/`textarea`) bindet
 * deren Optionen (`core/choice-group.js`); Pfade wie `x-field`.
 *
 * `x-field` auf einer Feldart, für die ein Widget zuständig ist (z. B. `columnRef`
 * und `list(columnRef)` für den Spalten-Picker), steht auf einem Wirtselement
 * (`div`); die Direktive hängt dort das Widget aus der übergebenen Registry ein
 * (`mountWidget`). Module rufen keine Methoden des Widgets auf und stylen nur das
 * Wirtselement.
 *
 * CSP-tauglich: kein Ausdruck wird ausgewertet — der Pfad wird zerlegt und
 * über `Alpine.$data` gelesen.
 */
import { widgetForKind, mountWidget } from './widget-directive.js';
import { openChannel, anchorHelp, rejectionHint, invariantHint } from './value-channel.js';
import { bindChoiceGroup, isChoiceGroup } from './choice-group.js';
import { contextOf } from './model.js';
import { parseDecimalInput } from './parse-decimal.js';
import { clearRejection, markRejection } from './param-input.js';

export { rejectionHint, invariantHint };

const registered = new WeakSet();

/** Widget-Registry je Alpine-Instanz; spätere Aufrufe mit `widgets` ersetzen sie. */
const widgetsOf = new WeakMap();

/** @param {object} spec @returns {boolean} */
const isNumeric = (spec) => spec.kind === 'number' || spec.kind === 'index';

/** Auch von `x-param` benutzt. @param {HTMLElement} el @param {object} spec */
export function applyAttributes(el, spec) {
  if (el.tagName !== 'INPUT') return;
  if (spec.kind === 'date' || spec.kind === 'time') {
    if (!el.hasAttribute('type')) el.setAttribute('type', spec.kind);
    if (spec.kind === 'time' && spec.step !== undefined && !el.hasAttribute('step')) el.setAttribute('step', String(spec.step * 60));
    return;
  }
  if (!isNumeric(spec)) return;
  if (!el.hasAttribute('type')) el.setAttribute('type', 'number');
  const min = spec.kind === 'index' ? 0 : (spec.min ?? spec.exclusiveMin);
  const max = spec.max ?? spec.exclusiveMax;
  if (min !== undefined && !el.hasAttribute('min')) el.setAttribute('min', String(min));
  if (max !== undefined && !el.hasAttribute('max')) el.setAttribute('max', String(max));
  if (!el.hasAttribute('step')) el.setAttribute('step', spec.integer || spec.kind === 'index' ? '1' : 'any');
}

/** Auch von `x-param` benutzt. @param {HTMLInputElement} el @param {object} spec @returns {any} der Rohwert für den Setter */
export function readElement(el, spec) {
  if (el.type === 'checkbox') return el.checked;
  const raw = el.value;
  if (!isNumeric(spec)) return raw;
  if (spec.nullable && raw.trim() === '') return null;
  const n = parseDecimalInput(raw);
  return typeof n === 'number' && Number.isFinite(n) ? n : raw;
}

/** Auch von `x-param` benutzt. @param {HTMLInputElement} el @param {object} spec @param {any} value */
export function writeElement(el, spec, value) {
  if (el.type === 'checkbox') { el.checked = value === true; return; }
  const shown = value === null || value === undefined ? '' : String(value);
  // Beim Tippen nicht überschreiben, solange das Feld denselben Wert meint
  // („0,“ oder „1.“ würden sonst zu „0“ bzw. „1“ gekürzt).
  if (el.ownerDocument?.activeElement === el && isNumeric(spec) && readElement(el, spec) === value) return;
  if (el.value !== shown) el.value = shown;
}

/**
 * Die Direktive registrieren. Vor `Alpine.start()` aufrufen; je Alpine-Instanz einmal.
 * @param {object} Alpine der Default-Export von csp.js
 * @param {{ i18n: { t: (key: string, params?: object) => string, getLanguage: () => string }, widgets?: Record<string, any> }} deps `widgets`: Widget-Registry (`js/widgets/registry.js`)
 * @returns {void}
 */
export function registerFieldDirective(Alpine, { i18n, widgets }) {
  if (widgets) widgetsOf.set(Alpine, widgets);
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('field', (el, { expression }, { effect, cleanup }) => {
    const ch = openChannel(Alpine, el, expression, { where: 'x-field', i18n });
    const { spec } = ch;
    const data = Alpine.$data(el);
    const widgets = widgetsOf.get(Alpine) ?? {};
    const widgetName = widgetForKind(widgets, spec);
    if (widgetName) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        throw new Error(`x-field="${expression}": a ${spec.kind === 'list' ? spec.item.kind : spec.kind} field needs a host element (div), not <${el.tagName.toLowerCase()}>`);
      }
      anchorHelp(el, data, ch.helpKey);
      mountWidget(Alpine, el, widgetName, widgets[widgetName], { valuePath: expression, i18n, effect, cleanup });
      return;
    }
    applyAttributes(el, spec);
    anchorHelp(el, data, ch.helpKey);
    const show = () => writeElement(el, spec, ch.get());
    effect(show);
    if (el.tagName === 'SELECT') {
      // Optionen aus x-for entstehen erst nach dieser Direktive. Der
      // aufgeschobene Abgleich darf nach dem Abbau nicht mehr laufen: dann
      // fehlen dem Element die Daten der Komponente (Alpine.$data ohne model).
      let alive = true;
      Alpine.nextTick(() => { if (alive) show(); });
      const observer = new MutationObserver(show);
      observer.observe(el, { childList: true, subtree: true });
      cleanup(() => { alive = false; observer.disconnect(); });
    }

    const commit = (live) => {
      if (ch.set(readElement(el, spec))) clearRejection(el);
      else if (!live) {
        show();
        markRejection(el, ch.rejected.message);
      }
    };
    const onInput = () => commit(true);
    const onChange = () => commit(false);
    const live = el.type !== 'checkbox' && el.tagName !== 'SELECT';
    if (live) el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    cleanup(() => {
      if (live) el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
    });
  });

  Alpine.directive('set', (el, { expression }, { effect, cleanup }) => {
    if (!isChoiceGroup(el)) {
      throw new Error(`x-set="${expression}" binds a group of options; use x-field on <${el.tagName.toLowerCase()}>`);
    }
    const ch = openChannel(Alpine, el, expression, { where: 'x-set', i18n });
    const data = Alpine.$data(el);
    anchorHelp(el, data, ch.helpKey);
    bindChoiceGroup(el, {
      spec: ch.spec,
      name: ch.name,
      radioName: `${data._ui?.instanceId ?? data.moduleId ?? 'group'}-${expression}`,
      read: ch.get,
      write: ch.rawSet,
      hint: ch.hint,
      checkCtx: () => ({ root: data.model, context: contextOf(data.model) }),
      effect,
      cleanup,
    });
  });
}
