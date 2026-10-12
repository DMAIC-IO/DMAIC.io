/**
 * D.Mike — Deployment Flowchart Module (deployment-flowchart.js)
 * Horizontal lanes (roles / departments) with the process chain running
 * left-to-right inside them. DMAIC phase: Analyze.
 *
 * createModule + Alpine CSP entry point, modeled on the Activity and
 * Opportunity Flowcharts. The Model (deployment-flowchart-model.js) holds
 * the persisted state (steps[] with laneId, plus the state-level lanes[])
 * and all CRUD/reorder logic. This data-fn owns the view transforms
 * (per-lane step lists, lane labels), the active-lane selection that new
 * steps land in, lane drag-drop assignment, the generic cross-module import
 * picker, and the export dropdown (JSON now; PNG/SVG follow with the shared
 * flowchart renderer).
 *
 * `help` is intentionally not imported/wired here — createModule resolves it
 * automatically from `<id>-help.js` via the build-generated help registry.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Kette anlegen, Titel und
 *   Beschreibung setzen, Bahnen anlegen/benennen/entfernen, einen Schritt
 *   einer Bahn zuweisen, entfernen. Der Dateidownload, der Import-Dialog und
 *   das Ziehen mit der Maus bleiben der UI vorbehalten.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { chainViewMixin } from '../../core/flowchart/flowchart-view.js';
import {
  listSourceInstances, appendFromInstance,
} from '../../core/flowchart/flowchart-import.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId, requireIndex } from '../../core/agent/agent-argcheck.js';
import { DeploymentModel, UNASSIGNED_ID } from './deployment-flowchart-model.js';

const IMPORT_SOURCES = ['process-map', 'sipoc'];

export default createModule({
  config: {
    id: 'deployment-flowchart',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.deployment-flowchart',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.add', title: 'addStep', variant: 'primary', agentAction: 'addStepUnassigned',
        onClick: (d) => d.addStepUnassigned() },
      { icon: 'action.add', title: 'addLane', agentAction: 'addLaneInline',
        onClick: (d) => d.addLaneInline() },
      { icon: 'action.upload', title: 'importFrom',
        onClick: (d) => d._openImport() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
        { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
      ] },
    ],
  },
  Model: DeploymentModel,

  data(module, _t) {
    return {
      ...agentReadMixin(module),
      ...chainViewMixin(module, _t, {
        autoSizeSelector: 'textarea.df__step-title, textarea.df__step-description',
        dragRowSelector: '.df__col',
      }),

      // ── Lifecycle (per Alpine instance) ───────────────────────
      /** @noagent lifecycle, kein Zustandsweg */
      init() {
        this.$nextTick(() => this._autoSizeAll());
      },

      /**
       * Eine Schritt-id gegen die Kette prüfen und den Schritt liefern — das
       * gemeinsame Vorgehen mehrerer Setter/Entferner. Privat (`_`-Präfix),
       * braucht keine Marke.
       * @param {string} stepId
       * @returns {object}
       * @throws {Error} wenn kein Schritt diese id trägt
       */
      _requireStep(stepId) {
        requireKnownId('stepId', stepId, this.model.steps.map((s) => s.id));
        return this.model.steps.find((s) => s.id === stepId);
      },

      // ── Lanes ─────────────────────────────────────────────────
      /** Steps of one lane, in chain order (the filter preserves the array order).
       * @noagent view transform */
      stepsForLane(laneId) {
        return this.model.steps.filter((s) => s.laneId === laneId);
      },

      /**
       * The reserved lane's label comes from i18n so it follows the UI
       * language; user lanes fall back to a placeholder while unnamed.
       * @noagent view transform
       */
      laneLabel(lane) {
        if (lane?.id === UNASSIGNED_ID) return _t('unassigned');
        return lane?.name || _t('unnamedLane');
      },
      /** @noagent view transform */
      isUnassigned(lane) { return lane?.id === UNASSIGNED_ID; },

      // Blendet die neue Karte ins Sichtfeld, falls die Kette breiter ist
      // als der Canvas — sonst wüchse sie aus dem Sichtbereich heraus (reine
      // UI-Mechanik, nicht Teil der Agentensemantik).
      /**
       * Hängt einen Schritt an die Kette und liefert seine id. Er landet
       * immer in der Bahn „Nicht zugeordnet": welche Rolle einen Schritt
       * trägt, ist eine bewusste Entscheidung, die erst die Zuweisung an
       * eine Bahn trifft.
       * @agent
       * @returns {string} id des angelegten Schritts
       */
      addStepUnassigned() {
        const step = this.model.addStep(this.model.steps.length, { laneId: UNASSIGNED_ID });
        this.$nextTick(() => {
          this._autoSizeAll();
          this._scrollToChainEnd();
        });
        return step.id;
      },

      /**
       * Setzt den Titel eines Schritts. Schreibt dasselbe Feld wie
       * `x-model="step.title"` in der Vorlage.
       * @agent
       * @param {string} stepId id des Schritts
       * @param {string} text der neue Titel
       * @returns {void}
       * @throws {Error} wenn kein Schritt diese id trägt
       */
      setStepTitle(stepId, text) {
        this._requireStep(stepId).title = String(text ?? '');
        this.$nextTick(() => this._autoSizeAll());
      },

      /**
       * Setzt die Beschreibung eines Schritts. Schreibt dasselbe Feld wie
       * `x-model="step.description"` in der Vorlage.
       * @agent
       * @param {string} stepId id des Schritts
       * @param {string} text die neue Beschreibung
       * @returns {void}
       * @throws {Error} wenn kein Schritt diese id trägt
       */
      setStepDescription(stepId, text) {
        this._requireStep(stepId).description = String(text ?? '');
        this.$nextTick(() => this._autoSizeAll());
      },

      /**
       * Weist einen vorhandenen Schritt einer Bahn zu; seine Kettenposition
       * bleibt. Schreibt dasselbe Feld wie der Drop auf ein Bahn-Band
       * (`dropOnLane`) in der Vorlage.
       * @agent
       * @param {string} stepId id des Schritts
       * @param {string} laneId id einer vorhandenen Bahn
       * @returns {void}
       * @throws {Error} wenn kein Schritt diese id trägt, oder laneId keine
       *   vorhandene Bahn benennt
       */
      setLaneForStep(stepId, laneId) {
        this._requireStep(stepId);
        requireKnownId('laneId', laneId, this.model.lanes.map((l) => l.id));
        this.model.setLaneForStep(stepId, laneId);
      },

      // Schreibt dasselbe wie die Löschtaste der Karte in der Vorlage
      // (vormals ein direkter `model.removeStep(step.id)`-Aufruf, jetzt über
      // diesen Sink geroutet — E2b).
      /**
       * Entfernt einen Schritt aus der Kette.
       * @agent
       * @param {string} stepId id des Schritts
       * @returns {void}
       * @throws {Error} wenn kein Schritt diese id trägt
       */
      removeStep(stepId) {
        this._requireStep(stepId);
        this.model.removeStep(stepId);
      },

      /**
       * Jump the horizontally scrolling canvas to the end of the chain, where
       * a newly appended step sits — otherwise a long chain hides the very card
       * the user just asked for. Assigning past the maximum clamps.
       * @returns {void}
       */
      _scrollToChainEnd() {
        const canvas = this.$root?.querySelector('.df__canvas');
        if (canvas) canvas.scrollLeft = canvas.scrollWidth;
      },

      // Fokussiert das Namensfeld der neuen Bahn, damit die Rolle sofort
      // eingetippt werden kann — reine UI-Mechanik, nicht Teil der
      // Agentensemantik; ein Agent benennt die Bahn über `setLaneName`.
      /**
       * Hängt eine unbenannte Bahn an und liefert ihre id.
       * @agent
       * @returns {string} id der angelegten Bahn
       */
      addLaneInline() {
        const lane = this.model.addLane('');
        this.$nextTick(() => {
          const input = this.$root?.querySelector(`.df__lane-name[data-lane-id="${lane.id}"]`);
          input?.focus();
        });
        return lane.id;
      },

      // Die reservierte Bahn ist nicht umbenennbar — die Vorlage zeigt für
      // sie auch kein Eingabefeld. Das Model liefert dafür `false` statt zu
      // werfen: eine bekannte, aber geschützte id ist eine fachliche Absage,
      // kein ungültiges Argument (agent-argcheck.js, „ungültiges Argument
      // wirft, fachliche Absage liefert einen Wert" — Fix-Runde 1, dasselbe
      // Muster wie `worksheet.undo()` bei leerer Historie). Nur eine
      // UNBEKANNTE id bleibt ein Fehler.
      /**
       * Benennt eine Bahn um. Schreibt dasselbe Feld wie `x-model="lane.name"`
       * in der Vorlage.
       * @agent
       * @param {string} laneId id der Bahn
       * @param {string} name der neue Name
       * @returns {boolean} `true`, wenn die Bahn umbenannt wurde; `false` für
       *   die reservierte Bahn „Nicht zugeordnet" — dann ist nichts passiert
       * @throws {Error} wenn laneId keine vorhandene Bahn benennt
       */
      setLaneName(laneId, name) {
        requireKnownId('laneId', laneId, this.model.lanes.map((l) => l.id));
        return this.model.renameLane(laneId, name);
      },

      // Dieselbe Absage wie bei `setLaneName()`: die reservierte Bahn ist
      // nicht entfernbar, die Vorlage zeigt für sie auch keine Löschtaste.
      /**
       * Entfernt eine Bahn; ihre Schritte wandern nach „Nicht zugeordnet".
       * @agent
       * @param {string} laneId id der Bahn
       * @returns {boolean} `true`, wenn die Bahn entfernt wurde; `false` für
       *   die reservierte Bahn „Nicht zugeordnet" — dann ist nichts passiert
       * @throws {Error} wenn laneId keine vorhandene Bahn benennt
       */
      removeLaneById(laneId) {
        requireKnownId('laneId', laneId, this.model.lanes.map((l) => l.id));
        return this.model.removeLane(laneId);
      },

      // Die Vorlage bietet dafür nur einen Verbinder zwischen zwei
      // vorhandenen Karten an (UI-Mechanik) — der Agent bekommt den vollen
      // Bereich 0..Kettenlänge, weil derselbe Zustand über Drag & Drop
      // (addStepUnassigned + dropOnLane) ohnehin erreichbar ist.
      /**
       * Fügt einen neuen Schritt an einer Lücke der Kette ein und liefert
       * seine id.
       * @agent
       * @param {number} idx Lücke, an der eingefügt wird (0 = vor dem ersten
       *   Schritt, bis zur Kettenlänge = ans Ende)
       * @param {string} laneId id einer vorhandenen Bahn, in der der neue
       *   Schritt landet
       * @returns {string} id des angelegten Schritts
       * @throws {Error} wenn idx keine ganze Zahl zwischen 0 und der
       *   Kettenlänge ist, oder laneId keine vorhandene Bahn benennt
       */
      insertBefore(idx, laneId) {
        requireIndex('idx', idx, this.model.steps.length);
        requireKnownId('laneId', laneId, this.model.lanes.map((l) => l.id));
        const step = this.model.insertStep(idx, { laneId });
        this.$nextTick(() => this._autoSizeAll());
        return step.id;
      },

      /**
       * Gap 0's rail belongs to the FIRST card and is drawn in that card's
       * lane. Lane and chain-end check are merged into one method because
       * Alpine CSP wants a single call per x-if (.claude/alpine.md).
       * @param {number} idx chain index of the column being rendered
       * @param {string} laneId lane of the slot being rendered
       * @returns {boolean}
       * @noagent view transform
       */
      railStart(idx, laneId) {
        return this.showStartRail(idx) && this.model.steps[idx].laneId === laneId;
      },

      /**
       * Gap n's rail belongs to the LAST card, in that card's lane.
       * @param {number} idx chain index of the column being rendered
       * @param {string} laneId lane of the slot being rendered
       * @returns {boolean}
       * @noagent view transform
       */
      railEnd(idx, laneId) {
        return this.showEndRail(idx) && this.model.steps[idx].laneId === laneId;
      },

      /**
       * Drop on a lane band: re-assign the dragged step, keep its chain position.
       * @noagent DOM event handler — ein Agent kann kein DragEvent erzeugen;
       *   die Zuordnung eines Schritts zu einer Bahn geht über `setLaneForStep`.
       */
      dropOnLane(laneId, event) {
        event?.preventDefault();
        const from = this._draggedStepId;
        this._draggedStepId = null;
        this._activeGap = null;
        this._activeBand = null;
        if (!from) return;
        this.model.setLaneForStep(from, laneId);
      },

      // ── Cross-module import (SIPOC / Process Map → Deployment) ──
      /** @type {Array<{instanceId:string, moduleId:string, title:string}>} */
      _importOptions: [],
      /** @type {string|null} */
      _importSelectedId: null,

      _pickImportOption(opt) {
        this._importSelectedId = opt.instanceId;
      },

      _openImport() {
        const sm = module._context.stateManager;
        this._importOptions = listSourceInstances({ sources: IMPORT_SOURCES, stateManager: sm });
        if (this._importOptions.length === 0) {
          module._context.notify?.(_t('importEmptyHint'), 'info');
          return;
        }
        this._importSelectedId = this._importOptions[0].instanceId;
        // Wait one Alpine tick so the x-for renders the option rows into the
        // importForm subtree before the modal borrows it.
        this.$nextTick(() => {
          module._context.showModal.form(
            _t('importTitle'),
            this.$refs.importForm,
            {
              confirmLabel: _t('importConfirm'),
              onMount: (body) => this._importFormMount(body),
              onConfirm: (body) => this._runImport(body),
            },
          );
        });
      },

      /** Modal-mount hook: wire plain-DOM change listeners on the borrowed radios. */
      _importFormMount(body) {
        const form = body?.querySelector?.('.df__import-form');
        if (!form) return;
        const wire = () => {
          const radios = form.querySelectorAll('.df__import-option input[type="radio"]');
          if (radios.length === 0) { requestAnimationFrame(wire); return; }
          radios.forEach((radio) => {
            if (radio.value === this._importSelectedId) radio.checked = true;
            radio.addEventListener('change', () => {
              if (radio.checked) this._importSelectedId = radio.value;
            });
          });
        };
        wire();
      },

      /** Read the picked instance from the borrowed form's checked radio and append. */
      _runImport(body) {
        const checked = body?.querySelector?.('.df__import-option input[type="radio"]:checked');
        const id = checked?.value || this._importSelectedId;
        const opt = this._importOptions.find((o) => o.instanceId === id);
        if (!opt) return false;
        const appended = appendFromInstance({
          targetModuleId: 'deployment-flowchart',
          sourceModuleId: opt.moduleId,
          instanceId: opt.instanceId,
          stateManager: module._context.stateManager,
          targetState: this.model,
        });
        module._context.notify?.(_t('importDone', { n: appended ? appended.length : 0 }), 'success');
        this.$nextTick(() => this._autoSizeAll());
        return true;
      },

      // ── Export ─────────────────────────────────────────────────
      _exportJSON() {
        downloadFile(JSON.stringify(this.model.toJSON(), null, 2), 'deployment-flowchart.json', 'application/json');
        module._context.notify?.('JSON', 'success', 'status.ok');
      },

      /**
       * @noagent lädt eine Datei herunter; ein Agent liest den Zustand über
       *   `read()`
       */
      onExport(format) {
        if (format === 'json') { this._exportJSON(); return; }
        // PNG/SVG rendering lands with the shared flowchart renderer.
        module._context.notify?.(_t('exportImageComingSoon'), 'info');
      },
    };
  },
});
