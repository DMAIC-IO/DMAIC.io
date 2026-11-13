/**
 * D.Mike — Project charter: view-Teil Organigramm.
 *
 * Anordnung der Knoten (`computed layout` aus Model, eingeklappten Knoten,
 * gemessenen Höhen und der Vorschau der Knoten-Geste), Linien für das Widget
 * `node-links`, Verschieben und Zoomen der Ansicht, Einpassen (nur
 * horizontal, Zoom ≤ 1) und Ein-/Ausklappen. Die Knoten sind HTML im
 * Template; ihre Höhen misst die Ansicht nach dem Rendern. Ansicht und
 * Auswahl sind UI-State, nie ein Kommando.
 *
 * Nach einem neuen Knoten (Oberfläche oder Agent) klappt der Elternknoten
 * auf, der neue Knoten wird gewählt und die Ansicht neu eingepasst; nach dem
 * Umhängen klappt der neue Elternknoten auf.
 */
import { layoutOrg, MODULE_LAYOUT } from '../domain/layout.js';
import { childrenOf, moveNode } from '../domain/tree.js';

/** Rand um den Inhalt im Fenster (px). */
const PAD = 40;
/** Grundhöhe des Fensters (px); es wächst mit dem Inhalt. */
const MIN_H = 420;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;

/** @typedef {import('../domain/model.types.js').StateModel['orgChart'][number]} OrgNode */

/**
 * Ein sichtbarer Knoten für das Template.
 * @typedef {object} ShownNode
 * @property {string} id @property {string} title @property {string} desc
 * @property {string|null} pid @property {number} childCount alle Kinder, auch ausgeblendete
 * @property {boolean} collapsed @property {number} x @property {number} y @property {number} h
 * @property {string} bg @property {string} borderColor @property {string} borderStyle @property {number} borderWidth
 */

/**
 * Die Anordnung zum Zeichnen.
 * @typedef {object} OrgView
 * @property {ShownNode[]} nodes sichtbare Knoten in Listenreihenfolge
 * @property {Array<{from: string, to: string, shape: 'curve', x1: number, y1: number, x2: number, y2: number}>} links
 * @property {{ x1: number, x2: number, y1: number, y2: number }|null} box Ausdehnung ohne die Vorschau
 * @property {{ x: number, y: number, h: number }|null} drop Einfügemarke beim Ziehen unter Geschwistern
 */

/** @param {number} z @returns {number} */
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** @type {import('./state.types.js').ProjectCharterViewFn} */
export const orgView = (ctx) => {
  /** @type {ResizeObserver|null} */
  let observer = null;
  let lastWidth = 0;
  /** Verschieben der Ansicht: Zeigerposition minus Verschiebung beim Drücken. */
  let panning = /** @type {{ x: number, y: number }|null} */ (null);
  /** Gedrückter Knoten: Zeiger und Knotenposition beim Drücken (Zeiger-Vorschau). */
  let pressed = /** @type {{ id: string, cx: number, cy: number, x: number, y: number }|null} */ (null);
  /** @type {((e: { instanceId?: string, command?: string, args?: any, result?: any }) => void)|null} */
  let onCommand = null;

  return {
    init() {
      onCommand = (e) => this.afterCommand(e);
      ctx.eventBus?.on?.('command:executed', onCommand);
      // Alles, was die Höhe eines Knotens ändern kann (sichtbare Knoten, Texte,
      // eigener und globaler Rahmen): nach dem Rendern die Höhen messen.
      this.$watch(() => JSON.stringify([
        (this.layout.nodes ?? []).map((n) => n.id), this.model.orgChart, this.model.orgStyle,
      ]), () => this.$nextTick(() => this.measureHeights()));
      this.$nextTick(() => {
        this.measureHeights();
        this.pinY();
        if (this.model.orgChart.length) this.fit();
      });
      const wrap = this.orgWrap();
      if (wrap && typeof ResizeObserver === 'function') {
        // Nur Breitenänderungen: die Höhe folgt dem Inhalt, auf sie zu
        // reagieren wäre eine Schleife. Nach Verschieben oder Zoomen von Hand
        // bleibt die Ansicht stehen; „Einpassen“ gibt die Automatik frei.
        lastWidth = wrap.clientWidth;
        observer = new ResizeObserver(() => {
          const w = wrap.clientWidth;
          if (w === lastWidth) return;
          lastWidth = w;
          if (!this.state.userAdjusted) this.fit();
        });
        observer.observe(wrap);
      }
    },

    destroy() {
      observer?.disconnect();
      observer = null;
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
      panning = null;
      pressed = null;
    },

    computed: {
      /**
       * Positionen der sichtbaren Knoten und ihre Verbindungen; während einer
       * Geste mit der Vorschau (Geschwister rücken, der Knoten folgt dem Zeiger).
       * @returns {OrgView}
       */
      layout() {
        const all = /** @type {OrgNode[]} */ (this.model.orgChart);
        const p = this.state.dragPreview;
        const self = p ? all.find((n) => n.id === p.id) : undefined;
        const byPointer = Boolean(p && self && pressed && pressed.id === p.id);
        // Tastatur: der Knoten steht schon an der Zielstelle. Zeiger: nur
        // unter den eigenen Geschwistern rücken die anderen, beim Umhängen
        // bleibt das Bild stehen, bis abgelegt ist.
        const preview = Boolean(p && self && (!byPointer || p.parentId === (self.pid ?? null)));
        const arranged = preview ? moveNode(all, p.id, p.parentId, p.index) : all;
        const collapsed = preview ? this.state.collapsed.filter((id) => id !== p.parentId) : this.state.collapsed;
        const lay = layoutOrg(arranged, { ...MODULE_LAYOUT, collapsed, heights: this.state.heights });
        const pos = { ...lay.positions };
        const shownIds = Object.keys(pos);
        const box = shownIds.length ? {
          x1: Math.min(...shownIds.map((id) => pos[id].x)),
          x2: Math.max(...shownIds.map((id) => pos[id].x + pos[id].w)),
          y1: Math.min(...shownIds.map((id) => pos[id].y)),
          y2: Math.max(...shownIds.map((id) => pos[id].y + pos[id].h)),
        } : null;

        let drop = null;
        if (byPointer && pos[p.id]) {
          const slot = pos[p.id];
          if (preview && childrenOf(arranged, p.parentId).length > 1) drop = { x: slot.x + slot.w / 2, y: slot.y, h: slot.h };
          const z = this.state.zoom || 1;
          pos[p.id] = { ...slot, x: pressed.x + (p.x - pressed.cx) / z, y: pressed.y + (p.y - pressed.cy) / z };
        }

        const links = lay.links.map((l) => ({
          from: l.from, to: l.to, shape: l.shape,
          x1: pos[l.from].x + pos[l.from].w / 2, y1: pos[l.from].y + pos[l.from].h,
          x2: pos[l.to].x + pos[l.to].w / 2, y2: pos[l.to].y,
        }));
        const folded = new Set(this.state.collapsed);
        const nodes = all.filter((n) => pos[n.id]).map((n) => ({
          id: n.id, title: n.title, desc: n.desc, pid: n.pid ?? null,
          childCount: childrenOf(all, n.id).length,
          collapsed: folded.has(n.id),
          x: pos[n.id].x, y: pos[n.id].y, h: pos[n.id].h,
          bg: n.bg ?? '', borderColor: n.borderColor ?? '', borderStyle: n.borderStyle ?? '', borderWidth: n.borderWidth ?? 0,
        }));
        return { nodes, links, box, drop };
      },
    },

    /** Konfiguration des Widgets `node-links`: Linien, die am gewählten Knoten hervorgehoben. */
    get orgLinks() {
      const sel = this.state.selectedId;
      const links = (this.layout.links ?? []).map((l) => ({ ...l, highlight: sel !== null && (l.from === sel || l.to === sel) }));
      return { links, highlightClass: 'pc__org-line--hl', padding: 0, origin: 'zero' };
    },

    /**
     * Position und eigener Stil eines Knotens; ungesetzte Stilwerte erben über
     * die Variablen des Bereichs.
     * @param {ShownNode} n @returns {Record<string, string>}
     */
    nodeStyle(n) {
      return {
        left: `${n.x}px`,
        top: `${n.y}px`,
        width: `${MODULE_LAYOUT.nodeW}px`,
        '--pc-org-node-bg': n.bg,
        '--pc-org-node-border-color': n.borderColor,
        '--pc-org-node-border-style': n.borderStyle,
        '--pc-org-node-border-width': n.borderWidth ? `${n.borderWidth}px` : '',
      };
    },

    /** Klassen eines Knotens: gewählt, gezogen. @param {ShownNode} n @returns {string} */
    nodeClass(n) {
      const cls = [];
      if (this.state.selectedId === n.id) cls.push('pc__org-node--sel');
      if (this.state.dragPreview?.id === n.id) cls.push('pc__org-node--drag');
      return cls.join(' ');
    },

    /** Verschiebung und Zoom der Leinwand. @returns {Record<string, string>} */
    get canvasStyle() {
      const { pan, zoom } = this.state;
      return { transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` };
    },

    /** Das Fenster wächst mit dem Inhalt; leer gilt die Grundhöhe aus dem CSS. @returns {Record<string, string>} */
    get wrapStyle() {
      const box = this.layout.box;
      return { height: box ? `${Math.max(MIN_H, (box.y2 - box.y1) * this.state.zoom + PAD * 2)}px` : '' };
    },

    /** Während des Ziehens unter Geschwistern gleiten die anderen Knoten. @returns {string} */
    get wrapClass() {
      return this.state.dragPreview && pressed ? 'pc__org-wrap--reordering' : '';
    },

    /** Einfügemarke. @returns {Record<string, string>} */
    get dropStyle() {
      const d = this.layout.drop;
      return d ? { left: `${d.x - 1.5}px`, top: `${d.y}px`, height: `${d.h}px`, display: 'block' } : { display: '' };
    },

    /** @returns {HTMLElement|null} */
    orgWrap() { return this.$root.querySelector('[data-ref="orgWrap"]'); },

    /** Höhen der gerenderten Knoten nach `state.heights`; unsichtbar (0) zählt nicht. */
    measureHeights() {
      const next = { ...this.state.heights };
      let changed = false;
      /** @type {HTMLElement[]} */
      const els = Array.from(this.$root.querySelectorAll('[data-ref="orgCanvas"] .pc__org-node'));
      for (const el of els) {
        const h = el.offsetHeight;
        if (h > 0 && next[el.dataset.id] !== h) { next[el.dataset.id] = h; changed = true; }
      }
      if (changed) this.state.heights = next;
    },

    /** Der Inhalt sitzt oben mit dem Rand; die Senkrechte ist nie eingeschränkt. */
    pinY() {
      const box = this.layout.box;
      this.state.pan.y = PAD - (box ? box.y1 : MODULE_LAYOUT.rootY) * this.state.zoom;
    },

    /**
     * Drücken: auf einem Knoten wählen (die Knoten-Geste zieht), auf der
     * Fläche verschieben und die Auswahl aufheben. Knöpfe im Knoten halten
     * ihr pointerdown selbst zurück; die Werkzeugleiste tut hier nichts.
     * @param {PointerEvent} e
     */
    onPointerDown(e) {
      if (e.button !== 0) return;
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('.pc__org-modebar')) return;
      const el = /** @type {HTMLElement|null} */ (target.closest('.pc__org-node'));
      if (el) {
        const n = (this.layout.nodes ?? []).find((x) => x.id === el.dataset.id);
        this.state.selectedId = el.dataset.id;
        pressed = n ? { id: n.id, cx: e.clientX, cy: e.clientY, x: n.x, y: n.y } : null;
        return;
      }
      panning = { x: e.clientX - this.state.pan.x, y: e.clientY - this.state.pan.y };
      this.state.selectedId = null;
    },

    /** @param {PointerEvent} e */
    onPointerMove(e) {
      if (panning) {
        this.state.userAdjusted = true;
        this.state.pan.x = e.clientX - panning.x;
        this.state.pan.y = e.clientY - panning.y;
        return;
      }
      // Die Geste meldet am Ausgangsplatz keinen Zeiger; der Knoten folgt trotzdem.
      const p = this.state.dragPreview;
      if (pressed && p && p.id === pressed.id && (p.x !== e.clientX || p.y !== e.clientY)) {
        p.x = e.clientX;
        p.y = e.clientY;
      }
    },

    onPointerUp() {
      panning = null;
      pressed = null;
    },

    /** Zoom um den Mauszeiger (0,92 / 1,08). @param {WheelEvent} e */
    onWheel(e) {
      e.preventDefault();
      const wrap = this.orgWrap();
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.92 : 1.08);
    },

    /** Hineinzoomen um die Mitte des Fensters. */
    zoomIn() {
      const wrap = this.orgWrap();
      if (!wrap) return;
      this.zoomAround(wrap.clientWidth / 2, wrap.clientHeight / 2, 1.2);
    },

    /**
     * @param {number} mx Fensterkoordinate @param {number} my @param {number} factor
     */
    zoomAround(mx, my, factor) {
      const s = this.state;
      const oz = s.zoom;
      s.userAdjusted = true;
      s.zoom = clampZoom(oz * factor);
      s.pan.x = mx - (mx - s.pan.x) * (s.zoom / oz);
      s.pan.y = my - (my - s.pan.y) * (s.zoom / oz);
      this.pinY();
    },

    /** Einpassen: nur horizontal, Zoom höchstens 1; gibt die automatische Ansicht frei. */
    fit() {
      const wrap = this.orgWrap();
      const box = this.layout.box;
      const w = wrap?.clientWidth ?? 0;
      if (!box || !w) return;
      const s = this.state;
      s.userAdjusted = false;
      lastWidth = w;
      const tw = box.x2 - box.x1;
      s.zoom = Math.max(ZOOM_MIN, Math.min(1, (w - PAD * 2) / tw));
      s.pan.x = (w - tw * s.zoom) / 2 - box.x1 * s.zoom;
      this.pinY();
    },

    /** @param {string} id */
    toggleCollapse(id) {
      const c = this.state.collapsed;
      this.state.collapsed = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
    },

    /** Titel des Umschalters. @param {ShownNode} n @returns {string} */
    collapseTitle(n) {
      return n.collapsed ? this.t('expand') : this.t('collapse');
    },

    /** Nach einem Kommando dieser Instanz. @param {{ instanceId?: string, command?: string, args?: any, result?: any }} e */
    afterCommand(e) {
      if (e?.instanceId !== ctx.instanceId) return;
      if (e.command === 'addOrgNode') this.afterAddNode(e.args?.parentId ?? null, e.result);
      else if (e.command === 'moveOrgNode') this.expand(e.args?.parentId ?? null);
      else if (e.command === 'removeOrgNode') {
        const ids = new Set(this.model.orgChart.map((n) => n.id));
        this.state.collapsed = this.state.collapsed.filter((id) => ids.has(id));
        if (this.state.selectedId !== null && !ids.has(this.state.selectedId)) this.state.selectedId = null;
      }
    },

    /**
     * Neuer Knoten: Elternknoten aufklappen, den Knoten wählen, neu einpassen.
     * @param {string|null} parentId @param {string} [id]
     */
    afterAddNode(parentId, id) {
      this.expand(parentId);
      if (typeof id === 'string') this.state.selectedId = id;
      this.$nextTick(() => this.fit());
    },

    /** @param {string|null} id */
    expand(id) {
      if (id !== null && this.state.collapsed.includes(id)) this.state.collapsed = this.state.collapsed.filter((x) => x !== id);
    },
  };
};
