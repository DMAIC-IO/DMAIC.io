/**
 * D.Mike — Unit Converter Module (unit-converter.js)
 * Data phase: converts units across 19 categories + timezone converter.
 *
 * Architecture: createModule + Alpine (CSP). Business logic & state live in
 * unit-converter-model.js; this file holds only view-logic (data-Fn).
 *
 * @agent  Vollständig über das Viewmodel steuerbar: die Größenart, beide
 *   Einheiten, der umzurechnende Wert sowie Zeitzonen, Uhrzeit und Datum der
 *   Zeitzonenumrechnung. Die Oberfläche behält nur die Anzeige — die
 *   Ergebnisse, die Schnellübersicht und die Weltzeituhr sind gerechnet und
 *   stehen in keinem Feld.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireText } from '../../core/agent/agent-argcheck.js';
import { CATEGORIES, TIMEZONES, TZ_WORLD_CLOCK_INDICES } from './unit-data.js';
import { State, formatNumber, formatTzDiff, parseGmtOffset } from './unit-converter-model.js';

/** Die Schlüssel der Größenarten — die Wertemenge von `selectCategory`. */
const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Die Positionen der Zeitzonenliste. `requireIndex` passt nicht: es lässt
// `value === length` als „ans Ende einfügen" zu, und eine Position hinter der
// letzten Zeitzone gibt es nicht — die Meldung „allowed: 0..23" wäre unwahr.
const TZ_INDICES = TIMEZONES.map((_z, i) => i);

/** "HH:MM" mit Stunde 0..23 und Minute 0..59 — die Form des Zeitfelds. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "YYYY-MM-DD" — die Form des Datumsfelds. */
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Ein Datum als YYYY-MM-DD, das es im Kalender WIRKLICH gibt. Das Muster
 * allein ließe den 30. Februar durch; das Datumsfeld der Oberfläche erzeugt
 * ihn nie, die Umrechnung schöbe ihn still auf den 2. März.
 * @param {string} s
 * @returns {boolean}
 */
function isCalendarDate(s) {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ── Pure view helpers (Intl, no state) ───────────────────────

function getTzAbbr(tzName, date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, timeZoneName: 'short',
    }).formatToParts(date || new Date());
    const p = parts.find(x => x.type === 'timeZoneName');
    return p ? p.value : '';
  } catch { return ''; }
}

function getTzOffset(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const p = parts.find(x => x.type === 'timeZoneName');
  return p ? parseGmtOffset(p.value) : 0;
}

/**
 * @typedef {object} ConversionResult
 * @property {number|null} value  das umgerechnete Ergebnis als Zahl, ungerundet; leer, wenn keine Zahl eingegeben oder die Umrechnung undefiniert ist
 * @property {string} text  das Ergebnis, wie die Seite es zeigt (gerundet, mit Dezimalkomma bzw. -punkt); ein Strich ohne Eingabe, „undefiniert“ bei undefinierter Umrechnung
 * @property {string} formula  die Umrechnungsformel, wie die Seite sie zeigt, z. B. „1 bar = 100000 Pa“; ein Strich ohne Eingabe
 */

/**
 * @typedef {object} TimezoneResult
 * @property {string} text  die umgerechnete Uhrzeit in der Zielzeitzone, wie die Seite sie zeigt; ein Strich, solange Zeit oder Datum fehlen
 * @property {string} dateText  das Datum der umgerechneten Uhrzeit mit Wochentag, wie die Seite es zeigt; leer, solange Zeit oder Datum fehlen
 * @property {number|null} diffHours  der Zeitunterschied der Zielzeitzone zur Ausgangszeitzone in Stunden (positiv = Ziel liegt später, Bruchteile bei halben Stunden); leer, solange Zeit oder Datum fehlen
 */

/**
 * @typedef {object} AgentRead
 * @property {string} activeCat  key of the active quantity category
 * @property {string} fromUnit  key of the unit converted from
 * @property {string} toUnit  key of the unit converted to
 * @property {string} inputVal  the entered value as text
 * @property {number} tzFrom  position of the source time zone in the zone list
 * @property {number} tzTo  position of the target time zone in the zone list
 * @property {string} tzTime  the conversion time as HH:MM, empty if unset
 * @property {string} tzDate  the conversion date as YYYY-MM-DD, empty if unset
 * @property {string[]} unitKeys  the unit keys `setFromUnit` accepts in the active category
 * @property {string[]} toUnitKeys  the unit keys `setToUnit` accepts for the current source unit
 * @property {ConversionResult} result  das umgerechnete Ergebnis der Einheitenumrechnung
 * @property {TimezoneResult} timezone  das Ergebnis der Zeitzonenumrechnung
 */
export default createModule({
  config: {
    id: 'unit-converter',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.unit-converter',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    const lang = () => (module._context?.language === 'en' ? 'en-GB' : 'de-DE');
    const isDe = () => module._context?.language !== 'en';

    return {
      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Einstellungen und die wählbaren Einheiten
       */
      read(options) {
        // eslint-disable-next-line no-unused-vars -- diffText gehört nur zur Anzeige
        const { diffText, ...timezone } = this.tzComparison();
        return readAgentState('unit-converter', {
          ...this.model.toJSON(),
          unitKeys: Object.keys(this.model.unitKeys()),
          toUnitKeys: this.model.toUnitKeys(),
          result: this.conversion(),
          timezone,
        }, options);
      },

      // Raw data for x-for iteration in the template.
      categories: CATEGORIES,
      timezones: TIMEZONES,

      // Live clock tick (transient, drives world-clock rerender).
      now: Date.now(),
      _clock: null,

      /** @noagent lifecycle, kein Zustandsweg. */
      init() {
        // Das Datum läuft über den Setzer, damit `tzDate` genau eine
        // Zuweisungsstelle hat.
        if (!this.model.tzDate) {
          this.setTzDate(new Date().toISOString().slice(0, 10));
        }
        this._clock = setInterval(() => { this.now = Date.now(); }, 1000);
      },

      /** @noagent lifecycle, kein Zustandsweg. */
      destroy() {
        if (this._clock) clearInterval(this._clock);
        this._clock = null;
      },

      // ── Categories ────────────────────────────────────────
      /** @noagent view transform: die übersetzte Bezeichnung der Größenart. */
      catName: (catKey) => _t(CATEGORIES[catKey]?.nameKey || ''),
      /** @noagent view transform: der Symbolname der Größenart. */
      catIcon: (catKey) => CATEGORIES[catKey]?.icon || '',
      /** @noagent view transform: hebt die aktive Größenart hervor. */
      catActiveClass(catKey) {
        return this.model.activeCat === catKey ? 'module-unit-converter__cat-btn--active' : '';
      },

      // ── Units ─────────────────────────────────────────────
      /** @noagent view transform: die übersetzte Bezeichnung einer Einheit. */
      unitLabel(unitKey) {
        const u = this.model.cat.units[unitKey];
        return u ? _t(`unit_${  u.nameKey}`) : '';
      },
      /**
       * @noagent view transform: die Gruppen der Ausgangsauswahl (leer, wenn
       * die Größenart keine Gruppen hat).
       */
      fromGroups() {
        const cat = this.model.cat;
        if (!cat.groups) return [];
        return Object.entries(cat.groups).map(([key, members]) => ({
          key, members, label: _t(`labGroup_${  key}`),
        }));
      },
      /**
       * @noagent view transform: die flache Einheitenliste der
       * Ausgangsauswahl (leer, wenn die Größenart Gruppen hat).
       */
      fromFlatUnits() {
        const cat = this.model.cat;
        return cat.groups ? [] : Object.keys(cat.units);
      },
      /** @noagent view transform: die mit der Ausgangseinheit verträglichen Zieleinheiten. */
      toUnitKeys() {
        return this.model.toUnitKeys();
      },
      /**
       * @noagent Reaktion der Oberfläche auf die Einheitenauswahl. Das
       * Auswahlfeld hat `fromUnit` selbst schon geschrieben; der Aufruf
       * geht trotzdem durch die Senke, damit `toUnit` genau eine
       * Zuweisungsstelle hat und die in einer `@agent`-Methode liegt
       * (Ruling 56). Die Zuweisung an `fromUnit` ist dabei folgenlos, und
       * werfen kann es nicht: das Feld bietet nur Einheiten der aktiven
       * Größenart an.
       */
      onFromChange() {
        this.setFromUnit(this.model.fromUnit);
      },

      // ── Conversion display ────────────────────────────────
      /** @noagent view transform: eine Zahl in Anzeigeform. */
      fmt: (n) => formatNumber(n),
      /** @noagent view transform: eine Zahl oder der Gedankenstrich für „kein Wert". */
      fmtResult: (n) => (n === null ? '—' : formatNumber(n)),
      /**
       * @noagent view transform: die Umrechnung als Zahl und in Anzeigeform;
       * Anzeige und Lesefläche stammen aus dieser einen Rechnung.
       * @returns {ConversionResult}
       */
      conversion() {
        const num = this.model.parsedInput();
        if (isNaN(num)) return { value: null, text: '—', formula: '—' };
        const r = this.model.result();
        const v = this.model.formulaValue();
        const from = this.model.fromUnit;
        const to = this.model.toUnit;
        return {
          value: r,
          text: r === null ? _t('undefined') : formatNumber(r),
          formula: v === null
            ? `${_t('logConversion')  } (${  from  } → ${  to  })`
            : `1 ${  from  } = ${  formatNumber(v)  } ${  to}`,
        };
      },
      /** @noagent view transform: das umgerechnete Ergebnis in Anzeigeform. */
      resultText() {
        return this.conversion().text;
      },
      /** @noagent view transform: die Umrechnungsformel in Anzeigeform. */
      formulaText() {
        return this.conversion().formula;
      },
      /** @noagent view transform: die Zeilen der Schnellübersicht. */
      refRows() {
        return this.model.refRows();
      },

      // ── Category / swap handlers ──────────────────────────
      /**
       * Wechselt die Größenart und stellt beide Einheiten auf deren Vorgaben.
       * @agent
       * @param {string} catKey der Schlüssel der Größenart. Jeder andere
       *   Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn keine Größenart diesen Schlüssel trägt
       */
      selectCategory(catKey) {
        requireEnum('catKey', catKey, CATEGORY_KEYS);
        this.model.selectCategory(catKey);
      },
      /**
       * Setzt die Einheit, aus der umgerechnet wird, und zieht die
       * Zieleinheit nach, wenn sie dazu nicht mehr passt.
       * @agent
       * @param {string} unitKey der Schlüssel einer Einheit der aktiven
       *   Größenart. Eine Einheit einer anderen Größenart ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn die aktive Größenart diese Einheit nicht führt
       */
      setFromUnit(unitKey) {
        requireEnum('unitKey', unitKey, Object.keys(this.model.unitKeys()));
        this.model.fromUnit = unitKey;
        this.model.ensureToCompatible(this.model.toUnit);
      },
      /**
       * Setzt die Einheit, in die umgerechnet wird.
       * @agent
       * @param {string} unitKey der Schlüssel einer Einheit, die zur
       *   Ausgangseinheit passt. Jede andere Einheit ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn die Einheit nicht zur Ausgangseinheit passt
       */
      setToUnit(unitKey) {
        // Geprüft wird gegen die VERTRÄGLICHEN Einheiten, nicht gegen alle
        // der Größenart: genau diese bietet die Zielauswahl an, und bei den
        // Laborwerten liegen die unverträglichen in anderen Gruppen.
        requireEnum('unitKey', unitKey, this.model.toUnitKeys());
        this.model.toUnit = unitKey;
      },
      /**
       * Setzt den Wert, der umgerechnet wird.
       * @agent
       * @param {string} text der Wert als Text; ein Komma gilt als
       *   Dezimaltrennzeichen, der leere Text löscht die Eingabe. Ein Text,
       *   der keine Zahl ergibt, ergibt kein Ergebnis — ein Fehler ist er
       *   nicht.
       * @returns {void}
       * @throws {Error} wenn `text` keine Zeichenkette ist
       */
      setInputValue(text) {
        // Jeder Text ist zulässig: das Eingabefeld der Oberfläche ist ein
        // freies Textfeld, und `parsedInput()` behandelt alles, was keine
        // Zahl ergibt, als „kein Ergebnis".
        this.model.inputVal = requireText('text', text);
      },
      /**
       * Tauscht Ausgangs- und Zieleinheit.
       * @agent
       * @returns {void}
       */
      swapUnits() {
        const from = this.model.fromUnit;
        const to = this.model.toUnit;
        this.setFromUnit(to);
        this.model.ensureToCompatible(from);
      },

      // ── Timezone ──────────────────────────────────────────
      /** @noagent view transform: die übersetzte Bezeichnung einer Zeitzone. */
      tzLabel: (z) => _t(z.labelKey),
      /** @noagent view transform: die Beschriftung der Jetzt-Taste. */
      tzNowLabel: () => _t('now'),

      _utcFromInput() {
        const fromTz = TIMEZONES[this.model.tzFrom]?.tz;
        const timeStr = this.model.tzTime;
        const dateStr = this.model.tzDate;
        if (!fromTz || !timeStr || !dateStr) return null;
        const tempDate = new Date(`${dateStr}T${timeStr}:00Z`);
        if (isNaN(tempDate.getTime())) return null;
        const fromOffset = getTzOffset(fromTz, tempDate);
        return { utc: new Date(tempDate.getTime() - fromOffset * 60000), fromOffset, fromTz };
      },

      /**
       * @noagent view transform: der Zeitzonenvergleich als Zahl und in
       * Anzeigeform; Anzeige und Lesefläche stammen aus dieser einen Rechnung.
       * @returns {TimezoneResult & {diffText: string}}
       */
      tzComparison() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return { text: '—', dateText: '', diffHours: null, diffText: '—' };
        const time = new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(ctx.utc);
        const dateText = new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(ctx.utc);
        const toOffset = getTzOffset(toTz, ctx.utc);
        const diff = toOffset - ctx.fromOffset;
        return {
          text: time + (isDe() ? ' Uhr' : ''),
          dateText,
          diffHours: diff / 60,
          diffText: `${formatTzDiff(diff)} (${getTzAbbr(ctx.fromTz, ctx.utc)} → ${getTzAbbr(toTz, ctx.utc)})`,
        };
      },
      /** @noagent view transform: die umgerechnete Uhrzeit in Anzeigeform. */
      tzResultText() {
        return this.tzComparison().text;
      },
      /** @noagent view transform: das Datum der umgerechneten Uhrzeit. */
      tzResultDateText() {
        return this.tzComparison().dateText;
      },
      /** @noagent view transform: der Zeitunterschied beider Zeitzonen. */
      tzDiffText() {
        return this.tzComparison().diffText;
      },

      /**
       * Setzt die Ausgangszeitzone.
       * @agent
       * @param {number} index die Position der Zeitzone in der
       *   Zeitzonenliste, von 0 an. Jeder andere Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `index` keine Position der Zeitzonenliste ist
       */
      setTzFrom(index) {
        requireEnum('index', index, TZ_INDICES);
        this.model.tzFrom = index;
      },
      /**
       * Setzt die Zielzeitzone.
       * @agent
       * @param {number} index die Position der Zeitzone in der
       *   Zeitzonenliste, von 0 an. Jeder andere Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `index` keine Position der Zeitzonenliste ist
       */
      setTzTo(index) {
        requireEnum('index', index, TZ_INDICES);
        this.model.tzTo = index;
      },
      /**
       * Setzt die Uhrzeit, die umgerechnet wird.
       * @agent
       * @param {string} hhmm die Uhrzeit als HH:MM von 00:00 bis 23:59; der
       *   leere Text löscht sie. Jeder andere Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `hhmm` weder leer noch eine Uhrzeit als HH:MM ist
       */
      setTzTime(hhmm) {
        requireText('hhmm', hhmm);
        if (hhmm !== '' && !TIME_RE.test(hhmm)) {
          throw new Error(`invalid hhmm ${JSON.stringify(hhmm)}; `
            + 'allowed: HH:MM from 00:00 to 23:59, or "" to clear it');
        }
        this.model.tzTime = hhmm;
      },
      /**
       * Setzt das Datum, zu dem umgerechnet wird.
       * @agent
       * @param {string} isoDate das Datum als YYYY-MM-DD; der leere Text
       *   löscht es. Jeder andere Wert ist ein Fehler.
       * @returns {void}
       * @throws {Error} wenn `isoDate` weder leer noch ein Datum als
       *   YYYY-MM-DD ist
       */
      setTzDate(isoDate) {
        requireText('isoDate', isoDate);
        if (isoDate !== '' && !isCalendarDate(isoDate)) {
          throw new Error(`invalid isoDate ${JSON.stringify(isoDate)}; `
            + 'allowed: YYYY-MM-DD, or "" to clear it');
        }
        this.model.tzDate = isoDate;
      },
      /**
       * Tauscht Ausgangs- und Zielzeitzone.
       * @agent
       * @returns {void}
       */
      swapTimezones() {
        const tmp = this.model.tzFrom;
        this.setTzFrom(this.model.tzTo);
        this.setTzTo(tmp);
      },
      /**
       * Setzt Uhrzeit und Datum auf das Jetzt der Ausgangszeitzone.
       * @agent
       * @returns {boolean} false, wenn die Ausgangszeitzone unbekannt ist und
       *   nichts gesetzt wurde
       */
      tzSetNow() {
        const fromTz = TIMEZONES[this.model.tzFrom]?.tz;
        if (!fromTz) return false;
        const p = {};
        new Intl.DateTimeFormat('en-CA', {
          timeZone: fromTz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
        // `hour12: false` liefert Mitternacht in manchen Umgebungen als
        // Stunde 24. Das Zeitfeld der Oberfläche kennt nur 00 bis 23, und
        // `setTzTime` wiese 24:00 zu Recht ab — also hier normalisieren.
        const hour = p.hour === '24' ? '00' : p.hour;
        this.setTzTime(`${hour}:${p.minute}`);
        this.setTzDate(`${p.year}-${p.month}-${p.day}`);
        return true;
      },

      /** @noagent view transform: die Zeilen der Weltzeituhr. */
      worldClock() {
        const now = new Date(this.now);
        const l = lang();
        return TZ_WORLD_CLOCK_INDICES.map(i => {
          const z = TIMEZONES[i];
          const time = new Intl.DateTimeFormat(l, {
            timeZone: z.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
          }).format(now);
          const date = new Intl.DateTimeFormat(l, {
            timeZone: z.tz, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
          }).format(now);
          return { idx: i, tz: _t(z.labelKey), abbr: getTzAbbr(z.tz, now), date, time };
        });
      },
    };
  },
});
