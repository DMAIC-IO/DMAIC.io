/**
 * D.Mike — Shape- und Pfadzugriff der Agentenschicht (agent-shape.js)
 *
 * Zwei Walker über denselben Punktpfad: `pathExistsInShape` läuft gegen eine
 * DEKLARIERTE Ergebnisform (Prüfzeit, Spec §5 Stufe 4), `getAtPath` gegen
 * einen ECHTEN Wert (Laufzeit, Referenzauflösung). Beide melden im Fehlerfall
 * das schuldige Segment und die vorhandenen Schlüssel der Ebene — das ist die
 * AXI-Zusage aus Spec §6 für unbekannte Pfadsegmente.
 *
 * Rein: keine Abhängigkeiten, kein DOM.
 */

/** Ein Segment ist ein Array-Index, wenn es ausschließlich aus Ziffern besteht. */
function isIndex(segment) {
  return segment.length > 0 && /^\d+$/.test(segment);
}

/**
 * Ist diese Shape-Ebene die Nullable-Hülle `{ $nullable: <shape> }`?
 * @param {any} shape
 * @returns {boolean}
 */
function isNullableShape(shape) {
  return !!shape && typeof shape === 'object' && !Array.isArray(shape)
    && Object.prototype.hasOwnProperty.call(shape, '$nullable');
}

/** @returns {string[]} Segmente eines Punktpfads; [] für einen leeren Pfad. */
function split(path) {
  return String(path ?? '').split('.').filter(s => s.length > 0);
}

/**
 * Prüfe, ob ein Punktpfad in einer deklarierten Ergebnisform existiert.
 * @param {any} shape  Shape-Grammatik aus agent-contract.js
 * @param {string} path  Punktpfad mit Zahlenindizes
 * @returns {{ ok: true }
 *   | { ok: false, segment: string, available: string[], nullable?: boolean }}
 *   `nullable: true` heißt: das Segment ist richtig, nur der Abstieg nicht —
 *   die Ebene darüber kann zur Laufzeit null sein.
 */
export function pathExistsInShape(shape, path) {
  const segments = split(path);
  if (segments.length === 0) return { ok: false, segment: '', available: keysOfShape(shape) };
  let cur = shape;
  for (const segment of segments) {
    if (cur === 'any') return { ok: true };
    // Eine Nullable-Form ist als ZIEL erlaubt, als DURCHGANG nicht: der Prüfer
    // weiß nicht, ob zur Laufzeit ein Modul offen ist, und ein durchgelassener
    // Pfad scheiterte dann als `unresolved_ref`. Der gültige Weg ist, die Form
    // selbst zu referenzieren und im nächsten Stapel zu verzweigen — deshalb
    // nennt `available` die INNEREN Schlüssel: das ist die Auskunft, die der
    // Agent für diesen Weg braucht, und `[]` wäre nicht von „Skalar hat keine
    // Tiefe" zu unterscheiden.
    if (isNullableShape(cur)) {
      return { ok: false, segment, available: keysOfShape(cur), nullable: true };
    }
    if (Array.isArray(cur)) {
      if (!isIndex(segment)) return { ok: false, segment, available: [] };
      cur = cur[0];
      continue;
    }
    if (cur && typeof cur === 'object') {
      if (!Object.prototype.hasOwnProperty.call(cur, segment)) {
        return { ok: false, segment, available: Object.keys(cur) };
      }
      cur = cur[segment];
      continue;
    }
    // Skalares Shape ('string' | 'number' | 'boolean') hat keine Tiefe.
    return { ok: false, segment, available: [] };
  }
  return { ok: true };
}

/**
 * Die Schlüssel einer Shape-Ebene, [] für Skalare und Arrays.
 *
 * Die Nullable-Hülle wird übersprungen: `$nullable` ist ein Grammatikwort und
 * kein Feld, das ein Agent referenzieren könnte — es als „verfügbar" zu
 * melden würde ihn in einen Pfad schicken, den der Prüfer wieder ablehnt.
 *
 * @param {any} shape
 * @returns {string[]}
 */
function keysOfShape(shape) {
  const inner = isNullableShape(shape) ? shape.$nullable : shape;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return Object.keys(inner);
  return [];
}

/**
 * Lies einen Punktpfad aus einem echten Wert.
 * @param {any} value
 * @param {string} path
 * @returns {{ ok: true, value: any } | { ok: false, segment: string, available: string[] }}
 */
export function getAtPath(value, path) {
  const segments = split(path);
  if (segments.length === 0) return { ok: false, segment: '', available: keysOfValue(value) };
  let cur = value;
  for (const segment of segments) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return { ok: false, segment, available: keysOfValue(cur) };
    }
    if (Array.isArray(cur)) {
      if (!isIndex(segment)) return { ok: false, segment, available: [] };
      const idx = Number(segment);
      if (idx >= cur.length) return { ok: false, segment, available: [] };
      cur = cur[idx];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, segment)) {
      return { ok: false, segment, available: Object.keys(cur) };
    }
    cur = cur[segment];
  }
  return { ok: true, value: cur };
}

/** @returns {string[]} eigene Schlüssel eines Objekts, [] für alles andere. */
function keysOfValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value);
  return [];
}
