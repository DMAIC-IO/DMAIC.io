/**
 * pie.js — Pie / donut chart type for the D.Mike chart framework.
 *
 * Config:
 *   slices: [{ name, value, color? }]  — data slices
 *   innerRadius: 0                     — 0..0.85 donut hole fraction
 *   padAngle: 0.8                      — gap between slices (degrees)
 *   startAngle: -90                    — start angle (degrees, –90 = 12 o'clock)
 *   explodeDistance: 12                — hover explode offset (px)
 *   strokeColor: 'rgba(255,255,255,1)' — slice border color
 *   strokeWidth: 2                     — slice border width
 *   showLabels: true
 *   labelMode: 'percent'               — 'percent' | 'value' | 'name' | 'both'
 *   labelSize: 12
 *   sortSlices: 'none'                 — 'none' | 'asc' | 'desc'
 *   centerLabel: ''                    — donut center main text
 *   centerSub: ''                      — donut center sub text
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, parseRGBA,
} from '../chart-core.js';
import {
  edSection, edCheckboxRow, edRangeRow, edSelectRow,
  edTitleSection, edBgColorSection, edInlineInput,
  openColorPicker,
} from '../chart-editor.js';

const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// ── Arc Geometry ──────────────────────────────────────────────

function arcPath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) return '';
  const large = sweep > Math.PI ? 1 : 0;
  const ox1 = cx + outerR * Math.cos(startAngle);
  const oy1 = cy + outerR * Math.sin(startAngle);
  const ox2 = cx + outerR * Math.cos(endAngle);
  const oy2 = cy + outerR * Math.sin(endAngle);

  if (innerR > 0) {
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
  }

  if (Math.abs(sweep - 2 * Math.PI) < 0.001) {
    const mx = cx + outerR * Math.cos(startAngle + Math.PI);
    const my = cy + outerR * Math.sin(startAngle + Math.PI);
    return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${mx} ${my} A ${outerR} ${outerR} 0 0 1 ${ox1} ${oy1} Z`;
  }
  return `M ${cx} ${cy} L ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} Z`;
}

function darken(rgbaString, amount) {
  const c = parseRGBA(rgbaString);
  c.r = Math.max(0, Math.round(c.r * (1 - amount)));
  c.g = Math.max(0, Math.round(c.g * (1 - amount)));
  c.b = Math.max(0, Math.round(c.b * (1 - amount)));
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}

// ── Chart Class ───────────────────────────────────────────────

export default class PieChart extends ChartBase {
  constructor(container, config, context) {
    const defaults = {
      slices: [],
      innerRadius: 0,
      padAngle: 0.8,
      startAngle: -90,
      explodeDistance: 12,
      strokeColor: 'rgba(255,255,255,1)',
      strokeWidth: 2,
      showLabels: true,
      labelMode: 'percent',
      labelSize: 12,
      sortSlices: 'none',
      centerLabel: '',
      centerSub: '',
      showLegend: true,
      showXLabel: false,
      showYLabel: false,
      showXTicks: false,
      showYTicks: false,
    };
    super(container, Object.assign(defaults, config), context);
    this._hoveredSlice = -1;
    this._arcs = [];
    this._pieCx = 0;
    this._pieCy = 0;
    this._outerR = 0;
  }

  /* ── Sorted slices ───────────────────────────────────────── */

  _getSortedSlices() {
    const colors = getChartColors();
    let slices = (this.config.slices || []).map((s, i) => ({
      ...s,
      origIdx: i,
      color: s.color || colors[i % colors.length],
    }));
    if (this.config.sortSlices === 'desc') slices.sort((a, b) => b.value - a.value);
    else if (this.config.sortSlices === 'asc') slices.sort((a, b) => a.value - b.value);
    return slices.filter(s => s.value > 0);
  }

  /* ── Override: no Cartesian data extent ───────────────────── */

  _getDataExtent() {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }

  _getLegendItems() {
    return this._getSortedSlices().map(s => ({
      type: 'rect', color: s.color, label: s.name || `Slice ${s.origIdx + 1}`,
    }));
  }

  /* ── Render (complete override) ──────────────────────────── */

  render() {
    const size = this._getSize();
    if (size.w <= 0 || size.h <= 0) return;

    const svg = this._svg;
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    svg.setAttribute('width', size.w);
    svg.setAttribute('height', size.h);
    svg.innerHTML = '';
    svg.style.background = this.config.bgColor || '';

    const styles = getComputedStyle(document.documentElement);
    const textPrimary = styles.getPropertyValue('--color-text-primary').trim() || '#1a1a2e';
    const textSecondary = styles.getPropertyValue('--color-text-secondary').trim() || '#5a6270';

    const styleEl = svgEl('style', {}, svg);
    styleEl.textContent = `text { font-family: ${FONT_MAIN}; }`;

    const cfg = this.config;
    const slices = this._getSortedSlices();
    let total = 0;
    for (const s of slices) total += s.value;

    // Layout
    const titleH = (cfg.showTitle !== false && cfg.title) ? 40 : 10;
    const legendW = cfg.showLegend ? this._measureLegendWidth() : 0;
    const availW = size.w - legendW - 40;
    const availH = size.h - titleH - 20;
    let outerR = Math.min(availW, availH) / 2 - 10;
    outerR = Math.max(30, outerR);
    const innerR = outerR * Math.min(0.85, Math.max(0, cfg.innerRadius || 0));
    const cx = 20 + availW / 2;
    const cy = titleH + availH / 2;

    this._pieCx = cx;
    this._pieCy = cy;
    this._outerR = outerR;

    // Title
    if (cfg.showTitle !== false && cfg.title) {
      svgText(cfg.title, {
        x: size.w / 2, y: 26,
        'text-anchor': 'middle', 'font-size': (cfg.titleSize || 15) + 'px',
        'font-weight': '700', fill: textPrimary,
      }, svg);
    }

    if (total === 0 || slices.length === 0) {
      svgEl('circle', { cx, cy, r: outerR, fill: resolveColor('var(--color-border)') }, svg);
      this._arcs = [];
      if (cfg.showLegend) this._drawLegend(svg, this._piePlotArea(size, legendW), size, textSecondary);
      return;
    }

    // Compute arcs
    const padRad = (cfg.padAngle || 0) * Math.PI / 180;
    const startRad = (cfg.startAngle || -90) * Math.PI / 180;
    const arcs = [];
    let angle = startRad;

    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      const frac = s.value / total;
      const sweep = frac * 2 * Math.PI;
      const halfPad = slices.length > 1 ? padRad / 2 : 0;
      const a1 = angle + halfPad;
      const a2 = angle + sweep - halfPad;
      arcs.push({
        index: i, origIdx: s.origIdx, name: s.name, value: s.value,
        color: s.color, frac, a1, a2, mid: (a1 + a2) / 2,
      });
      angle += sweep;
    }
    this._arcs = arcs;

    const strokeColor = resolveColor(cfg.strokeColor || 'rgba(255,255,255,1)');
    const strokeWidth = cfg.strokeWidth ?? 2;
    const explodeDist = cfg.explodeDistance || 0;

    // Draw slices
    for (const arc of arcs) {
      const hovered = this._hoveredSlice === arc.index;
      const explode = hovered ? explodeDist : 0;
      const ecx = cx + explode * Math.cos(arc.mid);
      const ecy = cy + explode * Math.sin(arc.mid);

      const d = slices.length === 1
        ? arcPath(ecx, ecy, outerR, innerR, startRad, startRad + 2 * Math.PI - 0.001)
        : arcPath(ecx, ecy, outerR, innerR, arc.a1, arc.a2);
      if (!d) continue;

      const fillColor = hovered ? darken(arc.color, 0.12) : arc.color;
      svgEl('path', {
        d, fill: fillColor,
        stroke: strokeColor, 'stroke-width': strokeWidth,
        'data-slice': String(arc.index),
        style: 'cursor:pointer;transition:opacity .15s',
      }, svg);
    }

    // Labels
    if (cfg.showLabels !== false && total > 0) {
      for (const arc of arcs) {
        if (arc.frac < 0.02) continue;

        const hovered = this._hoveredSlice === arc.index;
        const explode = hovered ? explodeDist : 0;
        const ecx = cx + explode * Math.cos(arc.mid);
        const ecy = cy + explode * Math.sin(arc.mid);

        const labelR = innerR > 0 ? (innerR + outerR) / 2 : outerR * 0.65;
        const lx = ecx + labelR * Math.cos(arc.mid);
        const ly = ecy + labelR * Math.sin(arc.mid);

        const pct = (arc.frac * 100).toFixed(1) + ' %';
        let text;
        switch (cfg.labelMode) {
          case 'name': text = arc.name; break;
          case 'value': text = formatNum(arc.value, 2, this.locale); break;
          case 'both': text = pct; break;
          default: text = pct;
        }

        const col = parseRGBA(arc.color);
        const lum = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
        const labelColor = lum > 140 ? '#1a1a2e' : '#ffffff';

        svgText(text, {
          x: lx, y: ly + 1,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': (cfg.labelSize || 12) + 'px', 'font-weight': '600',
          fill: labelColor, 'pointer-events': 'none',
        }, svg);

        // Outer name label in 'both' mode
        if (cfg.labelMode === 'both' && arc.frac >= 0.04) {
          const outerLabelR = outerR + 18 + explode * 0.3;
          const olx = cx + outerLabelR * Math.cos(arc.mid);
          const oly = cy + outerLabelR * Math.sin(arc.mid);
          const anchor = Math.abs(Math.cos(arc.mid)) < 0.15 ? 'middle'
            : Math.cos(arc.mid) >= 0 ? 'start' : 'end';

          svgText(arc.name, {
            x: olx, y: oly,
            'text-anchor': anchor, 'dominant-baseline': 'central',
            'font-size': ((cfg.labelSize || 12) - 1) + 'px',
            fill: textSecondary, 'pointer-events': 'none',
          }, svg);

          const connR1 = outerR + 4 + explode * 0.2;
          const connR2 = outerR + 14 + explode * 0.3;
          svgEl('line', {
            x1: cx + connR1 * Math.cos(arc.mid),
            y1: cy + connR1 * Math.sin(arc.mid),
            x2: cx + connR2 * Math.cos(arc.mid),
            y2: cy + connR2 * Math.sin(arc.mid),
            stroke: resolveColor('var(--color-border-secondary)'), 'stroke-width': 1,
            'pointer-events': 'none',
          }, svg);
        }
      }
    }

    // Center label (donut)
    if (innerR > 0 && (cfg.centerLabel || cfg.centerSub)) {
      if (cfg.centerLabel) {
        svgText(cfg.centerLabel, {
          x: cx, y: cfg.centerSub ? cy - 8 : cy,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': '18px', 'font-weight': '700', fill: textPrimary,
        }, svg);
      }
      if (cfg.centerSub) {
        svgText(cfg.centerSub, {
          x: cx, y: cfg.centerLabel ? cy + 14 : cy,
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': '12px', fill: textSecondary,
        }, svg);
      }
    }

    // Legend
    if (cfg.showLegend) {
      this._drawLegend(svg, this._piePlotArea(size, legendW), size, textSecondary);
    }
  }

  _piePlotArea(size, legendW) {
    const lw = legendW || 90;
    return {
      x: 20, y: 40,
      w: size.w - 20 - lw - 16,
      h: size.h - 60,
      totalW: size.w, totalH: size.h,
      rMargin: lw + 16,
    };
  }

  /* ── Hover / Tooltip ─────────────────────────────────────── */

  _onMouseMove(e) {
    const rect = this._svgWrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const target = e.target;

    if (target.tagName === 'path' && target.hasAttribute('data-slice')) {
      const idx = +target.getAttribute('data-slice');
      if (this._hoveredSlice !== idx) {
        this._hoveredSlice = idx;
        this.render();
      }
      const arc = this._arcs[idx];
      if (arc) {
        let total = 0;
        for (const a of this._arcs) total += a.value;
        const pct = total > 0 ? ((arc.value / total) * 100).toFixed(1) : '0.0';
        this._tooltip.innerHTML = `<b style="color:${arc.color}">${arc.name}</b><br>${formatNum(arc.value, 2, this.locale)}<br>${pct} %`;
        this._tooltip.classList.add('visible');
        this._tooltip.style.left = (mx + 14) + 'px';
        this._tooltip.style.top = (my - 10) + 'px';
      }
    } else {
      if (this._hoveredSlice !== -1) {
        this._hoveredSlice = -1;
        this.render();
      }
      this._tooltip.classList.remove('visible');
    }
  }

  _onMouseLeave() {
    if (this._hoveredSlice !== -1) {
      this._hoveredSlice = -1;
      this.render();
    }
    this._tooltip.classList.remove('visible');
  }

  /* ── Editor ──────────────────────────────────────────────── */

  _buildEditor() {
    const inner = this._editorInner;
    inner.innerHTML = '';
    const cfg = this.config;
    const t = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.pie.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };
    const tBase = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };
    const onUpdate = () => { this.render(); this._buildEditor(); };
    const onSlide = () => { this.render(); };

    // Title
    inner.appendChild(edTitleSection(cfg, () => this.render(), tBase));

    // Legend
    inner.appendChild(edCheckboxRow(tBase('showLegend'), cfg.showLegend !== false, (v) => { cfg.showLegend = v; onUpdate(); }));

    // Labels
    const secLabels = edSection(t('labels'));
    secLabels.appendChild(edCheckboxRow(t('showLabels'), cfg.showLabels !== false, (v) => { cfg.showLabels = v; onUpdate(); }));
    secLabels.appendChild(edSelectRow(t('labelType'), [
      { value: 'both', label: t('labelBoth') },
      { value: 'percent', label: t('labelPercent') },
      { value: 'name', label: t('labelName') },
      { value: 'value', label: t('labelValue') },
    ], cfg.labelMode, (v) => { cfg.labelMode = v; onUpdate(); }));
    secLabels.appendChild(edRangeRow(t('labelSize'), cfg.labelSize, (v) => { cfg.labelSize = v; onSlide(); }, 7, 18, 1));
    inner.appendChild(secLabels);

    // Shape
    const secShape = edSection(t('shapeStyle'));
    secShape.appendChild(edRangeRow(t('innerRadius'), Math.round((cfg.innerRadius || 0) * 100), (v) => {
      const hadDonut = cfg.innerRadius > 0;
      cfg.innerRadius = v / 100;
      if ((cfg.innerRadius > 0) !== hadDonut) onUpdate(); else onSlide();
    }, 0, 85, 1));
    secShape.appendChild(edRangeRow(t('padAngle'), (cfg.padAngle || 0) * 10, (v) => { cfg.padAngle = v / 10; onSlide(); }, 0, 50, 1));
    secShape.appendChild(edRangeRow(t('startAngle'), cfg.startAngle || -90, (v) => { cfg.startAngle = v; onSlide(); }, -180, 180, 1));
    secShape.appendChild(edRangeRow(t('explode'), cfg.explodeDistance || 0, (v) => { cfg.explodeDistance = v; onSlide(); }, 0, 30, 1));
    secShape.appendChild(edRangeRow(t('strokeWidth'), (cfg.strokeWidth ?? 2) * 2, (v) => { cfg.strokeWidth = v / 2; onSlide(); }, 0, 10, 1));
    secShape.appendChild(edSelectRow(t('sort'), [
      { value: 'none', label: t('sortNone') },
      { value: 'desc', label: t('sortDesc') },
      { value: 'asc', label: t('sortAsc') },
    ], cfg.sortSlices, (v) => { cfg.sortSlices = v; onUpdate(); }));
    inner.appendChild(secShape);

    // Center (donut)
    if ((cfg.innerRadius || 0) > 0) {
      const secCenter = edSection(t('donutCenter'));
      secCenter.appendChild(edInlineInput(t('centerLine1'), 'text', cfg.centerLabel || '', (v) => { cfg.centerLabel = v; this.render(); }));
      secCenter.appendChild(edInlineInput(t('centerLine2'), 'text', cfg.centerSub || '', (v) => { cfg.centerSub = v; this.render(); }));
      inner.appendChild(secCenter);
    }

    // Background
    inner.appendChild(edBgColorSection(cfg, (changes) => {
      Object.assign(cfg, changes);
      this.render();
    }, (ev, color, cb) => openColorPicker(ev, color, cb), tBase));
  }

  /* ── No-ops for Cartesian features ───────────────────────── */

  _findNearby() { return []; }
  _renderData() {}
}
