/**
 * Rich-Text-Editor als Widget: `contenteditable` mit Werkzeugleiste (Fett, Kursiv),
 * Einfügen nur als Klartext und Zähler, wenn das Feld eine `maxLength` hat.
 * Der Wert ist Markdown (core/rich-text.js). Beschriftung und Platzhalter
 * kommen vom Wirtselement (`aria-label`, `placeholder`).
 */
import { h } from '../../core/dom.js';
import { markdownToFragment, domToMarkdown, plainLength } from '../../core/rich-text.js';

/**
 * @param {HTMLElement} root
 * @param {{ value: { spec: any, get: () => any, set: (v: any) => boolean }, services: any, effect: Function }} w
 * @returns {{ destroy: () => void }}
 */
export function mount(root, { value, services, effect }) {
  const host = root.parentElement;
  const t = (key, params) => services.i18n.t(key, params);
  const max = value.spec.maxLength;

  const button = (cmd, key, glyphKey, glyph) => h('button', {
    type: 'button', class: 'rich-text__btn', 'data-cmd': cmd, title: t(key), 'aria-label': t(key),
  }, h(glyph, {}, t(glyphKey)));
  const toolbar = h('div', { class: 'rich-text__toolbar', role: 'toolbar', 'aria-label': t('richText.toolbar') },
    button('bold', 'richText.bold', 'richText.boldShort', 'strong'),
    button('italic', 'richText.italic', 'richText.italicShort', 'em'));
  const editor = h('div', {
    class: 'field rich-text__editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
  });
  const count = max !== undefined ? h('div', { class: 'rich-text__count' }) : null;
  root.append(toolbar, editor, ...(count ? [count] : []));

  const syncLabels = () => {
    const label = host?.getAttribute('aria-label');
    if (label) editor.setAttribute('aria-label', label); else editor.removeAttribute('aria-label');
    const hint = host?.getAttribute('placeholder');
    if (hint) editor.setAttribute('data-placeholder', hint); else editor.removeAttribute('data-placeholder');
  };
  syncLabels();
  const observer = host ? new MutationObserver(syncLabels) : null;
  observer?.observe(host, { attributes: true, attributeFilter: ['aria-label', 'placeholder'] });

  const refresh = (markdown) => {
    editor.classList.toggle('rich-text__editor--empty', !editor.textContent.trim());
    if (!count) return;
    const n = plainLength(markdown);
    count.textContent = t('richText.count', { n, max });
    count.classList.toggle('rich-text__count--warn', n >= max * 0.9);
  };

  /** Die Anzeige auf den Wert des Models setzen; bei gleichem Wert bleibt das DOM (und die Auswahl) stehen. */
  const show = () => {
    const v = value.get() ?? '';
    if (domToMarkdown(editor) !== v) editor.replaceChildren(markdownToFragment(v));
    refresh(v);
  };
  effect(show);

  const onInput = () => {
    if (value.set(domToMarkdown(editor))) {
      editor.removeAttribute('aria-invalid');
      refresh(value.get() ?? '');
      return;
    }
    // Abgelehnt: der Editor zeigt wieder den letzten gültigen Wert.
    editor.setAttribute('aria-invalid', 'true');
    editor.replaceChildren(markdownToFragment(value.get() ?? ''));
    const sel = editor.ownerDocument.getSelection();
    if (sel && editor.ownerDocument.activeElement === editor) { sel.selectAllChildren(editor); sel.collapseToEnd(); }
    refresh(value.get() ?? '');
  };
  const onPaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (text) editor.ownerDocument.execCommand('insertText', false, text);
  };
  /** Befehl auf diesen Editor anwenden; gesperrt tut er nichts, die Auswahl liegt sonst erst im Editor. */
  const format = (cmd) => {
    if (editor.getAttribute('contenteditable') !== 'true') return;
    const doc = editor.ownerDocument;
    const anchor = doc.getSelection()?.anchorNode;
    if (!anchor || !editor.contains(anchor)) {
      // Die Auswahl liegt anderswo: der Befehl gilt diesem Editor, nicht dem Element mit der Auswahl.
      editor.focus();
      const sel = doc.getSelection();
      if (sel && !editor.contains(sel.anchorNode)) { sel.selectAllChildren(editor); sel.collapseToEnd(); }
    } else if (doc.activeElement !== editor) editor.focus();
    doc.execCommand(cmd, false, null);
  };
  const onKeydown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const cmd = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : null;
    if (!cmd) return;
    event.preventDefault();
    format(cmd);
  };
  const commandOf = (event) => {
    const btn = event.target instanceof Element ? event.target.closest('[data-cmd]') : null;
    return btn ? btn.getAttribute('data-cmd') : null;
  };
  // mousedown hält die Auswahl im Editor; ausgeführt wird beim Klick, so auch per Enter/Leertaste.
  const onToolbarMousedown = (event) => { if (commandOf(event)) event.preventDefault(); };
  const onToolbarClick = (event) => { const cmd = commandOf(event); if (cmd) format(cmd); };
  editor.addEventListener('input', onInput);
  editor.addEventListener('paste', onPaste);
  editor.addEventListener('keydown', onKeydown);
  toolbar.addEventListener('mousedown', onToolbarMousedown);
  toolbar.addEventListener('click', onToolbarClick);
  return {
    destroy() {
      observer?.disconnect();
      editor.removeEventListener('input', onInput);
      editor.removeEventListener('paste', onPaste);
      editor.removeEventListener('keydown', onKeydown);
      toolbar.removeEventListener('mousedown', onToolbarMousedown);
      toolbar.removeEventListener('click', onToolbarClick);
    },
  };
}
