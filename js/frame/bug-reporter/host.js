/**
 * D.Mike — Bug reporter host check (frame/bug-reporter/host.js)
 * Kept in its own DOM-free file so the node test runner can import it.
 */

/**
 * Whether the bug reporter is offered on this host. A hostname check, not an
 * endpoint probe at boot — a network request at startup would break
 * offline-first (spec "Sichtbarkeit").
 * @param {string} hostname
 * @returns {boolean}
 */
export function isReporterHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || /\.ddev\.site$/.test(hostname);
}
