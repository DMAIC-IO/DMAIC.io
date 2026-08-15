/**
 * D.Mike — Flowchart Chain-Core (flowchart-model.js)
 *
 * Shared linear-chain model consumed by the four flowchart modules:
 * Process Map, Activity, Opportunity, Deployment. Module-specific step
 * fields (inputs/outputs, decision, side, laneId, ...) are passed through
 * unchanged — see docs/superpowers/specs/2026-08-15-flowchart-family-design.md
 * §2 "Datenmodell".
 */

export class FlowchartState {
  constructor() {
    /** @type {Array<object>} ordered chain of steps */
    this.steps = [];
  }
}
