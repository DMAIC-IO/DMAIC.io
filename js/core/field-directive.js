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
 * CSP-tauglich: kein Ausdruck wird ausgewertet — der Pfad wird zerlegt und
 * über `Alpine.$data` gelesen.
 */
import { fieldSpec, stateSchemaOf, checkValue } from './model.js';
import { parseDecimalInput } from './parse-decimal.js';
import { clearRejection, markRejection, describeRange } from './param-input.js';

const PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
const registered = new WeakSet();

/** @param {object} spec @returns {boolean} */
const isNumeric = (spec) => spec.kind === 'number' || spec.kind === 'index';

/** @param {HTMLElement} el @param {object} spec */
function applyAttributes(el, spec) {
  if (!isNumeric(spec) || el.tagName !== 'INPUT') return;
  if (!el.hasAttribute('type')) el.setAttribute('type', 'number');
  const min = spec.kind === 'index' ? 0 : (spec.min ?? spec.exclusiveMin);
  const max = spec.max ?? spec.exclusiveMax;
  if (min !== undefined && !el.hasAttribute('min')) el.setAttribute('min', String(min));
  if (max !== undefined && !el.hasAttribute('max')) el.setAttribute('max', String(max));
  if (!el.hasAttribute('step')) el.setAttribute('step', spec.integer || spec.kind === 'index' ? '1' : 'any');
}

/** @param {HTMLInputElement} el @param {object} spec @returns {any} der Rohwert für den Setter */
function readElement(el, spec) {
  if (el.type === 'checkbox') return el.checked;
  const raw = el.value;
  if (!isNumeric(spec)) return raw;
  if (spec.nullable && raw.trim() === '') return null;
  const n = parseDecimalInput(raw);
  return typeof n === 'number' && Number.isFinite(n) ? n : raw;
}

/** @param {HTMLInputElement} el @param {object} spec @param {any} value */
function writeElement(el, spec, value) {
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
 * @param {{ i18n: { t: (key: string, params?: object) => string, getLanguage: () => string } }} deps
 * @returns {void}
 */
export function registerFieldDirective(Alpine, { i18n }) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('field', (el, { expression }, { effect, cleanup }) => {
    if (!PATH.test(expression)) {
      console.error(`[x-field] expected a path like model.name, got ${JSON.stringify(expression)}`);
      return;
    }
    const segments = expression.split('.');
    const key = segments.pop();
    const data = Alpine.$data(el);
    const owner = () => segments.reduce((o, s) => (o === null || o === undefined ? o : o[s]), data);
    const spec = fieldSpec(owner(), key);
    if (!spec) {
      console.error(`[x-field] ${expression} is not a field of a defineModel model or a defineState state`);
      return;
    }
    const isState = stateSchemaOf(owner()) !== null;
    applyAttributes(el, spec);
    if (!el.hasAttribute('data-help-key') && data.moduleId) {
      el.setAttribute('data-help-key', `modules.${data.moduleId}.${isState ? 'state' : 'fields'}.${key}.help`);
    }

    effect(() => writeElement(el, spec, owner()?.[key]));

    const commit = (live) => {
      try {
        const raw = readElement(el, spec);
        owner()[key] = isState ? checkValue(spec, key, raw) : raw;
        clearRejection(el);
      } catch (err) {
        if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
        if (live) return;
        writeElement(el, spec, owner()?.[key]);
        const range = isNumeric(spec) ? describeRange(spec, i18n.getLanguage(), (k, p) => i18n.t(k, p)) : '';
        markRejection(el, range ? i18n.t('common.inputRejected', { range }) : i18n.t('common.inputRejectedPlain'));
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
}
