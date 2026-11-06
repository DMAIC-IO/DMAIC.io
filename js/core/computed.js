/**
 * D.Mike — Ableitungen im view-Block (computed.js)
 *
 * `view(ctx)` darf `computed: { name() {…} }` liefern. Jeder Eintrag wird in
 * einem `Alpine.effect` berechnet; das Ergebnis liegt reaktiv unter
 * `_computed[name]` und ist als `this.<name>` lesbar (nur lesend). Neu
 * gerechnet wird nur, wenn sich ein beim letzten Lauf gelesener reaktiver
 * Wert ändert — die Abhängigkeiten folgen damit Verzweigungen. Wirft ein
 * Eintrag, wird sein Wert `{ error: <Meldung> }`; die übrigen laufen weiter.
 */

/**
 * Lesende Glieder anlegen: `comp[name]` liest `comp._computed[name]`,
 * Schreiben wirft.
 * @param {object} comp Komponente, bevor Alpine sie reaktiv macht
 * @param {string[]} names
 * @returns {void}
 */
export function defineComputedSlots(comp, names) {
  Object.defineProperty(comp, '_computed', {
    value: Object.fromEntries(names.map((n) => [n, undefined])),
    enumerable: false,
    configurable: true,
    writable: false,
  });
  for (const name of names) {
    Object.defineProperty(comp, name, {
      get() { return this._computed[name]; },
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
 * @param {object} vm reaktive Komponente mit `_computed` (defineComputedSlots)
 * @param {Record<string, () => any>} defs
 * @returns {() => void} gibt alle Effects frei
 */
export function bindComputed(Alpine, vm, defs) {
  const runners = Object.entries(defs).map(([name, fn]) => Alpine.effect(() => {
    let value;
    try {
      value = fn.call(vm);
    } catch (err) {
      console.error(`[computed] ${name}:`, err);
      value = { error: err instanceof Error ? err.message : String(err) };
    }
    vm._computed[name] = value;
  }));
  return () => { for (const runner of runners) Alpine.release(runner); };
}
