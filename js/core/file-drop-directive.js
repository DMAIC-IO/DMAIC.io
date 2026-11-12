/**
 * D.Mike — Direktive `x-file-drop="<methode>"`: Dateiauswahl und Ablegen.
 *
 * Das Element bekommt ein verstecktes `<input type="file" data-ref="file-input">`
 * (`accept` aus `data-file-drop-accept`). Nachfahren mit `data-file-drop-open` öffnen die Auswahl
 * per Klick, Nicht-Schaltflächen auch per Enter und Leertaste. Beim Ziehen steht
 * `data-file-drop-over` am Element. Die erste Datei geht an `$data[<methode>](file, args)`;
 * mit `data-file-drop-multiple` wählt das Feld mehrere Dateien, und die Methode bekommt
 * alle als Liste (`files`). `args` sind die `data-arg-<kebab>`-Attribute des
 * Elements als Texte (`data-arg-scope` → `{ scope }`), beim Ereignis gelesen.
 * Die Methode wird beim Ereignis gelesen, ein Ausdruck wird nie ausgewertet (CSP).
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
    const multiple = () => el.hasAttribute('data-file-drop-multiple');
    const syncAccept = () => {
      const accept = el.getAttribute('data-file-drop-accept');
      if (accept) input.setAttribute('accept', accept);
      else input.removeAttribute('accept');
      input.multiple = multiple();
    };
    syncAccept();
    el.append(input);

    /** @returns {Record<string, string>} die `data-arg-*` des Elements */
    const args = () => Object.fromEntries(Object.entries(el.dataset)
      .filter(([k]) => /^arg[A-Z]/.test(k))
      .map(([k, v]) => [k[3].toLowerCase() + k.slice(4), v ?? '']));
    /** @param {FileList|File[]|null|undefined} list */
    const deliver = (list) => {
      const files = Array.from(list ?? []);
      if (files.length === 0) return;
      const handler = Alpine.$data(el)?.[method];
      if (typeof handler === 'function') handler.call(Alpine.$data(el), multiple() ? files : files[0], args());
    };
    const open = () => { syncAccept(); input.click(); };
    const opener = (event) => {
      if (event.target === input) return null;
      return event.target instanceof Element ? event.target.closest('[data-file-drop-open]') : null;
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
      el.setAttribute('data-file-drop-over', '');
    };
    const onDragLeave = () => el.removeAttribute('data-file-drop-over');
    const onDrop = (event) => {
      event.preventDefault();
      el.removeAttribute('data-file-drop-over');
      deliver(event.dataTransfer?.files);
    };
    const onChange = () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      deliver(files);
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
