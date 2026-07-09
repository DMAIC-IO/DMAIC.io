/**
 * D.Mike — createDialog (create-dialog.js)
 * Lazy Alpine-CSP factory for shared-Modal FORM dialogs (confirm/cancel → result).
 * Sibling of createModule / createPage, sharing their template mechanics
 * (clone an inlined ./<id>.html template, register Alpine.data(camelName), initTree) but
 * targeting ui/modal.js form() instead of a phase tile or full-screen page.
 *
 * The mounted node lives in a hidden frame host (#app-dialogs). modal.form()
 * borrows the node into the overlay and restores it to that host on close, so
 * the Alpine reactive scope survives across opens.
 *
 * Form dialogs only — live-apply panels (Settings) stay on createPage.
 */

import Alpine from '@alpinejs/csp';
import { cloneTemplate, templateKey } from './dom.js';

/**
 * @param {object} config
 * @param {string}  config.id        kebab-case id → camelCase Alpine name + ./<id>.html
 * @param {string}  config.i18nKey   i18n namespace for the injected t()
 * @param {string} [config.titleKey] key (relative to i18nKey) for the default modal title
 * @param {Function} config.Model    Model class — instance exposed as this.model; needs apply(init), result(), validate()
 * @param {object}  config.ctx       { i18n, eventBus } (kernel services the dialog needs)
 * @param {(t:Function, dialog:object)=>object} [config.data]  extra reactive view helpers
 * @returns {{ id:string, open:(modal:object, init:object, opts?:object)=>Promise<any|null> }}
 */
export function createDialog(config) {
  const { id, i18nKey, titleKey = 'title', Model, ctx, data } = config;
  const alpineName = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  // Use an absolute-path key that is stable whether running unbundled or from app.min.js.
  // The inlined <template data-tpl="..."> key is always "js/dialogs/<id>/<id>.html".
  const templateUrl = new URL(`js/dialogs/${  id  }/${  id  }.html`, document.baseURI).href;

  const t = ctx.i18n.tf(i18nKey);

  let _node = null;          // the mounted [x-data] root inside the host
  let _host = null;
  let _registered = false;

  function host() {
    if (!_host) _host = document.getElementById('app-dialogs');
    return _host;
  }

  function register() {
    if (_registered) return;
    Alpine.data(alpineName, () => ({
      t,
      model: new Model(),
      ...(data ? data(t, dialog) : {}),
    }));
    _registered = true;
  }

  async function ensureMounted() {
    if (_node && _node.isConnected) return;
    register();
    const frag = cloneTemplate(templateKey(templateUrl));
    const root = frag.find(n => n.nodeType === 1 && n.hasAttribute('x-data')) || frag[0];
    host().append(...frag);
    Alpine.initTree(root);
    _node = root;
  }

  // language:changed → destroy + rebuild so t(...) re-resolves on next open.
  ctx.eventBus.on('language:changed', () => {
    if (!_node) return;
    Alpine.destroyTree(_node);
    _node.remove();
    _node = null; // next open re-clones the template + re-inits with fresh t()
  });

  const dialog = {
    id,

    /**
     * Eagerly mount the dialog node (clone + Alpine init) ahead of the first
     * open. cloneTemplate is synchronous; the only async-ish work is
     * Alpine.initTree. Callers that need a synchronous-feeling open (e.g. opened
     * mid event chain that a test/POM observes right after) should prewarm at
     * init time so open() has no first-time Alpine init latency.
     * @returns {Promise<void>}
     */
    async prewarm() { await ensureMounted(); },

    /**
     * @param {object} modal  ui/modal.js Modal instance
     * @param {object} init    per-open data fed to model.apply(init)
     * @param {object} [opts]  { title, confirmLabel, cancelLabel, onConfirm }
     * @returns {Promise<any|null>}  model.result() on confirm, null on cancel
     */
    async open(modal, init, opts = {}) {
      await ensureMounted();
      const node = _node;
      const cmp = Alpine.$data(node);
      cmp.model.apply(init);

      const title = opts.title ?? t(titleKey);
      let resolvedResult = null;

      const onConfirm = (body) => {
        if (opts.onConfirm) return opts.onConfirm(body, cmp.model);
        if (typeof cmp.model.validate === 'function' && cmp.model.validate() === false) return false;
        resolvedResult = cmp.model.result();
      };

      const confirmed = await modal.form(title, node, {
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        onConfirm,
      });

      if (!confirmed) return null;
      // When the caller owns onConfirm it reads the model itself; still return result().
      return opts.onConfirm ? cmp.model.result() : resolvedResult;
    },
  };

  return dialog;
}
