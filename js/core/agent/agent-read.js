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
 * @param {Record<string, { type: string, help: string, bulk: boolean,
 *   bulkKind?: 'table'|'tree' }>} fieldSchema
 *   der `fields`-Teil des Registry-Eintrags (siehe AgentModuleEntry).
 *   `bulkKind` sagt, welchen Umfangs-Deskriptor ein Massenfeld bekommt;
 *   fehlt es, gilt `'table'`.
 * @param {{ fields?: string[], rows?: { from: number, to: number } }} [options]
 * @returns {object} die Projektion; ein erklärtes Feld, das `modelJson` nicht
 *   führt, FEHLT darin (nicht `undefined`) — nur so fällt der
 *   Driftvergleich „Schlüssel von read() == erklärte Felder"; Massenfelder entweder als Deskriptor
 *   (`{ $bulk: true, kind: 'table', rowCount, columns }` bzw.
 *   `{ $bulk: true, kind: 'tree', nodeCount, depth }`) oder (wenn in
 *   `options.fields` genannt) als Daten, bei gesetztem `options.rows`
 *   zusätzlich mit einem Schwesterschlüssel `<feld>$range`.
 *   Ein kaputter Bereich (`from > to`) ist ein kaputter AUFRUF: dann kommt
 *   statt der Projektion `{ $error: 'wrong_type', $message }` zurück. Diese
 *   Funktion ist rein und kennt `i18n` nicht — sie wirft nicht, der Aufrufer
 *   (`readAgentState`) macht daraus einen benannten Fehler.
 */
export function projectReadState(modelJson, fieldSchema, options = {}) {
  const requested = new Set(Array.isArray(options.fields) ? options.fields : []);
  const range = options.rows && typeof options.rows === 'object' ? options.rows : null;
  const source = modelJson && typeof modelJson === 'object' ? modelJson : {};
  const out = {};

  // Der Worksheet-Fall: genau ein tabellarisches Massenfeld, und das globale
  // `columns` gehört eindeutig dazu. Ab zwei ist die Zuordnung offen und die
  // Konvention ist das Schwesterfeld.
  const tableFields = Object.entries(fieldSchema)
    .filter(([n, s]) => s.bulk && (s.bulkKind ?? 'table') === 'table' && !n.startsWith('_'));
  const soleTable = tableFields.length === 1;

  // `from > to` ist kein leerer Bereich, sondern ein kaputter Aufruf. Bisher
  // kam stillschweigend ein leeres Array mit unplausiblem `$range` zurück,
  // und ein Agent hielt das für eine Aussage über die Daten.
  if (range && Number.isFinite(Number(range.from)) && Number.isFinite(Number(range.to))
      && Number(range.from) > Number(range.to)) {
    return {
      $error: 'wrong_type',
      $message: `rows.from (${range.from}) is greater than rows.to (${range.to})`,
    };
  }

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
      out[name] = (spec.bulkKind ?? 'table') === 'tree'
        ? { $bulk: true, kind: 'tree', ...treeExtent(rows) }
        : {
          $bulk: true,
          kind: 'table',
          rowCount: rows.length,
          columns: columnNames(source, name, soleTable),
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
 * Spaltennamen für den Umfangs-Deskriptor EINES Massenfeldes.
 *
 * Auflösung in dieser Reihenfolge:
 *   1. ein Schwesterfeld `<feld>Columns` — die Form, die ein Modul mit mehr
 *      als einer Tabelle braucht,
 *   2. das globale `columns`, aber NUR wenn das Schema genau ein
 *      tabellarisches Massenfeld führt (der Worksheet-Fall),
 *   3. leer.
 *
 * Zuvor nahm jedes Massenfeld das globale `columns` — ein Modul mit zwei
 * Tabellen bekam zweimal dieselben Spalten, und für das zweite Feld war die
 * Angabe schlicht falsch. Eine falsche Spaltenliste ist schlechter als
 * keine: `rowCount` trägt die eigentliche Information, und eine Liste zu
 * erraten wäre geraten.
 *
 * @param {object} source
 * @param {string} name  Feldname
 * @param {boolean} soleTable  ob dieses Feld das einzige tabellarische Massenfeld ist
 * @returns {string[]}
 */
function columnNames(source, name, soleTable) {
  const sibling = source[`${name}Columns`];
  const columns = Array.isArray(sibling)
    ? sibling
    : (soleTable && Array.isArray(source.columns) ? source.columns : null);
  if (!columns) return [];
  return columns.map(c => (c && typeof c === 'object' ? String(c.name ?? '') : String(c ?? '')));
}

/**
 * Der Umfang eines Baumes: Knotenzahl und Tiefe.
 *
 * Konvention: ein Knoten führt seine Kinder in `children`. Das ist die Form
 * aller verzweigten Modulzustände im Baum (`five-why`: `{ id, level,
 * parentId, question, answer, children, collapsed }`). Ein Feld anderer Form
 * bekommt `nodeCount` der obersten Ebene und `depth: 1` — immer noch eine
 * wahre Aussage, nur eine gröbere.
 *
 * @param {any[]} nodes
 * @returns {{ nodeCount: number, depth: number }}
 */
function treeExtent(nodes) {
  let nodeCount = 0;
  let depth = 0;
  const walk = (list, level) => {
    if (!Array.isArray(list) || list.length === 0) return;
    depth = Math.max(depth, level);
    for (const node of list) {
      nodeCount += 1;
      if (node && typeof node === 'object') walk(node.children, level + 1);
    }
  };
  walk(nodes, 1);
  return { nodeCount, depth };
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
