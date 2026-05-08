/**
 * modebar.js — Shared modebar (chart toolbar) utility.
 * Creates the standard D.Mike chart toolbar with Zoom, Pan, Reset,
 * Download (PNG/SVG), and Editor toggle buttons.
 *
 * The modebar is a **normal-flow toolbar row** (not an absolute overlay).
 * It is always visible — no opacity tricks, no hover detection.
 * The caller inserts `el` as the first child of a flex-column container
 * so the toolbar sits above the chart area.
 *
 * Used by chart-base.js (for framework charts) and by modules that
 * render their own SVG (e.g. histogram).
 *
 * @module modebar
 */

/** SVG icon markup for all modebar buttons */
const ICONS = {
  zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>',
  pan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.36L3 3"/><path d="M3 3v5h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  png: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 15l2 2 4-4"/></svg>',
  csv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M8 15h2M11 15h2M14 15h2"/></svg>',
  xlsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13l6 6M15 13l-6 6"/></svg>',
  editor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  popout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="15" height="15" rx="2"/><path d="M14 2h8v8"/><path d="M22 2L12 12"/></svg>',
};

/**
 * Create a standard modebar toolbar and wire up its events.
 * The returned `el` is a normal-flow div — insert it as the first child
 * of a flex-column container so it sits above the chart SVG.
 *
 * @param {Object} callbacks
 * @param {function} callbacks.onZoom        - Called when Zoom mode is selected
 * @param {function} callbacks.onPan         - Called when Pan mode is selected
 * @param {function} callbacks.onReset       - Called when Reset is clicked
 * @param {function} callbacks.onExportPNG   - Called when PNG export is requested
 * @param {function} callbacks.onExportSVG   - Called when SVG export is requested
 * @param {function} callbacks.onExportCSV   - Called when CSV data export is requested
 * @param {function} callbacks.onExportXLSX  - Called when XLSX data export is requested
 * @param {function} callbacks.onEditorToggle - Called with (isOpen: boolean) when editor is toggled
 * @param {function} callbacks.onPopout      - Called when Popout is clicked
 * @returns {{ el: HTMLElement, setMode: function, setEditorOpen: function, destroy: function }}
 */
export function createModebar(callbacks = {}) {
  const bar = document.createElement('div');
  bar.className = 'dmike-chart-modebar';

  let editorOpen = false;

  // ── Helper: create a button ──
  const makeBtn = (id, icon, title) => {
    const btn = document.createElement('button');
    btn.className = 'dmike-chart-modebar-btn';
    btn.dataset.action = id;
    btn.title = title;
    btn.innerHTML = icon;
    return btn;
  };

  // ── Helper: create separator ──
  const makeSep = () => {
    const sep = document.createElement('div');
    sep.className = 'dmike-chart-modebar-sep';
    return sep;
  };

  // ── Buttons ──
  const btnZoom = makeBtn('zoom', ICONS.zoom, 'Zoom');
  const btnPan = makeBtn('pan', ICONS.pan, 'Pan');
  const btnReset = makeBtn('reset', ICONS.reset, 'Reset');
  const btnEditor = makeBtn('editor', ICONS.editor, 'Editor');
  const btnPopout = makeBtn('popout', ICONS.popout, 'Popout');

  btnZoom.classList.add('active'); // zoom is default

  bar.appendChild(btnZoom);
  bar.appendChild(btnPan);
  bar.appendChild(makeSep());
  bar.appendChild(btnReset);

  // ── Download dropdown ──
  const dlWrap = document.createElement('div');
  dlWrap.className = 'dmike-chart-dropdown';
  const dlBtn = makeBtn('download', ICONS.download, 'Export');
  const dlMenu = document.createElement('div');
  dlMenu.className = 'dmike-chart-dropdown-menu';

  const makeDlItem = (icon, label, action) => {
    const item = document.createElement('button');
    item.className = 'dmike-chart-dropdown-item';
    item.innerHTML = icon + ' ' + label;
    item.dataset.action = action;
    return item;
  };

  const dlPng = makeDlItem(ICONS.png, 'PNG', 'dl-png');
  const dlSvg = makeDlItem(ICONS.svg, 'SVG', 'dl-svg');
  const dlCsv = makeDlItem(ICONS.csv, 'CSV', 'dl-csv');
  const dlXlsx = makeDlItem(ICONS.xlsx, 'Excel', 'dl-xlsx');
  dlMenu.appendChild(dlPng);
  dlMenu.appendChild(dlSvg);
  dlMenu.appendChild(dlCsv);
  dlMenu.appendChild(dlXlsx);
  dlWrap.appendChild(dlBtn);
  dlWrap.appendChild(dlMenu);
  bar.appendChild(dlWrap);

  bar.appendChild(makeSep());
  if (callbacks.onPopout) bar.appendChild(btnPopout);
  bar.appendChild(btnEditor);

  // ── Set interaction mode (zoom/pan) ──
  const setMode = (mode) => {
    btnZoom.classList.toggle('active', mode === 'zoom');
    btnPan.classList.toggle('active', mode === 'pan');
  };

  // ── Set editor button state ──
  const setEditorOpen = (open) => {
    editorOpen = open;
    btnEditor.classList.toggle('active', open);
  };

  // ── Event wiring ──
  btnZoom.addEventListener('click', () => {
    setMode('zoom');
    if (callbacks.onZoom) callbacks.onZoom();
  });

  btnPan.addEventListener('click', () => {
    setMode('pan');
    if (callbacks.onPan) callbacks.onPan();
  });

  btnReset.addEventListener('click', () => {
    if (callbacks.onReset) callbacks.onReset();
  });

  btnEditor.addEventListener('click', () => {
    editorOpen = !editorOpen;
    btnEditor.classList.toggle('active', editorOpen);
    if (callbacks.onEditorToggle) callbacks.onEditorToggle(editorOpen);
  });

  btnPopout.addEventListener('click', () => {
    if (callbacks.onPopout) callbacks.onPopout();
  });

  dlBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dlMenu.classList.toggle('open');
  });

  dlPng.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    if (callbacks.onExportPNG) callbacks.onExportPNG();
  });

  dlSvg.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    if (callbacks.onExportSVG) callbacks.onExportSVG();
  });

  dlCsv.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    if (callbacks.onExportCSV) callbacks.onExportCSV();
  });

  dlXlsx.addEventListener('click', () => {
    dlMenu.classList.remove('open');
    if (callbacks.onExportXLSX) callbacks.onExportXLSX();
  });

  // Close dropdown on outside click
  const docClickHandler = (e) => {
    if (!dlWrap.contains(e.target)) {
      dlMenu.classList.remove('open');
    }
  };
  document.addEventListener('click', docClickHandler);

  // ── Cleanup ──
  const destroy = () => {
    document.removeEventListener('click', docClickHandler);
    bar.remove();
  };

  return { el: bar, setMode, setEditorOpen, destroy };
}

/**
 * Generic SVG export helper — PNG (2× resolution).
 * @param {SVGElement} svgElement - The SVG to export
 * @param {string} [filename='chart.png'] - Download filename
 */
export async function exportSvgAsPNG(svgElement, filename = 'chart.png') {
  if (!svgElement) return;
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const vb = svgElement.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 800, 420];
  const w = vb[2] * 2, h = vb[3] * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = filename;
      a.href = canvas.toDataURL('image/png');
      a.click();
      resolve();
    };
    img.src = url;
  });
}

/**
 * Generic SVG export helper — SVG download.
 * @param {SVGElement} svgElement - The SVG to export
 * @param {string} [filename='chart.svg'] - Download filename
 */
export function exportSvgAsFile(svgElement, filename = 'chart.svg') {
  if (!svgElement) return;
  const clone = svgElement.cloneNode(true);
  const vb = svgElement.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 800, 420];
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', vb[2]);
  bg.setAttribute('height', vb[3]);
  bg.setAttribute('fill', '#fff');
  clone.insertBefore(bg, clone.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}
