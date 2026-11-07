/**
 * D.Mike — Widget-Registry (registry.js)
 *
 * Alle Widgets mit Schema und Einhänger; `app.js` reicht sie an
 * `x-widget` und `x-field`. Ein neues Widget: Ordner `js/widgets/<name>/`
 * mit `schema.js` und `mount.js`, hier eintragen.
 */
import columnPicker from './column-picker/schema.js';
import { mount as mountColumnPicker } from './column-picker/mount.js';

export const WIDGETS = Object.freeze({
  'column-picker': { schema: columnPicker, mount: mountColumnPicker },
});
