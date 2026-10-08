/**
 * Videos Registry (videos-registry.js)
 *
 * Liest den Videospiegel `videos/index.json` — eine erzeugte, committete
 * Datendatei wie `examples/index.json`, deshalb zur Laufzeit geholt und nicht
 * gebündelt.
 *
 * Einzige Quelle für den Videos-Tab des Hilfe-Panels. Ein fehlender oder
 * kaputter Spiegel ist **nicht fatal**: die Registry bleibt leer und der Tab
 * erscheint nicht.
 *
 * Die Felder eines Eintrags: `type` (`module`, `topic` oder `example`), `id`,
 * die Zuordnungen `modules`/`glossary`/`examples`, `tags`, `title` (`{de,en}`),
 * `entry` (`query` + `labelKey` für den Direkteinstieg), `video` und
 * `captions` (docroot-relative URLs je Sprache), `sec` (Laufzeit je Sprache)
 * sowie `chapters` (je Kapitel `id`, `sec` je Sprache, `title`, `modules`,
 * `tags`). Eine Sprache, die es nicht gibt, **fehlt** in `video`, `captions`,
 * `sec` und in jedem `chapters[].sec` — geprüft wird auf Anwesenheit, nie auf
 * `null`.
 */

const CATALOG_URL = './videos/index.json';

/**
 * Die Einträge aus dem Dateiinhalt — die Datei ist eine Objekthülle, deren
 * erster Schlüssel der Hinweis gegen Handbearbeitung ist.
 *
 * Fail-closed: ein nacktes Array ist die **alte** Form und wird abgelehnt,
 * nicht zusätzlich akzeptiert. Beide Formen zu lesen hieße, den alten Pfad für
 * immer offen zu halten — und eine Datei, die niemand mehr erzeugt, fiele erst
 * auf, wenn ein Video fehlt.
 *
 * @param {unknown} data @returns {object[]}
 */
export function parseMirror(data) {
  if (Array.isArray(data)) {
    throw new Error('videos/index.json is in the old array form — expected { "_comment": …, "videos": [ … ] }');
  }
  if (!Array.isArray(data?.videos)) {
    throw new Error('videos/index.json has no "videos" array');
  }
  return data.videos;
}

/**
 * Videos, die ein Modul betreffen — über `modules` oder über ein Kapitel, das
 * das Modul nennt. Ein Video über ein anderes Modul, in dem dieses Modul
 * vorkommt, gehört in dessen Panel.
 * @param {object[]} entries @param {string} moduleId @returns {object[]}
 */
export function selectForModule(entries, moduleId) {
  if (!moduleId) return [];
  return entries.filter(v =>
    v.modules?.includes(moduleId)
    || v.chapters?.some(c => c.modules?.includes(moduleId)));
}

/**
 * Das Kapitel, über das ein Video auf die Seite eines Moduls kommt — `null`,
 * wenn das Video als Ganzes dieses Modul behandelt.
 *
 * Trennt die beiden Gründe, aus denen `selectForModule` ein Video liefert:
 * nennt das Video das Modul selbst, ist es an dieser Stelle von Anfang an
 * richtig. Kommt es nur über ein Kapitel herein, gehört der Einstieg an
 * dieses Kapitel — sonst landet der Nutzer am Anfang eines Videos über ein
 * anderes Modul und sucht die Stelle von Hand.
 *
 * @param {object} video @param {string} moduleId @returns {?object}
 */
export function chapterForModule(video, moduleId) {
  if (!moduleId || video.modules?.includes(moduleId)) return null;
  return video.chapters?.find(c => c.modules?.includes(moduleId)) ?? null;
}

/** @param {object[]} entries @param {string} termId @returns {object[]} */
export function selectForTerm(entries, termId) {
  if (!termId) return [];
  return entries.filter(v => v.glossary?.includes(termId));
}

/** @param {object[]} entries @param {string} exampleId @returns {object[]} */
export function selectForExample(entries, exampleId) {
  if (!exampleId) return [];
  return entries.filter(v => v.examples?.includes(exampleId));
}

export class VideosRegistry {
  constructor() {
    /** @type {object[]} */
    this._entries = [];
    this._initialized = false;
  }

  /**
   * @param {{ __fetch?: typeof fetch }} [opts] `__fetch` ist die Naht für Tests
   * @returns {Promise<void>}
   */
  async init({ __fetch = fetch } = {}) {
    try {
      const res = await __fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._entries = parseMirror(await res.json());
    } catch (err) {
      console.warn('[VideosRegistry] Could not load the mirror:', err.message);
      this._entries = [];
    }
    this._initialized = true;
  }

  isInitialized() { return this._initialized; }
  getAll() { return this._entries.slice(); }
  getForModule(moduleId) { return selectForModule(this._entries, moduleId); }
  getForTerm(termId) { return selectForTerm(this._entries, termId); }
  getForExample(exampleId) { return selectForExample(this._entries, exampleId); }
}
