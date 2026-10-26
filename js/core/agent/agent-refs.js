/**
 * D.Mike — Referenzen der Agentenschicht (agent-refs.js)
 *
 * Eine Aktion darf sich auf das Ergebnis jeder VORHERIGEN Aktion desselben
 * Stapels beziehen, auch auf Leseergebnisse. Die Form ist
 * ausdrücklich ein Objekt `{ $from, path }` und kein Platzhalterstring:
 * `"$a1.x"` wäre von echten Nutzerdaten, die mit `$` beginnen, nicht zu
 * unterscheiden.
 *
 * `path` ist ein Punktpfad mit Zahlenindizes — keine Arithmetik, keine
 * Filter, keine Ausdrücke. Diese Grenze ist der Grund, warum die
 * Referenzauflösung nicht in eine Abfragesprache rutscht: wer transformieren
 * muss, liest und schickt einen zweiten Stapel.
 *
 * Rein: keine Abhängigkeit außer dem Pfadleser.
 */
import { getAtPath } from './agent-shape.js';

/**
 * Erkennt die Referenzform: ein Objekt mit String-`$from` und String-`path`.
 * @param {any} value
 * @returns {boolean} true nur für `{ $from: string, path: string }`
 */
export function isRef(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.$from === 'string'
    && typeof value.path === 'string';
}

/**
 * Alle Referenzen eines Werts, rekursiv durch Objekte und Arrays, in
 * Begehungsreihenfolge. Duplikate bleiben erhalten — der Prüfer interessiert
 * sich für jede Fundstelle einzeln.
 * @param {any} value
 * @returns {Array<{ from: string, path: string }>}
 */
export function collectRefs(value) {
  const out = [];
  walk(value, out);
  return out;
}

/**
 * Rekursiver Walker für `collectRefs`.
 * @private
 */
function walk(value, out) {
  if (isRef(value)) {
    out.push({ from: value.$from, path: value.path });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, out);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      walk(value[key], out);
    }
  }
}

/**
 * Ersetze jede Referenz durch den Wert, auf den sie zeigt. Nicht mutierend:
 * der Aufrufer behält sein Aktionsobjekt unverändert (der Prüfer hat es schon
 * gesehen, und ein Fehlerbericht soll die Originalform zeigen).
 * @param {any} value
 * @param {Map<string, any>} results  Aktions-`id` → Ergebniswert vorheriger Aktionen
 * `available` hat ZWEI Bedeutungen, und `reason` sagt welche (Review-Befund
 * M2): bei `unknown_id` sind es die Aktions-IDs, die bereits ein Ergebnis
 * haben; bei `bad_path` die Schlüssel der Ebene, an der der Pfad abbricht.
 * Ohne diese Unterscheidung wäre aus dem Feld allein nicht zu lesen, worauf
 * sich die Liste bezieht — und die Meldung könnte es nicht sagen.
 *
 * @returns {{ ok: true, value: any }
 *          |{ ok: false, reason: 'unknown_id'|'bad_path', from: string,
 *             path: string, segment: string, available: string[] }}
 */
export function resolveRefs(value, results) {
  if (isRef(value)) {
    if (!results.has(value.$from)) {
      return {
        ok: false,
        reason: 'unknown_id',
        from: value.$from,
        path: value.path,
        segment: '',
        available: [...results.keys()],
      };
    }
    const read = getAtPath(results.get(value.$from), value.path);
    if (!read.ok) {
      return {
        ok: false,
        reason: 'bad_path',
        from: value.$from,
        path: value.path,
        segment: read.segment,
        available: read.available,
      };
    }
    return { ok: true, value: read.value };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      const r = resolveRefs(item, results);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out };
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      const r = resolveRefs(value[key], results);
      if (!r.ok) return r;
      out[key] = r.value;
    }
    return { ok: true, value: out };
  }
  return { ok: true, value };
}
