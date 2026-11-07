/**
 * Kleine Reaktivität für Node-Tests von Kernbausteinen, die Alpine nur
 * hereingereicht bekommen: Effects erfassen synchron gelesene Schlüssel,
 * Änderungen laufen gesammelt in einem Microtask (wie Alpines Scheduler).
 */
export function createReactivity() {
  const deps = new WeakMap();
  const proxies = new WeakMap();
  const queue = new Set();
  let active = null;
  let scheduled = false;
  const track = (t, k) => {
    if (!active) return;
    let m = deps.get(t);
    if (!m) deps.set(t, (m = new Map()));
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    s.add(active);
    active.deps.add(s);
  };
  const flush = () => {
    scheduled = false;
    const jobs = [...queue];
    queue.clear();
    for (const e of jobs) if (!e.released) e.run();
  };
  const trigger = (t, k) => {
    const s = deps.get(t)?.get(k);
    if (!s) return;
    for (const e of s) if (e !== active) queue.add(e);
    if (!scheduled && queue.size) { scheduled = true; queueMicrotask(flush); }
  };
  /** @param {any} obj @returns {any} */
  function reactive(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (proxies.has(obj)) return proxies.get(obj);
    const p = new Proxy(obj, {
      get(t, k, r) { const v = Reflect.get(t, k, r); if (typeof k !== 'symbol') track(t, k); return reactive(v); },
      set(t, k, v, r) { const old = t[k]; const ok = Reflect.set(t, k, v, r); if (old !== v) trigger(t, k); return ok; },
    });
    proxies.set(obj, p);
    return p;
  }
  /** @param {() => void} fn */
  function effect(fn) {
    const e = {
      deps: new Set(), released: false,
      run() {
        for (const s of e.deps) s.delete(e);
        e.deps.clear();
        const prev = active; active = e;
        try { fn(); } finally { active = prev; }
      },
    };
    e.run();
    return e;
  }
  /** @param {any} e */
  function release(e) { e.released = true; for (const s of e.deps) s.delete(e); }
  return { reactive, effect, release };
}
