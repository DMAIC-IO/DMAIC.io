/**
 * D.Mike — TRIZ 9-Windows: Viewmodel.
 *
 * Titel, Beschriftungen und Fenstertexte liegen im Model (domain/model.js)
 * und binden im Template über `x-model`; der Löschknopf eines Bilds ruft das
 * Model-Kommando `clearImage` (mit der allgemeinen Lösch-Rückfrage). Hier
 * bleiben die Anzeige (Vorgaben als Platzhalter, Koordinaten,
 * Alternativtexte, ids je Instanz), das Lesen einer Bilddatei, das danach
 * über `setCellImage` ins Model schreibt, und die Großansicht im Dialog.
 */
import { createModule } from '../../../core/template-module.js';
import { readImageFile, IMAGE_UPLOAD_ERRORS } from '../../../core/image-upload.js';
import descriptor from '../module.js';
import { State, ROWS, COLS } from '../domain/model.js';
import { UiState } from './state.js';

/** Vorgaben der Spalten (Zeitfenster), Schlüssel in `ui.<lang>.json`. */
const COL_DEFAULTS = Object.freeze(['colPast', 'colPresent', 'colFuture']);
/** Vorgaben der Zeilen (Systemebenen), Schlüssel in `ui.<lang>.json`. */
const ROW_DEFAULTS = Object.freeze(['rowSub', 'rowSys', 'rowSuper']);

/** Fehlercode von `readImageFile` → Text in `ui.<lang>.json`. @type {Record<string, string>} */
const IMAGE_ERROR_TEXTS = {
  [IMAGE_UPLOAD_ERRORS.INVALID_TYPE]: 'imageTypeError',
  [IMAGE_UPLOAD_ERRORS.FILE_TOO_LARGE]: 'imageTooLarge',
  [IMAGE_UPLOAD_ERRORS.READ_ERROR]: 'imageReadError',
};

/**
 * Liegt das Fenster im Raster?
 * @param {number} r @param {number} c @returns {boolean}
 */
const inGrid = (r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS;

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').Triz9WindowsViewFn} */
  view(ctx) {
    /** Griff der offenen Großansicht. @type {{ close: () => void }|null} */
    let dialog = null;
    return {
      /** Vorgabe einer Spalte (Platzhalter). @param {number} c @returns {string} */
      colPlaceholder(c) { return this.t(COL_DEFAULTS[c]); },

      /** Vorgabe einer Zeile (Platzhalter). @param {number} r @returns {string} */
      rowPlaceholder(r) { return this.t(ROW_DEFAULTS[r]); },

      /** Beschriftung einer Spalte: gespeichert oder die Vorgabe. @param {number} c @returns {string} */
      colLabel(c) { return this.model.colLabels[c] || this.colPlaceholder(c); },

      /** Beschriftung einer Zeile: gespeichert oder die Vorgabe. @param {number} r @returns {string} */
      rowLabel(r) { return this.model.rowLabels[r] || this.rowPlaceholder(r); },

      /** Zugänglicher Name des Eingabefelds einer Spaltenbeschriftung. @param {number} c @returns {string} */
      colAxisAria(c) { return this.t('colAxisAria', { idx: c + 1 }); },

      /** Zugänglicher Name des Eingabefelds einer Zeilenbeschriftung. @param {number} r @returns {string} */
      rowAxisAria(r) { return this.t('rowAxisAria', { idx: r + 1 }); },

      /** Koordinate eines Fensters: „Zeile · Spalte“. @param {number} r @param {number} c @returns {string} */
      coordText(r, c) { return `${this.rowLabel(r)} · ${this.colLabel(c)}`; },

      /** Alternativtext des Bilds eines Fensters. @param {number} r @param {number} c @returns {string} */
      imageAlt(r, c) { return this.t('imageAlt', { row: this.rowLabel(r), col: this.colLabel(c) }); },

      /** Trägt das Fenster ein Bild? @param {number} r @param {number} c @returns {boolean} */
      hasImage(r, c) { return inGrid(r, c) && Boolean(this.model.cells[r]?.[c]?.image); },

      /** Bild der Großansicht; ohne Großansicht leer. @returns {string} */
      get enlargedImageSrc() {
        const e = this.state.enlarged;
        return e && inGrid(e.row, e.col) ? this.model.cells[e.row]?.[e.col]?.image ?? '' : '';
      },

      /**
       * id eines Elements, eindeutig je Instanz: `<label for>` und
       * `aria-labelledby` zeigen so auch bei mehreren offenen Instanzen ins
       * eigene Modul.
       * @param {string} name Kurzname des Elements
       * @returns {string}
       */
      fieldId(name) { return `triz-9w-${name}-${ctx.instanceId}`; },

      /** id der Koordinate eines Fensters (Beschriftung des Textfelds). @param {number} r @param {number} c @returns {string} */
      coordId(r, c) { return this.fieldId(`coord-${r}-${c}`); },

      /**
       * Bild eines Fensters setzen (Auswahl oder Ablegen auf dem Bildknopf).
       * Liest die Datei und schreibt einmal über `setCellImage`; was kein
       * Bild ist oder zu groß, meldet ein übersetzter Text.
       * @param {File} file
       * @param {{ row?: string, col?: string }} args `data-arg-row`/`-col` des Bildknopfs
       * @returns {Promise<void>}
       */
      async uploadImage(file, { row, col } = {}) {
        const r = Number(row);
        const c = Number(col);
        if (!inGrid(r, c)) return;
        try {
          const dataUrl = await readImageFile(file);
          this.model.setCellImage({ row: r, col: c, dataUrl: String(dataUrl) });
        } catch (err) {
          const key = IMAGE_ERROR_TEXTS[err instanceof Error ? err.message : ''];
          if (!key) console.warn('triz-9-windows: Bild nicht übernommen', err);
          ctx.notify(this.t(key ?? 'imageReadError'), 'error');
        }
      },

      /**
       * Das Bild eines Fensters groß zeigen: die Vorlage der Großansicht geht
       * als Inhalt an den Dialogdienst und kommt beim Schließen zurück. Ein
       * Fenster ohne Bild öffnet nichts.
       * @param {number} row @param {number} col
       */
      enlarge(row, col) {
        if (!this.hasImage(row, col)) return;
        dialog?.close();
        this.state.enlarged = { row, col };
        const content = this.$refs.enlargedView;
        if (!content) return;
        const handle = ctx.dialog.show({
          title: this.imageAlt(row, col),
          size: 'wide',
          content,
          onClose: () => {
            if (dialog === handle) dialog = null;
            this.state.enlarged = null;
          },
        });
        dialog = handle;
      },

      /** Beim Abbau eine offene Großansicht schließen. */
      destroy() { dialog?.close(); },
    };
  },
});
