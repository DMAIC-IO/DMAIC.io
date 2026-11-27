/**
 * D.Mike — Activity-Flowchart: JSON-Export. Reine Funktion; den Download
 * baut der Kern aus `exports` im Viewmodel.
 */

/**
 * Der Baum in der Form der bisherigen JSON-Datei: je Schritt `expanded` (aus
 * dem Ansichtsfeld) vor den Unterschritten. Ohne Schemakennung, ohne die
 * abgeleiteten Bänder.
 * @param {{ toJSON(): { steps: any[], expanded: string[] } }} model
 * @returns {{ steps: object[] }}
 */
export function toJsonTree(model) {
  const { steps, expanded } = model.toJSON();
  const open = new Set(expanded);
  return {
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      kind: s.kind,
      decision: s.decision ? { label: s.decision.label, noTarget: s.decision.noTarget } : null,
      branchId: s.branchId,
      expanded: open.has(s.id),
      substeps: s.substeps.map((x) => ({ id: x.id, title: x.title })),
    })),
  };
}
