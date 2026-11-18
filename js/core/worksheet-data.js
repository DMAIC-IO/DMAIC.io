/**
 * D.Mike — Arbeitsblatt-Revisionszähler (worksheet-data.js)
 *
 * Die Fassade `ctx.data` und `createWorksheetData` gibt es nicht mehr: fremde
 * Instanzen liest `derived(src, d)` über `src.read` und die Funktionen aus
 * `core/source-columns.js`, das Viewmodel über `ctx.source`. Die Zähler leben
 * in `core/source.js`; diese Datei hält ihre Namen für bestehende Importe.
 */
import { installWorksheetRevisions, bumpWorksheetRevisions } from './source.js';

export { installWorksheetRevisions, bumpWorksheetRevisions };
