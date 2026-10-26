// Grenzprüfung: findet statisch erkennbare Pfade, die aus dem Repo hinausführen.
//
// Dieses Repo wird lokal häufig unter einem größeren Baum ausgecheckt. Ein
// Zugriff auf `../..` funktioniert dort zufällig und bricht in jedem
// eigenständigen Klon. Die Prüfung löst Pfade gegen die Datei auf, in der sie
// stehen, und meldet alles, was außerhalb der Wurzel landet.
//
// Erkannt werden:
//   - Import-Specifier (statisch, dynamisch, `export … from`)
//   - `new URL('…', import.meta.url)`
//   - `join`/`resolve` mit Literal-Segmenten auf einer bekannten Basis
//     (`__dirname`, `import.meta.dirname`, `dirname(fileURLToPath(import.meta.url))`,
//     `process.cwd()` und Variablen, die daraus per Literal-Segmenten entstehen)
//   - Shell: `$root/..`, `${ROOT}/..`, `$(dirname "$0")/../..`
//   - package.json, Workflows: `../…`-Pfade als Wörter
//   - HTML: `src`/`href` relativ
//   - Sperrmuster `../../(docs|tools|test|site-src|.claude|pipeline)/` im Code
// Kommentare zählen hier nicht — Verweise auf private Dokumente, auch in
// Kommentaren, findet `findPrivateReferences` (siehe unten).
//
// Grenzen: berechnete Pfade (Variablen-Segmente, String-Verkettung, Laufzeit-
// `fetch`) sieht die Prüfung nicht. Die fängt die eigenständige Probe im
// Begleit-Repo, die dieses Repo allein klont und alle Tests laufen lässt.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const JS_EXT = new Set(['.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * Art einer Datei für die Prüfung, oder `null`, wenn sie nicht geprüft wird.
 * @param {string} rel  Pfad relativ zur Wurzel, mit `/`
 * @returns {'js'|'sh'|'html'|'pkg'|'yml'|null}
 */
function kindOf(rel) {
  const ext = extname(rel);
  if (JS_EXT.has(ext)) return 'js';
  if (ext === '.sh') return 'sh';
  if (ext === '.html') return 'html';
  if (rel === 'package.json' || rel.endsWith('/package.json')) return 'pkg';
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel)) return 'yml';
  // Hooks ohne Endung: Shell-Skripte in einem Hook-Verzeichnis.
  if (!ext && /(^|\/)(git-)?hooks\//.test(rel)) return 'sh';
  return null;
}

/**
 * Alle getrackten Dateien, relativ zur Wurzel. Bevorzugt `git ls-files`, sonst
 * ein Dateisystem-Lauf ohne `node_modules`. Nur Dateien, die es noch gibt.
 * @param {string} root
 * @returns {string[]}
 */
function listFiles(root) {
  let files;
  try {
    if (!existsSync(join(root, '.git'))) throw new Error('kein git');
    files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0').filter(Boolean);
  } catch {
    files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else files.push(relative(root, full).split(sep).join('/'));
      }
    };
    walk(root);
  }
  return files.filter((f) => existsSync(join(root, f)));
}

/**
 * Alle zu prüfenden Code-Dateien, relativ zur Wurzel.
 * @param {string} root
 * @returns {string[]}
 */
export function listCodeFiles(root) {
  return listFiles(root).filter((f) => kindOf(f) !== null);
}

/**
 * Alle getrackten Textdateien, relativ zur Wurzel. Ohne Binärdateien (NUL-Byte
 * am Anfang) und ohne erzeugte Dateien (`*.generated.*`, `*.min.*`) — die
 * entstehen aus Quellen, die selbst geprüft werden.
 * @param {string} root
 * @returns {string[]}
 */
export function listTextFiles(root) {
  return listFiles(root).filter((f) => {
    if (/\.(generated|min)\./.test(f)) return false;
    const head = readFileSync(join(root, f)).subarray(0, 8000);
    return !head.includes(0);
  });
}

/**
 * Ersetzt JS-Kommentare durch Leerzeichen (Zeilenumbrüche bleiben, damit
 * Offsets und Zeilennummern stimmen). Strings und Template-Literale bleiben.
 * Regex-Literale werden heuristisch erkannt.
 * @param {string} src
 */
export function stripJsComments(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  let prev = ''; // letztes signifikantes Zeichen außerhalb von Kommentaren
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c !== '`' && src[j] === '\n') break;
        j++;
      }
      i = j + 1;
      prev = c;
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
      // Regex-Literal: bis zum unmaskierten `/` außerhalb einer Zeichenklasse.
      let j = i + 1;
      let cls = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      i = j + 1;
      prev = '/';
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join('');
}

/** Ersetzt Zeilen, die mit `#` beginnen (außer Shebang), durch Leerzeichen. */
function stripHashComments(src) {
  return src.replace(/^([ \t]*#(?!!).*)$/gm, (m) => ' '.repeat(m.length));
}

/** Ersetzt `<!-- … -->` durch Leerzeichen. */
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Zeilennummer (1-basiert) zu einem Offset. */
function lineAt(src, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (src.charCodeAt(k) === 10) line++;
  return line;
}

/** Teilt eine Argumentliste an Kommas der obersten Ebene. */
function splitArgs(s) {
  const args = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; }
      cur += s.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur);
  return args.map((a) => a.trim());
}

/** Inhalt der Klammer, die bei `open` (Index der `(`) beginnt, oder `null`. */
function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      i = j;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

const LITERAL = /^(['"`])([^'"`$\\]*)\1$/;

/**
 * Wertet einen Pfad-Ausdruck aus, soweit er statisch ist.
 * @returns {{abs?: string, lit?: string, partial?: boolean}|null}
 */
function evalExpr(expr, ctx) {
  const e = expr.trim().replace(/\s+/g, ' ');
  const lit = LITERAL.exec(e);
  if (lit) return { lit: lit[2] };
  if (e === '__dirname' || e === 'import.meta.dirname') return { abs: ctx.dir };
  if (e === 'process.cwd()') return { abs: ctx.root };
  if (/^(?:path\.)?dirname\( ?(?:url\.)?fileURLToPath\( ?import\.meta\.url ?\) ?\)$/.test(e)) {
    return { abs: ctx.dir };
  }
  const url = /^(?:(?:url\.)?fileURLToPath\( ?)?new URL\( ?(['"`])([^'"`$]*)\1 ?, ?import\.meta\.url ?\)(?: ?\)|\.pathname)?$/.exec(e);
  if (url) return { abs: resolve(ctx.dir, url[2]) };
  if (/^[A-Za-z_$][\w$]*$/.test(e) && ctx.env.has(e)) return { abs: ctx.env.get(e) };
  const call = /^(?:path\.)?(join|resolve|dirname)\(/.exec(e);
  if (call) {
    const inner = balanced(e, call[0].length - 1);
    if (inner === null || call[0].length + inner.length + 1 !== e.length) return null;
    return evalCall(call[1], splitArgs(inner), ctx);
  }
  return null;
}

/** Wertet `join`/`resolve`/`dirname` mit statischen Argumenten aus. */
function evalCall(fn, args, ctx) {
  if (!args.length) return null;
  const first = evalExpr(args[0], ctx);
  if (!first || !first.abs) return null;
  if (fn === 'dirname') return args.length === 1 ? { abs: dirname(first.abs) } : null;
  let abs = first.abs;
  for (let k = 1; k < args.length; k++) {
    const v = evalExpr(args[k], ctx);
    if (!v || v.lit === undefined) return { abs, partial: true };
    abs = fn === 'resolve' ? resolve(abs, v.lit) : join(abs, v.lit);
  }
  return { abs };
}

/** Liegt `abs` außerhalb von `root`? */
function outside(root, abs) {
  const rel = relative(root, abs);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

const IMPORT_RES = [
  /\bfrom\s*(['"])([^'"\n]+)\1/g,
  /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1/g,
  /\bimport\s+(['"])([^'"\n]+)\1/g,
];
const BANNED = /((?:\.\.\/){2,})(docs|tools|test|site-src|\.claude|pipeline)\//g;
const PATH_WORD = /(?:^|[\s"'=(:])((?:\.\.\/)+[^\s"'&|;)`]*)/g;

/** Relativer Specifier (`./`, `../`) ohne Query/Hash, sonst `null`. */
function relSpec(s) {
  if (!/^\.\.?\//.test(s)) return null;
  return s.replace(/[?#].*$/, '');
}

function checkImports(code, ctx, report) {
  for (const re of IMPORT_RES) {
    for (const m of code.matchAll(re)) {
      const spec = relSpec(m[2]);
      if (spec) report(m.index, 'import', resolve(ctx.dir, spec));
    }
  }
}

function checkBanned(code, ctx, report) {
  for (const m of code.matchAll(BANNED)) {
    report(m.index, 'Sperrmuster', resolve(ctx.dir, m[1] + m[2]));
  }
}

function checkJs(code, ctx, report) {
  checkImports(code, ctx, report);
  for (const m of code.matchAll(/new\s+URL\(\s*(['"`])([^'"`$\n]*)\1\s*,\s*import\.meta\.url/g)) {
    report(m.index, 'new URL', resolve(ctx.dir, m[2]));
  }
  // Wurzelvariablen in Quelltext-Reihenfolge einsammeln.
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const start = m.index + m[0].length;
    let end = start;
    let depth = 0;
    while (end < code.length) {
      const c = code[end];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      if (depth < 0 || (depth === 0 && (c === ';' || c === '\n' || c === ','))) break;
      end++;
    }
    const v = evalExpr(code.slice(start, end), ctx);
    if (v && v.abs && !v.partial) ctx.env.set(m[1], v.abs);
  }
  for (const m of code.matchAll(/(?<![\w.$])(?:path\.)?(join|resolve)\s*\(/g)) {
    const inner = balanced(code, m.index + m[0].length - 1);
    if (inner === null) continue;
    const v = evalCall(m[1], splitArgs(inner), ctx);
    if (v && v.abs) report(m.index, m[1], v.abs);
  }
  checkBanned(code, ctx, report);
}

function checkShell(code, ctx, report) {
  const vars = new Map();
  const dirOf = /\$\(\s*dirname\s+"?\$(?:0|\{BASH_SOURCE\[0\]\}|\{0\})"?\s*\)((?:\/[^\s"'$;)&|]*)?)/;
  for (const m of code.matchAll(/^\s*(?:local\s+|export\s+)?([A-Za-z_]\w*)=(.*)$/gm)) {
    if (/git\s+rev-parse\s+--show-toplevel/.test(m[2])) vars.set(m[1], ctx.root);
    else {
      const d = dirOf.exec(m[2]);
      if (d) vars.set(m[1], resolve(ctx.dir, `.${d[1] || ''}`));
    }
  }
  for (const m of code.matchAll(/\$\{?([A-Za-z_]\w*)\}?((?:\/[^\s"'$;)&|`]*)+)/g)) {
    let base = vars.get(m[1]);
    if (base === undefined && /root$/i.test(m[1])) base = ctx.root;
    if (base === undefined) continue;
    report(m.index, `$${m[1]}`, resolve(base, `.${m[2]}`));
  }
  for (const m of code.matchAll(new RegExp(dirOf.source, 'g'))) {
    report(m.index, '$(dirname …)', resolve(ctx.dir, `.${m[1] || ''}`));
  }
  checkBanned(code, ctx, report);
}

function checkPathWords(code, base, ctx, report, reason) {
  for (const m of code.matchAll(PATH_WORD)) {
    report(m.index + m[0].indexOf(m[1]), reason, resolve(base, m[1]));
  }
}

function checkHtml(code, ctx, report) {
  for (const m of code.matchAll(/\b(?:src|href)\s*=\s*(["'])([^"']*)\1/g)) {
    const spec = relSpec(m[2]);
    if (spec) report(m.index, m[0].split('=')[0].trim(), resolve(ctx.dir, spec));
  }
  checkImports(code, ctx, report);
  checkBanned(code, ctx, report);
}

/**
 * @typedef {object} Violation
 * @property {string} file    Pfad relativ zur Wurzel
 * @property {number} line    1-basiert
 * @property {string} reason  Art des Zugriffs
 * @property {string} target  aufgelöstes Ziel, relativ zur Wurzel
 */

/**
 * Prüft die Dateien unter `root` auf Pfade, die hinausführen.
 * @param {string} root
 * @param {{files?: string[]}} [opts]  Pfade relativ zu `root`; Vorgabe `listCodeFiles(root)`
 * @returns {Violation[]}
 */
export function findBoundaryViolations(root, { files = listCodeFiles(root) } = {}) {
  const absRoot = resolve(root);
  /** @type {Violation[]} */
  const found = [];
  for (const file of files) {
    const kind = kindOf(file);
    if (!kind) continue;
    const src = readFileSync(join(absRoot, file), 'utf8');
    const ctx = { root: absRoot, dir: dirname(join(absRoot, file)), env: new Map() };
    const seen = new Set();
    let code = src;
    const report = (index, reason, abs) => {
      if (!outside(absRoot, abs)) return;
      const line = lineAt(code, index);
      if (seen.has(line)) return;
      seen.add(line);
      found.push({ file, line, reason, target: relative(absRoot, abs).split(sep).join('/') });
    };
    if (kind === 'js') { code = stripJsComments(src); checkJs(code, ctx, report); }
    else if (kind === 'sh') { code = stripHashComments(src); checkShell(code, ctx, report); }
    else if (kind === 'yml') {
      code = stripHashComments(src);
      checkPathWords(code, absRoot, ctx, report, 'Pfad');
      checkBanned(code, ctx, report);
    } else if (kind === 'pkg') {
      checkPathWords(code, ctx.dir, ctx, report, 'Pfad');
    } else { code = stripHtmlComments(src); checkHtml(code, ctx, report); }
  }
  return found;
}

// ── Verweise auf private Dokumente ─────────────────────────────────────────
//
// Dieses Repo ist öffentlich. Specs, Pläne, Roadmap, Bugliste, die E2E-Tests
// und die Site-Quellen liegen im privaten Begleit-Repo; ein Verweis darauf ist
// für Leser hier wertlos. Geprüft wird jede Zeile jeder Textdatei, Kommentare
// und Markdown eingeschlossen. Diese Datei und ihr Test nennen die Muster
// zwangsläufig selbst und werden vom Aufrufer ausgenommen.

/** Feste Muster: Anzeigename → Regex. */
const PRIVATE_PATTERNS = [
  ['docs/superpowers', /docs\/superpowers/g],
  ['.claude/', /(?<![\w-])\.claude\//g],
  ['ROADMAP.md', /(?<![\w-])ROADMAP\.md/g],
  ['ROADMAP_DONE.md', /(?<![\w-])ROADMAP_DONE\.md/g],
  ['BUGS.md', /(?<![\w-])BUGS\.md/g],
  ['BUGS_DONE.md', /(?<![\w-])BUGS_DONE\.md/g],
  ['test/playwright', /(?<![\w.-])test\/playwright/g],
  ['site-src', /(?<![\w-])site-src(?![\w-])/g],
  // Abschnittsmarken auf Specs ohne Pfad: `spec §7.2`, `(spec E3)`,
  // `spec decision 2`, `spec 2026-10-25 E3`, `spec "Naht"`, `(spec)`,
  // `(spec:`, `siehe Modul-Spec`, `Spec-Review`. Code mit einer Variablen
  // `spec` (`fn(spec)`, `if (spec)`, `(spec) =>`) bleibt außen vor.
  ['Spec-Marke', new RegExp([
    /\b[Ss]pec\b(?:[\s-]*(?:§|E\d|\d{4}-\d{2}-\d{2})|\s+(?:(?:[Dd]ecision|[Aa]ddendum|[Ss]ection|[Aa]bschnitt)\b|["„“]))/.source,
    /(?<![\w$.(]|(?:if|while|switch|for|return) )\([Ss]pec\)(?!\s*=>)(?=[:.,]?\s|[:.,]?$)/.source,
    /\([Ss]pec:\s/.source,
    /\([Ss]pec\s*$/.source,
    /\b(?:[Ss]ee|[Ss]iehe)\s+(?:the\s+|die\s+|der\s+)?(?:[Mm]odule\s+|[Mm]odul-|[Dd]esign-)?[Ss]pec\b/.source,
    /\b[Ss]pec-[Rr]eview\b/.source,
  ].join('|'), 'g')],
  // Entscheidungsmarken aus Specs und Plänen: `(E3)`, `(Plan E2, E7)`,
  // `Welle-2-E5`. Im Bestand hat `E<Zahl>` als ganzes Wort keine andere
  // Bedeutung; `1E5`, `#E1E1E1`, `\u00E4` und `E12a` sind keine Wörter.
  ['Entscheidungsmarke', /\bE\d{1,2}\b/g],
  // Das private Begleit-Repo, auch als Site-Repo.
  ['privates Repo', /\b[Pp]rivat(?:e[nmrs]?)?[\s-]+(?:Site-)?[Rr]epos?\b|\b[Ss]ite[- ][Rr]epos?\b/g],
];

/** `docs/<NAME>.md` — privat, sofern die Datei hier nicht existiert. */
const DOCS_MD = /(?<![\w.-])docs\/([\w-]+)\.md/g;

/** Erlaubte `.gitignore`-Zeilen, die ein privates Muster enthalten. */
const GITIGNORE_OK = new Set(['/.claude/', '.claude/']);

/**
 * @typedef {object} PrivateReference
 * @property {string} file     Pfad relativ zur Wurzel
 * @property {number} line     1-basiert
 * @property {string} pattern  gefundenes Muster, z. B. `docs/superpowers`
 */

/**
 * Sucht in den Dateien unter `root` nach Verweisen auf private Dokumente.
 * @param {string} root
 * @param {{files?: string[]}} [opts]  Pfade relativ zu `root`; Vorgabe `listTextFiles(root)`
 * @returns {PrivateReference[]}
 */
export function findPrivateReferences(root, { files = listTextFiles(root) } = {}) {
  const absRoot = resolve(root);
  /** @type {PrivateReference[]} */
  const found = [];
  for (const file of files) {
    const isGitignore = file === '.gitignore' || file.endsWith('/.gitignore');
    const lines = readFileSync(join(absRoot, file), 'utf8').split('\n');
    lines.forEach((text, k) => {
      if (isGitignore && GITIGNORE_OK.has(text.trim())) return;
      const hits = [];
      for (const [name, re] of PRIVATE_PATTERNS) {
        re.lastIndex = 0;
        if (re.test(text)) hits.push(name);
      }
      for (const m of text.matchAll(DOCS_MD)) {
        const name = `docs/${m[1]}.md`;
        if (!existsSync(join(absRoot, name)) && !hits.includes(name)) hits.push(name);
      }
      for (const pattern of hits) found.push({ file, line: k + 1, pattern });
    });
  }
  return found;
}
