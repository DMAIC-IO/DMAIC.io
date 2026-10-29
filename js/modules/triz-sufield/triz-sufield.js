/**
 * D.Mike — Stoff-Feld-Analyse (TRIZ) (triz-sufield.js)
 *
 * @agent  Vollständig über das Viewmodel steuerbar: die beiden Stoffe, die
 *   Feldart, die Verknüpfung, die Problemnotiz, Auswahl und Notiz je
 *   Standardlösung, der Listenfilter und die Aufklappung der
 *   Standardklassen. Die 78 Standardlösungen sind feste Tabellendaten und
 *   kein Zustand.
 */
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireBoolean, requireEnum, requireKnownId, requireNumber, requireText } from '../../core/agent/agent-argcheck.js';
import { State, diagnose, FIELDS, LINKS, FILTER_MODES } from './triz-sufield-model.js';

const DATA_PATH = 'js/modules/triz-sufield/data/standards.json';
let _dataPromise = null;

/**
 * Die Tabelle der 78 Standardlösungen: Tabellendaten, kein Zustand, darum
 * auf Modulebene. Einmal geladen und eingefroren; `base.init` wartet das
 * Laden ab, BEVOR das Viewmodel entsteht — jeder Agentenaufruf sieht die
 * volle Tabelle. Gelesen wird sie nur über die `@noagent`-Methode
 * `standards()`, damit Prüfung und Lesefeld dieselbe Quelle haben.
 */
const STANDARD_TABLE = { entries: Object.freeze([]) };

function loadData() {
  if (_dataPromise) return _dataPromise;
  _dataPromise = fetch(DATA_PATH, { cache: 'no-cache' })
    .then(r => r.json())
    .then(d => {
      STANDARD_TABLE.entries = Object.freeze(d.standards.map(x => Object.freeze({ ...x })));
      return d.standards;
    });
  return _dataPromise;
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)  }…` : str;
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Die Diagnose, wie `read().diagnosis` sie zeigt. Sätze je Eigenschaft unter
 * `types.Diagnosis.<name>`.
 *
 * @typedef {object} Diagnosis
 * @property {'partial'|'incomplete'|'complete-useful'|'complete-insufficient'|'complete-excessive'|'complete-harmful'} situation  Lage des Modells
 * @property {number[]} suggestedClasses  empfohlene Standardklassen, 1 bis 5
 */

/**
 * Eine Standardlösung, wie `read().standards` sie zeigt. Sätze je
 * Eigenschaft unter `types.StandardEntry.<name>`.
 *
 * @typedef {object} StandardEntry
 * @property {string} id  Nummer der Standardlösung, Klasse.Gruppe.Lösung
 * @property {number} class  Standardklasse, 1 bis 5
 * @property {string} group  Gruppe, Klasse.Gruppe
 * @property {string} title  Titel in der aktiven Sprache
 * @property {string} trigger  wann die Lösung greift, in der aktiven Sprache
 */

/**
 * @typedef {object} AgentRead
 * @property {string} s1  der Stoff S1
 * @property {string} s2  der Stoff S2
 * @property {string} field  Feldart, leer solange keine gewählt ist
 * @property {string} link  Verknüpfung, leer solange keine gewählt ist
 * @property {string} problemNote  Problemnotiz
 * @property {Record<string, string>} notes  Notiz je vermerkter Standardlösung, adressiert über ihre id
 * @property {Record<string, boolean>} selected  vorgemerkte Standardlösungen, adressiert über ihre id
 * @property {string} filterMode  Listenfilter, auto oder all
 * @property {number[]} expandedClasses  Nummern der aufgeklappten Standardklassen
 * @property {Diagnosis} diagnosis  die aus den vier Werten abgeleitete Diagnose
 * @property {StandardEntry[]} standards  [bulk] alle 78 Standardlösungen, Titel und Auslöser in der aktiven Sprache
 */
const base = createModule({
  config: {
    id: 'triz-sufield',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-sufield',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} das Stoff-Feld-Modell samt abgeleiteter Diagnose
       */
      read(options) {
        const m = this.model;
        const lang = module._context.language;
        return readAgentState('triz-sufield', {
          ...m.toJSON(),
          diagnosis: diagnose(m.s1, m.s2, m.field, m.link),
          standards: this.standards().map((x) => {
            const loc = x[lang] || x.en;
            return { id: x.id, class: x.class, group: x.group, title: loc.title, trigger: loc.trigger };
          }),
        }, options);
      },

      /**
       * @noagent Rohdaten der Standardtabelle; Quelle für die Prüfungen und
       *   für das Lesefeld `standards`.
       * @returns {ReadonlyArray<object>}
       */
      standards() { return STANDARD_TABLE.entries; },

      FIELDS: [...FIELDS],
      LINKS: [...LINKS],
      standardsByClass: null,
      classList: [],

      // ── Diagnosis ──
      /** @noagent view transform */
      diagSituation() {
        const s = this.model;
        return diagnose(s.s1, s.s2, s.field, s.link).situation;
      },
      /** @noagent view transform */
      suggestedClassesLabel() {
        return `${_t('suggestedClasses')  }:`;
      },
      /** @noagent view transform */
      suggestedClassList() {
        const s = this.model;
        return diagnose(s.s1, s.s2, s.field, s.link).suggestedClasses;
      },

      // ── SVG diagram ──
      /** @noagent view transform */
      diagramEdgeClass() {
        const link = this.model.link;
        return link ? `triz-sf__edge--${  link}` : 'triz-sf__edge--empty';
      },
      /** @noagent view transform */
      diagramEdgeColor() {
        const link = this.model.link;
        if (link === 'useful') return 'var(--color-success, #2ea043)';
        if (link === 'insufficient') return 'var(--color-warning, #d29922)';
        if (link === 'excessive') return 'var(--color-accent, #2e7dd9)';
        if (link === 'harmful') return 'var(--color-error, #c93c3c)';
        return 'var(--color-text-tertiary)';
      },
      /** @noagent view transform */
      diagramDashArray() {
        const link = this.model.link;
        if (link === 'insufficient') return '6 4';
        if (link === 'harmful') return '2 4';
        if (link === 'missing') return '2 6';
        return null;
      },
      /** @noagent view transform */
      diagramMarkerEnd() {
        return this.model.link === 'missing' ? null : 'url(#triz-sf-arrow)';
      },
      /** @noagent view transform */
      diagramSideDash() {
        return this.model.field ? '0' : '2 4';
      },
      /** @noagent view transform */
      diagramFieldLabel() {
        const field = this.model.field;
        return field ? _t(`field.${  field}`) : _t('fieldEmpty');
      },
      /** @noagent view transform */
      diagramS1Text() {
        return truncate(this.model.s1 || _t('s1Placeholder'), 22);
      },
      /** @noagent view transform */
      diagramS2Text() {
        return truncate(this.model.s2 || _t('s2Placeholder'), 22);
      },

      // ── Pipe filters ──
      /** @noagent view transform */
      situationLabel: (s) => _t(`situation.${  s}`),
      /** @noagent view transform */
      fieldOptionLabel: (f) => _t(`field.${  f}`),
      /** @noagent view transform */
      linkOptionLabel: (l) => _t(`link.${  l}`),

      // ── i18n helpers ──
      /** @noagent view transform */
      className: (c) => _t(`class.${  c  }.name`),
      /** @noagent view transform */
      classDesc: (c) => _t(`class.${  c  }.description`),
      /** @noagent view transform */
      classCount: (arr) => `(${  arr ? arr.length : 0  })`,

      // ── Language-aware standard display ──
      /** @noagent view transform */
      stdTitle(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.title : '';
      },
      /** @noagent view transform */
      stdDesc(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.description : '';
      },
      /** @noagent view transform */
      stdTrigger(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.trigger : '';
      },
      /** @noagent view transform */
      stdExample(s) {
        const loc = s[module._context.language] || s.en;
        return loc ? loc.example : '';
      },

      // ── Recompute classList from model state ──
      _recompute() {
        if (!this.standardsByClass || this.classList.length === 0) return;
        const s = this.model;
        const diag = diagnose(s.s1, s.s2, s.field, s.link);
        const suggested = diag.suggestedClasses;
        const allShown = s.filterMode === 'all';
        for (const item of this.classList) {
          const numKey = Number(item.key);
          const visible = allShown || suggested.includes(numKey);
          if(visible !== item.visible) {
            item.visible = visible
          }
          const open = this.model.expandedClasses.includes(numKey);
          if(open!==item.open) {
            item.open = open;
          }
        }
      },

      // ── Class visibility / expansion ──
      /**
       * @noagent packt ein `toggle`-Ereignis aus und liest den Aufklappstand
       *   am DOM-Knoten; der Wert geht durch `setClassExpanded`.
       */
      classToggled(cls, event) {
        this.setClassExpanded(Number(cls.key), event.currentTarget.open);
      },

      /**
       * Klappt eine Klasse der Standardlösungen auf oder zu.
       * @agent
       * @param {number} cls Nummer der Standardklasse, 1 bis 5
       * @param {boolean} expanded `true` klappt auf, `false` klappt zu
       * @returns {void}
       * @throws {Error} wenn keine Standardklasse diese Nummer trägt oder expanded weder true noch false ist
       */
      setClassExpanded(cls, expanded) {
        const numKey = requireNumber('cls', cls, { integer: true });
        requireKnownId('cls', numKey, [...new Set(this.standards().map((x) => x.class))]);
        requireBoolean('expanded', expanded);
        const arr = this.model.expandedClasses;
        const idx = arr.indexOf(numKey);
        if (expanded) {
          if (idx === -1) arr.push(numKey);
        } else if (idx !== -1) arr.splice(idx, 1);
        this._recompute();
      },

      // ── Select helpers ──
      /** @noagent view transform */
      isFieldSelected(f) { return this.model.field === f; },
      /** @noagent view transform */
      isLinkSelected(l) { return this.model.link === l; },
      /**
       * @noagent packt ein Änderungsereignis aus; der Wert geht durch
       *   `setFieldType`.
       */
      fieldChanged(event) {
        const val = event.target.value;
        this.setFieldType(FIELDS.includes(val) ? val : '');
      },
      /**
       * @noagent packt ein Änderungsereignis aus; der Wert geht durch
       *   `setLink`.
       */
      linkChanged(event) {
        const val = event.target.value;
        this.setLink(LINKS.includes(val) ? val : '');
      },
      /** @noagent packt ein Eingabeereignis aus; der Wert geht durch `setS1`. */
      s1Changed(event) {
        this.setS1(event.target.value);
      },
      /** @noagent packt ein Eingabeereignis aus; der Wert geht durch `setS2`. */
      s2Changed(event) {
        this.setS2(event.target.value);
      },

      // ── Zustands-Sinks: ein Setter je Feld ───────────
      // `setFieldType` heißt nicht `setField`: das Feld des Models heißt
      // `field`, und ein generisches `setField(name, wert)` wäre nach der
      // Namensregel für Setter genau der Name, der die Bedeutung aus der Werkzeugbeschreibung in
      // eine Fehlermeldung verschiebt.

      /**
       * Setzt den Stoff S1 — den Stoff, der die Wirkung auslöst.
       * @agent
       * @param {string} text Name oder kurze Beschreibung von S1
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setS1(text) {
        this.model.s1 = requireText('text', text);
        this._recompute();
      },

      /**
       * Setzt den Stoff S2 — den Stoff, auf den gewirkt wird.
       * @agent
       * @param {string} text Name oder kurze Beschreibung von S2
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setS2(text) {
        this.model.s2 = requireText('text', text);
        this._recompute();
      },

      /**
       * Setzt die Feldart, die zwischen den beiden Stoffen wirkt.
       * @agent
       * @param {string} field Feldart: M, A, T, C, E oder Mg; ein leerer
       *   Text nimmt die Wahl zurück
       * @returns {void}
       * @throws {Error} wenn der Wert keine dieser Feldarten ist
       */
      setFieldType(field) {
        if (field !== '') requireEnum('field', field, FIELDS);
        this.model.field = field;
        this._recompute();
      },

      /**
       * Setzt die Art der Verknüpfung zwischen den beiden Stoffen.
       * @agent
       * @param {string} link Verknüpfung: useful, insufficient, excessive,
       *   harmful oder missing; ein leerer Text nimmt die Wahl zurück
       * @returns {void}
       * @throws {Error} wenn der Wert keine dieser Verknüpfungen ist
       */
      setLink(link) {
        if (link !== '') requireEnum('link', link, LINKS);
        this.model.link = link;
        this._recompute();
      },

      /**
       * Setzt die Problemnotiz zum Stoff-Feld-Modell.
       * @agent
       * @param {string} text die Problemnotiz
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setProblemNote(text) { this.model.problemNote = requireText('text', text); },

      /**
       * Setzt die Notiz zu einer Standardlösung; ein leerer Text löscht sie.
       * @agent
       * @param {string} stdId id der Standardlösung, zum Beispiel 2.2.5
       * @param {string} text die Notiz zu dieser Standardlösung
       * @returns {void}
       * @throws {Error} wenn keine Standardlösung diese id trägt, oder
       *   `text` keine Zeichenkette ist
       */
      setStandardNote(stdId, text) {
        requireKnownId('stdId', requireText('stdId', stdId), this.standards().map((x) => x.id));
        const value = requireText('text', text);
        if (value) this.model.notes[stdId] = value;
        else delete this.model.notes[stdId];
      },

      /**
       * Merkt eine Standardlösung als in Betracht gezogen vor oder nimmt
       * die Vormerkung zurück.
       * @agent
       * @param {string} stdId id der Standardlösung, zum Beispiel 2.2.5
       * @param {boolean} selected `true` merkt vor, `false` nimmt zurück
       * @returns {void}
       * @throws {Error} wenn keine Standardlösung diese id trägt oder selected weder true noch false ist
       */
      setStandardSelected(stdId, selected) {
        requireKnownId('stdId', requireText('stdId', stdId), this.standards().map((x) => x.id));
        requireBoolean('selected', selected);
        if (selected) this.model.selected[stdId] = true;
        else delete this.model.selected[stdId];
      },

      /**
       * Setzt den Listenfilter der Standardlösungen.
       * @agent
       * @param {string} mode `auto` zeigt nur die zur Diagnose passenden
       *   Klassen, `all` alle fünf
       * @returns {void}
       * @throws {Error} wenn der Wert weder `auto` noch `all` ist
       */
      setFilterMode(mode) {
        requireEnum('mode', mode, FILTER_MODES);
        this.model.filterMode = mode;
        this._recompute();
      },

      // ── Filter ──
      /** @noagent view transform */
      isFilterAuto() {
        const m = this.model.filterMode;
        return m === 'auto' || m === '';
      },
      /** @noagent view transform */
      isFilterAll() {
        return this.model.filterMode === 'all';
      },
      /**
       * @noagent packt ein Änderungsereignis aus; der Wert geht durch
       *   `setFilterMode`.
       */
      filterChanged(event) {
        this.setFilterMode(event.target.value);
      },

      // ── Standard selection / notes ──
      /** @noagent view transform */
      isStandardSelected(s) { return Boolean(this.model.selected[s.id]); },
      /** @noagent view transform */
      noteValue(s) { return this.model.notes[s.id] || ''; },
      /** @noagent view transform */
      standardSelectedClass(s) {
        return this.model.selected[s.id] ? 'is-selected' : '';
      },
      /**
       * @noagent packt ein Eingabeereignis aus und liest die id am
       *   Tabelleneintrag; der Wert geht durch `setStandardNote`.
       */
      noteChanged(s, event) {
        this.setStandardNote(s.id, event.target.value);
      },
      /**
       * @noagent packt ein Änderungsereignis aus und liest die id am
       *   Tabelleneintrag; der Wert geht durch `setStandardSelected`.
       */
      selectChanged(s, event) {
        this.setStandardSelected(s.id, event.target.checked);
      },

      // ── Init: load standards, auto-expand classes ──
      /** @noagent lifecycle, kein Zustandsweg */
      init() {
        loadData().then(data => {
          const mapped = {};
          for (const s of data) {
            const key = String(s.class);
            if (!mapped[key]) mapped[key] = [];
            mapped[key].push(s);
          }
          this.standardsByClass = mapped;
          if (this.model.expandedClasses.length === 0) {
            const model = this.model;
            const diag = diagnose(model.s1, model.s2, model.field, model.link);
            // Über die benannte Senke, nicht mit einem eigenen `push`: so
            // bleibt EINE Zuweisungsstelle je Feld, und die Vorauswahl
            // durchläuft dieselbe Prüfung wie ein Aufruf von außen. Die
            // Tabelle ist hier garantiert geladen (siehe `base.init` unten).
            diag.suggestedClasses.forEach(c => this.setClassExpanded(c, true));
          }
          this.classList = Object.keys(mapped).map(key => ({
            key,
            standards: mapped[key],
            visible: true,
            open: false,
          }));
          this._recompute();
        });
      },
    };
  },
});

// Die Standardtabelle muss stehen, bevor das Viewmodel lebt: `agent-ops.js`
// holt sich das Viewmodel direkt nach dem Einhängen und ruft darauf sofort.
// Dasselbe Vorgehen wie in `triz-contradiction-matrix`.
const origInit = base.init;
base.init = async function (container, context) {
  this._container = container;
  this._context = context;
  const wrap = el('div', 'module-container triz-sufield');
  const body = el('div', 'module-container__body');
  body.appendChild(el('p', 'triz-sufield__hint', '\u2026'));
  wrap.appendChild(body);
  container.replaceChildren(wrap);
  try {
    await loadData();
  } catch (err) {
    console.error('[triz-sufield] failed to load data:', err);
    const title = context.i18n.t('modules.triz-sufield.loadError');
    const errWrap = el('div', 'module-error');
    errWrap.appendChild(el('div', 'module-error__title', title));
    errWrap.appendChild(el('div', 'module-error__message', err.message));
    container.replaceChildren(errWrap);
    return;
  }
  return origInit.call(this, container, context);
};

export default base;
