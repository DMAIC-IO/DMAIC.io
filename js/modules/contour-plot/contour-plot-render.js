/**
 * D.Mike — Contour Plot: Render mixin
 *
 * Extracted from contour-plot.js — main contour drawing, legend,
 * tooltip setup, and supporting helpers (axis ticks, marching squares,
 * canvas markers). Color schemes live in core/chart/color-schemes.js.
 */

export { getColor } from '../../core/chart/color-schemes.js';
import { getColor } from '../../core/chart/color-schemes.js';

// ═══════════════════════════════════════════════════════════════
// Axis tick generation
// ═══════════════════════════════════════════════════════════════

function niceScale(lo, hi, approxTicks) {
  const range = hi - lo;
  if (range === 0) return [lo];
  const step = Math.pow(10, Math.floor(Math.log10(range / approxTicks)));
  const steps = [1, 2, 2.5, 5, 10];
  let best = step;
  for (const s of steps) { if (range / (step * s) <= approxTicks) { best = step * s; break; } }
  const ticks = [];
  let v = Math.ceil(lo / best) * best;
  while (v <= hi + best * 0.001) { ticks.push(v); v += best; }
  return ticks;
}

// ═══════════════════════════════════════════════════════════════
// Marching Squares
// ═══════════════════════════════════════════════════════════════

function marchCell(z00, z10, z01, z11, lv, i, j, cw, ch, m) {
  const a = z00 >= lv ? 1 : 0;
  const b = z10 >= lv ? 1 : 0;
  const c = z11 >= lv ? 1 : 0;
  const d = z01 >= lv ? 1 : 0;
  const idx = a | (b << 1) | (c << 2) | (d << 3);
  if (idx === 0 || idx === 15) return null;

  const x0 = m.left + i * cw, y0 = m.top + j * ch;
  function interp(v1, v2, edge) {
    const t = (lv - v1) / (v2 - v1 || 1);
    switch (edge) {
      case 'T': return [x0 + t * cw, y0];
      case 'R': return [x0 + cw, y0 + t * ch];
      case 'B': return [x0 + t * cw, y0 + ch];
      case 'L': return [x0, y0 + t * ch];
    }
  }
  const LINES = {
    1:['T','L'],2:['T','R'],3:['L','R'],4:['R','B'],5:['T','R'],6:['T','B'],
    7:['L','B'],8:['L','B'],9:['T','B'],10:['T','L'],11:['R','B'],12:['L','R'],
    13:['T','R'],14:['T','L'],
  };
  const e = LINES[idx];
  if (!e) return null;
  const vMap = { T: [z00, z10], R: [z10, z11], B: [z01, z11], L: [z00, z01] };
  const p1 = interp(vMap[e[0]][0], vMap[e[0]][1], e[0]);
  const p2 = interp(vMap[e[1]][0], vMap[e[1]][1], e[1]);
  return [p1[0], p1[1], p2[0], p2[1]];
}

// ═══════════════════════════════════════════════════════════════
// Canvas marker drawing (mirrors chart-core.js SVG symbols)
// ═══════════════════════════════════════════════════════════════

function drawCanvasMarker(ctx, symbol, cx, cy, r) {
  ctx.beginPath();
  switch (symbol) {
    case 'square': ctx.rect(cx - r, cy - r, r * 2, r * 2); break;
    case 'diamond':
      ctx.moveTo(cx, cy - r * 1.2); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r * 1.2); ctx.lineTo(cx - r, cy); ctx.closePath(); break;
    case 'triangle':
      ctx.moveTo(cx, cy - r * 1.1); ctx.lineTo(cx + r * 1.05, cy + r * 0.7);
      ctx.lineTo(cx - r * 1.05, cy + r * 0.7); ctx.closePath(); break;
    case 'triangle-down':
      ctx.moveTo(cx, cy + r * 1.1); ctx.lineTo(cx + r * 1.05, cy - r * 0.7);
      ctx.lineTo(cx - r * 1.05, cy - r * 0.7); ctx.closePath(); break;
    case 'cross': {
      const t = r * 0.3;
      ctx.moveTo(cx - t, cy - r); ctx.lineTo(cx + t, cy - r); ctx.lineTo(cx + t, cy - t);
      ctx.lineTo(cx + r, cy - t); ctx.lineTo(cx + r, cy + t); ctx.lineTo(cx + t, cy + t);
      ctx.lineTo(cx + t, cy + r); ctx.lineTo(cx - t, cy + r); ctx.lineTo(cx - t, cy + t);
      ctx.lineTo(cx - r, cy + t); ctx.lineTo(cx - r, cy - t); ctx.lineTo(cx - t, cy - t);
      ctx.closePath(); break;
    }
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 === 0 ? r * 1.1 : r * 0.45;
        const mx = cx + Math.cos(a) * rr, my = cy - Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
      }
      ctx.closePath(); break;
    }
    default: ctx.arc(cx, cy, r, 0, Math.PI * 2); break;
  }
}

function canvasDash(style) {
  switch (style) {
    case 'dash': return [6, 4];
    case 'dot': return [2, 4];
    case 'dashdot': return [6, 3, 2, 3];
    case 'longdash': return [12, 6];
    default: return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Render mixin
// ═══════════════════════════════════════════════════════════════

export const renderMethods = {

  _drawContour() {
    const canvas = this._canvas;
    const ctx = canvas.getContext('2d');
    const cc = this._chartConfig;

    // Show chart area, hide placeholder (must happen before measuring width)
    this._container.querySelector('[data-ref="placeholder"]').style.display = 'none';
    this._container.querySelector('[data-ref="chart-area"]').style.display = '';
    this._container.querySelector('[data-ref="infoRow"]').style.display = '';

    // Responsive: fit into available space without forcing scroll
    const mainEl = this._container.querySelector('.contour__chart-main');
    const availW = mainEl ? mainEl.clientWidth : 600;
    const availH = window.innerHeight * 0.6;
    const maxW = Math.min(availW, Math.round(availH / 0.78));
    const W = Math.max(400, maxW);
    const H = Math.round(W * 0.78);

    // HiDPI: scale canvas buffer by devicePixelRatio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const titleSize = cc.titleSize ?? 15;
    const labelSize = cc.labelSize ?? 13;
    const tickSize = cc.tickSize ?? 11;
    const showTitle = cc.showTitle !== false;
    const showXLabel = cc.showXLabel !== false;
    const showYLabel = cc.showYLabel !== false;
    const showXTicks = cc.showXTicks !== false;
    const showYTicks = cc.showYTicks !== false;

    const margin = {
      top: showTitle ? 20 + titleSize + 8 : 20,
      right: 30,
      bottom: (showXTicks ? tickSize + 12 : 6) + (showXLabel ? labelSize + 10 : 0) + 10,
      left: (showYTicks ? tickSize * 3 + 10 : 6) + (showYLabel ? labelSize + 10 : 0) + 10,
    };

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const defaultBg = isDark ? '#0d1117' : '#f8f9fa';
    const bgColor = cc.bgColor || defaultBg;
    const axisColor = isDark ? '#2a3654' : '#c0c8d0';
    const textColor = isDark ? '#8899b8' : '#555';
    const labelColor = isDark ? '#e8ecf4' : '#222';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    const xMin = this._numVal('xMin', -3);
    const xMax = this._numVal('xMax', 3);
    const yMin = this._numVal('yMin', -3);
    const yMax = this._numVal('yMax', 3);

    // Display options from state (set via editor)
    const res = this._state.gridRes || 100;
    const nLevels = this._state.numLevels || 10;
    const scheme = this._state.colorScheme || 'viridis';
    const showLines = this._state.showLines !== false;
    const showLabels = this._state.showLabels !== false;
    const showPts = this._state.showDataPoints || false;

    // Build grid
    const grid = [];
    let zMinG = Infinity, zMaxG = -Infinity;
    let optX = 0, optY = 0;
    for (let j = 0; j < res; j++) {
      grid[j] = [];
      for (let i = 0; i < res; i++) {
        const x = xMin + (xMax - xMin) * i / (res - 1);
        const y = yMax - (yMax - yMin) * j / (res - 1);
        const z = this._evalModel(x, y);
        grid[j][i] = z;
        if (z < zMinG) zMinG = z;
        if (z > zMaxG) { zMaxG = z; optX = x; optY = y; }
      }
    }
    this._lastGrid = { grid, xMin, xMax, yMin, yMax, res, margin, plotW, plotH, W, H };

    // Helper: map data coords to canvas coords
    const toCanvasX = (v) => margin.left + (v - xMin) / (xMax - xMin) * plotW;
    const toCanvasY = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    // ── Reference Areas (behind contour fill) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();
    (this._refAreas || []).forEach(area => {
      ctx.fillStyle = area.color || 'rgba(44,95,138,0.12)';
      if (area.dir === 'x') {
        const ax = toCanvasX(area.min ?? xMin);
        const aw = toCanvasX(area.max ?? xMax) - ax;
        ctx.fillRect(ax, margin.top, aw, plotH);
      } else {
        const ay = toCanvasY(area.max ?? yMax);
        const ah = toCanvasY(area.min ?? yMin) - ay;
        ctx.fillRect(margin.left, ay, plotW, ah);
      }
    });
    ctx.restore();

    // ── Fill contour (clipped to plot area) ──
    const cellW = plotW / (res - 1);
    const cellH = plotH / (res - 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const t = zMaxG === zMinG ? 0.5 : (grid[j][i] - zMinG) / (zMaxG - zMinG);
        const c = getColor(t, scheme);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(margin.left + i * cellW - 0.5, margin.top + j * cellH - 0.5, cellW + 1, cellH + 1);
      }
    }
    ctx.restore();

    // ── Contour lines ──
    if (showLines) {
      const levels = [];
      for (let k = 0; k < nLevels; k++) levels.push(zMinG + (zMaxG - zMinG) * (k + 0.5) / nLevels);

      ctx.lineWidth = 0.8;
      levels.forEach(lv => {
        const t = (lv - zMinG) / (zMaxG - zMinG);
        const c = getColor(t, scheme);
        ctx.strokeStyle = `rgba(${Math.min(255, c[0] + 80)},${Math.min(255, c[1] + 80)},${Math.min(255, c[2] + 80)},0.65)`;

        let labelPlaced = false;
        for (let j = 0; j < res - 1; j++) {
          for (let i = 0; i < res - 1; i++) {
            const pts = marchCell(grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1], lv, i, j, cellW, cellH, margin);
            if (pts) {
              ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.stroke();
              if (showLabels && !labelPlaced && i > res * 0.3 && i < res * 0.7 && j > res * 0.3 && j < res * 0.7) {
                ctx.save();
                ctx.font = '600 9px monospace';
                ctx.fillStyle = isDark ? '#fff' : '#000';
                ctx.shadowColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
                ctx.shadowBlur = 3;
                ctx.fillText(lv.toFixed(1), (pts[0] + pts[2]) / 2 + 2, (pts[1] + pts[3]) / 2 - 2);
                ctx.restore();
                labelPlaced = true;
              }
            }
          }
        }
      });
    }

    // ── Reference Lines (on top of contour) ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();
    (this._refLines || []).forEach(line => {
      ctx.strokeStyle = line.color || 'rgba(192,57,43,1)';
      ctx.lineWidth = line.width || 1.5;
      const dash = line.dash || 'dash';
      ctx.setLineDash(dash === 'solid' ? [] : dash === 'dot' ? [2, 4] : dash === 'longdash' ? [12, 6] : [6, 4]);
      ctx.beginPath();
      if (line.dir === 'h') {
        const py = toCanvasY(line.value);
        ctx.moveTo(margin.left, py);
        ctx.lineTo(margin.left + plotW, py);
      } else {
        const px = toCanvasX(line.value);
        ctx.moveTo(px, margin.top);
        ctx.lineTo(px, margin.top + plotH);
      }
      ctx.stroke();
      // Label
      if (line.label) {
        ctx.setLineDash([]);
        ctx.font = `${tickSize}px sans-serif`;
        ctx.fillStyle = line.color || 'rgba(192,57,43,1)';
        if (line.dir === 'h') {
          ctx.textAlign = 'right';
          ctx.fillText(line.label, margin.left + plotW - 4, toCanvasY(line.value) - 4);
        } else {
          ctx.textAlign = 'left';
          ctx.save(); ctx.translate(toCanvasX(line.value) + 4, margin.top + 14); ctx.fillText(line.label, 0, 0); ctx.restore();
        }
      }
    });
    ctx.restore();
    ctx.setLineDash([]);

    // ── Data points from worksheet (clipped to plot area) ──
    if (showPts) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(margin.left, margin.top, plotW, plotH);
      ctx.clip();
      const pts = this._getDataPoints();
      const mSym = cc.markerSymbol || 'circle';
      const mR = (cc.markerSize ?? 10) / 2;
      const mFill = cc.markerColor || (isDark ? '#fff' : '#222');
      const mStroke = cc.markerStroke || 'rgba(255,255,255,1)';
      const mStrokeW = cc.markerStrokeWidth ?? 2;
      const mDash = canvasDash(cc.markerStrokeDash || 'solid');
      pts.forEach(p => {
        const px = toCanvasX(p.x);
        const py = toCanvasY(p.y);
        drawCanvasMarker(ctx, mSym, px, py, mR);
        ctx.fillStyle = mFill;
        ctx.fill();
        if (mStrokeW > 0) {
          ctx.lineWidth = mStrokeW;
          ctx.strokeStyle = mStroke;
          ctx.setLineDash(mDash);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      ctx.restore();
    }

    // ── Axes frame ──
    ctx.strokeStyle = axisColor; ctx.lineWidth = 1;
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // ── X-axis ticks ──
    if (showXTicks) {
      ctx.font = `${tickSize}px monospace`; ctx.fillStyle = textColor; ctx.textAlign = 'center';
      niceScale(xMin, xMax, 8).forEach(v => {
        const x = toCanvasX(v);
        ctx.beginPath(); ctx.moveTo(x, margin.top + plotH); ctx.lineTo(x, margin.top + plotH + 5); ctx.stroke();
        ctx.fillText(v.toFixed(1), x, margin.top + plotH + 5 + tickSize + 2);
        ctx.save(); ctx.strokeStyle = isDark ? 'rgba(42,54,84,0.4)' : 'rgba(0,0,0,0.08)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + plotH); ctx.stroke(); ctx.restore();
      });
    }

    // ── Y-axis ticks ──
    if (showYTicks) {
      ctx.font = `${tickSize}px monospace`; ctx.fillStyle = textColor; ctx.textAlign = 'right';
      niceScale(yMin, yMax, 8).forEach(v => {
        const y = toCanvasY(v);
        ctx.beginPath(); ctx.moveTo(margin.left - 5, y); ctx.lineTo(margin.left, y); ctx.stroke();
        ctx.fillText(v.toFixed(1), margin.left - 9, y + tickSize * 0.35);
        ctx.save(); ctx.strokeStyle = isDark ? 'rgba(42,54,84,0.4)' : 'rgba(0,0,0,0.08)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + plotW, y); ctx.stroke(); ctx.restore();
      });
    }

    // ── Title ──
    if (showTitle) {
      const titleText = cc.title || `${this._t('title')}: ${this._val('zLabel')}`;
      ctx.fillStyle = labelColor;
      ctx.font = `700 ${titleSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(titleText, margin.left + plotW / 2, titleSize + 8);
    }

    // ── Axis labels ──
    if (showXLabel) {
      ctx.fillStyle = labelColor;
      ctx.font = `${labelSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this._val('xLabel'), margin.left + plotW / 2, H - 8);
    }
    if (showYLabel) {
      ctx.fillStyle = labelColor;
      ctx.font = `${labelSize}px sans-serif`;
      ctx.save();
      ctx.translate(labelSize + 2, margin.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(this._val('yLabel'), 0, 0);
      ctx.restore();
    }

    // Legend
    this._buildLegend(zMinG, zMaxG, nLevels, scheme);

    // Info cards
    const fmt = v => v.toFixed(2);
    this._setRef('infoZmin', fmt(zMinG));
    this._setRef('infoZmax', fmt(zMaxG));
    this._setRef('infoRange', fmt(zMaxG - zMinG));
    this._setRef('infoOpt', fmt(zMaxG));
    this._setRef('infoOptPos', `x=${fmt(optX)}, y=${fmt(optY)}`);
    this._setRef('infoRangeSub', `${nLevels} ${this._t('levels')}`);

    // Tooltip
    this._setupTooltip();

    // Save state (don't rebuild editor — callers that need it call _buildEditor explicitly)
    this._saveState();
  },

  _setRef(ref, text) {
    const el = this._container.querySelector(`[data-ref="${ref}"]`);
    if (el) el.textContent = text;
  },

  _buildLegend(zMin, zMax, n, scheme) {
    const bar = this._container.querySelector('[data-ref="legend"]');
    bar.style.display = '';
    const steps = Math.min(n, 10);
    let html = `<span class="contour__legend-title">${this._t('legend')}</span>`;
    for (let k = 0; k < steps; k++) {
      const t = k / (steps - 1);
      const v = zMin + t * (zMax - zMin);
      const c = getColor(t, scheme);
      html += `<span class="contour__legend-item"><span class="contour__legend-swatch" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span>${v.toFixed(1)}</span>`;
    }
    bar.innerHTML = html;
  },

  // ─── Tooltip ────────────────────────────────────────────────

  _removeTooltipListeners() {
    if (this._tooltipMove) this._canvas?.removeEventListener('mousemove', this._tooltipMove);
    if (this._tooltipLeave) this._canvas?.removeEventListener('mouseleave', this._tooltipLeave);
    this._tooltipMove = null;
    this._tooltipLeave = null;
  },

  _setupTooltip() {
    this._removeTooltipListeners();
    const g = this._lastGrid;
    if (!g) return;
    const { xMin, xMax, yMin, yMax, margin, plotW, plotH, W, H } = g;
    const tip = this._tooltip;
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');

    this._tooltipMove = (e) => {
      const rect = this._canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (W / rect.width);
      const sy = (e.clientY - rect.top) * (H / rect.height);
      const px = sx - margin.left, py = sy - margin.top;
      if (px < 0 || px > plotW || py < 0 || py > plotH) { tip.classList.remove('visible'); return; }
      const x = xMin + px / plotW * (xMax - xMin);
      const y = yMax - py / plotH * (yMax - yMin);
      const z = this._evalModel(x, y);
      tip.innerHTML = `<b>${this._val('xLabel')}:</b> ${x.toFixed(3)}<br><b>${this._val('yLabel')}:</b> ${y.toFixed(3)}<br><b>${this._val('zLabel')}:</b> ${z.toFixed(3)}`;
      const wrapRect = chartWrap.getBoundingClientRect();
      tip.style.left = (e.clientX - wrapRect.left + 14) + 'px';
      tip.style.top = (e.clientY - wrapRect.top - 10) + 'px';
      tip.classList.add('visible');
    };
    this._tooltipLeave = () => tip.classList.remove('visible');

    this._canvas.addEventListener('mousemove', this._tooltipMove);
    this._canvas.addEventListener('mouseleave', this._tooltipLeave);
  },

};
