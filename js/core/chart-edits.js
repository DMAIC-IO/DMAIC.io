/**
 * D.Mike — Editor-Einstellungen der Diagramm-Widgets (chart-edits.js)
 *
 * Rein. Überlagert gespeicherte Einstellungen über die Konfiguration des
 * Moduls und leitet aus einer Editor-Änderung die neuen Einstellungen ab.
 * Reihen-Einstellungen hängen am Reihennamen der Modulkonfiguration; ein im
 * Editor geänderter Name steht als `label` in der Zeile.
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
  if (Array.isArray(config.series)) {
    out.series = config.series.map((/** @type {any} */ s) => {
      const e = (Array.isArray(edits.series) ? edits.series : []).find((/** @type {any} */ x) => x.name === s.name);
      // Immer eine Kopie: der Diagramm-Editor ändert die Reihen des Diagramms
      // an Ort und Stelle, das darf die Konfiguration des Moduls nicht berühren.
      const merged = { ...s };
      if (!e) return merged;
      for (const k of editable.series) if (e[k] !== undefined) merged[k] = clone(e[k]);
      if (typeof e.label === 'string' && e.label !== '') merged.name = e.label;
      return merged;
    });
  }
  return out;
}

/**
 * Was das Diagramm zeigt, beschränkt auf die bearbeitbaren Schlüssel (Reihen mit Namen).
 * Mit der Modulkonfiguration ist der Name einer Reihe der dort gleichen Index; ein
 * davon abweichender, nicht leerer Name im Diagramm steht als `label` daneben.
 * @param {Record<string, any>} chartConfig @param {{ base: readonly string[], series: readonly string[] }} editable
 * @param {Record<string, any>|null} [config] Konfiguration des Moduls ohne Einstellungen
 * @returns {Record<string, any>}
 */
export function pickShown(chartConfig, editable, config = null) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of editable.base) if (chartConfig[k] !== undefined) out[k] = clone(chartConfig[k]);
  if (Array.isArray(chartConfig.series)) {
    const keys = Array.isArray(config?.series) ? config.series : null;
    out.series = chartConfig.series.map((/** @type {any} */ s, /** @type {number} */ i) => {
      const key = keys?.[i]?.name ?? s.name;
      /** @type {Record<string, any>} */
      const r = { name: key };
      if (typeof s.name === 'string' && s.name !== '' && s.name !== key) r.label = s.name;
      for (const k of editable.series) if (s[k] !== undefined) r[k] = clone(s[k]);
      return r;
    });
  }
  return out;
}

/**
 * Neue Einstellungen aus einer Editor-Änderung. Ein geleertes Textfeld heißt
 * „automatisch“: der Schlüssel entfällt und steht in `cleared`. Reihen werden nach
 * Index verglichen, die Zeile hängt am Namen aus `before`; `label` (angezeigter
 * Name, siehe `pickShown`) zählt wie ein bearbeitbarer Reihenschlüssel.
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
      for (const k of [...editable.series, 'label']) {
        if (same(before.series[i][k], s[k])) continue;
        let row = rows.find((/** @type {any} */ r) => r.name === name);
        if (!row) { row = { name }; rows.push(row); }
        if (s[k] === undefined) delete row[k]; else row[k] = clone(s[k]);
      }
    });
    const kept = rows.filter((/** @type {any} */ r) => Object.keys(r).some((k) => k !== 'name'));
    rows.length = 0; rows.push(...kept);
    if (rows.length) next.series = rows; else delete next.series;
  }
  return { next, cleared };
}
