/**
 * D.Mike — Unit Converter Module (unit-converter.js)
 * Data phase: converts units across 18 categories + timezone converter.
 *
 * Architecture: createModule + Alpine (CSP). Business logic & state live in
 * unit-converter-model.js; this file holds only view-logic (data-Fn).
 */

import { createModule } from '../../core/template-module.js';
import { CATEGORIES, TIMEZONES, TZ_WORLD_CLOCK_INDICES } from './unit-data.js';
import { State, formatNumber } from './unit-converter-model.js';

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
      // Raw data for x-for iteration in the template.
      categories: CATEGORIES,
      timezones: TIMEZONES,

      // Live clock tick (transient, drives world-clock rerender).
      now: Date.now(),
      _clock: null,

      init() {
        if (!this.model.tzDate) {
          this.model.tzDate = new Date().toISOString().slice(0, 10);
        }
        this._clock = setInterval(() => { this.now = Date.now(); }, 1000);
      },

      destroy() {
        if (this._clock) clearInterval(this._clock);
        this._clock = null;
      },

      // ── Categories ────────────────────────────────────────
      catLabel: (catKey) => `${CATEGORIES[catKey]?.icon || ''  } ${  _t(CATEGORIES[catKey]?.nameKey || '')}`,
      catName: (catKey) => _t(CATEGORIES[catKey]?.nameKey || ''),
      catIcon: (catKey) => CATEGORIES[catKey]?.icon || '',
      catActiveClass(catKey) {
        return this.model.activeCat === catKey ? 'module-unit-converter__cat-btn--active' : '';
      },

      // ── Units ─────────────────────────────────────────────
      unitLabel(unitKey) {
        const u = this.model.cat.units[unitKey];
        return u ? _t(`unit_${  u.nameKey}`) : '';
      },
      /** Optgroup structure for the from-select (empty when category has no groups). */
      fromGroups() {
        const cat = this.model.cat;
        if (!cat.groups) return [];
        return Object.entries(cat.groups).map(([key, members]) => ({
          key, members, label: _t(`labGroup_${  key}`),
        }));
      },
      /** Flat unit-key list for the from-select (empty when category has groups). */
      fromFlatUnits() {
        const cat = this.model.cat;
        return cat.groups ? [] : Object.keys(cat.units);
      },
      toUnitKeys() {
        return this.model.toUnitKeys();
      },
      onFromChange() {
        this.model.ensureToCompatible(this.model.toUnit);
      },

      // ── Conversion display ────────────────────────────────
      fmt: (n) => formatNumber(n),
      fmtResult: (n) => (n === null ? '—' : formatNumber(n)),
      resultText() {
        const num = this.model.parsedInput();
        if (isNaN(num)) return '—';
        const r = this.model.result();
        return r === null ? _t('undefined') : formatNumber(r);
      },
      formulaText() {
        const num = this.model.parsedInput();
        if (isNaN(num)) return '—';
        const v = this.model.formulaValue();
        const from = this.model.fromUnit;
        const to = this.model.toUnit;
        if (v === null) return `${_t('logConversion')  } (${  from  } → ${  to  })`;
        return `1 ${  from  } = ${  formatNumber(v)  } ${  to}`;
      },
      refRows() {
        return this.model.refRows();
      },

      // ── Category / swap handlers ──────────────────────────
      selectCategory(catKey) {
        this.model.selectCategory(catKey);
      },
      swapUnits() {
        const from = this.model.fromUnit;
        const to = this.model.toUnit;
        this.model.fromUnit = to;
        this.model.ensureToCompatible(from);
      },

      // ── Timezone ──────────────────────────────────────────
      tzLabel: (z) => _t(z.labelKey),
      tzNowLabel: () => `⏱ ${  _t('now')}`,

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

      tzResultText() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return '—';
        const time = new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(ctx.utc);
        return time + (isDe() ? ' Uhr' : '');
      },
      tzResultDateText() {
        const ctx = this._utcFromInput();
        const toTz = TIMEZONES[this.model.tzTo]?.tz;
        if (!ctx || !toTz) return '';
        return new Intl.DateTimeFormat(lang(), {
          timeZone: toTz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(ctx.utc);
      },
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

      swapTimezones() {
        const tmp = this.model.tzFrom;
        this.model.tzFrom = this.model.tzTo;
        this.model.tzTo = tmp;
      },
      tzSetNow() {
        const fromTz = TIMEZONES[this.model.tzFrom]?.tz;
        if (!fromTz) return;
        const p = {};
        new Intl.DateTimeFormat('en-CA', {
          timeZone: fromTz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
        this.model.tzTime = `${p.hour}:${p.minute}`;
        this.model.tzDate = `${p.year}-${p.month}-${p.day}`;
      },

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
