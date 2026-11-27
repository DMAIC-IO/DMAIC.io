/**
 * D.Mike — Einheitenumrechner: Viewmodel.
 *
 * Felder, Kommandos, Invarianten und Ergebnisse liegen im Model
 * (domain/model.js); die Agentenfläche entsteht aus dessen Schema. Größenart,
 * Tauschen und „Jetzt“ laufen über `x-command`, die Ausgangseinheit über
 * `x-model`, die Zeitzonen über `x-field`. Die Auswahl „Eingang“ ruft das
 * Kommando `setFromUnit`, das die Ausgangseinheit im selben Schritt nachzieht.
 * Hier bleiben die Anzeige (Zahlen, Uhrzeit und Datum in der App-Sprache,
 * Beschriftungen) und die Weltzeituhr mit ihrem Sekundentakt.
 */
import { createModule } from '../../../core/template-module.js';
import { decimalOr } from '../../../core/number-format.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { CATEGORIES, TIMEZONES, TZ_WORLD_CLOCK_INDICES } from '../domain/units.js';
import { refRows, utcFromInput } from '../domain/convert.js';
import { UiState } from './state.js';
import {
  fmtUnit, resultText, formulaText, zoneTime, zoneDate, tzAbbr, tzDiffText,
} from './present.js';

/** Takt der Weltzeituhr in Millisekunden. */
const CLOCK_TICK_MS = 1000;

/** @typedef {import('../domain/model.types.js').StateModel & Pick<State, 'hasContent'>} UnitConverterModel */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  /** @type {import('./state.types.js').UnitConverterViewFn} */
  view(ctx) {
    /** Griff des Sekundentakts. @type {ReturnType<typeof setInterval>|null} */
    let clock = null;
    const lang = () => ctx.i18n.getLanguage();
    return {
      /** Die Größenarten in Anzeigereihenfolge. */
      get categories() { return CATEGORIES; },
      /** Die Zeitzonen der Auswahl. */
      get timezones() { return TIMEZONES; },

      /** @param {string} catKey @returns {string} */
      catName(catKey) { return this.t(CATEGORIES[catKey]?.nameKey || ''); },
      /** @param {string} catKey @returns {string} */
      catIcon(catKey) { return CATEGORIES[catKey]?.icon || ''; },
      /** @param {string} catKey @returns {string} */
      catActiveClass(catKey) {
        return this.model.activeCat === catKey ? 'btn--active module-unit-converter__cat-btn--active' : '';
      },
      /** @param {string} catKey @returns {'true'|'false'} Umschaltzustand für aria-pressed */
      catPressed(catKey) { return this.model.activeCat === catKey ? 'true' : 'false'; },

      /** @param {string} unitKey @returns {string} */
      unitLabel(unitKey) {
        const u = CATEGORIES[this.model.activeCat]?.units[unitKey];
        return u ? this.t(`unit_${u.nameKey}`) : '';
      },
      /** Gruppen der Eingangsauswahl (leer ohne Gruppen). @returns {{ key: string, members: string[], label: string }[]} */
      get fromGroups() {
        const groups = CATEGORIES[this.model.activeCat]?.groups;
        if (!groups) return [];
        return Object.entries(groups).map(([key, members]) => ({ key, members, label: this.t(`labGroup_${key}`) }));
      },
      /** Flache Einheitenliste der Eingangsauswahl (leer mit Gruppen). @returns {string[]} */
      get fromFlatUnits() {
        const cat = CATEGORIES[this.model.activeCat];
        return !cat || cat.groups ? [] : Object.keys(cat.units);
      },
      /**
       * Auswahl „Eingang“: über das Kommando, das die Ausgangseinheit nachzieht.
       * @param {Event} e
       */
      onFromUnit(e) {
        const el = /** @type {HTMLSelectElement} */ (e.target);
        try {
          this.model.setFromUnit({ unitKey: el.value });
        } catch (err) {
          console.warn('unit-converter: Eingangseinheit nicht übernommen', err);
          el.value = this.model.fromUnit;
        }
      },

      /** Ergibt die Eingabe eine Zahl? */
      get hasInput() { return !Number.isNaN(decimalOr(this.model.inputVal, NaN)); },
      get resultText() { return resultText(this.hasInput, this.result.value, lang(), this.t); },
      get formulaText() {
        return formulaText(this.hasInput, this.result.factor, this.model.fromUnit, this.model.toUnit, lang(), this.t);
      },
      /** Zeilen der Schnellreferenz in Anzeigeform. */
      get refRows() {
        return refRows(this.model.activeCat).map((r, idx) => ({
          idx, from: r.from, to: r.to, val: fmtUnit(r.val, lang()), result: fmtUnit(r.result, lang()),
        }));
      },

      /** @param {{ labelKey: string }} z @returns {string} */
      tzLabel(z) { return this.t(z.labelKey); },
      /** Der Zeitpunkt der Eingabe in der Ausgangszone. */
      get tzInput() { return utcFromInput(this.model.tzFrom, this.model.tzTime, this.model.tzDate); },
      get tzResultText() {
        const time = this.timezone.time;
        const input = this.tzInput;
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (time === null || !input || !toTz) return '—';
        return this.t('clockTime', { time: zoneTime(input.utc, toTz, lang()) });
      },
      get tzResultDateText() {
        const input = this.tzInput;
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        return input && toTz ? zoneDate(input.utc, toTz, lang()) : '';
      },
      get tzDiffText() { return tzDiffText(this.tzInput, TIMEZONES[this.model.tzTo]?.tz); },

      /** Zeilen der Weltzeituhr zum Zeitpunkt des Takts. */
      get worldClock() {
        const now = new Date(this.state.now);
        return TZ_WORLD_CLOCK_INDICES.map((i) => {
          const z = TIMEZONES[i];
          return {
            idx: i, tz: this.t(z.labelKey), abbr: tzAbbr(z.tz, now),
            date: zoneDate(now, z.tz, lang()), time: zoneTime(now, z.tz, lang(), true),
          };
        });
      },

      /**
       * id eines Elements, eindeutig je Instanz.
       * @param {string} name @returns {string}
       */
      fieldId(name) { return `unit-converter-${name}-${ctx.instanceId}`; },

      /** Die Weltzeituhr tickt je Sekunde; `new Date()` statt `Date.now()`, damit eine gestellte Uhr greift. */
      init() {
        this.state.now = new Date().getTime();
        clock = setInterval(() => { this.state.now = new Date().getTime(); }, CLOCK_TICK_MS);
      },

      /** Den Sekundentakt beenden. */
      destroy() {
        if (clock !== null) clearInterval(clock);
        clock = null;
      },
    };
  },
});
