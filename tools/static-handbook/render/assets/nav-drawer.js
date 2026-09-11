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

  // Für Screenreader ist box (das Kontrollkästchen) das eigentliche
  // Bedienelement — es trägt bereits eine übersetzte Beschriftung
  // (aria-label="Menü"/"Menu") und ist als role=checkbox ein gültiger Träger
  // für aria-expanded. Das <label> selbst bleibt unangetastet: kein
  // role/tabindex, denn ein zusätzlicher, unbenannter Tab-Stopp auf einem
  // Label ohne eigenen Text wäre ein zweites, namenloses Bedienelement für
  // dieselbe Funktion — box ist ohnehin schon fokussierbar und steht im
  // Markup vor der Leiste.
  var focusBeforeOpen = null;

  // Ein programmatisch gesetztes .checked löst KEIN change-Ereignis aus —
  // deshalb wird sync() an jeder Stelle ausdrücklich mitgerufen.
  function sync() {
    box.setAttribute('aria-expanded', box.checked ? 'true' : 'false');
    document.documentElement.style.overflow = box.checked ? 'hidden' : '';
  }

  function setOpen(open) {
    if (open && !box.checked) focusBeforeOpen = document.activeElement;
    box.checked = open;
    sync();
    // Fokus zurückgeben: ohne das würde Escape/Burger-Schließen den Fokus
    // auf <body> fallen lassen, sobald das fokussierte Element (z. B. ein
    // Drawer-Link) per visibility:hidden aus dem Dokument "verschwindet" —
    // der Tastaturnutzer landete dann unvermittelt am Seitenanfang. Ein
    // echter Fokus-Trap ist hier ausdrücklich nicht gewollt, daher nur diese
    // einfache Rückgabe, kein Zyklus.
    if (!open && focusBeforeOpen && document.contains(focusBeforeOpen)) {
      focusBeforeOpen.focus();
    }
    if (!open) focusBeforeOpen = null;
  }

  sync();
  box.addEventListener('change', function () {
    if (box.checked) focusBeforeOpen = document.activeElement;
    sync();
  });

  // Die Leertaste öffnet/schließt ein fokussiertes Kontrollkästchen bereits
  // nativ (change-Ereignis läuft über den Listener oben mit) — nur die
  // Eingabetaste hat auf einem freistehenden Checkbox-Element (außerhalb
  // eines <form>) keine Standardwirkung und wird deshalb hier nachgerüstet.
  box.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
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
