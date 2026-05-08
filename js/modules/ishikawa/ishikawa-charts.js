/**
 * Ishikawa 6M — Pareto & Trend chart rendering.
 */

import { CATS, LINE_COLS } from './ishikawa-constants.js';

export const chartsMethods = {
  _renderPareto(t) {
    // Pareto source selector: current state + each snapshot
    const snapOptions = this._snapshots.map(s =>
      `<option value="snap-${s.id}" ${this._paretoSource === 'snap-' + s.id ? 'selected' : ''}>${this._escapeHtml(s.name)}</option>`
    ).join('');

    return `
      <div class="ishikawa__pareto-panel">
        <div class="ishikawa__pareto-header">
          <label class="ishikawa__panel-label">${t('paretoTitle')}</label>
          <select class="ishikawa__pareto-select" data-ref="paretoSelect">
            <option value="current" ${(!this._paretoSource || this._paretoSource === 'current') ? 'selected' : ''}>${t('paretoCurrent')}</option>
            ${snapOptions}
          </select>
        </div>
        <div class="ishikawa__pareto-body">
          <div class="ishikawa__pareto-canvas-wrap" data-ref="paretoContent"></div>
          <div class="ishikawa__pareto-editor" data-ref="paretoEditorPanel">
            <div class="ishikawa__pareto-editor-inner" data-ref="paretoEditorInner"></div>
          </div>
        </div>
      </div>`;
  },

  _getParetoData(source) {
    let rows, experts;
    if (!source || source === 'current') {
      rows = this._rows;
      experts = this._experts;
    } else {
      const snapId = parseInt(source.replace('snap-', ''), 10);
      const snap = this._snapshots.find(s => s.id === snapId);
      if (!snap) return [];
      rows = snap.data.rows || [];
      experts = snap.data.experts || [];
    }

    const scored = [];
    rows.forEach(r => {
      if (!experts.length) return;
      const vals = experts.map(e => r.ratings[e.id]).filter(x => x !== undefined && x !== null && x !== '');
      if (!vals.length) return;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const name = (r.name && r.name.trim()) ? r.name.trim() : r.stableId || '?';
      const cat = r.category || '';
      scored.push({ name, avg, cat });
    });

    scored.sort((a, b) => b.avg - a.avg);
    return scored;
  },

  async _renderParetoChart(t) {
    const container = this._container.querySelector('[data-ref="paretoContent"]');
    if (!container) return;

    // Destroy previous chart instance
    if (this._paretoChart) {
      this._context.chartManager.destroy(this._paretoChart);
      this._paretoChart = null;
    }

    const data = this._getParetoData(this._paretoSource);

    if (!data.length) {
      container.innerHTML = `<div class="ishikawa__trend-empty">${t('paretoNoData')}</div>`;
      return;
    }

    // Map scored data to chart items with category colors
    const items = data.slice(0, 20).map(d => {
      const catObj = CATS.find(c => c.key === d.cat);
      return { name: d.name, value: d.avg, color: catObj ? catObj.color : undefined };
    });

    container.innerHTML = '';

    this._paretoChart = await this._context.chartManager.create(container, 'pareto', {
      items,
      title: t('paretoTitle'),
      yLabel: t('paretoYAxisLabel'),
      rightYLabel: t('paretoCumLabel'),
      showXTicks: false,
      onEditorToggle: (open) => {
        this._paretoEditorOpen = open;
        const panel = this._container.querySelector('[data-ref="paretoEditorPanel"]');
        const body = this._container.querySelector('.ishikawa__pareto-body');
        if (panel) panel.classList.toggle('open', open);
        if (body) body.classList.toggle('ishikawa__pareto-body--editor-open', open);
        if (open) this._buildParetoEditor(t);
        setTimeout(() => { if (this._paretoChart) this._paretoChart.render(); }, 340);
      },
    });
  },

  _buildParetoEditor(t) {
    const inner = this._container?.querySelector('[data-ref="paretoEditorInner"]');
    if (!inner || !this._paretoChart) return;
    inner.innerHTML = '';

    const chart = this._paretoChart;
    const cfg = chart.config;
    const te = (k) => this._context.i18n.t(`chart.editor.${k}`);
    const rerender = () => chart.render();
    const rebuild = () => { this._buildParetoEditor(t); rerender(); };

    // Dynamically import shared editor building blocks
    import('../../core/chart/chart-editor.js').then(({
      edTitleSection, edFontSizeSection, edCheckboxRow, edSection,
      edRangeRow, edSelectRow, edColorPair, openColorPicker,
    }) => {
      const cpOpen = (e, color, cb) => {
        if (this._activeColorPicker) this._activeColorPicker.close();
        this._activeColorPicker = openColorPicker(e, color, cb);
      };

      const DASH_OPTS = [
        { value: 'solid', label: 'Solid' },
        { value: 'dash', label: 'Dash' },
        { value: 'dot', label: 'Dot' },
        { value: 'dashdot', label: 'Dash-Dot' },
        { value: 'longdash', label: 'Long Dash' },
      ];
      const MARKER_OPTS = [
        { value: 'circle', label: '● Circle' },
        { value: 'square', label: '■ Square' },
        { value: 'diamond', label: '◆ Diamond' },
        { value: 'triangle', label: '▲ Triangle' },
        { value: 'triangle-down', label: '▼ Triangle ▼' },
        { value: 'cross', label: '✚ Cross' },
        { value: 'star', label: '★ Star' },
      ];

      // ── Title & fonts
      inner.appendChild(edTitleSection(cfg, rerender, te));
      inner.appendChild(edFontSizeSection(cfg, rerender, te));

      // ── Axes
      const axSec = edSection(t('paretoAxes'));
      axSec.appendChild(edCheckboxRow(te('showYLabel'), cfg.showYLabel !== false, (v) => { cfg.showYLabel = v; rerender(); }));
      axSec.appendChild(edCheckboxRow(te('showYTicks'), cfg.showYTicks !== false, (v) => { cfg.showYTicks = v; rerender(); }));
      inner.appendChild(axSec);

      // ── Bars
      const PATTERN_OPTS = [
        { value: '', label: t('paretoPatNone') },
        { value: '/', label: '/ ' + t('paretoPatDiag') },
        { value: '\\', label: '\\ ' + t('paretoPatDiagR') },
        { value: '-', label: '— ' + t('paretoPatHoriz') },
        { value: '|', label: '| ' + t('paretoPatVert') },
        { value: 'x', label: '× ' + t('paretoPatCross') },
        { value: '+', label: '+ ' + t('paretoPatPlus') },
        { value: '.', label: '· ' + t('paretoPatDots') },
      ];

      const barSec = edSection(t('paretoBars'));
      barSec.appendChild(edRangeRow(t('paretoBarOpacity'), Math.round((cfg.barOpacity ?? 0.75) * 100), (v) => {
        cfg.barOpacity = v / 100;
        rerender();
      }, 10, 100, 5));

      const items = cfg.items || [];
      items.forEach((d, i) => {
        const barItem = document.createElement('div');
        barItem.className = 'dmike-chart-ed-ref-item';
        const header = document.createElement('div');
        header.className = 'dmike-chart-ed-ref-header';

        const colorBar = document.createElement('div');
        colorBar.className = 'dmike-chart-ed-ref-color';
        colorBar.style.background = d.color || 'var(--color-chart-1)';

        const info = document.createElement('div');
        info.className = 'dmike-chart-ed-ref-info';
        const label = d.name.length > 20 ? d.name.substring(0, 18) + '…' : d.name;
        info.innerHTML = `<div class="name">${label}</div><div class="detail">${d.value.toFixed(1)}</div>`;

        header.appendChild(colorBar);
        header.appendChild(info);
        barItem.appendChild(header);

        const detail = document.createElement('div');
        detail.className = 'dmike-chart-ed-inline-editor open';

        const { el: cEl, swatch: cSw } = edColorPair(te('color'), d.color || 'rgba(100,100,100,1)', (ev) => {
          cpOpen(ev, d.color || 'rgba(100,100,100,1)', (c) => {
            d.color = c;
            cSw.style.background = c;
            colorBar.style.background = c;
            rerender();
          });
        });
        detail.appendChild(cEl);
        detail.appendChild(edSelectRow(t('paretoPattern'), PATTERN_OPTS, d.pattern || '', (v) => { d.pattern = v; rerender(); }));

        barItem.appendChild(detail);
        barSec.appendChild(barItem);
      });
      inner.appendChild(barSec);

      // ── Threshold reference line
      const refSec = edSection(t('paretoRefLine'));
      refSec.appendChild(edRangeRow(t('paretoRefValue'), cfg.refLineValue ?? 80, (v) => { cfg.refLineValue = v; rerender(); }, 0, 100, 5));
      refSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.refLineDash || 'dash', (v) => { cfg.refLineDash = v; rerender(); }));
      refSec.appendChild(edRangeRow(t('paretoRefWidth'), cfg.refLineWidth ?? 1, (v) => { cfg.refLineWidth = v; rerender(); }, 0.5, 5, 0.5));
      const { el: refColorEl, swatch: refSw } = edColorPair(te('color'), cfg.refLineColor || '#ef4444', (e) => {
        cpOpen(e, cfg.refLineColor || '#ef4444', (c) => { cfg.refLineColor = c; refSw.style.background = c; rerender(); });
      });
      refSec.appendChild(refColorEl);
      inner.appendChild(refSec);

      // ── Cumulative line
      const lineSec = edSection(t('paretoCumLine'));
      lineSec.appendChild(edSelectRow(te('lineStyle'), DASH_OPTS, cfg.cumDash || 'solid', (v) => { cfg.cumDash = v; rerender(); }));
      lineSec.appendChild(edRangeRow(t('paretoCumWidth'), cfg.cumWidth ?? 2, (v) => { cfg.cumWidth = v; rerender(); }, 0.5, 6, 0.5));
      const { el: cumColorEl, swatch: cumSw } = edColorPair(te('color'), cfg.cumulativeColor || '#ef4444', (e) => {
        cpOpen(e, cfg.cumulativeColor || '#ef4444', (c) => { cfg.cumulativeColor = c; cumSw.style.background = c; rerender(); });
      });
      lineSec.appendChild(cumColorEl);
      inner.appendChild(lineSec);

      // ── Cumulative dots
      const dotSec = edSection(t('paretoCumDots'));
      dotSec.appendChild(edSelectRow(t('paretoDotSymbol'), MARKER_OPTS, cfg.cumDotSymbol || 'circle', (v) => { cfg.cumDotSymbol = v; rerender(); }));
      dotSec.appendChild(edRangeRow(t('paretoDotSize'), cfg.cumDotSize ?? 3.5, (v) => { cfg.cumDotSize = v; rerender(); }, 1, 10, 0.5));
      const { el: dotFillEl, swatch: dotFillSw } = edColorPair(t('paretoDotFill'), cfg.cumDotFill || '#ef4444', (e) => {
        cpOpen(e, cfg.cumDotFill || '#ef4444', (c) => { cfg.cumDotFill = c; dotFillSw.style.background = c; rerender(); });
      });
      dotSec.appendChild(dotFillEl);
      const { el: dotStrokeEl, swatch: dotStrokeSw } = edColorPair(t('paretoDotStroke'), cfg.cumDotStroke || '#ffffff', (e) => {
        cpOpen(e, cfg.cumDotStroke || '#ffffff', (c) => { cfg.cumDotStroke = c; dotStrokeSw.style.background = c; rerender(); });
      });
      dotSec.appendChild(dotStrokeEl);
      dotSec.appendChild(edRangeRow(t('paretoDotStrokeWidth'), cfg.cumDotStrokeWidth ?? 1.5, (v) => { cfg.cumDotStrokeWidth = v; rerender(); }, 0, 5, 0.5));
      inner.appendChild(dotSec);
    });
  },

  _renderTrendChart(t) {
    const container = this._container.querySelector('[data-ref="trendContent"]');
    if (!container) return;

    const timeline = [...this._snapshots].reverse();
    const currentState = {
      name: t('trendCurrent'),
      date: new Date().toISOString(),
      data: { problem: this._problem, experts: JSON.parse(JSON.stringify(this._experts)), rows: JSON.parse(JSON.stringify(this._rows)) },
    };
    const trendStates = [...timeline.map(s => ({ name: s.name, date: s.date, data: s.data })), currentState];

    if (trendStates.length < 2) {
      container.innerHTML = `<div class="ishikawa__trend-empty">${t('trendMinSnaps')}</div>`;
      return;
    }

    const allIds = new Set();
    trendStates.forEach(s => (s.data.rows || []).forEach(r => { if (r.stableId) allIds.add(r.stableId); }));

    const trendSeries = [];
    allIds.forEach(sid => {
      let hypoName = '';
      for (let i = trendStates.length - 1; i >= 0; i--) {
        const r = (trendStates[i].data.rows || []).find(rr => rr.stableId === sid);
        if (r && r.name && r.name.trim()) { hypoName = r.name.trim(); break; }
      }
      if (!hypoName) hypoName = sid;
      const points = [];
      trendStates.forEach((st, xi) => {
        const r = (st.data.rows || []).find(rr => rr.stableId === sid);
        if (r) {
          const sc = this._calcScoreFor(r, st.data.experts || []);
          if (sc !== null) points.push({ x: xi, y: sc });
        }
      });
      if (points.length > 0) trendSeries.push({ sid, hypoName, points });
    });

    if (!trendSeries.length) {
      container.innerHTML = `<div class="ishikawa__trend-empty">${t('trendNoData')}</div>`;
      return;
    }

    const cw = Math.max(600, container.clientWidth || 800);
    const ch = 340;
    const pad = { top: 30, right: 30, bottom: 55, left: 45 };
    const pw = cw - pad.left - pad.right;
    const ph = ch - pad.top - pad.bottom;
    const xCount = trendStates.length;

    container.innerHTML = `
      <div class="ishikawa__trend-canvas-wrap">
        <canvas data-ref="trendCanvas" width="${cw}" height="${ch}"></canvas>
        <div class="ishikawa__trend-tooltip" data-ref="trendTooltip"></div>
      </div>
      <div class="ishikawa__trend-legend" data-ref="trendLegend"></div>`;

    const canvas = container.querySelector('[data-ref="trendCanvas"]');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.scale(dpr, dpr);

    const xPos = (i) => pad.left + (i / (xCount - 1)) * pw;
    const yPos = (v) => pad.top + (1 - v / 9) * ph;

    // Background
    ctx.fillStyle = 'var(--color-bg-secondary)';
    ctx.fillRect(0, 0, cw, ch);
    // Fallback: clear
    ctx.clearRect(0, 0, cw, ch);

    // Grid
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(128,128,128,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 9; i++) {
      const y = yPos(i);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cw - pad.right, y); ctx.stroke();
      ctx.fillText(i, pad.left - 8, y);
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    trendStates.forEach((st, i) => {
      const x = xPos(i);
      ctx.strokeStyle = 'rgba(128,128,128,0.15)';
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.stroke();
      ctx.fillStyle = 'rgba(128,128,128,0.5)';
      ctx.font = '10px monospace';
      const d = new Date(st.date);
      ctx.fillText(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), x, pad.top + ph + 6);
      const nm = st.name.length > 14 ? st.name.substring(0, 12) + '…' : st.name;
      ctx.fillText(nm, x, pad.top + ph + 20);
    });

    // Lines
    const lineSegments = [];
    trendSeries.forEach((s, si) => {
      if (this._hiddenLines.has(s.sid)) return;
      const col = LINE_COLS[si % LINE_COLS.length];
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const pixelPoints = [];
      s.points.forEach((p, pi) => {
        const x = xPos(p.x), y = yPos(p.y);
        pixelPoints.push({ x, y, val: p.y });
        if (pi === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      lineSegments.push({ sid: s.sid, hypoName: s.hypoName, col, pixelPoints });

      // Dots
      s.points.forEach(p => {
        const x = xPos(p.x), y = yPos(p.y);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.y.toFixed(1), x, y - 7);
      });
    });

    // Hover tooltip
    const tooltip = container.querySelector('[data-ref="trendTooltip"]');
    canvas.onmousemove = (ev) => {
      const r = canvas.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let closest = null, minDist = 20;
      lineSegments.forEach(seg => {
        seg.pixelPoints.forEach(pt => {
          const d = Math.sqrt((pt.x - mx) ** 2 + (pt.y - my) ** 2);
          if (d < minDist) { minDist = d; closest = { name: seg.hypoName, col: seg.col, val: pt.val, px: pt.x, py: pt.y }; }
        });
      });
      if (closest) {
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<span style="color:${closest.col}">●</span> ${this._escapeHtml(closest.name)} <b>${closest.val.toFixed(1)}</b>`;
        let tx = closest.px + 12, ty = closest.py - 30;
        if (tx + 150 > cw) tx = closest.px - 160;
        if (ty < 0) ty = closest.py + 12;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
      } else {
        tooltip.style.display = 'none';
      }
    };
    canvas.onmouseleave = () => { tooltip.style.display = 'none'; };

    // Legend
    const legend = container.querySelector('[data-ref="trendLegend"]');
    legend.innerHTML = trendSeries.map((s, si) => {
      const col = LINE_COLS[si % LINE_COLS.length];
      const dim = this._hiddenLines.has(s.sid) ? 'ishikawa__trend-legend-item--dimmed' : '';
      const lbl = s.hypoName.length > 35 ? s.hypoName.substring(0, 33) + '…' : s.hypoName;
      return `<div class="ishikawa__trend-legend-item ${dim}" data-trend-toggle="${s.sid}" title="${this._escapeAttr(s.hypoName)}">
        <div class="ishikawa__trend-legend-dot" style="background:${col}"></div>${this._escapeHtml(lbl)}</div>`;
    }).join('');

    legend.querySelectorAll('[data-trend-toggle]').forEach(item => {
      item.addEventListener('click', () => {
        const sid = item.dataset.trendToggle;
        if (this._hiddenLines.has(sid)) this._hiddenLines.delete(sid); else this._hiddenLines.add(sid);
        this._renderTrendChart(t);
      });
    });
  },
};
