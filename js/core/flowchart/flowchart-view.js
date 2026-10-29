/**
 * D.Mike — Flowchart chain view mixin (flowchart-view.js)
 *
 * data()-mixin for the four flowchart modules: shared step drag/drop, the
 * sequence badge, substep interaction and textarea autosize. Spread into a
 * module's data() to inherit consistent chain interaction behavior. Modules
 * that need to do more on an action (Process Map redraws its loop brackets)
 * override the method after the spread — plain object-literal precedence.
 */

import { requireBoolean, requireIndex, requireKnownId, requireText } from '../agent/agent-argcheck.js';

/**
 * @param {object|null} module   the createModule instance (reserved for future hooks)
 * @param {(key: string) => string} _t   i18n helper
 * @param {{
 *   autoSizeSelector?: string,
 *   dragRowSelector?: string,    // element that carries `draggable`, armed by armStepDrag
 *   substepItemSelector?: string, // element that carries `draggable` for a substep
 *   canvasSelector?: string      // the sideways-scrolling box `revealStep` moves
 * }} [opts]
 * @returns {object} data()-mixin with transient drag state and handlers
 */
/**
 * Grow a textarea to exactly its content height.
 *
 * `scrollHeight` is the CONTENT height. Under `box-sizing: border-box` — which
 * the shared `.field` base sets — assigning it to `height` makes the border
 * eat into the content box and clips the last couple of pixels of the final
 * line. The borders are added back explicitly.
 *
 * @param {HTMLElement|undefined|null} el
 * @returns {void}
 */
function fitToContent(el) {
  if (!el || typeof el.scrollHeight !== 'number') return;
  el.style.height = 'auto';
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  const borders = cs && cs.boxSizing === 'border-box'
    ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
    : 0;
  el.style.height = (el.scrollHeight + borders) + 'px';
}

/**
 * Eine Model-Methode rufen, die es geben MUSS.
 *
 * Die optionale Verkettung war hier keine Absicherung, sondern eine Lüge:
 * fehlt dem Model die Methode, tat die Aktion nichts und meldete nichts —
 * und ein Agent bekam `ok: true` für einen Nicht-Vorgang (ein Misserfolg
 * braucht eine Begründung). Ein fehlendes Model-Mitglied ist ein
 * Programmierfehler in einem Flowchart-Modul, und der muss laut werden. Für
 * die Oberfläche ändert sich nichts: alle vier Flowchart-Module haben die
 * drei Methoden.
 *
 * @param {object|null|undefined} model
 * @param {string} name
 * @param {any[]} args
 * @returns {any} was die Model-Methode zurückgibt
 * @throws {Error} wenn das Model die Methode nicht führt
 */
function callModel(model, name, args) {
  if (typeof model?.[name] !== 'function') {
    throw new Error(`flowchart model has no method "${name}"`);
  }
  return model[name](...args);
}

/**
 * Fields every flowchart card has. They are ALWAYS auto-sized, on top of
 * whatever a module adds via `opts.autoSizeSelector`: a card body must show
 * its whole text, otherwise a long description is silently clipped and the
 * reader has no cue that more is there.
 */
const CORE_AUTOSIZE = 'textarea.fc-card__title, textarea.fc-card__description';

export function chainViewMixin(module, _t, opts = {}) {
  const autoSizeSelector = [CORE_AUTOSIZE, opts.autoSizeSelector]
    .filter(Boolean).join(', ');
  const dragRowSelector = opts.dragRowSelector || '[data-step-id]';
  const substepItemSelector = opts.substepItemSelector || '[data-substep-id]';
  const canvasSelector = opts.canvasSelector || null;

  return {
    /**
     * Der Kontexthilfe-Schlüssel einer Aktion des einbindenden Moduls — für
     * Anker in geteilten Bausteinen (`substeps.part.html`), die das Modul
     * nicht kennen: `:data-help-key="actionHelp('addSubstep')"`. Derselbe
     * Satz, den der Agent zur Aktion liest.
     * @noagent — liefert nur einen Schlüssel, ändert nichts.
     * @param {string} action  Name der Agentenaktion
     * @returns {string} `modules.<id>.actions.<action>.help`, ohne Modul `''`
     */
    actionHelp(action) {
      return module?.i18nKey ? `${module.i18nKey}.actions.${action}.help` : '';
    },

    /**
     * Scroll the canvas until a freshly created card is on screen. A chain
     * wider than its canvas otherwise answers "add" by growing out of sight,
     * and the user has to go looking for the very card they just asked for.
     *
     * The card says where to look, rather than the end of the chain: a card
     * can land at an insert arrow, or in a band that runs right to left, and
     * neither is the right edge. The nearest edge wins, so a card already in
     * view moves nothing.
     *
     * @param {{id: string}|string|null} step the new step, or its id
     * @returns {void}
     * @noagent
     */
    revealStep(step) {
      if (!canvasSelector) return;
      const id = typeof step === 'string' ? step : step?.id;
      if (!id) return;
      const canvas = this.$root?.querySelector(canvasSelector);
      // The card, not any field inside it that repeats the id — hence the
      // module's own row selector rather than a bare attribute match.
      const el = canvas?.querySelector(`${dragRowSelector}[data-step-id="${id}"]`);
      if (!canvas || !el) return;
      // Room for the connector in front of the card, and for whatever follows
      // it — a band's tail sits one gap further on.
      const pad = 48;
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.left < c.left + pad) canvas.scrollLeft += r.left - c.left - pad;
      else if (r.right > c.right - pad) canvas.scrollLeft += r.right - c.right + pad;
    },

    _draggedStepId: /** @type {string|null} */ (null),
    /** @type {number|null} gap under the cursor while a card is in flight */
    _activeGap: null,

    /** @noagent */
    stepDragStart(stepId, event) {
      this._draggedStepId = stepId;
      if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', stepId); } catch (_) { /* ignore */ }
      }
      event?.target?.classList?.add('is-dragging');
    },

    /** @noagent */
    stepDragEnd(event) {
      this._draggedStepId = null;
      // An aborted drag must not leave an insert bar behind.
      this._activeGap = null;
      this._activeBand = null;
      event?.target?.classList?.remove('is-dragging');
      // Disarm: the row is only draggable while a drag started from the number
      // badge is in flight, so text in the title/description stays selectable.
      event?.target?.closest?.(dragRowSelector)?.removeAttribute('draggable');
    },

    // ── Gap drops ─────────────────────────────────────────────────────
    // A chain of n steps has n+1 gaps (0…n); gap g is the chain position a
    // card dropped there takes. The arrows between the cards ARE those gaps,
    // so a drop says "the card goes here" and nothing else — in the swimlane
    // charts the area around a card already belongs to the band change.

    /**
     * True while a card is in flight — gates the rails and their hit areas.
     * @noagent
     */
    isDragging() {
      return this._draggedStepId !== null;
    },

    /**
     * Gap 0 sits in front of the first card. Only rendered during a drag —
     * otherwise every chain would start with an arrow pointing at nothing.
     * @param {number} idx 0-based index of the step the rail belongs to
     * @returns {boolean}
     * @noagent
     */
    showStartRail(idx) {
      return idx === 0 && this._draggedStepId !== null;
    },

    /**
     * Gap n hangs off the last card. Same drag-only rule as showStartRail.
     * @param {number} idx 0-based index of the step the rail belongs to
     * @returns {boolean}
     * @noagent
     */
    showEndRail(idx) {
      return idx === (this.model?.steps?.length || 0) - 1 && this._draggedStepId !== null;
    },

    /**
     * @param {number} g gap index
     * @returns {boolean} true when the cursor currently sits over gap g
     * @noagent
     */
    isGapActive(g) {
      return this._activeGap === g;
    },

    /**
     * Transient classes for the connector at gap `g`: the enlarged hit area
     * while a card is in flight, plus the insert bar for the gap under the
     * cursor. Assembled here rather than in the template — Alpine CSP wants
     * one plain method call per binding; its parser evaluates no string building.
     * @param {number} g gap index
     * @returns {string}
     * @noagent
     */
    gapClass(g) {
      if (this._draggedStepId === null) return '';
      return this.isGapActive(g) ? 'fc-connector--drop is-drop-target' : 'fc-connector--drop';
    },

    /** @noagent */
    gapDragOver(g, event) {
      // Without a card in flight the connector stays a plain insert button —
      // preventDefault() here would make it a drop target for anything.
      if (this._draggedStepId === null) return;
      event?.preventDefault();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      this._activeGap = g;
    },

    /** @noagent */
    gapDragLeave(g, _event) {
      // Only clear OUR gap: dragover on the next connector may already have
      // claimed _activeGap before this leave fires.
      if (this._activeGap === g) this._activeGap = null;
    },

    /** @noagent */
    gapDrop(g, event) {
      event?.preventDefault();
      const from = this._draggedStepId;
      this._draggedStepId = null;
      this._activeGap = null;
      if (!from) return;
      this.moveStep(from, g);
    },

    // The gap BEHIND step `idx` is gap idx + 1. It gets its own methods
    // instead of `gapDrop(idx + 1, $event)` in the template: Alpine CSP event
    // expressions are plain method calls, and arithmetic in an argument is
    // not worth the risk — the CSP parser accepts a call, not every
    // expression inside it. Used by every trailing arrow and every end rail.
    /** @noagent */
    gapDragOverAfter(idx, event) { this.gapDragOver(idx + 1, event); },
    /** @noagent */
    gapDragLeaveAfter(idx, event) { this.gapDragLeave(idx + 1, event); },
    /** @noagent */
    gapDropAfter(idx, event) { this.gapDrop(idx + 1, event); },
    /** @noagent */
    gapClassAfter(idx) { return this.gapClass(idx + 1); },

    // ── Band drops ────────────────────────────────────────────────────
    // A band is a whole row or lane — Activity's branch bands, Deployment's
    // lanes, Opportunity's VA/NVA sides. Dropping a card there re-assigns
    // it; the highlight says so while the card is still in the air.

    /** @type {string|null} band under the cursor while a card is in flight */
    _activeBand: null,

    /**
     * Marks band `bandId` as the drop target and accepts the drop. Over an
     * arrow inside the band the arrow is the target, so the band steps back.
     * @param {string} bandId band, lane or side id
     * @param {DragEvent} event
     * @noagent DOM event handler — ein Agent kann kein DragEvent erzeugen;
     *   die Zuordnung eines Schritts zu einer Bahn geht über das Model
     *   (`setLaneForStep`, `setSide`, `setStepBranch`).
     */
    bandDragOver(bandId, event) {
      // Same gate as gapDragOver: without a card in flight nothing is a target.
      if (this._draggedStepId === null) return;
      event?.preventDefault();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      this._activeBand = event?.target?.closest?.('.fc-connector') ? null : bandId;
    },

    /**
     * Clears the highlight when the cursor leaves band `bandId` — but not for
     * a move between two children of the same band, which also fires dragleave.
     * @param {string} bandId band, lane or side id
     * @param {DragEvent} event
     * @noagent DOM event handler — Gegenstück zu bandDragOver.
     */
    bandDragLeave(bandId, event) {
      if (event?.relatedTarget && event?.currentTarget?.contains?.(event.relatedTarget)) return;
      if (this._activeBand === bandId) this._activeBand = null;
    },

    /**
     * @param {string} bandId band, lane or side id
     * @returns {string} 'is-drop-target' for the band under the cursor, else ''
     * @noagent view transform — reine CSS-Klasse des Schwebezustands.
     */
    bandClass(bandId) {
      return this._activeBand === bandId ? 'is-drop-target' : '';
    },

    /**
     * Sequence label for a step, zero-padded to two digits ("01", "02", …) so
     * a chain of cards keeps a stable badge width. Shared by all four
     * flowchart modules — Process Map set the format, the others follow it.
     * @param {number} idx 0-based index in the chain
     * @returns {string}
     * @noagent
     */
    stepNum(idx) {
      return String(idx + 1).padStart(2, '0');
    },

    /**
     * Arm a step for dragging. Modules that make a row draggable only while
     * the number badge is held (so a click in the title never starts a drag)
     * call this from the badge's mousedown.
     * @param {string} _stepId  unused — kept so templates read symmetrically
     * @param {Event} event
     * @returns {void}
     * @noagent
     */
    armStepDrag(_stepId, event) {
      const row = event?.target?.closest?.(dragRowSelector);
      if (row) row.setAttribute('draggable', 'true');
    },

    // ── Substeps ──────────────────────────────────────────────────────
    _draggedSubId: /** @type {string|null} */ (null),
    _draggedParentId: /** @type {string|null} */ (null),

    /**
     * Hierarchical label for a substep, e.g. "2.3".
     * @param {number} parentIdx 0-based index of the parent step
     * @param {number} subIdx 0-based index of the substep
     * @returns {string}
     * @noagent
     */
    substepNum(parentIdx, subIdx) {
      return `${parentIdx + 1}.${subIdx + 1}`;
    },

    /**
     * Label for the substeps disclosure bar, with the count when non-empty.
     * @param {object} step
     * @returns {string}
     * @noagent
     */
    substepsBarLabel(step) {
      const n = step?.substeps?.length || 0;
      return _t('substepsLabel') + (n > 0 ? ` (${n})` : '');
    },

    // `toggleSubsteps`/`addSubstep`/`removeSubstep` all return `false` from
    // the Core model on an unknown id (flowchart-model.js) — `callModel`
    // only throws when the METHOD itself is missing, not when it quietly
    // declines. Without a check here the id promise in every module's i18n
    // ("Eine unbekannte id ist ein Fehler") was untrue: the agent got
    // `ok: true` and nothing happened (closed once here for all four
    // flowchart modules).
    // Persisted on the step itself (`expanded`), not transient UI state —
    // that is why the disclosure survives a reload instead of resetting
    // every time the project opens (Task 3 fix round 2 carry-along: first
    // sentence kept to behaviour only, rationale moved here).
    /**
     * Show or hide the substep list of a step.
     * @noagent — eine Umschaltung, deren Ausgang allein am Vorzustand hängt,
     * ist für einen Agenten keine eigene Fähigkeit; `setSubstepsExpanded` ist
     * der absolute Weg (W1-3).
     * @param {string} stepId  id of the step whose substeps are toggled
     * @returns {void}
     */
    toggleSubsteps(stepId) {
      if (Array.isArray(this.model?.steps)) {
        requireKnownId('stepId', stepId, this.model.steps.map((s) => s.id));
      }
      callModel(this.model, 'toggleSubsteps', [stepId]);
    },
    /**
     * Set a step's substep disclosure absolutely.
     * @agent
     * @param {string} stepId    id of the step whose substeps are shown or hidden
     * @param {boolean} expanded whether the substep list should be shown
     * @returns {void}
     * @throws {Error} wenn stepId unbekannt ist, expanded weder true noch false
     *   ist, oder das Model die Methode `setSubstepsExpanded` nicht führt
     */
    setSubstepsExpanded(stepId, expanded) {
      if (Array.isArray(this.model?.steps)) {
        requireKnownId('stepId', stepId, this.model.steps.map((s) => s.id));
      }
      requireBoolean('expanded', expanded);
      callModel(this.model, 'setSubstepsExpanded', [stepId, expanded]);
    },
    /**
     * Verschiebt einen Schritt an eine Lücke der Kette. Eine Kette aus n
     * Schritten hat n+1 Lücken, 0 = ganz vorn, n = ganz hinten — gezählt in
     * der Kette VOR dem Verschieben.
     * @agent
     * @param {string} stepId    id des zu verschiebenden Schritts
     * @param {number} gapIndex  Ziel-Lücke, ganze Zahl von 0 bis zur Schrittzahl
     * @returns {boolean} true, wenn sich die Reihenfolge geändert hat; false,
     *   wenn der Schritt schon an dieser Stelle steht
     * @throws {Error} wenn stepId unbekannt ist oder gapIndex außerhalb liegt
     */
    moveStep(stepId, gapIndex) {
      const steps = Array.isArray(this.model?.steps) ? this.model.steps : [];
      requireKnownId('stepId', stepId, steps.map((s) => s.id));
      requireIndex('gapIndex', gapIndex, steps.length);
      return callModel(this.model, 'moveStepToGap', [stepId, gapIndex]) === true;
    },
    /**
     * Verschiebt einen Unter-Schritt innerhalb seines Schritts an den Platz
     * eines anderen Unter-Schritts.
     * @agent
     * @param {string} parentId         id des Schritts
     * @param {string} substepId        id des zu verschiebenden Unter-Schritts
     * @param {string} targetSubstepId  id des Unter-Schritts, dessen Platz er einnimmt
     * @returns {boolean} true, wenn sich die Reihenfolge geändert hat
     * @throws {Error} wenn eine id unbekannt ist oder Quelle und Ziel gleich sind
     */
    moveSubstep(parentId, substepId, targetSubstepId) {
      const steps = Array.isArray(this.model?.steps) ? this.model.steps : [];
      requireKnownId('parentId', parentId, steps.map((s) => s.id));
      const ids = (steps.find((s) => s.id === parentId).substeps || []).map((s) => s.id);
      requireKnownId('substepId', substepId, ids);
      requireKnownId('targetSubstepId', targetSubstepId, ids.filter((id) => id !== substepId));
      return callModel(this.model, 'moveSubstep', [parentId, substepId, targetSubstepId]) === true;
    },
    /**
     * Append an empty substep to a step.
     * @agent
     * @param {string} stepId  id of the step that gets the new substep
     * @returns {string} id des neuen Unter-Schritts
     * @throws {Error} wenn stepId unbekannt ist, oder das Model die Methode
     *   `addSubstep` nicht führt
     */
    addSubstep(stepId) {
      if (Array.isArray(this.model?.steps)) {
        requireKnownId('stepId', stepId, this.model.steps.map((s) => s.id));
      }
      const created = callModel(this.model, 'addSubstep', [stepId]);
      return typeof created === 'string' ? created : created?.id;
    },
    /**
     * Remove one substep from its parent step.
     * @agent
     * @param {string} parentId   id of the step holding the substep
     * @param {string} substepId  id of the substep to remove
     * @returns {void}
     * @throws {Error} wenn parentId oder substepId unbekannt ist, oder das
     *   Model die Methode `removeSubstep` nicht führt
     */
    removeSubstep(parentId, substepId) {
      if (Array.isArray(this.model?.steps)) {
        requireKnownId('parentId', parentId, this.model.steps.map((s) => s.id));
        const parent = this.model.steps.find((s) => s.id === parentId);
        requireKnownId('substepId', substepId, (parent.substeps || []).map((s) => s.id));
      }
      callModel(this.model, 'removeSubstep', [parentId, substepId]);
    },
    // Lives once here, not once per flowchart module: the shared partial
    // `substeps.part.html` binds the title input through this sink. Without
    // it an agent could create and delete a substep but never name it, and
    // no completeness gate would have caught that — `unreachable_write`
    // only inspects ROOT `x-model="model.*"` bindings, not a field inside a
    // nested collection.
    /**
     * Set a substep's title.
     * @agent
     * @param {string} stepId    id of the step holding the substep
     * @param {string} substepId id of the substep
     * @param {string} text      the new title
     * @returns {void}
     * @throws {Error} wenn stepId oder substepId unbekannt ist, oder text keine
     *   Zeichenkette ist
     */
    setSubstepTitle(stepId, substepId, text) {
      if (Array.isArray(this.model?.steps)) {
        requireKnownId('stepId', stepId, this.model.steps.map((s) => s.id));
        const step = this.model.steps.find((s) => s.id === stepId);
        requireKnownId('substepId', substepId, (step.substeps || []).map((s) => s.id));
        step.substeps.find((s) => s.id === substepId).title = requireText('text', text);
      }
    },

    /** @noagent */
    armSubDrag(event) {
      const item = event?.target?.closest?.(substepItemSelector);
      if (item) item.setAttribute('draggable', 'true');
    },

    /** @noagent */
    subDragStart(parentId, subId, event) {
      event?.stopPropagation();
      this._draggedSubId = subId;
      this._draggedParentId = parentId;
      if (event?.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      const item = event?.target?.closest?.(substepItemSelector);
      // Deferred a tick: a class set synchronously in dragstart is picked up
      // for the drag image, which would render the ghost half-transparent.
      setTimeout(() => item?.classList.add('is-dragging'), 0);
    },

    /** @noagent */
    subDragOver(parentId, subId, event) {
      event?.preventDefault();
      event?.stopPropagation();
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
      // Reordering is scoped to one parent — no cross-step substep moves.
      if (subId !== this._draggedSubId && parentId === this._draggedParentId) {
        event?.currentTarget?.classList?.add('is-drop-target');
      }
    },

    /** @noagent */
    subDragLeave(_subId, event) {
      const item = event?.currentTarget;
      if (item && !item.contains(event.relatedTarget)) {
        item.classList.remove('is-drop-target');
      }
    },

    /** @noagent */
    subDrop(parentId, subId, event) {
      event?.preventDefault();
      event?.stopPropagation();
      const from = this._draggedSubId;
      const fromParent = this._draggedParentId;
      this._draggedSubId = null;
      this._draggedParentId = null;
      event?.currentTarget?.classList?.remove('is-drop-target');
      if (!from || from === subId || parentId !== fromParent) return;
      this.moveSubstep(parentId, from, subId);
    },

    /** @noagent */
    subDragEnd(event) {
      const item = event?.target?.closest?.(substepItemSelector);
      item?.removeAttribute('draggable');
      item?.classList?.remove('is-dragging');
      this._draggedSubId = null;
      this._draggedParentId = null;
    },

    /** @noagent */
    autoSize(event) {
      fitToContent(event?.target);
    },

    _autoSizeAll() {
      const root = this.$root || document;
      root.querySelectorAll(autoSizeSelector).forEach(fitToContent);
    },
  };
}
