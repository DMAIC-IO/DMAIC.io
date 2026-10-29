/**
 * D.Mike — FMEA Module (fmea.js)
 *
 * Failure Mode and Effects Analysis with RPN calculation (S×O×D), projected
 * RPN via per-action S/O/D deltas, an action burndown chart, and CSV export.
 * DMAIC phase: Analyze.
 *
 * Migrated to createModule + Alpine CSP. All business logic (RPN, projected
 * RPN, statistics, burndown series, CSV row matrix) lives in fmea-model.js and
 * is unit-tested. This file holds only view transformations (badge classes,
 * scale i18n text, '—' formatting), event handlers, and the imperative
 * burndown chart lifecycle (chartManager is not a pure-template concern; the
 * chart's holder is lent to the dialog service).
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Bewertungsmethode und
 *   FMEA-Art, Risiken anlegen, bewerten und entfernen, jedes Feld eines
 *   Risikos und jeder Maßnahme, die Sortierung nach Vorrang, das Auf- und
 *   Zuklappen einer Risikokarte und die eigenen Skalentexte. Der Oberfläche
 *   bleiben der Skalenbereich, das Burndown-Fenster und der Dateidownload.
 */

import { createModule } from '../../core/template-module.js';
import { resolveDateOffset } from '../../core/date-offset.js';
import { isIsoDate } from '../../core/local-date.js';
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';
import { State, METHODS, FMEA_TYPES, SPECIAL_CHARS, fmeaCreateDefault } from './fmea-model.js';
import { S_BANDS, O_BANDS, D_BANDS, AP_TABLE, AP_CATEGORY, bandLabel } from './fmea-ap.js';

/** Map a 1–10 rating to its scale-row index (0–4). */
function scaleRow(v) {
  if (v <= 1) return 0;
  if (v <= 3) return 1;
  if (v <= 6) return 2;
  if (v <= 8) return 3;
  return 4;
}

/** Hardcoded default failure-rate ranges for the Occurrence scale. */
const RATE_DEFAULTS = {
  occUnlikelyRate: '< 1 / 1.500.000',
  occLowRate: '1 / 150.000 – 15.000',
  occModRate: '1 / 2.000 – 80',
  occHighRate: '1 / 20 – 8',
  occVHighRate: '≥ 1 / 3',
};

/** Keys that have no i18n entry — only the hardcoded rate defaults above. */
const RATE_KEYS = new Set(Object.keys(RATE_DEFAULTS));

// ── Die Wertemengen der feldbenannten Setzer ──────────────────────────
// Ein Risiko trägt 14 Schlüssel in `toJSON()`, davon 12 setzbar; eine
// Maßnahme 7, alle setzbar. Elf Risikofelder und alle sieben
// Maßnahmenfelder sind in der Vorlage gebunden. Über der Grenze von zehn
// steht deshalb EIN feldbenannter Setzer je Satz statt 18 einzelner.
// `collapsed` hat seinen eigenen Setzer: es ist der einzige Wahrheitswert
// des Risikos und kein Inhaltsfeld.
const RISK_FIELDS = ['step', 'failureMode', 'effect', 'cause', 'prevention',
  'control', 'specialChar', 'justification', 'sev', 'occ', 'det'];
const ACTION_FIELDS = ['text', 'resp', 'date', 'done', 'deltaS', 'deltaO', 'deltaD'];

// S, O und D laufen als ZEICHENKETTE von '1' bis '10', die leere Zeichenkette
// heißt unbewertet. `requireIndex` passt darauf nicht — es verlangt eine ganze
// ZAHL und meldete „allowed: 0..10", ließe also die 0 durch und die
// Zeichenketten der Oberfläche gar nicht. Dasselbe für die Deltas '0'..'9'.
const SOD_VALUES = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const DELTA_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Die Schlüsselfläche von `setRiskValue`: die Felder einer Risikozeile.
 * Sätze je Feld unter `types.RiskField.<feld>`, dieselben an den
 * Beschriftungen der Risikokarte (Alt-Taste).
 *
 * @typedef {object} RiskField
 * @property {string} step  Prozessschritt bzw. Bauteil
 * @property {string} failureMode  potenzieller Fehlermodus
 * @property {string} effect  Fehlerfolge
 * @property {string} cause  Fehlerursache
 * @property {string} prevention  Vermeidungsmaßnahme
 * @property {string} control  Entdeckungsmaßnahme
 * @property {''|'CC'|'SC'} specialChar  besonderes Merkmal
 * @property {string} justification  Begründung ohne Maßnahme
 * @property {''|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'} sev  Bedeutung S
 * @property {''|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'} occ  Auftreten O
 * @property {''|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'} det  Entdeckung D
 */

/**
 * Die Schlüsselfläche von `setActionValue`: die Felder einer Maßnahme.
 *
 * @typedef {object} ActionField
 * @property {string} text  die Maßnahme
 * @property {string} resp  verantwortlich
 * @property {string} date  Zieldatum (`JJJJ-MM-TT` oder leer)
 * @property {boolean} done  umgesetzt
 * @property {'0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'} deltaS  erwartete Senkung von S
 * @property {'0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'} deltaO  erwartete Senkung von O
 * @property {'0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'} deltaD  erwartete Senkung von D
 */

/**
 * Alle Schlüssel, unter denen ein eigener Skalentext stehen darf: die 30
 * Schlüssel der RPN-Skalen plus die 120 der beiden AP-Skalen.
 * @returns {Set<string>}
 */
function buildScaleKeys() {
  const keys = new Set();
  const rpn = {
    sev: ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'],
    occ: ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'],
    det: ['detCertain', 'detHigh', 'detMod', 'detLow', 'detVLow'],
  };
  for (const k of rpn.sev) { keys.add(k); keys.add(`${k}Desc`); }
  for (const k of rpn.occ) { keys.add(k); keys.add(`${k}Rate`); }
  for (const k of rpn.det) { keys.add(k); keys.add(`${k}Desc`); }
  for (const type of FMEA_TYPES) {
    for (const dim of ['sev', 'occ', 'det']) {
      for (let v = 1; v <= 10; v++) {
        keys.add(`ap.${type}.${dim}.${v}.meaning`);
        keys.add(`ap.${type}.${dim}.${v}.criterion`);
      }
    }
  }
  return keys;
}

const SCALE_KEYS = buildScaleKeys();

const mod = createModule({
  config: {
    id: 'fmea',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.fmea',
    version: '1.3.0',
    meta: import.meta,
    actions: [
      { icon: 'action.glossary', title: 'scales', onClick: (d) => d.toggleScale(),
        dynamicText: (d, tf) => tf(d?.scaleVisible ? 'scalesHide' : 'scalesShow') },
      { icon: 'chart.run-chart', title: 'burndown', onClick: (d) => d.showBurndown() },
      // `agentAction` nennt die Agentenmethode hinter der Leistenaktion.
      { icon: 'nav.expand-down', title: 'sortByPriority', agentAction: 'sortByPriority',
        onClick: (d) => d.sortByPriority() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.csv', title: 'export.csv', onClick: (d) => d.exportCSV() },
      ] },
      { icon: 'action.add', title: 'addRisk', variant: 'primary', agentAction: 'addRisk',
        onClick: (d) => d.addRisk() },
    ],
  },
  Model: State,
  /** New FMEAs start with the app-wide default method/type (settings page). */
  createDefault: fmeaCreateDefault,

  beforeLoadExample(data) {
    const result = JSON.parse(JSON.stringify(data));
    if (Array.isArray(result.risks)) {
      result.risks.forEach(r => {
        if (Array.isArray(r.actions)) {
          r.actions.forEach(a => { a.date = resolveDateOffset(a.date); });
        }
      });
    }
    return result;
  },

  data(module, _t) {
    return {
      ...agentReadMixin(module),
      // ── Transient UI state (never persisted) ──────────────────
      scaleVisible: false,
      /** @type {{close: Function, setTitle: Function}|null} open burndown dialog */
      _burndownDialog: null,
      _chart: null,
      _renderGen: 0,

      // ── View transformations (CSS / i18n / formatting) ────────

      /** @noagent view transform: die laufende Risikonummer. */
      riskNum: (i) => `R-${  String(i + 1).padStart(3, '0')}`,
      /** @noagent view transform: die Risikoprioritätszahl als Text. */
      rpnText: (v) => v ? (`RPN ${  v}`) : 'RPN —',
      /** @noagent view transform: der Zielwert als Text. */
      targetText: (v) => v ? (`${_t('target')  } ${  v}`) : (`${_t('target')  } —`),

      /** @noagent view transform. @returns {boolean} true when the FMEA is rated by action priority */
      isAp() { return this.model.method === 'ap'; },
      /** @noagent view transform. @returns {boolean} true for a design FMEA */
      isDesign() { return this.model.fmeaType === 'design'; },

      /**
       * Setzt die Bewertungsmethode der FMEA.
       * @agent
       * @param {'ap'|'rpn'} m `ap` bewertet nach Aufgabenpriorität (AIAG-VDA),
       *   `rpn` nach der Risikoprioritätszahl
       * @returns {void}
       * @throws {Error} wenn `m` keine der beiden Methoden ist
       */
      setMethod(m) {
        requireEnum('m', m, METHODS);
        this.model.method = m;
      },

      /**
       * Setzt die Art der FMEA; sie wählt die Skalentexte der
       * Aufgabenpriorität aus.
       * @agent
       * @param {'process'|'design'} type `process` für eine Prozess-FMEA,
       *   `design` für eine Konstruktions-FMEA
       * @returns {void}
       * @throws {Error} wenn `type` keine der beiden Arten ist
       */
      setFmeaType(type) {
        requireEnum('type', type, FMEA_TYPES);
        this.model.fmeaType = type;
      },

      /** @noagent view transform: die Farbstufe des Bewertungsabzeichens. */
      badgeClass(risk) { return `fmea__rpn-badge--${this.model.rating().category(risk)}`; },
      /** @noagent view transform: die Farbstufe des Zielabzeichens. */
      projBadgeClass(risk) { return `fmea__rpn-badge--${this.model.rating().projCategory(risk)}`; },
      /** @noagent view transform: 'AP H' in AP mode, 'RPN 504' in RPN mode. */
      badgeText(risk) { return this.isAp() ? `AP ${risk.ap() || '—'}` : this.rpnText(risk.rpn()); },
      /** @noagent view transform: 'Target AP M' / 'Target 120'. */
      projBadgeText(risk) {
        return this.isAp() ? `${_t('target')} AP ${risk.projAp() || '—'}` : this.targetText(risk.projRpn());
      },
      /** @noagent view transform: 'AP M' / 'RPN 120'. */
      projValueText(risk) { return this.isAp() ? `AP ${risk.projAp() || '—'}` : this.rpnText(risk.projRpn()); },

      /** @noagent view transform: glow tier + collapsed marker + S ≥ 9 marker (RPN mode). */
      cardClass(risk) {
        const cat = this.model.rating().category(risk);
        const glow = cat === 'none' ? '' : `fmea__risk-card--${cat}`;
        const collapsed = risk.collapsed ? 'fmea__risk-card--collapsed' : '';
        const severe = this.showSevere(risk) ? 'fmea__risk-card--severe' : '';
        return (`${glow} ${collapsed} ${severe}`).replace(/\s+/g, ' ').trim();
      },

      /** @noagent view transform. @returns {boolean} AP H without action/justification */
      showUnjustified(risk) { return this.isAp() && risk.needsJustification(); },
      /**
       * @noagent view transform.
       * @returns {boolean} justification field: required at AP H, kept visible once filled —
       * in RPN mode too, since the CSV exports it
       */
      showJustification(risk) {
        return (this.isAp() && risk.needsJustification()) || risk.justification.trim() !== '';
      },
      /** @noagent view transform. @returns {boolean} RPN mode and S ≥ 9 */
      showSevere(risk) { return !this.isAp() && risk.isHighSeverity(); },
      /** @noagent view transform. @returns {string} badge modifier for CC/SC */
      specialCharClass(risk) { return risk.specialChar ? `fmea__badge--${risk.specialChar.toLowerCase()}` : ''; },

      /** @noagent view transform: die projizierte Bedeutung. */
      projSDisp: (risk) => risk.sev ? String(risk.projS()) : '—',
      /** @noagent view transform: das projizierte Auftreten. */
      projODisp: (risk) => risk.occ ? String(risk.projO()) : '—',
      /** @noagent view transform: die projizierte Entdeckung. */
      projDDisp: (risk) => risk.det ? String(risk.projD()) : '—',

      /** @noagent view transform: der Durchschnitt der Kennzahlenkachel. */
      statAvg() { const a = this.model.stats().avg; return a == null ? '—' : String(a); },
      /** @noagent view transform: das Maximum der Kennzahlenkachel. */
      statMax() { const m = this.model.stats().max; return m ? String(m) : '—'; },
      /** @noagent view transform: die Zahl bewerteter Risiken. */
      statRated() { const st = this.model.stats(); return String(st.rated ?? 0); },

      /** @noagent view transform: die Kennzahlen der aktiven Bewertungsmethode. */
      stats() { return this.model.stats(); },

      // ── Scale text (custom override or i18n default) ──────────

      /** @noagent view transform: der eigene Skalentext, sonst der mitgelieferte. */
      scaleText(key) {
        const custom = this.model.scales && this.model.scales[key];
        if (custom != null) return custom;
        return RATE_KEYS.has(key) ? (RATE_DEFAULTS[key] || '') : _t(key);
      },

      // ── AP scale reference ────────────────────────────────────

      apDims: ['sev', 'occ', 'det'],

      /** @noagent view transform. @param {'sev'|'occ'|'det'} dim @returns {string} i18n key of the table heading */
      apDimTitle(dim) {
        return { sev: 'scaleSeverity', occ: 'scaleOccurrence', det: 'scaleDetection' }[dim];
      },

      /** @noagent view transform: Zeilen 10 → 1 einer AP-Skala. */
      apScaleRows(dim) {
        const rows = [];
        for (let v = 10; v >= 1; v--) {
          const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
          rows.push({ key: base, value: v, meaningKey: `${base}.meaning`, criterionKey: `${base}.criterion` });
        }
        return rows;
      },

      /** @noagent view transform. @returns {string[]} column labels of the AP matrix (D bands) */
      apDBandLabels() { return D_BANDS.map(bandLabel); },

      /** @noagent view transform: die AP-Nachschlagematrix. */
      apMatrixRows() {
        const rows = [];
        S_BANDS.forEach((sb, si) => {
          if (sb[0] === 1) {
            rows.push({ key: 's1', s: '1', o: '1–10',
              cells: D_BANDS.map((_, di) => ({ key: `s1-${di}`, ap: 'L', cat: AP_CATEGORY.L })) });
            return;
          }
          O_BANDS.forEach((ob, oi) => {
            rows.push({ key: `${si}-${oi}`, s: bandLabel(sb), o: bandLabel(ob),
              cells: [...AP_TABLE[si][oi]].map((ap, di) => ({ key: `${si}-${oi}-${di}`, ap, cat: AP_CATEGORY[ap] })) });
          });
        });
        return rows;
      },

      /** Tooltip text for rating v of one dimension in AP mode. */
      _apTitle(dim, v) {
        const base = `ap.${this.model.fmeaType}.${dim}.${v}`;
        return `${this.scaleText(`${base}.meaning`)} – ${this.scaleText(`${base}.criterion`)}`;
      },

      /** @noagent view transform: Tooltip der S-Stufen. */
      sevTitle(v) {
        if (this.isAp()) return this._apTitle('sev', v);
        const row = scaleRow(v);
        const k = ['sevNone', 'sevLow', 'sevMod', 'sevHigh', 'sevVHigh'][row];
        return `${this.scaleText(k)  } – ${  this.scaleText(`${k  }Desc`)}`;
      },
      /** @noagent view transform: Tooltip der O-Stufen. */
      occTitle(v) {
        if (this.isAp()) return this._apTitle('occ', v);
        const row = scaleRow(v);
        const k = ['occUnlikely', 'occLow', 'occMod', 'occHigh', 'occVHigh'][row];
        return `${this.scaleText(k)  } (${  this.scaleText(`${k  }Rate`)  })`;
      },
      /** @noagent view transform: Tooltip der D-Stufen. */
      detTitle(v) {
        if (this.isAp()) return this._apTitle('det', v);
        const row = scaleRow(v);
        const k = ['detCertain', 'detHigh', 'detMod', 'detLow', 'detVLow'][row];
        return `${this.scaleText(k)  } – ${  this.scaleText(`${k  }Desc`)}`;
      },

      // ── Event handlers ────────────────────────────────────────

      /**
       * Legt ein leeres Risiko an.
       * @agent
       * @returns {string} die id des neuen Risikos
       */
      addRisk() { return this.model.addRisk().id; },

      /**
       * Entfernt ein Risiko samt seinen Maßnahmen.
       * @agent
       * @param {string} id id des Risikos
       * @returns {void}
       * @throws {Error} wenn kein Risiko diese id trägt
       */
      deleteRisk(id) {
        requireKnownId('id', id, this.model.risks.map((r) => r.id));
        this.model.removeRisk(id);
      },

      /**
       * @noagent bekommt das Risikoobjekt aus der Vorlage; ein Agent hat nur
       * ids. Delegiert an `addRiskAction`.
       */
      addAction(risk) { this.addRiskAction(risk.id); },

      /**
       * @noagent bekommt das Risikoobjekt aus der Vorlage; ein Agent hat nur
       * ids. Delegiert an `removeRiskAction`.
       */
      deleteAction(risk, idx) { this.removeRiskAction(risk.id, idx); },

      /**
       * @noagent bekommt das Risikoobjekt aus der Vorlage, und der Ausgang
       * hängt allein am Vorzustand. Delegiert an `setRiskCollapsed`, damit
       * das Feld genau eine Zuweisungsstelle hat.
       */
      toggleCollapse(risk) { this.setRiskCollapsed(risk.id, !risk.collapsed); },

      /**
       * @noagent Anzeigefilter, nicht Zustand — der Skalenbereich erscheint
       * nicht in `read()`, ein Agent bekäme keine Rückmeldung darüber, was er
       * getan hat. Die Skalentexte selbst setzt `setScaleValue`.
       */
      toggleScale() { this.scaleVisible = !this.scaleVisible; },

      /**
       * Verwirft alle eigenen Skalentexte; es gelten wieder die
       * mitgelieferten.
       * @agent
       * @returns {void}
       */
      resetScales() { this.model.resetScales(); },

      /**
       * Sortiert die Risiken nach der aktiven Bewertungsmethode, das
       * dringendste zuerst.
       * @agent
       * @returns {void}
       */
      sortByPriority() {
        this.model.sortByPriority();
        module._context.notify?.(_t(this.isAp() ? 'sortedByAP' : 'sortedByRPN'));
      },

      /**
       * @noagent DOM event handler: packt den bearbeiteten Zellentext aus.
       * Geschrieben wird über `setScaleValue`, dieselbe Senke wie die der
       * Agentenfläche.
       */
      scaleEdited(key, $event) {
        this.setScaleValue(key, ($event.target.textContent || '').trim());
      },

      /**
       * Setzt einen eigenen Skalentext; er ersetzt den mitgelieferten.
       * @agent
       * @param {string} key der Schlüssel des Skalentexts — bei der
       *   Risikoprioritätszahl etwa `sevHigh` oder `occModRate`, bei der
       *   Aufgabenpriorität `ap.<art>.<dimension>.<stufe>.meaning` bzw.
       *   `.criterion`
       * @param {string} text der neue Text; die leere Zeichenkette lässt die
       *   Zelle leer
       * @returns {void}
       * @throws {Error} wenn `key` kein Schlüssel einer Skalenzelle ist oder
       *   `text` keine Zeichenkette ist
       */
      setScaleValue(key, text) {
        if (!SCALE_KEYS.has(key)) {
          throw new Error(`invalid key ${JSON.stringify(key)}; allowed: a scale cell key — `
            + 'sevNone, sevNoneDesc, sevLow … detVLowDesc, occUnlikelyRate … occVHighRate, '
            + 'or ap.<process|design>.<sev|occ|det>.<1..10>.<meaning|criterion>');
        }
        requireText('text', text);
        if (!this.model.scales) this.model.scales = {};
        this.model.scales[key] = text;
      },

      /**
       * Setzt ein Feld eines Risikos.
       * @agent
       * @param {string} riskId id des Risikos
       * @param {keyof RiskField} field welches Feld der Risikozeile
       * @param {string} value der Wert; Bereich je Feld siehe `RiskField`
       * @returns {void}
       * @throws {Error} wenn kein Risiko diese id trägt, `field` keines der
       *   elf Felder ist oder `value` nicht in die Wertemenge dieses Feldes
       *   passt
       */
      setRiskValue(riskId, field, value) {
        requireKnownId('riskId', riskId, this.model.risks.map((r) => r.id));
        requireEnum('field', field, RISK_FIELDS);
        if (field === 'specialChar') requireEnum('value', value, SPECIAL_CHARS);
        else if (field === 'sev' || field === 'occ' || field === 'det') {
          requireEnum('value', value, SOD_VALUES);
        } else requireText('value', value);
        this.model.risks.find((r) => r.id === riskId)[field] = value;
      },

      /**
       * Klappt eine Risikokarte auf oder zu.
       * @agent
       * @param {string} riskId id des Risikos
       * @param {boolean} collapsed true klappt die Karte zu, false auf
       * @returns {void}
       * @throws {Error} wenn kein Risiko diese id trägt oder `collapsed` kein
       *   Wahrheitswert ist
       */
      setRiskCollapsed(riskId, collapsed) {
        requireKnownId('riskId', riskId, this.model.risks.map((r) => r.id));
        requireBoolean('collapsed', collapsed);
        this.model.risks.find((r) => r.id === riskId).collapsed = collapsed;
      },

      /**
       * Hängt einem Risiko eine leere Maßnahme an.
       * @agent
       * @param {string} riskId id des Risikos
       * @returns {number} die Position der neuen Maßnahme
       * @throws {Error} wenn kein Risiko diese id trägt
       */
      addRiskAction(riskId) {
        requireKnownId('riskId', riskId, this.model.risks.map((r) => r.id));
        this.model.addAction(riskId);
        return this.model.risks.find((r) => r.id === riskId).actions.length - 1;
      },

      /**
       * Entfernt eine Maßnahme eines Risikos.
       * @agent
       * @param {string} riskId id des Risikos
       * @param {number} actionIndex die Position der Maßnahme, bei 0 beginnend
       * @returns {void}
       * @throws {Error} wenn kein Risiko diese id trägt oder das Risiko an
       *   dieser Position keine Maßnahme hat
       */
      removeRiskAction(riskId, actionIndex) {
        requireKnownId('riskId', riskId, this.model.risks.map((r) => r.id));
        this._requireActionIndex(riskId, actionIndex);
        this.model.removeAction(riskId, actionIndex);
      },

      /**
       * Setzt ein Feld einer Maßnahme.
       * @agent
       * @param {string} riskId id des Risikos
       * @param {number} actionIndex die Position der Maßnahme, bei 0 beginnend
       * @param {keyof ActionField} field welches Feld der Maßnahme
       * @param {string|boolean} value der Wert; Bereich je Feld siehe `ActionField`
       * @returns {void}
       * @throws {Error} wenn kein Risiko diese id trägt, das Risiko an dieser
       *   Position keine Maßnahme hat, `field` keines der sieben Felder ist
       *   oder `value` nicht in die Wertemenge dieses Feldes passt
       */
      setActionValue(riskId, actionIndex, field, value) {
        requireKnownId('riskId', riskId, this.model.risks.map((r) => r.id));
        this._requireActionIndex(riskId, actionIndex);
        requireEnum('field', field, ACTION_FIELDS);
        if (field === 'done') requireBoolean('value', value);
        else if (field === 'date') {
          requireText('value', value);
          if (value !== '' && !isIsoDate(value)) {
            throw new Error(`invalid value ${JSON.stringify(value)}; allowed: YYYY-MM-DD or ""`);
          }
        } else if (field === 'deltaS' || field === 'deltaO' || field === 'deltaD') {
          requireEnum('value', value, DELTA_VALUES);
        } else requireText('value', value);
        this.model.risks.find((r) => r.id === riskId).actions[actionIndex][field] = value;
      },

      // `requireIndex` passt hier nicht: es erlaubt `0..length` INKLUSIVE,
      // also auch die Position hinter der letzten Maßnahme — die gibt es
      // nicht. Die tatsächlichen Positionen sind die ehrliche Wertemenge.
      _requireActionIndex(riskId, actionIndex) {
        const actions = this.model.risks.find((r) => r.id === riskId).actions;
        requireEnum('actionIndex', actionIndex, actions.map((_, i) => i));
      },

      // ── CSV export (file download — not UI markup) ────────────

      /** @noagent lädt eine Datei herunter; ein Agent liest den Zustand über `read()`. */
      exportCSV() {
        const lang = module._context.i18n.getLanguage();
        const yes = lang === 'de' ? 'Ja' : 'Yes';
        const no = lang === 'de' ? 'Nein' : 'No';
        const headers = ['#', _t('step'), _t('failureMode'), _t('effect'), _t('cause'),
          _t('preventionControl'), _t('currentControls'), _t('specialChar'), _t('justification'),
          'S', 'O', 'D', 'RPN', 'AP',
          _t('action'), _t('responsible'), _t('dueDate'), _t('done'), 'ΔS', 'ΔO', 'ΔD',
          'Proj.S', 'Proj.O', 'Proj.D', 'Proj.RPN', 'Proj.AP'];
        const cell = (v) => `"${  String(v == null ? '' : v).replace(/"/g, '""')  }"`;
        let csv = `sep=;\n${  headers.map(cell).join(';')  }\n`;
        for (const row of this.model.csvRows({ yes, no })) {
          csv += `${row.map(cell).join(';')  }\n`;
        }
        const blob = new Blob([`\uFEFF${  csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fmea_export_${  new Date().toISOString().slice(0, 10)  }.csv`;
        a.click();
        URL.revokeObjectURL(url);
        module._context.notify?.(_t('exportedCSV'));
      },

      // ── Burndown chart (imperative via chartManager) ──────────

      /**
       * @noagent öffnet das Burndown-Fenster der Oberfläche; ein Agent darf
       * keinen Dialog öffnen — er blockierte den Stapel. Die Zahlen
       * dahinter stehen über `read()` zur Verfügung. Öffnet den Burndown in
       * einem breiten Dialog und hängt das Diagramm in den geliehenen Halter
       * (x-ref="burndown"); Schließen des Dialogs zerstört es.
       * @returns {Promise<void>} resolves once the chart is mounted
       */
      async showBurndown() {
        const bd = this.model.burndownSeries();
        if (!bd) {
          module._context.notify?.(_t('burndownNoData'));
          return;
        }
        this._burndownDialog?.close();
        this._burndownDialog = module._context.dialog.show({
          title: _t('burndownTitle'),
          size: 'wide',
          content: this.$refs.burndown,
          onClose: () => { this._destroyChart(); this._burndownDialog = null; },
        });
        const el = this.$refs.burndown.querySelector('[data-ref="burndown-chart"]');
        this._destroyChart();
        const gen = ++this._renderGen;
        const lang = module._context.language || 'de';
        const dateFmt = (ms) => new Date(ms).toLocaleDateString(
          lang === 'de' ? 'de-DE' : 'en-GB',
          { day: '2-digit', month: '2-digit', year: '2-digit' });
        const line = (name, x, y, color, dash) => ({
          name, x, y, color, symbol: 'circle',
          connectLine: { show: true, dash, width: dash === 'solid' ? 2.5 : 2, color },
        });
        const series = bd.kind === 'ap'
          ? [
            line(_t('burndownHPlan'), bd.planX, bd.planH, 'var(--color-warning)', 'dash'),
            line(_t('burndownHActual'), bd.actX, bd.actH, 'var(--color-warning)', 'solid'),
            line(_t('burndownHmPlan'), bd.planX, bd.planHM, 'var(--color-info)', 'dash'),
            line(_t('burndownHmActual'), bd.actX, bd.actHM, 'var(--color-info)', 'solid'),
          ]
          : [
            line(_t('burndownPlan'), bd.planX, bd.planY, 'var(--color-text-tertiary)', 'dash'),
            line(_t('burndownActual'), bd.actX, bd.actY, 'var(--color-accent)', 'solid'),
          ];
        const chart = await module._context.chartManager.create(el, 'scatter', {
          series,
          title: _t('burndownTitle'),
          yLabel: bd.kind === 'ap' ? _t('burndownRiskCount') : 'RPN',
          yMin: 0,
          showLegend: true,
          xTickFormat: dateFmt,
        });
        if (gen !== this._renderGen || this._burndownDialog === null) {
          module._context.chartManager.destroy(chart);
          return;
        }
        this._chart = chart;
      },

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle, kein Zustandsweg. */
      destroy() {
        this._burndownDialog?.close();
        this._destroyChart();
      },
    };
  },
});

export default mod;
