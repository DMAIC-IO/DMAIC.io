/**
 * D.Mike — Lessons Learned Module (lessons-learned.js)
 * Erfahrungen eines Projekts mit Kategorie, Wirkung, Phase und Maßnahmen.
 * DMAIC-Phase: Control.
 *
 * Das Model (lessons-learned-model.js) hält den persistierten Zustand (die
 * Erfahrungen samt ihren Maßnahmen); diese Datenfunktion hält die
 * Anzeigetransformationen, den Entwurfspuffer des Formulars und die benannten
 * Schreibsenken, über die beide Seiten — Oberfläche und Agentenfläche —
 * schreiben.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Erfahrungen anlegen,
 *   ändern und entfernen, Maßnahmen anhängen, abhaken und entfernen. Der
 *   Oberfläche bleiben der Dateidownload, der Dateiimport, die Rückfrage vor
 *   dem Löschen und die Formulardialoge; der Anzeigefilter und das
 *   Aufklappen einer Karte stehen in keinem Zustand und bleiben ihr deshalb
 *   ebenfalls.
 */

import { createModule } from '../../core/template-module.js';
import { State, Lesson, Action, CATEGORIES, IMPACTS } from './lessons-learned-model.js';
import { resolveEpochOffset } from '../../core/date-offset.js';
import { getPhaseIds, DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireIndex } from '../../core/agent/agent-argcheck.js';

// Dieselben Wertemengen wie im Model; die Auswahllisten der Vorlage lesen
// sie, die Senken prüfen gegen sie.
const CATEGORY_KEYS = CATEGORIES;
const IMPACT_KEYS = IMPACTS;

// Die Felder, die `addLesson` und `updateLesson` entgegennehmen. Die Liste
// trägt die Prüfung „das Objekt nennt überhaupt ein Feld" — ohne sie meldete
// `updateLesson(id, {})` Erfolg, ohne etwas zu ändern, und die Fehlermeldung
// versprach mehr, als sie prüfte.
const LESSON_FIELDS = [
  'title', 'category', 'impact', 'phase', 'owner',
  'description', 'rootCause', 'recommendation', 'actions',
];

/**
 * Prüft, dass ein Text wirklich ein Text ist. Ein fehlendes Argument
 * (`undefined`) ist ein Fehler, die leere Zeichenkette der dokumentierte
 * Leerwert — `agent-ops.js` spreadet `action.args ?? []` ohne Arity-Prüfung,
 * ohne diesen Wächter käme beides als derselbe Wert an (Ruling 55).
 */
function requireText(name, value) {
  if (typeof value !== 'string') {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: any string, "" clears it`);
  }
}

const m = createModule({
  config: {
    id: 'lessons-learned',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.lessons-learned',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.json', title: 'export.json', onClick: (d) => d.exportJSON() },
      ] },
      { icon: 'action.upload', title: 'importJSON', onClick: (d) => d.openImport() },
      // Kein `agentAction`: der Knopf öffnet einen Dialog, und ein Agent
      // darf keinen öffnen (E3). Seine Agentenentsprechung ist `addLesson`,
      // die den Dialog nicht braucht.
      { icon: 'action.add', title: 'addLesson', variant: 'primary', onClick: (d) => d.openAddModal() },
    ],
  },
  Model: State,
  data(module, _t) {
    return {
      ...agentReadMixin(module),

      filter: 'all',
      search: '',
      openCards: [],
      lessonDraft: {
        title: '',
        category: 'success',
        phase: 'control',
        impact: 'medium',
        owner: '',
        description: '',
        rootCause: '',
        recommendation: '',
        actions: [],
      },
      draftActionInput: '',

      // Option lists for the in-template form selects.
      categoryOptions: CATEGORY_KEYS,
      impactOptions: IMPACT_KEYS,

      // Phase options follow the active cycle (label from global phases.*).
      /** @noagent view transform: die Phasen des aktiven Zyklus als Auswahlliste. */
      phaseOptions() {
        const cycleId = module._context.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
        return getPhaseIds(cycleId).map(k => ({
          value: k,
          label: module._context.i18n.t(`phases.${  k}`),
        }));
      },

      // ── Draft action-tag helpers (modal form) ─────────────────
      /** @noagent Entwurfspuffer des Formulars; er steht in keinem Zustand. */
      addDraftAction() {
        const val = (this.draftActionInput || '').trim();
        if (!val) return;
        this.lessonDraft.actions.push({ text: val, done: false, uid: Lesson.uid() });
        this.draftActionInput = '';
      },

      /** @noagent Entwurfspuffer des Formulars; er steht in keinem Zustand. */
      removeDraftAction(uid) {
        this.lessonDraft.actions = this.lessonDraft.actions.filter(a => a.uid !== uid);
      },

      // Delegated remove: a per-tag @click inside the borrowed x-for cannot
      // resolve component methods in Alpine CSP (scope chain breaks across the
      // borrow). A single handler on the container — outside the x-for — works.
      /** @noagent DOM event handler über dem Entwurfspuffer. */
      onActionTagsClick(event) {
        const btn = event.target.closest('.ll__action-tag-remove');
        if (!btn) return;
        this.removeDraftAction(btn.dataset.uid);
      },

      /** @noagent view transform: die Zählung je Kategorie und offene Maßnahmen. */
      stats() {
        return this.model.computeStats();
      },

      /** @noagent view transform: die Erfahrungen, die Filter und Suche passieren. */
      filteredLessons() {
        let list = [...this.model.lessons];
        if (this.filter !== 'all') {
          list = list.filter(l => l.category === this.filter);
        }
        const q = this.search.toLowerCase().trim();
        if (q) {
          list = list.filter(l =>
            (l.title || '').toLowerCase().includes(q) ||
            (l.description || '').toLowerCase().includes(q) ||
            (l.owner || '').toLowerCase().includes(q) ||
            (l.recommendation || '').toLowerCase().includes(q) ||
            (l.rootCause || '').toLowerCase().includes(q)
          );
        }
        return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      },

      /** @noagent view transform: der übersetzte Name einer Kategorie. */
      catLabel: (k) => _t(`cat_${  k}`),
      /** @noagent view transform: der übersetzte Name einer Wirkung. */
      impactLabel: (k) => _t(`impact_${  k}`),
      /** @noagent view transform: der übersetzte Name einer Phase. */
      phaseLabel: (p) => _t(`phase_${  p}`),

      /** @noagent view transform: ein Zeitstempel in der Sprache der Oberfläche. */
      formatDate(ts) {
        if (!ts) return '';
        const lang = module._context.language === 'de' ? 'de-DE' : 'en-US';
        return new Date(ts).toLocaleDateString(lang);
      },

      /** @noagent view transform: „2/5 Actions" für die Kartenkopfzeile. */
      actionsSummary(lesson) {
        const done = lesson.actions.filter(a => a.done).length;
        const total = lesson.actions.length;
        return total > 0 ? `${done}/${total} Actions` : '';
      },

      /**
       * @noagent Anzeigefilter, nicht Zustand — er erscheint nicht in
       * `read()`. Ein Agent, der ihn setzen könnte, bekäme keine Rückmeldung
       * darüber, was er getan hat.
       */
      setFilter(category) {
        this.filter = category;
      },

      /** @noagent view transform: das Aufklapp-Symbol einer Karte. */
      chevronIcon(lesson) {
        return this.openCards.includes(lesson.id) ? 'nav.expand-down' : 'nav.expand-right';
      },

      /**
       * @noagent Aufklappzustand der Karte, nicht Zustand — er erscheint
       * nicht in `read()`.
       */
      toggleCard(id) {
        const idx = this.openCards.indexOf(id);
        if (idx === -1) {
          this.openCards.push(id);
        } else {
          this.openCards.splice(idx, 1);
        }
      },

      /**
       * @noagent Kartenhandler: er bekommt die Erfahrung aus der Vorlage und
       * schaltet zwischen zwei Werten um. Delegiert an `setActionDone`, damit
       * das Feld genau eine Zuweisungsstelle hat.
       */
      toggleAction(lesson, idx) {
        if (!lesson.actions[idx]) return;
        this.setActionDone(lesson.id, idx, !lesson.actions[idx].done);
      },

      /**
       * @noagent fragt vor dem Löschen zurück; ein Agent darf keine Rückfrage
       * auslösen — er blockierte den Stapel (E3). Delegiert an `removeLesson`.
       */
      deleteLesson(lesson) {
        const self = this;
        module._context.confirmPopout(_t('deleteConfirm'), { danger: true }).then(confirmed => {
          if (!confirmed) return;
          if (self.model.lessons.some(l => l.id === lesson.id)) self.removeLesson(lesson.id);
        });
      },

      /**
       * Legt eine Erfahrung an.
       * @agent
       * @param {object} data die Erfahrung: `title` (nötig), und wahlweise
       *   `category`, `impact`, `phase`, `owner`, `description`, `rootCause`,
       *   `recommendation` und `actions`
       * @returns {string|null} die id der neuen Erfahrung, oder null wenn der
       *   Titel leer war und nichts angelegt wurde
       * @throws {Error} wenn `data` kein Objekt ist, keinen `title` nennt oder
       *   `category`, `impact` oder `phase` einen Wert außerhalb ihrer
       *   Wertemenge tragen
       */
      addLesson(data) {
        this._requireLessonData(data, 'title');
        const title = String(data.title ?? '').trim();
        // Ein leerer Titel ist eine fachliche Absage, kein ungültiges
        // Argument: das Formular verwirft ihn genauso und legt nichts an.
        if (!title) return null;
        const now = Date.now();
        const lesson = Lesson.fromJSON({
          id: Lesson.uid(),
          title,
          category: data.category ?? 'success',
          phase: data.phase ?? this._defaultPhase(),
          impact: data.impact ?? 'medium',
          owner: String(data.owner ?? '').trim(),
          description: String(data.description ?? '').trim(),
          rootCause: String(data.rootCause ?? '').trim(),
          recommendation: String(data.recommendation ?? '').trim(),
          actions: this._normalizeActions(data.actions),
          createdAt: now,
          updatedAt: now,
        });
        this.model.lessons.push(lesson);
        return lesson.id;
      },

      /**
       * Ändert die genannten Felder einer Erfahrung; alle übrigen bleiben
       * stehen.
       * @agent
       * @param {string} lessonId id der Erfahrung
       * @param {object} data die zu ändernden Felder — `title`, `category`,
       *   `impact`, `phase`, `owner`, `description`, `rootCause`,
       *   `recommendation` oder `actions`
       * @returns {boolean} true wenn geändert wurde, false wenn ein
       *   mitgegebener Titel leer war und alles stehen blieb
       * @throws {Error} wenn keine Erfahrung diese id trägt, `data` kein
       *   Objekt ist, keines der genannten Felder nennt oder `category`,
       *   `impact` oder `phase` einen Wert außerhalb ihrer Wertemenge tragen
       */
      updateLesson(lessonId, data) {
        requireKnownId('lessonId', lessonId, this._lessonIds());
        this._requireLessonData(data, 'any');
        const lesson = this._lessonById(lessonId);
        if (data.title !== undefined) {
          const title = String(data.title).trim();
          // Siehe `addLesson`: ein leerer Titel ist eine Absage.
          if (!title) return false;
          lesson.title = title;
        }
        if (data.category !== undefined) lesson.category = data.category;
        if (data.impact !== undefined) lesson.impact = data.impact;
        if (data.phase !== undefined) lesson.phase = data.phase;
        if (data.owner !== undefined) lesson.owner = String(data.owner).trim();
        if (data.description !== undefined) lesson.description = String(data.description).trim();
        if (data.rootCause !== undefined) lesson.rootCause = String(data.rootCause).trim();
        if (data.recommendation !== undefined) lesson.recommendation = String(data.recommendation).trim();
        if (data.actions !== undefined) {
          lesson.actions = this._normalizeActions(data.actions).map(a => Action.fromJSON(a));
        }
        lesson.updatedAt = Date.now();
        return true;
      },

      /**
       * Entfernt eine Erfahrung samt ihren Maßnahmen.
       * @agent
       * @param {string} lessonId id der Erfahrung
       * @returns {void}
       * @throws {Error} wenn keine Erfahrung diese id trägt
       */
      removeLesson(lessonId) {
        requireKnownId('lessonId', lessonId, this._lessonIds());
        const idx = this.model.lessons.findIndex(l => l.id === lessonId);
        this.model.lessons.splice(idx, 1);
        this.openCards = this.openCards.filter(id => id !== lessonId);
      },

      /**
       * Hängt eine Maßnahme an eine Erfahrung an.
       * @agent
       * @param {string} lessonId id der Erfahrung
       * @param {string} text der Text der Maßnahme
       * @returns {number} die Position der neuen Maßnahme, von 0 an gezählt,
       *   oder -1 wenn der Text leer war und nichts angelegt wurde
       * @throws {Error} wenn keine Erfahrung diese id trägt oder `text` keine
       *   Zeichenkette ist
       */
      addAction(lessonId, text) {
        requireKnownId('lessonId', lessonId, this._lessonIds());
        // Ein fehlendes Argument ist ein Fehler, nicht der dokumentierte
        // Leerwert (Ruling 55) — sonst liefe ein vergessenes Argument als
        // Absage durch und der Agent sähe keinen Unterschied zum Tippfehler.
        requireText('text', text);
        const value = text.trim();
        // Eine leere Maßnahme ist eine Absage, kein Fehler — das Formular
        // verwirft sie genauso.
        if (!value) return -1;
        const lesson = this._lessonById(lessonId);
        lesson.actions.push(Action.fromJSON({ text: value, done: false }));
        lesson.updatedAt = Date.now();
        return lesson.actions.length - 1;
      },

      /**
       * Entfernt eine Maßnahme einer Erfahrung.
       * @agent
       * @param {string} lessonId id der Erfahrung
       * @param {number} actionIndex die Position der Maßnahme, von 0 an gezählt
       * @returns {void}
       * @throws {Error} wenn keine Erfahrung diese id trägt oder die Erfahrung
       *   an dieser Position keine Maßnahme hat
       */
      removeAction(lessonId, actionIndex) {
        requireKnownId('lessonId', lessonId, this._lessonIds());
        const lesson = this._lessonById(lessonId);
        requireIndex('actionIndex', actionIndex, lesson.actions.length - 1);
        lesson.actions.splice(actionIndex, 1);
        lesson.updatedAt = Date.now();
      },

      /**
       * Hakt eine Maßnahme einer Erfahrung ab oder nimmt den Haken zurück.
       * @agent
       * @param {string} lessonId id der Erfahrung
       * @param {number} actionIndex die Position der Maßnahme, von 0 an gezählt
       * @param {boolean} done true hakt sie ab, false nimmt den Haken zurück
       * @returns {void}
       * @throws {Error} wenn keine Erfahrung diese id trägt, die Erfahrung an
       *   dieser Position keine Maßnahme hat oder `done` nicht true oder false ist
       */
      setActionDone(lessonId, actionIndex, done) {
        requireKnownId('lessonId', lessonId, this._lessonIds());
        const lesson = this._lessonById(lessonId);
        requireIndex('actionIndex', actionIndex, lesson.actions.length - 1);
        // `requireEnum` über die zwei Wahrheitswerte statt eines `=== true`:
        // ein fehlendes Argument (`undefined`) wäre sonst stillschweigend
        // „Haken zurücknehmen" statt ein Fehler (Ruling 55).
        requireEnum('done', done, [true, false]);
        lesson.actions[actionIndex].done = done;
        lesson.updatedAt = Date.now();
      },

      /** Die vorhandenen Erfahrungs-ids in Anzeigereihenfolge. */
      _lessonIds() {
        return this.model.lessons.map(l => l.id);
      },

      /** Die Erfahrung mit dieser id; jede Senke prüft die id vorher. */
      _lessonById(lessonId) {
        return this.model.lessons.find(l => l.id === lessonId);
      },

      /** Die letzte Phase des aktiven Zyklus — die Vorgabe des Formulars. */
      _defaultPhase() {
        const phases = this.phaseOptions().map(o => o.value);
        return phases[phases.length - 1] || 'control';
      },

      /**
       * Prüft die Wertemengen eines Erfahrungs-Objekts. Ein fehlendes
       * Argument (`undefined`) ist ein Fehler und kein leeres Objekt — sonst
       * legte ein Aufruf ohne Argument stillschweigend nichts an und meldete
       * Erfolg (Ruling 55).
       */
      _requireLessonData(data, required) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error(`invalid data ${JSON.stringify(data)}; allowed: an object with ${required === 'title' ? 'at least a title' : `at least one of ${LESSON_FIELDS.join(', ')}`}`);
        }
        // Die Meldung muss halten, was sie sagt: ein Objekt ohne jedes
        // bekannte Feld ändert nichts und meldete sonst Erfolg.
        if (required === 'title' && data.title === undefined) {
          throw new Error(`invalid data ${JSON.stringify(data)}; allowed: an object with at least a title`);
        }
        if (required !== 'title' && !LESSON_FIELDS.some(f => data[f] !== undefined)) {
          throw new Error(`invalid data ${JSON.stringify(data)}; allowed: an object with at least one of ${LESSON_FIELDS.join(', ')}`);
        }
        if (data.category !== undefined) requireEnum('category', data.category, CATEGORY_KEYS);
        if (data.impact !== undefined) requireEnum('impact', data.impact, IMPACT_KEYS);
        if (data.phase !== undefined) {
          requireEnum('phase', data.phase, this.phaseOptions().map(o => o.value));
        }
      },

      /**
       * Die Maßnahmen eines Erfahrungs-Objekts in die persistierte Form.
       * Jeder Eintrag ist entweder ein Text oder `{ text, done }`.
       */
      _normalizeActions(actions) {
        if (actions === undefined || actions === null) return [];
        if (!Array.isArray(actions)) {
          throw new Error(`invalid actions ${JSON.stringify(actions)}; allowed: a list of texts or of { text, done }`);
        }
        return actions.map(a => (typeof a === 'string'
          ? { text: a.trim(), done: false }
          : { text: String(a?.text ?? '').trim(), done: a?.done === true }));
      },

      // Reset the draft, optionally seeding it from an existing lesson.
      // Die gespeicherte Phase wird gegen den aktiven Zyklus geprüft: eine
      // Erfahrung kann aus einem anderen Zyklus stammen (Projektwechsel oder
      // Import — `Lesson.fromJSON` lässt jede Zeichenkette durch), die
      // Auswahlliste führt sie dann nicht und `updateLesson` lehnt sie ab.
      // Ohne den Rückfall warf Bearbeiten → Speichern.
      _resetDraft(lesson) {
        const cyclePhases = this.phaseOptions().map(o => o.value);
        const fallback = cyclePhases[cyclePhases.length - 1] || 'control';
        const defaultPhase = cyclePhases.includes(lesson?.phase) ? lesson.phase : fallback;
        this.lessonDraft.title = lesson?.title || '';
        this.lessonDraft.category = lesson?.category || 'success';
        this.lessonDraft.phase = defaultPhase;
        this.lessonDraft.impact = lesson?.impact || 'medium';
        this.lessonDraft.owner = lesson?.owner || '';
        this.lessonDraft.description = lesson?.description || '';
        this.lessonDraft.rootCause = lesson?.rootCause || '';
        this.lessonDraft.recommendation = lesson?.recommendation || '';
        this.lessonDraft.actions = (lesson?.actions || []).map(a => ({ text: a.text, done: a.done, uid: Lesson.uid() }));
        this.draftActionInput = '';
      },

      /**
       * @noagent öffnet den Formulardialog; ein Agent darf keinen Dialog
       * öffnen — er blockierte den Stapel (E3). Der Abschluss schreibt über
       * `addLesson`, denselben Sink wie die Agentenfläche.
       */
      async openAddModal() {
        const self = this;
        this._resetDraft(null);
        await module._context.showModal.form(
          _t('addTitle'),
          this.$refs.lessonForm,
          {
            confirmLabel: _t('common.save'),
            cancelLabel: _t('common.cancel'),
            onMount: (modalEl) => {
              // Focus synchronously — the borrowed Alpine node is already in the
              // DOM here. A deferred focus would steal focus mid-fill and corrupt
              // x-model inputs (e.g. the action-input field).
              modalEl.querySelector('[data-field="title"]')?.focus();
            },
            onConfirm: (modalEl) => {
              const title = (self.lessonDraft.title || '').trim();
              if (!title) {
                modalEl.querySelector('[data-field="title"]')?.focus();
                return false;
              }
              self.addLesson({
                title,
                category: self.lessonDraft.category || 'success',
                phase: self.lessonDraft.phase || self._defaultPhase(),
                impact: self.lessonDraft.impact || 'medium',
                owner: self.lessonDraft.owner || '',
                description: self.lessonDraft.description || '',
                rootCause: self.lessonDraft.rootCause || '',
                recommendation: self.lessonDraft.recommendation || '',
                actions: self.lessonDraft.actions.map(a => ({ text: a.text, done: a.done })),
              });
            },
          }
        );
      },

      /**
       * @noagent öffnet den Formulardialog; ein Agent darf keinen Dialog
       * öffnen — er blockierte den Stapel (E3). Der Abschluss schreibt über
       * `updateLesson`, denselben Sink wie die Agentenfläche.
       */
      async openEditModal(lesson) {
        const self = this;
        this._resetDraft(lesson);
        await module._context.showModal.form(
          _t('editTitle'),
          this.$refs.lessonForm,
          {
            confirmLabel: _t('common.save'),
            cancelLabel: _t('common.cancel'),
            onMount: (modalEl) => {
              // Focus synchronously — the borrowed Alpine node is already in the
              // DOM here. A deferred focus would steal focus mid-fill and corrupt
              // x-model inputs (e.g. the action-input field).
              modalEl.querySelector('[data-field="title"]')?.focus();
            },
            onConfirm: (modalEl) => {
              const title = (self.lessonDraft.title || '').trim();
              if (!title) {
                modalEl.querySelector('[data-field="title"]')?.focus();
                return false;
              }
              if (!self.model.lessons.some(l => l.id === lesson.id)) return;
              self.updateLesson(lesson.id, {
                title,
                category: self.lessonDraft.category || 'success',
                phase: self.lessonDraft.phase || self._defaultPhase(),
                impact: self.lessonDraft.impact || 'medium',
                owner: self.lessonDraft.owner || '',
                description: self.lessonDraft.description || '',
                rootCause: self.lessonDraft.rootCause || '',
                recommendation: self.lessonDraft.recommendation || '',
                actions: self.lessonDraft.actions.map(a => ({ text: a.text, done: a.done })),
              });
            },
          }
        );
      },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportJSON() {
        const data = this.model.lessons.map(l => l.toJSON());
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `lessons-learned_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },

      /** @noagent öffnet den Dateiwähler des Browsers. */
      openImport() {
        module._container.querySelector('[data-ref="fileImport"]')?.click();
      },

      /**
       * @noagent liest eine Datei ein. Die Einträge kommen mit ihren eigenen
       * ids und Zeitstempeln zurück in den Zustand — das ist derselbe
       * Wiederherstellungsweg wie `fromJSON`, kein Feldschreibzugriff, und
       * keine Agentensenke darf ihn nachbauen (sie vergäbe neue ids).
       */
      handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const self = this;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
              for (const l of data) {
                self.model.lessons.push(Lesson.fromJSON(l));
              }
              module._context.notify?.(_t('importSuccess', { count: data.length }));
            }
          } catch (_err) {
            module._context.notify?.(_t('importError'));
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      },
    };
  },
});

const origLoad = m.loadExample;
if (origLoad) {
  m.loadExample = async function (payload) {
    if (!payload?.data) return;
    const data = JSON.parse(JSON.stringify(payload.data));
    if (Array.isArray(data.lessons)) {
      data.lessons.forEach(l => {
        l.createdAt = resolveEpochOffset(l.createdAt);
      });
    }
    return origLoad.call(this, { ...payload, data });
  };
}

export default m;
