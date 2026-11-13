/**
 * D.Mike — Project charter: Organigrammknoten verschieben (Geste move).
 *
 * Position `{ id, parentId, index }`: `parentId` der (neue) Elternknoten
 * (`null` = Wurzel), `index` der Endindex unter dessen Kindern ohne den
 * verschobenen Knoten. Ein Ablegen ergibt genau ein Kommando
 * `moveOrgNode { id, parentId, index }`.
 *
 * Markup-Vertrag: jeder sichtbare Knoten ist ein Griff (Selektor `handle`) mit
 * `data-id`, `data-parent-id` (fehlt bei Wurzeln) und `data-child-count` (alle
 * Kinder, auch ausgeblendete) in Listenreihenfolge. Zeiger: Überlappung mit
 * einem Knoten, der kein Nachfahre ist, hängt um (letztes Kind); der eigene
 * Elternknoten zählt als Geschwisterhöhe. Auf Höhe der Geschwister bestimmen
 * deren Mitten den Platz. Tastatur: ←/→ Platz, ↑ eine Ebene hoch (direkt
 * rechts neben den bisherigen Elternknoten), ↓ letztes Kind des linken Nachbarn.
 * `start` sucht die Geschwister im nächsten Vorfahren mit `data-org-root`,
 * sonst im Elternelement des Knotens.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { inside } from '../../../core/interaction/helpers.js';
import { MODULE_LAYOUT } from '../domain/layout.js';

/**
 * Knoten des Containers als `{ id, el, parentId, kids }` in DOM-Reihenfolge.
 * @param {Element} root @param {string} handle
 * @returns {Array<{ id: string, el: HTMLElement, parentId: string|null, kids: number }>}
 */
function nodesOf(root, handle) {
  return [...root.querySelectorAll(handle)].map((el) => ({
    id: el.dataset.id, el, parentId: el.dataset.parentId || null, kids: Number(el.dataset.childCount) || 0,
  }));
}

/** Liegt `id` im Teilbaum von `ofId` (oder ist es selbst)? */
function inSubtree(all, id, ofId) {
  const parent = new Map(all.map((n) => [n.id, n.parentId]));
  for (let cur = id, i = 0; cur != null && i <= all.length; cur = parent.get(cur), i++) {
    if (cur === ofId) return true;
  }
  return false;
}

/**
 * Sichtbare Kinder von `parentId` ohne `selfId`, in Reihenfolge.
 * @returns {Array<{ id: string, el: HTMLElement, parentId: string|null, kids: number }>}
 */
const siblingsWithout = (all, parentId, selfId) => all.filter((n) => n.parentId === parentId && n.id !== selfId);

/**
 * Anzahl aller Kinder von `parentId` ohne `selfId` — bei ausgeblendeten Kindern
 * aus `data-child-count`.
 */
function childTotal(all, parentId, selfId) {
  if (parentId == null) return siblingsWithout(all, null, selfId).length;
  const parent = all.find((n) => n.id === parentId);
  if (!parent) return 0;
  const self = all.find((n) => n.id === selfId);
  return parent.kids - (self && self.parentId === parentId ? 1 : 0);
}

/**
 * @param {{ handle: string, nodeW?: number, vGap?: number }} opts `nodeW`/`vGap` in Modell-Pixeln
 *   (Vorgabe `MODULE_LAYOUT`); aus der Breite des Knotens am Bildschirm folgt der Zoom
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function orgNodeGesture({ handle, nodeW = MODULE_LAYOUT.nodeW, vGap = MODULE_LAYOUT.vGap }) {
  return defineGesture({
    kind: 'move',
    handle,

    /** @param {HTMLElement} el Griff @returns {{ id: string, parentId: string|null, index: number }} */
    start(el) {
      const id = el.dataset.id;
      const parentId = el.dataset.parentId || null;
      const root = el.closest('[data-org-root]') ?? el.parentElement;
      const index = nodesOf(root, handle).filter((n) => n.parentId === parentId).findIndex((n) => n.id === id);
      return { id, parentId, index };
    },

    /**
     * @param {{ x: number, y: number }} point @param {{ root: Element }} ctx
     * @param {{ id: string, parentId: string|null }} from
     * @returns {{ id: string, parentId: string|null, index: number, x: number, y: number }|null}
     */
    locate(point, ctx, from) {
      const all = nodesOf(ctx.root, handle);
      const hit = all.find((n) => n.id !== from.id && inside(n.el.getBoundingClientRect(), point));
      if (hit && inSubtree(all, hit.id, from.id)) return null;
      const out = { id: from.id, x: point.x, y: point.y };
      if (hit && hit.id !== from.parentId) {
        return { ...out, parentId: hit.id, index: childTotal(all, hit.id, from.id) };
      }
      const others = siblingsWithout(all, from.parentId, from.id);
      if (!others.length) return null;
      const ref = others[0].el.getBoundingClientRect();
      const scale = ref.width / nodeW || 1;
      if (Math.abs(point.y - (ref.top + ref.height / 2)) > ref.height + (vGap * scale) / 2) return null;
      let index = others.length;
      for (let i = 0; i < others.length; i++) {
        const r = others[i].el.getBoundingClientRect();
        if (point.x < r.left + r.width / 2) { index = i; break; }
      }
      return { ...out, parentId: from.parentId, index };
    },

    /**
     * @param {{ id: string, parentId: string|null, index: number }} pos
     * @param {{ x: number, y: number }} dir @param {{ root: Element }} ctx @param {{ id: string }} from
     * @returns {{ id: string, parentId: string|null, index: number }|null}
     */
    step(pos, dir, ctx, from) {
      const all = nodesOf(ctx.root, handle);
      if (dir.x) return { id: pos.id, parentId: pos.parentId, index: pos.index + dir.x };
      if (dir.y < 0) {
        if (pos.parentId == null) return null;
        const parent = all.find((n) => n.id === pos.parentId);
        if (!parent) return null;
        const siblings = siblingsWithout(all, parent.parentId, from.id);
        return { id: pos.id, parentId: parent.parentId, index: siblings.findIndex((n) => n.id === parent.id) + 1 };
      }
      if (dir.y > 0) {
        if (pos.index <= 0) return null;
        const left = siblingsWithout(all, pos.parentId, from.id)[pos.index - 1];
        if (!left) return null;
        return { id: pos.id, parentId: left.id, index: childTotal(all, left.id, from.id) };
      }
      return null;
    },

    /**
     * Index in den Bereich; Platz des Ausgangs → `from` (kein Kommando).
     * @param {{ id: string, parentId: string|null, index: number }} pos @param {{ root: Element }} ctx
     * @param {{ id: string, parentId: string|null, index: number }} from
     */
    clamp(pos, ctx, from) {
      const all = nodesOf(ctx.root, handle);
      if (pos.parentId != null && !all.some((n) => n.id === pos.parentId)) return null;
      const max = childTotal(all, pos.parentId, from.id);
      const index = Math.max(0, Math.min(pos.index, max));
      if (pos.parentId === from.parentId && index === from.index) return from;
      return { ...pos, index };
    },

    /**
     * `x`/`y` sind Client-Koordinaten des Zeigers und bei Tastaturschritten 0 —
     * die Ansicht darf dafür kein Geisterbild bei 0,0 zeichnen.
     * @param {{ id: string, parentId: string|null, index: number, x?: number, y?: number }|null} pos Vorschau, `null` räumt auf
     */
    preview(pos) {
      this.state.dragPreview = pos ? { id: pos.id, parentId: pos.parentId, index: pos.index, x: pos.x ?? 0, y: pos.y ?? 0 } : null;
    },

    toCommand(from, to) {
      return ['moveOrgNode', { id: from.id, parentId: to.parentId, index: to.index }];
    },
  });
}
