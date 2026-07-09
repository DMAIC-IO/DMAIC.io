/**
 * D.Mike — Viewport guard startup concern (desktop-only).
 * Shows #viewport-guard whenever the window is narrower than 1280px.
 */
import { createStartup } from '../core/create-startup.js';

export default createStartup({
  id: 'viewport-guard',

  run() {
    const guard = document.getElementById('viewport-guard');
    if (!guard) return;
    const checkViewport = () => {
      guard.style.display = window.innerWidth < 1280 ? 'flex' : 'none';
    };
    window.addEventListener('resize', checkViewport);
    checkViewport();
  },
});
