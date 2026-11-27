/**
 * D.Mike — Deployment-Flowchart: JSON-Export. Reine Funktion; den Download
 * baut der Kern aus `exports` im Viewmodel.
 */

/**
 * Der Baum in der Form der bisherigen JSON-Datei: Schritte mit `expanded`
 * (aus dem Ansichtsfeld) vor den Unterschritten, Bahnen mit `order` (ihre
 * Position). Ohne Schemakennung.
 * @param {{ toJSON(): { steps: any[], lanes: any[], expanded: string[] } }} model
 * @returns {{ steps: object[], lanes: object[] }}
 */
export function toJsonTree(model) {
  const { steps, lanes, expanded } = model.toJSON();
  const open = new Set(expanded);
  return {
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      laneId: s.laneId,
      expanded: open.has(s.id),
      substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
    })),
    lanes: lanes.map((l, order) => ({ id: l.id, name: l.name, order })),
  };
}
