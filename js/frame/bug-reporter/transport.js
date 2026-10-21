/**
 * D.Mike — Bug report transport (frame/bug-reporter/transport.js)
 * The replaceable seam of the bug reporter (spec "Naht"): send(report) →
 * { path } | throw. The HTTP transport posts to the private repo's PHP
 * receiver; downloadFiles() is the fallback when it is missing or fails.
 */

export const RECEIVER_URL = '/tools/bug-inbox/receive.php';

/**
 * Marker header the receiver requires. Non-simple header → cross-origin POSTs
 * need a CORS preflight, which the receiver never grants.
 */
export const MARKER_HEADER = { 'X-Bug-Report': '1' };

/** A failed send. `rejected` = the receiver itself refused (show reason, no downloads). */
export class TransportError extends Error {
  /** @param {string} message @param {number} status @param {boolean} rejected */
  constructor(message, status, rejected) {
    super(message);
    this.name = 'TransportError';
    this.status = status;
    this.rejected = rejected;
  }
}

/**
 * Normalise a report file's payload to a Blob.
 * @param {{type: string, data: string|Blob}} file
 * @returns {Blob}
 */
function toBlob(file) {
  return file.data instanceof Blob ? file.data : new Blob([file.data], { type: file.type });
}

/**
 * @param {{url?: string, fetchImpl?: typeof fetch}} [opts] `fetchImpl` is the
 *   seam for the environment's fetch; defaults to the global one.
 * @returns {{send: (report: {folder: string, files: object[]}) => Promise<{path: string}>}}
 */
export function createHttpTransport(opts = {}) {
  const url = opts.url ?? RECEIVER_URL;
  const fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
  return {
    async send(report) {
      const body = new FormData();
      body.append('folder', report.folder);
      for (const f of report.files) body.append(f.name, toBlob(f), f.name);
      let res;
      try {
        res = await fetchImpl(url, { method: 'POST', headers: { ...MARKER_HEADER }, body });
      } catch (err) {
        throw new TransportError(err?.message || 'network error', 0, false);
      }
      let json;
      try { json = await res.json(); } catch { json = null; }
      if (res.status === 201 && typeof json?.path === 'string') return { path: json.path };
      const rejected = res.status >= 400 && res.status < 500 && typeof json?.error === 'string';
      throw new TransportError(json?.error || `HTTP ${res.status}`, res.status, rejected);
    },
  };
}

/**
 * Offer every report file as a browser download, prefixed with the folder.
 * @param {{folder: string, files: object[]}} report
 * @param {Document} [doc] seam for the environment's document; defaults to the global one
 * @returns {string[]} downloaded file names
 */
export function downloadFiles(report, doc = document) {
  const names = [];
  for (const f of report.files) {
    const url = URL.createObjectURL(toBlob(f));
    const a = doc.createElement('a');
    a.href = url;
    a.download = `${report.folder}--${f.name}`;
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    names.push(a.download);
  }
  return names;
}
