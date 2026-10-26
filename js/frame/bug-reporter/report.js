/**
 * D.Mike — Bug report composition (frame/bug-reporter/report.js)
 * Pure functions: folder name, app context, report.md and the file list the
 * transport sends. No DOM, no network — the PHP receiver only writes what
 * this module produced.
 */

const TRANSLIT = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const SLUG_MAX = 40;

const CONTEXT_LABELS = [
  ['appVersion', 'App-Version'], ['route', 'Route'], ['cycle', 'Zyklus'],
  ['phase', 'Phase'], ['moduleId', 'Modul'], ['instanceId', 'Instanz'],
  ['theme', 'Theme'], ['language', 'Sprache'], ['viewport', 'Viewport'],
  ['userAgent', 'User-Agent'], ['capturedAt', 'Erfasst'],
];

/**
 * Folder-safe slug from free text.
 * @param {string} text
 * @returns {string} `a-z0-9-`, ≤ 40 chars, `ohne-text` when nothing remains
 */
export function slugify(text) {
  const base = String(text ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, c => TRANSLIT[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = base.slice(0, SLUG_MAX).replace(/-+$/, '');
  return cut || 'ohne-text';
}

const pad = n => String(n).padStart(2, '0');

/** @param {Date} date @returns {string} `YYYY-MM-DDTHHMMSS` in local time */
function stamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * @param {Date} date
 * @param {string} description
 * @returns {string} `<YYYY-MM-DD>T<HHMMSS>-<slug>`
 */
export function folderName(date, description) {
  return `${stamp(date)}-${slugify(description)}`;
}

// A stack line that is a frame, not message text: V8 `    at …`, Firefox `fn@url:line:col`.
const FRAME = /^\s+at\s|^\S*@\S+:\d+:\d+$/;

/**
 * Strip everything a user could have put into error entries: the message goes, of the stack only frame lines stay.
 * @param {object[]} entries error-log entries
 * @returns {Array<{at: string, kind: string, name: string|null, stack: string|null}>}
 */
export function redactErrors(entries) {
  return entries.map(e => {
    const frames = String(e.stack ?? '').split('\n').filter(l => FRAME.test(l));
    return { at: e.at, kind: e.kind, name: e.name ?? null, stack: frames.join('\n') || null };
  });
}

function safe(fn) {
  try { return fn() ?? null; } catch { return null; }
}

/**
 * Collect the app context that always travels with a report.
 * @param {object} services { version, moduleRegistry, workspace, dmaicTiles, themeManager, i18n }
 * @param {object} env { location, innerWidth, innerHeight, navigator, now }
 * @returns {object} context; unknown fields are null
 */
export function collectContext(services, env) {
  const info = safe(() => services.workspace.getActiveModuleInfo());
  const w = env.innerWidth, hgt = env.innerHeight;
  return {
    appVersion: services.version ?? null,
    route: safe(() => env.location.hash),
    cycle: safe(() => services.moduleRegistry.getActiveCycle()),
    phase: safe(() => services.dmaicTiles.getActivePhase()),
    moduleId: info?.moduleId ?? null,
    instanceId: info?.instanceId ?? null,
    theme: safe(() => services.themeManager.getTheme()),
    language: safe(() => services.i18n.getLanguage()),
    viewport: Number.isFinite(w) && Number.isFinite(hgt) ? `${w}×${hgt}` : null,
    userAgent: safe(() => env.navigator.userAgent),
    capturedAt: (env.now ?? new Date()).toISOString(),
  };
}

/**
 * Assemble a report and the files to send.
 * Errors are redacted unless `fullErrors` is true.
 * @param {{date: Date, description: string, context: object, errors: object[],
 *          fullErrors?: boolean, notes: string[], screenshot?: Blob|null,
 *          annotations?: object|null, project?: string|null}} input
 * @returns {{folder: string, description: string, context: object, errors: object[],
 *            notes: string[], annotations: object|null, attachments: string[],
 *            files: Array<{name: string, type: string, data: string|Blob}>}}
 */
export function buildReport(input) {
  const { date, description = '', context, notes } = input;
  const errorsRedacted = input.fullErrors !== true;
  const errors = errorsRedacted ? redactErrors(input.errors) : input.errors;
  const screenshot = input.screenshot ?? null;
  const annotations = screenshot && input.annotations?.items?.length ? input.annotations : null;
  const project = input.project ?? null;

  const report = {
    folder: folderName(date, description),
    description,
    context,
    errors,
    notes,
    annotations,
    attachments: [],
    files: [],
  };
  const extras = [];
  if (screenshot) extras.push({ name: 'screenshot.png', type: 'image/png', data: screenshot });
  if (annotations) extras.push({ name: 'annotations.json', type: 'application/json', data: JSON.stringify(annotations, null, 2) });
  if (project) extras.push({ name: 'project.json', type: 'application/json', data: project });
  report.attachments = extras.map(f => f.name);

  const json = JSON.stringify({
    folder: report.folder, description, context, errors, errorsRedacted, notes, annotations,
    attachments: report.attachments,
  }, null, 2);
  report.files = [
    { name: 'report.md', type: 'text/markdown', data: reportMarkdown(report) },
    { name: 'report.json', type: 'application/json', data: json },
    ...extras,
  ];
  return report;
}

const cell = v => String(v ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Inline code span on one line: whitespace collapsed, backtick fence longer
 * than any backtick run inside (CommonMark).
 * @param {string} text
 * @returns {string}
 */
function codeSpan(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  const longest = Math.max(0, ...(flat.match(/`+/g) || []).map(r => r.length));
  const fence = '`'.repeat(longest + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

function describeItem(item) {
  if (item.type === 'arrow') return `(${item.x1}, ${item.y1}) → (${item.x2}, ${item.y2})`;
  if (item.type === 'line') return `${item.points.length} Punkte`;
  return `(${item.x}, ${item.y}, ${item.w}×${item.h})`;
}

/**
 * Human-readable report.
 * @param {{folder: string, description: string, context: object, errors: object[],
 *          notes: string[], annotations: object|null, attachments?: string[]}} report
 * @returns {string}
 */
export function reportMarkdown(report) {
  const out = [`# Bug-Report ${report.folder.slice(0, 17)}`, '', '## Beschreibung', '',
    report.description.trim() || '_(keine Beschreibung)_', '', '## Kontext', '',
    '| Feld | Wert |', '|---|---|'];
  for (const [key, label] of CONTEXT_LABELS) {
    if (key in report.context) out.push(`| ${label} | ${cell(report.context[key])} |`);
  }
  out.push('');

  if (report.notes.length) {
    out.push('## Hinweise', '', ...report.notes.map(n => `- ${n}`), '');
  }

  if (report.errors.length) {
    out.push(`## Fehler (letzte ${report.errors.length})`, '');
    report.errors.forEach((e, i) => {
      const detail = 'message' in e ? ` — ${codeSpan(e.message)}` : e.name ? ` — ${e.name}` : '';
      out.push(`${i + 1}. \`${e.at.slice(0, 19)}\` **${e.kind}**${detail}`);
      if (e.stack) out.push('', '   ```', ...e.stack.split('\n').map(l => `   ${l}`), '   ```');
    });
    out.push('');
  }

  const items = report.annotations?.items ?? [];
  if (items.length) {
    out.push('## Annotationen', '');
    items.forEach((it, i) => {
      const text = it.type === 'textbox' && it.text ? ` — „${it.text}“` : '';
      out.push(`${i + 1}. **${it.type}** ${describeItem(it)}${text}`);
    });
    out.push('');
  }

  const attachments = report.attachments ?? [];
  if (attachments.length) {
    out.push('## Dateien', '', ...attachments.map(n => `- \`${n}\``), '');
  }
  return out.join('\n');
}
