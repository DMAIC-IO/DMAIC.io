/**
 * D.Mike — read()-Projektion der Agentenschicht (agent-read.js)
 *
 * Spec §7: `read()` ohne Parameter liefert den Zustand OHNE Massendaten plus
 * deren Umfang („3 Spalten, 5000 Zeilen"), damit der Agent gezielt
 * nachfragen kann, statt ein Arbeitsblatt mit 5000 Zeilen durch sein
 * Kontextfenster zu schieben.
 *
 * Diese Funktion liegt in der Kernschicht und nicht in jedem Modul: so hat
 * sie Tests, bevor das erste Modul freigegeben ist, und alle Module
 * verhalten sich gleich. Ein Modul-`read()` delegiert hierher.
 *
 * Rein: keine Abhängigkeiten, kein DOM.
 */

/**
 * @param {object} modelJson   `model.toJSON()` des Moduls
 * @param {Record<string, { type: string, help: string, bulk: boolean }>} fieldSchema
 *   der `fields`-Teil des Registry-Eintrags (siehe AgentModuleEntry)
 * @param {{ fields?: string[], rows?: { from: number, to: number } }} [options]
 * @returns {object} die Projektion; ein erklärtes Feld, das `modelJson` nicht
 *   führt, FEHLT darin (nicht `undefined`) — nur so fällt der
 *   Driftvergleich „Schlüssel von read() == erklärte Felder"; Massenfelder entweder als Deskriptor
 *   `{ $bulk: true, kind, rowCount, columns }` oder (wenn in `options.fields`
 *   genannt) als Daten, bei gesetztem `options.rows` zusätzlich mit einem
 *   Schwesterschlüssel `<feld>$range`.
 */
export function projectReadState(modelJson, fieldSchema, options = {}) {
  const requested = new Set(Array.isArray(options.fields) ? options.fields : []);
  const range = options.rows && typeof options.rows === 'object' ? options.rows : null;
  const source = modelJson && typeof modelJson === 'object' ? modelJson : {};
  const out = {};

  for (const [name, spec] of Object.entries(fieldSchema)) {
    if (name.startsWith('_')) continue;            // privat, erscheint nie
    // Ein erklärtes Feld, das die Momentaufnahme NICHT führt, erscheint auch
    // nicht in der Projektion. Zuvor legte die Schleife den Schlüssel
    // unbedingt an (`clone(undefined)` ist `undefined`) — damit war die
    // Schlüsselmenge von `read()` PER KONSTRUKTION identisch zur erklärten
    // Feldliste, und der Driftvergleich der Pilotmodule konnte nie fallen:
    // ein aus der Momentaufnahme verschwundenes Feld kam als `undefined`
    // zurück und der Vergleich blieb grün. Jetzt fehlt der Schlüssel, und
    // der Vergleich wird rot.
    //
    // `null` ist davon unberührt: ein Feld, das die Momentaufnahme mit
    // `null` führt (`result`, `colRef1`, `alpha`), ist VORHANDEN und ein
    // dokumentierter Leerzustand — es kommt weiter durch.
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = source[name];

    if (!spec.bulk) {
      out[name] = clone(value);
      continue;
    }

    const rows = Array.isArray(value) ? value : [];

    if (!requested.has(name)) {
      out[name] = {
        $bulk: true,
        kind: 'table',
        rowCount: rows.length,
        columns: columnNames(source),
      };
      continue;
    }

    if (!range) {
      out[name] = clone(rows);
      continue;
    }

    const from = clampIndex(range.from, rows.length);
    const to = clampIndex(range.to, rows.length);
    out[name] = clone(rows.slice(from, to));
    out[`${name}$range`] = { from, to, rowCount: rows.length };
  }

  return out;
}

/**
 * Spaltennamen für den Umfangs-Deskriptor. Konvention: ein Schwesterfeld
 * `columns` mit `{ name }`-Einträgen (so sieht der Worksheet-Zustand aus).
 * Fehlt es, bleibt die Liste leer — eine Zeile zu erraten wäre geraten, und
 * `rowCount` trägt die eigentliche Information.
 * @param {object} source
 * @returns {string[]}
 */
function columnNames(source) {
  const columns = source.columns;
  if (!Array.isArray(columns)) return [];
  return columns.map(c => (c && typeof c === 'object' ? String(c.name ?? '') : String(c ?? '')));
}

/** Index auf [0, length] begrenzen; kaputte Eingaben werden 0 bzw. length. */
function clampIndex(raw, length) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), length);
}

/**
 * Tiefe Kopie, damit der Agent nie eine Referenz auf den lebenden
 * Modellzustand in der Hand hält.
 *
 * Drei Stufen, und KEIN stilles `null`: ein `null` wäre für den Agenten von
 * „noch nicht gerechnet" nicht zu unterscheiden, und genau das ist bei einem
 * rechnenden Modul der dokumentierte Leerzustand.
 *
 *   1. `structuredClone` — der Normalfall, verlustfrei.
 *   2. JSON-Runde — fängt die Werte, an denen `structuredClone` scheitert,
 *      obwohl sie reine Daten sind: ein reaktiver Proxy (Alpine) ist der
 *      häufigste Fall, denn jedes Viewmodel-Feld in einer erklärten
 *      Lesefläche ist einer. Verlustbehaftet nur dort, wo JSON verlustbehaftet
 *      ist (NaN/Infinity → null, undefined/Funktionen fallen weg).
 *   3. Sichtbarer Marker statt `null` — ein `Map`, ein `Set`, ein Zyklus:
 *      der Agent sieht, DASS hier etwas nicht übertragbar war.
 *
 * @param {any} value
 * @returns {any}
 */
function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  try { return structuredClone(value); } catch { /* Stufe 2 */ }
  try { return JSON.parse(JSON.stringify(value)); } catch (err) {
    return { $unserializable: true, reason: err?.message ?? String(err) };
  }
}
