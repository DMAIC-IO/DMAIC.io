/**
 * D.Mike — Knopfgruppen (choice-group.js)
 *
 * Eine Gruppe von Optionen (`<button role="radio" value>` oder
 * `<input type="radio" value>`) an einen Wert binden — wie `<select>` mit
 * `<option>`. Klick bzw. `change` auf eine Option schreibt; der Wert setzt
 * `aria-checked` bzw. `checked`. Reiter (`<button role="tab" value>` in einer
 * `role="tablist"`) bekommen statt `aria-checked` `aria-selected` und einen
 * roving `tabindex` (0 am gewählten, -1 an den übrigen). Elementart, Rollen, Klassen, Aussehen und
 * Tastatur legt die View fest; hier entstehen nur der Zustand und bei Radios
 * ein gemeinsames `name`. Optionen, die später erscheinen (`x-for`), werden
 * erfasst und geprüft. Ein Klick auf die aktive Option ändert nichts.
 *
 * Ist der Wert eine Liste (`list(…)`), sind die Optionen Kästchen
 * (`<input type="checkbox" value>`): jedes `value` ist ein Eintrag, der Wert
 * die gewählten Einträge in Dokumentreihenfolge. Zahl-ids einer `idOf`-Liste
 * werden wie bei `data-arg-*` zu Zahlen.
 */
import { checkValue, fromAttr, idsFromAttr } from './model.js';
import { clearRejection, markRejection } from './param-input.js';

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** @param {Element} el @returns {boolean} kein einzelnes Eingabeelement */
export function isChoiceGroup(el) {
  return !FORM_TAGS.has(el.tagName);
}

/** @param {Element} o @returns {boolean} */
const isRadio = (o) => o.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (o).type === 'radio';

/** @param {Element} o @returns {boolean} */
const isCheckbox = (o) => o.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (o).type === 'checkbox';

/** @param {Element} o @returns {boolean} Reiter (`role="tab"`): Zustand über `aria-selected` und roving `tabindex` */
const isTab = (o) => o.getAttribute('role') === 'tab';

/**
 * Die Optionen einer Gruppe in Dokumentreihenfolge.
 * @param {HTMLElement} group @param {boolean} [boxes] Kästchen einer Listengruppe statt Knöpfen und Radios
 * @returns {HTMLElement[]}
 */
export function optionsOf(group, boxes = false) {
  return /** @type {HTMLElement[]} */ ([...group.querySelectorAll('[value]')]
    .filter((o) => (boxes ? isCheckbox(o) : o.tagName === 'BUTTON' || isRadio(o))));
}

/**
 * Fokus auf die gewählte Option, sonst die erste.
 * @param {HTMLElement} group @returns {void}
 */
export function focusChoice(group) {
  const boxes = optionsOf(group, true);
  const opts = boxes.length ? boxes : optionsOf(group);
  const on = opts.find((o) => (isRadio(o) || isCheckbox(o) ? /** @type {HTMLInputElement} */ (o).checked : o.getAttribute('aria-checked') === 'true'));
  (on ?? opts[0])?.focus();
}

/**
 * Eine Gruppe binden.
 * @param {HTMLElement} group
 * @param {{ spec: object, name: string, radioName: string, read: () => any, write: (value: any) => void,
 *   hint: (err: any) => string, effect: (fn: () => void) => void, cleanup: (fn: () => void) => void,
 *   checkCtx?: () => object }} opts
 * @returns {void}
 * @throws {Error} beim Einbau, wenn ein `value` nicht zur Spec passt
 */
export function bindChoiceGroup(group, { spec, name, radioName, read, write, hint, effect, cleanup, checkCtx = () => ({}) }) {
  const many = spec.kind === 'list';
  const options = () => optionsOf(group, many);
  const itemOf = (o) => {
    const ctx = checkCtx();
    const raw = fromAttr(spec.item, o.getAttribute('value') ?? '');
    return checkValue(spec.item, name, idsFromAttr({ [name]: spec.item }, { [name]: raw }, ctx.root)[name], ctx);
  };
  const valueOf = (o) => (many ? itemOf(o) : checkValue(spec, name, fromAttr(spec, o.getAttribute('value') ?? ''), checkCtx()));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isOn = (v, current) => (many ? (Array.isArray(current) && current.some((c) => same(c, v))) : same(v, current));
  const prepare = () => {
    for (const o of options()) {
      valueOf(o);
      if (isRadio(o) && !/** @type {HTMLInputElement} */ (o).name) /** @type {HTMLInputElement} */ (o).name = radioName;
    }
  };
  const render = () => {
    const current = read();
    for (const o of options()) {
      let on = false;
      try { on = isOn(valueOf(o), current); } catch { on = false; }
      if (isRadio(o) || isCheckbox(o)) /** @type {HTMLInputElement} */ (o).checked = on;
      else if (isTab(o)) { o.setAttribute('aria-selected', String(on)); o.setAttribute('tabindex', on ? '0' : '-1'); }
      else o.setAttribute('aria-checked', String(on));
    }
  };
  /** @param {() => any} next liefert den neuen Wert (wirft bei ungültiger Option) */
  const apply = (next) => {
    try {
      const v = next();
      if (same(v, read())) return;
      write(v);
      clearRejection(group);
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError) throw err;
      markRejection(group, hint(err));
    }
    render();
  };
  const choose = (o) => apply(() => valueOf(o));
  const chosen = () => options().filter((o) => /** @type {HTMLInputElement} */ (o).checked).map(valueOf);
  const optionAt = (target) => {
    const o = target?.closest?.('[value]');
    return o && group.contains(o) && options().includes(o) ? o : null;
  };
  const onClick = (e) => { const o = optionAt(e.target); if (o && !isRadio(o) && !isCheckbox(o)) choose(o); };
  const onChange = (e) => {
    const o = optionAt(e.target);
    if (o && isCheckbox(o)) apply(chosen);
    else if (o && isRadio(o) && o.checked) choose(o);
  };

  prepare();
  effect(render);
  const observer = new MutationObserver(() => {
    try { prepare(); } catch (err) { console.error(err); }
    render();
  });
  observer.observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
  group.addEventListener('click', onClick);
  group.addEventListener('change', onChange);
  cleanup(() => {
    observer.disconnect();
    group.removeEventListener('click', onClick);
    group.removeEventListener('change', onChange);
  });
}
