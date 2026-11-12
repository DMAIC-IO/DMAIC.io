/**
 * D.Mike — Direktiven der asynchronen Abläufe (async-task-directives.js)
 *
 * `<div x-async-task="name">` bindet einen Task aus `asyncTasks` des Moduls
 * und trägt während des Laufs `aria-busy="true"` und `data-async-task-running`. Die
 * Kinder holen sich den Task vom nächsten Behälter darüber:
 * `x-async-task-start` (`<button>`, feste Argumente aus `data-arg-*`),
 * `x-async-task-cancel` (`<button>`, nur im Lauf sichtbar),
 * `x-async-task-progress` (`<progress>`, ohne Wert unbestimmt),
 * `x-async-task-error` (Meldung des letzten Fehlers).
 */
import { readFixedArgs, setHelpKey } from './command-directives.js';

const registered = new WeakSet();

/**
 * Der Griff des Moduls am Element (beim Aufbau gelesen); wirft ohne.
 * @param {any} Alpine @param {Element} el @param {string} directive
 * @returns {{ host: any, ui: any, data: any }}
 */
function hostOf(Alpine, el, directive) {
  const data = Alpine.$data(el);
  const host = data?._asyncTaskHost;
  if (!host) throw new Error(`${directive} needs a module with asyncTasks`);
  return { host, ui: data._ui, data };
}

/**
 * Name des nächsten Behälters über einem Kind; wirft ohne.
 * @param {Element} el @param {string} directive @returns {string}
 */
function taskOf(el, directive) {
  const box = el.closest('[x-async-task]');
  if (!box) throw new Error(`${directive} needs an enclosing x-async-task`);
  return String(box.getAttribute('x-async-task')).trim();
}

/** @param {Element} el @param {string} tag @param {string} directive */
function requireTag(el, tag, directive) {
  if (el.tagName !== tag.toUpperCase()) throw new Error(`${directive} must sit on a <${tag}>, got <${el.tagName.toLowerCase()}>`);
}

/**
 * Status eines Tasks; nach dem Abbau des Moduls ein Ruhezustand.
 * @param {any} data @param {string} name @returns {{ running: boolean, progress: number|null, error: string|null }}
 */
function statusOf(data, name) {
  return data._asyncTasks?.[name] ?? { running: false, progress: null, error: null };
}

/**
 * Die Direktiven registrieren; je Alpine-Instanz einmal wirksam.
 * @param {any} Alpine @param {{ i18n: any }} deps @returns {void}
 */
export function registerAsyncTaskDirectives(Alpine, { i18n }) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);

  Alpine.directive('async-task', (el, { expression }, { effect }) => {
    const name = String(expression).trim();
    const { host, data } = hostOf(Alpine, el, 'x-async-task');
    host.params(name);
    effect(() => {
      if (statusOf(data, name).running) { el.setAttribute('aria-busy', 'true'); el.setAttribute('data-async-task-running', ''); }
      else { el.removeAttribute('aria-busy'); el.removeAttribute('data-async-task-running'); }
    });
  });

  Alpine.directive('async-task-start', (el, _dir, { effect, cleanup }) => {
    requireTag(el, 'button', 'x-async-task-start');
    const name = taskOf(el, 'x-async-task-start');
    const { host, ui, data } = hostOf(Alpine, el, 'x-async-task-start');
    if (host.isAuto(name)) throw new Error(`x-async-task-start: ${name} is an auto task`);
    const params = host.params(name);
    readFixedArgs(el, params);
    setHelpKey(el, `modules.${ui.moduleId}.asyncTasks.${name}.help`);
    let titled = false;
    effect(() => {
      const running = statusOf(data, name).running;
      const reason = data._asyncTaskHost ? data._asyncTaskHost.blockedReason(name) : null;
      el.disabled = running || reason !== null;
      if (reason !== null) { el.title = reason; titled = true; }
      else if (titled) { el.removeAttribute('title'); titled = false; }
    });
    const onClick = async () => {
      const live = data._asyncTaskHost;
      if (!live) return;
      const out = await live.start(name, readFixedArgs(el, params, data.model));
      if (out.status === 'rejected') ui.notify(i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
    };
    el.addEventListener('click', onClick);
    cleanup(() => el.removeEventListener('click', onClick));
  });

  Alpine.directive('async-task-cancel', (el, _dir, { effect, cleanup }) => {
    requireTag(el, 'button', 'x-async-task-cancel');
    const name = taskOf(el, 'x-async-task-cancel');
    const { host, ui, data } = hostOf(Alpine, el, 'x-async-task-cancel');
    host.params(name);
    setHelpKey(el, `modules.${ui.moduleId}.asyncTasks.${name}.cancel.help`);
    effect(() => { el.hidden = !statusOf(data, name).running; });
    const onClick = () => data._asyncTaskHost?.cancel(name);
    el.addEventListener('click', onClick);
    cleanup(() => el.removeEventListener('click', onClick));
  });

  Alpine.directive('async-task-progress', (el, _dir, { effect }) => {
    requireTag(el, 'progress', 'x-async-task-progress');
    const name = taskOf(el, 'x-async-task-progress');
    const { host, data } = hostOf(Alpine, el, 'x-async-task-progress');
    host.params(name);
    const bar = /** @type {HTMLProgressElement} */ (el);
    bar.max = 1;
    effect(() => {
      const st = statusOf(data, name);
      bar.hidden = !st.running;
      if (st.progress === null) bar.removeAttribute('value');
      else bar.value = st.progress;
    });
  });

  Alpine.directive('async-task-error', (el, _dir, { effect }) => {
    const name = taskOf(el, 'x-async-task-error');
    const { host, data } = hostOf(Alpine, el, 'x-async-task-error');
    host.params(name);
    effect(() => {
      const error = statusOf(data, name).error;
      el.textContent = error ?? '';
      /** @type {HTMLElement} */ (el).hidden = !error;
    });
  });
}
