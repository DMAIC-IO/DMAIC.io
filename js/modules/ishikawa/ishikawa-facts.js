/**
 * Ishikawa 6M — Facts tab rendering & events.
 */

export const factsMethods = {
  _renderFactsTab(t) {
    const tableHtml = this._facts.length
      ? this._renderFactsTable(t)
      : `<div class="ishikawa__exp-empty">${t('noFacts')}</div>`;

    return `
      <div class="ishikawa__experiments">
        <div class="ishikawa__toolbar" style="margin-bottom:var(--spacing-sm)">
          <button class="btn btn--sm btn--primary" data-ref="addFactBtn">+ ${t('fact')}</button>
          <div class="ishikawa__toolbar-spacer"></div>
        </div>
        ${tableHtml}
      </div>
    `;
  },

  _renderFactsTable(t) {
    const head = `<tr>
      <th class="ishikawa__col-nr">#</th>
      <th class="ishikawa__col-fact-name">${t('factName')}</th>
      <th>${t('factDescription')}</th>
      <th class="ishikawa__col-date">${t('factDate')}</th>
      <th class="ishikawa__col-resp">${t('factOwner')}</th>
      <th class="ishikawa__col-actions"></th>
    </tr>`;

    const ownerNames = this._experts.map(e => e.name).filter(Boolean);
    const datalistId = 'ishikawa-fact-owner-list';
    const datalist = `<datalist id="${datalistId}">${ownerNames.map(n => `<option value="${this._escapeAttr(n)}"></option>`).join('')}</datalist>`;

    let body = '';
    this._facts.forEach((f, idx) => {
      body += `<tr data-fid="${f.id}">
        <td class="ishikawa__col-nr"><span class="ishikawa__nr-text">${idx + 1}</span></td>
        <td><input class="ishikawa__exp-title-input" type="text" value="${this._escapeAttr(f.name || '')}"
                   placeholder="${t('factNamePlaceholder')}" data-fact-name="${f.id}" /></td>
        <td><input class="ishikawa__exp-desc-input" type="text" value="${this._escapeAttr(f.description || '')}"
                   placeholder="${t('factDescPlaceholder')}" data-fact-desc="${f.id}" /></td>
        <td><input class="ishikawa__exp-date-input" type="date" value="${this._escapeAttr(f.date || '')}" data-fact-date="${f.id}" /></td>
        <td><input class="ishikawa__exp-resp-input" type="text" value="${this._escapeAttr(f.owner || '')}"
                   placeholder="${t('factOwnerPlaceholder')}" list="${datalistId}" data-fact-owner="${f.id}" /></td>
        <td><div class="ishikawa__row-actions">
          <button class="ishikawa__icon-btn" title="${this._context.i18n.t('common.delete')}" data-fact-del="${f.id}">&#x2715;</button>
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

  _bindFactsEvents(t) {
    const el = this._container;

    el.querySelector('[data-ref="addFactBtn"]')?.addEventListener('click', () => {
      const today = new Date().toISOString().slice(0, 10);
      this._facts.push({
        id: this._fUid(),
        name: '',
        description: '',
        date: today,
        owner: '',
      });
      this._save();
      this._render();
    });

    const findF = (id) => this._facts.find(f => f.id === parseInt(id, 10));

    const bindText = (attr, field) => {
      el.querySelectorAll(`[data-${attr}]`).forEach(inp => {
        inp.addEventListener('change', () => {
          const f = findF(inp.getAttribute(`data-${attr}`));
          if (!f) return;
          f[field] = inp.value;
          this._save();
        });
      });
    };
    bindText('fact-name', 'name');
    bindText('fact-desc', 'description');
    bindText('fact-date', 'date');
    bindText('fact-owner', 'owner');

    el.querySelectorAll('[data-fact-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const f = findF(btn.dataset.factDel);
        if (!f) return;
        const i18n = this._context.i18n;
        const label = (f.name && f.name.trim()) || `#${this._facts.indexOf(f) + 1}`;
        const ok = await this._context.confirmPopout(
          t('delFactConfirm', { name: label }),
          {
            title: i18n.t('common.delete'),
            confirmLabel: i18n.t('common.delete'),
            danger: true,
          }
        );
        if (!ok) return;
        this._facts = this._facts.filter(x => x.id !== f.id);
        this._save();
        this._render();
      });
    });
  },
};
