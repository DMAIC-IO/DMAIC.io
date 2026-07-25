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
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      },
    };
  },
});
