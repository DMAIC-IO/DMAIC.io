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

import { svgStringToPngBlob } from '../export-utils.js';
import { icon } from '../icon.js';

/** Maps each modebar button to its sprite icon name. */
const ICONS = {
  zoom: 'zoom-in',
  pan: 'pan',
  reset: 'reset',
  download: 'download',
  png: 'export-png',
  svg: 'export-svg',
  csv: 'export-csv',
  xlsx: 'export-xlsx',
  editor: 'edit',
  popout: 'popout',
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
  const makeBtn = (id, iconName, title) => {
    const btn = document.createElement('button');
    btn.className = 'dmike-chart-modebar-btn';
    btn.dataset.action = id;
    btn.title = title;
    btn.replaceChildren(icon(iconName));
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

  const makeDlItem = (iconName, label, action) => {
    const item = document.createElement('button');
    item.className = 'dmike-chart-dropdown-item';
    item.replaceChildren(icon(iconName), document.createTextNode(` ${  label}`));
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
  // 2× HiDPI raster on a white background — pixel-identical to the previous
  // inline canvas pipeline.
  const png = await svgStringToPngBlob(svgData, {
    width: vb[2], height: vb[3], scale: 2, background: '#fff',
  });
  const url = URL.createObjectURL(png);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
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
