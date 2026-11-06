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
 * `x-field` auf `columnRef` bzw. `list(columnRef)` steht auf einem Wirtselement
 * (`div`); der Kern hängt dort das registrierte Widget ein (`registerFieldWidget`,
 * in der App der Spalten-Picker aus `ui/column-field.js`), mit `types`/`minCount`
 * aus dem Schema. Module rufen keine Methoden des Pickers auf und stylen nur das
 * Wirtselement.
 *
 * CSP-tauglich: kein Ausdruck wird ausgewertet — der Pfad wird zerlegt und
 * über `Alpine.$data` gelesen.
 */
import { resolveTarget } from './field-path.js';
import { bindChoiceGroup, isChoiceGroup } from './choice-group.js';
import { contextOf } from './model.js';
import { parseDecimalInput } from './parse-decimal.js';
import { clearRejection, markRejection, describeRange } from './param-input.js';

const registered = new WeakSet();

/** Widgets je Feldart (z. B. der Spalten-Picker für columnRef); `registerFieldWidget`. */
const widgets = new Map();

/**
 * Ein Widget für eine Feldart einhängen. `x-field` auf einem Feld dieser Art
 * (oder einer Liste davon) steht auf einem Wirtselement; `mount` baut das
 * Widget dort auf. Mehrfacher Aufruf ersetzt den Eintrag.
 * @param {'columnRef'} kind
 * @param {(el: HTMLElement, target: { spec: object, get: () => any, set: (v: any) => void },
 *   services: { eventBus: any, stateManager: any, i18n: any }) => { sync: (v: any) => void, destroy: () => void }} mount
 * @returns {void}
 */
export function registerFieldWidget(kind, mount) {
  widgets.set(kind, mount);
}

/** @param {object} spec @returns {string|null} */
function widgetKind(spec) {
  if (spec.kind === 'columnRef') return 'columnRef';
  if (spec.kind === 'list' && spec.item?.kind === 'columnRef') return 'columnRef';
  return null;
}

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
 * Der Hinweis zu einer abgelehnten Eingabe: mit Bereich bei Zahlenfeldern.
 * @param {object} spec Feld-Spec
 * @param {{ t: (key: string, params?: object) => string, getLanguage: () => string }} i18n
 * @returns {string}
 */
export function rejectionHint(spec, i18n) {
  const range = isNumeric(spec) ? describeRange(spec, i18n.getLanguage(), (k, p) => i18n.t(k, p)) : '';
  return range ? i18n.t('common.inputRejected', { range }) : i18n.t('common.inputRejectedPlain');
}

/**
 * Der Hinweis zu einer Ablehnung durch eine Invariante des Models.
 * @param {{ t: (key: string) => string }} i18n @param {string} moduleId @param {string} name
 * @returns {string}
 */
export function invariantHint(i18n, moduleId, name) {
  return i18n.t(`modules.${moduleId}.invariants.${name}`);
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
    const target = resolveTarget(Alpine, el, expression, 'x-field');
    const { spec } = target;
    const data = Alpine.$data(el);
    const wk = widgetKind(spec);
    if (wk) {
      const where = `x-field="${expression}"`;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        throw new Error(`${where}: a ${wk} field needs a host element (div), not <${el.tagName.toLowerCase()}>`);
      }
      const mount = widgets.get(wk);
      if (!mount) throw new Error(`${where}: no widget registered for ${wk}`);
      const services = Alpine.raw(data._ui?.services);
      if (!services) throw new Error(`${where}: ${wk} fields need a module with defineModel`);
      if (!el.hasAttribute('data-help-key') && data.moduleId) {
        el.setAttribute('data-help-key', `modules.${data.moduleId}.${target.helpKey}`);
      }
      const widget = mount(el, {
        spec,
        get: target.get,
        set: (value) => {
          try {
            target.set(value);
            clearRejection(el);
          } catch (err) {
            if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
            markRejection(el, rejectionHint(spec, i18n));
          }
        },
      }, services);
      effect(() => widget.sync(target.get()));
      cleanup(() => widget.destroy());
      return;
    }
    applyAttributes(el, spec);
    if (!el.hasAttribute('data-help-key') && data.moduleId) {
      el.setAttribute('data-help-key', `modules.${data.moduleId}.${target.helpKey}`);
    }
    const show = () => writeElement(el, spec, target.get());
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
      try {
        target.set(readElement(el, spec));
        clearRejection(el);
      } catch (err) {
        if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
        if (live) return;
        show();
        markRejection(el, typeof err?.invariant === 'string' && data.moduleId
          ? invariantHint(i18n, data.moduleId, err.invariant) : rejectionHint(spec, i18n));
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
    const target = resolveTarget(Alpine, el, expression, 'x-set');
    const data = Alpine.$data(el);
    if (!el.hasAttribute('data-help-key') && data.moduleId) {
      el.setAttribute('data-help-key', `modules.${data.moduleId}.${target.helpKey}`);
    }
    bindChoiceGroup(el, {
      spec: target.spec,
      name: target.name,
      radioName: `${data._ui?.instanceId ?? data.moduleId ?? 'group'}-${expression}`,
      read: target.get,
      write: target.set,
      hint: (err) => (typeof err?.invariant === 'string' && data.moduleId
        ? invariantHint(i18n, data.moduleId, err.invariant) : rejectionHint(target.spec, i18n)),
      checkCtx: () => ({ root: data.model, context: contextOf(data.model) }),
      effect,
      cleanup,
    });
  });
}
