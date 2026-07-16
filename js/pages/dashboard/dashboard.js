/**
 * D.Mike — Dashboard page (dashboard.js)
 * Thin host: owns the DashboardGrid, the add-tile menu, layout/title
 * persistence, PNG/SVG export, and the BUILT-IN tiles (goals, ZEG timeline,
 * org chart, VoC/CTx, RACI, SPC). Module-owned tiles (fmea/ishikawa/
 * project-charter) are rendered by each module's dashboardTile.render,
 * dispatched here via enumerateTiles.
 */

import { createPage } from '../../core/create-page.js';
import { h, svg, s } from '../../core/dom.js';
import { DashboardGrid } from '../../ui/dashboard-grid.js';
import { DEFAULT_DASHBOARD_LAYOUT } from '../../ui/dashboard-tiles.js';
import { enumerateTiles } from './enumerate-tiles.js';
import { getChartType, evaluateNelsonRules, computeCapability, DEFAULT_ENABLED_RULES } from '../../engines/control-chart-engine.js';
import { getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { getPhaseIds } from '../../core/cycles/cycles.js';

const TILE_MODULE_IDS = ['fmea', 'ishikawa', 'project-charter'];

const page = createPage({
  id: 'dashboard',
  templateUrl: new URL('js/pages/dashboard/dashboard.html', document.baseURI).href,
  container: '#dashboard-area',
  button: '#dashboard-btn',
  overlay: 'dashboard',
  bodyClass: 'dashboard-area-open',
  i18nKey: 'dashboard',

  data(ctx, t) {
    return {
      title: () => t('title'),
      projectName: () => ctx.stateManager.get('projectMeta.name') || '',
      addLabel: () => `+ ${  t('addTile')}`,
    };
  },

  mount(containerEl, ctx) {
    const { eventBus, stateManager, i18n, chartManager, themeManager, moduleRegistry } = ctx;
    const gridAnchor = containerEl.querySelector('[data-ref="grid"]');

    const handle = { grid: null, chart: null, addMenuEl: null, _onDocClick: null, _unsubs: [], render: null, _renderGen: 0 };

    const allPhaseKeys = () => Object.keys(stateManager.get('phases') || {});
    const methodPhaseKeys = () => getPhaseIds(stateManager.getProjectCycle());
    const theme = () => themeManager?.getTheme?.() ?? 'light';

    let descriptors = [];
    const descriptorFor = (tileId) => descriptors.find(d => d.id === tileId);

    // ── Scanners for host-owned dynamic built-in tiles (RACI, SPC) ──────────
    // (fmea/ishikawa/charter are module-owned and enumerated by enumerateTiles.)
    const _findVocState = () => {
      const phases = stateManager.get('phases') || {};
      for (const phase of allPhaseKeys()) {
        for (const inst of (phases[phase] || [])) {
          if (inst.moduleId === 'voc-ctx-tree') return stateManager.getModuleState(inst.instanceId);
        }
      }
      return null;
    };

    const _findCharterState = () => {
      const phases = stateManager.get('phases') || {};
      for (const phase of allPhaseKeys()) {
        for (const inst of (phases[phase] || [])) {
          if (inst.moduleId === 'project-charter') return stateManager.getModuleState(inst.instanceId);
        }
      }
      return null;
    };

    const _findAllRaciInstances = () => {
      const phases = stateManager.get('phases') || {};
      const result = [];
      for (const phase of allPhaseKeys()) {
        for (const inst of (phases[phase] || [])) {
          if (inst.moduleId === 'raci-matrix') {
            result.push({ instanceId: inst.instanceId, phase, label: inst.customName || i18n.t('modules.raci-matrix.name') });
          }
        }
      }
      return result;
    };

    const _findAllSpcInstances = () => {
      const phases = stateManager.get('phases') || {};
      const result = [];
      for (const phase of allPhaseKeys()) {
        for (const inst of (phases[phase] || [])) {
          if (inst.moduleId === 'control-chart') {
            result.push({ instanceId: inst.instanceId, phase, label: inst.customName || i18n.t('modules.control-chart.name') });
          }
        }
      }
      return result;
    };

    const _buildRaciTileDefs = () => {
      const customTitles = stateManager.get('dashboard.titles') || {};
      return _findAllRaciInstances().map(inst => {
        const id = `raci:${inst.instanceId}`;
        return {
          id, instanceId: inst.instanceId, i18nTitle: '',
          title: customTitles[id] || `RACI — ${inst.label}`,
          defaultW: 3, defaultH: 10, minW: 2, minH: 6,
          builtin: true, module: null,
        };
      });
    };

    const _buildSpcTileDefs = () => {
      const customTitles = stateManager.get('dashboard.titles') || {};
      return _findAllSpcInstances().map(inst => {
        const id = `spc:${inst.instanceId}`;
        return {
          id, instanceId: inst.instanceId, i18nTitle: '',
          title: customTitles[id] || `SPC — ${inst.label}`,
          defaultW: 3, defaultH: 10, minW: 2, minH: 6,
          builtin: true, module: null,
        };
      });
    };

    // ── BUILT-IN tile renderers (ported 1:1, innerHTML → h()/svg()) ────

    const _zegColor = (zeg) => {
      if (zeg >= 100) return 'var(--color-success)';
      if (zeg >= 75)  return 'var(--color-info)';
      if (zeg >= 25)  return 'var(--color-warning)';
      return 'var(--color-error)';
    };

    const renderGoals = () => {
      const body = handle.grid?.getTileBody('project-goals');
      if (!body) return;
      const state = _findCharterState();
      const goals = (state && state.goals) || [];
      if (goals.length === 0) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.charterNoGoals')));
        return;
      }
      const ol = h('ol', { class: 'dashboard-charter__goals' });
      goals.forEach((g, i) => {
        const zeg = Math.max(0, Math.min(100, g.achievementLevel ?? 0));
        const color = _zegColor(zeg);
        const desc = g.description || i18n.t('dashboard.charterGoalUnnamed', { n: i + 1 });
        ol.append(
          h('li', { class: 'dashboard-charter__goal' },
            h('div', { class: 'dashboard-charter__goal-head' },
              h('span', { class: 'dashboard-charter__goal-desc' }, desc),
              h('span', { class: 'dashboard-charter__goal-zeg', style: `color:${color}` }, `${zeg}%`),
            ),
            h('div', { class: 'dashboard-charter__goal-bar' },
              h('div', { class: 'dashboard-charter__goal-bar-fill', style: `width:${zeg}%; background:${color}` }),
            ),
          ),
        );
      });
      body.replaceChildren(ol);
    };

    // ── ZEG timeline chart ───────────────────────────────────────────────
    const _resolvePhaseColor = (phase) => {
      const css = getComputedStyle(document.documentElement)
        .getPropertyValue(`--color-phase-${phase}`).trim();
      return css || '#888';
    };

    const _buildSeries = () => {
      const histories = {};
      let hasAny = false;
      const methodPhases = methodPhaseKeys();
      for (const phase of methodPhases) {
        const hist = stateManager.get(`phaseAchievementHistory.${phase}`) || [];
        histories[phase] = hist;
        if (hist.length) hasAny = true;
      }
      if (!hasAny) return { series: [], empty: true };

      const series = methodPhases.map(phase => {
        const hist = histories[phase];
        const color = _resolvePhaseColor(phase);
        return {
          name: i18n.t(`phases.${phase}`),
          x: hist.map(e => e.t),
          y: hist.map(e => e.v),
          color,
          markerSize: hist.length === 1 ? 5 : 3,
          connectLine: { show: true, foreground: true, width: 2, color, dash: 'solid' },
          visible: hist.length > 0,
        };
      });
      return { series, empty: series.every(ser => ser.x.length === 0) };
    };

    const renderChart = async () => {
      const body = handle.grid?.getTileBody('zeg-timeline');
      if (!body) return;
      if (handle.chart) { chartManager.destroy(handle.chart); handle.chart = null; }

      const { series, empty } = _buildSeries();
      if (empty) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.noHistory')));
        return;
      }
      const plotEl = h('div', { class: 'dashboard-area__plot', 'data-ref': 'plot' });
      body.replaceChildren(plotEl);

      const dateFmt = (ts) => {
        const d = new Date(ts);
        return d.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', {
          day: '2-digit', month: '2-digit', year: '2-digit',
        });
      };

      // Capture the render generation + the grid this chart belongs to. If a
      // newer render() supersedes us (or rebuilds the grid) while create()
      // awaits, drop the result so a stale chart never inserts into a fresh grid.
      const gen = handle._renderGen;
      const gridAtStart = handle.grid;
      const chart = await chartManager.create(plotEl, 'scatter', {
        title: '',
        xLabel: i18n.t('dashboard.xLabel'),
        yLabel: i18n.t('dashboard.yLabel'),
        showLegend: true,
        series,
        yMin: 0,
        yMax: 100,
        xTickFormat: dateFmt,
      });
      if (handle._renderGen !== gen || handle.grid !== gridAtStart) {
        chartManager.destroy(chart);
        return;
      }
      handle.chart = chart;
    };

    // ── Org chart (SVG) ──────────────────────────────────────────────────
    const ORG_NW = 220, ORG_NH = 64, ORG_HG = 44, ORG_VG = 28;

    const _orgSubtreeWidth = (nodes, id) => {
      const children = nodes.filter(n => n.pid === id);
      if (!children.length) return ORG_NW;
      let w = 0;
      children.forEach((c, i) => {
        w += _orgSubtreeWidth(nodes, c.id);
        if (i < children.length - 1) w += ORG_HG;
      });
      return Math.max(ORG_NW, w);
    };

    const _orgLayout = (nodes, id, x, y, out) => {
      out[id] = { x, y };
      const children = nodes.filter(n => n.pid === id);
      if (!children.length) return;
      const cy = y + ORG_NH + ORG_VG;
      const ws = children.map(c => _orgSubtreeWidth(nodes, c.id));
      let total = 0;
      ws.forEach((w, i) => { total += w; if (i < ws.length - 1) total += ORG_HG; });
      let cx = x + ORG_NW / 2 - total / 2;
      children.forEach((c, i) => {
        _orgLayout(nodes, c.id, cx + ws[i] / 2 - ORG_NW / 2, cy, out);
        cx += ws[i] + ORG_HG;
      });
    };

    const renderOrgChart = () => {
      const body = handle.grid?.getTileBody('org-chart');
      if (!body) return;
      const state = _findCharterState();
      const nodes = (state && Array.isArray(state.orgChart)) ? state.orgChart : [];
      if (!nodes.length) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.orgChartEmpty')));
        return;
      }

      const positions = {};
      const roots = nodes.filter(n => n.pid == null);
      let ox = 0;
      roots.forEach(r => {
        const w = _orgSubtreeWidth(nodes, r.id);
        _orgLayout(nodes, r.id, ox + w / 2 - ORG_NW / 2, 0, positions);
        ox += w + ORG_HG * 2;
      });

      let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
      Object.values(positions).forEach(p => {
        xMin = Math.min(xMin, p.x);
        yMin = Math.min(yMin, p.y);
        xMax = Math.max(xMax, p.x + ORG_NW);
        yMax = Math.max(yMax, p.y + ORG_NH);
      });
      const PAD = 8;
      const vbW = (xMax - xMin) + PAD * 2;
      const vbH = (yMax - yMin) + PAD * 2;
      const ox0 = PAD - xMin;
      const oy0 = PAD - yMin;

      const edges = nodes
        .filter(n => n.pid != null && positions[n.id] && positions[n.pid])
        .map(n => {
          const p = positions[n.pid];
          const c = positions[n.id];
          const x1 = p.x + ORG_NW / 2 + ox0;
          const y1 = p.y + ORG_NH + oy0;
          const x2 = c.x + ORG_NW / 2 + ox0;
          const y2 = c.y + oy0;
          const mid = y1 + (y2 - y1) / 2;
          return svg('path', { d: `M${x1} ${y1}C${x1} ${mid},${x2} ${mid},${x2} ${y2}` });
        });

      const rects = nodes.map(n => {
        const p = positions[n.id];
        if (!p) return null;
        const x = p.x + ox0;
        const y = p.y + oy0;
        const rectStyle = n.bg ? s({ fill: n.bg }) : null;
        const dash = n.borderStyle === 'dashed' ? '6 4'
                   : n.borderStyle === 'dotted' ? '2 3' : null;
        const desc = n.desc || '';
        const descShort = desc.length > 38 ? `${desc.slice(0, 36)  }…` : desc;
        return svg('g', { class: 'dashboard-org__node', transform: `translate(${x},${y})` },
          svg('rect', {
            class: 'dashboard-org__node-rect', width: ORG_NW, height: ORG_NH,
            rx: 6, ry: 6, style: rectStyle,
            stroke: n.borderColor || null,
            'stroke-width': n.borderWidth ? (Number(n.borderWidth) || 1) : null,
            'stroke-dasharray': dash,
          }),
          svg('text', { class: 'dashboard-org__node-title', x: ORG_NW / 2, y: 22, 'text-anchor': 'middle' }, n.title || ''),
          desc ? svg('text', { class: 'dashboard-org__node-desc', x: ORG_NW / 2, y: 42, 'text-anchor': 'middle' }, descShort) : null,
        );
      });

      const orgSvg = svg('svg', {
        class: 'dashboard-org__svg', viewBox: `0 0 ${vbW} ${vbH}`,
        preserveAspectRatio: 'xMidYMid meet',
      },
        svg('g', { class: 'dashboard-org__edges' }, edges),
        svg('g', { class: 'dashboard-org__nodes' }, rects),
      );
      body.replaceChildren(h('div', { class: 'dashboard-area__org' }, orgSvg));
    };

    // ── VoC → CTx tree ───────────────────────────────────────────────────
    const renderVoc = () => {
      const body = handle.grid?.getTileBody('voc-ctx-tree');
      if (!body) return;
      const state = _findVocState();
      const vocs = (state && Array.isArray(state.vocs)) ? state.vocs : [];

      if (vocs.length === 0) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.vocEmpty')));
        return;
      }

      let needs = 0, ctq = 0, ctd = 0, ctc = 0, reqs = 0;
      for (const voc of vocs) {
        for (const need of (voc.needs || [])) {
          needs++;
          for (const drv of (need.drivers || [])) {
            if (drv.type === 'ctq') ctq++;
            else if (drv.type === 'ctd') ctd++;
            else if (drv.type === 'ctc') ctc++;
            reqs += (drv.requirements || []).length;
          }
        }
      }
      const drivers = ctq + ctd + ctc;

      const summary = h('div', { class: 'dashboard-voc__summary' },
        h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(vocs.length)), ' VoC'),
        h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(needs)), ` ${  i18n.t('dashboard.vocNeeds')}`),
        h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(drivers)), ` ${  i18n.t('dashboard.vocDrivers')}`),
        h('span', { class: 'dashboard-voc__stat' }, h('strong', null, String(reqs)), ` ${  i18n.t('dashboard.vocReqs')}`),
      );

      const children = [summary];

      if (drivers > 0) {
        const bar = h('div', { class: 'dashboard-voc__driver-bar' });
        if (ctq > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctq};background:var(--color-voc-ctq, rgba(39,174,96,1))`, title: `CTQ: ${ctq}` }));
        if (ctd > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctd};background:var(--color-voc-ctd, rgba(41,128,185,1))`, title: `CTD: ${ctd}` }));
        if (ctc > 0) bar.append(h('div', { class: 'dashboard-voc__bar-seg', style: `flex:${ctc};background:var(--color-voc-ctc, rgba(231,76,139,1))`, title: `CTC: ${ctc}` }));
        children.push(bar);

        const legend = h('div', { class: 'dashboard-voc__driver-legend' });
        if (ctq > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctq, rgba(39,174,96,1))' }), `CTQ: ${ctq}`));
        if (ctd > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctd, rgba(41,128,185,1))' }), `CTD: ${ctd}`));
        if (ctc > 0) legend.append(h('span', { class: 'dashboard-voc__legend-item' }, h('span', { class: 'dashboard-fmea__legend-dot', style: 'background:var(--color-voc-ctc, rgba(231,76,139,1))' }), `CTC: ${ctc}`));
        children.push(legend);
      }

      children.push(h('div', { class: 'dashboard-voc__list-label' }, i18n.t('dashboard.vocStatements')));

      const list = h('ul', { class: 'dashboard-voc__list' });
      vocs.slice(0, 6).forEach(v => {
        const li = h('li', { class: 'dashboard-voc__item' }, `„${v.text || '—'}“`);
        if (v.source) {
          li.append(' ', h('span', { class: 'dashboard-area__muted' }, `(${v.source})`));
        }
        list.append(li);
      });
      if (vocs.length > 6) {
        list.append(h('li', { class: 'dashboard-voc__item dashboard-area__muted' }, `… +${vocs.length - 6}`));
      }
      children.push(list);

      body.replaceChildren(...children);
    };

    // ── RACI tile ────────────────────────────────────────────────────────
    const renderRaci = (tileId) => {
      const body = handle.grid?.getTileBody(tileId);
      if (!body) return;
      const instanceId = tileId.replace('raci:', '');
      const state = stateManager.getModuleState(instanceId);
      const activities = (state && Array.isArray(state.activities)) ? state.activities : [];
      const stakeholders = (state && Array.isArray(state.stakeholders)) ? state.stakeholders : [];
      const assignments = (state && state.assignments) || {};

      if (activities.length === 0 && stakeholders.length === 0) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.raciEmpty')));
        return;
      }

      const counts = { R: 0, A: 0, C: 0, I: 0 };
      const totalCells = activities.length * stakeholders.length;
      let filled = 0;
      for (const val of Object.values(assignments)) {
        if (val && Object.hasOwn(counts, val)) { counts[val]++; filled++; }
      }
      const coverage = totalCells > 0 ? Math.round(filled / totalCells * 100) : 0;

      const roleColors = {
        R: 'var(--color-error)',
        A: 'var(--color-warning)',
        C: 'var(--color-accent)',
        I: 'var(--color-success)',
      };

      const children = [];
      children.push(
        h('div', { class: 'dashboard-raci__summary' },
          h('span', null, `${i18n.t('dashboard.raciActivities')  }: `, h('strong', null, String(activities.length))),
          h('span', null, `${i18n.t('dashboard.raciStakeholders')  }: `, h('strong', null, String(stakeholders.length))),
          h('span', null, `${i18n.t('dashboard.raciCoverage')  }: `, h('strong', null, `${coverage}%`)),
        ),
      );

      if (filled > 0) {
        const bar = h('div', { class: 'dashboard-raci__bar' });
        ['R', 'A', 'C', 'I'].forEach(role => {
          const pct = counts[role] / filled * 100;
          if (pct === 0) return;
          bar.append(h('div', { class: 'dashboard-raci__bar-seg', style: `width:${pct}%;background:${roleColors[role]}`, title: `${role}: ${counts[role]}` }));
        });
        children.push(bar);
      }

      const legend = h('div', { class: 'dashboard-raci__legend' });
      ['R', 'A', 'C', 'I'].filter(r => counts[r] > 0).forEach(role => {
        legend.append(h('span', { class: 'dashboard-raci__legend-item' },
          h('span', { class: 'dashboard-fmea__legend-dot', style: `background:${roleColors[role]}` }),
          `${role}: ${counts[role]}`,
        ));
      });
      children.push(legend);

      const warnings = [];
      activities.forEach((act, aIdx) => {
        let hasR = false, hasA = false;
        stakeholders.forEach((_, sIdx) => {
          const v = assignments[`${aIdx}:${sIdx}`];
          if (v === 'R') hasR = true;
          if (v === 'A') hasA = true;
        });
        if (!hasR) warnings.push({ act, missing: 'R' });
        if (!hasA) warnings.push({ act, missing: 'A' });
      });

      if (warnings.length > 0) {
        children.push(h('div', { class: 'dashboard-raci__warn-label' }, i18n.t('dashboard.raciWarnings')));
        const ul = h('ul', { class: 'dashboard-raci__warn-list' });
        warnings.slice(0, 5).forEach(w => {
          ul.append(h('li', { class: 'dashboard-raci__warn-item' },
            h('span', { class: 'dashboard-raci__warn-role', style: `color:${roleColors[w.missing]}` }, w.missing),
            ` ${  i18n.t('dashboard.raciMissing')  }: ${  w.act}`,
          ));
        });
        if (warnings.length > 5) {
          ul.append(h('li', { class: 'dashboard-area__muted' }, `… +${warnings.length - 5}`));
        }
        children.push(ul);
      }

      body.replaceChildren(...children);
    };

    // ── SPC tile ─────────────────────────────────────────────────────────
    const buildSpcSparkline = (scData, violationSet, usl, lsl, width) => {
      const W = width || 320, H = 160, PAD_X = 2, PAD_Y = 6;
      const pts = scData.values.filter(v => v !== null);
      if (pts.length < 2) return null;

      const extents = [scData.lcl, scData.ucl, ...pts];
      if (usl != null) extents.push(usl);
      if (lsl != null) extents.push(lsl);
      const yMin = Math.min(...extents) - scData.sigma * 0.3;
      const yMax = Math.max(...extents) + scData.sigma * 0.3;
      const yRange = yMax - yMin || 1;

      const sx = (i) => PAD_X + (i / (scData.values.length - 1)) * (W - 2 * PAD_X);
      const sy = (v) => PAD_Y + (1 - (v - yMin) / yRange) * (H - 2 * PAD_Y);

      const uclY = sy(scData.ucl), lclY = sy(scData.lcl), clY = sy(scData.cl);
      const kids = [
        svg('rect', { x: PAD_X, y: uclY, width: W - 2 * PAD_X, height: lclY - uclY,
          fill: 'var(--color-success)', opacity: 0.06, rx: 2 }),
        svg('line', { x1: PAD_X, y1: uclY, x2: W - PAD_X, y2: uclY,
          stroke: 'var(--color-error)', 'stroke-width': 0.8, 'stroke-dasharray': '4,3', opacity: 0.6 }),
        svg('line', { x1: PAD_X, y1: lclY, x2: W - PAD_X, y2: lclY,
          stroke: 'var(--color-error)', 'stroke-width': 0.8, 'stroke-dasharray': '4,3', opacity: 0.6 }),
        svg('line', { x1: PAD_X, y1: clY, x2: W - PAD_X, y2: clY,
          stroke: 'var(--color-accent)', 'stroke-width': 0.8, opacity: 0.5 }),
      ];

      if (usl != null) {
        const uslY = sy(usl);
        kids.push(svg('line', { x1: PAD_X, y1: uslY, x2: W - PAD_X, y2: uslY,
          stroke: 'var(--color-warning)', 'stroke-width': 1, opacity: 0.7 }));
      }
      if (lsl != null) {
        const lslY = sy(lsl);
        kids.push(svg('line', { x1: PAD_X, y1: lslY, x2: W - PAD_X, y2: lslY,
          stroke: 'var(--color-warning)', 'stroke-width': 1, opacity: 0.7 }));
      }

      const polyPts = [];
      for (let i = 0; i < scData.values.length; i++) {
        if (scData.values[i] === null) continue;
        polyPts.push(`${sx(i).toFixed(1)},${sy(scData.values[i]).toFixed(1)}`);
      }
      kids.push(svg('polyline', { points: polyPts.join(' '), fill: 'none',
        stroke: 'var(--color-text-secondary)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));

      for (let i = 0; i < scData.values.length; i++) {
        if (scData.values[i] === null) continue;
        const v = scData.values[i];
        const isNelson = violationSet.has(i);
        const isOos = (usl != null && v > usl) || (lsl != null && v < lsl);
        if (!isNelson && !isOos) continue;
        const color = isNelson ? 'var(--color-error)' : 'var(--color-warning)';
        kids.push(svg('circle', { cx: sx(i).toFixed(1), cy: sy(v).toFixed(1), r: 2.5, fill: color }));
      }

      return svg('svg', { class: 'dashboard-spc__sparkline', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, kids);
    };

    const renderSpc = (tileId) => {
      const body = handle.grid?.getTileBody(tileId);
      if (!body) return;
      const instanceId = tileId.replace('spc:', '');
      const state = stateManager.getModuleState(instanceId);

      if (!state || !state.columnRef) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.spcEmpty')));
        return;
      }

      const ct = getChartType(state.chartTypeId || 'i-mr');
      if (!ct) return;

      const rawValues = getColumnValues(stateManager, state.columnRef);
      const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));

      if (values.length < 2) {
        body.replaceChildren(h('p', { class: 'dashboard-area__empty' }, i18n.t('dashboard.spcNoData')));
        return;
      }

      const n = state.subgroupSize || 1;
      const baselineEnd = state.baselineCount || values.length;
      const result = ct.compute(values, n, baselineEnd);

      const primaryId = ct.subcharts[0].id;
      const primaryData = result.subcharts[primaryId];
      const enabledRules = state.enabledRules || [...DEFAULT_ENABLED_RULES];
      const violations = evaluateNelsonRules(
        primaryData.values, primaryData.cl, primaryData.sigma, enabledRules,
      );
      const capability = computeCapability(
        primaryData.values.filter(v => v !== null),
        primaryData.cl, primaryData.sigma,
        state.usl ?? null, state.lsl ?? null,
      );

      const vCount = new Set(violations.map(v => v.index)).size;
      const totalPts = primaryData.values.filter(v => v !== null).length;
      const isStable = vCount === 0;
      const colName = getColumnName(stateManager, state.columnRef) || '?';
      const fmt = (v) => v != null ? v.toFixed(4) : '—';

      const usl = state.usl ?? null;
      const lsl = state.lsl ?? null;
      const hasSpec = usl != null || lsl != null;

      let oosCount = 0;
      if (hasSpec) {
        for (const v of primaryData.values) {
          if (v === null) continue;
          if ((usl != null && v > usl) || (lsl != null && v < lsl)) oosCount++;
        }
      }

      const chartTypeLabel = {
        'i-mr': 'I-MR', 'xbar-r': 'X̄-R', 'xbar-s': 'X̄-S',
      }[ct.id] || ct.id;

      const sparkWidth = body.clientWidth - 16;
      const violationSet = new Set(violations.map(v => v.index));
      const sparkSvg = buildSpcSparkline(primaryData, violationSet, usl, lsl, sparkWidth);

      const stat = (label, value) => h('div', { class: 'dashboard-spc__stat' },
        h('span', { class: 'dashboard-spc__stat-label' }, label),
        h('span', { class: 'dashboard-spc__stat-value' }, value),
      );

      const metrics = h('div', { class: 'dashboard-spc__metrics' });
      metrics.append(
        h('div', { class: `dashboard-spc__metric ${isStable ? 'dashboard-spc__metric--ok' : 'dashboard-spc__metric--bad'}` },
          h('span', { class: 'dashboard-spc__metric-value' }, String(vCount)),
          h('span', { class: 'dashboard-spc__metric-label' }, i18n.t('dashboard.spcViolations')),
          h('span', { class: 'dashboard-spc__metric-sub' }, i18n.t('dashboard.spcOf', { total: totalPts })),
        ),
      );

      if (hasSpec) {
        const oosCls = oosCount === 0 ? '--ok' : '--warn';
        metrics.append(
          h('div', { class: `dashboard-spc__metric dashboard-spc__metric${oosCls}` },
            h('span', { class: 'dashboard-spc__metric-value' }, String(oosCount)),
            h('span', { class: 'dashboard-spc__metric-label' }, i18n.t('dashboard.spcOutOfSpec')),
            h('span', { class: 'dashboard-spc__metric-sub' }, i18n.t('dashboard.spcOf', { total: totalPts })),
          ),
        );
      }

      if (capability) {
        const cpkCls = capability.cpk >= 1.33 ? '--ok' : capability.cpk >= 1.0 ? '--warn' : '--bad';
        metrics.append(
          h('div', { class: `dashboard-spc__metric dashboard-spc__metric${cpkCls}` },
            h('span', { class: 'dashboard-spc__metric-value' }, capability.cpk.toFixed(3)),
            h('span', { class: 'dashboard-spc__metric-label' }, 'Cpk'),
            capability.cp ? h('span', { class: 'dashboard-spc__metric-sub' }, `Cp = ${capability.cp.toFixed(3)}`) : null,
          ),
        );
      }

      const spark = h('div', { class: 'dashboard-spc__spark' });
      if (sparkSvg) spark.append(sparkSvg);

      body.replaceChildren(
        h('div', { class: 'dashboard-spc' },
          h('div', { class: 'dashboard-spc__header' },
            h('span', { class: 'dashboard-spc__type' }, chartTypeLabel),
            h('span', { class: 'dashboard-spc__col' }, colName),
          ),
          spark,
          h('div', { class: 'dashboard-spc__stats' },
            stat('CL', fmt(primaryData.cl)),
            stat('UCL', fmt(primaryData.ucl)),
            stat('LCL', fmt(primaryData.lcl)),
            stat('σ̂', fmt(primaryData.sigma)),
          ),
          metrics,
        ),
      );
    };

    // ── Module-owned tile dispatch ───────────────────────────────────────
    const renderModuleTile = (descriptor) => {
      const body = handle.grid?.getTileBody(descriptor.id);
      if (!body || !descriptor.module?.dashboardTile) return;
      const state = descriptor.instanceId ? stateManager.getModuleState(descriptor.instanceId) : null;
      descriptor.module.dashboardTile.render(body, {
        tileId: descriptor.id, instanceId: descriptor.instanceId,
        state, i18n, theme: theme(), chartManager,
      });
    };

    // The project-charter tile is module-owned (renders via the charter
    // module's dashboardTile), but it ALSO exists as a static built-in in
    // DASHBOARD_TILES — so when no charter instance exists the descriptor is
    // builtin/module-less. Always dispatch its render to the loaded charter
    // module export so the empty state (charterEmpty) still renders.
    const renderCharter = () => {
      const body = handle.grid?.getTileBody('project-charter');
      const dt = handle._charterModule?.dashboardTile;
      if (!body || !dt) return;
      dt.render(body, { tileId: 'project-charter', state: _findCharterState(), i18n, theme: theme(), chartManager });
    };

    const renderTile = async (tileId) => {
      if (tileId === 'project-charter') { renderCharter(); return; }
      const d = descriptorFor(tileId);
      if (d && !d.builtin) { renderModuleTile(d); return; }
      if (tileId === 'zeg-timeline') await renderChart();
      else if (tileId === 'project-goals') renderGoals();
      else if (tileId === 'org-chart') renderOrgChart();
      else if (tileId === 'voc-ctx-tree') renderVoc();
      else if (tileId.startsWith('raci:')) renderRaci(tileId);
      else if (tileId.startsWith('spc:')) renderSpc(tileId);
    };

    // ── Tile-def assembly + de-dup ───────────────────────────────────────
    const buildTileDefs = () => {
      // De-dup: a module may own a tile id that also appears as a static
      // built-in (project-charter). Module-owned wins; drop the built-in twin.
      const seen = new Map();
      for (const d of descriptors) {
        const prev = seen.get(d.id);
        if (!prev) { seen.set(d.id, d); continue; }
        seen.set(d.id, prev.builtin ? d : prev);
      }
      descriptors = [...seen.values()];
      return descriptors.map(d => ({
        id: d.id, i18nTitle: d.i18nTitle,
        title: d.title || (d.i18nTitle ? i18n.t(d.i18nTitle) : d.id),
        defaultW: d.defaultW, defaultH: d.defaultH, minW: d.minW, minH: d.minH,
        removeLabel: i18n.t('dashboard.removeTile'),
        moveTitle: i18n.t('dashboard.moveTile'),
        resizeTitle: i18n.t('dashboard.resizeTile'),
      }));
    };

    // ── Layout persistence ───────────────────────────────────────────────
    const loadLayout = () => {
      const saved = stateManager.get('dashboard.layout');
      return (Array.isArray(saved) ? saved : DEFAULT_DASHBOARD_LAYOUT).map(x => ({ ...x }));
    };
    const saveLayout = () => { if (handle.grid) stateManager.set('dashboard.layout', handle.grid.getLayout()); };

    // ── Add-menu popover ─────────────────────────────────────────────────
    const closeAddMenu = () => {
      if (!handle.addMenuEl) return;
      handle.addMenuEl.remove();
      handle.addMenuEl = null;
      if (handle._onDocClick) {
        document.removeEventListener('click', handle._onDocClick, true);
        handle._onDocClick = null;
      }
    };

    const openAddMenu = (toolbar) => {
      closeAddMenu();
      const placed = new Set(handle.grid.getPlacedTileIds());
      const allDefs = buildTileDefs();
      const available = allDefs.filter(t => !placed.has(t.id));

      const menu = h('div', { class: 'dashboard-area__add-menu' });
      if (available.length === 0) {
        menu.append(h('div', { class: 'dashboard-area__add-menu-empty' }, i18n.t('dashboard.addTileEmpty')));
      } else {
        available.forEach(t => {
          const item = h('button', {
            type: 'button',
            class: 'dashboard-area__add-menu-item',
            'data-tile-id': t.id,
          }, t.title || i18n.t(t.i18nTitle));
          item.addEventListener('click', () => {
            const def = allDefs.find(x => x.id === t.id);
            if (def && handle.grid.addTile(def)) renderTile(t.id);
            closeAddMenu();
          });
          menu.append(item);
        });
      }
      toolbar.appendChild(menu);
      handle.addMenuEl = menu;

      handle._onDocClick = (e) => {
        if (!handle.addMenuEl) return;
        if (!handle.addMenuEl.contains(e.target) && !e.target.closest('[data-ref="add-btn"]')) {
          closeAddMenu();
        }
      };
      setTimeout(() => {
        if (handle._onDocClick) document.addEventListener('click', handle._onDocClick, true);
      }, 0);
    };

    // ── Toolbar wiring ───────────────────────────────────────────────────
    const wireToolbar = () => {
      const addBtn = containerEl.querySelector('[data-ref="add-btn"]');
      const toolbar = containerEl.querySelector('.dashboard-area__toolbar');
      addBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handle.addMenuEl) closeAddMenu();
        else openAddMenu(toolbar);
      });
      const slug = (stateManager.get('projectMeta.name') || 'dashboard').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_');
      containerEl.querySelector('[data-ref="export-png-btn"]')?.addEventListener('click', () => handle.grid?.exportAllAsPng(`${slug}.png`));
      containerEl.querySelector('[data-ref="export-svg-btn"]')?.addEventListener('click', () => handle.grid?.exportAllAsSvg(`${slug}.svg`));
    };

    // ── Full render ──────────────────────────────────────────────────────
    const render = async () => {
      // Render-generation guard: render() is invoked un-awaited from several
      // event handlers and awaits between tearing down and rebuilding shared
      // handle.grid/handle.chart refs. Bump the generation and bail at every
      // await point if a newer render has superseded this one (prevents a stale
      // async chart from leaking into a freshly-built grid).
      const gen = ++handle._renderGen;

      if (handle.chart) { chartManager.destroy(handle.chart); handle.chart = null; }
      if (handle.grid) { handle.grid.destroy(); handle.grid = null; }
      closeAddMenu();

      // Preload module-owned tile modules, enumerate via adapter registry.
      const loadedExports = (await Promise.all(
        TILE_MODULE_IDS.map(id => moduleRegistry.loadExport(id)),
      )).filter(Boolean);
      if (handle._renderGen !== gen) return;
      const tileRegistry = {
        getAll: () => loadedExports,
        get: (id) => loadedExports.find(m => m && m.id === id) || null,
      };
      handle._charterModule = tileRegistry.get('project-charter');
      descriptors = [
        ...enumerateTiles(tileRegistry, ctx),
        ..._buildRaciTileDefs(),
        ..._buildSpcTileDefs(),
      ];

      handle.grid = new DashboardGrid(gridAnchor, { cols: 12, rowHeight: 40, gap: 12 });
      handle.grid.onLayoutChange = () => {
        saveLayout();
        for (const item of handle.grid.getLayout()) {
          if (item.tileId.startsWith('spc:')) renderSpc(item.tileId);
        }
      };
      handle.grid.onTileRemoved = (tileId) => {
        if (tileId === 'zeg-timeline' && handle.chart) {
          chartManager.destroy(handle.chart); handle.chart = null;
        }
        const d = descriptorFor(tileId);
        if (d && !d.builtin) d.module?.dashboardTile?.dispose?.(handle.grid?.getTileBody(tileId) ?? gridAnchor, { tileId });
      };
      handle.grid.onTitleChanged = (tileId, newTitle) => {
        const titles = stateManager.get('dashboard.titles') || {};
        titles[tileId] = newTitle;
        stateManager.set('dashboard.titles', titles);
      };

      const tileDefs = buildTileDefs();
      const layout = loadLayout().filter(l => tileDefs.some(d => d.id === l.tileId));
      handle.grid.setTiles(tileDefs, layout);

      for (const item of handle.grid.getLayout()) {
        await renderTile(item.tileId);
        if (handle._renderGen !== gen) return;
      }

      wireToolbar();
    };

    handle.render = render;

    // ── Live-update subscriptions ────────────────────────────────────────
    const sub = (ev, cb) => { eventBus.on(ev, cb); handle._unsubs.push(() => eventBus.off(ev, cb)); };

    sub('phase:achievement-changed', () => { if (page.isOpen()) renderChart(); });
    sub('state:saved', () => {
      if (!page.isOpen() || !handle.grid) return;
      // Mirror the legacy state:saved handler: re-render data tiles but leave
      // the ZEG timeline to phase:achievement-changed (avoids chart churn).
      for (const item of handle.grid.getLayout()) {
        if (item.tileId === 'zeg-timeline') continue;
        renderTile(item.tileId);
      }
    });
    sub('project:renamed', ({ name }) => {
      if (!page.isOpen()) return;
      const el = containerEl.querySelector('[data-ref="project-name"]');
      if (el) el.textContent = name;
    });
    // Intentional dual handling: createPage's own onLang re-translates the
    // header template (Alpine x-text via destroy/initTree on containerEl), while
    // this sub rebuilds the imperative grid (different DOM, untouched by Alpine).
    // The grid is rebuilt exactly once — here — so there is no redundancy.
    sub('language:changed', () => { if (page.isOpen()) render(); });
    sub('project:loaded', () => { if (page.isOpen()) render(); });
    sub('project:imported', () => { if (page.isOpen()) render(); });
    sub('theme:changed', () => { if (page.isOpen()) render(); });

    return handle;
  },

  onShow(_containerEl, _ctx) {
    const handle = page.mountHandle();
    if (handle?.render) handle.render();
  },

  onHide(_containerEl, _ctx) {
    const handle = page.mountHandle();
    if (handle?.addMenuEl) {
      handle.addMenuEl.remove();
      handle.addMenuEl = null;
      if (handle._onDocClick) {
        document.removeEventListener('click', handle._onDocClick, true);
        handle._onDocClick = null;
      }
    }
  },

  unmount(containerEl, ctx, handle) {
    if (!handle) return;
    if (handle.chart) { ctx.chartManager.destroy(handle.chart); handle.chart = null; }
    if (handle.grid) { handle.grid.destroy(); handle.grid = null; }
    if (handle.addMenuEl) { handle.addMenuEl.remove(); handle.addMenuEl = null; }
    if (handle._onDocClick) { document.removeEventListener('click', handle._onDocClick, true); handle._onDocClick = null; }
    handle._unsubs.forEach(off => off());
    handle._unsubs = [];
  },
});

export default page;
