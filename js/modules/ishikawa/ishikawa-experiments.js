/**
 * Ishikawa 6M — Experiments tab rendering & events.
 */

export const experimentsMethods = {
  _renderExperimentsTab(t) {
    const xs = this._experiments;
    const tableHtml = xs.length
      ? this._renderExperimentsTable(t)
      : `<div class="ishikawa__exp-empty">${t('noExperiments')}</div>`;

    return `
      <div class="ishikawa__experiments">
        <div class="ishikawa__toolbar" style="margin-bottom:var(--spacing-sm)">
          <button class="btn btn--sm btn--primary" data-ref="addExperimentBtn">+ ${t('experiment')}</button>
          <div class="ishikawa__toolbar-spacer"></div>
        </div>
        ${tableHtml}
        <div class="ishikawa__gantt-panel">
          <label class="ishikawa__panel-label">${t('ganttTitle')}</label>
          <div class="ishikawa__gantt-canvas" data-ref="ganttCanvas"></div>
        </div>
        <div class="ishikawa__gantt-panel">
          <label class="ishikawa__panel-label">${t('costChartTitle')}</label>
          <div class="ishikawa__gantt-canvas" data-ref="costChartCanvas"></div>
        </div>
        <div class="ishikawa__gantt-panel">
          <label class="ishikawa__panel-label">${t('costRateChartTitle')}</label>
          <div class="ishikawa__gantt-canvas" data-ref="costRateChartCanvas"></div>
        </div>
      </div>
    `;
  },

  _renderExperimentsTable(t) {
    const statusKeys = ['planned', 'running', 'done', 'cancelled'];
    let head = `<tr>
      <th class="ishikawa__col-nr">#</th>
      <th class="ishikawa__col-exp-title">${t('experimentTitle')}</th>
      <th class="ishikawa__col-desc">${t('experimentDescription')}</th>
      <th class="ishikawa__col-resp">${t('responsible')}</th>
      <th class="ishikawa__col-exp-status">${t('statusHeader')}</th>
      <th class="ishikawa__col-date">${t('startDate')}</th>
      <th class="ishikawa__col-date">${t('endDate')}</th>
      <th class="ishikawa__col-money">${t('costMoney')}</th>
      <th class="ishikawa__col-hours">${t('costHours')}</th>
      <th class="ishikawa__col-hyp-link">${t('linkedHypotheses')}</th>
      <th class="ishikawa__col-actions"></th>
    </tr>`;

    const expertNames = this._experts.map(e => e.name).filter(Boolean);
    const datalistId = 'ishikawa-resp-list';
    const datalist = `<datalist id="${datalistId}">${expertNames.map(n => `<option value="${this._escapeAttr(n)}"></option>`).join('')}</datalist>`;

    let body = '';
    this._experiments.forEach((x, idx) => {
      const stOpts = statusKeys.map(k =>
        `<option value="${k}" ${x.status === k ? 'selected' : ''}>${t(`expStatus.${k}`)}</option>`
      ).join('');
      const linkCount = (x.hypothesisIds || []).length;
      body += `<tr data-xid="${x.id}">
        <td class="ishikawa__col-nr"><span class="ishikawa__nr-text">${idx + 1}</span></td>
        <td><input class="ishikawa__exp-title-input" type="text" value="${this._escapeAttr(x.title || '')}"
                   placeholder="${t('experimentTitlePlaceholder')}" data-xp-title="${x.id}" /></td>
        <td><textarea class="ishikawa__exp-desc-input" rows="1"
                   placeholder="${t('experimentDescPlaceholder')}" data-xp-desc="${x.id}">${this._escapeHtml(x.description || '')}</textarea></td>
        <td><input class="ishikawa__exp-resp-input" type="text" value="${this._escapeAttr(x.responsible || '')}"
                   placeholder="${t('responsiblePlaceholder')}" list="${datalistId}" data-xp-resp="${x.id}" /></td>
        <td><select class="ishikawa__exp-status-select ishikawa__expstatus-${x.status || 'planned'}" data-xp-status="${x.id}">${stOpts}</select></td>
        <td><input class="ishikawa__exp-date-input" type="date" value="${this._escapeAttr(x.startDate || '')}" data-xp-start="${x.id}" /></td>
        <td><input class="ishikawa__exp-date-input" type="date" value="${this._escapeAttr(x.endDate || '')}" data-xp-end="${x.id}" /></td>
        <td><input class="ishikawa__exp-num-input" type="number" min="0" step="0.01" value="${x.costMoney != null ? x.costMoney : ''}"
                   placeholder="0" data-xp-money="${x.id}" /></td>
        <td><input class="ishikawa__exp-num-input" type="number" min="0" step="0.5" value="${x.costHours != null ? x.costHours : ''}"
                   placeholder="0" data-xp-hours="${x.id}" /></td>
        <td><button class="btn btn--sm ishikawa__exp-link-btn" data-xp-link="${x.id}">
              ${linkCount > 0 ? `${linkCount} ${t('linked')}` : t('chooseHypotheses')}
            </button></td>
        <td><div class="ishikawa__row-actions">
          <button class="ishikawa__icon-btn" title="${this._context.i18n.t('common.delete')}" data-xp-del="${x.id}">&#x2715;</button>
        </div></td>
      </tr>`;
    });

    return `
      <div class="ishikawa__table-wrap">
        ${datalist}
        <table class="ishikawa__table ishikawa__exp-table">
          <thead>${head}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },

  _bindExperimentsEvents(t) {
    const el = this._container;

    el.querySelector('[data-ref="addExperimentBtn"]')?.addEventListener('click', () => {
      this._experiments.push({
        id: this._xUid(),
        title: '',
        description: '',
        responsible: '',
        status: 'planned',
        startDate: '',
        endDate: '',
        costMoney: null,
        costHours: null,
        hypothesisIds: [],
      });
      this._save();
      this._render();
    });

    const findX = (id) => this._experiments.find(x => x.id === parseInt(id, 10));

    const bindText = (attr, field) => {
      el.querySelectorAll(`[data-${attr}]`).forEach(inp => {
        inp.addEventListener('change', () => {
          const x = findX(inp.getAttribute(`data-${attr}`));
          if (!x) return;
          x[field] = inp.value;
          this._save();
          if (field === 'startDate' || field === 'endDate') { this._renderGantt(t); this._renderCostChart(t, 'cumulative'); this._renderCostChart(t, 'rate'); }
        });
      });
    };
    bindText('xp-title', 'title');
    bindText('xp-desc', 'description');
    bindText('xp-resp', 'responsible');
    bindText('xp-start', 'startDate');
    bindText('xp-end', 'endDate');

    el.querySelectorAll('[data-xp-status]').forEach(sel => {
      sel.addEventListener('change', () => {
        const x = findX(sel.dataset.xpStatus);
        if (!x) return;
        x.status = sel.value;
        sel.className = `ishikawa__exp-status-select ishikawa__expstatus-${sel.value}`;
        this._save();
        this._renderGantt(t);
      });
    });

    const bindNum = (attr, field) => {
      el.querySelectorAll(`[data-${attr}]`).forEach(inp => {
        const apply = () => {
          const x = findX(inp.getAttribute(`data-${attr}`));
          if (!x) return;
          const raw = inp.value.trim().replace(',', '.');
          const v = raw === '' ? NaN : parseFloat(raw);
          x[field] = isNaN(v) ? null : v;
          this._save();
          this._renderCostChart(t, 'cumulative'); this._renderCostChart(t, 'rate');
        };
        inp.addEventListener('input', apply);
        inp.addEventListener('blur', () => {
          const x = findX(inp.getAttribute(`data-${attr}`));
          if (!x) return;
          inp.value = x[field] != null ? String(x[field]) : '';
        });
      });
    };
    bindNum('xp-money', 'costMoney');
    bindNum('xp-hours', 'costHours');

    el.querySelectorAll('[data-xp-link]').forEach(btn => {
      btn.addEventListener('click', () => {
        const x = findX(btn.dataset.xpLink);
        if (!x) return;
        this._openHypothesisLinkModal(x, t);
      });
    });

    el.querySelectorAll('[data-xp-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const x = findX(btn.dataset.xpDel);
        if (!x) return;
        const i18n = this._context.i18n;
        const label = (x.title && x.title.trim()) || `#${this._experiments.indexOf(x) + 1}`;
        const ok = await this._context.confirmPopout(
          t('delExperimentConfirm', { name: label }),
          {
            title: i18n.t('common.delete'),
            confirmLabel: i18n.t('common.delete'),
            danger: true,
          }
        );
        if (!ok) return;
        this._experiments = this._experiments.filter(y => y.id !== x.id);
        this._save();
        this._render();
      });
    });
  },

  _openExperimentLinkModal(rowId, t) {
    const i18n = this._context.i18n;
    const row = this._rows.find(r => r.id === rowId);
    if (!row || !row.stableId) return;
    const sid = row.stableId;
    const xs = this._experiments;

    const rowsHtml = xs.length
      ? xs.map((x, idx) => {
          const linked = Array.isArray(x.hypothesisIds) && x.hypothesisIds.includes(sid);
          const checked = linked ? 'checked' : '';
          const label = (x.title && x.title.trim()) || `${t('experiment')} #${idx + 1}`;
          const status = x.status || 'planned';
          const statusLabel = t(`expStatus.${status}`);
          const dateRange = (x.startDate || x.endDate)
            ? `${this._escapeHtml(x.startDate || '?')} → ${this._escapeHtml(x.endDate || '?')}`
            : '';
          return `<label class="ishikawa__hyp-pick-row">
            <input type="checkbox" data-exp-id="${x.id}" ${checked} />
            <span class="ishikawa__hyp-pick-num">#${idx + 1}</span>
            <span class="ishikawa__hyp-pick-name">${this._escapeHtml(label)}</span>
            ${dateRange ? `<span class="ishikawa__hyp-pick-cat">${dateRange}</span>` : ''}
            <span class="ishikawa__exp-link-status ishikawa__expstatus-${status}">${this._escapeHtml(statusLabel)}</span>
          </label>`;
        }).join('')
      : `<div class="ishikawa__no-items">${t('noExperimentsToLink')}</div>`;

    const hypLabel = this._dName(row);
    const html = `
      <div class="ishikawa__hyp-pick">
        <p class="ishikawa__hyp-pick-hint">${t('chooseExperimentsHint', { name: this._escapeHtml(hypLabel) })}</p>
        <div class="ishikawa__hyp-pick-list">${rowsHtml}</div>
      </div>`;

    this._context.showModal.form(t('linkExperimentsTitle'), html, {
      confirmLabel: i18n.t('common.save'),
      onConfirm: (body) => {
        body.querySelectorAll('input[data-exp-id]').forEach(cb => {
          const xId = parseInt(cb.dataset.expId, 10);
          const exp = this._experiments.find(x => x.id === xId);
          if (!exp) return;
          if (!Array.isArray(exp.hypothesisIds)) exp.hypothesisIds = [];
          const has = exp.hypothesisIds.includes(sid);
          if (cb.checked && !has) exp.hypothesisIds.push(sid);
          else if (!cb.checked && has) exp.hypothesisIds = exp.hypothesisIds.filter(s => s !== sid);
        });
        this._save();
        this._render();
      },
    });
  },

  _openHypothesisLinkModal(experiment, t) {
    const i18n = this._context.i18n;
    const ord = this._ordered();
    const nums = this._buildNums();
    const linked = new Set(experiment.hypothesisIds || []);

    const rowsHtml = ord.length
      ? ord.map(r => {
          const checked = linked.has(r.stableId) ? 'checked' : '';
          const ec = this._effCat(r);
          const catLbl = ec ? this._catLabel(ec) : '';
          const catSwatch = ec ? `<span class="ishikawa__hyp-pick-swatch" style="background:${this._catColor(ec)}"></span>` : '';
          const label = this._escapeHtml(this._dName(r));
          return `<label class="ishikawa__hyp-pick-row">
            <input type="checkbox" data-stable-id="${r.stableId}" ${checked} />
            <span class="ishikawa__hyp-pick-num">${nums[r.id] || ''}</span>
            ${catSwatch}
            <span class="ishikawa__hyp-pick-name">${label}</span>
            ${catLbl ? `<span class="ishikawa__hyp-pick-cat">${this._escapeHtml(catLbl)}</span>` : ''}
          </label>`;
        }).join('')
      : `<div class="ishikawa__no-items">${t('noCategoryHyp')}</div>`;

    const html = `
      <div class="ishikawa__hyp-pick">
        <p class="ishikawa__hyp-pick-hint">${t('chooseHypothesesHint')}</p>
        <div class="ishikawa__hyp-pick-list">${rowsHtml}</div>
      </div>`;

    this._context.showModal.form(t('chooseHypotheses'), html, {
      confirmLabel: i18n.t('common.save'),
      onConfirm: (body) => {
        const next = [];
        body.querySelectorAll('input[data-stable-id]').forEach(cb => {
          if (cb.checked) next.push(cb.dataset.stableId);
        });
        experiment.hypothesisIds = next;
        this._save();
        this._render();
      },
    });
  },

  _renderGantt(t) {
    const host = this._container.querySelector('[data-ref="ganttCanvas"]');
    if (!host) return;

    const xs = this._experiments.filter(x =>
      x.startDate && x.endDate && !isNaN(Date.parse(x.startDate)) && !isNaN(Date.parse(x.endDate))
    );

    if (xs.length === 0) {
      host.innerHTML = `<div class="ishikawa__gantt-empty">${t('ganttNoData')}</div>`;
      return;
    }

    const parseD = s => new Date(s + 'T00:00:00');
    const items = xs.map(x => {
      const s = parseD(x.startDate);
      const e = parseD(x.endDate);
      return { x, start: s.getTime(), end: Math.max(e.getTime(), s.getTime() + 86400000) };
    });

    const minT = Math.min(...items.map(i => i.start));
    const maxT = Math.max(...items.map(i => i.end));
    const span = Math.max(maxT - minT, 86400000);

    const labelW = 220;
    const padL = 8, padR = 16, padT = 30, padB = 24;
    const rowH = 26;
    const innerW = Math.max(400, host.clientWidth - labelW - padL - padR);
    const totalW = labelW + padL + innerW + padR;
    const totalH = padT + items.length * rowH + padB;

    const xScale = (t) => labelW + padL + ((t - minT) / span) * innerW;

    // Tick generation: pick ~6 evenly spaced ticks in days
    const dayMs = 86400000;
    const spanDays = span / dayMs;
    let stepDays;
    if (spanDays <= 14) stepDays = 1;
    else if (spanDays <= 60) stepDays = 7;
    else if (spanDays <= 365) stepDays = 30;
    else stepDays = 90;

    const ticks = [];
    const startD = new Date(minT);
    startD.setHours(0, 0, 0, 0);
    for (let d = startD.getTime(); d <= maxT; d += stepDays * dayMs) {
      ticks.push(d);
    }

    const fmtDate = (ms) => {
      const d = new Date(ms);
      const lang = this._context.language || 'de';
      return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit' });
    };

    const statusColor = {
      planned:   '#94a3b8',
      running:   '#2563eb',
      done:      '#16a34a',
      cancelled: '#dc2626',
    };

    const today = Date.now();
    const todayLine = (today >= minT && today <= maxT)
      ? `<line x1="${xScale(today)}" y1="${padT - 6}" x2="${xScale(today)}" y2="${padT + items.length * rowH}"
              stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="3,3" />
         <text x="${xScale(today) + 4}" y="${padT - 8}" font-size="10" fill="var(--color-accent)" font-family="var(--font-family-mono)">${t('today')}</text>`
      : '';

    const tickLines = ticks.map(t => `
      <line x1="${xScale(t)}" y1="${padT - 4}" x2="${xScale(t)}" y2="${padT + items.length * rowH}"
            stroke="var(--color-border-secondary)" stroke-width="1" />
      <text x="${xScale(t)}" y="${padT - 8}" font-size="10" fill="var(--color-text-tertiary)"
            text-anchor="middle" font-family="var(--font-family-mono)">${fmtDate(t)}</text>
    `).join('');

    const bars = items.map((it, i) => {
      const y = padT + i * rowH + 4;
      const barH = rowH - 10;
      const x1 = xScale(it.start);
      const x2 = xScale(it.end);
      const w = Math.max(2, x2 - x1);
      const col = statusColor[it.x.status] || statusColor.planned;
      const labelText = (it.x.title && it.x.title.trim()) || `#${this._experiments.indexOf(it.x) + 1}`;
      const responsible = it.x.responsible ? ` · ${it.x.responsible}` : '';
      const tooltip = `${labelText}${responsible}\n${this._escapeAttr(it.x.startDate)} → ${this._escapeAttr(it.x.endDate)}`;
      return `
        <text x="${labelW - 8}" y="${y + barH / 2 + 4}" font-size="11" text-anchor="end"
              fill="var(--color-text-primary)" font-family="var(--font-family)">${this._escapeHtml(this._truncate(labelText, 30))}</text>
        <rect x="${x1}" y="${y}" width="${w}" height="${barH}" rx="3" ry="3"
              fill="${col}" opacity="0.85">
          <title>${tooltip}</title>
        </rect>
      `;
    }).join('');

    host.innerHTML = `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}"
           xmlns="http://www.w3.org/2000/svg" class="ishikawa__gantt-svg">
        ${tickLines}
        ${todayLine}
        ${bars}
      </svg>
    `;
  },

  _renderCostChart(t, mode = 'cumulative') {
    const hostRef = mode === 'rate' ? 'costRateChartCanvas' : 'costChartCanvas';
    const host = this._container.querySelector(`[data-ref="${hostRef}"]`);
    if (!host) return;

    const xs = this._experiments.filter(x =>
      x.startDate && x.endDate && !isNaN(Date.parse(x.startDate)) && !isNaN(Date.parse(x.endDate))
    );
    const hasAny = xs.some(x => (parseFloat(x.costMoney) || 0) > 0 || (parseFloat(x.costHours) || 0) > 0);
    if (xs.length === 0 || !hasAny) {
      host.innerHTML = `<div class="ishikawa__gantt-empty">${t('costChartNoData')}</div>`;
      return;
    }

    const dayMs = 86400000;
    const parseD = s => new Date(s + 'T00:00:00').getTime();
    const items = xs.map(x => {
      const s = parseD(x.startDate);
      const e = Math.max(parseD(x.endDate), s + dayMs);
      const days = Math.max(1, Math.round((e - s) / dayMs));
      return {
        start: s,
        end: e,
        moneyPerDay: (parseFloat(x.costMoney) || 0) / days,
        hoursPerDay: (parseFloat(x.costHours) || 0) / days,
      };
    });

    const minT = Math.min(...items.map(i => i.start));
    const maxT = Math.max(...items.map(i => i.end));
    const totalDays = Math.max(1, Math.round((maxT - minT) / dayMs));

    const moneyPts = [];
    const hoursPts = [];
    let cumMoney = 0, cumHours = 0;
    let peakMoney = 0, peakHours = 0;

    if (mode === 'cumulative') {
      moneyPts.push({ t: minT, v: 0 });
      hoursPts.push({ t: minT, v: 0 });
      for (let d = 0; d < totalDays; d++) {
        const dayStart = minT + d * dayMs;
        items.forEach(it => {
          if (dayStart >= it.start && dayStart < it.end) {
            cumMoney += it.moneyPerDay;
            cumHours += it.hoursPerDay;
          }
        });
        moneyPts.push({ t: dayStart + dayMs, v: cumMoney });
        hoursPts.push({ t: dayStart + dayMs, v: cumHours });
      }
      peakMoney = cumMoney;
      peakHours = cumHours;
    } else {
      // rate: per-day snapshot (step chart)
      for (let d = 0; d < totalDays; d++) {
        const dayStart = minT + d * dayMs;
        let mRate = 0, hRate = 0;
        items.forEach(it => {
          if (dayStart >= it.start && dayStart < it.end) {
            mRate += it.moneyPerDay;
            hRate += it.hoursPerDay;
          }
        });
        moneyPts.push({ t: dayStart, v: mRate });
        moneyPts.push({ t: dayStart + dayMs, v: mRate });
        hoursPts.push({ t: dayStart, v: hRate });
        hoursPts.push({ t: dayStart + dayMs, v: hRate });
        if (mRate > peakMoney) peakMoney = mRate;
        if (hRate > peakHours) peakHours = hRate;
      }
    }

    const maxMoney = Math.max(peakMoney, 1);
    const maxHours = Math.max(peakHours, 1);

    const labelW = 220;
    const padL = 8, padR = 48, padT = 16, padB = 28;
    const innerH = 140;
    const innerW = Math.max(400, host.clientWidth - labelW - padL - padR);
    const totalW = labelW + padL + innerW + padR;
    const totalH = padT + innerH + padB;

    const span = Math.max(maxT - minT, dayMs);
    const xScale = (tt) => labelW + padL + ((tt - minT) / span) * innerW;
    const yMoney = (v) => padT + innerH - (v / maxMoney) * innerH;
    const yHours = (v) => padT + innerH - (v / maxHours) * innerH;

    const spanDays = span / dayMs;
    let stepDays;
    if (spanDays <= 14) stepDays = 1;
    else if (spanDays <= 60) stepDays = 7;
    else if (spanDays <= 365) stepDays = 30;
    else stepDays = 90;

    const fmtDate = (ms) => {
      const d = new Date(ms);
      const lang = this._context.language || 'de';
      return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit' });
    };

    const ticks = [];
    const startD = new Date(minT);
    startD.setHours(0, 0, 0, 0);
    for (let d = startD.getTime(); d <= maxT; d += stepDays * dayMs) ticks.push(d);

    const tickLines = ticks.map(tt => `
      <line x1="${xScale(tt)}" y1="${padT}" x2="${xScale(tt)}" y2="${padT + innerH}"
            stroke="var(--color-border-secondary)" stroke-width="1" />
      <text x="${xScale(tt)}" y="${padT + innerH + 14}" font-size="10" fill="var(--color-text-tertiary)"
            text-anchor="middle" font-family="var(--font-family-mono)">${fmtDate(tt)}</text>
    `).join('');

    const baseLine = `<line x1="${labelW + padL}" y1="${padT + innerH}" x2="${labelW + padL + innerW}" y2="${padT + innerH}"
                            stroke="var(--color-border-primary)" stroke-width="1" />`;

    const moneyD = moneyPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yMoney(p.v)}`).join(' ');
    const moneyPath = `<path d="${moneyD}" fill="none" stroke="#16a34a" stroke-width="2" />`;
    const hoursD = hoursPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yHours(p.v)}`).join(' ');
    const hoursPath = `<path d="${hoursD}" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="4,2" />`;

    const today = Date.now();
    const todayLine = (today >= minT && today <= maxT)
      ? `<line x1="${xScale(today)}" y1="${padT}" x2="${xScale(today)}" y2="${padT + innerH}"
              stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="3,3" />`
      : '';

    const fmtMoney = (v) => {
      const lang = this._context.language || 'de';
      return v.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 });
    };
    const fmtHours = (v) => v.toLocaleString(this._context.language === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 });

    const moneyUnit = mode === 'rate' ? '€/d' : '€';
    const hoursUnit = mode === 'rate' ? 'h/d' : 'h';
    const leftAxisLbl = `
      <text x="${labelW + padL - 4}" y="${padT + 4}" font-size="10" text-anchor="end" fill="#16a34a" font-family="var(--font-family-mono)">${fmtMoney(peakMoney)} ${moneyUnit}</text>
      <text x="${labelW + padL - 4}" y="${padT + innerH - 2}" font-size="10" text-anchor="end" fill="#16a34a" font-family="var(--font-family-mono)">0</text>`;
    const rightAxisLbl = `
      <text x="${labelW + padL + innerW + 4}" y="${padT + 4}" font-size="10" text-anchor="start" fill="#2563eb" font-family="var(--font-family-mono)">${fmtHours(peakHours)} ${hoursUnit}</text>
      <text x="${labelW + padL + innerW + 4}" y="${padT + innerH - 2}" font-size="10" text-anchor="start" fill="#2563eb" font-family="var(--font-family-mono)">0</text>`;

    const legend = `
      <g transform="translate(${labelW - 8}, ${padT + innerH / 2})">
        <line x1="-70" y1="-8" x2="-50" y2="-8" stroke="#16a34a" stroke-width="2" />
        <text x="-46" y="-4" font-size="11" fill="var(--color-text-secondary)" font-family="var(--font-family)">${t('costMoney')}</text>
        <line x1="-70" y1="10" x2="-50" y2="10" stroke="#2563eb" stroke-width="2" stroke-dasharray="4,2" />
        <text x="-46" y="14" font-size="11" fill="var(--color-text-secondary)" font-family="var(--font-family)">${t('costHours')}</text>
      </g>`;

    host.innerHTML = `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}"
           xmlns="http://www.w3.org/2000/svg" class="ishikawa__gantt-svg">
        ${baseLine}
        ${tickLines}
        ${todayLine}
        ${moneyPath}
        ${hoursPath}
        ${leftAxisLbl}
        ${rightAxisLbl}
        ${legend}
      </svg>
    `;
  },
};
