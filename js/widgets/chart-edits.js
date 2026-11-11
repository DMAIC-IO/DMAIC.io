/**
 * D.Mike — Editor-Einstellungen der Diagramm-Widgets (chart-edits.js)
 *
 * Die Rechnung liegt im Kern (`core/chart-edits.js`), damit auch die Ableitungen
 * der Models sie nutzen können; hier bleibt der Import-Pfad der Widgets.
 */
export { ownedKeys, applyEdits, pickShown, diffEdits } from '../core/chart-edits.js';
