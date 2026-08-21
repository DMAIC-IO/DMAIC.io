/**
 * icon.js — dekorative Masken-Icons.
 *
 * icon(name) liefert <span class="icon" data-icon="name">. Die Glyphe kommt aus
 * einer CSS-Maske (assets/icons/icons.css, generiert aus assets/icons/icon-map.json),
 * die Farbe aus currentColor — deshalb folgt ein Icon Theme, Hover und Disabled
 * ohne eigene Regel.
 *
 * `name` ist ein semantischer Name ("action.delete"), kein Dateiname. Welche Datei
 * dahinterliegt, entscheidet icon-map.json; ein Name ohne Eintrag dort bricht den
 * Build ab (tools/build-icons.mjs).
 *
 * { raw: true } für Icons mit eigener Farbe und Deckkraft (die Accent-Miniaturen
 * der Diagramme): sie rendern als background-image statt als Maske.
 */

const SIZE_CLASS = { sm: 'icon--sm', md: '', lg: 'icon--lg' };
const VARIANT_CLASS = {
  accent: 'icon--accent',
  muted: 'icon--muted',
  danger: 'icon--danger',
  success: 'icon--success',
};

/**
 * @param {string} name  semantischer Icon-Name, z. B. 'action.delete'
 * @param {{size?: 'sm'|'md'|'lg', variant?: 'accent'|'muted'|'danger'|'success',
 *          cls?: string, raw?: boolean}} [opts]
 * @returns {HTMLSpanElement}
 */
export function icon(name, opts = {}) {
  const el = document.createElement('span');
  const cls = ['icon'];
  const size = SIZE_CLASS[opts.size ?? 'md'];
  if (size) cls.push(size);
  const variant = VARIANT_CLASS[opts.variant];
  if (variant) cls.push(variant);
  if (opts.raw) cls.push('icon--raw');
  if (opts.cls) cls.push(opts.cls);
  el.className = cls.join(' ');
  el.setAttribute('data-icon', name);
  el.setAttribute('aria-hidden', 'true');
  return el;
}
