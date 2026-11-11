/**
 * D.Mike — Direktive `x-file-drop="<methode>"`: Dateiauswahl und Ablegen.
 *
 * Das Element bekommt ein verstecktes `<input type="file" data-ref="file-input">`
 * (`accept` aus `data-accept`). Nachfahren mit `data-file-open` öffnen die Auswahl
 * per Klick, Nicht-Schaltflächen auch per Enter und Leertaste. Beim Ziehen steht
 * `data-dragover` am Element. Die erste Datei geht an `$data[<methode>](file)`;
 * die Methode wird beim Ereignis gelesen, ein Ausdruck wird nie ausgewertet (CSP).
 */

const registered = new WeakSet();

/**
 * Register the `x-file-drop` directive. Call BEFORE Alpine.start().
 * Idempotent per Alpine instance.
 * @param {object} Alpine - the csp.js default export
 */
export function registerFileDropDirective(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('file-drop', (el, { expression }, { cleanup }) => {
    const method = String(expression || '').trim();
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.setAttribute('data-ref', 'file-input');
    const syncAccept = () => {
      const accept = el.getAttribute('data-accept');
      if (accept) input.setAttribute('accept', accept);
      else input.removeAttribute('accept');
    };
    syncAccept();
    el.append(input);

    const deliver = (file) => {
      if (!file) return;
      const handler = Alpine.$data(el)?.[method];
      if (typeof handler === 'function') handler.call(Alpine.$data(el), file);
    };
    const open = () => { syncAccept(); input.click(); };
    const opener = (event) => {
      if (event.target === input) return null;
      return event.target instanceof Element ? event.target.closest('[data-file-open]') : null;
    };

    const onClick = (event) => { if (opener(event) && el.contains(opener(event))) open(); };
    const onKeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = opener(event);
      if (!target || !el.contains(target) || target.tagName === 'BUTTON') return;
      event.preventDefault();
      open();
    };
    const onDragOver = (event) => {
      event.preventDefault();
      el.setAttribute('data-dragover', '');
    };
    const onDragLeave = () => el.removeAttribute('data-dragover');
    const onDrop = (event) => {
      event.preventDefault();
      el.removeAttribute('data-dragover');
      deliver(event.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      const file = input.files?.[0];
      input.value = '';
      deliver(file);
    };

    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    input.addEventListener('change', onChange);
    cleanup(() => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKeydown);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
      input.removeEventListener('change', onChange);
      input.remove();
    });
  });
}
