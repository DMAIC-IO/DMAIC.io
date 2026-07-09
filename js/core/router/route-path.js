/**
 * D.Mike — Router path codec (pure, no dependencies).
 * Converts location.hash strings ⇄ Route objects. See the plan's Route typedef.
 */

/** Split a hash into clean segments. '#/a/b/' → ['a','b']. */
function segments(hash) {
  return String(hash || '')
    .replace(/^#/, '')
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);
}

const EMPTY = {
  kind: 'invalid', projectId: null, phaseId: null,
  instanceId: null, moduleType: null, pageId: null, sub: [],
};

/**
 * Parse a location.hash into a Route.
 * @param {string} hash
 * @returns {import('./router.js').Route}
 */
export function parseHash(hash) {
  const seg = segments(hash);
  if (seg.length === 0) return { ...EMPTY, kind: 'root' };
  if (seg[0] !== 'project' || !seg[1]) return { ...EMPTY };

  const projectId = seg[1];
  const base = { ...EMPTY, projectId, kind: 'project' };
  const rest = seg.slice(2);
  if (rest.length === 0) return base;

  const [head, ...tail] = rest;

  if (head === 'phase' && tail[0]) {
    return { ...base, kind: 'phase', phaseId: tail[0] };
  }
  if (head === 'module' && tail[0] === 'new' && tail[1]) {
    return { ...base, kind: 'module-new', moduleType: tail[1] };
  }
  if (head === 'module' && tail[0]) {
    return { ...base, kind: 'module', instanceId: tail[0], sub: tail.slice(1) };
  }
  if (head === 'page' && tail[0]) {
    return { ...base, kind: 'page', pageId: tail[0], sub: tail.slice(1) };
  }
  return { ...EMPTY };
}

/**
 * Serialise a Route back into a canonical hash string (begins with '#/').
 * @param {import('./router.js').Route} route
 * @returns {string}
 */
export function serializeRoute(route) {
  if (!route || !route.projectId) return '#/';
  const parts = ['project', route.projectId];
  switch (route.kind) {
    case 'phase':      parts.push('phase', route.phaseId); break;
    case 'module':     parts.push('module', route.instanceId, ...(route.sub || [])); break;
    case 'module-new': parts.push('module', 'new', route.moduleType); break;
    case 'page':       parts.push('page', route.pageId, ...(route.sub || [])); break;
    case 'project':    break;
    default:           break;
  }
  return `#/${  parts.filter(Boolean).join('/')}`;
}
