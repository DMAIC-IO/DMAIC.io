/**
 * Tastatur-Adapter (Spec C §4.3). Delegiert am Container, nur wenn der
 * Fokus auf einem Griff liegt.
 *
 *   Leertaste/Enter   aufnehmen bzw. ablegen (reorder, move, resize)
 *   Pfeile            nach der Aufnahme: step
 *   Esc/Tab/Fokus weg abbrechen
 *   Alt+Pfeil         ein Schritt, sofort Kommando (reorder, move)
 *   Alt+Shift+Pfeil   Endkante ein Schritt (resize)
 *
 * `draw` hat keinen Tastaturmodus. Esc bricht auch eine laufende
 * Zeiger-Geste ab, sofern das Ereignis aus dem Container kommt.
 */
import { instructionsId } from './announce.js';

const ARROWS = Object.freeze({
  ArrowUp: Object.freeze({ x: 0, y: -1 }),
  ArrowDown: Object.freeze({ x: 0, y: 1 }),
  ArrowLeft: Object.freeze({ x: -1, y: 0 }),
  ArrowRight: Object.freeze({ x: 1, y: 0 }),
});

/** @param {KeyboardEvent} e @returns {boolean} Leertaste/Enter ohne Modifikator */
const isToggle = (e) => (e.key === ' ' || e.key === 'Enter') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;

/**
 * @param {HTMLElement} root Container
 * @param {Readonly<object>} def aus `defineGesture`
 * @param {object} gesture Steuerung aus `attach.js`
 * @returns {() => void} lösen
 */
export function bindKeyboard(root, def, gesture) {
  let swallowKeyup = false;
  const handleOf = (target) => {
    const el = target?.closest?.(def.handle);
    return el && root.contains(el) ? el : null;
  };

  const onKeyDown = (e) => {
    // Ein keyup, das den Container nie erreicht hat, darf nicht nachwirken.
    swallowKeyup = false;
    // Zeiger-Geste: gedrückt (unter der Schwelle) oder ziehend.
    if (e.key === 'Escape' && !gesture.idle() && !gesture.picking()) {
      e.preventDefault();
      gesture.pointerCancel();
      return;
    }
    if (def.kind === 'draw') return;
    const el = handleOf(e.target);
    if (!el) return;
    const dir = ARROWS[e.key];

    if (gesture.picking()) {
      if (!gesture.picking(el)) return;
      if (isToggle(e)) {
        e.preventDefault();
        swallowKeyup = true;
        gesture.keyDrop();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        gesture.keyCancel();
      } else if (e.key === 'Tab') {
        gesture.keyCancel();
      } else if (dir) {
        // Alt+Pfeil im Aufnahme-Modus: kein Schritt, aber auch kein Verlauf.
        e.preventDefault();
        if (!e.altKey) gesture.keyStep(dir);
      }
      return;
    }

    if (dir && e.altKey) {
      // Alt+←/→ am Griff darf nie im Browserverlauf navigieren — auch am Rand,
      // an der falschen Kante (resize ohne Shift) und während einer Zeiger-Geste.
      e.preventDefault();
      const endEdge = e.shiftKey;
      if (gesture.idle() && endEdge === (def.kind === 'resize')) gesture.shortcut(el, dir, endEdge);
      return;
    }
    if (!gesture.idle()) return;
    if (isToggle(e)) {
      e.preventDefault();
      swallowKeyup = true;
      gesture.keyPick(el);
    }
  };

  // Leertaste löst den click eines <button> erst beim keyup aus.
  const onKeyUp = (e) => {
    if (swallowKeyup && (e.key === ' ' || e.key === 'Enter')) {
      swallowKeyup = false;
      e.preventDefault();
    }
  };

  const onFocusIn = (e) => {
    if (def.kind === 'draw') return;
    const el = handleOf(e.target);
    if (el && !el.hasAttribute('aria-describedby')) {
      el.setAttribute('aria-describedby', instructionsId(root.ownerDocument, gesture.t('common.gesture.instructions')));
    }
  };

  const onFocusOut = (e) => {
    const el = handleOf(e.target);
    if (el && gesture.picking(el)) gesture.keyCancel();
  };

  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('keyup', onKeyUp);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  return () => {
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('keyup', onKeyUp);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('focusout', onFocusOut);
  };
}
