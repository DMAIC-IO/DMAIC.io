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
  const { step, nullable, ...rest } = spec;
  return rest;
}

/**
 * Der Prüfer eines Zahlenparameters.
 * @param {ParamSpec} spec
 * @returns {(raw: any) => number|null}
 */
export function numberCheck(spec) {
  return (raw) => {
    if (spec.nullable && (raw === '' || raw === null || raw === undefined)) return null;
    return requireNumber('value', raw, bounds(spec));
  };
}

/**
 * Der zulässige Bereich als kurzer Text (für den Hinweis an der Oberfläche).
 * @param {ParamSpec} spec
 * @param {string} lang
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
  const and = lang === 'de' ? ' und ' : ' and ';
  let text = parts.join(and);
  if (spec.integer) text = text ? `${text}, ${t('common.rangeInteger')}` : t('common.rangeInteger');
  return text;
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
     */
    onParamInput(key, event) {
      const el = event.target;
      const raw = el.value;
      try {
        checks[key](raw, this);
      } catch {
        el.value = String(this.paramValue(key) ?? '');
        el.classList.add('field--error');
        el.setAttribute('aria-invalid', 'true');
        const range = describeRange(specOf(this, key), lang(), t);
        el.title = range ? t('common.inputRejected', { range }) : t('common.inputRejectedPlain');
        return undefined;
      }
      el.classList.remove('field--error');
      el.removeAttribute('aria-invalid');
      el.title = '';
      const value = specOf(this, key).nullable && raw === '' ? null : raw;
      return this.setParam(key, value);
    },
    /** @noagent view transform; Stand eines Parameters für das Eingabefeld */
    paramValue(key) {
      return key.split('.').reduce((o, k) => (o == null ? o : o[k]), root(this));
    },
    /** @noagent view transform */
    paramMin(key) {
      const s = specOf(this, key);
      return s.min ?? s.exclusiveMin ?? null;
    },
    /** @noagent view transform */
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
