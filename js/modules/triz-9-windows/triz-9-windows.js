/**
 * D.Mike — System-Operator / 9 Fenster (TRIZ) (triz-9-windows.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Systemtitel, die drei
 *   Spalten- und die drei Zeilenbeschriftungen, der Text jedes der neun
 *   Felder und das Löschen eines Feldbildes. Das Hochladen eines Bildes und
 *   die Großansicht bleiben der Oberfläche vorbehalten.
 */
import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireIndex, requireText } from '../../core/agent/agent-argcheck.js';
import { State, ROWS, COLS } from './triz-9-windows-model.js';
import { readImageFile, IMAGE_UPLOAD_ERRORS } from '../../core/image-upload.js';

// Die Prüfung zählt auf `requireIndex(name, value, length)`, das `0..length`
// EINSCHLIESSLICH erlaubt (Einfügepositions-Semantik) — übergeben wird darum
// `ROWS - 1` bzw. `COLS - 1`, damit genau 0..2 durchkommt und die Meldung
// `allowed: 0..2` lautet.
const MAX_ROW = ROWS - 1;
const MAX_COL = COLS - 1;

/**
 * Die Lesefläche IST die persistierte Form — sie heißt nur anders als die
 * Klassenfelder: `rows` hält zur Laufzeit Beschriftung UND Zellen, `toJSON()`
 * trennt beides in `rowLabels` und `cells`. Erklärt statt abgeleitet, damit
 * `read()` und das erklärte Feld dasselbe meinen.
 *
 * @typedef {object} AgentRead
 * @property {string} systemTitle  das betrachtete System
 * @property {string[]} colLabels  die drei Spaltenbeschriftungen (Zeitachse: Vergangenheit, Gegenwart, Zukunft)
 * @property {string[]} rowLabels  die drei Zeilenbeschriftungen (Systemebene: Subsystem, System, Übersystem)
 * @property {Array<Array<{ text: string, image: string|null }>>} cells  [bulk] [omit:[][].image] die 3×3-Felder, adressiert als cells[zeile][spalte]; `image` ist null oder, statt der Daten-URL, nur deren Größe
 */
export default createModule({
  config: {
    id: 'triz-9-windows',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-9-windows',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    return {
      ...agentReadMixin(module),

      enlarged: null,
      /** @type {{close: Function}|null} open enlarged-image dialog */
      _enlargedDialog: null,

      /** @noagent view transform */
      colPlaceholder(c) {
        return [_t('colPast'), _t('colPresent'), _t('colFuture')][c];
      },

      /** @noagent view transform */
      rowPlaceholder(r) {
        return [_t('rowSub'), _t('rowSys'), _t('rowSuper')][r];
      },

      /** @noagent view transform */
      axisColsText() {
        return _t('axisCols');
      },

      /** @noagent view transform */
      colAxisAria(c) {
        return _t('colAxisAria', { idx: c + 1 });
      },

      /** @noagent view transform */
      rowAxisAria(r) {
        return _t('rowAxisAria', { idx: r + 1 });
      },

      /** @noagent view transform */
      coordText(r, c) {
        const rowDef = [_t('rowSub'), _t('rowSys'), _t('rowSuper')];
        const colDef = [_t('colPast'), _t('colPresent'), _t('colFuture')];
        const rowLbl = this.model.rows[r].rowLabel.val || rowDef[r];
        const colLbl = this.model.colLabels[c].val || colDef[c];
        return `${rowLbl  } \u00b7 ${  colLbl}`;
      },

      /** @noagent view transform */
      imageAlt(r, c) {
        const rowDef = [_t('rowSub'), _t('rowSys'), _t('rowSuper')];
        const colDef = [_t('colPast'), _t('colPresent'), _t('colFuture')];
        const rowLbl = this.model.rows[r].rowLabel.val || rowDef[r];
        const colLbl = this.model.colLabels[c].val || colDef[c];
        return _t('imageAlt', { row: rowLbl, col: colLbl });
      },

      /** @noagent view transform */
      enlargedImageSrc() {
        const e = this.enlarged;
        // The holder renders all the time, so no image means an empty src.
        return e ? this.model.rows[e.r].cells[e.c].image || '' : '';
      },

      /** @noagent view transform */
      uploadBtnStyle(cell) {
        return cell.image ? 'display:none' : '';
      },

      /**
       * @noagent liest eine Datei aus einem Eingabeereignis; ein Agent
       *   kann keine Datei übergeben.
       */
      async handleImageUpload(r, c, event) {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const dataUrl = await readImageFile(file);
          this.model.rows[r].cells[c].image = dataUrl;
        } catch (err) {
          const msgs = {
            [IMAGE_UPLOAD_ERRORS.INVALID_TYPE]: _t('imageTypeError'),
            [IMAGE_UPLOAD_ERRORS.FILE_TOO_LARGE]: _t('imageTooLarge'),
            [IMAGE_UPLOAD_ERRORS.READ_ERROR]: _t('imageReadError'),
          };
          module._context.notify?.({ type: 'error', message: msgs[err.message] || err.message });
          event.target.value = '';
        }
      },

      /**
       * Löscht das Bild eines Feldes der 3×3-Matrix; der Feldtext bleibt.
       * @agent
       * @param {number} row Zeile 0 bis 2 (Subsystem, System, Übersystem)
       * @param {number} col Spalte 0 bis 2 (Vergangenheit, Gegenwart, Zukunft)
       * @returns {void}
       * @throws {Error} wenn row oder col außerhalb von 0 bis 2 liegt
       */
      clearImage(row, col) {
        requireIndex('row', row, MAX_ROW);
        requireIndex('col', col, MAX_COL);
        this.model.clearCellImage(row, col);
      },

      // ── Auspacker der Vorlage ─────────────────────────────
      // `x-for` über ein Objekt liefert den Schlüssel als ZEICHENKETTE
      // ('0', '1', '2') — gemessen, nicht angenommen: mit den Sinks direkt
      // an der Bindung warf `requireIndex` bei jedem Tastendruck, und die
      // beiden Beschriftungsfälle der Modul-Spec wurden rot. Die Auspacker
      // normalisieren den Schlüssel; die Sinks bleiben auf ganze Zahlen
      // festgelegt, wie ihre Hilfetexte es zusagen.

      /** @noagent normalisiert den Schlüssel aus `x-for`; der Wert geht durch `setColLabel`. */
      colLabelChanged(col, text) { this.setColLabel(Number(col), text); },

      /** @noagent normalisiert den Schlüssel aus `x-for`; der Wert geht durch `setRowLabel`. */
      rowLabelChanged(row, text) { this.setRowLabel(Number(row), text); },

      /** @noagent normalisiert die Schlüssel aus `x-for`; der Wert geht durch `setCellText`. */
      cellTextChanged(row, col, text) { this.setCellText(Number(row), Number(col), text); },

      /** @noagent normalisiert die Schlüssel aus `x-for`; der Aufruf geht durch `clearImage`. */
      clearImageClicked(row, col) { this.clearImage(Number(row), Number(col)); },

      // ── Zustands-Sinks: ein Setter je Feld (Plan E2, E7) ───────────

      /**
       * Setzt den Titel des betrachteten Systems.
       * @agent
       * @param {string} text der Systemtitel
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setSystemTitle(text) { this.model.systemTitle = requireText('text', text); },

      /**
       * Schreibt den Text eines Feldes der 3×3-Matrix.
       * @agent
       * @param {number} row Zeile 0 bis 2 (Subsystem, System, Übersystem)
       * @param {number} col Spalte 0 bis 2 (Vergangenheit, Gegenwart, Zukunft)
       * @param {string} text der Feldtext
       * @returns {void}
       * @throws {Error} wenn row oder col außerhalb von 0 bis 2 liegt, oder
       *   `text` keine Zeichenkette ist
       */
      setCellText(row, col, text) {
        requireIndex('row', row, MAX_ROW);
        requireIndex('col', col, MAX_COL);
        this.model.rows[row].cells[col].text = requireText('text', text);
      },

      /**
       * Beschriftet eine Spalte der Zeitachse.
       * @agent
       * @param {number} col Spalte 0 bis 2 (Vergangenheit, Gegenwart, Zukunft)
       * @param {string} text die Spaltenbeschriftung
       * @returns {void}
       * @throws {Error} wenn col außerhalb von 0 bis 2 liegt, oder `text`
       *   keine Zeichenkette ist
       */
      setColLabel(col, text) {
        requireIndex('col', col, MAX_COL);
        this.model.colLabels[col].val = requireText('text', text);
      },

      /**
       * Beschriftet eine Zeile der Systemebenen.
       * @agent
       * @param {number} row Zeile 0 bis 2 (Subsystem, System, Übersystem)
       * @param {string} text die Zeilenbeschriftung
       * @returns {void}
       * @throws {Error} wenn row außerhalb von 0 bis 2 liegt, oder `text`
       *   keine Zeichenkette ist
       */
      setRowLabel(row, text) {
        requireIndex('row', row, MAX_ROW);
        this.model.rows[row].rowLabel.val = requireText('text', text);
      },

      /**
       * @noagent öffnet die Großansicht der Oberfläche, kein Zustandsweg.
       * Zeigt das Bild eines Feldes vergrößert in einem breiten Dialog
       * (Halter x-ref="enlargedView").
       * @param {number} r  row index
       * @param {number} c  column index
       */
      enlarge(r, c) {
        this._enlargedDialog?.close();
        this.enlarged = { r, c };
        this._enlargedDialog = module._context.dialog.show({
          title: this.imageAlt(r, c),
          size: 'wide',
          content: this.$refs.enlargedView,
          onClose: () => { this.enlarged = null; this._enlargedDialog = null; },
        });
      },

      /** @noagent lifecycle */
      destroy() {
        this._enlargedDialog?.close();
      },
    };
  },
});
