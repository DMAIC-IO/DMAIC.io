/**
 * D.Mike — createPage (create-page.js)
 * Lazy Alpine overlay factory for full-screen / modal "page" views outside the
 * module system (training, dashboard, settings, …). Mirrors createModule but
 * without the module lifecycle (no Model/persist/getState).
 */

import Alpine from '@alpinejs/csp';
import { cloneTemplate, templateKey } from './dom.js';

/** Module-level router reference injected from app.js after initRouter(). */
let _router = null;

/**
 * Wire the router into createPage so page open/close navigates through it.
 * Called from app.js once after initRouter() returns.
 * @param {import('./router/router.js').Router} router
 */
export function setCreatePageRouter(router) {
  _router = router;
}

/**
 * @param {object} config
 * @param {string}  config.id            kebab-case id → camelCase Alpine name
 * @param {string} [config.template]     DEPRECATED — inline template strings are unsupported under zero-sink CSP; passing this throws
 * @param {string} [config.templateUrl]  template URL → inlined <template data-tpl> key, cloned via cloneTemplate
 * @param {string}  config.container     CSS selector of the mount container
 * @param {string} [config.button]       CSS selector of the header toggle button
 * @param {string} [config.overlay]      overlay:opened coordination key
 * @param {string} [config.bodyClass]    body class toggled with open state
 * @param {string} [config.i18nKey]      i18n namespace for the injected t()
 * @param {(el:HTMLElement, ctx:object)=>any} [config.mount]    imperative mount (once, after template initTree); return value → mountHandle()
 * @param {(el:HTMLElement, ctx:object, handle:any)=>void} [config.unmount]  imperative teardown (in destroy, before destroyTree)
 * @param {(containerEl:HTMLElement, ctx:object)=>void} [config.onShow]  called at end of show()
 * @param {(containerEl:HTMLElement, ctx:object)=>void} [config.onHide]  called at end of hide()
 * @param {(ctx:object, t:Function, page:object)=>object} [config.data]  Alpine data factory (optional for imperative-only pages)
 * @param {Object<string,(ctx:object)=>object>} [config.components]  extra Alpine.data components (name → factory(ctx)) registered before mount
 * @param {boolean} [config.ownsLangReactivity]  if true, skip createPage's destroy+init re-render on language:changed (the page's own Alpine components handle i18n reactivity in place, preserving their reactive state)
 */
export function createPage(config) {
  const alpineName = config.id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  let _mounted = false;
  let _mountHandle = null;
  let _open = false;
  let containerEl = null;
  let buttonEl = null;
  let ctx = null;
  let onKey = null;
  let onOverlay = null;
  let onLang = null;

  const page = {
    id: config.id,
    isOpen: () => _open,
    mountHandle: () => _mountHandle,

    async init(context) {
      ctx = context;
      containerEl = document.querySelector(config.container);
      if (!containerEl) return; // no mount point (test/headless variance)
      buttonEl = config.button ? document.querySelector(config.button) : null;

      const _t = config.i18nKey
        ? context.i18n.tf(config.i18nKey)
        : (k, p) => context.i18n.t(k, p);

      if (config.data) {
        Alpine.data(alpineName, () => ({
          t: _t,
          ...config.data(context, _t, page),
        }));
      }

      // Optional: additional Alpine components this page's template references
      // (beyond the single primary `alpineName`). Registered before mount so
      // _ensureMounted's initTree can hydrate them. Each factory is invoked per
      // Alpine.data call (component instance), receiving the page context.
      if (config.components) {
        for (const [name, factory] of Object.entries(config.components)) {
          Alpine.data(name, () => factory(context));
        }
      }

      if (buttonEl) buttonEl.addEventListener('click', () => {
      if (_router && !_open) {
        _router.navigate({ kind: 'page', projectId: ctx.stateManager.getActiveProjectId(), pageId: config.id });
      } else if (_router && _open) {
        _router.navigateBackFromPage(config.id);
      } else {
        page.toggle();
      }
    });

      onKey = (e) => { if (e.key === 'Escape' && _open) page.hide(); };
      document.addEventListener('keydown', onKey);

      if (config.overlay) {
        onOverlay = (which) => { if (which !== config.overlay && _open) page.hide(); };
        context.eventBus.on('overlay:opened', onOverlay);
      }

      onLang = () => {
        if (!_mounted) return;
        // Only re-render templates that createPage itself rendered. Purely
        // imperative pages (mount-only, no template/templateUrl) own their
        // container DOM and handle i18n reactivity inside their mount handle,
        // so destroy+init here would wrongly tear down their Alpine subtree
        // and reset their state.
        if (!config.template && !config.templateUrl) return;
        // Opt-out for templateUrl pages that own their internal language
        // reactivity (e.g. the Algorithm Lab, whose Alpine components update
        // this.lang + refresh in place). A destroy+init here would reset their
        // reactive state (selected algorithm, active tab) on every language
        // change — undesirable. Such pages keep their Alpine subtree alive and
        // react to language:changed themselves.
        if (config.ownsLangReactivity) return;
        // Re-render to pick up new translations. destroy+init re-runs the
        // Alpine data factory, so this resets page data state by design
        // (e.g. activeTab returns to its default).
        Alpine.destroyTree(containerEl);
        Alpine.initTree(containerEl);
      };
      context.eventBus.on('language:changed', onLang);
    },

    async _ensureMounted() {
      if (_mounted) return;
      if (config.templateUrl) {
        containerEl.replaceChildren(...cloneTemplate(templateKey(config.templateUrl)));
        Alpine.initTree(containerEl);
      } else if (config.template != null) {
        // Inline-string templates are not supported under zero-sink CSP — move
        // the markup into a .html file and pass templateUrl instead.
        throw new Error('create-page: inline config.template unsupported; use templateUrl');
      }
      if (config.mount) {
        _mountHandle = await config.mount(containerEl, ctx);
      }
      _mounted = true;
    },

    async show() {
      if (_open) return;
      await page._ensureMounted();
      _open = true;
      containerEl.style.display = '';
      if (config.bodyClass) document.body.classList.add(config.bodyClass);
      buttonEl?.classList.add('btn--active');
      if (config.overlay) ctx.eventBus.emit('overlay:opened', config.overlay);
      if (config.onShow) config.onShow(containerEl, ctx);
    },

    hide() {
      if (!_open) return;
      _open = false;
      containerEl.style.display = 'none';
      if (config.bodyClass) document.body.classList.remove(config.bodyClass);
      buttonEl?.classList.remove('btn--active');
      if (config.onHide) config.onHide(containerEl, ctx);
      if (ctx) ctx.eventBus.emit('page:closed', { pageId: config.id });
    },

    async toggle() { return _open ? page.hide() : page.show(); },

    destroy() {
      if (onKey) document.removeEventListener('keydown', onKey);
      if (onOverlay && ctx) ctx.eventBus.off('overlay:opened', onOverlay);
      if (onLang && ctx) ctx.eventBus.off('language:changed', onLang);
      if (_mounted) {
        if (config.unmount) config.unmount(containerEl, ctx, _mountHandle);
        if (containerEl) {
          Alpine.destroyTree(containerEl);
          containerEl.replaceChildren();
        }
        _mounted = false;
      }
      _mountHandle = null;
      _open = false;
    },
  };

  return page;
}
