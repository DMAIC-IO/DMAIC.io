/**
 * D.Mike — Kano Module (kano.js)
 *
 * Klassifiziert Anforderungen aus dem VoC→CTx-Baum nach dem Kano-Modell.
 * DMAIC-Phase: Define.
 *
 * Der Model (kano-model.js) hält den persistierten Zustand, kano-link.js die
 * gesamte Kenntnis des Baum-Moduls, kano-engine.js die Auswertung. Diese
 * data-Fn besitzt nur die Ansicht: Quellenauswahl, Sync-Anzeige, Erfassung,
 * Ergebnisaufbereitung und das Chart-Mount.
 *
 * Datenrichtung ist eine Einbahnstraße — es wird nie in den Baum geschrieben.
 *
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Quelle und Ebene der
 *   Merkmale, das Übernehmen der Merkmale aus dem Baum, die Merkmalliste
 *   selbst, Befragte anlegen, umbenennen, auswählen und entfernen, jede
 *   einzelne Antwort und die dritte Frage nach der Wichtigkeit. Der
 *   Oberfläche bleiben die Rückfragen vor dem Ebenenwechsel und vor dem
 *   Löschen einer Befragten, das Inline-Umbenennen am Reiter und der
 *   Dateidownload.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { State } from './kano-model.js';
import { listTrees, flatten, diff, applyDiff, LEVELS } from './kano-link.js';
import { evaluate, Q_WARN } from '../../engines/kano-engine.js';
import { kanoScatterConfig } from './kano-chart.js';
import { ensureXLSX, downloadBlob } from '../../core/export-utils.js';
import { exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import { provisionInstance } from '../../core/examples-registry.js';
import { treePhaseForCycle } from '../voc-ctx-tree/voc-ctx-tree-phase.js';
import { DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { uid } from '../../core/uid.js';

// Die Antwortfelder und ihre Wertemengen. Beide Skalen sind 1-BASIERT;
// `requireIndex` passt darauf nicht (es ließe die 0 durch und meldete
// „allowed: 0..5"), deshalb die tatsächliche Wertemenge — `null` ist der
// dokumentierte Leerwert „unbeantwortet" (Ruling 52).
// Der Leerwert wird VOR dem Prüfer abgefangen, nicht in seine Wertemenge
// aufgenommen: `[null, 1, …].join(', ')` meldete „allowed: , 1, 2, …" mit
// einem leeren Posten, den kein Agent deuten kann. So bleibt die Meldung
// sauber, und ein FEHLENDES Argument (`undefined`) läuft weiter in den
// Prüfer und wirft (Ruling 55).
const ANSWER_FIELDS = ['f', 'd', 'w'];
const SCALE_5 = [1, 2, 3, 4, 5];
const SCALE_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Die Felder, die ein Merkmal trägt — die Prüfliste von `setItems`. */
const ITEM_FIELDS = ['id', 'nodeId', 'label', 'path', 'missing'];

/**
 * Die Schlüsselfläche von `setAnswer`: die drei Fragen je Merkmal.
 *
 * @typedef {object} AnswerField
 * @property {number|null} f  funktionale Frage, 1–5
 * @property {number|null} d  dysfunktionale Frage, 1–5
 * @property {number|null} w  Wichtigkeit, 1–9
 */

/**
 * Die Auswertung (`evaluate()` aus `kano-engine.js`), wie `read().evaluation`
 * sie liefert.
 *
 * @typedef {object} KanoEvaluation
 * @property {KanoRow[]} rows  je Merkmal eine Zeile, nach Kategorie sortiert
 * @property {KanoTotals} totals  Kennzahlen über alle Merkmale
 */

/**
 * @typedef {object} KanoRow
 * @property {string} itemId  Merkmal
 * @property {string} label  Name des Merkmals
 * @property {string} path  Herkunft im Baum
 * @property {boolean} missing  im Quellbaum nicht mehr vorhanden
 * @property {KanoCounts} counts  Antworten je Kategorie
 * @property {number} n  klassifizierte Antworten
 * @property {number} unanswered  nicht klassifizierbare Antworten
 * @property {'M'|'O'|'A'|'I'|'R'|'Q'|null} category  häufigste Kategorie
 * @property {boolean} tie  Gleichstand an der Spitze
 * @property {number|null} cs  Zufriedenheitskoeffizient (Better)
 * @property {number|null} ds  Unzufriedenheitskoeffizient (Worse)
 * @property {number|null} importanceMean  mittlere Wichtigkeit
 * @property {number} importanceN  Zahl der Wichtigkeitsangaben
 */

/**
 * @typedef {object} KanoCounts
 * @property {number} M  Muss
 * @property {number} O  Leistung
 * @property {number} A  Begeisterung
 * @property {number} I  indifferent
 * @property {number} R  umgekehrt
 * @property {number} Q  widersprüchlich
 */

/**
 * @typedef {object} KanoTotals
 * @property {number} items  Zahl der Merkmale
 * @property {number} respondents  Zahl der Befragten
 * @property {number} completeness  Anteil klassifizierter Antworten, 0–1
 * @property {number} qShare  Anteil widersprüchlicher Antworten, 0–1
 */

/**
 * @typedef {object} AgentRead
 * @property {object} source  origin of the items: `{ instanceId, level }`
 * @property {object} options  the capture options (`importance`)
 * @property {object[]} items  [bulk] the items to rate, in capture order
 * @property {object[]} respondents  the respondents in creation order
 * @property {object} answers  the answers by respondent and item
 * @property {string|null} activeRespondentId  id of the respondent shown in the capture grid
 * @property {Array<{instanceId: string, name: string}>} treeList  the VoC-CTx trees `setSourceTree` accepts
 * @property {KanoEvaluation} evaluation  the evaluation per item and in total, each item described under keys
 */
export default createModule({
  config: {
    id: 'kano',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.kano',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.xlsx', title: 'export.xlsx', onClick: (d) => d.exportXLSX() },
        { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d.exportCSV() },
        { icon: 'format.png',  title: 'export.png',  onClick: (d) => d.exportPNG() },
        { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d.exportSVG() },
      ] },
    ],
  },
  Model: State,

  /**
   * Bereitet das Beispiel vor, bevor es in den State geht. Der Hook läuft
   * synchron (template-module.js), deshalb sind hier nur synchrone
   * Seiteneffekte erlaubt.
   *
   * Drei Lagen:
   *   1. Kein Baum im Projekt      → Baum-Instanz anlegen und verknüpfen.
   *   2. Baum vorhanden, aber leer → Beispielbaum hineinschreiben, verknüpfen.
   *   3. Baum vorhanden mit Inhalt → Baum unangetastet lassen, Items losgelöst
   *      laden (nodeId null). voc-ctx-tree ist Singleton, ein zweiter Baum ist
   *      gar nicht möglich, und fremde Daten zu überschreiben ist keine Option.
   *
   * Die Phase der neu provisionierten `voc-ctx-tree`-Instanz (Lage 1) hängt
   * vom aktiven Zyklus ab (`treePhaseForCycle`, s. o.) — `ctx.moduleRegistry`
   * gibt es im Modul-Kontext nicht (`js/ui/workspace.js` `_buildContext`),
   * der reale State-Key für den aktiven Zyklus heißt `projectMeta.cycle`
   * (nicht `activeCycle`).
   *
   * `template-module.js` ruft diesen Hook als `beforeLoadExample.call(this,
   * payload.data)` auf — `this` ist hier also die Modul-Instanz, `this._context`
   * folglich der echte Kontext der gerade ladenden Instanz (kein modulweiter
   * Zustand, keine Verwechslungsgefahr bei mehreren offenen Kano-Instanzen).
   *
   * @param {{ tree: object, kano: object }} data
   * @returns {object} der zu setzende Kano-State
   */
  beforeLoadExample(data) {
    const ctx = this._context;
    const kano = JSON.parse(JSON.stringify(data.kano));
    const trees = listTrees(ctx?.stateManager);

    if (trees.length === 0) {
      const cycleId = ctx?.stateManager?.get('projectMeta.cycle') || DEFAULT_CYCLE;
      const instanceId = provisionInstance(ctx, {
        moduleId: 'voc-ctx-tree', phase: treePhaseForCycle(cycleId), state: data.tree,
      });
      kano.source.instanceId = instanceId;
      return kano;
    }

    const target = trees.find((t) => !(t.state?.vocs?.length));
    if (target) {
      ctx.stateManager.setModuleState(target.instanceId, data.tree);
      // `setModuleState` schreibt nur den persistierten Snapshot — eine
      // bereits gemountete (z. B. sichtbare/leere) voc-ctx-tree-Instanz liest
      // ihren reaktiven Alpine-State nicht automatisch neu ein. Denselben Weg
      // wie der Cross-Tab-Sync nehmen (state-manager.js emittiert dasselbe
      // Event bei Remote-Änderungen; workspace.js hört bereits darauf und
      // ruft `applyRemoteState` auf der passenden Instanz auf).
      ctx.eventBus?.emit?.('state:remote-changed', {
        instanceIds: [target.instanceId], metaChanged: false,
      });
      kano.source.instanceId = target.instanceId;
      return kano;
    }

    kano.source.instanceId = null;
    kano.items = kano.items.map((i) => ({ ...i, nodeId: null }));
    return kano;
  },

  data(module, _t) {
    return {
      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Erfassung, Befragte und die wählbaren Bäume
       */
      read(options) {
        return readAgentState('kano', {
          ...this.model.toJSON(),
          treeList: this.treeList.map((tr) => ({ instanceId: tr.instanceId, name: this.treeLabel(tr) })),
          evaluation: this.result(),
        }, options);
      },
      /** @type {Array<{instanceId: string, state: object|null}>} */
      treeList: [],
      /** @type {{added: number, renamed: number, missing: number}} */
      pending: { added: 0, renamed: 0, missing: 0 },
      /** @type {string|null} id der:s Befragten, deren Reitername gerade bearbeitet wird */
      renamingRespondentId: null,
      /** @type {string} Eingabewert während des Umbenennens */
      renameValue: '',
      /** @type {object[]} gemountete Chart-Instanzen */
      _charts: [],
      /** Render-Generation — verhindert Mounts aus überholten Durchläufen. */
      _renderGen: 0,
      /** true, sobald destroy() lief — sperrt Mounts, die danach zurückkommen. */
      _destroyed: false,

      /** @noagent lifecycle, kein Zustandsweg: lädt die Baumliste und abonniert Änderungen am Projekt-State. */
      init() {
        this.refreshTrees();
        const eb = module._context.eventBus;
        this._unsubs = [];
        const onChange = () => this.refreshTrees();
        for (const evt of ['state:saved', 'module:added', 'module:removed']) {
          eb.on(evt, onChange);
          this._unsubs.push(() => eb.off(evt, onChange));
        }

        // Eine reine Inhaltsänderung im Baum (Knoten umbenannt/gelöscht/neu)
        // läuft über setModuleState() — die emittiert NICHT 'state:saved' (das
        // feuert nur aus save(), also bei Phasen-/Metaänderungen), sondern
        // 'data:changed' mit der Nutzlast `module:${instanceId}` bzw.
        // `module:${instanceId}:removed` (state-manager.js). Ohne dieses Abo
        // blieb der Sync-Status in einer laufenden Sitzung stehen, bis ein
        // Reload den Baum neu einlas.
        const onDataChanged = (payload) => {
          if (typeof payload !== 'string' || !payload.startsWith('module:')) return;
          const changedId = payload.slice('module:'.length).replace(/:removed$/, '');
          if (this.treeList.some((t) => t.instanceId === changedId)) this.refreshTrees();
        };
        eb.on('data:changed', onDataChanged);
        this._unsubs.push(() => eb.off('data:changed', onDataChanged));

        // Sicherheitsnetz beim Zurückwechseln auf die eigene Instanz (Muster
        // correlation.js:597) — falls beim Wegnavigieren etwas verpasst wurde.
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this.refreshTrees();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        this.$nextTick(() => this.mountChart());
        const onTheme = () => this.mountChart();
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
      },

      /** @noagent lifecycle, kein Zustandsweg: meldet alle Event-Bus-Subscriptions wieder ab. */
      destroy() {
        this._destroyed = true;
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        this.destroyCharts();
      },

      // ── Quelle ────────────────────────────────────────────────

      /** @noagent view transform: liest die Baumliste neu und aktualisiert den Sync-Status. */
      refreshTrees() {
        this.treeList = listTrees(module._context.stateManager);
        // Auto-Verknüpfung nur für ein frisches, leeres Kano (Komfort: einziger
        // Baum im Projekt → keine manuelle Auswahl nötig). Ohne die
        // `items.length === 0`-Bedingung würde dieselbe Zeile einen bewusst
        // losgelöst geladenen Beispielzustand (Lage 3 in beforeLoadExample,
        // source.instanceId: null trotz vorhandener Items) beim nächsten
        // `state:saved`/`module:added`/`module:removed` sofort wieder an den
        // fremden Baum hängen — und genau das darf nicht passieren.
        //
        // `!module._loadingExample`: Lage 1 in `beforeLoadExample` provisioniert
        // synchron eine neue voc-ctx-tree-Instanz (`provisionInstance`) und
        // emittiert dabei synchron `module:added` — noch BEVOR `setState()`
        // (template-module.js `loadExample`) diese (also die EIGENE, gerade
        // ladende) Kano-Instanz neu aufbaut. Die ALTE, gleich zu ersetzende
        // Alpine-Komponente hört dieses Ereignis über genau diesen Handler und
        // würde hier `this.model.source.instanceId` mutieren — eine Mutation an
        // einem Objekt, dessen persist-$watch beim nächsten Reactivity-Flush
        // (ein späterer Microtask, nach dem synchronen `loadExample`-Ablauf)
        // noch feuert, selbst wenn die Komponente inzwischen per
        // `Alpine.destroyTree()` "zerstört" wurde (Alpine stoppt zwar künftiges
        // Tracking, lässt aber einen bereits eingereihten Job noch einmal
        // laufen). Das persistiert dann das VERALTETE, leere Modell — NACH dem
        // korrekten Sechs-Item-Zustand aus `loadExample`, und überschreibt ihn
        // damit still (sichtbar erst bei Reload/Sprachwechsel). `module`
        // (== `this` in `loadExample`) bleibt über den Alpine-Rebuild hinweg
        // dieselbe Objektreferenz, das Flag ist also zuverlässig sichtbar.
        if (!module._loadingExample && !this.model.source.instanceId
            && this.treeList.length === 1 && this.model.items.length === 0) {
          // Geschrieben wird über `setSourceTree` — dieselbe Senke wie die der
          // Agentenfläche, damit `source.instanceId` genau eine
          // Zuweisungsstelle hat (Ruling 56).
          this.setSourceTree(this.treeList[0].instanceId);
          return;
        }
        this.refreshPending();
      },

      /**
       * Lesbarer Name einer Baum-Instanz für das Auswahlfeld: Text der ersten
       * VoC, sonst die instanceId als Rückfall (Muster msa-typ6.js:507).
       * @param {{instanceId: string, state: object|null}} tr
       * @returns {string}
       * @noagent view transform
       */
      treeLabel(tr) {
        return tr?.state?.vocs?.[0]?.text || tr?.instanceId || '';
      },

      /** @noagent view transform. @returns {object|null} State des verknüpften Baums */
      activeTreeState() {
        const id = this.model.source.instanceId;
        return id ? (this.treeList.find((t) => t.instanceId === id)?.state || null) : null;
      },

      /** @noagent view transform. @returns {boolean} true, wenn kein Baum im Projekt existiert */
      hasNoTree() { return this.treeList.length === 0; },

      /** @noagent view transform. @returns {boolean} true, wenn Items ohne Baumbezug vorliegen */
      isDetached() {
        return !this.model.source.instanceId && this.model.items.length > 0;
      },

      /**
       * @noagent DOM event handler: packt die Baumwahl aus dem Select aus.
       * Geschrieben wird über `setSourceTree`, dieselbe Senke wie die der
       * Agentenfläche.
       */
      changeTree(ev) {
        this.setSourceTree(ev.target.value || null);
      },

      /**
       * Verknüpft die Merkmale mit einer Instanz des VoC-CTx-Baum-Moduls.
       * @agent
       * @param {string|null} instanceId Instanz des Baum-Moduls, oder `null`
       *   für keine Verknüpfung
       * @returns {void}
       * @throws {Error} wenn keine Baum-Instanz dieses Projekts diese id trägt
       */
      setSourceTree(instanceId) {
        if (instanceId !== null) {
          requireKnownId('instanceId', instanceId, this.treeList.map((t) => t.instanceId));
        }
        this.model.source.instanceId = instanceId;
        this.refreshPending();
      },

      // ── Ebene ─────────────────────────────────────────────────

      /**
       * @noagent DOM event handler: packt die Ebenenwahl aus dem Select aus
       * und fragt vor dem Verwerfen erfasster Antworten zurück; ein Agent
       * darf keine Rückfrage auslösen — er blockierte den Stapel (E3).
       * Geschrieben wird über `setSourceLevel`.
       * @param {Event} ev
       */
      async changeLevel(ev) {
        const next = ev.target.value;
        const hasAnswers = Object.values(this.model.answers)
          .some((byItem) => Object.values(byItem || {})
            .some((a) => a.f !== null || a.d !== null || a.w !== null));
        if (hasAnswers) {
          const ok = await module._context.dialog.confirm({ message: _t('levelChangeConfirm'), danger: true });
          if (!ok) { ev.target.value = this.model.source.level; return; }
        }
        this.setSourceLevel(next);
      },

      /**
       * Setzt die Ebene des Baums, aus der die Merkmale kommen. Die
       * Merkmalliste und alle erfassten Antworten werden dabei verworfen —
       * sie gehören zur alten Ebene.
       * @agent
       * @param {'need'|'driver'|'req'} level die Ebene des Baums
       * @returns {void}
       * @throws {Error} wenn `level` keine der drei Ebenen ist
       */
      setSourceLevel(level) {
        requireEnum('level', level, LEVELS);
        this.model.source.level = level;
        this.setItems([]);
        this.model.answers = {};
        this.refreshPending();
        this.$nextTick(() => this.mountChart());
      },

      /**
       * @noagent Umschaltung, deren Ausgang allein am Vorzustand hängt;
       * delegiert an `setImportance`, damit das Feld genau eine
       * Zuweisungsstelle hat.
       */
      toggleImportance() {
        this.setImportance(!this.model.options.importance);
      },

      /**
       * Schaltet die dritte Frage nach der Wichtigkeit ein oder aus.
       * @agent
       * @param {boolean} enabled true erfasst die Wichtigkeit mit, false
       *   lässt die Frage weg
       * @returns {void}
       * @throws {Error} wenn `enabled` kein Wahrheitswert ist
       */
      setImportance(enabled) {
        requireEnum('enabled', enabled, [true, false]);
        this.model.options.importance = enabled;
        this.$nextTick(() => this.mountChart());
      },

      // ── Sync ──────────────────────────────────────────────────

      /** @noagent view transform: zählt das offene Diff gegen den Baum. */
      refreshPending() {
        const tree = this.activeTreeState();
        if (!tree) { this.pending = { added: 0, renamed: 0, missing: 0 }; return; }
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.pending = { added: d.added.length, renamed: d.renamed.length, missing: d.missing.length };
      },

      /** @noagent view transform. @returns {boolean} true, wenn es etwas zu übernehmen gibt */
      hasPending() {
        const p = this.pending;
        return p.added + p.renamed + p.missing > 0;
      },

      /** @noagent view transform: die Statuszeile unter dem Übernahmeknopf. */
      syncStatus() {
        if (this.isDetached()) return _t('syncDetached');
        if (!this.activeTreeState()) return '';
        if (!this.hasPending()) return _t('syncClean');
        return _t('syncPending', {
          added: this.pending.added,
          renamed: this.pending.renamed,
          missing: this.pending.missing,
        });
      },

      /**
       * Übernimmt die Merkmale der eingestellten Ebene aus dem verknüpften
       * Baum: neue kommen hinzu, umbenannte werden nachgezogen, im Baum nicht
       * mehr vorhandene werden als fehlend markiert. Gelöscht wird nie.
       * @agent
       * @returns {boolean} true wenn übernommen wurde, false wenn keine
       *   Baum-Instanz verknüpft ist und nichts zu übernehmen war
       */
      applySync() {
        const tree = this.activeTreeState();
        // Keine Verknüpfung ist eine fachliche Absage: die Oberfläche
        // deaktiviert den Knopf im selben Fall.
        if (!tree) return false;
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.setItems(applyDiff(this.model.items, d, () => uid()));
        this.$nextTick(() => this.mountChart());
        return true;
      },

      /**
       * Ersetzt die Liste der zu bewertenden Merkmale.
       * @agent
       * @param {Array<object>} items die Merkmale; je Merkmal `id` (nötig und
       *   eindeutig), und wahlweise `label`, `path`, `nodeId` und `missing`
       * @returns {number} die Zahl der übernommenen Merkmale
       * @throws {Error} wenn `items` kein Array ist, einem Merkmal die `id`
       *   fehlt, eine `id` doppelt vorkommt oder ein Feld den falschen Typ
       *   trägt
       */
      setItems(items) {
        if (!Array.isArray(items)) {
          throw new Error(`invalid items ${JSON.stringify(items)}; allowed: an array of objects with at least id`);
        }
        const seen = new Set();
        const normalized = items.map((raw) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.id !== 'string' || !raw.id) {
            throw new Error(`invalid items ${JSON.stringify(items)}; allowed: an array of objects with at least id`);
          }
          for (const key of Object.keys(raw)) {
            if (!ITEM_FIELDS.includes(key)) {
              throw new Error(`invalid item field ${JSON.stringify(key)}; allowed: ${ITEM_FIELDS.join(', ')}`);
            }
          }
          if (seen.has(raw.id)) {
            throw new Error(`invalid items; allowed: an array with distinct ids, ${JSON.stringify(raw.id)} appears twice`);
          }
          seen.add(raw.id);
          if (raw.nodeId !== undefined && raw.nodeId !== null && typeof raw.nodeId !== 'string') {
            throw new Error(`invalid nodeId ${JSON.stringify(raw.nodeId)}; allowed: a string or null`);
          }
          for (const key of ['label', 'path']) {
            if (raw[key] !== undefined && typeof raw[key] !== 'string') {
              throw new Error(`invalid ${key} ${JSON.stringify(raw[key])}; allowed: any string, "" clears it`);
            }
          }
          if (raw.missing !== undefined) requireEnum('missing', raw.missing, [true, false]);
          return {
            id: raw.id,
            nodeId: raw.nodeId ?? null,
            label: raw.label ?? '',
            path: raw.path ?? '',
            missing: raw.missing ?? false,
          };
        });
        this.model.setItems(normalized);
        this.refreshPending();
        return normalized.length;
      },

      // ── Befragte ──────────────────────────────────────────────

      /**
       * Legt eine Befragte an — mit dem angegebenen Namen, oder, wenn er
       * leer ist oder fehlt, mit einem laufenden Vorgabenamen. Die erste
       * Befragte wird dabei ausgewählt.
       * @agent
       * @param {string} [name] der Name der neuen Befragten; leer oder
       *   weggelassen verwendet den Vorgabenamen
       * @returns {string} die id der neuen Befragten
       * @throws {Error} wenn `name` angegeben und keine Zeichenkette ist
       */
      addRespondent(name) {
        const given = name === undefined ? '' : requireText('name', name).trim();
        if (given) return this.model.addRespondent(given);
        const n = this.model.respondents.length + 1;
        return this.model.addRespondent(_t('respondentDefault', { n }));
      },

      /**
       * Benennt eine Befragte um.
       * @agent
       * @param {string} id id der Befragten
       * @param {string} name der neue Name
       * @returns {boolean} true wenn umbenannt wurde, false wenn der Name
       *   leer war und der alte stehen blieb
       * @throws {Error} wenn keine Befragte diese id trägt oder `name` keine
       *   Zeichenkette ist
       */
      renameRespondent(id, name) {
        requireKnownId('id', id, this.model.respondents.map((r) => r.id));
        if (typeof name !== 'string') {
          throw new Error(`invalid name ${JSON.stringify(name)}; allowed: a non-empty string`);
        }
        const trimmed = name.trim();
        // Ein leerer Name ist die fachliche Absage: das Inline-Feld verwirft
        // ihn genauso und lässt den alten stehen.
        if (!trimmed) return false;
        this.model.renameRespondent(id, trimmed);
        return true;
      },

      /**
       * Entfernt eine Befragte samt allen ihren Antworten. War sie
       * ausgewählt, rückt die erste verbleibende nach.
       * @agent
       * @param {string} id id der Befragten
       * @returns {void}
       * @throws {Error} wenn keine Befragte diese id trägt
       */
      deleteRespondent(id) {
        requireKnownId('id', id, this.model.respondents.map((r) => r.id));
        this.model.deleteRespondent(id);
        this.$nextTick(() => this.mountChart());
      },

      /**
       * @noagent fragt vor dem Löschen zurück; ein Agent darf keine Rückfrage
       * auslösen — er blockierte den Stapel (E3). Delegiert an
       * `deleteRespondent`.
       * @param {string} id
       */
      async removeRespondent(id) {
        const ok = await module._context.dialog.confirm({ message: _t('respondentDeleteConfirm'), danger: true });
        if (ok && this.model.respondents.some((r) => r.id === id)) this.deleteRespondent(id);
      },

      /**
       * Wählt die Befragte aus, deren Antworten das Erfassungsraster zeigt.
       * Antwortdaten bleiben unberührt.
       * @agent
       * @param {string|null} id id der Befragten, oder `null` für keine Auswahl
       * @returns {void}
       * @throws {Error} wenn keine Befragte diese id trägt
       */
      selectRespondent(id) {
        // `null` ist der dokumentierte Leerwert des Feldes (Ruling 52): das
        // Model setzt ihn selbst, wenn die letzte Befragte entfernt wird.
        if (id !== null) {
          requireKnownId('id', id, this.model.respondents.map((r) => r.id));
        }
        this.model.activeRespondentId = id;
      },

      /** @noagent view transform: Klassen des Reiters — aktiver Reiter bekommt den Modifier. */
      tabClass(id) {
        return id === this.model.activeRespondentId ? 'dmike-tab--active' : '';
      },

      /** @noagent view transform. @returns {boolean} true, wenn der Reitername gerade bearbeitet wird */
      isRenaming(id) { return this.renamingRespondentId === id; },

      /** @noagent view transform: Tooltip auf dem Reiter — Name und Umbenennhinweis. */
      respondentRenameTitle(name) { return `${name} — ${_t('respondentRenameHint')}`; },

      /** @noagent öffnet das Inline-Eingabefeld für den Reiternamen (Umbenennpuffer der Oberfläche). */
      startRename(id) {
        const r = this.model.respondents.find((x) => x.id === id);
        if (!r) return;
        this.renamingRespondentId = id;
        this.renameValue = r.name;
        this.$nextTick(() => {
          const input = module._container.querySelector('.kano__tab-rename-input');
          if (input) { input.focus(); input.select(); }
        });
      },

      /**
       * @noagent schließt das Inline-Umbenennen ab; geschrieben wird über
       * `renameRespondent`, dieselbe Senke wie die der Agentenfläche. Ein
       * leerer Name wird verworfen, der alte bleibt stehen.
       */
      commitRename() {
        if (!this.renamingRespondentId) return;
        if (this.model.respondents.some((r) => r.id === this.renamingRespondentId)) {
          this.renameRespondent(this.renamingRespondentId, this.renameValue);
        }
        this.renamingRespondentId = null;
        this.renameValue = '';
      },

      /** @noagent bricht das Inline-Umbenennen ohne Übernahme ab. */
      cancelRename() {
        this.renamingRespondentId = null;
        this.renameValue = '';
      },

      // ── Antworten ─────────────────────────────────────────────

      /** @noagent view transform. @returns {string} Wert für das Select ('' wenn nicht gesetzt) */
      answerValue(itemId, field) {
        const v = this.model.answerOf(this.model.activeRespondentId, itemId)[field];
        return v === null ? '' : String(v);
      },

      /**
       * @noagent DOM event handler: packt den Select-Wert aus. Geschrieben
       * wird über `setAnswer`, dieselbe Senke wie die der Agentenfläche.
       * @param {string} itemId
       * @param {'f'|'d'|'w'} field
       * @param {Event} ev
       */
      setAnswerFromEvent(itemId, field, ev) {
        const raw = ev.target.value;
        this.setAnswer(
          this.model.activeRespondentId, itemId, field, raw === '' ? null : Number(raw)
        );
      },

      /**
       * Setzt eine einzelne Antwort einer Befragten zu einem Merkmal.
       * @agent
       * @param {string} respondentId id der Befragten
       * @param {string} itemId id des Merkmals
       * @param {keyof AnswerField} field welche Frage
       * @param {number|null} value der Wert; Bereich je Frage siehe `AnswerField`
       * @returns {void}
       * @throws {Error} wenn keine Befragte oder kein Merkmal diese id trägt,
       *   `field` keines der drei Antwortfelder ist oder `value` nicht auf der
       *   Skala dieses Feldes liegt
       */
      setAnswer(respondentId, itemId, field, value) {
        requireKnownId('respondentId', respondentId, this.model.respondents.map((r) => r.id));
        requireKnownId('itemId', itemId, this.model.items.map((i) => i.id));
        requireEnum('field', field, ANSWER_FIELDS);
        if (value !== null) requireEnum('value', value, field === 'w' ? SCALE_9 : SCALE_5);
        this.model.setAnswer(respondentId, itemId, field, value);
        this.$nextTick(() => this.mountChart());
      },

      // ── Items ─────────────────────────────────────────────────

      /**
       * Entfernt ein Merkmal samt allen Antworten dazu.
       * @agent
       * @param {string} id id des Merkmals
       * @returns {void}
       * @throws {Error} wenn kein Merkmal diese id trägt
       */
      removeItem(id) {
        requireKnownId('id', id, this.model.items.map((i) => i.id));
        this.model.deleteItem(id);
        this.refreshPending();
        this.$nextTick(() => this.mountChart());
      },

      /** @noagent view transform: Zeilenklasse — verwaiste Merkmale werden markiert. */
      itemRowClass(item) { return item.missing ? 'kano__row--missing' : ''; },

      /** @noagent view transform. @returns {boolean} true, wenn Erfassung möglich ist */
      canCapture() {
        return this.model.items.length > 0 && Boolean(this.model.activeRespondentId);
      },

      // ── Auswertung ────────────────────────────────────────────

      // Bewusst ohne Cache: die Rechenlast ist trivial und ein Cache müsste an
      // Items, Befragten, Antworten und Optionen hängen.
      /** @noagent view transform: die Live-Auswertung. */
      result() {
        return evaluate(
          this.model.items, this.model.respondents, this.model.answers, this.model.options
        );
      },

      /** @noagent view transform: Kategoriename aus i18n; '—' wenn nicht klassifiziert. */
      catLabel(cat) { return cat ? _t(`cat${cat}`) : '—'; },

      /** Aktuelle Locale für Zahlenformate ('de-DE' | 'en-US'), aus dem Modul-Kontext. */
      _locale() { return module._context.i18n.getLanguage() === 'de' ? 'de-DE' : 'en-US'; },

      /** @noagent view transform: Zahl mit fester Nachkommastelle, lokalisiert; '—' für null. */
      fmt(v, dec) {
        return v === null || v === undefined ? '—'
          : Number(v).toLocaleString(this._locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec });
      },

      /** @noagent view transform: Anteil als lokalisierter Prozenttext. */
      pct(v) {
        const p = Math.round((v || 0) * 100) || 0; // `|| 0` glättet ein mögliches -0
        return `${p.toLocaleString(this._locale())} %`;
      },

      /** @noagent view transform. @returns {boolean} true, wenn der Q-Anteil insgesamt zu hoch ist */
      qWarn() { return this.result().totals.qShare > Q_WARN; },

      /** @noagent view transform: Warntext mit eingesetztem Anteil. */
      qWarnText() {
        return _t('warnQShare', { share: this.pct(this.result().totals.qShare) });
      },

      /** @noagent view transform. @returns {boolean} true, wenn ein Merkmal zu viele Q-Antworten hat */
      rowQWarn(row) { return row.n > 0 && row.counts.Q / row.n > Q_WARN; },

      /** @noagent view transform: Zeilenklasse der Ergebnistabelle. */
      resultRowClass(row) { return this.rowQWarn(row) ? 'kano__row--warn' : ''; },

      // ── Export ────────────────────────────────────────────────

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportHeaders() {
        const h = [_t('colItem'), 'M', 'O', 'A', 'I', 'R', 'Q',
          _t('colCategory'), _t('colCs'), _t('colDs')];
        if (this.model.options.importance) h.push(_t('colImportanceMean'));
        return h;
      },

      /**
       * Reine Zahlenformatierung für den CSV-Export: fester Punkt als
       * Dezimaltrennzeichen, '—' für null. Bewusst NICHT lokalisiert wie
       * `fmt()` — das Projekt trennt CSV-Spalten mit Semikolon, aber schreibt
       * Dezimalwerte trotzdem mit Punkt (siehe pairwise-comparison.js
       * exportCSV: `scores[i].toFixed(1)` in einer `;`-getrennten Datei). Ein
       * lokalisiertes Komma neben dem Semikolon wäre zwar Excel-kompatibel,
       * würde aber vom projektweiten Muster abweichen.
       */
      _csvNum(v, dec) { return v === null || v === undefined ? '—' : Number(v).toFixed(dec); },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportRows() {
        return this.result().rows.map((r) => {
          const row = [r.label, r.counts.M, r.counts.O, r.counts.A, r.counts.I, r.counts.R,
            r.counts.Q, this.catLabel(r.category), this._csvNum(r.cs, 2), this._csvNum(r.ds, 2)];
          if (this.model.options.importance) row.push(this._csvNum(r.importanceMean, 1));
          return row;
        });
      },

      /**
       * Ergebniszeilen für den XLSX-Export: Zähl- und Kennzahlspalten bleiben
       * echte Zahlen (nicht als Text formatiert), damit in Excel damit
       * gerechnet werden kann. Fehlende Werte werden als leere Zelle (null)
       * geschrieben, nicht als '—'-Text.
       */
      _exportRowsXLSX() {
        return this.result().rows.map((r) => {
          const row = [r.label, r.counts.M, r.counts.O, r.counts.A, r.counts.I, r.counts.R,
            r.counts.Q, this.catLabel(r.category), r.cs, r.ds];
          if (this.model.options.importance) row.push(r.importanceMean);
          return row;
        });
      },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportCSV() {
        const rows = this.exportRows();
        if (rows.length === 0) return;
        const esc = (v) => {
          const s = String(v ?? '');
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [this.exportHeaders().map(esc).join(';')];
        for (const row of rows) lines.push(row.map(esc).join(';'));
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'kano.csv');
      },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      async exportXLSX() {
        const rows = this._exportRowsXLSX();
        if (rows.length === 0) return;
        const XLSX = await ensureXLSX();
        const ws = XLSX.utils.aoa_to_sheet([this.exportHeaders(), ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kano');
        XLSX.writeFile(wb, 'kano.xlsx');
      },

      /** @returns {SVGElement|null} das gemountete Better/Worse-Diagramm, falls vorhanden */
      _chartSvg() {
        return module._container.querySelector('[data-ref="chart"] svg');
      },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportPNG() { const svg = this._chartSvg(); if (svg) exportSvgAsPNG(svg, 'kano.png'); },

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportSVG() { const svg = this._chartSvg(); if (svg) exportSvgAsFile(svg, 'kano.svg'); },

      // ── Chart ─────────────────────────────────────────────────

      /** @noagent lifecycle, kein Zustandsweg: räumt alle gemounteten Chart-Instanzen ab. */
      destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      /** @noagent lifecycle, kein Zustandsweg: mountet das Better/Worse-Diagramm neu. */
      async mountChart() {
        if (this._destroyed) return;
        this._renderGen++;
        const gen = this._renderGen;
        this.destroyCharts();

        const host = module._container.querySelector('[data-ref="chart"]');
        if (!host) return;

        // Eine Serie je Item, Legende aus: siehe kano-chart.js. Achsenbereich
        // und Tooltip-Trefferauswahl arbeiten unverändert über alle Serien.
        const { series, refLines } = kanoScatterConfig(this.result().rows, {
          importance: this.model.options.importance,
          sizeLabel: _t('colImportanceMean'),
        });
        if (series.length === 0) return;

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: _t('chartX'),
          yLabel: _t('chartY'),
          showLegend: false,
          series,
          refLines,
        });
        // `_destroyed` mitprüfen, nicht nur die Generation: läuft destroy()
        // während `create()` noch im await hängt, ist `_charts` beim
        // destroyCharts() leer und `_renderGen` unverändert — der Chart käme
        // sonst in die Liste einer toten Komponente und bliebe als zweites
        // SVG im Host stehen (sichtbar nach einem Reload).
        if (this._destroyed || gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      },
    };
  },
});
