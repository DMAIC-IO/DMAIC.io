/**
 * D.Mike — Dashboard page (dashboard.js)
 * Thin host: owns the DashboardGrid, the add-tile menu, layout/title
 * persistence, PNG/SVG export, and the BUILT-IN tiles (goals, ZEG timeline,
 * org chart). Module-owned tiles (incl. VoC/CTx, RACI, SPC) come from each
 * module's tile file (manifest `loadTile`), loaded and enumerated via
 * enumerate-tiles.js. Contract: docs/DASHBOARD.md.
 */

import { createPage } from '../../core/create-page.js';
import { h, svg, s } from '../../core/dom.js';
import { DashboardGrid } from '../../ui/dashboard-grid.js';
import { DEFAULT_DASHBOARD_LAYOUT } from '../../ui/dashboard-tiles.js';
import { enumerateTiles, loadTileModules, refreshEventsOf } from './enumerate-tiles.js';
import { renderTileSafely } from './tile-render.js';
import { schemaOf, resolveSettings, toStored, withTileSettings, settingsToStoreOnLayoutSave, layoutToStoreOnSave } from './tile-settings.js';
import { buildSettingsForm } from './tile-settings-form.js';
import { getPhaseIds } from '../../core/cycles/cycles.js';

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
    const { eventBus, stateManager, i18n, chartManager, themeManager, moduleRegistry, modal } = ctx;
    const gridAnchor = containerEl.querySelector('[data-ref="grid"]');

    const handle = { grid: null, chart: null, addMenuEl: null, _onDocClick: null, _unsubs: [], render: null, _renderGen: 0, _toolbarWired: false, _charterTile: null, _allTilesLoaded: false, _refreshUnsubs: [], _lastLayout: [] };

    const allPhaseKeys = () => Object.keys(stateManager.get('phases') || {});
    const methodPhaseKeys = () => getPhaseIds(stateManager.getProjectCycle());
    const theme = () => themeManager?.getTheme?.() ?? 'light';

    let descriptors = [];
    const descriptorFor = (tileId) => descriptors.find(d => d.id === tileId);

    // ── Charter state scanner (the charter tile also renders without an instance) ──
    const _findCharterState = () => {
      const phases = stateManager.get('phases') || {};
      for (const phase of allPhaseKeys()) {
        for (const inst of (phases[phase] || [])) {
          if (inst.moduleId === 'project-charter') return stateManager.getModuleState(inst.instanceId);
        }
      }
      return null;
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

    // ── Module-owned tile dispatch ───────────────────────────────────────
    /** Resolved settings of a tile: stored overrides over schema defaults. */
    const settingsFor = (tileId, tile) =>
      resolveSettings(schemaOf(tile), (stateManager.get('dashboard.tileSettings') || {})[tileId]);

    const renderModuleTile = async (descriptor) => {
      const body = handle.grid?.getTileBody(descriptor.id);
      if (!body || !descriptor.tile) return;
      const state = descriptor.instanceId ? stateManager.getModuleState(descriptor.instanceId) : null;
      await renderTileSafely(descriptor.tile, body, {
        tileId: descriptor.id, instanceId: descriptor.instanceId, state,
        settings: settingsFor(descriptor.id, descriptor.tile),
        i18n, theme: theme(), chartManager, stateManager,
      }, i18n);
    };

    // The charter tile file is always loaded (ALWAYS_LOADED_TILES), but the
    // tile also exists as a static built-in in DASHBOARD_TILES — without a
    // charter instance its descriptor is the built-in twin. Always render
    // through the charter tile file so the empty state (charterEmpty) shows.
    const renderCharter = async () => {
      const body = handle.grid?.getTileBody('project-charter');
      const tile = handle._charterTile;
      if (!body || !tile) return;
      await renderTileSafely(tile, body, {
        tileId: 'project-charter', instanceId: null, state: _findCharterState(),
        settings: settingsFor('project-charter', tile), i18n, theme: theme(), chartManager, stateManager,
      }, i18n);
    };

    const renderTile = async (tileId) => {
      if (tileId === 'project-charter') { await renderCharter(); return; }
      const d = descriptorFor(tileId);
      if (d && !d.builtin) { await renderModuleTile(d); return; }
      if (tileId === 'zeg-timeline') await renderChart();
      else if (tileId === 'project-goals') renderGoals();
      else if (tileId === 'org-chart') renderOrgChart();
    };

    // ── Tile settings dialog ─────────────────────────────────────────────
    const openTileSettings = async (tileId) => {
      const d = descriptorFor(tileId);
      if (!d?.tile || !modal) return;
      const schema = schemaOf(d.tile);
      if (Object.keys(schema).length === 0) return;
      const stored = (stateManager.get('dashboard.tileSettings') || {})[tileId];
      const form = buildSettingsForm(schema, resolveSettings(schema, stored), i18n);
      const tileTitle = (stateManager.get('dashboard.titles') || {})[tileId] || d.title;
      const confirmed = await modal.form(i18n.t('dashboard.tileSettings.title', { title: tileTitle }), form.el);
      if (confirmed !== true) return;
      const latest = stateManager.get('dashboard.tileSettings') || {};
      stateManager.set('dashboard.tileSettings',
        withTileSettings(latest, tileId, toStored(schema, form.read(), latest[tileId])));
      const body = handle.grid?.getTileBody(tileId);
      if (body) {
        try {
          d.tile.dispose?.(body, { tileId });
        } catch (err) {
          console.error(`[dashboard] tile "${tileId}" failed to dispose`, err);
        }
      }
      await renderTile(tileId);
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
        hasSettings: !!d.tile && Object.keys(schemaOf(d.tile)).length > 0,
        settingsLabel: i18n.t('dashboard.tileSettings.open'),
      }));
    };

    // ── Layout persistence ───────────────────────────────────────────────
    const loadLayout = () => {
      const saved = stateManager.get('dashboard.layout');
      return (Array.isArray(saved) ? saved : DEFAULT_DASHBOARD_LAYOUT).map(x => ({ ...x }));
    };
    // Stored tile settings whose tile no longer enumerates (instance deleted)
    // are pruned here — but only when every tile file loaded in this render,
    // so a transient chunk error never deletes settings. Likewise the layout
    // entries of tiles that are unknown due to a load error are kept.
    const saveLayout = () => {
      if (!handle.grid) return;
      const ids = descriptors.map(d => d.id);
      stateManager.set('dashboard.layout', layoutToStoreOnSave(
        handle.grid.getLayout(), stateManager.get('dashboard.layout'), ids, handle._allTilesLoaded));
      const pruned = settingsToStoreOnLayoutSave(
        stateManager.get('dashboard.tileSettings'), ids, handle._allTilesLoaded);
      if (pruned) stateManager.set('dashboard.tileSettings', pruned);
    };

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
    // The header (add / export buttons) is rendered once by createPage and
    // persists across every render() rebuild of the grid. Wire its listeners
    // exactly once — re-wiring on each render() would stack duplicate click
    // handlers on the same button, so the add-button would toggle the menu
    // open then immediately shut again ("Kachel hinzufügen" without effect).
    // Handlers read handle.grid / projectMeta lazily so they stay current.
    const wireToolbar = () => {
      if (handle._toolbarWired) return;
      handle._toolbarWired = true;
      const addBtn = containerEl.querySelector('[data-ref="add-btn"]');
      const toolbar = containerEl.querySelector('.dashboard-area__toolbar');
      addBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handle.addMenuEl) closeAddMenu();
        else openAddMenu(toolbar);
      });
      const slug = () => (stateManager.get('projectMeta.name') || 'dashboard').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_');
      containerEl.querySelector('[data-ref="export-png-btn"]')?.addEventListener('click', () => handle.grid?.exportAllAsPng(`${slug()}.png`));
      containerEl.querySelector('[data-ref="export-svg-btn"]')?.addEventListener('click', () => handle.grid?.exportAllAsSvg(`${slug()}.svg`));
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

      // Load the tile files of the modules used in this project.
      const { tileModules, allLoaded } = await loadTileModules(moduleRegistry, stateManager.get('phases'));
      if (handle._renderGen !== gen) return;
      handle._allTilesLoaded = allLoaded;
      handle._charterTile = tileModules.find(m => m.moduleId === 'project-charter')?.tile ?? null;
      descriptors = [
        ...enumerateTiles(tileModules, ctx),
      ];

      // Refresh subscriptions (contract field `refreshOn`), rebuilt on every
      // full render so language/theme re-renders never stack handlers.
      // state:saved and resize are handled by the shared handlers below.
      handle._refreshUnsubs.forEach(off => off());
      handle._refreshUnsubs = [];
      const byEvent = new Map();
      for (const d of descriptors) {
        if (!d.tile) continue;
        for (const ev of refreshEventsOf(d.tile)) {
          if (ev === 'state:saved' || ev === 'resize') continue;
          if (!byEvent.has(ev)) byEvent.set(ev, []);
          byEvent.get(ev).push(d.id);
        }
      }
      for (const [ev, ids] of byEvent) {
        const cb = () => {
          if (!page.isOpen() || !handle.grid) return;
          const placed = new Set(handle.grid.getPlacedTileIds());
          ids.filter(id => placed.has(id)).forEach(id => renderTile(id));
        };
        eventBus.on(ev, cb);
        handle._refreshUnsubs.push(() => eventBus.off(ev, cb));
      }

      handle.grid = new DashboardGrid(gridAnchor, { cols: 12, rowHeight: 40, gap: 12 });
      handle.grid.onLayoutChange = (layout) => {
        saveLayout();
        const prev = new Map((handle._lastLayout || []).map(l => [l.tileId, l]));
        handle._lastLayout = layout.map(x => ({ ...x }));
        for (const item of layout) {
          const before = prev.get(item.tileId);
          // A tile without a previous entry was just added (addTile renders it): not a resize.
          const resized = !!before && (before.w !== item.w || before.h !== item.h);
          const d = descriptorFor(item.tileId);
          if (d?.tile && resized && refreshEventsOf(d.tile).includes('resize')) renderTile(item.tileId);
        }
      };
      handle.grid.onTileRemoved = (tileId) => {
        if (tileId === 'zeg-timeline' && handle.chart) {
          chartManager.destroy(handle.chart); handle.chart = null;
        }
        const d = descriptorFor(tileId);
        if (d && !d.builtin) {
          try {
            d.tile?.dispose?.(handle.grid?.getTileBody(tileId) ?? gridAnchor, { tileId });
          } catch (err) {
            console.error(`[dashboard] tile "${tileId}" failed to dispose`, err);
          }
        }
        const allSettings = stateManager.get('dashboard.tileSettings') || {};
        if (Object.hasOwn(allSettings, tileId)) {
          stateManager.set('dashboard.tileSettings', withTileSettings(allSettings, tileId, {}));
        }
      };
      handle.grid.onSettingsRequested = (tileId) => { openTileSettings(tileId); };
      handle.grid.onTitleChanged = (tileId, newTitle) => {
        const titles = stateManager.get('dashboard.titles') || {};
        titles[tileId] = newTitle;
        stateManager.set('dashboard.titles', titles);
      };

      const tileDefs = buildTileDefs();
      const layout = loadLayout().filter(l => tileDefs.some(d => d.id === l.tileId));
      handle.grid.setTiles(tileDefs, layout);
      handle._lastLayout = handle.grid.getLayout().map(x => ({ ...x }));

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
      // Module/host tiles re-render only if they opt into state:saved.
      for (const item of handle.grid.getLayout()) {
        if (item.tileId === 'zeg-timeline') continue;
        const d = descriptorFor(item.tileId);
        if (d?.tile && !refreshEventsOf(d.tile).includes('state:saved')) continue;
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
    // Invalidate a render still awaiting loadTileModules so it cannot
    // subscribe refresh handlers or rebuild the grid after unmount.
    handle._renderGen++;
    if (handle.chart) { ctx.chartManager.destroy(handle.chart); handle.chart = null; }
    if (handle.grid) { handle.grid.destroy(); handle.grid = null; }
    if (handle.addMenuEl) { handle.addMenuEl.remove(); handle.addMenuEl = null; }
    if (handle._onDocClick) { document.removeEventListener('click', handle._onDocClick, true); handle._onDocClick = null; }
    handle._unsubs.forEach(off => off());
    handle._unsubs = [];
    handle._refreshUnsubs.forEach(off => off());
    handle._refreshUnsubs = [];
  },
});

export default page;
