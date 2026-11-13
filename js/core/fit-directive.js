/**
 * D.Mike — Direktive `x-fit` (ohne Wert): skaliert frei positionierten Inhalt
 * in den Elternbehälter, wie `preserveAspectRatio="xMidYMid meet"`.
 *
 * Das Element behält seine natürliche Größe; der Faktor ist
 * `min(Behälterbreite / Inhaltsbreite, Behälterhöhe / Inhaltshöhe)` (auch > 1),
 * der Ursprung liegt oben links, der Versatz zentriert. Ein `ResizeObserver`
 * auf Behälter und Element führt die Skalierung nach; `cleanup` trennt ihn.
 */

const registered = new WeakSet();

/**
 * Register the `x-fit` directive. Call BEFORE Alpine.start().
 * Idempotent per Alpine instance.
 * @param {object} Alpine - the csp.js default export
 */
export function registerFitDirective(Alpine) {
  if (registered.has(Alpine)) return;
  registered.add(Alpine);
  Alpine.directive('fit', (el, _value, { cleanup }) => {
    const apply = () => {
      const box = el.parentElement;
      if (!box) return;
      const iw = el.offsetWidth;
      const ih = el.offsetHeight;
      const cw = box.clientWidth;
      const ch = box.clientHeight;
      if (!(iw > 0 && ih > 0 && cw > 0 && ch > 0)) return;
      const scale = Math.min(cw / iw, ch / ih);
      const dx = (cw - iw * scale) / 2;
      const dy = (ch - ih * scale) / 2;
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    if (el.parentElement) observer.observe(el.parentElement);
    observer.observe(el);
    cleanup(() => observer.disconnect());
  });
}
