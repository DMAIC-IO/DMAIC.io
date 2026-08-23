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
 */

import { createModule } from '../../core/template-module.js';
import { State } from './kano-model.js';
import { listTrees, flatten, diff, applyDiff } from './kano-link.js';
import { evaluate } from '../../engines/kano-engine.js';
import { ensureXLSX, XLSX, downloadBlob } from '../../core/export-utils.js';
import { exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import { provisionInstance } from '../../core/examples-registry.js';
import manifest from '../manifest.js';
import { DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
import { uid } from '../../core/uid.js';

/**
 * Ermittelt die Phase, in der eine frisch provisionierte `voc-ctx-tree`-
 * Instanz im aktiven Zyklus landen muss.
 *
 * `voc-ctx-tree` ist zyklusabhängig verortet (`js/modules/manifest.js`):
 * unter DMAIC/DMADV in `define`, unter 8D aber in `problem` — der 8D-Zyklus
 * kennt gar keine `define`-Phase. Ein fest verdrahtetes `'define'` hätte die
 * neue Instanz unter 8D in eine nicht existierende Phase geschrieben
 * (unsichtbar, und bei einem Zyklenwechsel potenziell als zweiter Baum, was
 * die Singleton-Annahme der Lage-3-Schutzlogik in `beforeLoadExample`
 * untergräbt).
 *
 * Der Modul-Kontext (`js/ui/workspace.js` `_buildContext`) reicht keine
 * `moduleRegistry` durch, daher direkt aus dem statischen Manifest gelesen
 * (reine Daten, keine Bootstrap-Seiteneffekte) statt über die zur Laufzeit
 * gepflegte Registry.
 *
 * @param {string} cycleId
 * @returns {string}
 */
function treePhaseForCycle(cycleId) {
  const def = manifest.find((m) => m.id === 'voc-ctx-tree');
  return def?.cycles?.[cycleId]?.phase || def?.phase || 'define';
}

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

      /** Alpine-Lifecycle-Hook: lädt die Baumliste und abonniert Änderungen am Projekt-State. */
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

      /** Alpine-Lifecycle-Hook: meldet alle Event-Bus-Subscriptions wieder ab. */
      destroy() {
        this._destroyed = true;
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        this.destroyCharts();
      },

      // ── Quelle ────────────────────────────────────────────────

      /** Liest die Baumliste neu und aktualisiert den Sync-Status. */
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
          this.model.source.instanceId = this.treeList[0].instanceId;
        }
        this.refreshPending();
      },

      /**
       * Lesbarer Name einer Baum-Instanz für das Auswahlfeld: Text der ersten
       * VoC, sonst die instanceId als Rückfall (Muster msa-typ6.js:507).
       * @param {{instanceId: string, state: object|null}} tr
       * @returns {string}
       */
      treeLabel(tr) {
        return tr?.state?.vocs?.[0]?.text || tr?.instanceId || '';
      },

      /** @returns {object|null} State des verknüpften Baums */
      activeTreeState() {
        const id = this.model.source.instanceId;
        return id ? (this.treeList.find((t) => t.instanceId === id)?.state || null) : null;
      },

      /** @returns {boolean} true, wenn kein Baum im Projekt existiert */
      hasNoTree() { return this.treeList.length === 0; },

      /** @returns {boolean} true, wenn Items ohne Baumbezug vorliegen */
      isDetached() {
        return !this.model.source.instanceId && this.model.items.length > 0;
      },

      /** Übernimmt die Baumwahl aus dem Select (`@change`) und aktualisiert den Sync-Status. */
      changeTree(ev) {
        this.model.source.instanceId = ev.target.value || null;
        this.refreshPending();
      },

      // ── Ebene ─────────────────────────────────────────────────

      /**
       * Übernimmt die Ebenenwahl aus dem Select (`@change`). Fragt bei bereits
       * erfassten Antworten nach, da die Item-Liste komplett neu aufgebaut wird
       * und alle Antworten verloren gehen.
       * @param {Event} ev
       */
      async changeLevel(ev) {
        const next = ev.target.value;
        const hasAnswers = Object.values(this.model.answers)
          .some((byItem) => Object.values(byItem || {})
            .some((a) => a.f !== null || a.d !== null || a.w !== null));
        if (hasAnswers) {
          const ok = await module._context.confirmPopout(_t('levelChangeConfirm'), { danger: true });
          if (!ok) { ev.target.value = this.model.source.level; return; }
        }
        this.model.source.level = next;
        this.model.setItems([]);
        this.model.answers = {};
        this.refreshPending();
        this.$nextTick(() => this.mountChart());
      },

      /** Schaltet die dritte Frage (Wichtigkeit) für die Erfassung ein/aus. */
      toggleImportance() {
        this.model.options.importance = !this.model.options.importance;
        this.$nextTick(() => this.mountChart());
      },

      // ── Sync ──────────────────────────────────────────────────

      /** Zählt das offene Diff gegen den Baum. */
      refreshPending() {
        const tree = this.activeTreeState();
        if (!tree) { this.pending = { added: 0, renamed: 0, missing: 0 }; return; }
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.pending = { added: d.added.length, renamed: d.renamed.length, missing: d.missing.length };
      },

      /** @returns {boolean} true, wenn es etwas zu übernehmen gibt */
      hasPending() {
        const p = this.pending;
        return p.added + p.renamed + p.missing > 0;
      },

      /** Statuszeile unter dem Sync-Button. */
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

      /** Übernimmt das Diff in die Item-Liste. */
      applySync() {
        const tree = this.activeTreeState();
        if (!tree) return;
        const d = diff(this.model.items, flatten(tree, this.model.source.level));
        this.model.setItems(applyDiff(this.model.items, d, () => uid()));
        this.refreshPending();
        this.$nextTick(() => this.mountChart());
      },

      // ── Befragte ──────────────────────────────────────────────

      /** Legt eine:n neue:n Befragte:n mit Default-Namen an und aktiviert sie/ihn ggf. */
      addRespondent() {
        const n = this.model.respondents.length + 1;
        this.model.addRespondent(_t('respondentDefault', { n }));
      },

      /**
       * Fragt nach und löscht danach eine:n Befragte:n samt aller Antworten.
       * @param {string} id
       */
      async removeRespondent(id) {
        const ok = await module._context.confirmPopout(_t('respondentDeleteConfirm'), { danger: true });
        if (ok) {
          this.model.deleteRespondent(id);
          this.$nextTick(() => this.mountChart());
        }
      },

      /** Aktiviert einen Reiter — ändert nie Antwortdaten. */
      selectRespondent(id) { this.model.activeRespondentId = id; },

      /** Klassen des Reiters — aktiver Reiter bekommt den Modifier. */
      tabClass(id) {
        return id === this.model.activeRespondentId ? 'dmike-tab--active' : '';
      },

      /** @returns {boolean} true, wenn der Reitername dieser:s Befragten gerade bearbeitet wird */
      isRenaming(id) { return this.renamingRespondentId === id; },

      /** Tooltip auf dem Reiter: Name + Rename-Hinweis (Muster raci-matrix.js). */
      respondentRenameTitle(name) { return `${name} — ${_t('respondentRenameHint')}`; },

      /** Öffnet das Inline-Eingabefeld für den Reiter-Namen. */
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

      /** Übernimmt den bearbeiteten Namen; ein leerer Name wird verworfen (alter Name bleibt). */
      commitRename() {
        if (!this.renamingRespondentId) return;
        const name = this.renameValue.trim();
        if (name) this.model.renameRespondent(this.renamingRespondentId, name);
        this.renamingRespondentId = null;
        this.renameValue = '';
      },

      /** Bricht das Umbenennen ohne Übernahme ab. */
      cancelRename() {
        this.renamingRespondentId = null;
        this.renameValue = '';
      },

      // ── Antworten ─────────────────────────────────────────────

      /** @returns {string} Wert für das Select ('' wenn nicht gesetzt) */
      answerValue(itemId, field) {
        const v = this.model.answerOf(this.model.activeRespondentId, itemId)[field];
        return v === null ? '' : String(v);
      },

      /**
       * Übernimmt den Select-Wert aus dem `@change`-Event in die aktive Antwort.
       * @param {string} itemId
       * @param {'f'|'d'|'w'} field
       * @param {Event} ev
       */
      setAnswerFromEvent(itemId, field, ev) {
        const raw = ev.target.value;
        this.model.setAnswer(
          this.model.activeRespondentId, itemId, field, raw === '' ? null : Number(raw)
        );
        this.$nextTick(() => this.mountChart());
      },

      // ── Items ─────────────────────────────────────────────────

      /** Löscht ein Item samt aller Antworten dazu. */
      removeItem(id) {
        this.model.deleteItem(id);
        this.refreshPending();
        this.$nextTick(() => this.mountChart());
      },

      /** Zeilenklasse: verwaiste Items werden markiert. */
      itemRowClass(item) { return item.missing ? 'kano__row--missing' : ''; },

      /** @returns {boolean} true, wenn Erfassung möglich ist */
      canCapture() {
        return this.model.items.length > 0 && Boolean(this.model.activeRespondentId);
      },

      // ── Auswertung ────────────────────────────────────────────

      /** Schwelle, ab der ein Q-Anteil als Datenqualitätsproblem gilt. */
      Q_WARN: 0.10,

      /**
       * Live-Auswertung. Bewusst ohne Cache: die Rechenlast ist trivial und ein
       * Cache müsste an Items, Befragten, Antworten und Optionen hängen.
       */
      result() {
        return evaluate(
          this.model.items, this.model.respondents, this.model.answers, this.model.options
        );
      },

      /** Kategoriename aus i18n; '—' wenn nicht klassifiziert. */
      catLabel(cat) { return cat ? _t(`cat${cat}`) : '—'; },

      /** Aktuelle Locale für Zahlenformate ('de-DE' | 'en-US'), aus dem Modul-Kontext. */
      _locale() { return module._context.i18n.getLanguage() === 'de' ? 'de-DE' : 'en-US'; },

      /** Zahl mit fester Nachkommastelle, lokalisiert (Komma im Deutschen); '—' für null. */
      fmt(v, dec) {
        return v === null || v === undefined ? '—'
          : Number(v).toLocaleString(this._locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec });
      },

      /** Anteil als lokalisierter Prozenttext. */
      pct(v) {
        const p = Math.round((v || 0) * 100) || 0; // `|| 0` glättet ein mögliches -0
        return `${p.toLocaleString(this._locale())} %`;
      },

      /** @returns {boolean} true, wenn der Q-Anteil insgesamt zu hoch ist */
      qWarn() { return this.result().totals.qShare > this.Q_WARN; },

      /** Warntext mit eingesetztem Anteil. */
      qWarnText() {
        return _t('warnQShare', { share: this.pct(this.result().totals.qShare) });
      },

      /** @returns {boolean} true, wenn ein einzelnes Item zu viele Q-Antworten hat */
      rowQWarn(row) { return row.n > 0 && row.counts.Q / row.n > this.Q_WARN; },

      /** Zeilenklasse der Ergebnistabelle. */
      resultRowClass(row) { return this.rowQWarn(row) ? 'kano__row--warn' : ''; },

      // ── Export ────────────────────────────────────────────────

      /** Kopfzeile des Exports; die Wichtigkeitsspalte nur wenn aktiv. */
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

      /** Ergebniszeilen für den CSV-Export, gleiche Reihenfolge wie die Tabelle. */
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

      /** Exportiert die Ergebnistabelle als CSV; tut nichts ohne Zeilen. */
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

      /** Exportiert die Ergebnistabelle als XLSX; tut nichts ohne Zeilen. */
      async exportXLSX() {
        const rows = this._exportRowsXLSX();
        if (rows.length === 0) return;
        await ensureXLSX();
        const ws = XLSX.utils.aoa_to_sheet([this.exportHeaders(), ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kano');
        XLSX.writeFile(wb, 'kano.xlsx');
      },

      /** @returns {SVGElement|null} das gemountete Better/Worse-Diagramm, falls vorhanden */
      _chartSvg() {
        return module._container.querySelector('[data-ref="chart"] svg');
      },

      /** Exportiert das Diagramm als PNG; tut nichts ohne gemountetes Diagramm. */
      exportPNG() { const svg = this._chartSvg(); if (svg) exportSvgAsPNG(svg, 'kano.png'); },

      /** Exportiert das Diagramm als SVG; tut nichts ohne gemountetes Diagramm. */
      exportSVG() { const svg = this._chartSvg(); if (svg) exportSvgAsFile(svg, 'kano.svg'); },

      // ── Chart ─────────────────────────────────────────────────

      /**
       * Blasendurchmesser aus der mittleren Wichtigkeit: 10 px (w̄ = 1) bis
       * 26 px (w̄ = 9). Items ohne Wichtigkeitsangabe bekommen 10 px — nie 0,
       * denn sizes[i] <= 0 rendert der Scatter-Typ unsichtbar.
       * @param {object[]} rows
       * @returns {number[]}
       */
      bubbleSizes(rows) {
        return rows.map((r) => {
          if (r.importanceMean === null) return 10;
          return 10 + ((r.importanceMean - 1) / 8) * 16;
        });
      },

      /** Räumt alle gemounteten Chart-Instanzen ab. */
      destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      /** Mountet das Better/Worse-Diagramm neu. */
      async mountChart() {
        if (this._destroyed) return;
        this._renderGen++;
        const gen = this._renderGen;
        this.destroyCharts();

        const host = module._container.querySelector('[data-ref="chart"]');
        if (!host) return;

        const rows = this.result().rows.filter((r) => r.cs !== null && r.ds !== null);
        if (rows.length === 0) return;

        // Eine Serie je Item (statt einer Serie mit vielen Punkten): der
        // Scatter-Typ nimmt den Serien-Namen als Tooltip-Kopf (scatter.js:301),
        // ein gemeinsames `labels`-Feld an der Serie wird dort nirgends
        // gelesen. showLegend bleibt aus, sonst würde aus der Legende eine
        // Itemliste — Achsenbereich (dataExtent) und Tooltip-Trefferauswahl
        // (_findNearby) arbeiten unverändert über alle Serien hinweg.
        const useImportance = this.model.options.importance;
        const sizes = useImportance ? this.bubbleSizes(rows) : null;
        const series = rows.map((r, i) => {
          const s = {
            name: r.label,
            color: 'var(--color-chart-1)',
            symbol: 'circle',
            markerSize: 8,
            strokeWidth: 1,
            x: [Math.abs(r.ds)],
            y: [r.cs],
          };
          if (useImportance) {
            s.sizes = [sizes[i]];
            s.sizeValues = [r.importanceMean];
            s.sizeLabel = _t('colImportanceMean');
          }
          return s;
        });

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: _t('chartX'),
          yLabel: _t('chartY'),
          showLegend: false,
          series,
          refLines: [
            { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
            { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
          ],
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
