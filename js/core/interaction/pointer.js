/**
 * Pointer-Adapter (Spec C §4.2): Maus, Touch und Stift über Pointer Events.
 * Ein delegierter `pointerdown` am Container; `pointermove`/`pointerup`/
 * `pointercancel` am Griff, nach dem Ende gelöst. Keine Listener auf
 * `document`, kein HTML5-DnD, kein `mousedown`.
 */

/**
 * @param {HTMLElement} root Container
 * @param {Readonly<object>} def aus `defineGesture`
 * @param {object} gesture Steuerung aus `attach.js`
 * @returns {() => void} lösen
 */
export function bindPointer(root, def, gesture) {
  let warned = false;
  let stopActive = null;

  const onDown = (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const el = e.target.closest?.(def.handle);
    if (!el || !root.contains(el)) return;
    if (!warned && def.kind !== 'draw' && el.tabIndex < 0) {
      warned = true;
      console.warn(`[gesture] ${def.kind}: handle "${def.handle}" is not focusable — use <button> or tabindex="0"`);
    }
    if (!gesture.press(el, e)) return;
    stopActive?.();
    const id = e.pointerId;
    try { el.setPointerCapture(id); } catch { /* synthetischer Zeiger: keine Erfassung */ }
    const onMove = (ev) => { if (ev.pointerId === id) gesture.pointerMove(ev); };
    const onUp = (ev) => { if (ev.pointerId !== id) return; stop(); gesture.pointerUp(ev); };
    const onCancel = (ev) => { if (ev.pointerId !== id) return; stop(); gesture.pointerCancel(); };
    function stop() {
      if (stopActive !== stop) return;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      try { el.releasePointerCapture(id); } catch { /* nicht erfasst */ }
      stopActive = null;
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    stopActive = stop;
    // Endet die Geste auf anderem Weg (abort, Esc), die Listener sofort lösen.
    gesture.onEnd(stop);
  };

  // Nach einer Geste den folgenden Klick am Griff verschlucken (ersetzt `_didDrag`).
  const onClick = (e) => {
    // Jeder Klick im Container verbraucht die Sperre; nur ein Griff-Klick wird verschluckt.
    const swallow = gesture.consumeClick();
    if (swallow && e.target.closest?.(def.handle)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Ein neues Drücken heißt: der Klick nach der letzten Geste kam nie (etwa
  // weil das Element beim Ablegen wanderte) — nichts mehr verschlucken. In der
  // Einfangphase, damit auch ein Knopf im Griff mit eigenem stopPropagation zählt.
  const onAnyDown = () => { if (gesture.idle()) gesture.consumeClick(); };

  root.addEventListener('pointerdown', onAnyDown, true);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('click', onClick, true);
  return () => {
    stopActive?.();
    root.removeEventListener('pointerdown', onAnyDown, true);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('click', onClick, true);
  };
}
