/* Qprovement — Veredelung des Off-Canvas-Drawers.
   Der Drawer selbst läuft ohne JavaScript (Kontrollkästchen + :checked ~ …).
   Diese Datei ergänzt nur, was reines CSS nicht kann. Fällt sie aus, bleibt
   alles bedienbar: es schließt dann lediglich Escape nicht, und ein Klick auf
   einen Sprunglink lässt den Drawer über dem Ziel stehen.

   Inhaltsgleich in beiden Repos: js/nav-drawer.js (Site) und
   app/dev/tools/static-handbook/render/assets/nav-drawer.js (Handbuch).
   Wer eine ändert, ändert die andere mit. */
(function () {
  var box = document.getElementById('navToggle');
  var burger = document.querySelector('.burger');
  var drawer = document.getElementById('navDrawer');
  if (!box || !burger || !drawer) return;

  // Das Label ist für Screenreader ein Kontrollkästchen. role/tabindex/
  // aria-expanded machen daraus die Schaltfläche, die es optisch ist.
  burger.setAttribute('role', 'button');
  burger.setAttribute('tabindex', '0');

  // Ein programmatisch gesetztes .checked löst KEIN change-Ereignis aus —
  // deshalb wird sync() an jeder Stelle ausdrücklich mitgerufen.
  function sync() {
    burger.setAttribute('aria-expanded', box.checked ? 'true' : 'false');
    document.documentElement.style.overflow = box.checked ? 'hidden' : '';
  }

  function setOpen(open) {
    box.checked = open;
    sync();
  }

  sync();
  box.addEventListener('change', sync);

  burger.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    setOpen(!box.checked);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box.checked) setOpen(false);
  });

  drawer.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
})();
