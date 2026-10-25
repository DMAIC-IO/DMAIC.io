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
 *   bulkKind?: 'table'|'tree', omit?: string[] }>} fieldSchema
 *   der `fields`-Teil des Registry-Eintrags (siehe AgentModuleEntry).
 *   `bulkKind` sagt, welchen Umfangs-Deskriptor ein Massenfeld bekommt;
 *   fehlt es, gilt `'table'`.
 *   `omit` nennt Teilwerte, die `read()` nie ausliefert (`inScope[].dataUrl`,
 *   `[][].image`): jeder getroffene Wert außer `null`/`undefined` wird
 *   `{ $omitted: true, bytes }`, nach der Massendaten-Behandlung — also auch
 *   bei `options.fields` und `options.rows`.
 * @param {{ fields?: string[], rows?: { from: number, to: number } }} [options]
 * @returns {object} die Projektion; ein erklärtes Feld, das `modelJson` nicht
 *   führt, FEHLT darin (nicht `undefined`) — nur so fällt der
 *   Driftvergleich „Schlüssel von read() == erklärte Felder"; Massenfelder entweder als Deskriptor
 *   (`{ $bulk: true, kind: 'table', rowCount, columns }` bzw.
 *   `{ $bulk: true, kind: 'tree', nodeCount, depth }`) oder (wenn in
 *   `options.fields` genannt) als Daten, bei gesetztem `options.rows`
 *   zusätzlich mit einem Schwesterschlüssel `<feld>$range`.
 *   Ein kaputter Bereich ist ein kaputter AUFRUF: dann kommt statt der
 *   Projektion `{ $invalidCall: '<Meldung>' }` zurück — die Meldung allein,
 *   ohne Fehlercode. Der Code der Fläche entsteht erst am Fang-Punkt
 *   (`call_failed`, siehe `agent-read-mixin.js`); ein zweiter Code hier wäre
 *   toter Inhalt. Diese Funktion ist rein und kennt `i18n` nicht — sie wirft
 *   nicht (auch nicht bei einem Zyklus im Baum, siehe `treeExtent`), der
 *   Aufrufer (`readAgentState`) macht aus dem Marker einen benannten Fehler.
 *
 *   Die Spalten eines tabellarischen Massenfeldes hängen am SCHEMA, nicht an
 *   der Momentaufnahme: führt ein Modul zwei tabellarische Massenfelder,
 *   bekommt auch das eine, das die Momentaufnahme gerade führt, kein
 *   globales `columns` (nur sein Schwesterfeld oder gar keine). Das ist
 *   gewollt — die Zuordnung des globalen `columns` ist dann offen, und eine
 *   falsche Spaltenliste ist schlechter als keine.
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
    .filter(([n, s]) => s.bulk && bulkKindOf(s) === 'table' && !n.startsWith('_'));
  const soleTable = tableFields.length === 1;

  // Ein kaputter Bereich ist kein leerer Bereich, sondern ein kaputter
  // Aufruf. Bisher kam stillschweigend ein leeres Array mit unplausiblem
  // `$range` zurück, und ein Agent hielt das für eine Aussage über die Daten.
  const fault = range ? rangeFault(range) : null;
  if (fault) return { $invalidCall: fault };

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
      out[name] = omitPaths(clone(value), spec.omit);
      continue;
    }

    const rows = Array.isArray(value) ? value : [];

    if (!requested.has(name)) {
      out[name] = bulkKindOf(spec) === 'tree'
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
      out[name] = omitPaths(clone(rows), spec.omit);
      continue;
    }

    const from = clampIndex(range.from, rows.length);
    const to = clampIndex(range.to, rows.length);
    out[name] = omitPaths(clone(rows.slice(from, to)), spec.omit);
    out[`${name}$range`] = { from, to, rowCount: rows.length };
  }

  return out;
}

/**
 * Die Massendaten-Arten, die der Vertrag zusichert (`AgentModuleEntry` in
 * `agent-contract.js`). Dieselbe Menge prüft der Generator und MELDET einen
 * Verstoß (`invalid_bulk_kind:<feld>:<wert>`, `tools/build/agent-data.mjs`) —
 * dort ist der Befund dem Modulautor sichtbar und behebbar.
 */
const BULK_KINDS = ['table', 'tree'];

/**
 * Die Art eines Massenfeldes, auf die erlaubte Menge normalisiert.
 *
 * Genau EINE Stelle, weil es zuvor zwei gab: die `soleTable`-Zählung
 * verlangte `=== 'table'`, der Deskriptorblock behandelte alles außer
 * `'tree'` als Tabelle. Ein Feld mit erfundener Art (`[bulk:graph]`) war
 * damit eine Tabelle, die nicht mitzählt — und beide Massenfelder bekamen
 * wieder das globale `columns`, also für eines die falsche Spaltenliste.
 *
 * Unbekannte Art heißt Rückfall auf `'table'`, nicht Wurf: der Fehler liegt
 * im Modulquelltext, nicht im Aufruf des Agenten. Ein Wurf nähme ihm den
 * Lesezugriff für etwas, das er nicht beheben kann, und widerspräche der
 * Zusage „diese Funktion wirft nicht". Gemeldet wird der Verstoß beim Bauen.
 *
 * @param {{ bulk?: boolean, bulkKind?: string }} spec
 * @returns {'table'|'tree'}
 */
function bulkKindOf(spec) {
  const kind = spec.bulkKind ?? 'table';
  return BULK_KINDS.includes(kind) ? kind : 'table';
}

/**
 * Prüft `options.rows` als GANZES und liefert die Meldung, falls der Bereich
 * kaputt ist — sonst `null`.
 *
 * Zwei Fehlerklassen, und die zweite fehlte: eine Grenze, die keine Zahl ist
 * (`{ from: 100 }` ohne `to` → `Number(undefined)` ist `NaN`). Die erste
 * Fassung verlangte für die Abweisung, dass BEIDE Grenzen finit sind, und
 * fiel damit genau an diesem Rand durch: `clampIndex` machte aus dem
 * fehlenden `to` eine `0`, und heraus kam ein leeres Array mit
 * `$range: { from: 3, to: 0 }` — ein Umfang, den es nicht gibt. „Gib mir ab
 * Zeile 100" ist eine plausible Anfrage und muss als kaputter AUFRUF
 * beantwortet werden, nicht als Aussage über die Daten.
 *
 * `null` ist davon unberührt: `Number(null)` ist `0`, also ist
 * `{ from: null, to: 2 }` der wohlbestimmte Bereich [0, 2) und bleibt
 * gültig. In der Meldung steht dann beides — der geschriebene Wert und die
 * gelesene Zahl —, sonst stünde dort „greater than rows.to (null)".
 *
 * @param {{ from?: unknown, to?: unknown }} range
 * @returns {string|null}
 */
function rangeFault(range) {
  const from = Number(range.from);
  const to = Number(range.to);
  const bad = [
    ...(Number.isFinite(from) ? [] : ['rows.from']),
    ...(Number.isFinite(to) ? [] : ['rows.to']),
  ];
  if (bad.length > 0) {
    return `${bad.join(' and ')} must be a finite number`
      + ` (rows.from = ${String(range.from)}, rows.to = ${String(range.to)})`;
  }
  if (from > to) return `rows.from (${bound(range.from, from)}) is greater than rows.to (${bound(range.to, to)})`;
  return null;
}

/**
 * Eine Bereichsgrenze für die Meldung: die Zahl, und wo der geschriebene Wert
 * anders lautet, beides.
 * @param {unknown} raw
 * @param {number} n
 * @returns {string}
 */
function bound(raw, n) {
  return String(raw) === String(n) ? String(n) : `${String(raw)}, read as ${n}`;
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
 * Zweite Form: eine FLACHE Liste, deren Knoten alle `parentId` tragen und
 * keiner `children` (`ishikawa.rows`). Dort kommt die Tiefe aus der
 * Elternkette; sonst hieße jeder flache Baum `depth: 1`.
 *
 * Ein `WeakSet` der besuchten Knoten, nicht eine Tiefenschranke: ein Zyklus
 * (`children`, das auf den eigenen Knoten zurückzeigt) ergab
 * `RangeError: Maximum call stack size exceeded` — ein Wurf aus einer
 * Funktion, deren Aufrufer zusagt, dass sie nicht wirft. Ein reaktiver
 * Modulzustand mit Zyklus ist nicht abwegig; für genau diesen Fall hat
 * `clone` seine dritte Stufe. Das `WeakSet` erledigt zugleich die
 * Doppelzählung eines geteilten Knotens (DAG), die eine Schranke
 * stehengelassen hätte: gezählt werden KNOTEN, nicht Besuche.
 *
 * @param {any[]} nodes
 * @returns {{ nodeCount: number, depth: number }}
 */
function treeExtent(nodes) {
  if (isFlatTree(nodes)) return flatTreeExtent(nodes);
  let nodeCount = 0;
  let depth = 0;
  const seen = new WeakSet();
  const walk = (list, level) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      if (node && typeof node === 'object') {
        if (seen.has(node)) continue;      // schon gezählt: Zyklus oder geteilter Knoten
        seen.add(node);
        nodeCount += 1;
        depth = Math.max(depth, level);
        walk(node.children, level + 1);
        continue;
      }
      // Ein Nicht-Objekt in der Liste ist kein Knoten mit Kindern, zählt aber
      // als Eintrag — sonst wäre `nodeCount` kleiner als die Liste lang ist.
      nodeCount += 1;
      depth = Math.max(depth, level);
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

/**
 * Ein Auslassungspfad als Segmentliste, oder `null`, wenn er die Grammatik
 * verletzt. Segmente: ein Schlüssel oder `[]` (jedes Element eines Arrays);
 * `[]` hängt ohne Punkt an, ein Schlüssel nach `[]` mit Punkt
 * (`inScope[].dataUrl`, `[][].image`). Der Pfad endet mit einem Schlüssel —
 * ein `[]` am Ende meinte jedes Element und damit das ganze Feld.
 *
 * Dieselbe Grammatik prüft der Generator und MELDET Verstöße
 * (`invalid_omit_path:<feld>:<pfad>`, `tools/build/agent-data.mjs`); hier
 * wird ein kaputter Pfad nur übergangen, denn diese Funktion wirft nicht.
 *
 * @param {unknown} path
 * @returns {string[]|null}
 */
function omitTokens(path) {
  if (typeof path !== 'string' || !OMIT_PATH.test(path)) return null;
  const tokens = path.match(/\[\]|[A-Za-z_$][\w$]*/g);
  return tokens[tokens.length - 1] === '[]' ? null : tokens;
}

/** Ein Auslassungspfad als Ganzes; siehe `omitTokens`. */
const OMIT_PATH = /^(?:[A-Za-z_$][\w$]*|\[\])(?:\[\]|\.[A-Za-z_$][\w$]*)*$/;

/**
 * Ersetze in einem (bereits geklonten) Wert jeden Teilwert, den einer der
 * Pfade trifft, durch `{ $omitted: true, bytes }`. `null` und `undefined`
 * bleiben, damit „kein Bild“ von „Bild ausgelassen“ unterscheidbar bleibt.
 * Ein Pfad, der nicht zur Form der Daten passt, trifft nichts.
 *
 * @param {any} value  ein Klon — wird an Ort und Stelle verändert
 * @param {string[]|undefined} paths
 * @returns {any} derselbe Wert
 */
function omitPaths(value, paths) {
  if (!Array.isArray(paths) || paths.length === 0) return value;
  for (const path of paths) {
    const tokens = omitTokens(path);
    if (tokens) omitAt(value, tokens, 0);
  }
  return value;
}

/** Ein Schritt von `omitPaths`. */
function omitAt(node, tokens, i) {
  if (node === null || typeof node !== 'object') return;
  const token = tokens[i];
  if (token === '[]') {
    if (!Array.isArray(node)) return;
    for (const item of node) omitAt(item, tokens, i + 1);
    return;
  }
  if (Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, token)) return;
  if (i < tokens.length - 1) {
    omitAt(node[token], tokens, i + 1);
    return;
  }
  const hit = node[token];
  if (hit === null || hit === undefined) return;
  node[token] = { $omitted: true, bytes: jsonLength(hit) };
}

/** Länge der JSON-Serialisierung; 0, wo es keine gibt. */
function jsonLength(value) {
  try { return JSON.stringify(value)?.length ?? 0; } catch { return 0; }
}

/**
 * Eine flache Baumliste: nicht leer, jeder Knoten ein Objekt mit eigenem
 * `parentId` und ohne `children`-Array.
 * @param {any[]} nodes
 * @returns {boolean}
 */
function isFlatTree(nodes) {
  return Array.isArray(nodes) && nodes.length > 0 && nodes.every(n => n && typeof n === 'object'
    && !Array.isArray(n.children) && Object.prototype.hasOwnProperty.call(n, 'parentId'));
}

/**
 * Umfang einer flachen Baumliste: jeder Eintrag ein Knoten, Tiefe über die
 * Elternkette. Ein unbekannter Elternteil zählt als Wurzel; ein Kreis endet
 * am ersten schon besuchten Knoten.
 * @param {object[]} nodes
 * @returns {{ nodeCount: number, depth: number }}
 */
function flatTreeExtent(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parentOf = (n) => (n.parentId === null || n.parentId === undefined ? undefined : byId.get(n.parentId));
  let depth = 0;
  for (const node of nodes) {
    const seen = new Set([node]);
    let level = 1;
    let parent = parentOf(node);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      level += 1;
      parent = parentOf(parent);
    }
    depth = Math.max(depth, level);
  }
  return { nodeCount: nodes.length, depth };
}
