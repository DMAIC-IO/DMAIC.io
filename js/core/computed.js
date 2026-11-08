/**
 * D.Mike — Ableitungen im view-Block (computed.js)
 *
 * `view(ctx)` darf `computed: { name() {…} }` liefern. Jeder Eintrag ist als
 * `this.<name>` lesbar (nur lesend). Neu gerechnet wird nur, wenn sich ein beim
 * letzten Lauf gelesener reaktiver Wert ändert — die Abhängigkeiten folgen
 * damit Verzweigungen. Wirft ein Eintrag, wird sein Wert `{ error: <Meldung> }`;
 * die übrigen laufen weiter.
 *
 * Ein Eintrag rechnet bei Bedarf: ändert sich eine Abhängigkeit, wird er sofort
 * als veraltet markiert und meldet das seinen Lesern weiter; gerechnet wird
 * beim nächsten Lesen. So sieht jeder Leser — ein anderes computed oder ein
 * Effect der Vorlage — im selben Durchlauf den frischen Wert, egal in welcher
 * Reihenfolge Alpines Warteschlange die Effects abarbeitet (sie überspringt
 * einen Effect, der in diesem Durchlauf schon lief).
 */

/**
 * @typedef {{ value: any, dirty: boolean, start: (() => void)|null, refresh: (() => void)|null }} ComputedCell
 */

/**
 * Lesende Glieder anlegen: `comp[name]` liefert den aktuellen Wert, Schreiben
 * wirft.
 * @param {object} comp Komponente, bevor Alpine sie reaktiv macht
 * @param {string[]} names
 * @returns {void}
 */
export function defineComputedSlots(comp, names) {
  /** @type {Record<string, ComputedCell>} */
  const cells = {};
  for (const n of names) cells[n] = { value: undefined, dirty: false, start: null, refresh: null };
  // Die Zellen bleiben roh (__v_skip): Alpine soll ihre Zustandswechsel nicht beobachten.
  Object.defineProperty(cells, '__v_skip', { value: true, enumerable: false });
  Object.defineProperty(comp, '_computedCells', {
    value: cells, enumerable: false, configurable: true, writable: false,
  });
  // Je Eintrag ein reaktiver Zähler: steigt, wenn der Wert veraltet — darüber
  // erfahren die Leser davon.
  Object.defineProperty(comp, '_computedTick', {
    value: Object.fromEntries(names.map((n) => [n, 0])),
    enumerable: false,
    configurable: true,
    writable: false,
  });
  for (const name of names) {
    const cell = cells[name];
    Object.defineProperty(comp, name, {
      get() {
        void this._computedTick[name];
        if (cell.start) cell.start();
        else if (cell.dirty && cell.refresh) cell.refresh();
        return cell.value;
      },
      set() { throw new TypeError(`computed ${name} is read-only`); },
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Je Eintrag einen Effect anlegen. `this` im Eintrag ist `vm` (Alpines Proxy),
 * gelesene Werte werden so erfasst.
 * @param {any} Alpine
 * @param {object & { _computedCells: Record<string, ComputedCell>, _computedTick: Record<string, number> }} vm
 *   reaktive Komponente (defineComputedSlots)
 * @param {Record<string, () => any>} defs
 * @returns {() => void} gibt alle Effects frei
 */
export function bindComputed(Alpine, vm, defs) {
  const cells = vm._computedCells;
  /** @type {any[]} */
  const runners = [];
  for (const [name, fn] of Object.entries(defs)) {
    const cell = cells[name];
    cell.start = () => {
      cell.start = null;
      const runner = Alpine.effect(() => {
        let value;
        try {
          value = fn.call(vm);
        } catch (err) {
          console.error(`[computed] ${name}:`, err);
          value = { error: err instanceof Error ? err.message : String(err) };
        }
        cell.value = value;
        cell.dirty = false;
      });
      // Nicht in Alpines Warteschlange: veraltet markieren und die Leser wecken.
      if (runner?.options) {
        runner.options.scheduler = () => {
          if (cell.dirty) return;
          cell.dirty = true;
          vm._computedTick[name] += 1;
        };
      }
      cell.refresh = () => runner();
      runners.push(runner);
    };
  }
  // Ein Eintrag, der einen späteren liest, hat diesen schon gestartet.
  for (const name of Object.keys(defs)) cells[name].start?.();
  return () => {
    for (const runner of runners) Alpine.release(runner);
    for (const name of Object.keys(defs)) {
      cells[name].refresh = null;
      cells[name].dirty = false;
    }
  };
}
