/**
 * D.Mike — VoC → CTx-Baum: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder tree.js (das Schema darf sich ändern, die
 * Migration nicht). Jeder Schritt liefert ein einfaches Objekt.
 */

/** Die Treiberarten im Formatstand 1.0. */
const TYPES_1_0 = ['ctq', 'ctd', 'ctc'];

/** Vorgabefarben je Knotenart im Formatstand 1.0. */
const COLORS_1_0 = {
  voc: 'rgba(230,126,34,1)',
  need: 'rgba(155,89,182,1)',
  ctq: 'rgba(39,174,96,1)',
  ctd: 'rgba(41,128,185,1)',
  ctc: 'rgba(231,76,139,1)',
  req: 'rgba(94,88,216,1)',
};

/** Farbe als `rgb()`/`rgba()`; die Kanäle prüft `isColor`. */
const COLOR_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*)?\)$/;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {string} */
const textOr = (v) => (typeof v === 'string' ? v : '');

/** @param {unknown} v @returns {any[]} */
const listOf = (v) => (Array.isArray(v) ? v : []);

/** @param {unknown} v @returns {boolean} */
function isColor(v) {
  const m = typeof v === 'string' ? COLOR_RE.exec(v) : null;
  return Boolean(m) && m.slice(1, 4).every((c) => Number(c) <= 255);
}

/**
 * Die Randstärke wie die Altform (jede endliche Zahl, sonst 1), auf 0 bis 4
 * geklemmt und auf die nächste Stufe von 0,5 gerundet.
 * @param {unknown} v @returns {number}
 */
function borderWidth(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.min(4, Math.max(0, Math.round(v * 2) / 2));
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb, von Hand, als Beispieldatei oder aus dem Kano-Modul). Je Ebene
 * entfällt ein Nicht-Objekt samt Teilbaum; Texte bleiben, sonst leer; eine
 * fehlende Kinderliste wird leer; fremde Schlüssel entfallen. Eine Art
 * außerhalb von ctq, ctd, ctc wird ctq. Vorhandene nichtleere Text-ids
 * bleiben; eine fehlende id wird fest aus der Position (ab 1): `v<i>`,
 * `n<i>_<j>`, `d<i>_<j>_<k>`, `r<i>_<j>_<k>_<l>`, damit ein nie
 * gespeicherter Stand bei jedem Lesen dieselben ids zeigt. Eine spätere
 * doppelte id und ein Ersatz, der schon vergeben ist, bekommen `_` angehängt,
 * bis sie frei sind. Farben: je Knotenart eine gültige Farbe, sonst die
 * Vorgabe; fremde Schlüssel entfallen. `activeVocId`: ein Text bleibt, sonst
 * `null`.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ vocs: object[], styles: { borderWidth: number, colors: Record<string, string> }, activeVocId: string|null }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const source = listOf(o.vocs);

  /** @type {Set<string>} */
  const taken = new Set();
  const scan = (/** @type {any[]} */ items, /** @type {string[]} */ kids) => {
    for (const n of items) {
      if (!isObject(n)) continue;
      if (typeof n.id === 'string' && n.id !== '') taken.add(n.id);
      if (kids.length > 0) scan(listOf(n[kids[0]]), kids.slice(1));
    }
  };
  scan(source, ['needs', 'drivers', 'requirements']);

  /** @type {Set<string>} */
  const used = new Set();
  /** @param {unknown} own @param {string} fallback @returns {string} */
  const idOf = (own, fallback) => {
    let id = typeof own === 'string' && own !== '' ? own : null;
    if (id === null || used.has(id)) {
      id = id ?? fallback;
      while (used.has(id) || taken.has(id)) id += '_';
      taken.add(id);
    }
    used.add(id);
    return id;
  };

  const vocs = [];
  source.forEach((v, i) => {
    if (!isObject(v)) return;
    const vp = `${i + 1}`;
    const voc = { id: idOf(v.id, `v${vp}`), text: textOr(v.text), source: textOr(v.source), needs: [] };
    listOf(v.needs).forEach((n, j) => {
      if (!isObject(n)) return;
      const np = `${vp}_${j + 1}`;
      const need = { id: idOf(n.id, `n${np}`), text: textOr(n.text), drivers: [] };
      listOf(n.drivers).forEach((d, k) => {
        if (!isObject(d)) return;
        const dp = `${np}_${k + 1}`;
        const drv = {
          id: idOf(d.id, `d${dp}`),
          text: textOr(d.text),
          type: TYPES_1_0.includes(d.type) ? d.type : 'ctq',
          requirements: [],
        };
        listOf(d.requirements).forEach((r, l) => {
          if (!isObject(r)) return;
          drv.requirements.push({
            id: idOf(r.id, `r${dp}_${l + 1}`),
            text: textOr(r.text),
            target: textOr(r.target),
            measure: textOr(r.measure),
          });
        });
        need.drivers.push(drv);
      });
      voc.needs.push(need);
    });
    vocs.push(voc);
  });

  const styles = isObject(o.styles) ? o.styles : {};
  const colors = isObject(styles.colors) ? styles.colors : {};
  return {
    vocs,
    styles: {
      borderWidth: borderWidth(styles.borderWidth),
      colors: Object.fromEntries(Object.entries(COLORS_1_0)
        .map(([key, def]) => [key, isColor(colors[key]) ? colors[key] : def])),
    },
    activeVocId: typeof o.activeVocId === 'string' ? o.activeVocId : null,
  };
}
