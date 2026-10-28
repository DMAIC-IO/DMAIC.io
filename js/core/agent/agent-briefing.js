/**
 * D.Mike — Das Briefing als Klartext (agent-briefing.js)
 *
 * Flacht den Agententext `agent-briefing-text.js` für EINE Sprache
 * zu Klartext ab, damit `interact()` es als `briefing` mitgeben kann.
 *
 * Klartext und nicht Markdown: ein Agent liest den Text, er rendert ihn
 * nicht. `**fett**` und `{{term:id|Beschriftung}}` sind Anweisungen an den
 * Renderer des Hilfesystems; durchgereicht wären sie Rauschen im
 * Kontextfenster.
 *
 * Rein: kein DOM, kein `window`. Darum läuft dieselbe Abflachung unverändert
 * in der Node-Bauwerkzeugkette und im Browser.
 */

/** `{{term:id|Beschriftung}}` → `Beschriftung`, `{{term:id}}` → `id`. */
const TERM_RE = /\{\{term:([^|}]+)(?:\|([^}]*))?\}\}/g;

/** Dasselbe für eine Quellenangabe `{{ref:id|Beschriftung}}`. */
const REF_RE = /\{\{ref:([^|}]+)(?:\|([^}]*))?\}\}/g;

/**
 * Ein Inline-Text ohne Renderer-Anweisungen.
 * @param {any} value
 * @returns {string}
 */
function plain(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(TERM_RE, (_, id, label) => (label ?? id))
    .replace(REF_RE, (_, id, label) => (label ?? id))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S[^*]*?)\*/g, '$1$2');
}

/**
 * Steht in der Zeile außer der Auszeichnung (`- `, `: `, ` | `) etwas?
 *
 * `Boolean` allein genügt nicht: ein nicht-textliches `content` ergibt in
 * `list` die Zeile `'- '` und in `definition` `': '` — beide sind wahr und
 * beide sagen nichts.
 * @param {string} line
 * @returns {boolean}
 */
function hasText(line) {
  return !/^[-:|\s]*$/.test(line);
}

/**
 * Ein Block als eine oder mehrere Klartextzeilen.
 * @param {object} block  ein Handbuchblock (`paragraph`, `heading`, `list`,
 *   `definition`, `table` — jedes andere `type` wie im Renderer über
 *   `content`)
 * @returns {string[]}
 */
function blockLines(block) {
  if (!block) return [];
  switch (block.type) {
    case 'heading':
      return [plain(block.content)];
    case 'list':
      return (block.items || []).map(item => `- ${plain(item)}`);
    case 'definition':
      return [`${plain(block.term)}: ${plain(block.content)}`];
    case 'table': {
      const rows = block.rows || [];
      if (rows.length === 0) return [];
      const head = (block.headers || []).map(plain).join(' | ');
      const body = rows.map(row => (row || []).map(plain).join(' | '));
      return head ? [head, ...body] : body;
    }
    // Jedes andere `type` wie im Renderer über `content`. Keine
    // Wahrheitsprüfung hier: leere Zeilen siebt `flattenBriefing` zentral
    // aus, für alle Zweige gleich.
    default:
      return [plain(block.content)];
  }
}

/**
 * Das Briefing für eine Sprache.
 *
 * Abschnittsreihenfolge ist die der Quelle (`Object.values`), weil sie dort
 * eine Aussage ist: Rolle zuerst, Grenzen zuletzt. Sprachwahl wie im
 * Hilfesystem (`help-renderer.js`, `renderModuleHelp`): aktive Sprache, dann
 * Englisch, dann Deutsch — und zwar je Abschnitt, damit ein noch nicht
 * übersetzter Abschnitt nicht das ganze Kapitel umkippt.
 *
 * @param {{ sections?: Record<string, object> }|null} helpDef
 * @param {string} lang
 * @returns {string} Klartext, Abschnitte durch Leerzeilen getrennt
 */
export function flattenBriefing(helpDef, lang) {
  const sections = helpDef?.sections;
  if (!sections || typeof sections !== 'object') return '';

  const parts = [];
  for (const section of Object.values(sections)) {
    const localized = section?.[lang] || section?.en || section?.de;
    if (!localized) continue;
    const lines = [];
    if (localized.title) lines.push(plain(localized.title));
    // `Array.isArray` und nicht `|| []`: ein fehlgeformtes `blocks` (ein
    // Objekt, eine Zeichenkette) ist nicht iterierbar und warf hier. Die
    // Funktion gibt sich sonst konsequent total — `null`/`{}` → `''`.
    const blocks = Array.isArray(localized.blocks) ? localized.blocks : [];
    // ZENTRAL gesiebt und nicht je Zweig: ein nicht-textliches `content`
    // ergibt sonst `''` (heading), `'- '` (list) oder `': '` (definition) —
    // dieselbe Leerzeile, nur verschieden verkleidet.
    for (const block of blocks) lines.push(...blockLines(block).filter(hasText));
    if (lines.length > 0) parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}
