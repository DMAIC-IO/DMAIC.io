/**
 * D.Mike — Editor-Einstellungen der Diagramm-Widgets (chart-edits.js)
 *
 * Rein. Überlagert gespeicherte Einstellungen über die Konfiguration des
 * Moduls und leitet aus einer Editor-Änderung die neuen Einstellungen ab.
 * Reihen-Einstellungen hängen am Reihennamen.
 */

/** @param {any} v @returns {any} */
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/** @param {any} a @param {any} b @returns {boolean} */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Schlüssel, die die Konfiguration des Moduls selbst setzt und die darum dem Modul gehören.
 * @param {Record<string, any>} config @returns {Set<string>}
 */
export function ownedKeys(config) {
  return new Set(['refLines', 'refAreas'].filter((k) => config[k] !== undefined));
}

/**
 * Gespeicherte Einstellungen über die Konfiguration des Moduls legen.
 * @param {Record<string, any>} config Konfiguration des Moduls
 * @param {Record<string, any>} edits gespeicherte Einstellungen
 * @param {{ base: readonly string[], series: readonly string[] }} editable
 * @param {Set<string>} owned
 * @returns {Record<string, any>}
 */
export function applyEdits(config, edits, editable, owned) {
  const out = { ...config };
  for (const k of editable.base) if (!owned.has(k) && edits[k] !== undefined) out[k] = clone(edits[k]);
  if (Array.isArray(config.series) && Array.isArray(edits.series)) {
    out.series = config.series.map((/** @type {any} */ s) => {
      const e = edits.series.find((/** @type {any} */ x) => x.name === s.name);
      if (!e) return s;
      const merged = { ...s };
      for (const k of editable.series) if (e[k] !== undefined) merged[k] = clone(e[k]);
      return merged;
    });
  }
  return out;
}

/**
 * Was das Diagramm zeigt, beschränkt auf die bearbeitbaren Schlüssel (Reihen mit Namen).
 * @param {Record<string, any>} chartConfig @param {{ base: readonly string[], series: readonly string[] }} editable
 * @returns {Record<string, any>}
 */
export function pickShown(chartConfig, editable) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of editable.base) if (chartConfig[k] !== undefined) out[k] = clone(chartConfig[k]);
  if (Array.isArray(chartConfig.series)) {
    out.series = chartConfig.series.map((/** @type {any} */ s) => {
      /** @type {Record<string, any>} */
      const r = { name: s.name };
      for (const k of editable.series) if (s[k] !== undefined) r[k] = clone(s[k]);
      return r;
    });
  }
  return out;
}

/**
 * Neue Einstellungen aus einer Editor-Änderung. Ein geleertes Textfeld heißt
 * „automatisch“: der Schlüssel entfällt und steht in `cleared`.
 * @param {Record<string, any>|null} prev bisher gespeicherte Einstellungen
 * @param {Record<string, any>} before `pickShown` vor der Änderung
 * @param {Record<string, any>} after `pickShown` danach
 * @param {{ base: readonly string[], series: readonly string[] }} editable
 * @param {Set<string>} owned
 * @returns {{ next: Record<string, any>, cleared: string[] }}
 */
export function diffEdits(prev, before, after, editable, owned) {
  const next = clone(prev ?? {});
  /** @type {string[]} */
  const cleared = [];
  for (const k of editable.base) {
    if (owned.has(k) || same(before[k], after[k])) continue;
    if (after[k] === '' || after[k] === undefined) { delete next[k]; cleared.push(k); } else next[k] = clone(after[k]);
  }
  if (Array.isArray(before.series) && Array.isArray(after.series)) {
    const rows = Array.isArray(next.series) ? next.series : [];
    after.series.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      const name = before.series[i]?.name;
      if (name == null) return;
      for (const k of editable.series) {
        if (same(before.series[i][k], s[k])) continue;
        let row = rows.find((/** @type {any} */ r) => r.name === name);
        if (!row) { row = { name }; rows.push(row); }
        if (s[k] === undefined) delete row[k]; else row[k] = clone(s[k]);
      }
    });
    if (rows.length) next.series = rows; else delete next.series;
  }
  return { next, cleared };
}
