/**
 * D.Mike — VoC → CTx Tree Module (voc-ctx-tree.js)
 * Define phase: translate Voice of Customer statements into a CTx hierarchy
 * (Needs → Drivers → Requirements).
 *
 * Migrated to createModule + Alpine CSP. The Model (voc-ctx-tree-model.js) holds
 * the persisted state (vocs tree + activeVocId + appearance styles) plus all node
 * CRUD, sibling reorder, and export-row flattening. This data-fn owns the view
 * transforms (card/ node CSS classes, i18n badge/ count text), the add/edit/delete
 * form handlers (content lent to the dialog service), the
 * badge-handle drag reordering (transient state), the export dropdown + exporters,
 * and the imperative appearance settings panel (chart-editor building blocks).
 *
 * No HTML is built in JS for the module UI — the tree, cards, and node form
 * live in voc-ctx-tree.html. The settings panel is the documented imperative
 * exception (chart-editor widgets); the PNG/SVG export draws through the
 * `node-diagram` chart type.
 *
 * Spec: docs/modules/VOC-CTX-TREE.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Kundenstimmen anlegen,
 *   ändern, auswählen und entfernen; darunter Bedürfnisse, Treiber (CTQ, CTD,
 *   CTC) und Anforderungen mit Zielwert und Messgröße; die Reihenfolge von
 *   Geschwisterknoten; Randstärke und Knotenfarben der Darstellung. Der
 *   Oberfläche bleiben der Formulardialog samt seinem Entwurf, die Rückfrage
 *   vor dem Löschen einer Kundenstimme, die Maus-Gestik des Umsortierens und
 *   der Dateidownload.
 */

import { createModule } from '../../core/template-module.js';
import {
  edSection, edColorPair, edRangeRow, openColorPicker, parseRGBA, rgbaStr,
} from '../../core/chart/chart-editor.js';
import { ensureXLSX, downloadBlob } from '../../core/export-utils.js';
import { shortcutRegistry } from '../../core/shortcut-registry.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { State, VALID_TYPES, COLOR_KEYS } from './voc-ctx-tree-model.js';
import { buildTreeDiagram } from './voc-ctx-tree-diagram.js';

/** CSS custom-property map for the node colours, one per colour key. */
const COLOR_PROP = Object.fromEntries(COLOR_KEYS.map((key) => [key, `--color-vct-${key}`]));

/**
 * Die Schlüsselfläche von `setNodeColor`: je Knotentyp eine Füllfarbe.
 * Sätze je Typ unter `types.NodeColors.<typ>`.
 *
 * @typedef {object} NodeColors
 * @property {string} voc  Kundenstimme
 * @property {string} need  Bedürfnis
 * @property {string} ctq  Treiber Qualität (CTQ)
 * @property {string} ctd  Treiber Lieferung (CTD)
 * @property {string} ctc  Treiber Kosten (CTC)
 * @property {string} req  Anforderung
 */

// Die Randstärke läuft von 0 bis 4 in Schritten von 0,5 — genau die Stufen des
// Schiebereglers. `requireIndex` passt darauf nicht: es verlangt eine GANZE
// Zahl und meldete „allowed: 0..4", ließe also 2,5 fallen und 3,7 durch. Die
// erklärte Wertemenge ist hier der richtige Prüfer (Ruling 51).
const BORDER_WIDTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

// `parseRGBA` (chart-core.js:151) gibt bei einer unlesbaren Farbe STILL ein
// Grau zurück. Ungeprüft hätte ein Agent damit Erfolg gemeldet und eine
// andere Farbe bekommen, als er gesetzt hat — deshalb die Form hier vorab.
// Das Alpha steht hier mit BELIEBIG vielen Nachkommastellen: der geteilte
// Farbwähler (`core/color-picker.js`, `rgbaStr`) schreibt es über
// `a.toFixed(2)`, liefert also `1.00` für eine deckende Farbe — und alle sechs
// Vorgabefarben sind deckend. Eine engere Gruppe (`0|1|0?\.\d+`) lehnte genau
// die Schreibweise ab, die die eigene Oberfläche erzeugt, und das Einfärben
// der Knoten war damit kaputt. Werte über 1 bleiben ungültig.
// Die Kanäle fängt das Muster als Gruppen; 0..255 prüft `requireColor`
// danach — `rgb(300,0,0)` passte sonst und ergäbe ein kaputtes Hex.
const COLOR_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*)?\)$/;

/**
 * Eine Farbe gegen ihre Schreibweise prüfen.
 * @param {string} name Name des Arguments (erscheint in der Meldung)
 * @param {any} value der übergebene Wert
 * @throws {Error} wenn `value` keine Farbe als `rgb()`/`rgba()` mit Kanälen 0..255 ist
 * @returns {void}
 */
function requireColor(name, value) {
  const m = typeof value === 'string' ? COLOR_RE.exec(value) : null;
  if (!m || m.slice(1, 4).some((c) => Number(c) > 255)) {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: rgb(r,g,b) or rgba(r,g,b,a)`);
  }
}

export default createModule({
  config: {
    id: 'voc-ctx-tree',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.voc-ctx-tree',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...agentReadMixin(module),

      // ── Transient UI state (never persisted) ──────────────────
      /** @type {string|null} export dropdown open flag */
      exportMenuOpen: false,
      /** @type {string|null} 'voc' | 'need' | 'driver' | 'req' — open form kind */
      modalKind: null,
      /** @type {object} working copy of the form fields */
      modalData: { text: '', source: '', type: 'ctq', target: '', measure: '' },
      /** @type {object} context ids for the current edit (vocId/needId/drvId) + editId */
      modalCtx: {},
      /** @type {{confirm: Function, cancel: Function}|null} open form dialog's api */
      _formApi: null,
      /** @type {{kind:string, scope:object, id:string}|null} active drag source */
      _drag: null,

      // ── View transforms ───────────────────────────────────────
      /** @noagent view transform: hebt die ausgewählte Karte hervor. */
      cardClass(voc) {
        return voc.id === this.model.activeVocId ? 'vct__card--active' : '';
      },
      /** @noagent view transform: „{needs} Needs · {reqs} Req." auf der Karte. */
      cardCountText(voc) {
        return `${voc.needs.length  } ${  _t('needCount') 
          } · ${  this.model.totalReqs(voc)  } Req.`;
      },
      /** @noagent view transform: setzt den Text in Anführungszeichen. */
      quoted(text) { return `„${  text  }“`; },
      /** @noagent view transform: die Herkunftszeile eines Knotens. */
      sourceLine(src) { return `${_t('source')  }: ${  src}`; },
      /** @noagent view transform: die Zielwertzeile einer Anforderung. */
      targetLine(v) { return `${_t('target')  }: ${  v}`; },
      /** @noagent view transform: die Messgrößenzeile einer Anforderung. */
      measureLine(v) { return `${_t('measurement')  }: ${  v}`; },
      /** @noagent view transform: die Treiberart als Kürzel in Großbuchstaben. */
      driverBadge(type) { return type.toUpperCase(); },
      /** @noagent view transform: die Knotenklasse der Treiberart. */
      driverNodeClass(drv) { return `vct__node--${  drv.type}`; },
      /** @noagent view transform: die Kindklasse der Treiberart. */
      driverChildrenClass(drv) { return `vct__children--${  drv.type}`; },
      /** @noagent view transform: hebt die gewählte Treiberart im Formular hervor. */
      typeOptClass(type) {
        return this.modalData.type === type ? `vct__type-option--${  type}` : '';
      },

      // ── Form labels / placeholders (per modal kind) ───────────
      /** @noagent view transform: die Feldbeschriftung des Formulars. */
      textLabel() {
        const k = this.modalKind;
        if (k === 'voc') return `${_t('vocText')  } *`;
        if (k === 'need') return `${_t('needText')  } *`;
        if (k === 'driver') return `${_t('driverText')  } *`;
        return `${_t('reqText')  } *`;
      },
      /** @noagent view transform: der Platzhalter des Formulars. */
      textPlaceholder() {
        const k = this.modalKind;
        if (k === 'voc') return _t('vocPlaceholder');
        if (k === 'need') return _t('needPlaceholder');
        if (k === 'driver') return _t('driverPlaceholder');
        return _t('reqPlaceholder');
      },
      /** @noagent view transform: die Höchstlänge des Formularfelds. */
      textMaxLength() {
        return this.modalKind === 'voc' ? 1000 : 500;
      },
      /** @noagent view transform: die Überschrift des Formulars. */
      modalTitle() {
        const editing = Boolean(this.modalCtx.editId);
        const k = this.modalKind;
        if (k === 'voc') return _t(editing ? 'editVoc' : 'addVoc');
        if (k === 'need') return _t(editing ? 'editNeed' : 'addNeed');
        if (k === 'driver') return _t(editing ? 'editDriver' : 'addDriver');
        return _t(editing ? 'editReq' : 'addReq');
      },

      // ── VoC handlers ──────────────────────────────────────────
      /** Re-apply the per-node inline border width after the tree re-renders. */
      _afterMutate() {
        this.$nextTick(() => this.applyStyles());
      },
      /**
       * @noagent DOM event handler: packt den Klick aus, um einen Treffer auf
       * den Karten-Knöpfen auszuschließen. Geschrieben wird über
       * `setActiveVoc`, dieselbe Senke wie die der Agentenfläche.
       */
      selectVoc(id, event) {
        if (event && event.target.closest('.vct__card-action-btn')) return;
        this.setActiveVoc(id);
      },
      /**
       * @noagent öffnet den Formulardialog für eine neue Kundenstimme; ein
       * Agent darf keinen Dialog öffnen — er blockierte den Stapel.
       */
      openVocModal() {
        this._openModal('voc', {}, { text: '', source: '' });
      },
      /**
       * @noagent öffnet den Formulardialog einer vorhandenen Kundenstimme und
       * füllt seinen Entwurf; ein Agent darf keinen Dialog öffnen.
       */
      editVoc(voc, event) {
        event?.stopPropagation?.();
        this._openModal('voc', { editId: voc.id }, { text: voc.text, source: voc.source || '' });
      },
      /**
       * @noagent fragt vor dem Löschen zurück; ein Agent darf keine Rückfrage
       * auslösen — er blockierte den Stapel. Delegiert an `removeVoc`.
       */
      async deleteVoc(voc, event) {
        event?.stopPropagation?.();
        const ok = await module._context.dialog.confirm({
          message: _t('deleteVocConfirm'),
          danger: true,
        });
        if (!ok) return;
        if (this.model.vocs.some((v) => v.id === voc.id)) this.removeVoc(voc.id);
      },

      /**
       * Legt eine Kundenstimme an und wählt sie aus.
       * @agent
       * @param {string} text der Wortlaut der Kundenstimme
       * @param {string} [source] woher sie stammt; leer heißt ohne Angabe
       * @returns {string|null} die id der neuen Kundenstimme, oder null wenn
       *   der Wortlaut leer war und nichts angelegt wurde
       * @throws {Error} wenn `text` oder `source` keine Zeichenkette ist
       */
      addVoc(text, source = '') {
        requireText('text', text);
        requireText('source', source);
        const trimmed = text.trim();
        // Ein leerer Wortlaut ist eine fachliche Absage, kein ungültiges
        // Argument: das Formular verwirft ihn genauso und legt nichts an.
        if (!trimmed) return null;
        const id = this.model.addVoc(trimmed, source.trim());
        this._afterMutate();
        return id;
      },

      /**
       * Ändert Wortlaut und Herkunft einer Kundenstimme.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} text der neue Wortlaut
       * @param {string} source die neue Herkunft; leer heißt ohne Angabe
       * @returns {boolean} true wenn geändert wurde, false wenn der Wortlaut
       *   leer war und alles stehen blieb
       * @throws {Error} wenn keine Kundenstimme diese id trägt oder `text`
       *   oder `source` keine Zeichenkette ist
       */
      updateVoc(vocId, text, source) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireText('text', text);
        requireText('source', source);
        const trimmed = text.trim();
        if (!trimmed) return false;
        this.model.updateVoc(vocId, trimmed, source.trim());
        this._afterMutate();
        return true;
      },

      /**
       * Entfernt eine Kundenstimme samt ihrem Baum. War sie ausgewählt, rückt
       * die erste verbleibende nach.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @returns {void}
       * @throws {Error} wenn keine Kundenstimme diese id trägt
       */
      removeVoc(vocId) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        this.model.deleteVoc(vocId);
        this._afterMutate();
      },

      /**
       * Wählt die Kundenstimme aus, deren Baum angezeigt wird.
       * @agent
       * @param {string|null} vocId id der Kundenstimme; `null` wählt keine aus
       * @returns {void}
       * @throws {Error} wenn keine Kundenstimme diese id trägt
       */
      setActiveVoc(vocId) {
        // `null` ist der dokumentierte Leerwert des Feldes (Ruling 52): das
        // Model setzt ihn selbst, wenn die letzte Stimme entfernt wird.
        requireKnownId('vocId', vocId, [null, ...this.model.vocs.map((v) => v.id)]);
        this.model.setActiveVoc(vocId);
        this._afterMutate();
      },

      // ── Need handlers ─────────────────────────────────────────
      /** @noagent öffnet den Formulardialog für ein neues Bedürfnis. */
      openNeedModal(vocId) {
        this._openModal('need', { vocId }, { text: '' });
      },
      /** @noagent öffnet den Formulardialog eines Bedürfnisses. */
      editNeed(vocId, need) {
        this._openModal('need', { vocId, editId: need.id }, { text: need.text });
      },

      /**
       * Legt ein Bedürfnis unter einer Kundenstimme an.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} text der Wortlaut des Bedürfnisses
       * @returns {string|null} die id des neuen Bedürfnisses, oder null wenn
       *   der Wortlaut leer war und nichts angelegt wurde
       * @throws {Error} wenn keine Kundenstimme diese id trägt oder `text`
       *   keine Zeichenkette ist
       */
      addNeed(vocId, text) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireText('text', text);
        const trimmed = text.trim();
        if (!trimmed) return null;
        const id = this.model.addNeed(vocId, trimmed);
        this._afterMutate();
        return id;
      },

      /**
       * Ändert den Wortlaut eines Bedürfnisses.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} text der neue Wortlaut
       * @returns {boolean} true wenn geändert wurde, false wenn der Wortlaut
       *   leer war und alles stehen blieb
       * @throws {Error} wenn keine Kundenstimme oder kein Bedürfnis diese id
       *   trägt oder `text` keine Zeichenkette ist
       */
      updateNeed(vocId, needId, text) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireText('text', text);
        const trimmed = text.trim();
        if (!trimmed) return false;
        this.model.updateNeed(vocId, needId, trimmed);
        this._afterMutate();
        return true;
      },

      /**
       * Entfernt ein Bedürfnis samt seinen Treibern und Anforderungen.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @returns {void}
       * @throws {Error} wenn keine Kundenstimme oder kein Bedürfnis diese id
       *   trägt
       */
      deleteNeed(vocId, needId) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        this.model.deleteNeed(vocId, needId);
        this._afterMutate();
      },

      // ── Driver handlers ───────────────────────────────────────
      /** @noagent öffnet den Formulardialog für einen neuen Treiber. */
      openDriverModal(vocId, needId) {
        this._openModal('driver', { vocId, needId }, { text: '', type: 'ctq' });
      },
      /**
       * @noagent öffnet den Formulardialog eines Treibers. Die Art wird
       * auf die Auswahl des Formulars normalisiert: `fromJSON` lässt sie als
       * freien Text durch, ein importierter Baum darf also eine unbekannte
       * Art tragen, und `updateDriver` lehnte sie beim Speichern ab.
       */
      editDriver(vocId, needId, drv) {
        this._openModal('driver', { vocId, needId, editId: drv.id }, {
          text: drv.text,
          type: VALID_TYPES.includes(drv.type) ? drv.type : 'ctq',
        });
      },

      /**
       * Legt einen Treiber unter einem Bedürfnis an.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} text der Wortlaut des Treibers
       * @param {'ctq'|'ctd'|'ctc'} type die Treiberart
       * @returns {string|null} die id des neuen Treibers, oder null wenn der
       *   Wortlaut leer war und nichts angelegt wurde
       * @throws {Error} wenn keine Kundenstimme oder kein Bedürfnis diese id
       *   trägt, `text` keine Zeichenkette ist oder `type` keine der drei
       *   Treiberarten ist
       */
      addDriver(vocId, needId, text, type) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireText('text', text);
        requireEnum('type', type, VALID_TYPES);
        const trimmed = text.trim();
        if (!trimmed) return null;
        const id = this.model.addDriver(vocId, needId, trimmed, type);
        this._afterMutate();
        return id;
      },

      /**
       * Ändert Wortlaut und Art eines Treibers.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} drvId id des Treibers
       * @param {string} text der neue Wortlaut
       * @param {'ctq'|'ctd'|'ctc'} type die neue Treiberart
       * @returns {boolean} true wenn geändert wurde, false wenn der Wortlaut
       *   leer war und alles stehen blieb
       * @throws {Error} wenn eine der drei ids unbekannt ist, `text` keine
       *   Zeichenkette ist oder `type` keine der drei Treiberarten ist
       */
      updateDriver(vocId, needId, drvId, text, type) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireKnownId('drvId', drvId, this._driverIds(vocId, needId));
        requireText('text', text);
        requireEnum('type', type, VALID_TYPES);
        const trimmed = text.trim();
        if (!trimmed) return false;
        this.model.updateDriver(vocId, needId, drvId, trimmed, type);
        this._afterMutate();
        return true;
      },

      /**
       * Entfernt einen Treiber samt seinen Anforderungen.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} drvId id des Treibers
       * @returns {void}
       * @throws {Error} wenn eine der drei ids unbekannt ist
       */
      deleteDriver(vocId, needId, drvId) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireKnownId('drvId', drvId, this._driverIds(vocId, needId));
        this.model.deleteDriver(vocId, needId, drvId);
        this._afterMutate();
      },

      // ── Requirement handlers ──────────────────────────────────
      /** @noagent öffnet den Formulardialog für eine neue Anforderung. */
      openReqModal(vocId, needId, drvId) {
        this._openModal('req', { vocId, needId, drvId }, { text: '', target: '', measure: '' });
      },
      /** @noagent öffnet den Formulardialog einer Anforderung. */
      editReq(vocId, needId, drvId, req) {
        this._openModal('req', { vocId, needId, drvId, editId: req.id },
          { text: req.text, target: req.target || '', measure: req.measure || '' });
      },

      /**
       * Legt eine Anforderung unter einem Treiber an.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} drvId id des Treibers
       * @param {string} text der Wortlaut der Anforderung
       * @param {string} [target] der Zielwert; leer heißt ohne Zielwert
       * @param {string} [measure] die Messgröße; leer heißt ohne Messgröße
       * @returns {string|null} die id der neuen Anforderung, oder null wenn
       *   der Wortlaut leer war und nichts angelegt wurde
       * @throws {Error} wenn eine der drei ids unbekannt ist oder `text`,
       *   `target` oder `measure` keine Zeichenkette ist
       */
      addRequirement(vocId, needId, drvId, text, target = '', measure = '') {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireKnownId('drvId', drvId, this._driverIds(vocId, needId));
        requireText('text', text);
        requireText('target', target);
        requireText('measure', measure);
        const trimmed = text.trim();
        if (!trimmed) return null;
        const id = this.model.addRequirement(vocId, needId, drvId, trimmed, target.trim(), measure.trim());
        this._afterMutate();
        return id;
      },

      /**
       * Ändert Wortlaut, Zielwert und Messgröße einer Anforderung.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} drvId id des Treibers
       * @param {string} reqId id der Anforderung
       * @param {string} text der neue Wortlaut
       * @param {string} target der neue Zielwert; leer heißt ohne Zielwert
       * @param {string} measure die neue Messgröße; leer heißt ohne Messgröße
       * @returns {boolean} true wenn geändert wurde, false wenn der Wortlaut
       *   leer war und alles stehen blieb
       * @throws {Error} wenn eine der vier ids unbekannt ist oder `text`,
       *   `target` oder `measure` keine Zeichenkette ist
       */
      updateRequirement(vocId, needId, drvId, reqId, text, target, measure) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireKnownId('drvId', drvId, this._driverIds(vocId, needId));
        requireKnownId('reqId', reqId, this._reqIds(vocId, needId, drvId));
        requireText('text', text);
        requireText('target', target);
        requireText('measure', measure);
        const trimmed = text.trim();
        if (!trimmed) return false;
        this.model.updateRequirement(vocId, needId, drvId, reqId, trimmed, target.trim(), measure.trim());
        this._afterMutate();
        return true;
      },

      /**
       * Entfernt eine Anforderung.
       * @agent
       * @param {string} vocId id der Kundenstimme
       * @param {string} needId id des Bedürfnisses
       * @param {string} drvId id des Treibers
       * @param {string} reqId id der Anforderung
       * @returns {void}
       * @throws {Error} wenn eine der vier ids unbekannt ist
       */
      deleteReq(vocId, needId, drvId, reqId) {
        requireKnownId('vocId', vocId, this.model.vocs.map((v) => v.id));
        requireKnownId('needId', needId, this._needIds(vocId));
        requireKnownId('drvId', drvId, this._driverIds(vocId, needId));
        requireKnownId('reqId', reqId, this._reqIds(vocId, needId, drvId));
        this.model.deleteRequirement(vocId, needId, drvId, reqId);
        this._afterMutate();
      },

      // ── id-Listen für die Argumentprüfungen ───────────────────
      _needIds(vocId) {
        return (this.model.findVoc(vocId)?.needs ?? []).map((n) => n.id);
      },
      _driverIds(vocId, needId) {
        const need = (this.model.findVoc(vocId)?.needs ?? []).find((n) => n.id === needId);
        return (need?.drivers ?? []).map((d) => d.id);
      },
      _reqIds(vocId, needId, drvId) {
        const need = (this.model.findVoc(vocId)?.needs ?? []).find((n) => n.id === needId);
        const drv = (need?.drivers ?? []).find((d) => d.id === drvId);
        return (drv?.requirements ?? []).map((r) => r.id);
      },

      // ── Modal open / save ─────────────────────────────────────
      /**
       * Open the node form in a form dialog. The form lives hidden in the
       * template (x-ref="nodeForm") and is borrowed by the dialog.
       * @param {'voc'|'need'|'driver'|'req'} kind
       * @param {object} ctx  context ids (vocId/needId/drvId) + editId
       * @param {object} fields  initial field values
       * @returns {Promise<void>} resolves once the dialog is closed
       */
      async _openModal(kind, ctx, fields) {
        this.modalCtx = ctx;
        this.modalData = { text: '', source: '', type: 'ctq', target: '', measure: '', ...fields };
        this.modalKind = kind;
        await this.$nextTick(); // let the kind-specific fields render before lending
        try {
          await module._context.dialog.form({
            title: this.modalTitle(),
            content: this.$refs.nodeForm,
            confirmLabel: module._context.i18n.t('common.save'),
            cancelLabel: module._context.i18n.t('common.cancel'),
            onMount: (body, api) => {
              this._formApi = api;
              body.querySelector('[data-ref="modalText"]')?.focus();
            },
            onConfirm: () => this.saveModal(),
          });
        } finally {
          this._formApi = null;
          this.modalKind = null;
        }
      },
      /** @noagent DOM event handler: Strg+Enter schließt das Formular ab. */
      commitKey(event) {
        if (this._formApi && shortcutRegistry.matches(event, 'vocCtxTree.commit')) {
          event.preventDefault();
          this._formApi.confirm();
        }
      },
      /**
       * @noagent schließt den Formulardialog ab; ein Agent darf keinen Dialog
       * bedienen. Geschrieben wird über `addVoc`/`updateVoc` und ihre
       * Geschwister — dieselben Senken wie die der Agentenfläche.
       * @returns {boolean} false hält den Dialog offen (leerer Text)
       */
      saveModal() {
        const d = this.modalData;
        const text = (d.text || '').trim();
        if (!text) {
          this.$refs.nodeForm.querySelector('[data-ref="modalText"]')?.focus();
          return false;
        }
        const ctx = this.modalCtx;
        const k = this.modalKind;
        const source = String(d.source || '');
        const target = String(d.target || '');
        const measure = String(d.measure || '');
        const type = d.type || 'ctq';
        // Ein Eintrag, der zwischen dem Öffnen und dem Speichern verschwunden
        // ist, wird neu angelegt — dasselbe Verhalten wie vor dem Umbau, als
        // das Model bei unbekannter id still zurückkehrte.
        const editing = ctx.editId && this._editTargetExists(k, ctx);
        if (k === 'voc') {
          if (editing) this.updateVoc(ctx.editId, text, source);
          else this.addVoc(text, source);
        } else if (k === 'need') {
          if (editing) this.updateNeed(ctx.vocId, ctx.editId, text);
          else this.addNeed(ctx.vocId, text);
        } else if (k === 'driver') {
          if (editing) this.updateDriver(ctx.vocId, ctx.needId, ctx.editId, text, type);
          else this.addDriver(ctx.vocId, ctx.needId, text, type);
        } else if (k === 'req') {
          if (editing) this.updateRequirement(ctx.vocId, ctx.needId, ctx.drvId, ctx.editId, text, target, measure);
          else this.addRequirement(ctx.vocId, ctx.needId, ctx.drvId, text, target, measure);
        }
        return true;
      },
      _editTargetExists(kind, ctx) {
        if (kind === 'voc') return this.model.vocs.some((v) => v.id === ctx.editId);
        if (kind === 'need') return this._needIds(ctx.vocId).includes(ctx.editId);
        if (kind === 'driver') return this._driverIds(ctx.vocId, ctx.needId).includes(ctx.editId);
        return this._reqIds(ctx.vocId, ctx.needId, ctx.drvId).includes(ctx.editId);
      },

      // ── Drag-and-drop reordering (badge handle → native drag) ─
      // Mirror legacy: arming a node for native HTML5 drag happens synchronously
      // on the badge mousedown (so the subsequent dragstart can fire). The node
      // is disarmed on the global mouseup (registered in init()).
      /** @noagent DOM event handler: ein Agent kann kein DragEvent erzeugen. */
      startDrag(event) {
        const node = event.target.closest('.vct__node[data-drag-type]');
        if (node) node.setAttribute('draggable', 'true');
      },
      /** @noagent DOM event handler: ein Agent kann kein DragEvent erzeugen. */
      dragStart(scope, id, kind, event) {
        this._drag = { kind, scope, id };
        const node = event.target.closest('.vct__node[data-drag-type]');
        if (node) node.classList.add('vct__node--dragging');
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      },
      /** @noagent DOM event handler: ein Agent kann kein DragEvent erzeugen. */
      dragOver(event) {
        const drag = this._drag;
        const treeArea = event.currentTarget;
        const target = event.target.closest('.vct__node[data-drag-type]');
        if (!drag || !target || target.dataset.dragType !== drag.kind) return;
        if (!this._areDragSiblings(drag, target.dataset)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        treeArea.querySelectorAll('.vct__node--drag-over').forEach((n) =>
          n.classList.remove('vct__node--drag-over'));
        target.classList.add('vct__node--drag-over');
      },
      /**
       * @noagent DOM event handler: ein Agent kann kein DragEvent erzeugen.
       * Geschrieben wird über `reorderNodes`, dieselbe Senke wie die der
       * Agentenfläche.
       */
      drop(event) {
        event.preventDefault();
        const drag = this._drag;
        if (!drag) return;
        const target = event.target.closest('.vct__node[data-drag-type]');
        if (!target || target.dataset.dragType !== drag.kind) { this._clearDrag(event.currentTarget); return; }
        if (!this._areDragSiblings(drag, target.dataset)) { this._clearDrag(event.currentTarget); return; }
        const toId = this._targetId(drag.kind, target.dataset);
        this.reorderNodes(drag.kind, drag.scope, drag.id, toId);
        this._clearDrag(event.currentTarget);
      },
      /** @noagent DOM event handler: ein Agent kann kein DragEvent erzeugen. */
      dragEnd(event) {
        this._clearDrag(event.currentTarget);
      },
      _clearDrag(treeArea) {
        this._drag = null;
        if (treeArea) {
          treeArea.querySelectorAll('.vct__node--dragging').forEach((n) =>
            n.classList.remove('vct__node--dragging'));
          treeArea.querySelectorAll('.vct__node--drag-over').forEach((n) =>
            n.classList.remove('vct__node--drag-over'));
        }
      },
      _areDragSiblings(drag, targetDs) {
        const s = drag.scope;
        switch (drag.kind) {
          case 'need':   return s.vocId === targetDs.vocId;
          case 'driver': return s.vocId === targetDs.vocId && s.needId === targetDs.needId;
          case 'req':    return s.vocId === targetDs.vocId && s.needId === targetDs.needId && s.drvId === targetDs.drvId;
        }
        return false;
      },
      _targetId(kind, ds) {
        if (kind === 'need') return ds.needId;
        if (kind === 'driver') return ds.drvId;
        return ds.reqId;
      },

      // ── Export ────────────────────────────────────────────────
      /** @noagent DOM event handler: öffnet die Ausgabeliste der Oberfläche. */
      toggleExportMenu(event) {
        event.stopPropagation();
        this.exportMenuOpen = !this.exportMenuOpen;
        if (this.exportMenuOpen) this.$nextTick(() => this._positionExportMenu());
      },
      _positionExportMenu() {
        const btn = this.$el.querySelector('.vct__export-btn');
        const menu = this.$el.querySelector('[data-ref="exportMenu"]');
        if (!btn || !menu) return;
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 4  }px`;
        menu.style.left = `${rect.left  }px`;
        menu.style.right = 'auto';
      },
      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      onExport(fmt) {
        this.exportMenuOpen = false;
        if (fmt === 'csv') this.exportCSV();
        if (fmt === 'xlsx') this.exportXLSX();
        if (fmt === 'png') this.exportPNG();
        if (fmt === 'svg') this.exportSVG();
      },
      _exportHeaders() {
        const tk = _t;
        return [
          tk('legendVoc'), tk('vocSource'), tk('legendNeed'),
          tk('driverType'), 'CTx', tk('legendReq'), tk('target'), tk('measurement'),
        ];
      },
      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportCSV() {
        const rows = this.model.getExportRows();
        if (rows.length === 0) return;
        const esc = (v) => {
          const s = String(v ?? '');
          return (s.includes(';') || s.includes('"') || s.includes('\n'))
            ? `"${  s.replace(/"/g, '""')  }"`
            : s;
        };
        const lines = [this._exportHeaders().map(esc).join(';')];
        for (const row of rows) lines.push(row.map(esc).join(';'));
        const blob = new Blob([`\uFEFF${  lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'voc-ctx-tree.csv');
      },
      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      async exportXLSX() {
        const rows = this.model.getExportRows();
        if (rows.length === 0) return;
        // A failed load already toasted (core/chunks.js).
        let XLSX;
        try { XLSX = await ensureXLSX(); } catch { return; }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([this._exportHeaders(), ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'VoC-CTx');
        XLSX.writeFile(wb, 'voc-ctx-tree.xlsx');
      },
      _buildDiagram() {
        const tk = _t;
        return buildTreeDiagram(this.model.activeVoc, this.model.styles, {
          source: tk('source'),
          badgeNeed: tk('badgeNeed'),
          badgeReq: tk('badgeReq'),
          target: tk('target'),
          measurement: tk('measurement'),
        });
      },
      /** @noagent Bildexport über das Chart-Framework (themenbewusst); ein Agent liest den Zustand über `read()`. */
      async _exportImage(fmt) {
        const diagram = this._buildDiagram();
        if (!diagram) return;
        await module._context.chartManager.exportOffscreen('node-diagram', diagram, fmt, 'voc-ctx-tree');
      },
      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportPNG() { return this._exportImage('png'); },
      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportSVG() { return this._exportImage('svg'); },

      /**
       * Verschiebt einen Knoten an die Stelle eines Geschwisterknotens.
       * @agent
       * @param {'need'|'driver'|'req'} kind die Ebene, auf der verschoben wird
       * @param {object} scope die Elternkette: `vocId` für ein Bedürfnis,
       *   zusätzlich `needId` für einen Treiber, zusätzlich `drvId` für eine
       *   Anforderung
       * @param {string} fromId id des Knotens, der verschoben wird
       * @param {string} toId id des Geschwisterknotens, an dessen Stelle er rückt
       * @returns {boolean} true wenn verschoben wurde, false wenn beide ids
       *   dieselbe waren und die Reihenfolge stehen blieb
       * @throws {Error} wenn `kind` keine der drei Ebenen ist, eine id der
       *   Elternkette unbekannt ist oder `fromId` oder `toId` kein
       *   Geschwisterknoten dieser Ebene ist
       */
      reorderNodes(kind, scope, fromId, toId) {
        requireEnum('kind', kind, ['need', 'driver', 'req']);
        if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
          throw new Error(`invalid scope ${JSON.stringify(scope)}; allowed: an object with at least vocId`);
        }
        requireKnownId('vocId', scope.vocId, this.model.vocs.map((v) => v.id));
        let siblings;
        if (kind === 'need') {
          siblings = this._needIds(scope.vocId);
        } else if (kind === 'driver') {
          requireKnownId('needId', scope.needId, this._needIds(scope.vocId));
          siblings = this._driverIds(scope.vocId, scope.needId);
        } else {
          requireKnownId('needId', scope.needId, this._needIds(scope.vocId));
          requireKnownId('drvId', scope.drvId, this._driverIds(scope.vocId, scope.needId));
          siblings = this._reqIds(scope.vocId, scope.needId, scope.drvId);
        }
        requireKnownId('fromId', fromId, siblings);
        requireKnownId('toId', toId, siblings);
        if (fromId === toId) return false;
        this.model.reorderNodes(kind, scope, fromId, toId);
        this._afterMutate();
        return true;
      },

      /**
       * Setzt die Randstärke der Knoten.
       * @agent
       * @param {number} width die Randstärke in Pixeln, von 0 bis 4 in
       *   Schritten von 0,5
       * @returns {void}
       * @throws {Error} wenn `width` keine dieser Stufen ist
       */
      setBorderWidth(width) {
        requireEnum('width', width, BORDER_WIDTHS);
        this.model.styles.borderWidth = width;
        this._afterMutate();
      },

      /**
       * Setzt die Farbe einer Knotenart.
       * @agent
       * @param {keyof NodeColors} key welcher Knotentyp
       * @param {string} color die Farbe als rgb(…) oder rgba(…)
       * @returns {void}
       * @throws {Error} wenn `key` keine der sechs Knotenarten oder `color`
       *   keine Farbe in dieser Schreibweise ist
       */
      setNodeColor(key, color) {
        requireEnum('key', key, COLOR_KEYS);
        requireColor('color', color);
        this.model.styles.colors[key] = color;
        this._afterMutate();
      },

      // ── Appearance settings panel (chart-editor widgets) ──────
      /** @noagent view transform: schreibt die Darstellung in die CSS-Variablen. */
      applyStyles() {
        const root = this.$el.querySelector('.vct') || this.$el;
        if (!root) return;
        const s = this.model.styles;
        // The node form is lent to the dialog service and leaves .vct while
        // open, so it carries its own copy of the colour properties.
        const targets = [root, this.$refs.nodeForm].filter(Boolean);
        for (const [key, prop] of Object.entries(COLOR_PROP)) {
          const c = parseRGBA(s.colors[key]);
          for (const el of targets) {
            el.style.setProperty(prop, rgbaStr({ ...c, a: 1 }));
            el.style.setProperty(`${prop}-bg`, rgbaStr({ ...c, a: 0.06 }));
            el.style.setProperty(`${prop}-border`, rgbaStr({ ...c, a: 0.20 }));
            el.style.setProperty(`${prop}-badge-bg`, rgbaStr({ ...c, a: 0.12 }));
            el.style.setProperty(`${prop}-line`, rgbaStr({ ...c, a: 0.25 }));
          }
        }
        root.querySelectorAll('.vct__node').forEach((node) => {
          node.style.borderWidth = `${s.borderWidth}px`;
        });
      },
      _buildSettingsPanel() {
        const panel = this.$el.querySelector('[data-ref="settingsPanel"]');
        if (!panel) return;
        panel.replaceChildren();
        const tk = _t;
        const section = edSection(tk('settings'));

        const colorKeys = [
          { key: 'voc',  label: tk('colorVoc'),  tip: tk('colorVocTip') },
          { key: 'need', label: tk('colorNeed') },
          { key: 'ctq',  label: tk('colorCtq'),  tip: tk('colorCtqTip') },
          { key: 'ctd',  label: tk('colorCtd'),  tip: tk('colorCtdTip') },
          { key: 'ctc',  label: tk('colorCtc'),  tip: tk('colorCtcTip') },
          { key: 'req',  label: tk('colorReq') },
        ];
        for (const { key, label, tip } of colorKeys) {
          const { el, swatch } = edColorPair(label, this.model.styles.colors[key], (e) => {
            openColorPicker(e, this.model.styles.colors[key], (newColor) => {
              // Geschrieben wird über `setNodeColor` — dieselbe Senke wie die
              // der Agentenfläche, eine Zuweisungsstelle je Feld.
              this.setNodeColor(key, newColor);
              swatch.style.background = newColor;
            });
          });
          if (tip) el.title = tip;
          section.appendChild(el);
        }
        section.appendChild(edRangeRow(tk('borderWidth'), this.model.styles.borderWidth, (val) => {
          // Dieselbe Senke wie die der Agentenfläche; der Schieberegler
          // liefert seine Stufe als Zeichenkette, deshalb das `Number`.
          this.setBorderWidth(Number(val));
        }, 0, 4, 0.5));

        panel.appendChild(section);
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      /** @noagent lifecycle, kein Zustandsweg. */
      init() {
        // Re-arm native drag once the dragId flips a node to draggable=true:
        // bind a single dragstart on the tree area that reads the armed node.
        this.$nextTick(() => {
          this._buildSettingsPanel();
          this.applyStyles();
          const treeArea = this.$el.querySelector('[data-ref="treeArea"]');
          if (treeArea) {
            this._onDragStart = (event) => {
              const node = event.target.closest('.vct__node[data-drag-type]');
              if (!node || node.getAttribute('draggable') !== 'true') return;
              const ds = node.dataset;
              const kind = ds.dragType;
              const scope = { vocId: ds.vocId, needId: ds.needId, drvId: ds.drvId };
              const id = this._targetId(kind, ds);
              this.dragStart(scope, id, kind, event);
            };
            treeArea.addEventListener('dragstart', this._onDragStart);
          }
          // Release draggable after mouseup anywhere (mirror legacy mouseup reset).
          this._onMouseUp = () => {
            const ta = this.$el.querySelector('[data-ref="treeArea"]');
            ta?.querySelectorAll('.vct__node[draggable]').forEach((n) => n.removeAttribute('draggable'));
          };
          document.addEventListener('mouseup', this._onMouseUp);
        });
      },
      /** @noagent lifecycle, kein Zustandsweg. */
      destroy() {
        this._formApi?.cancel();
        if (this._onMouseUp) {
          document.removeEventListener('mouseup', this._onMouseUp);
          this._onMouseUp = null;
        }
        this._onDragStart = null;
      },
    };
  },
});
