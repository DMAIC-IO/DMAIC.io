/**
 * D.Mike — Unit Converter Module (unit-converter.js)
 * Data phase: converts units across 18 categories + timezone converter.
 */

import { CATEGORIES, TIMEZONES, TZ_WORLD_CLOCK_INDICES } from './unit-data.js';

// ── Helpers ──────────────────────────────────────────────────

/** @param {number} n */
function formatNumber(n) {
  if (!isFinite(n) || isNaN(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || (abs < 1e-6 && abs > 0)) return n.toExponential(6);
  if (abs >= 1e6) return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (abs >= 1) return parseFloat(n.toPrecision(10)).toLocaleString('de-DE', { maximumFractionDigits: 6 });
  return parseFloat(n.toPrecision(8)).toString().replace('.', ',');
}

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

// ── Group helpers (for lab values) ───────────────────────────

function getGroupMembers(cat, unitKey) {
  if (!cat.groups) return Object.keys(cat.units);
  for (const members of Object.values(cat.groups)) {
    if (members.includes(unitKey)) return members;
  }
  return Object.keys(cat.units);
}

// ═══════════════════════════════════════════════════════════════
// Module export
// ═══════════════════════════════════════════════════════════════

export default {
  id: 'unit-converter',
  phase: 'data',
  icon: 'ruler',
  i18nKey: 'modules.unit-converter',
  version: '1.0.0',

  _container: null,
  _context: null,
  _activeCat: 'laenge',
  _tzClockInterval: null,

  // DOM refs
  _els: {},

  /** @param {string} key */
  _t(key) {
    return this._context.i18n.t(`modules.unit-converter.${key}`);
  },

  // ── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('unit-converter-css')) {
      const link = document.createElement('link');
      link.id = 'unit-converter-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/unit-converter/unit-converter.css';
      document.head.appendChild(link);
    }

    this._render();
    this._bindEvents();
  },

  async destroy() {
    if (this._tzClockInterval) clearInterval(this._tzClockInterval);
    this._container.innerHTML = '';
    this._els = {};
  },

  onLanguageChange() {
    const state = this._captureState();
    this._render();
    this._bindEvents();
    this._restoreState(state);
  },

  onThemeChange() {},

  getState() { return this._captureState(); },

  setState(data) {
    if (!data) return;
    this._activeCat = data.activeCat || 'laenge';
    this._render();
    this._bindEvents();
    this._restoreState(data);
  },

  help: () => import('./unit-converter-help.js'),

  // ── State capture/restore ──────────────────────────────────

  _captureState() {
    return {
      activeCat: this._activeCat,
      fromUnit: this._els.fromUnit?.value || '',
      toUnit: this._els.toUnit?.value || '',
      inputVal: this._els.inputVal?.value || '',
      tzFrom: this._els.tzFrom?.value || '1',
      tzTo: this._els.tzTo?.value || '0',
      tzTime: this._els.tzTime?.value || '12:00',
      tzDate: this._els.tzDate?.value || '',
    };
  },

  _restoreState(data) {
    if (!data) return;
    if (data.fromUnit && this._els.fromUnit) this._els.fromUnit.value = data.fromUnit;
    if (data.fromUnit && this._els.toUnit) {
      this._updateToSelect(data.toUnit);
    }
    if (data.inputVal && this._els.inputVal) this._els.inputVal.value = data.inputVal;
    if (data.tzFrom && this._els.tzFrom) this._els.tzFrom.value = data.tzFrom;
    if (data.tzTo && this._els.tzTo) this._els.tzTo.value = data.tzTo;
    if (data.tzTime && this._els.tzTime) this._els.tzTime.value = data.tzTime;
    if (data.tzDate && this._els.tzDate) this._els.tzDate.value = data.tzDate;
    this._convert();
    this._convertTimezone();
    this._renderRefTable();
  },

  // ── Rendering ──────────────────────────────────────────────

  _render() {
    const t = (k) => this._t(k);
    const svgArrow = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    const svgSwap = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>';

    this._container.innerHTML = `
      <div class="module-unit-converter">
        <div class="module-unit-converter__categories" data-ref="categories"></div>

        <div class="module-unit-converter__panel">
          <div class="module-unit-converter__panel-header">
            <div class="module-unit-converter__panel-title">
              <span data-ref="catIcon"></span> <span data-ref="catTitle"></span>
            </div>
            <button class="module-unit-converter__swap-btn" data-action="swap">
              ${svgSwap} ${t('swap')}
            </button>
          </div>
          <div class="module-unit-converter__panel-body">
            <div class="module-unit-converter__fields">
              <div>
                <label class="module-unit-converter__field-label">${t('from')}</label>
                <select class="field" data-ref="fromUnit"></select>
                <input class="module-unit-converter__input" data-ref="inputVal" type="text" inputmode="decimal" placeholder="0" autocomplete="off">
              </div>
              <div class="module-unit-converter__arrow">${svgArrow}</div>
              <div>
                <label class="module-unit-converter__field-label">${t('to')}</label>
                <select class="field" data-ref="toUnit"></select>
                <div class="module-unit-converter__result" data-ref="resultVal">—</div>
              </div>
            </div>
            <div class="module-unit-converter__formula">
              <span class="module-unit-converter__formula-label">${t('formula')}</span>
              <span data-ref="formulaText">—</span>
            </div>
          </div>
        </div>

        <div class="module-unit-converter__ref-section">
          <div class="module-unit-converter__ref-title">${t('quickRef')}</div>
          <table class="module-unit-converter__ref-table">
            <thead><tr>
              <th>${t('refValue')}</th><th>${t('refFrom')}</th>
              <th>${t('refResult')}</th><th>${t('refTo')}</th>
            </tr></thead>
            <tbody data-ref="refBody"></tbody>
          </table>
        </div>

        <!-- Timezone -->
        <div class="module-unit-converter__tz-panel">
          <div class="module-unit-converter__panel">
            <div class="module-unit-converter__panel-header">
              <div class="module-unit-converter__panel-title">🌐 ${t('timezone')}</div>
              <button class="module-unit-converter__swap-btn" data-action="tz-swap">
                ${svgSwap} ${t('swap')}
              </button>
            </div>
            <div class="module-unit-converter__panel-body">
              <div class="module-unit-converter__fields">
                <div>
                  <label class="module-unit-converter__field-label">${t('fromTimezone')}</label>
                  <select class="field" data-ref="tzFrom"></select>
                  <div class="module-unit-converter__tz-input-row">
                    <input class="module-unit-converter__tz-time" data-ref="tzTime" type="time" value="12:00" step="60">
                    <input class="module-unit-converter__tz-date" data-ref="tzDate" type="date">
                  </div>
                </div>
                <div class="module-unit-converter__arrow">${svgArrow}</div>
                <div>
                  <label class="module-unit-converter__field-label">${t('toTimezone')}</label>
                  <select class="field" data-ref="tzTo"></select>
                  <div class="module-unit-converter__tz-result" data-ref="tzResult">—</div>
                  <div class="module-unit-converter__tz-result-date" data-ref="tzResultDate"></div>
                </div>
              </div>
              <div class="module-unit-converter__formula">
                <span class="module-unit-converter__formula-label">${t('difference')}</span>
                <span data-ref="tzDiff">—</span>
              </div>
              <button class="module-unit-converter__tz-now-btn" data-action="tz-now">⏱ ${t('now')}</button>
            </div>
          </div>

          <div class="module-unit-converter__ref-section">
            <div class="module-unit-converter__ref-title">${t('worldClock')}</div>
            <table class="module-unit-converter__ref-table">
              <thead><tr>
                <th>${t('tzTimezone')}</th><th>${t('tzAbbr')}</th>
                <th>${t('tzDate')}</th><th>${t('tzTime')}</th>
              </tr></thead>
              <tbody data-ref="tzRefBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Cache DOM refs
    this._els = {};
    this._container.querySelectorAll('[data-ref]').forEach(el => {
      this._els[el.dataset.ref] = el;
    });

    this._renderCategories();
    this._renderUnits();
    this._convert();
    this._renderRefTable();
    this._renderTimezoneSelects();
    this._setTzToday();
    this._convertTimezone();
    this._renderTzWorldClock();

    if (this._tzClockInterval) clearInterval(this._tzClockInterval);
    this._tzClockInterval = setInterval(() => this._renderTzWorldClock(), 1000);
  },

  // ── Categories ─────────────────────────────────────────────

  _renderCategories() {
    const wrap = this._els.categories;
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const btn = document.createElement('button');
      btn.className = 'module-unit-converter__cat-btn' +
        (key === this._activeCat ? ' module-unit-converter__cat-btn--active' : '');
      btn.textContent = cat.icon + ' ' + this._t(cat.nameKey);
      btn.dataset.cat = key;
      wrap.appendChild(btn);
    }
  },

  // ── Unit Selects ───────────────────────────────────────────

  _renderUnits() {
    const cat = CATEGORIES[this._activeCat];
    if (this._els.catTitle) this._els.catTitle.textContent = this._t(cat.nameKey);
    if (this._els.catIcon) this._els.catIcon.textContent = cat.icon;

    const keys = Object.keys(cat.units);
    const $from = this._els.fromUnit;
    if (!$from) return;

    $from.innerHTML = '';
    if (cat.groups) {
      for (const [groupKey, members] of Object.entries(cat.groups)) {
        const og = document.createElement('optgroup');
        og.label = this._t('labGroup_' + groupKey);
        members.forEach(k => {
          const o = document.createElement('option');
          o.value = k;
          o.textContent = this._t('unit_' + cat.units[k].nameKey);
          og.appendChild(o);
        });
        $from.appendChild(og);
      }
    } else {
      keys.forEach(k => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = this._t('unit_' + cat.units[k].nameKey);
        $from.appendChild(o);
      });
    }
    $from.value = keys[0];
    this._updateToSelect();
  },

  _updateToSelect(preferredTo) {
    const cat = CATEGORIES[this._activeCat];
    const fromKey = this._els.fromUnit?.value;
    if (!fromKey) return;
    const compatible = getGroupMembers(cat, fromKey);

    const $to = this._els.toUnit;
    if (!$to) return;
    $to.innerHTML = '';
    compatible.forEach(k => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = this._t('unit_' + cat.units[k].nameKey);
      $to.appendChild(o);
    });

    if (preferredTo && compatible.includes(preferredTo) && preferredTo !== fromKey) {
      $to.value = preferredTo;
    } else {
      const fallback = compatible.find(k => k !== fromKey);
      $to.value = fallback || compatible[0];
    }
  },

  // ── Conversion ─────────────────────────────────────────────

  _convert() {
    const cat = CATEGORIES[this._activeCat];
    const raw = (this._els.inputVal?.value || '').replace(',', '.');
    const num = parseFloat(raw);

    if (raw === '' || isNaN(num)) {
      if (this._els.resultVal) this._els.resultVal.textContent = '—';
      if (this._els.formulaText) this._els.formulaText.textContent = '—';
      return;
    }

    const from = this._els.fromUnit?.value;
    const to = this._els.toUnit?.value;
    if (!from || !to) return;

    const baseVal = cat.units[from].toBase(num);
    const result = cat.units[to].fromBase(baseVal);

    if (!isFinite(result) || isNaN(result)) {
      if (this._els.resultVal) this._els.resultVal.textContent = this._t('undefined');
      if (this._els.formulaText) this._els.formulaText.textContent = '—';
      return;
    }

    if (this._els.resultVal) this._els.resultVal.textContent = formatNumber(result);

    const formulaVal = cat.units[to].fromBase(cat.units[from].toBase(1));
    if (this._els.formulaText) {
      this._els.formulaText.textContent = isFinite(formulaVal)
        ? `1 ${from} = ${formatNumber(formulaVal)} ${to}`
        : `${this._t('logConversion')} (${from} → ${to})`;
    }
  },

  // ── Ref Table ──────────────────────────────────────────────

  _renderRefTable() {
    const cat = CATEGORIES[this._activeCat];
    const tbody = this._els.refBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    (cat.refs || []).forEach(([val, from, to]) => {
      const baseVal = cat.units[from].toBase(val);
      const result = cat.units[to].fromBase(baseVal);
      const display = isFinite(result) ? formatNumber(result) : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${formatNumber(val)}</td><td>${from}</td><td class="module-unit-converter__ref-val">${display}</td><td>${to}</td>`;
      tbody.appendChild(tr);
    });
  },

  // ── Timezone ───────────────────────────────────────────────

  _renderTimezoneSelects() {
    const $from = this._els.tzFrom;
    const $to = this._els.tzTo;
    if (!$from || !$to) return;

    $from.innerHTML = '';
    $to.innerHTML = '';
    TIMEZONES.forEach((z, i) => {
      const label = this._t(z.labelKey);
      const o1 = document.createElement('option');
      o1.value = i; o1.textContent = label;
      $from.appendChild(o1);
      const o2 = document.createElement('option');
      o2.value = i; o2.textContent = label;
      $to.appendChild(o2);
    });
    $from.value = 1; // Berlin
    $to.value = 0;   // UTC
  },

  _setTzToday() {
    if (!this._els.tzDate) return;
    this._els.tzDate.value = new Date().toISOString().slice(0, 10);
  },

  _convertTimezone() {
    const fromTz = TIMEZONES[this._els.tzFrom?.value]?.tz;
    const toTz = TIMEZONES[this._els.tzTo?.value]?.tz;
    const timeStr = this._els.tzTime?.value;
    const dateStr = this._els.tzDate?.value;

    if (!fromTz || !toTz || !timeStr || !dateStr) {
      if (this._els.tzResult) this._els.tzResult.textContent = '—';
      if (this._els.tzDiff) this._els.tzDiff.textContent = '—';
      return;
    }

    const dtStr = `${dateStr}T${timeStr}:00`;
    const tempDate = new Date(dtStr + 'Z');
    const fromOffset = getTzOffset(fromTz, tempDate);
    const utcDate = new Date(tempDate.getTime() - fromOffset * 60000);

    const lang = this._context.language === 'en' ? 'en-GB' : 'de-DE';

    const fmtTime = new Intl.DateTimeFormat(lang, {
      timeZone: toTz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(utcDate);

    const fmtDate = new Intl.DateTimeFormat(lang, {
      timeZone: toTz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(utcDate);

    if (this._els.tzResult) this._els.tzResult.textContent = fmtTime + (this._context.language === 'de' ? ' Uhr' : '');
    if (this._els.tzResultDate) this._els.tzResultDate.textContent = fmtDate;

    const toOffset = getTzOffset(toTz, utcDate);
    const diff = toOffset - fromOffset;
    const sign = diff >= 0 ? '+' : '';
    const diffH = Math.trunc(diff / 60);
    const diffM = Math.abs(diff % 60);
    if (this._els.tzDiff) {
      this._els.tzDiff.textContent = `${sign}${diffH}h${diffM ? ` ${diffM}min` : ''} (${getTzAbbr(fromTz, utcDate)} → ${getTzAbbr(toTz, utcDate)})`;
    }
  },

  _renderTzWorldClock() {
    const tbody = this._els.tzRefBody;
    if (!tbody) return;
    const now = new Date();
    const lang = this._context.language === 'en' ? 'en-GB' : 'de-DE';
    tbody.innerHTML = '';

    TZ_WORLD_CLOCK_INDICES.forEach(i => {
      const z = TIMEZONES[i];
      const time = new Intl.DateTimeFormat(lang, {
        timeZone: z.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now);
      const date = new Intl.DateTimeFormat(lang, {
        timeZone: z.tz, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
      }).format(now);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${this._t(z.labelKey)}</td><td>${getTzAbbr(z.tz, now)}</td><td>${date}</td><td class="module-unit-converter__ref-val">${time}</td>`;
      tbody.appendChild(tr);
    });
  },

  _tzSetNow() {
    const now = new Date();
    const fromTz = TIMEZONES[this._els.tzFrom?.value]?.tz;
    if (!fromTz) return;
    const localTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: fromTz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const p = {};
    localTime.forEach(x => { p[x.type] = x.value; });
    if (this._els.tzTime) this._els.tzTime.value = `${p.hour}:${p.minute}`;
    if (this._els.tzDate) this._els.tzDate.value = `${p.year}-${p.month}-${p.day}`;
    this._convertTimezone();
  },

  // ── Event Binding ──────────────────────────────────────────

  _bindEvents() {
    const root = this._container.querySelector('.module-unit-converter');
    if (!root) return;

    // Category buttons
    root.addEventListener('click', (e) => {
      const catBtn = e.target.closest('[data-cat]');
      if (catBtn) {
        this._activeCat = catBtn.dataset.cat;
        this._renderCategories();
        this._renderUnits();
        this._convert();
        this._renderRefTable();
        return;
      }

      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'swap') {
        const tmp = this._els.fromUnit?.value;
        const tmpTo = this._els.toUnit?.value;
        if (this._els.fromUnit) this._els.fromUnit.value = tmpTo;
        this._updateToSelect(tmp);
        this._convert();
      } else if (action === 'tz-swap') {
        const tmp = this._els.tzFrom?.value;
        if (this._els.tzFrom) this._els.tzFrom.value = this._els.tzTo?.value;
        if (this._els.tzTo) this._els.tzTo.value = tmp;
        this._convertTimezone();
      } else if (action === 'tz-now') {
        this._tzSetNow();
      }
    });

    // Input events
    this._els.inputVal?.addEventListener('input', () => this._convert());
    this._els.fromUnit?.addEventListener('change', () => {
      this._updateToSelect(this._els.toUnit?.value);
      this._convert();
    });
    this._els.toUnit?.addEventListener('change', () => this._convert());

    // Timezone events
    this._els.tzTime?.addEventListener('input', () => this._convertTimezone());
    this._els.tzDate?.addEventListener('input', () => this._convertTimezone());
    this._els.tzFrom?.addEventListener('change', () => this._convertTimezone());
    this._els.tzTo?.addEventListener('change', () => this._convertTimezone());
  },
};
