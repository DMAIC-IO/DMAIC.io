/**
 * D.Mike — Evolutionstrends (TRIZ) (triz-evolution-trends.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: das betrachtete System
 *   sowie Stufe und Notiz jedes der acht Trends. Der Oberfläche bleiben nur
 *   die Anzeigeentscheidungen (Nummerierung, Namen, Platzhalter, Markierung
 *   der gewählten Stufe).
 */
import { createModule } from '../../core/template-module.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireKnownId, requireIndex, requireText } from '../../core/agent/agent-argcheck.js';
import { State, TRENDS } from './triz-evolution-trends-model.js';

export default createModule({
  config: {
    id: 'triz-evolution-trends',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-evolution-trends',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    return {
      ...agentReadMixin(module),

      /** @noagent view transform — CSS-Klasse der gewählten Stufe. */
      selectedClass: (e, s) => e.stage === s ? 'is-selected' : '',
      /** @noagent view transform — ist diese Stufe die gewählte? */
      isSelected: (e, s) => e.stage === s,
      /** @noagent view transform — CSS-Klasse eines qualitativen Trends. */
      qualClass: (e) => e.hasStages ? '' : 'triz-evo__trend--qualitative',
      /** @noagent view transform — übersetzter Trendname. */
      trendName: (id) => _t(`trend.${  id  }.name`),
      /** @noagent view transform — übersetzte Trendbeschreibung. */
      trendDesc: (id) => _t(`trend.${  id  }.description`),
      /** @noagent view transform — übersetzter Name einer Stufe. */
      trendStageName: (id, s) => _t(`trend.${  id  }.stages.${  s}`),
      /** @noagent view transform — Platzhalter des Notizfeldes. */
      notesPlaceholder: (id, e) => e.hasStages
        ? _t('notesPlaceholder')
        : _t(`trend.${  id  }.notesPlaceholder`),
      /** @noagent view transform — Gruppenname der Radioknöpfe eines Trends. */
      radioName: (id) => `triz-evo-${  id}`,
      /** @noagent view transform — Anzeigenummer einer Stufe (1-basiert). */
      trendNum: (i) => i + 1,
      // Alpine x-for over an object exposes the key, not a numeric $index (the
      // legacy engine's $index magic does not exist in this CSP build), so the
      // trend's display number comes from its position in TRENDS.
      /** @noagent view transform — Anzeigenummer eines Trends (1-basiert). */
      trendNumById: (id) => TRENDS.findIndex(t => t.id === id) + 1,

      // ── Zustands-Sinks ────────────────────────────────────────────────
      // Die Vorlage ruft genau diese drei Aktionen — es gibt keinen
      // zweiten Codeweg. Die vorherigen Event-Auspacker `systemChanged`
      // und `stageChanged` sind entfallen: `stageChanged` nahm den
      // `entry` aus `x-for`, also ein `Trend`-Objekt, das ein Agent nicht
      // bauen kann (Plan-Regel B verlangt, auf einen Primitiv zu
      // verengen), und `systemChanged` nahm ein `Event`. Beide waren
      // reine Weiterleitungen; ein paralleler Sink daneben hätte dasselbe
      // Feld auf zwei Wegen geschrieben.

      /**
       * Setzt das betrachtete System, dessen Entwicklung eingeordnet wird.
       * @agent
       * @param {string} text Name oder kurze Beschreibung des Systems
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setSystem(text) { this.model.system = requireText('text', text); },

      // `-1` nimmt die Einordnung zurück und wirft nicht: die Feldhilfe von
      // `trends` liefert `-1` als Leerwert aus („-1 heißt: keine gewählt"),
      // also muss diese Senke ihn erreichen können (Ruling 52). `fromJSON`
      // kennt `-1` ohnehin als gültigen persistierten Wert. Jede ANDERE
      // Stufe außerhalb der Skala wirft weiter.
      /**
       * Setzt die erreichte Stufe eines Trends.
       * @agent
       * @param {string} trendId id des Trends
       * @param {number} stage die Stufe, 0-basiert; `-1` nimmt die
       *   Einordnung zurück
       * @returns {boolean} true wenn gesetzt, false wenn der Trend keine
       *   Stufenskala hat — dann ist nichts passiert
       * @throws {Error} wenn kein Trend diese id trägt, oder wenn die Stufe
       *   keine ganze Zahl innerhalb der Skala dieses Trends und nicht `-1` ist
       */
      setTrendStage(trendId, stage) {
        requireKnownId('trendId', trendId, Object.keys(this.model.trends));
        const entry = this.model.trends[trendId];
        // Ein qualitativer Trend hat keine Stufen — die Vorlage zeigt dort
        // keine Radiogruppe. Das ist eine fachliche Absage, kein Fehler:
        // die id ist gültig und bekannt, nur die Skala fehlt.
        if (!entry.hasStages) return false;
        if (stage === -1) { entry.stage = -1; return true; }
        requireIndex('stage', stage, entry.availableStages.length - 1);
        entry.stage = stage;
        return true;
      },

      /**
       * Setzt die Notiz eines Trends — was die Einordnung für dieses System
       * konkret bedeutet.
       * @agent
       * @param {string} trendId id des Trends
       * @param {string} text die Notiz
       * @returns {void}
       * @throws {Error} wenn kein Trend diese id trägt, oder `text` keine
       *   Zeichenkette ist
       */
      setTrendNotes(trendId, text) {
        requireKnownId('trendId', trendId, Object.keys(this.model.trends));
        this.model.trends[trendId].notes = requireText('text', text);
      },
    }
  },
})
