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

export default createModule({
  config: {
    id: 'kano',
    engine: 'alpine',
    phase: 'define',
    icon: 'layers',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /** @type {Array<{instanceId: string, state: object|null}>} */
      treeList: [],
      /** @type {{added: number, renamed: number, missing: number}} */
      pending: { added: 0, renamed: 0, missing: 0 },
      /** @type {object[]} gemountete Chart-Instanzen */
      _charts: [],
      /** Render-Generation — verhindert Mounts aus überholten Durchläufen. */
      _renderGen: 0,

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

        this.$nextTick(() => this.mountChart());
        const onTheme = () => this.mountChart();
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
      },

      /** Alpine-Lifecycle-Hook: meldet alle Event-Bus-Subscriptions wieder ab. */
      destroy() {
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        this.destroyCharts();
      },

      // ── Quelle ────────────────────────────────────────────────

      /** Liest die Baumliste neu und aktualisiert den Sync-Status. */
      refreshTrees() {
        this.treeList = listTrees(module._context.stateManager);
        if (!this.model.source.instanceId && this.treeList.length === 1) {
          this.model.source.instanceId = this.treeList[0].instanceId;
        }
        this.refreshPending();
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
        this.model.setItems(applyDiff(this.model.items, d, () => crypto.randomUUID()));
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

      /** Zahl mit fester Nachkommastelle; '—' für null. */
      fmt(v, dec) { return v === null || v === undefined ? '—' : Number(v).toFixed(dec); },

      /** Anteil als Prozenttext. */
      pct(v) { return `${Math.round((v || 0) * 100)} %`; },

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
        this._renderGen++;
        const gen = this._renderGen;
        this.destroyCharts();

        const host = module._container.querySelector('[data-ref="chart"]');
        if (!host) return;

        const rows = this.result().rows.filter((r) => r.cs !== null && r.ds !== null);
        if (rows.length === 0) return;

        const useImportance = this.model.options.importance;
        const series = {
          name: _t('chartTitle'),
          color: 'var(--color-chart-1)',
          symbol: 'circle',
          markerSize: 8,
          strokeWidth: 1,
          x: rows.map((r) => Math.abs(r.ds)),
          y: rows.map((r) => r.cs),
          labels: rows.map((r) => r.label),
        };
        if (useImportance) {
          series.sizes = this.bubbleSizes(rows);
          series.sizeValues = rows.map((r) => r.importanceMean);
          series.sizeLabel = _t('colImportanceMean');
        }

        const chart = await module._context.chartManager.create(host, 'scatter', {
          xLabel: _t('chartX'),
          yLabel: _t('chartY'),
          showLegend: false,
          series: [series],
          refLines: [
            { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
            { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
          ],
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      },
    };
  },
});
