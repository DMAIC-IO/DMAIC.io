/**
 * Zahlenfelder mit EINER Regel für Oberfläche und Agent.
 *
 * Ein Modul beschreibt seine Zahlenparameter einmal als `PARAM_SPEC`
 * (Grenzen im Format von `requireNumber`, dazu `step` und `nullable`). Der
 * Agent prüft über `numberCheck(spec)`, die Vorlage liest `paramMin/Max/Step`,
 * und `onParamInput` weist eine ungültige Eingabe ab, statt zu klemmen: das
 * Feld zeigt wieder den Modellwert und ist markiert, bis eine gültige
 * Eingabe kommt.
 *
 * Ein Spec-Eintrag darf auch eine Funktion `(vm) => ParamSpec` sein, wenn die
 * Grenzen vom Zustand des Moduls abhängen.
 */
import { requireNumber } from './agent/agent-argcheck.js';

/**
 * @typedef {object} ParamSpec
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [exclusiveMin]
 * @property {number} [exclusiveMax]
 * @property {boolean} [integer]
 * @property {number} [step]  Schrittweite des Eingabefelds (Vorgabe 1 bei integer, sonst 'any')
 * @property {boolean} [nullable]  leere Eingabe bedeutet null (z. B. „alle“)
 */

function bounds(spec) {
  const { step: _step, nullable: _nullable, ...rest } = spec;
  return rest;
}

/**
 * Der Prüfer eines Zahlenparameters. Ist die Spec eine Funktion, wird sie mit
 * dem Viewmodel (zweites Argument) ausgewertet.
 * @param {ParamSpec|((vm: object) => ParamSpec)} spec
 * @returns {(raw: any, vm?: object) => number|null}
 */
export function numberCheck(spec) {
  return (raw, vm) => {
    const s = typeof spec === 'function' ? spec(vm) : spec;
    if (s.nullable && (raw === '' || raw === null || raw === undefined)) return null;
    return requireNumber('value', raw, bounds(s));
  };
}

/**
 * Der zulässige Bereich als kurzer Text (für den Hinweis an der Oberfläche).
 * @param {ParamSpec} spec
 * @param {string} lang  steuert nur die Zahlenformatierung
 * @param {(key: string, vars?: object) => string} t
 * @returns {string}
 */
export function describeRange(spec, lang, t) {
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 6 });
  const parts = [];
  if (spec.exclusiveMin !== undefined) parts.push(`> ${nf.format(spec.exclusiveMin)}`);
  else if (spec.min !== undefined) parts.push(`≥ ${nf.format(spec.min)}`);
  if (spec.exclusiveMax !== undefined) parts.push(`< ${nf.format(spec.exclusiveMax)}`);
  else if (spec.max !== undefined) parts.push(`≤ ${nf.format(spec.max)}`);
  let text = parts.join(` ${t('common.rangeAnd')} `);
  if (spec.integer) text = text ? `${text}, ${t('common.rangeInteger')}` : t('common.rangeInteger');
  return text;
}

/**
 * Die Ablehnungsmarken eines Feldes entfernen und seinen Vorlagen-Hinweis wiederherstellen.
 * @param {HTMLElement} el
 */
export function clearRejection(el) {
  el.classList.remove('field--error');
  el.removeAttribute('aria-invalid');
  if (el.dataset && el.dataset.paramTitle !== undefined) {
    el.title = el.dataset.paramTitle;
    delete el.dataset.paramTitle;
  }
}

/**
 * Ein Feld als abgewiesen markieren: Markierung, aria-invalid und ein Hinweis
 * im Titel (der Vorlagen-Titel kommt mit `clearRejection` zurück).
 * @param {HTMLElement} el
 * @param {string} title  Hinweistext
 */
export function markRejection(el, title) {
  el.classList.add('field--error');
  el.setAttribute('aria-invalid', 'true');
  if (el.dataset && el.dataset.paramTitle === undefined) el.dataset.paramTitle = el.title ?? '';
  el.title = title;
}

/**
 * Mixin für Viewmodels mit Zahlenparametern.
 * @param {{ specs: Record<string, ParamSpec|((vm: object) => ParamSpec)>,
 *   checks: Record<string, Function>, root?: (vm: object) => object,
 *   t: Function, lang?: () => string }} opts
 * @returns {object}
 */
export function paramInputMixin({ specs, checks, root = (vm) => vm.model, t, lang = () => 'de' }) {
  const specOf = (vm, key) => {
    const s = specs[key];
    return (typeof s === 'function' ? s(vm) : s) ?? {};
  };
  return {
    /**
     * @noagent DOM event handler; der Agent nutzt setParam()
     * @param {string} key
     * @param {Event} event
     * @param {{ live?: boolean }} [opts]  `live`: stille Prüfung beim Tippen. Eine
     *   gültige Eingabe wird übernommen, eine ungültige oder halbfertige bleibt
     *   ohne Marke, ohne Rücksetzen und ohne Schreiben.
     */
    onParamInput(key, event, { live = false } = {}) {
      const el = event.target;
      const raw = el.value;
      const check = checks[key];
      if (typeof check !== 'function') throw new Error(`paramInputMixin: no check for key ${JSON.stringify(key)}`);
      const reject = () => {
        el.value = String(this.paramValue(key) ?? '');
        const range = describeRange(specOf(this, key), lang(), t);
        markRejection(el, range ? t('common.inputRejected', { range }) : t('common.inputRejectedPlain'));
      };
      const fail = (err) => {
        if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
        if (!live) reject();
        return undefined;
      };
      const accepted = (result) => {
        // Der Wert ist gültig und übernommen: die Marken aller Parameterfelder
        // der Komponente fallen weg, denn die anderen Felder zeigen Modellwerte.
        clearRejection(el);
        const root = el.closest?.('[x-data]');
        if (root) for (const other of root.querySelectorAll('.field--error[aria-invalid="true"]')) clearRejection(other);
        return result;
      };
      try {
        check(raw, this);
      } catch (err) {
        return fail(err);
      }
      const value = specOf(this, key).nullable && raw === '' ? null : raw;
      let result;
      try {
        result = this.setParam(key, value);
      } catch (err) {
        return fail(err);
      }
      if (result && typeof result.then === 'function') return result.then(accepted, fail);
      return accepted(result);
    },
    /**
     * @noagent DOM event handler; stille Prüfung beim Tippen, rechnet bei gültiger Eingabe sofort
     * @param {string} key
     * @param {Event} event
     */
    onParamLive(key, event) {
      return this.onParamInput(key, event, { live: true });
    },
    /** @noagent view transform; Stand eines Parameters für das Eingabefeld */
    paramValue(key) {
      return key.split('.').reduce((o, k) => (o == null ? o : o[k]), root(this));
    },
    /**
     * Untergrenze für das HTML-Attribut `min`. Eine offene Grenze
     * (`exclusiveMin`) erscheint nur als Hinweis; die Prüfung bleibt beim Check.
     * @noagent view transform
     */
    paramMin(key) {
      const s = specOf(this, key);
      return s.min ?? s.exclusiveMin ?? null;
    },
    /**
     * Obergrenze für das HTML-Attribut `max` (offene Grenze nur als Hinweis).
     * @noagent view transform
     */
    paramMax(key) {
      const s = specOf(this, key);
      return s.max ?? s.exclusiveMax ?? null;
    },
    /** @noagent view transform */
    paramStep(key) {
      const s = specOf(this, key);
      return s.step ?? (s.integer ? 1 : 'any');
    },
  };
}
