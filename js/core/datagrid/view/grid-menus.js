/**
 * D.Mike — Menüs des Rasters (datagrid/view/grid-menus.js)
 *
 * Kontextmenüs für Spaltenkopf, Zeilenkopf und Zelle, die Typ-/Rollen-/
 * Formatauswahl am Typ-Kürzel und die Ansichten Spaltenstatistik und
 * Spaltenscan. Die Menüs ändern keine Daten: jeder Eintrag ruft einen
 * Rückruf der Bedienung (grid-input.js), die daraus eine Rolle meldet.
 * Einträge, deren Rolle fehlt (`can(role)` falsch), erscheinen nicht.
 */
import { h } from '../../dom.js';
import { icon } from '../../icon.js';
import {
  COLUMN_TYPES, DATE_FORMATS, TIME_FORMATS, renderColTypeBadge, isNumericType,
  formatGridNumber, analyzeColumn,
} from '../datagrid-utils.js';
import { validRolesForType } from '../datagrid-roles.js';

/**
 * @typedef {{ id: string, label: string, danger?: boolean, action: () => void }} MenuItem
 * @typedef {MenuItem|{ sep: true }} MenuEntry
 */

/**
 * Entfernt Trenner am Anfang, am Ende und doppelte Trenner — übrig bleiben
 * sie, wenn ein Merkmal eine ganze Gruppe ausblendet.
 * @param {MenuEntry[]} items @returns {MenuEntry[]}
 */
function tidy(items) {
  const out = [];
  for (const it of items) {
    if ('sep' in it && (!out.length || 'sep' in out[out.length - 1])) continue;
    out.push(it);
  }
  while (out.length && 'sep' in out[out.length - 1]) out.pop();
  return out;
}

/**
 * @param {{ t: (key: string) => string, getLang: () => string, dialog?: any }} opts
 */
export function createGridMenus({ t, getLang, dialog }) {
  const tt = (k) => t(`ui.datagrid.${k}`);
  const fallback = (k, alt) => {
    const s = tt(k);
    return (s && s !== k && !s.endsWith(k)) ? s : alt;
  };
  const typeLabel = (type) => {
    const key = `type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    return fallback(key, COLUMN_TYPES[type]?.label || type);
  };
  const roleLabel = (role) => fallback(`role${role.charAt(0).toUpperCase()}${role.slice(1)}`, role);
  const roleTooltip = (role) => fallback(`role${role.charAt(0).toUpperCase()}${role.slice(1)}Tooltip`, '');
  const colLabel = (col) => (col.name ? `${col.shortName} · ${col.name}` : col.shortName);

  let menu = null;
  let picker = null;
  let stats = null;
  let scan = null;

  const onDocDown = (ev) => {
    if (menu && !menu.contains(ev.target)) close();
    if (picker && !picker.el.contains(ev.target)) closePicker();
  };
  const onDocKey = (ev) => {
    if (ev.key === 'Escape' && (menu || picker)) { close(); closePicker(); }
  };
  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onDocKey, true);

  function close() {
    menu?.remove();
    menu = null;
  }
  function closePicker() {
    picker?.el.remove();
    picker = null;
  }

  /**
   * Öffnet ein Kontextmenü an der Mausposition; es folgt dem Fensterrand.
   * @param {number} x @param {number} y @param {MenuEntry[]} entries
   */
  function open(x, y, entries) {
    close();
    closePicker();
    const items = tidy(entries);
    if (!items.length) return;
    menu = h('div', { class: 'context-menu', role: 'menu', style: `left:${x}px;top:${y}px` });
    for (const it of items) {
      if ('sep' in it) { menu.append(h('div', { class: 'context-menu__sep' })); continue; }
      const el = h('div', {
        class: `context-menu__item${it.danger ? ' context-menu__item--danger' : ''}`,
        role: 'menuitem', 'data-menu-id': it.id,
      }, h('span', null, it.label));
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        close();
        it.action();
      });
      menu.append(el);
    }
    document.body.append(menu);
    const m = menu;
    requestAnimationFrame(() => {
      const r = m.getBoundingClientRect();
      if (r.right > window.innerWidth) m.style.left = `${window.innerWidth - r.width - 8}px`;
      if (r.bottom > window.innerHeight) m.style.top = `${window.innerHeight - r.height - 8}px`;
    });
  }

  /**
   * Einträge am Spaltenkopf (`_onHeaderContextMenu`).
   * @param {{ col: any, readOnly: boolean, can: (role: string) => boolean,
   *   on: { rename: Function, sort: (dir: string) => void, insert: (offset: number) => void,
   *   remove: Function, stats: Function|null, scan: Function|null } }} ctx
   * @returns {MenuEntry[]}
   */
  function headerItems({ col, readOnly, can, on }) {
    const views = [
      on.stats && { id: 'columnStats', label: tt('columnStats'), action: on.stats },
      on.scan && { id: 'columnScan', label: tt('columnScan'), action: on.scan },
    ].filter(Boolean);
    if (readOnly) return views;
    const items = [];
    if (!col.lock && can('renameColumn')) items.push({ id: 'renameColumn', label: tt('renameColumn'), action: on.rename }, { sep: true });
    if (can('sortRows')) {
      items.push({ id: 'sortAsc', label: tt('sortAsc'), action: () => on.sort('asc') },
        { id: 'sortDesc', label: tt('sortDesc'), action: () => on.sort('desc') }, { sep: true });
    }
    if (can('addColumn')) {
      items.push({ id: 'insertColLeft', label: tt('insertColLeft'), action: () => on.insert(0) },
        { id: 'insertColRight', label: tt('insertColRight'), action: () => on.insert(1) }, { sep: true });
    }
    items.push(...views);
    if (col.lock !== 'hard' && can('removeColumn')) {
      items.push({ sep: true }, { id: 'deleteColumn', label: tt('deleteColumn'), danger: true, action: on.remove });
    }
    return items;
  }

  /**
   * Einträge am Zeilenkopf.
   * @param {{ can: (role: string) => boolean, on: { insert: (offset: number) => void, remove: Function } }} ctx
   */
  function rowItems({ can, on }) {
    const items = [];
    if (can('addRows')) {
      items.push({ id: 'insertRowAbove', label: tt('insertRowAbove'), action: () => on.insert(0) },
        { id: 'insertRowBelow', label: tt('insertRowBelow'), action: () => on.insert(1) }, { sep: true });
    }
    if (can('removeRows')) items.push({ id: 'deleteRow', label: tt('deleteRow'), danger: true, action: on.remove });
    return items;
  }

  /**
   * Einträge an einer Zelle, dazu die Zusatzeinträge des Moduls (`config.contextMenu`).
   * @param {{ canEdit: boolean, can: (role: string) => boolean, extra: { id: string, label: string }[],
   *   on: { edit: Function, clear: Function, insert: (offset: number) => void, removeRows: Function,
   *   extra: (id: string) => void } }} ctx
   */
  function cellItems({ canEdit, can, extra, on }) {
    const items = [];
    if (canEdit) items.push({ id: 'editCell', label: tt('editCell'), action: on.edit });
    if (can('clearRange')) items.push({ id: 'clearSelection', label: tt('clearSelection'), action: on.clear });
    items.push({ sep: true });
    if (can('addRows')) {
      items.push({ id: 'insertRowAbove', label: tt('insertRowAbove'), action: () => on.insert(0) },
        { id: 'insertRowBelow', label: tt('insertRowBelow'), action: () => on.insert(1) }, { sep: true });
    }
    if (can('removeRows')) items.push({ id: 'deleteSelectedRows', label: tt('deleteSelectedRows'), danger: true, action: on.removeRows });
    if (extra.length) {
      items.push({ sep: true });
      for (const x of extra) items.push({ id: x.id, label: x.label, action: () => on.extra(x.id) });
    }
    return items;
  }

  // ─── Typ-, Rollen- und Formatauswahl ─────────────────────────────

  /**
   * Öffnet die Auswahl am Typ-Kürzel (`_showColumnAttrPicker`). Die Auswahl
   * liest die Spalte bei jedem Neuzeichnen über `getCol`, damit ein gemeldeter
   * Typwechsel nach dem Kommando sichtbar wird (`refresh`).
   * @param {DOMRect} anchorRect
   * @param {{ getCol: () => any, can: (role: string) => boolean,
   *   setType: (type: string) => void, setRole: (role: string) => void,
   *   setFormat: (key: string, value: any) => void }} ctx
   */
  function openAttrPicker(anchorRect, ctx) {
    close();
    closePicker();
    const col = ctx.getCol();
    if (!col) return;
    const el = h('div', { class: `attr-picker${col.lock ? ` attr-picker--locked-${col.lock}` : ''}` });
    picker = { el, ctx };
    renderPicker();
    document.body.append(el);
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      let top = anchorRect.bottom + 4;
      let left = anchorRect.left;
      if (left + r.width > window.innerWidth) left = window.innerWidth - r.width - 8;
      if (top + r.height > window.innerHeight) top = anchorRect.top - r.height - 4;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });
  }

  function pickerItem({ data, active, locked, children, title, onClick }) {
    const item = h('div', {
      class: `attr-picker__item${active ? ' active' : ''}${locked ? ' attr-picker__item--disabled' : ''}`,
      title: title || null, ...data,
    }, ...children);
    if (active) item.append(icon('action.confirm', { size: 'sm', cls: 'attr-picker__item-check' }));
    if (!locked) {
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onClick();
      });
    }
    return item;
  }

  function renderPicker() {
    if (!picker) return;
    const { el, ctx } = picker;
    const col = ctx.getCol();
    if (!col) { closePicker(); return; }
    const locked = Boolean(col.lock);
    const dis = locked ? ' attr-picker__col--disabled' : '';
    const parts = [h('div', { class: 'attr-picker__title' }, colLabel(col))];
    if (locked) {
      const head = col.lock === 'hard' ? tt('lockHardTitle') : tt('lockSoftTitle');
      const reason = col.reason ? tt(`lockReason.${col.reason}`) : null;
      parts.push(h('div', { class: 'attr-picker__lock-note' }, [head, reason].filter(Boolean).join(' — ')));
    }
    const cols = h('div', { class: 'attr-picker__columns' });
    if (ctx.can('setColumnType')) {
      const typeCol = h('div', { class: `attr-picker__col attr-picker__col--type${dis}` },
        h('div', { class: 'attr-picker__col-title' }, fallback('typeMenuTitle', 'Column type')));
      for (const type of Object.keys(COLUMN_TYPES)) {
        typeCol.append(pickerItem({
          data: { 'data-type': type }, active: col.type === type, locked,
          children: [h('span', { class: 'attr-picker__badge' }, renderColTypeBadge(type)),
            h('span', { class: 'attr-picker__label' }, typeLabel(type))],
          onClick: () => { if (ctx.getCol()?.type !== type) ctx.setType(type); },
        }));
      }
      cols.append(typeCol);
    }
    if (ctx.can('setColumnRole')) {
      const roleCol = h('div', { class: `attr-picker__col attr-picker__col--role${dis}` },
        h('div', { class: 'attr-picker__col-title' }, fallback('roleMenuTitle', 'Column role')));
      for (const role of validRolesForType(col.type)) {
        roleCol.append(pickerItem({
          data: { 'data-role': role }, active: col.role === role, locked, title: roleTooltip(role),
          children: [h('span', { class: `attr-picker__role-dot col-role-${role}` }),
            h('span', { class: 'attr-picker__label' }, roleLabel(role))],
          onClick: () => ctx.setRole(role),
        }));
      }
      cols.append(roleCol);
    }
    const formatCol = ctx.can('setColumnFormat') ? renderFormatColumn(col, locked, dis, ctx) : null;
    if (formatCol) cols.append(formatCol);
    parts.push(cols);
    el.replaceChildren(...parts);
  }

  function renderFormatColumn(col, locked, dis, ctx) {
    const fmt = col.format || {};
    const colEl = h('div', { class: `attr-picker__col attr-picker__col--format${dis}` },
      h('div', { class: 'attr-picker__col-title' }, fallback('formatMenuTitle', 'Format')));
    const add = (label, active, key, value) => colEl.append(pickerItem({
      data: { 'data-format': `${key}:${value}` }, active, locked,
      children: [h('span', { class: 'attr-picker__label' }, label)],
      onClick: () => ctx.setFormat(key, value),
    }));
    if (col.type === 'numeric' || col.type === 'currency' || col.type === 'percent') {
      add(fallback('decimalsAuto', 'Auto'), fmt.decimals == null, 'decimals', null);
      for (const d of [0, 1, 2, 3, 4, 5, 6]) add(String(d), fmt.decimals === d, 'decimals', d);
      return colEl;
    }
    if (col.type === 'date') {
      const cur = fmt.dateFormat || 'dd.MM.yyyy';
      for (const [p, ex] of Object.entries(DATE_FORMATS)) add(`${p}  ·  ${ex}`, cur === p, 'dateFormat', p);
      return colEl;
    }
    if (col.type === 'time') {
      const cur = fmt.timeFormat || 'HH:mm';
      for (const [p, ex] of Object.entries(TIME_FORMATS)) add(`${p}  ·  ${ex}`, cur === p, 'timeFormat', p);
      return colEl;
    }
    return null;
  }

  // ─── Spaltenstatistik und Spaltenscan (Ansicht, keine Rolle) ─────

  const statsTable = (rows) => h('table', { class: 'column-stats__table' }, ...rows.map((row) => (row
    ? h('tr', null, h('td', { class: 'column-stats__label' }, row[0]), h('td', { class: 'column-stats__value' }, row[1]))
    : h('tr', { class: 'column-stats__sep' }, h('td', { colspan: '2' })))));

  /**
   * Zusammenfassung einer Spalte (`_showColumnStats`).
   * @param {any} col Spaltenkopf @param {any[]} values Spalte der Tabelle @param {number} rowCount
   */
  function showStats(col, values, rowCount) {
    if (!dialog) return;
    stats?.close();
    const vals = values.slice(0, rowCount).filter((v) => v != null);
    let body;
    if (isNumericType(col.type)) {
      const nums = vals.filter((v) => typeof v === 'number');
      if (nums.length) {
        const sum = nums.reduce((a, b) => a + b, 0);
        const mean = sum / nums.length;
        const sorted = [...nums].sort((a, b) => a - b);
        const n = nums.length;
        const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
        const sd = n > 1 ? Math.sqrt(nums.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
        const fmt = (v, d) => formatGridNumber(v, d ?? null, getLang());
        body = statsTable([
          ['n', n], [tt('statsEmpty'), rowCount - vals.length], null,
          [`x̄ (${tt('statsMean')})`, fmt(mean, 4)], [`s (${tt('statsStddev')})`, fmt(sd, 4)],
          ['Min', fmt(sorted[0])], ['Median', fmt(median, 4)], ['Max', fmt(sorted[n - 1])],
          [`Σ (${tt('statsSum')})`, fmt(sum, 4)],
        ]);
      } else {
        body = h('div', { class: 'column-scan__overview' }, h('span', null, tt('statsNoNumeric')));
      }
    } else {
      body = statsTable([['n', vals.length], [tt('statsEmpty'), rowCount - vals.length],
        [tt('statsUnique'), new Set(vals.map(String)).size]]);
    }
    stats = dialog.show({
      title: tt('columnStats'),
      size: 'compact',
      content: h('div', { class: 'column-scan__stats' },
        h('div', { class: 'column-scan__subtitle' }, `${colLabel(col)} — ${typeLabel(col.type)}`),
        h('div', { class: 'column-scan__body' }, body)),
      onClose: () => { stats = null; },
    });
  }

  /**
   * Spaltenscan (`_showColumnScan`); frischt bei jedem `refresh` auf, bis der Dialog schließt.
   * @param {{ getCol: () => any, getValues: () => any[], getRowCount: () => number, colIdx: () => number,
   *   jump: (c: number, r: number) => void }} src
   */
  function showScan(src) {
    if (!dialog) return;
    scan?.handle.close();
    const body = h('div', { class: 'column-scan__body' });
    const handle = dialog.show({ title: tt('scanTitle'), content: body, onClose: () => { scan = null; } });
    scan = { handle, body, src };
    renderScan();
  }

  function renderScan() {
    if (!scan) return;
    const { body, handle, src } = scan;
    const col = src.getCol();
    if (!col) { handle.close(); return; }
    const colIdx = src.colIdx();
    const lang = getLang();
    const res = analyzeColumn({ type: col.type, values: src.getValues() }, src.getRowCount());
    const filled = res.total - res.empty;
    const badge = (type) => (COLUMN_TYPES[type] ? renderColTypeBadge(type) : type);
    handle.setTitle?.(`${tt('scanTitle')} — ${colLabel(col)} (${tt('scanDominant')}: ${res.dominantType ? typeLabel(res.dominantType) : '—'})`);
    const parts = [h('div', { class: 'column-scan__overview' },
      h('span', null, `${tt('scanTotal')}: `, h('strong', null, res.total)),
      h('span', null, `${tt('scanFilled')}: `, h('strong', null, filled)),
      h('span', null, `${tt('scanEmpty')}: `, h('strong', null, res.empty)))];
    if (filled > 0) {
      const bar = h('div', { class: 'column-scan__bar' });
      const types = h('div', { class: 'column-scan__types' });
      for (const [type, info] of Object.entries(res.types)) {
        const pct = Math.round(info.count / filled * 1000) / 10;
        const pctText = `${formatGridNumber(pct, 1, lang)}%`;
        bar.append(h('div', { class: `column-scan__bar-seg column-scan__bar-seg--${type}`, title: `${type}: ${info.count} (${pctText})`, style: `width:${pct}%` }, badge(type)));
        types.append(h('div', { class: `column-scan__type-row${type === res.dominantType ? ' column-scan__type-row--dominant' : ''}` },
          h('span', { class: `column-scan__type-badge column-scan__type-badge--${type}` }, badge(type)),
          h('span', { class: 'column-scan__type-label' }, typeLabel(type)),
          h('span', { class: 'column-scan__type-count' }, info.count),
          h('span', { class: 'column-scan__type-pct' }, pctText)));
      }
      parts.push(bar, types);
    }
    const jumpEl = (attrs, activeCls, ...children) => {
      const el = h('div', attrs, ...children);
      el.addEventListener('click', () => {
        src.jump(colIdx, Number(attrs['data-row']));
        body.querySelectorAll(`.${activeCls}`).forEach((x) => x.classList.remove(activeCls));
        el.classList.add(activeCls);
      });
      return el;
    };
    if (res.textClusters?.length) {
      const list = h('div', { class: 'column-scan__clusters-list' });
      for (const cluster of res.textClusters.slice(0, 20)) {
        const variants = h('div', { class: 'column-scan__cluster-variants' });
        for (const v of cluster.variants.slice(0, 30)) {
          variants.append(jumpEl({
            class: `column-scan__cluster-variant${v.viaFuzzy ? ' column-scan__cluster-variant--fuzzy' : ''}`,
            'data-row': v.firstRow, title: tt('scanVariantJump'),
          }, 'column-scan__cluster-variant--active',
          v.viaFuzzy
            ? h('span', { class: 'column-scan__cluster-fuzzy', title: tt('scanVariantFuzzy') }, '≈')
            : h('span', { class: 'column-scan__cluster-fuzzy column-scan__cluster-fuzzy--placeholder' }),
          h('span', { class: 'column-scan__cluster-value' }, `"${v.value}"`),
          h('span', { class: 'column-scan__cluster-count' }, `×${v.count}`)));
        }
        if (cluster.variants.length > 30) {
          variants.append(h('div', { class: 'column-scan__mismatch-more' }, `… ${tt('scanMore').replace('{n}', cluster.variants.length - 30)}`));
        }
        list.append(h('div', { class: 'column-scan__cluster' },
          h('div', { class: 'column-scan__cluster-summary' },
            tt('scanVariantsGroupSummary').replace('{n}', cluster.variants.length).replace('{total}', cluster.total)),
          variants));
      }
      if (res.textClusters.length > 20) {
        list.append(h('div', { class: 'column-scan__mismatch-more' }, `… ${tt('scanMore').replace('{n}', res.textClusters.length - 20)}`));
      }
      parts.push(h('div', { class: 'column-scan__clusters' },
        h('div', { class: 'column-scan__clusters-header' }, tt('scanVariantsHeader').replace('{n}', res.textClusters.length)), list));
    }
    if (res.outliers.count > 0) {
      const list = h('div', { class: 'column-scan__mismatch-list' });
      const shown = Math.min(res.outliers.count, 50);
      for (let i = 0; i < shown; i++) {
        const val = res.outliers.values[i];
        const oType = res.outliers.types[i];
        list.append(jumpEl({ class: 'column-scan__mismatch-row', 'data-row': res.outliers.rows[i] }, 'column-scan__mismatch-row--active',
          h('span', { class: 'column-scan__mismatch-rownum' }, `${tt('scanRow')} ${res.outliers.rows[i] + 1}`),
          h('span', { class: `column-scan__type-badge column-scan__type-badge--sm column-scan__type-badge--${oType}` }, badge(oType)),
          h('span', { class: 'column-scan__mismatch-val' }, val.length > 30 ? `${val.substring(0, 27)}…` : val)));
      }
      if (res.outliers.count > 50) {
        list.append(h('div', { class: 'column-scan__mismatch-more' }, `… ${tt('scanMore').replace('{n}', res.outliers.count - 50)}`));
      }
      parts.push(h('div', { class: 'column-scan__mismatch' },
        h('div', { class: 'column-scan__mismatch-header' }, tt('scanOutliers').replace('{n}', res.outliers.count)), list));
    } else if (filled > 0) {
      parts.push(h('div', { class: 'column-scan__ok' }, icon('status.ok', { size: 'sm' }), ` ${tt('scanAllMatch')}`));
    }
    body.replaceChildren(...parts);
  }

  return {
    open,
    close,
    headerItems,
    rowItems,
    cellItems,
    openAttrPicker,
    showStats,
    showScan,
    /** @returns {boolean} ein Menü oder die Auswahl am Kopf ist offen */
    isOpen: () => Boolean(menu || picker),
    /** Zeichnet offene Auswahl und Scan nach einer Datenänderung neu. */
    refresh() {
      renderPicker();
      renderScan();
    },
    destroy() {
      close();
      closePicker();
      stats?.close();
      scan?.handle.close();
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
    },
  };
}
