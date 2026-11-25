/**
 * D.Mike — TRIZ-Funktionsanalyse: Viewmodel.
 *
 * Vier Reiter: Komponenten, Interaktionsmatrix, Funktionsmodell, Wert & Kosten.
 * Daten, Kommandos und Ableitungen liegen im Model (domain/model.js), die
 * Agentenfläche entsteht aus dessen Schema. Das Funktionsmodell besteht aus
 * HTML-Kästen (Geste move in interaction/) über dem Widget `node-diagram`, das
 * Umrisse, Pfeile und die ziehbaren Verbbeschriftungen zeichnet. Rückgängig
 * und Wiederholen übernimmt der Verlauf des Kerns.
 */
import { createModule } from '../../../core/template-module.js';
import { command, text, boolean } from '../../../core/model.js';
import { runUiCommand } from '../../../core/command-directives.js';
import { formatCurrency, formatNumber } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import {
  GROUPS, TABS, pairKey, isComplete, orderedComponents, functionPairs, functionRanks,
} from '../domain/analysis.js';
import { NODE_W, NODE_H, resolvePositions, buildFunctionDiagram } from '../domain/diagram.js';
import { moveNode } from '../interaction/move-node.js';
import { UiState } from './state.js';

/** Mitte beider normierter Achsen; oben links stehen die Trimmkandidaten. */
const VC_SPLIT = 5;
const CANVAS_PAD = 20;
const CANVAS_MIN = { w: 480, h: 240 };
/** Platz rechts von / unter einer gezogenen Verbbeschriftung (ihre Mitte), damit sie auf der Fläche bleibt. */
const LABEL_ROOM = 60;
/** Nächster Zustand einer Matrixzelle je Klick: leer → angekreuzt → ausgeschlossen → leer. */
const NEXT_PAIR_STATE = { none: 'ticked', ticked: 'excluded', excluded: 'none' };

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** @param {number|string} n @returns {string} die Ziffern von n als Unicode-Tiefstellung */
const subscript = (n) => String(n).replace(/\d/g, (d) => SUBSCRIPT_DIGITS[Number(d)]);

/**
 * @typedef {{ id: string, name: string, kind: string, note: string, cost: number|null }} Component
 * @typedef {{ id: string, carrier: string, verb: string, object: string, parameter: string, type: string, level: string|null, note: string }} Fn
 * @typedef {{ components: Component[], interactions: Array<{ a: string, b: string }>,
 *   exclusions: Array<{ a: string, b: string }>, functions: Fn[],
 *   positions: Record<string, { x: number, y: number }>, labels: Record<string, { x: number, y: number }>, showRanks: boolean }} Data
 * @typedef {(key: string, params?: object) => string} Translate
 */

/** @param {Data} m @param {string} a @param {string} b @returns {'none'|'ticked'|'excluded'} */
function pairState(m, a, b) {
  const k = pairKey(a, b);
  if (m.interactions.some((i) => pairKey(i.a, i.b) === k)) return 'ticked';
  return m.exclusions.some((x) => pairKey(x.a, x.b) === k) ? 'excluded' : 'none';
}

/** @param {Data} m @param {string} a @param {string} b @returns {number} vollständige Funktionen auf dem Paar */
function usersOf(m, a, b) {
  const k = pairKey(a, b);
  return m.functions.filter((f) => isComplete(f) && pairKey(f.carrier, f.object) === k).length;
}

/**
 * Rangkürzel B, Ad, A₁…Aₙ (tiefgestellte Stufe spart Platz an den Pfeilen); A ohne Weg zu einer Basis- oder Zusatzfunktion.
 * @param {{ rank: string, level: number|null }} r @param {Translate} t @returns {string}
 */
const rankCode = (r, t) => t(`rankCode.${r.rank}`, { level: subscript(r.level ?? '') });

/**
 * Rangkürzel je Funktions-id, oder null, solange sie ausgeblendet sind.
 * @param {Data} m @param {Translate} t @returns {Map<string, string>|null}
 */
function rankLabels(m, t) {
  if (!m.showRanks) return null;
  return new Map([...functionRanks(m)].map(([id, r]) => [id, rankCode(r, t)]));
}

/** @template {object} T @param {T} o @returns {T} ohne Schlüssel mit `undefined` */
const defined = (o) => /** @type {any} */ (Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  gestures: [moveNode],
  commands: {
    // Auswahl zum Hervorheben im Funktionsmodell: nur Ansicht, nie gespeichert.
    select: command({
      params: { id: text(), toggle: boolean({ optional: true }) },
      run({ id, toggle = true }) {
        this.state.selectedId = toggle && this.state.selectedId === id ? null : id;
      },
    }),
  },

  /** @type {import('./state.types.js').TrizFunctionAnalysisViewFn} */
  view(ctx) {
    /** @param {Component} c @param {Translate} t @returns {string} */
    const label = (c, t) => c.name.trim() || t('unnamed');
    /**
     * Ein abgelehntes Kommando aus der Bedienung: übersetzt melden, Ursache in die Konsole.
     * @param {string} name @param {unknown} error @param {Translate} t
     */
    const fail = (name, error, t) => {
      console.warn(`[triz-function-analysis] ${name} failed`, error);
      ctx.notify(t('commandFailed'), 'error');
    };

    /** @type {((e: { instanceId?: string }) => void)|null} */
    let onCommand = null;

    return {
      init() {
        // Wie im Altmodul: verschwindet das Gewählte (Löschen, auch mitgelöscht), endet die Auswahl.
        onCommand = (e) => { if (e?.instanceId === ctx.instanceId) this.dropStaleSelection(); };
        ctx.eventBus?.on?.('command:executed', onCommand);
      },
      destroy() {
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
      },

      get TABS() { return TABS; },
      get GROUPS() { return GROUPS; },

      computed: {
        /** Komponenten in Matrixreihenfolge: Zielobjekt, System, Supersystem. */
        matrixComponents() { return orderedComponents(this.model.components); },

        /** Lage jedes Kastens: gespeichert oder automatischer Platz. */
        placed() { return resolvePositions(this.model); },

        /** Konfiguration des Widgets node-diagram: Umrisse ohne Namen, Pfeile, Beschriftungen. */
        diagram() {
          const preview = this.state.dragPreview;
          const positions = preview
            ? { ...this.model.positions, [preview.id]: { x: preview.x, y: preview.y } }
            : this.model.positions;
          const { nodes, links } = buildFunctionDiagram({
            components: this.model.components,
            functions: this.model.functions,
            interactions: this.model.interactions,
            positions,
            labels: this.model.labels,
          }, { selectedId: this.state.selectedId, rankLabels: rankLabels(this.model, this.t) });
          // Die Namen stehen in den ziehbaren HTML-Kästen, das Widget zeichnet nur die Umrisse.
          return {
            nodes: nodes.map((n) => defined({ ...n, lines: [] })),
            links: links.map((l) => defined(l)),
            commands: { moveLabel: 'moveLabel', select: 'select' },
            origin: 'zero',
            padding: 0,
            highlightClass: 'tfa__arrow--hl',
          };
        },

        /** Konfiguration des Streudiagramms Wert & Kosten (nur Komponenten mit Kosten). */
        valueCostChart() {
          const rows = this.valueCost.filter((r) => r.cost !== null);
          const split = { value: VC_SPLIT, dash: /** @type {'dash'} */ ('dash'), color: 'var(--color-text-secondary)' };
          return {
            title: '',
            xLabel: this.t('vc.axisValue'),
            yLabel: this.t('vc.axisCost'),
            showLegend: false,
            // Eine halbe Einheit Rand: ein Punkt bei 0 oder 10 wird nicht abgeschnitten.
            xMin: -0.5, xMax: 10.5, yMin: -0.5, yMax: 10.5,
            moduleRefLines: [{ dir: /** @type {'v'} */ ('v'), ...split }, { dir: /** @type {'h'} */ ('h'), ...split }],
            series: [{
              name: this.t('vc.cost'),
              x: rows.map((r) => r.normValue),
              y: rows.map((r) => r.normCost),
              labels: rows.map((r) => label(r, this.t)),
            }],
          };
        },

        /** Tabellenzeilen der Systemkomponenten im Format der App-Sprache. */
        vcRows() {
          const lang = ctx.context.language;
          return this.valueCost.map((r) => ({
            id: r.id,
            name: label(r, this.t),
            value: formatNumber(r.value, lang, { decimals: 0 }),
            normValue: formatNumber(r.normValue, lang, { decimals: 1 }),
            cost: r.cost === null ? '–' : formatCurrency(r.cost, 'EUR', lang),
            normCost: r.normCost === null ? '–' : formatNumber(r.normCost, lang, { decimals: 1 }),
          }));
        },

        /** Offene Paare als Chips; a/b folgen der Matrixreihenfolge. */
        openPairChips() {
          const order = new Map(this.matrixComponents.map((c, i) => [c.id, i]));
          return this.openPairs.map((p) => {
            const [a, b] = order.get(p.a) <= order.get(p.b) ? [p.a, p.b] : [p.b, p.a];
            return { key: `${a}|${b}`, a, b, label: `${this.endName(a)} — ${this.endName(b)}` };
          });
        },

        /** Funktionsblöcke je Paar; a/b folgen der Matrixreihenfolge, der Kopf kippt nie. */
        pairBlocks() {
          const order = new Map(this.matrixComponents.map((c, i) => [c.id, i]));
          return functionPairs(this.model).map((g) => {
            const [a, b] = g.complete && order.get(g.b) < order.get(g.a) ? [g.b, g.a] : [g.a, g.b];
            return { ...g, a, b, label: `${this.endName(a)} — ${this.endName(b)}` };
          });
        },

        /** Nachteile nach Art gruppiert, leere Gruppen entfallen. */
        disadvantageGroups() {
          const all = this.disadvantages;
          return ['harmful', 'insufficient', 'excessive']
            .map((kind) => ({
              kind,
              title: this.t(`disadvantage.${kind}`),
              items: all.filter((d) => d.kind === kind).map((d) => ({ ...d, verb: d.verb || this.t('verbMissing') })),
            }))
            .filter((g) => g.items.length > 0);
        },
      },

      // ── Reiter ──
      /** @param {string} tab @returns {string} */
      tabLabel(tab) { return this.t(`tab.${tab}`); },
      /** @param {string} tab @returns {string} */
      tabClass(tab) { return tab === this.model.activeTab ? 'dmike-tab--active' : ''; },
      /** @param {string} tab @returns {string} */
      contentClass(tab) { return tab === this.model.activeTab ? 'dmike-tab-content--active' : ''; },

      // ── Komponenten ──
      /** @param {string} kind @returns {string} */
      groupLabel(kind) { return this.t(`group.${kind}`); },
      /** @param {Component} c @param {string} kind @returns {boolean} */
      inGroup(c, kind) { return c.kind === kind; },
      /** Die Gruppe Zielobjekt bietet kein zweites Ziel an. @param {string} kind @returns {boolean} */
      canAdd(kind) { return kind !== 'target' || !this.model.components.some((c) => c.kind === 'target'); },
      /** Eine Auswahl auf eine nicht mehr vorhandene Komponente oder Funktion aufheben. */
      dropStaleSelection() {
        const id = this.state.selectedId;
        if (id === null) return;
        const known = this.model.components.some((c) => c.id === id) || this.model.functions.some((f) => f.id === id);
        if (!known) this.state.selectedId = null;
      },
      /** @param {Component} c @returns {boolean} */
      isSystem(c) { return c.kind === 'system'; },

      /**
       * Komponente anlegen und ihr Namensfeld fokussieren.
       * @param {'target'|'system'|'supersystem'} kind
       * @returns {Promise<void>}
       */
      async newComponent(kind) {
        // Enter in der Zielzeile: es gibt schon ein Ziel, die Oberfläche legt keines an.
        if (!this.canAdd(kind)) return;
        const r = await runUiCommand(this._ui, 'addComponent', { kind });
        if (!r.ok) {
          if ('error' in r) fail('addComponent', r.error, this.t);
          return;
        }
        const id = String(r.result);
        this.$nextTick(() => {
          /** @type {HTMLElement|null} */ (this.$root.querySelector(`[data-role="component"][data-id="${CSS.escape(id)}"] [data-role="component-name"]`))?.focus();
        });
      },

      /**
       * Art ändern; ein herabgestuftes Zielobjekt wird gemeldet.
       * @param {Component} c @param {Event} ev
       * @returns {Promise<void>}
       */
      async kindChanged(c, ev) {
        const el = /** @type {HTMLSelectElement} */ (ev.target);
        const kind = /** @type {'target'|'system'|'supersystem'} */ (el.value);
        const r = await runUiCommand(this._ui, 'setComponentKind', { id: c.id, kind });
        if (!r.ok) {
          el.value = c.kind;
          if ('error' in r) fail('setComponentKind', r.error, this.t);
          return;
        }
        const demoted = r.result ? this.model.components.find((x) => x.id === r.result) : null;
        if (demoted) ctx.notify(this.t('targetDemoted', { name: label(demoted, this.t) }));
      },

      /**
       * Eine Zeile, die ohne Namen verlassen wird, entfällt.
       * @param {Component} c
       * @returns {Promise<void>}
       */
      async discardIfEmpty(c) {
        if (c.name.trim() || !this.model.components.some((x) => x.id === c.id)) return;
        const r = await runUiCommand(this._ui, 'discardComponentIfEmpty', { id: c.id });
        if (!r.ok && 'error' in r) fail('discardComponentIfEmpty', r.error, this.t);
      },

      // ── Interaktionsmatrix ──
      /** @param {Component} c @returns {string} */
      headClass(c) { return `tfa__mh tfa__mh--${c.kind}`; },
      /** @param {number} ri @param {number} ci @returns {string} */
      cellClass(ri, ci) {
        if (ci === ri) return 'tfa__cell tfa__cell--diag';
        return ci > ri ? 'tfa__cell' : 'tfa__cell tfa__cell--off';
      },
      /** @param {Component} r @param {Component} c @returns {boolean} */
      isTicked(r, c) { return pairState(this.model, r.id, c.id) === 'ticked'; },
      /** @param {Component} r @param {Component} c @returns {boolean} */
      isExcluded(r, c) { return pairState(this.model, r.id, c.id) === 'excluded'; },
      /** @param {Component} r @param {Component} c @returns {string} */
      cellState(r, c) { return pairState(this.model, r.id, c.id); },
      /** @param {Component} r @param {Component} c @returns {string} */
      cellPressed(r, c) { return this.isTicked(r, c) ? 'true' : 'false'; },
      /** @param {Component} r @param {Component} c @returns {string} */
      cellTitle(r, c) {
        if (this.isExcluded(r, c)) return this.t('pairExcluded');
        const n = usersOf(this.model, r.id, c.id);
        return n ? this.t('pairLocked', { count: n }) : '';
      },

      /**
       * Ein Klick schaltet die Zelle einen Zustand weiter; ein von Funktionen genutztes Paar bleibt.
       * @param {Component} r @param {Component} c
       * @returns {Promise<void>}
       */
      async toggleCell(r, c) {
        const state = /** @type {'none'|'ticked'|'excluded'} */ (NEXT_PAIR_STATE[pairState(this.model, r.id, c.id)]);
        const res = await runUiCommand(this._ui, 'setPairState', { a: r.id, b: c.id, state });
        if (res.ok || !('error' in res)) return;
        if (res.error?.param === 'state') ctx.notify(this.t('pairLocked', { count: usersOf(this.model, r.id, c.id) }));
        else fail('setPairState', res.error, this.t);
      },
      /** @returns {string} */
      matrixSummary() {
        return this.t('matrixSummary', { count: this.model.interactions.length, open: this.openPairs.length });
      },

      // ── Funktionsmodell: offene Paare und Funktionskarten ──
      /**
       * Ein offenes Paar anklicken legt eine Funktion an und wählt sie.
       * @param {{ a: string, b: string }} p
       * @returns {Promise<void>}
       */
      async createFromPair(p) {
        const r = await runUiCommand(this._ui, 'addFunction', { carrier: p.a, object: p.b });
        if (!r.ok) {
          if ('error' in r) fail('addFunction', r.error, this.t);
          return;
        }
        this.select({ id: String(r.result), toggle: false });
      },
      /**
       * Ein weiterer Pfeil auf dem Paar, gewählt.
       * @param {{ a: string, b: string }} g
       * @returns {Promise<void>}
       */
      addOnPair(g) { return this.createFromPair(g); },
      /** @param {string} id @returns {string} */
      endName(id) {
        const c = this.model.components.find((x) => x.id === id);
        return c ? label(c, this.t) : '—';
      },
      /** @param {Fn} fn @param {{ a: string }} g @returns {boolean} */
      isForward(fn, g) { return fn.carrier === g.a; },
      /** @param {Fn} fn @param {{ a: string }} g @returns {boolean} */
      isBackward(fn, g) { return fn.carrier !== g.a; },
      /** @param {Fn} fn @returns {string} */
      directionLabel(fn) { return `${this.endName(fn.carrier)} → ${this.endName(fn.object)}`; },
      /** @param {Fn} fn @returns {boolean} */
      isUseful(fn) { return fn.type === 'useful'; },

      /**
       * Art der Funktion; die Stufe setzt das Kommando mit.
       * @param {Fn} fn @param {Event} ev
       * @returns {Promise<void>}
       */
      async typeChanged(fn, ev) {
        const el = /** @type {HTMLSelectElement} */ (ev.target);
        const type = /** @type {'useful'|'harmful'} */ (el.value);
        const r = await runUiCommand(this._ui, 'setFunctionType', { id: fn.id, type });
        if (r.ok) return;
        el.value = fn.type;
        if ('error' in r) fail('setFunctionType', r.error, this.t);
      },
      /**
       * Stufe einer nützlichen Funktion.
       * @param {Fn} fn @param {Event} ev
       * @returns {Promise<void>}
       */
      async levelChanged(fn, ev) {
        const el = /** @type {HTMLSelectElement} */ (ev.target);
        const level = /** @type {'adequate'|'insufficient'|'excessive'} */ (el.value);
        const r = await runUiCommand(this._ui, 'setFunctionLevel', { id: fn.id, level });
        if (r.ok) return;
        el.value = fn.level ?? '';
        if ('error' in r) fail('setFunctionLevel', r.error, this.t);
      },

      /** @param {Fn} fn @returns {string} Rang und Kürzel, leer ohne Rang */
      rankLabel(fn) {
        const r = this.ranks.find((x) => x.functionId === fn.id);
        return r ? `${this.t(`rank.${r.rank}`)} (${rankCode(r, this.t)})` : '';
      },
      /** @param {Fn} fn @returns {string} */
      fnClass(fn) {
        const sel = this.state.selectedId;
        return [
          // Die Karte selbst oder eine ihrer Komponenten ist gewählt.
          sel && [fn.id, fn.carrier, fn.object].includes(sel) ? 'tfa__fn--selected' : '',
          fn.type === 'harmful' ? 'tfa__fn--harmful' : '',
        ].filter(Boolean).join(' ');
      },

      // ── Nachteile ──
      /** @param {{ parameter: string }} d @returns {string} */
      paramText(d) { return d.parameter ? ` (${d.parameter})` : ''; },

      // ── Kästen ──
      /** @returns {string} Größe der Fläche: alle Kästen und Beschriftungen mit Rand */
      canvasStyle() {
        const pos = Object.values(this.placed);
        const labels = Object.values(this.model.labels);
        const w = Math.max(CANVAS_MIN.w, ...pos.map((p) => p.x + NODE_W + CANVAS_PAD), ...labels.map((p) => p.x + LABEL_ROOM));
        const h = Math.max(CANVAS_MIN.h, ...pos.map((p) => p.y + NODE_H + CANVAS_PAD), ...labels.map((p) => p.y + LABEL_ROOM));
        return `width:${w}px;height:${h}px`;
      },
      /** @param {Component} c @returns {number} gespeicherte oder automatische Lage */
      nodeX(c) { return this.placed[c.id]?.x ?? 0; },
      /** @param {Component} c @returns {number} */
      nodeY(c) { return this.placed[c.id]?.y ?? 0; },
      /** @param {Component} c @returns {string} Lage, während der Geste die Vorschau */
      nodeStyle(c) {
        const preview = this.state.dragPreview;
        const p = preview && preview.id === c.id ? preview : { x: this.nodeX(c), y: this.nodeY(c) };
        return `left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px`;
      },
      /** @param {Component} c @returns {string} */
      nodeClass(c) {
        return [
          `tfa__node--${c.kind}`,
          c.id === this.state.selectedId ? 'tfa__node--selected' : '',
          c.id === this.state.dragPreview?.id ? 'tfa__node--drag' : '',
        ].filter(Boolean).join(' ');
      },

      // ── Wert & Kosten ──
      /** @returns {string} Hinweis an Stelle des Diagramms, '' wenn es etwas zu zeigen gibt */
      valueCostEmpty() {
        const rows = this.valueCost;
        if (rows.length === 0) return this.t('vc.emptyComponents');
        return rows.some((r) => r.cost !== null) ? '' : this.t('vc.emptyCosts');
      },
      /** @returns {boolean} */
      hasValueCost() { return this.valueCostEmpty() === ''; },
    };
  },

  /** @type {import('./state.types.js').TrizFunctionAnalysisExports} */
  exports: {
    fileName: 'funktionsmodell',
    image() {
      // Ohne Komponenten gibt es nichts zu zeichnen: keine Datei.
      if (this.model.components.length === 0) return null;
      const { nodes, links } = buildFunctionDiagram(this.model, { rankLabels: rankLabels(this.model, this.t) });
      return this.chartSVG('node-diagram', { nodes, links, padding: 30 });
    },
  },
});
