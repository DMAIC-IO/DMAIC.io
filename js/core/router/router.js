/**
 * D.Mike — Central hash Router.
 * Single authority over location.hash. navigate(route) writes the canonical
 * hash and applies the route down the layer chain (kernel → frame/UI →
 * module). applyHash() handles boot + back/forward by parsing the current
 * hash and applying it without re-writing.
 */
import { parseHash, serializeRoute } from './route-path.js';
import { findInstancePhase, createInstance } from './instance-ops.js';
import { setRouteStore } from './route-store.js';

/** @typedef {import('./route-path.js').Route} Route */

export class Router {
  /**
   * @param {{
   *   stateManager: object,
   *   moduleRegistry: object,
   *   eventBus: object,
   *   dmaicTiles: object,
   *   workspace: object,
   *   pages: Map<string, { show(): Promise<void>, hide(): void }>,
   *   Alpine: object,
   *   win?: object,
   * }} deps
   */
  constructor({ stateManager, moduleRegistry, eventBus, dmaicTiles, workspace, pages, Alpine, win = window }) {
    this._sm = stateManager;
    this._reg = moduleRegistry;
    this._bus = eventBus;
    this._tiles = dmaicTiles;
    this._ws = workspace;
    this._pages = pages || new Map();
    this._Alpine = Alpine;
    this._win = win;
    this._applying = false;
    /** @type {Route|null} Most recent applied route whose kind !== 'page'. */
    this._lastNonPageRoute = null;
    /** @type {Route|null} The currently applied route (any kind). */
    this._currentRoute = null;
    /** @type {Map<string, object>|null} Action verb registry (see action-verbs.js). */
    this._verbs = null;
    /** @type {object|null} Shared action modal controller. */
    this._actionModal = null;
    this._notify = null;
    this._i18n = null;
  }

  /**
   * The shared action modal controller (see ui/action-modal.js). Consumers
   * that want to show the same dialog for their own long-running action
   * (rather than a second, independent one) read it from here.
   * @returns {object|null}
   */
  getActionModal() {
    return this._actionModal;
  }

  /**
   * Wire the action verb registry after construction (the verbs need a router
   * reference themselves, so they cannot be built before it exists).
   * @param {Map<string, object>} verbs
   * @param {object} actionModal  action modal controller (open/update/close)
   * @param {function} notify
   * @param {object} i18n
   * @returns {void}
   */
  setActionVerbs(verbs, actionModal, notify, i18n) {
    this._verbs = verbs;
    this._actionModal = actionModal;
    this._notify = notify;
    this._i18n = i18n;
  }

  /** Attach hashchange listener and apply the current hash once. */
  start() {
    this._win.addEventListener('hashchange', () => { this.applyHash(); });
    // When a page is closed via Escape / overlay sibling / any hide() path,
    // revert to the last non-page route — but only if we're still on that page.
    this._bus.on('page:closed', ({ pageId }) => {
      if (this._applying) return; // avoid loops
      if (!this._currentRoute || this._currentRoute.kind !== 'page' || this._currentRoute.pageId !== pageId) return;
      this.navigateBackFromPage(pageId);
    });
    // Mirror scenario-loader progress into the action modal.
    this._bus.on('scenario:progress', ({ index, total, title }) => {
      const name = title?.[this._i18n?.getLanguage?.()] || title?.en || '';
      this._actionModal?.update(
        this._i18n?.t('actions.progressModule', { index, total, name }) ?? `${index}/${total}`,
      );
    });
    return this.applyHash();
  }

  /** Parse the live hash and apply it (no hash write). Used on boot + back/fwd. */
  async applyHash() {
    if (this._applying) return;
    const route = parseHash(this._win.location.hash);
    await this._applyRoute(route);
  }

  /**
   * Navigation entry point: write the canonical hash, then apply.
   * @param {Route} route
   * @param {{ replace?: boolean }} [opts]
   */
  async navigate(route, { replace = false } = {}) {
    if (this._applying) return; // re-entrancy guard (in-app handlers)
    const hash = serializeRoute(route);
    if (replace) {
      this._win.history.replaceState(null, '', hash);
    } else {
      this._win.history.pushState(null, '', hash);
    }
    await this._applyRoute(route);
  }

  /**
   * Internal layer chain: kernel → frame/UI → module.
   * Sets _applying guard to prevent re-entrancy.
   * @param {Route} route
   */
  async _applyRoute(route) {
    this._applying = true;
    try {
      // Track current route and remember last non-page route for revert.
      this._currentRoute = route;
      if (route.kind !== 'page') {
        this._lastNonPageRoute = route;
      }

      // ── kernel: switch project / cycle ──
      // Only when the project actually differs — switchProject() saves, flushes
      // and reloads all state, which fires data-change events. Calling it on
      // same-project navigation (every phase/module/tab change) triggers a
      // redundant project reload + module re-analysis (e.g. duplicate chart
      // renders on tab switches).
      if (route.projectId && route.projectId !== this._sm.getActiveProjectId?.()) {
        await this._sm.switchProject?.(route.projectId);
        this._reg.setActiveCycle?.(this._sm.getProjectCycle?.() ?? undefined);
      }

      setRouteStore(this._Alpine, route);

      // ── frame/UI: page vs phase vs module ──
      switch (route.kind) {
        case 'page': {
          const page = this._pages.get(route.pageId);
          for (const [id, p] of this._pages) {
            if (id !== route.pageId) p.hide?.();
          }
          if (page) await page.show?.();
          break;
        }
        case 'phase': {
          this._hideAllPages();
          // Only re-select when the phase actually changed — selectPhase
          // re-renders the DMAIC tiles (and their menus), a visible flicker.
          if (this._tiles.getActivePhase?.() !== route.phaseId) {
            this._tiles.selectPhase(route.phaseId);
          }
          // Forward to active/first module instance if the phase is non-empty.
          const phaseInstances = this._sm.get(`phases.${route.phaseId}`) ?? [];
          if (phaseInstances.length > 0) {
            // Prefer the workspace's active module if it belongs to this phase.
            const active = this._ws?.getActiveModuleInfo?.();
            const activeInPhase = active &&
              phaseInstances.some(inst => inst.instanceId === active.instanceId);
            const targetId = activeInPhase
              ? active.instanceId
              : phaseInstances[0].instanceId;
            this._applying = false;                  // allow the nested navigate to run
            await this.navigate(
              { kind: 'module', projectId: route.projectId, instanceId: targetId, sub: [] },
              { replace: true },
            );
            
          }
          break;
        }
        case 'module': {
          const phaseId = findInstancePhase(this._sm, route.instanceId);
          if (!phaseId) return; // unknown instance: leave as-is
          this._hideAllPages();
          // Only (re)activate when switching to a DIFFERENT module. If it is
          // already active, only the sub-route changed (e.g. a tab) —
          // setRouteStore() above already updated the store, so the module's
          // onRouteChanged fires. Re-activating would re-select the phase
          // (re-render tiles/menu — visible flicker) and re-emit
          // module:activated (module re-render / re-analysis).
          const active = this._ws?.getActiveModuleInfo?.();
          if (!active || active.instanceId !== route.instanceId) {
            if (this._tiles.getActivePhase?.() !== phaseId) {
              this._tiles.selectPhase(phaseId);
            }
            this._bus.emit('module:activated', { instanceId: route.instanceId });
          }
          break;
        }
        case 'action': {
          // One-shot command: run the verb, then perform EXACTLY ONE
          // navigation to the route it returns. Verbs never navigate
          // themselves (see action-verbs.js).
          const verb = this._verbs?.get(route.verb);
          if (!verb) {
            this._notify?.(
              this._i18n?.t('actions.unknown', { verb: route.verb }) ?? 'Unknown action',
              'error',
            );
            this._applying = false;                // allow the nested navigate to run
            await this.navigate({ kind: 'project', projectId: this._sm.getActiveProjectId() }, { replace: true });
            return;
          }
          let target = null;
          try {
            this._actionModal?.open(verb.describe(route.args));
            target = await verb.run(route.args);
          } catch (err) {
            // A known verb that threw is NOT an unknown action — say so.
            console.warn('[Router] action failed', route.verb, err);
            this._notify?.(
              this._i18n?.t('actions.failed', { verb: route.verb }) ?? 'Action failed',
              'error',
            );
          } finally {
            // Always: a stuck dialog would leave the app unusable.
            this._actionModal?.close();
          }
          this._applying = false;                  // allow the nested navigate to run
          await this.navigate(
            target ?? { kind: 'project', projectId: this._sm.getActiveProjectId() },
            { replace: true },
          );
          return;
        }
        case 'module-new': {
          const def = this._reg.get(route.moduleType);
          if (!def) {
            this._applying = false;                  // allow the nested navigate to run
            await this.navigate({ kind: 'project', projectId: route.projectId }, { replace: true });
            return;
          }
          const newId = createInstance(this._sm, this._reg, this._bus, route.moduleType, def);
          this._applying = false;                    // allow the nested navigate to run
          await this.navigate(
            { kind: 'module', projectId: route.projectId, instanceId: newId, sub: [] },
            { replace: true },
          );
          break;
        }
        default:
          break; // root / project / invalid: no view change
      }
    } finally {
      this._applying = false;
    }
  }

  /**
   * Navigate back from a page overlay to the last non-page route (or active phase).
   * Only routes with kind 'phase' or 'module' guarantee _hideAllPages() is called
   * inside _applyRoute, so we always fall back to a phase route when the stored
   * non-page route has a kind that would not close pages (root/project/invalid).
   * Called when the user closes a page via its toggle button, or via the
   * `page:closed` event (Escape / overlay sibling close).
   * @param {string} _pageId  (unused, kept for symmetry with the event)
   */
  async navigateBackFromPage(_pageId) {
    const phaseFallback = {
      kind: 'phase',
      projectId: this._sm.getActiveProjectId(),
      phaseId: this._tiles.getActivePhase?.() ?? 'define',
    };
    const last = this._lastNonPageRoute;
    const target = (last && (last.kind === 'phase' || last.kind === 'module'))
      ? last
      : phaseFallback;
    await this.navigate(target, { replace: true });
  }

  /** Hide every page overlay. Called before activating a phase or module route. */
  _hideAllPages() {
    for (const [, p] of this._pages) {
      p.hide?.();
    }
  }
}
