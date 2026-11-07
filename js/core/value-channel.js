/**
 * D.Mike — Wertkanal (value-channel.js)
 *
 * Gemeinsamer Weg von Bindungen (`x-field`, `x-set`) und Widgets
 * (`x-widget-value`) zum Model: Pfad auflösen, Wert lesen, über den prüfenden
 * Setter schreiben, Ablehnung als Meldung halten. Programmierfehler
 * (TypeError, ReferenceError, SyntaxError) werden weitergeworfen.
 */
import { resolveTarget } from './field-path.js';
import { describeRange } from './param-input.js';

/**
 * @typedef {{ spec: object, name: string, helpKey: string, get: () => any,
 *   set: (value: any) => boolean, rawSet: (value: any) => void,
 *   rejected: { message: string }, hint: (err: any) => string }} ValueChannel
 */

/** @param {unknown} err @returns {boolean} */
const isBug = (err) => err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError;

/** @param {object} spec @returns {boolean} */
const isNumeric = (spec) => spec.kind === 'number' || spec.kind === 'index';

/**
 * Der Hinweis zu einer abgelehnten Eingabe: mit Bereich bei Zahlenfeldern.
 * @param {object} spec Feldbeschreibung
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
 * Den Kanal zu einem Pfad öffnen (`model.<f>`, `state.<f>`, Listenpfade).
 * `rawSet` ist der werfende Setter des Models (für Bindungen, die selbst
 * fangen, z. B. Optionsgruppen); `set` fängt Ablehnungen und meldet `false`.
 * @param {any} Alpine
 * @param {HTMLElement} el Element im Scope der Komponente
 * @param {string} path
 * @param {{ where: string, i18n: { t: Function, getLanguage: () => string } }} opts
 * @returns {ValueChannel}
 */
export function openChannel(Alpine, el, path, { where, i18n }) {
  const target = resolveTarget(Alpine, el, path, where);
  const data = Alpine.$data(el);
  const rejected = Alpine.reactive({ message: '' });
  const hint = (err) => (typeof err?.invariant === 'string' && data.moduleId
    ? invariantHint(i18n, data.moduleId, err.invariant) : rejectionHint(target.spec, i18n));
  return {
    spec: target.spec,
    name: target.name,
    helpKey: target.helpKey,
    get: target.get,
    rawSet: target.set,
    set(value) {
      try {
        target.set(value);
        rejected.message = '';
        return true;
      } catch (err) {
        if (isBug(err)) throw err;
        rejected.message = hint(err);
        return false;
      }
    },
    rejected,
    hint,
  };
}

/**
 * Hilfe-Anker `modules.<id>.<helpKey>` setzen, wenn das Element keinen hat.
 * @param {HTMLElement} el @param {{ moduleId?: string }} data @param {string} helpKey
 * @returns {void}
 */
export function anchorHelp(el, data, helpKey) {
  if (!el.hasAttribute('data-help-key') && data.moduleId) {
    el.setAttribute('data-help-key', `modules.${data.moduleId}.${helpKey}`);
  }
}
