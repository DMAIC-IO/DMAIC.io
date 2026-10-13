/**
 * D.Mike — Unit Converter Module (unit-converter.js)
 * Data phase: converts units across 18 categories + timezone converter.
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
import { agentReadMixin } from '../../core/agent/agent-read-mixin.js';
import { requireEnum } from '../../core/agent/agent-argcheck.js';
import { CATEGORIES, TIMEZONES, TZ_WORLD_CLOCK_INDICES } from './unit-data.js';
import { State, formatNumber } from './unit-converter-model.js';

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

/**
 * Ein Textargument prüfen, bevor es zum dokumentierten Leerwert wird
 * (Ruling 55): ein FEHLENDES Argument kommt als `undefined` an.
 * @param {string} name
 * @param {any} value
 * @returns {string} der geprüfte Text
 * @throws {Error} wenn `value` keine Zeichenkette ist
 */
function requireText(name, value) {
  if (typeof value !== 'string') {
    throw new Error(`invalid ${name} ${JSON.stringify(value)}; allowed: any string, "" clears it`);
  }
  return value;
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
  if (!p) return 0;
  const m = p.value.match(/GMT([+-]?\d+)?(?::(\d+))?/);
  if (!m) return 0;
  const hours = parseInt(m[1] || '0', 10);
  const mins = parseInt(m[2] || '0', 10);
  return hours * 60 + (hours < 0 ? -mins : mins);
}

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
      ...agentReadMixin(module),

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
       * @noagent Reaktion der Oberfläche auf die Einheitenauswahl: das
       * Auswahlfeld schreibt `fromUnit` selbst, hier wird nur die
       * Zieleinheit nachgezogen. Der Setzer `setFromUnit` tut dasselbe.
       */
      onFromChange() {
        this.model.ensureToCompatible(this.model.toUnit);
      },

      // ── Conversion display ────────────────────────────────
      /** @noagent view transform: eine Zahl in Anzeigeform. */
      fmt: (n) => formatNumber(n),
      /** @noagent view transform: eine Zahl oder der Gedankenstrich für „kein Wert". */
      fmtResult: (n) => (n === null ? '—' : formatNumber(n)),
      /** @noagent view transform: das umgerechnete Ergebnis in Anzeigeform. */
      resultText() {
        const num = this.model.parsedInput();
        if (isNaN(num)) return '—';
        const r = this.model.result();
        return r === null ? _t('undefined') : formatNumber(r);
      },
      /** @noagent view transform: die Umrechnungsformel in Anzeigeform. */
      formulaText() {
        const num = this.model.parsedInput();
        if (isNaN(num)) return '—';
        const v = this.model.formulaValue();
        const from = this.model.fromUnit;
        const to = this.model.toUnit;
        if (v === null) return `${_t('logConversion')  } (${  from  } → ${  to  })`;
        return `1 ${  from  } = ${  formatNumber(v)  } ${  to}`;
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

      /** @noagent view transform: die umgerechnete Uhrzeit in Anzeigeform. */
      tzResultText() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return '—';
        const time = new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(ctx.utc);
        return time + (isDe() ? ' Uhr' : '');
      },
      /** @noagent view transform: das Datum der umgerechneten Uhrzeit. */
      tzResultDateText() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return '';
        return new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(ctx.utc);
      },
      /** @noagent view transform: der Zeitunterschied beider Zeitzonen. */
      tzDiffText() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return '—';
        const toOffset = getTzOffset(toTz, ctx.utc);
        const diff = toOffset - ctx.fromOffset;
        const sign = diff >= 0 ? '+' : '';
        const diffH = Math.trunc(diff / 60);
        const diffM = Math.abs(diff % 60);
        return `${sign}${diffH}h${diffM ? ` ${diffM}min` : ''} (${getTzAbbr(ctx.fromTz, ctx.utc)} → ${getTzAbbr(toTz, ctx.utc)})`;
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
