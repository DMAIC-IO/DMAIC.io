/**
 * D.Mike — VoC → CTx-Baum: Hilfen für den Baum.
 *
 * Reine Funktionen über die Liste der Kundenstimmen. Vier Ebenen:
 * Kundenstimme → Bedürfnis → Treiber (CTQ, CTD, CTC) → Anforderung.
 * Ohne DOM, ohne i18n.
 */

/**
 * @typedef {{ id: string, text: string, target: string, measure: string }} Requirement
 * @typedef {{ id: string, text: string, type: string, requirements: Requirement[] }} Driver
 * @typedef {{ id: string, text: string, drivers: Driver[] }} Need
 * @typedef {{ id: string, text: string, source: string, needs: Need[] }} Voc
 */

/** Die drei Treiberarten: Critical to Quality, to Delivery, to Cost. */
export const VALID_TYPES = Object.freeze(['ctq', 'ctd', 'ctc']);

/** Die Knotenarten mit eigener Farbe (Schlüssel von `styles.colors`). */
export const COLOR_KEYS = Object.freeze(['voc', 'need', 'ctq', 'ctd', 'ctc', 'req']);

/** Vorgabefarben je Knotenart. */
export const DEFAULT_COLORS = Object.freeze({
  voc: 'rgba(230,126,34,1)',
  need: 'rgba(155,89,182,1)',
  ctq: 'rgba(39,174,96,1)',
  ctd: 'rgba(41,128,185,1)',
  ctc: 'rgba(231,76,139,1)',
  req: 'rgba(94,88,216,1)',
});

/** Die Stufen der Randstärke in Pixeln: 0 bis 4 in Schritten von 0,5. */
export const BORDER_WIDTHS = Object.freeze([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]);

/** Kleinste und größte Randstärke. */
export const MIN_BORDER = 0;
export const MAX_BORDER = 4;

/**
 * `rgb(r,g,b)` oder `rgba(r,g,b,a)`; das Alpha mit beliebig vielen
 * Nachkommastellen (der Farbwähler schreibt `1.00`), höchstens 1. Die
 * Kanäle prüft `isColor` auf 0 bis 255.
 */
const COLOR_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*)?\)$/;

/**
 * Ist `v` eine Farbe als `rgb()`/`rgba()` mit Kanälen 0 bis 255 und Alpha
 * 0 bis 1?
 * @param {unknown} v @returns {boolean}
 */
export function isColor(v) {
  const m = typeof v === 'string' ? COLOR_RE.exec(v) : null;
  return Boolean(m) && m.slice(1, 4).every((c) => Number(c) <= 255);
}

/**
 * Liegt `w` auf einer Stufe der Randstärke (Vielfaches von 0,5)?
 * @param {number} w @returns {boolean}
 */
export function onBorderStep(w) {
  return Number.isInteger(w * 2);
}

/**
 * Die nächste Stufe der Randstärke, auf 0 bis 4 geklemmt.
 * @param {number} w @returns {number}
 */
export function nearestBorderStep(w) {
  return Math.min(MAX_BORDER, Math.max(MIN_BORDER, Math.round(w * 2) / 2));
}

/**
 * Die Kundenstimme mit dieser id.
 * @param {ReadonlyArray<Voc>} vocs @param {string} vocId @returns {Voc|undefined}
 */
export function findVoc(vocs, vocId) {
  return vocs.find((v) => v.id === vocId);
}

/**
 * Das Bedürfnis mit dieser id unter der Kundenstimme.
 * @param {ReadonlyArray<Voc>} vocs @param {string} vocId @param {string} needId
 * @returns {Need|undefined}
 */
export function findNeed(vocs, vocId, needId) {
  return findVoc(vocs, vocId)?.needs.find((n) => n.id === needId);
}

/**
 * Der Treiber mit dieser id unter Kundenstimme und Bedürfnis.
 * @param {ReadonlyArray<Voc>} vocs @param {string} vocId @param {string} needId @param {string} drvId
 * @returns {Driver|undefined}
 */
export function findDriver(vocs, vocId, needId, drvId) {
  return findNeed(vocs, vocId, needId)?.drivers.find((d) => d.id === drvId);
}

/**
 * Alle ids des Baums in Anzeigereihenfolge (Tiefe zuerst), über alle vier
 * Ebenen.
 * @param {ReadonlyArray<Voc>} vocs @returns {string[]}
 */
export function allIds(vocs) {
  const ids = [];
  for (const v of vocs) {
    ids.push(v.id);
    for (const n of v.needs) {
      ids.push(n.id);
      for (const d of n.drivers) {
        ids.push(d.id);
        for (const r of d.requirements) ids.push(r.id);
      }
    }
  }
  return ids;
}

/**
 * Die angezeigte Kundenstimme: die gespeicherte id, wenn es sie gibt, sonst
 * die erste Stimme, ohne Stimmen `null`.
 * @param {ReadonlyArray<Voc>} vocs @param {string|null} activeVocId @returns {string|null}
 */
export function effectiveActiveId(vocs, activeVocId) {
  if (activeVocId !== null && vocs.some((v) => v.id === activeVocId)) return activeVocId;
  return vocs.length > 0 ? vocs[0].id : null;
}

/**
 * Zahl der Anforderungen unter einer Kundenstimme.
 * @param {Voc} voc @returns {number}
 */
export function totalReqs(voc) {
  return voc.needs.reduce((s, n) => s + n.drivers.reduce((s2, d) => s2 + d.requirements.length, 0), 0);
}

/**
 * Der Baum als Tabellenzeilen: Kundenstimme, Herkunft, Bedürfnis, Art des
 * Treibers in Großbuchstaben, Treiber, Anforderung, Zielwert, Messgröße.
 * Eine Ebene ohne Kinder ergibt eine Zeile mit leeren Zellen dahinter.
 * @param {ReadonlyArray<Voc>} vocs @returns {string[][]}
 */
export function exportRows(vocs) {
  const rows = [];
  for (const voc of vocs) {
    if (voc.needs.length === 0) {
      rows.push([voc.text, voc.source || '', '', '', '', '', '', '']);
      continue;
    }
    for (const need of voc.needs) {
      if (need.drivers.length === 0) {
        rows.push([voc.text, voc.source || '', need.text, '', '', '', '', '']);
        continue;
      }
      for (const drv of need.drivers) {
        if (drv.requirements.length === 0) {
          rows.push([voc.text, voc.source || '', need.text, drv.type.toUpperCase(), drv.text, '', '', '']);
          continue;
        }
        for (const req of drv.requirements) {
          rows.push([
            voc.text, voc.source || '', need.text,
            drv.type.toUpperCase(), drv.text,
            req.text, req.target || '', req.measure || '',
          ]);
        }
      }
    }
  }
  return rows;
}
