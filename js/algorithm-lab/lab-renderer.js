/**
 * Algorithm Lab — Renderer Utilities
 * KaTeX formula rendering, Prism.js code highlighting, timeline rendering.
 */

let _katexLoaded = false;
let _prismLoaded = false;

/**
 * Ensure KaTeX CSS + JS is loaded.
 */
async function ensureKaTeX() {
  if (_katexLoaded) return;
  // CSS
  if (!document.querySelector('link[href*="katex"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'vendor/katex/katex.min.css';
    document.head.append(link);
  }
  // JS
  if (!window.katex) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/katex/katex.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  _katexLoaded = true;
}

/**
 * Ensure Prism.js CSS + JS is loaded.
 */
async function ensurePrism() {
  if (_prismLoaded) return;
  // CSS — use light theme by default, dark theme handled via variables
  const theme = document.documentElement.dataset.theme === 'dark'
    ? 'vendor/prism/prism-tomorrow.css'
    : 'vendor/prism/prism.css';
  if (!document.querySelector('link[href*="prism"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme;
    link.id = 'prism-theme';
    document.head.append(link);
  }
  // JS
  if (!window.Prism) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/prism/prism.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
    // Load JS language component
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/prism/prism-javascript.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }
  _prismLoaded = true;
}

/**
 * Render LaTeX formulas into a container.
 * @param {Array<{label: string, latex: string, description?: string|object}>} formulas
 * @param {HTMLElement} container
 * @param {function} [loc] - Localization function for bilingual values
 */
export async function renderFormulas(formulas, container, loc) {
  if (!loc) loc = (v) => (typeof v === 'string' ? v : '');
  await ensureKaTeX();
  container.innerHTML = '';
  for (const f of formulas) {
    const div = document.createElement('div');
    div.className = 'lab__formula';

    const label = document.createElement('div');
    label.className = 'lab__formula-label';
    label.textContent = f.label;
    div.append(label);

    const math = document.createElement('div');
    try {
      window.katex.render(f.latex, math, { throwOnError: false, displayMode: true });
    } catch {
      math.textContent = f.latex;
    }
    div.append(math);

    const descText = loc(f.description);
    if (descText) {
      const desc = document.createElement('div');
      desc.className = 'lab__formula-description';
      desc.textContent = descText;
      div.append(desc);
    }

    container.append(div);
  }
}

/**
 * Render code with syntax highlighting.
 * @param {string} code
 * @param {string} language
 * @param {HTMLElement} container
 */
export async function renderCode(code, language, container) {
  await ensurePrism();
  container.innerHTML = '';

  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.className = `language-${language}`;
  codeEl.textContent = code;
  pre.append(codeEl);
  container.append(pre);

  if (window.Prism) {
    window.Prism.highlightElement(codeEl);
  }
}

/**
 * Render a changelog as a vertical timeline.
 * @param {Array<{version: string, date: string, type: string, description: string|object, breaking?: boolean}>} changelog
 * @param {HTMLElement} container
 * @param {function} [loc] - Localization function for bilingual values
 */
export function renderTimeline(changelog, container, loc) {
  if (!loc) loc = (v) => (typeof v === 'string' ? v : '');
  container.innerHTML = '';
  container.className = 'lab__timeline';

  for (const entry of changelog) {
    const el = document.createElement('div');
    el.className = 'lab__timeline-entry';
    if (entry.breaking) el.classList.add('lab__timeline-breaking');

    el.innerHTML = `
      <div class="lab__timeline-dot lab__timeline-dot--${entry.type}"></div>
      <div class="lab__timeline-header">
        <span class="lab__timeline-version">v${entry.version}</span>
        <span class="lab__timeline-date">${entry.date}</span>
        <span class="lab__timeline-type lab__timeline-type--${entry.type}">${entry.type}</span>
      </div>
      <div class="lab__timeline-desc">${loc(entry.description)}</div>
    `;

    container.append(el);
  }
}

/**
 * Return HTML string for a status badge.
 * @param {string} status
 * @param {object} i18n
 * @returns {string}
 */
export function statusBadgeHTML(status, i18n) {
  const label = i18n?.t(`lab.status.${status}`) ?? status;
  return `<span class="lab__status-badge lab__status-badge--${status}">${label}</span>`;
}

/**
 * Return HTML string for a status dot.
 * @param {string} status
 * @returns {string}
 */
export function statusDotHTML(status) {
  return `<span class="lab__status-dot lab__status-dot--${status}"></span>`;
}

/**
 * Update the Prism.js theme link when the app theme changes.
 * @param {string} theme - 'light' or 'dark'
 */
export function updatePrismTheme(theme) {
  const link = document.getElementById('prism-theme');
  if (!link) return;
  link.href = theme === 'dark'
    ? 'vendor/prism/prism-tomorrow.css'
    : 'vendor/prism/prism.css';
}
