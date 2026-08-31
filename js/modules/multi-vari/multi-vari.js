/**
 * D.Mike — Multi-Vari Module (multi-vari.js)
 *
 * Analyze-Phase: Minitabs Multi-Vari-Diagramm (Statistik → Qualitätswerkzeuge
 * → Multi-Vari-Diagramm), erweitert um die Varianzkomponenten-Tabelle.
 *
 * Zeigt jede Einzelmessung nach bis zu vier Einflussgrößen gestaffelt und
 * beantwortet die Frage, die eine Kennzahl verdeckt: entsteht die Streuung
 * zwischen den Schichten, zwischen den Werkzeugnestern oder innerhalb eines
 * Teils? Die Tabelle darunter beziffert, was das Bild zeigt.
 *
 * Zwei Engines, bewusst getrennt: `multi-vari-engine.js` gruppiert (und rechnet
 * nichts), `variance-components-engine.js` zerlegt (und weiß nichts vom Bild).
 *
 * `ChartBase` liefert genau einen Plot-Bereich, also entsteht das
 * Panel-Raster durch Stapeln einer Chart-Instanz je Streifen mit geteilter
 * Y-Domäne — wie beim `gage-run-chart`. Spec:
 * `docs/superpowers/specs/2026-08-31-multi-vari-design.md`.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './multi-vari-model.js';

const mod = createModule({
  config: {
    id: 'multi-vari',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.multi-vari',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /** Abgeleitetes Ergebnis für das Template, oder null. */
      result: null,
      errorMsg: '',

      // ── Anzeige-Helfer ────────────────────────────────────────

      /** Rolle der Faktorzeile an Position `idx` (X-Achse, Serie, …). */
      factorRole(idx) {
        return _t(`factorRole_${idx}`);
      },

      chartTitle() {
        return _t('chartTitle', { col: '' });
      },

      // ── Platzhalter, in Task 16 gefüllt ───────────────────────

      addFactor() {
        this.model.addFactor();
      },

      removeFactor(id) {
        this.model.removeFactor(id);
      },

      optionChanged() {
        // x-model hat den Wert bereits geschrieben.
      },

      init() {},

      destroy() {},
    };
  },
});

export default mod;
