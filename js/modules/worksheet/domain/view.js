/**
 * D.Mike — Arbeitsblatt: Ansichtsfelder schreiben (domain/view.js)
 *
 * Rümpfe der Viewmodel-Kommandos `switchSheet` und `gridView`: sie schreiben
 * nur Ansichtsfelder (`activeSheetId`, `gridView`), keinen Inhalt — darum
 * ohne Umkehrung und ohne Verlaufsschritt. Ein Agent erreicht sie nicht
 * (Viewmodel-Kommandos), er nennt sein Blatt in jedem Kommando selbst.
 *
 * Rein: kein DOM, kein i18n.
 */
import { sheetOf } from './commands-cells.js';

/**
 * Ein Blatt zeigen. Eine unbekannte id lehnt ab (`unknown_sheet: <id>`),
 * wie jedes Kommando der Zielform.
 * @param {any} model @param {string} id
 * @returns {boolean} `false`, wenn das Blatt schon gezeigt wird
 * @throws {Error} `unknown_sheet: <id>`
 */
export function showSheet(model, id) {
  sheetOf(model, id);
  if (model.activeSheetId === id) return false;
  model.activeSheetId = id;
  return true;
}

/**
 * Die Ansicht eines Blatts (Spaltenbreiten, Auswahl) ablegen, wie das Raster
 * sie meldet. Ein unbekanntes Blatt lehnt ab.
 * @param {any} model @param {string} sheetId
 * @param {{ colWidths: Record<string, number>, selection: object|null }} view
 * @returns {void}
 * @throws {Error} `unknown_sheet: <id>`
 */
export function putGridView(model, sheetId, { colWidths, selection }) {
  sheetOf(model, sheetId);
  model.gridView = { ...model.gridView, [sheetId]: { colWidths: { ...colWidths }, selection } };
}
