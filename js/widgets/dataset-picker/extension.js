/**
 * Erweiterungsabschnitt einer Zeile des Datensatz-Pickers, allein aus dem
 * Schema (`datasets(…, { extension: object({ … }) })`). Zugelassen sind
 * `object` (auch mit `variantKey`), `oneOf`, `number` und `columnRef` — die
 * Feldart lehnt andere schon beim Anlegen ab, hier wirft das Einhängen.
 *
 * `object` mit `variantKey` zeichnet zuerst den Wähler, dann nur die gewählte
 * Variante; ein Wechsel setzt die Variante auf ihre Vorgabe und zeichnet neu.
 * Eine Werteingabe schreibt ohne neu zu zeichnen (Fokus und der Klick, der
 * die Eingabe beendet hat, bleiben).
 *
 * Texte unter `<base>.<pfad>` (`label`, `values.<wert>`, `help`); jedes
 * Bedienelement trägt `data-ds-ext="<pfad>"`. DOM über `h()`.
 */
import { h } from '../../core/dom.js';
import { defaultOf } from '../../core/model.js';
import { discoverColumns, refToKey, keyToRef } from '../../ui/column-picker.js';
import { slotFilter } from '../../ui/dataset-picker.js';

const KINDS = ['object', 'oneOf', 'number', 'columnRef'];

/** @param {any} s @param {string} path */
function assertDrawable(s, path) {
  if (!KINDS.includes(s?.kind)) throw new Error(`dataset-picker: extension kind ${s?.kind} at ${path}; allowed: ${KINDS.join(', ')}`);
  if (s.kind === 'object') for (const [k, v] of Object.entries(s.shape)) assertDrawable(v, `${path}.${k}`);
}

/** @param {any} s @returns {string[]} Varianten eines object mit variantKey */
const variantsOf = (s) => (s.variantKey === undefined ? []
  : s.shape[s.variantKey].values.map(String).filter((v) => Object.hasOwn(s.shape, v)));

/**
 * Vorgabe eines object mit variantKey zum gewählten Wert: feste Schlüssel mit
 * ihrer Vorgabe, die Variante des Werts mit ihrer.
 * @param {any} s @param {string} chosen @returns {Record<string, any>}
 */
function variantDefault(s, chosen) {
  const variants = variantsOf(s);
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(s.shape)) {
    if (k === s.variantKey) out[k] = s.shape[k].values.find((x) => String(x) === chosen);
    else if (variants.includes(k)) { if (k === chosen) out[k] = defaultOf(v); } else if (v.optional !== true) out[k] = defaultOf(v);
  }
  return out;
}

/**
 * Die Erweiterung als `rowExtension` des `DatasetPicker`.
 * @param {any} extension die `object`-Spec der Erweiterung
 * @param {{ base: string, t: (key: string) => string, has: (key: string) => boolean, stateManager: any, noColumn: string }} env
 * @returns {{ keys: string[], empty: () => Record<string, any>, render: (el: HTMLElement, value: Record<string, any>, update: Function) => void }}
 */
export function rowExtension(extension, env) {
  for (const [k, v] of Object.entries(extension.shape)) assertDrawable(v, k);
  const keys = Object.keys(extension.shape);
  const text = (path, fallback) => (env.has(`${env.base}.${path}`) ? env.t(`${env.base}.${path}`) : fallback);
  const helpKey = (path) => `${env.base}.${path}.help`;

  return {
    keys,
    empty: () => Object.fromEntries(Object.entries(extension.shape).map(([k, v]) => [k, defaultOf(v)])),
    render(el, value, update) {
      // Laufender Stand der Zeile: eine Werteingabe schreibt ohne neu zu zeichnen.
      /** @type {Record<string, any>} */
      let cur = { ...value };
      /** Wert unter dem Pfad `segs` (ab dem Erweiterungsschlüssel) setzen. */
      const setAt = (segs, v, opts) => {
        const put = (obj, i) => (i === segs.length ? v : { ...(obj ?? {}), [segs[i]]: put(obj?.[segs[i]], i + 1) });
        cur = put(cur, 0);
        update({ [segs[0]]: cur[segs[0]] }, opts);
      };

      /** @param {any} s @param {string[]} segs @param {any} v @returns {HTMLElement} */
      const control = (s, segs, v) => {
        const path = segs.join('.');
        if (s.kind === 'number') {
          const input = h('input', { type: 'number', step: 'any', class: 'ds-picker__ext-input', 'data-ds-ext': path, value: v ?? '' });
          input.addEventListener('change', () => {
            const n = input.value === '' ? null : Number(input.value);
            setAt(segs, Number.isFinite(n) ? n : null, { render: false });
          });
          return input;
        }
        if (s.kind === 'columnRef') {
          const current = v ? refToKey(v) : '';
          const input = h('select', { class: 'ds-picker__ext-input', 'data-ds-ext': path },
            h('option', { value: '' }, env.noColumn),
            discoverColumns(env.stateManager, slotFilter(s)).map((c) => {
              const k = refToKey(c);
              return h('option', { value: k, selected: k === current }, `${c.shortName} ${c.columnName}`);
            }));
          input.addEventListener('change', () => setAt(segs, input.value ? keyToRef(input.value) : null, { render: false }));
          return input;
        }
        // oneOf
        const input = h('select', { class: 'ds-picker__ext-input', 'data-ds-ext': path },
          s.values.map((x) => h('option', { value: String(x), selected: x === v }, text(`${path}.values.${x}`, String(x)))));
        input.addEventListener('change', () => setAt(segs, s.values.find((x) => String(x) === input.value), { render: false }));
        return input;
      };

      /** Ein beschriftetes Feld im Raster. @param {any} s @param {string[]} segs @param {any} v */
      const field = (s, segs, v) => {
        const path = segs.join('.');
        return h('label', { class: 'ds-picker__ext-field', 'data-help-key': helpKey(path) },
          h('span', { class: 'ds-picker__ext-label' }, text(`${path}.label`, segs[segs.length - 1])),
          control(s, segs, v));
      };

      /** Die Schlüssel eines object als Raster; verschachtelte object als eigene Gruppe. */
      const fields = (entries, segs, v) => {
        const grid = h('div', { class: 'ds-picker__ext-fields' });
        /** @type {HTMLElement[]} */
        const groups = [];
        for (const [k, s] of entries) {
          if (s.kind === 'object') groups.push(...group(s, [...segs, k], v?.[k]));
          else grid.append(field(s, [...segs, k], v?.[k]));
        }
        return [...(grid.childElementCount > 0 ? [grid] : []), ...groups];
      };

      /** @param {any} s @param {string[]} segs @param {any} v @returns {HTMLElement[]} */
      const group = (s, segs, v) => {
        const path = segs.join('.');
        const title = h('span', { class: 'ds-picker__ext-title' }, text(`${path}.label`, segs[segs.length - 1]));
        const vk = s.variantKey;
        if (vk === undefined) {
          return [h('div', { class: 'ds-picker__ext-head', 'data-help-key': helpKey(path) }, title),
            ...fields(Object.entries(s.shape), segs, v)];
        }
        const chosen = String(v?.[vk] ?? s.shape[vk].values[0]);
        const select = h('select', { class: 'ds-picker__ext-select', 'data-ds-ext': `${path}.${vk}` },
          s.shape[vk].values.map((x) => h('option', { value: String(x), selected: String(x) === chosen },
            text(`${path}.${vk}.values.${x}`, String(x)))));
        select.addEventListener('change', () => {
          // Ein Wechsel leert die Variante und zeichnet neu.
          setAt(segs, variantDefault(s, select.value));
        });
        const variants = variantsOf(s);
        const fixed = Object.entries(s.shape).filter(([k]) => k !== vk && !variants.includes(k));
        const own = variants.includes(chosen) ? s.shape[chosen] : null;
        const body = own === null ? [] : own.kind === 'object'
          ? fields(Object.entries(own.shape), [...segs, chosen], v?.[chosen])
          : fields([[chosen, own]], segs, v);
        return [
          h('label', { class: 'ds-picker__ext-head', 'data-help-key': helpKey(`${path}.${vk}`) }, title, select),
          ...(fixed.length > 0 ? fields(fixed, segs, v) : []),
          ...body,
        ];
      };

      for (const k of keys) {
        const s = extension.shape[k];
        if (s.kind === 'object') el.append(...group(s, [k], cur[k]));
        else el.append(h('div', { class: 'ds-picker__ext-fields' }, field(s, [k], cur[k])));
      }
    },
  };
}
