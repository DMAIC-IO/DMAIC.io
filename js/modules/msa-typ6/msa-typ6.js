/**
 * DMAIC.io — MSA Typ 6 Module (msa-typ6.js)
 * Measure phase: Stabilität / Langzeitverhalten eines Messsystems anhand
 * eines über die Zeit wiederholt gemessenen Referenzteils — Regelkarte
 * (I-MR oder x̄-R), Nelson-Regeln 1–8 und linearer Drift-Test.
 *
 * Migriert auf createModule + Alpine CSP. Das Model (msa-typ6-model.js)
 * hält ausschließlich die Roh-Inputs (params + drei Column-Refs +
 * optionale Beispieldaten-Worksheet-Id); das analyze()-Ergebnis wird
 * transient in der View aus diesen Inputs plus den Live-Worksheet-Daten
 * via `js/engines/msa-typ6-engine.js` abgeleitet. ColumnPicker und Charts
 * werden imperativ gemountet (keine reinen Template-Belange).
 *
 * Task 7 (dieser Stand): Modul-Skelett — lädt, zeigt den Empty-State ohne
 * Datenquellen. ColumnPicker-Mount, Analyse-Lauf und Output-Rendering
 * folgen in Task 8–13.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 6
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ6-model.js';

const mod = createModule({
  config: {
    id: 'msa-typ6',
    engine: 'alpine',
    phase: 'measure',
    icon: 'activity',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _lastResult: null,
      _charts: [],
      _unsubs: [],
      _picker: null,

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (das data()-Objekt wird per Alpine.data geteilt).
        this._charts = [];
        this._unsubs = [];
        this._picker = null;

        // Task 8: ColumnPicker-Mount + Event-Subscriptions + erster Analyse-Lauf.
      },

      destroy() {
        for (const unsub of this._unsubs) { try { unsub(); } catch { /* ignore */ } }
        this._unsubs = [];
        const cm = module._context?.chartManager;
        for (const c of this._charts) { try { cm && cm.destroy(c); } catch { /* ignore */ } }
        this._charts = [];
      },
    };
  },
});

export default mod;
