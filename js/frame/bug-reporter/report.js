/**
 * D.Mike — Bug report composition (frame/bug-reporter/report.js)
 * Pure functions: folder name, app context, report.md and the file list the
 * transport sends. No DOM, no network — the PHP receiver only writes what
 * this module produced (spec decision 4).
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
 * @param {{date: Date, description: string, context: object, errors: object[],
 *          notes: string[], screenshot?: Blob|null, annotations?: object|null,
 *          project?: string|null}} input
 * @returns {{folder: string, description: string, context: object, errors: object[],
 *            notes: string[], annotations: object|null, attachments: string[],
 *            files: Array<{name: string, type: string, data: string|Blob}>}}
 */
export function buildReport(input) {
  const { date, description = '', context, errors, notes } = input;
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
    folder: report.folder, description, context, errors, notes, annotations,
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

function describeItem(item) {
  if (item.type === 'arrow') return `(${item.x1}, ${item.y1}) → (${item.x2}, ${item.y2})`;
  if (item.type === 'line') return `${item.points.length} Punkte`;
  return `(${item.x}, ${item.y}, ${item.w}×${item.h})`;
}

/**
 * Human-readable report (spec §report.md).
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
      out.push(`${i + 1}. \`${e.at.slice(0, 19)}\` **${e.kind}** — \`${e.message}\``);
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
