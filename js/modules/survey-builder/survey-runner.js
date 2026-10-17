/**
 * D.Mike — Survey runner (survey-runner.js)
 *
 * Drives the exported questionnaire page and the editor preview. The
 * exported page rebuilds runSurvey from Function.prototype.toString(), so
 * this file imports nothing and runSurvey must not reference any identifier
 * outside its own body. The condition logic is a copy of
 * survey-conditions.js; the case table in
 * tests/modules/fixtures/survey-condition-cases.js runs against both.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md §5.2, §5.3
 */

/**
 * Fixed light, print-friendly stylesheet of the exported page. The page
 * leaves the app, so app custom properties do not exist there.
 * @type {string}
 */
export const RUNNER_CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#f4f5f7;color:#1f2328;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sv{max-width:72rem;margin:0 auto;padding:2rem 1.25rem 4rem}
.sv-head,.sv-section{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:1.25rem 1.5rem;margin-bottom:1rem}
.sv-title{margin:0 0 .5rem;font-size:1.6rem}
.sv-intro,.sv-contact,.sv-anonymous{margin:.5rem 0;white-space:pre-line}
.sv-anonymous{color:#57606a}
.sv-progress{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:.75rem;background:#f4f5f7;padding:.5rem 0;margin-bottom:1rem}
.sv-progress__bar{flex:1;height:.5rem;background:#d0d7de;border-radius:4px;overflow:hidden}
.sv-progress__fill{height:100%;width:0;background:#1f6feb;transition:width .2s}
.sv-progress__text{font-size:.875rem;color:#57606a;white-space:nowrap}
.sv-section__title{margin:0 0 .25rem;font-size:1.25rem}
.sv-section__hint,.sv-q__hint,.sv-legend{margin:.25rem 0 .75rem;color:#57606a;font-size:.9rem;white-space:pre-line}
.sv-q{padding:.75rem 0;border-top:1px solid #eaeef2}
.sv-q__head{display:flex;gap:.5rem;font-weight:600;white-space:pre-line}
.sv-q__req{color:#cf222e}
.sv-q--info .sv-q__head{font-weight:400}
.sv-q--missing{background:#fff5f5;box-shadow:inset 3px 0 0 #cf222e;padding-left:.75rem}
.sv-options{display:flex;flex-direction:column;gap:.35rem;margin-top:.5rem}
.sv-option{display:flex;align-items:center;gap:.5rem}
.sv-group{margin-top:.5rem;font-weight:600;font-size:.9rem;color:#57606a}
.sv-other{flex:1;min-width:10rem}
.sv-table{border-collapse:collapse;margin-top:.5rem;width:100%}
.sv-table th,.sv-table td{border-bottom:1px solid #eaeef2;padding:.35rem .5rem;text-align:center;font-weight:400}
.sv-table thead th{font-size:.85rem;color:#57606a}
.sv-table .sv-table__row{text-align:left}
.sv-table select{max-width:100%}
.sv-table--kano{table-layout:fixed}
.sv-table--kano thead .sv-table__row{width:25%}
.sv-table--kano select{width:100%}
input[type=text],textarea,select{font:inherit;padding:.35rem .5rem;border:1px solid #afb8c1;border-radius:6px;background:#fff;color:inherit}
.sv-text{width:100%;margin-top:.5rem}
.sv-actions{display:flex;gap:.75rem;margin-top:1.5rem}
.sv-actions button{font:inherit;padding:.6rem 1.2rem;border-radius:6px;border:1px solid #afb8c1;background:#fff;color:#1f2328;cursor:pointer}
.sv-actions .sv-save{background:#1f6feb;border-color:#1f6feb;color:#fff}
.sv-message{min-height:1.5rem}
.sv-message--error{color:#cf222e}
.sv-message--ok{color:#1a7f37}
[hidden]{display:none!important}
@media print{body{background:#fff}.sv-progress,.sv-actions,.sv-message{display:none}.sv-head,.sv-section{border:0;padding:0}.sv-q{break-inside:avoid}}
`;

/**
 * Render and run a questionnaire, or (logicOnly) return its pure logic.
 * @param {object} def survey definition (State.survey)
 * @param {object} strings runner strings, see runnerStrings() in survey-export.js
 * @param {object} [opts]
 * @param {boolean} [opts.logicOnly] return the logic without touching the DOM
 * @param {string|null} [opts.recipientId]
 * @param {Element} [opts.root] defaults to document.body
 * @param {Storage|null} [opts.storage] defaults to window.localStorage
 * @param {(name: string, text: string) => void} [opts.download]
 * @param {(message: string) => boolean} [opts.confirm]
 * @param {() => Date} [opts.now]
 * @returns {{isVisible: Function, isAnswered: Function, missing: Function, visibleAnswers: Function}}
 */
export function runSurvey(def, strings, opts) {
  const o = opts || {};
  const S = strings || {};
  const sections = Array.isArray(def && def.sections) ? def.sections : [];
  const order = [];
  const byId = {};
  const sectionOf = {};
  sections.forEach((sec) => (sec.questions || []).forEach((q) => {
    order.push(q);
    byId[q.id] = q;
    sectionOf[q.id] = sec;
  }));

  // ─── Logic (copy of survey-conditions.js) ──────────────────

  function hasOption(answer, ids) {
    if (answer == null) return false;
    if (typeof answer === 'string') return ids.indexOf(answer) >= 0;
    if (Array.isArray(answer.ids)) return answer.ids.some((id) => ids.indexOf(id) >= 0);
    return false;
  }

  function holds(when, answers) {
    if (!Array.isArray(when) || when.length === 0) return true;
    return when.some((c) => {
      const src = byId[c.questionId];
      return Boolean(src) && isVisible(src, answers) && hasOption(answers[c.questionId], c.optionIds || []);
    });
  }

  function isVisible(node, answers) {
    const a = answers || {};
    if (!node) return false;
    if (!Array.isArray(node.questions)) {
      const sec = sectionOf[node.id];
      if (sec && !holds(sec.when, a)) return false;
    }
    return holds(node.when, a);
  }

  const filled = (v) => typeof v === 'string' && v.trim() !== '';
  const onScale = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;

  function isAnswered(q, a) {
    if (a == null) return false;
    const rows = q.rows || [];
    if (q.type === 'single') {
      return typeof a === 'string' ? (q.options || []).some((x) => x.id === a) : filled(a.other);
    }
    if (q.type === 'multi') return (Array.isArray(a.ids) && a.ids.length > 0) || filled(a.other);
    if (q.type === 'rating') {
      return rows.length > 0 && rows.every((r) => onScale(a[r.id], 5) || (Boolean(q.noAnswer) && a[r.id] === 'na'));
    }
    if (q.type === 'kano') {
      return rows.length > 0 && rows.every((r) => {
        const v = a[r.id];
        return Boolean(v) && onScale(v.f, 5) && onScale(v.d, 5) && (!q.importance || onScale(v.w, 9));
      });
    }
    if (q.type === 'text') return filled(a);
    return false;
  }

  function missing(answers) {
    const a = answers || {};
    return order
      .filter((q) => q.required && q.type !== 'info' && isVisible(q, a) && !isAnswered(q, a[q.id]))
      .map((q) => q.id);
  }

  function visibleAnswers(answers) {
    const a = answers || {};
    const out = {};
    order.forEach((q) => {
      if (q.type !== 'info' && a[q.id] != null && isVisible(q, a)) out[q.id] = a[q.id];
    });
    return out;
  }

  const logic = { isVisible, isAnswered, missing, visibleAnswers };
  if (o.logicOnly) return logic;

  // ─── Page ───────────────────────────────────────────────────

  const doc = o.root && o.root.ownerDocument ? o.root.ownerDocument : document;
  const root = o.root || doc.body;
  const now = o.now || (() => new Date());
  const ask = o.confirm || ((message) => window.confirm(message));
  const storage = 'storage' in o ? o.storage : (() => {
    try { return window.localStorage; } catch (_e) { return null; }
  })();
  const download = o.download || ((name, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const fmt = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const pad = (v) => String(v).padStart(2, '0');

  function el(tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null && text !== '') n.textContent = String(text);
    return n;
  }

  function store(fn) {
    try { return storage ? fn(storage) : null; } catch (_e) { return null; }
  }

  // Each builder returns { node, read, write }; read() is null when nothing is entered.

  function choiceField(q) {
    const multi = q.type === 'multi';
    const box = el('div', 'sv-options');
    const inputs = [];
    const name = 'q-' + q.id;
    let group = null;
    function option(value, labelText, extra) {
      const label = el('label', 'sv-option');
      const input = el('input');
      input.type = multi ? 'checkbox' : 'radio';
      input.name = name;
      input.value = value;
      label.appendChild(input);
      label.appendChild(el('span', '', labelText));
      if (extra) label.appendChild(extra);
      box.appendChild(label);
      inputs.push(input);
      return input;
    }
    (q.options || []).forEach((opt) => {
      if (multi && opt.group && opt.group !== group) box.appendChild(el('div', 'sv-group', opt.group));
      group = opt.group || null;
      option(opt.id, opt.text);
    });
    let otherText = null;
    if (q.other) {
      otherText = el('input', 'sv-other');
      otherText.type = 'text';
      otherText.setAttribute('aria-label', S.other || '');
      const otherInput = option('__other', S.other, otherText);
      otherText.addEventListener('input', () => { if (otherText.value.trim()) otherInput.checked = true; });
    }
    return {
      node: box,
      read() {
        const checked = inputs.filter((i) => i.checked).map((i) => i.value);
        const other = otherText && checked.indexOf('__other') >= 0 && otherText.value.trim()
          ? otherText.value.trim() : null;
        const ids = checked.filter((v) => v !== '__other');
        if (!multi) return ids.length ? ids[0] : (other ? { other } : null);
        return ids.length || other ? { ids, other } : null;
      },
      write(a) {
        const ids = a == null ? [] : typeof a === 'string' ? [a] : Array.isArray(a.ids) ? a.ids : [];
        const other = a && typeof a === 'object' && typeof a.other === 'string' ? a.other : '';
        inputs.forEach((i) => { i.checked = i.value === '__other' ? Boolean(other) : ids.indexOf(i.value) >= 0; });
        if (otherText) otherText.value = other;
      },
    };
  }

  function ratingField(q) {
    const values = [1, 2, 3, 4, 5].concat(q.noAnswer ? ['na'] : []);
    const table = el('table', 'sv-table');
    const thead = el('thead');
    const head = el('tr');
    head.appendChild(el('th', 'sv-table__row'));
    values.forEach((v) => head.appendChild(el('th', '', v === 'na' ? S.noAnswer : String(v))));
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = el('tbody');
    const cells = {};
    (q.rows || []).forEach((row) => {
      const tr = el('tr');
      tr.setAttribute('data-row-id', row.id);
      tr.appendChild(el('th', 'sv-table__row', row.text));
      cells[row.id] = values.map((v) => {
        const td = el('td');
        const input = el('input');
        input.type = 'radio';
        input.name = 'q-' + q.id + '-' + row.id;
        input.value = String(v);
        input.setAttribute('aria-label', row.text + ': ' + (v === 'na' ? S.noAnswer : v));
        td.appendChild(input);
        tr.appendChild(td);
        return input;
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const node = el('div');
    if (S.ratingLegend) node.appendChild(el('p', 'sv-legend', S.ratingLegend));
    node.appendChild(table);
    return {
      node,
      read() {
        const out = {};
        let any = false;
        Object.keys(cells).forEach((rowId) => {
          const hit = cells[rowId].find((i) => i.checked);
          if (hit) { out[rowId] = hit.value === 'na' ? 'na' : Number(hit.value); any = true; }
        });
        return any ? out : null;
      },
      write(a) {
        Object.keys(cells).forEach((rowId) => {
          const v = a && a[rowId] != null ? String(a[rowId]) : null;
          cells[rowId].forEach((i) => { i.checked = i.value === v; });
        });
      },
    };
  }

  function scaleSelect(labels, cls, aria) {
    const s = el('select', cls);
    s.setAttribute('aria-label', aria);
    const empty = el('option', '', S.kanoEmpty || '-');
    empty.value = '';
    s.appendChild(empty);
    labels.forEach((text, i) => {
      const op = el('option', '', text);
      op.value = String(i + 1);
      s.appendChild(op);
    });
    return s;
  }

  function kanoField(q) {
    const scale = Array.isArray(S.kanoScale) ? S.kanoScale : ['1', '2', '3', '4', '5'];
    const importance = Array.isArray(S.kanoImportanceScale)
      ? S.kanoImportanceScale : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const table = el('table', 'sv-table sv-table--kano');
    const thead = el('thead');
    const head = el('tr');
    [S.kanoItem, S.kanoFunctional, S.kanoDysfunctional].concat(q.importance ? [S.kanoImportance] : [])
      .forEach((t, i) => head.appendChild(el('th', i === 0 ? 'sv-table__row' : '', t)));
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = el('tbody');
    const rows = {};
    (q.rows || []).forEach((row) => {
      const tr = el('tr');
      tr.setAttribute('data-row-id', row.id);
      tr.appendChild(el('th', 'sv-table__row', row.text));
      const cell = {
        f: scaleSelect(scale, 'sv-kano-f', row.text + ': ' + (S.kanoFunctional || '')),
        d: scaleSelect(scale, 'sv-kano-d', row.text + ': ' + (S.kanoDysfunctional || '')),
        w: q.importance ? scaleSelect(importance, 'sv-kano-w', row.text + ': ' + (S.kanoImportance || '')) : null,
      };
      [cell.f, cell.d, cell.w].filter(Boolean).forEach((s) => {
        const td = el('td');
        td.appendChild(s);
        tr.appendChild(td);
      });
      rows[row.id] = cell;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const num = (s) => (s && s.value ? Number(s.value) : null);
    return {
      node: table,
      read() {
        const out = {};
        let any = false;
        Object.keys(rows).forEach((rowId) => {
          const c = rows[rowId];
          const v = { f: num(c.f), d: num(c.d), w: num(c.w) };
          if (v.f != null || v.d != null || v.w != null) { out[rowId] = v; any = true; }
        });
        return any ? out : null;
      },
      write(a) {
        Object.keys(rows).forEach((rowId) => {
          const v = a && a[rowId] ? a[rowId] : {};
          ['f', 'd', 'w'].forEach((k) => { if (rows[rowId][k]) rows[rowId][k].value = v[k] != null ? String(v[k]) : ''; });
        });
      },
    };
  }

  function textField(q) {
    const input = el(q.multiline ? 'textarea' : 'input', 'sv-text');
    if (q.multiline) input.rows = 4; else input.type = 'text';
    input.setAttribute('aria-label', q.text || '');
    return {
      node: input,
      read: () => (input.value.trim() ? input.value.trim() : null),
      write(a) { input.value = typeof a === 'string' ? a : ''; },
    };
  }

  root.textContent = '';
  const page = el('main', 'sv');
  const head = el('header', 'sv-head');
  head.appendChild(el('h1', 'sv-title', def.title || S.untitled));
  if (def.intro) head.appendChild(el('p', 'sv-intro', def.intro));
  if (def.anonymous) head.appendChild(el('p', 'sv-anonymous', S.anonymousNote));
  if (def.contact) head.appendChild(el('p', 'sv-contact', fmt(S.contact, { contact: def.contact })));
  page.appendChild(head);

  const progress = el('div', 'sv-progress');
  const bar = el('div', 'sv-progress__bar');
  const fill = el('div', 'sv-progress__fill');
  const progressText = el('span', 'sv-progress__text');
  bar.appendChild(fill);
  progress.appendChild(bar);
  progress.appendChild(progressText);
  page.appendChild(progress);

  const fields = {};
  const boxes = {};
  const sectionNodes = [];
  sections.forEach((sec) => {
    const sn = el('section', 'sv-section');
    sn.setAttribute('data-section-id', sec.id);
    if (sec.title) sn.appendChild(el('h2', 'sv-section__title', sec.title));
    if (sec.hint) sn.appendChild(el('p', 'sv-section__hint', sec.hint));
    (sec.questions || []).forEach((q) => {
      const box = el('div', 'sv-q sv-q--' + q.type);
      box.setAttribute('data-question-id', q.id);
      const qh = el('div', 'sv-q__head');
      const numNode = el('span', 'sv-q__num');
      qh.appendChild(numNode);
      qh.appendChild(el('span', 'sv-q__text', q.text));
      if (q.required && q.type !== 'info') {
        const req = el('span', 'sv-q__req', '*');
        req.title = S.required || '';
        qh.appendChild(req);
      }
      box.appendChild(qh);
      if (q.hint) box.appendChild(el('p', 'sv-q__hint', q.hint));
      const field = q.type === 'single' || q.type === 'multi' ? choiceField(q)
        : q.type === 'rating' ? ratingField(q)
          : q.type === 'kano' ? kanoField(q)
            : q.type === 'text' ? textField(q) : null;
      if (field) {
        box.appendChild(field.node);
        fields[q.id] = field;
      }
      boxes[q.id] = { box, numNode };
      sn.appendChild(box);
    });
    sectionNodes.push({ sec, node: sn });
    page.appendChild(sn);
  });

  const actions = el('div', 'sv-actions');
  const saveButton = el('button', 'sv-save', S.save);
  saveButton.type = 'button';
  const resetButton = el('button', 'sv-reset', S.reset);
  resetButton.type = 'button';
  actions.appendChild(saveButton);
  actions.appendChild(resetButton);
  const message = el('p', 'sv-message');
  message.setAttribute('role', 'status');
  page.appendChild(actions);
  page.appendChild(message);
  root.appendChild(page);

  const draftKey = 'dmike-survey:' + def.id + ':' + (o.recipientId || 'general');

  function readAll() {
    const out = {};
    Object.keys(fields).forEach((id) => {
      const v = fields[id].read();
      if (v != null) out[id] = v;
    });
    return out;
  }

  function refresh() {
    const answers = readAll();
    sectionNodes.forEach((s) => { s.node.hidden = !isVisible(s.sec, answers); });
    let n = 0;
    let total = 0;
    let done = 0;
    order.forEach((q) => {
      const visible = isVisible(q, answers);
      const b = boxes[q.id];
      b.box.hidden = !visible;
      if (visible && q.type !== 'info') n += 1;
      b.numNode.textContent = visible && q.type !== 'info' ? n + '.' : '';
      if (visible && q.required && q.type !== 'info') {
        total += 1;
        if (isAnswered(q, answers[q.id])) {
          done += 1;
          b.box.classList.remove('sv-q--missing');
        }
      }
    });
    fill.style.width = total ? Math.round((done / total) * 100) + '%' : '100%';
    progressText.textContent = fmt(S.progress, { answered: done, total });
    store((s) => s.setItem(draftKey, JSON.stringify({ version: def.version, answers })));
    return answers;
  }

  function responseId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_e) { /* insecure context: fall through */ }
    let hex = '';
    for (let i = 0; i < 16; i += 1) hex += Math.floor(Math.random() * 16).toString(16);
    return Date.now().toString(36) + '-' + hex;
  }

  saveButton.addEventListener('click', () => {
    const answers = refresh();
    const miss = missing(answers);
    order.forEach((q) => boxes[q.id].box.classList.toggle('sv-q--missing', miss.indexOf(q.id) >= 0));
    if (miss.length) {
      const first = boxes[miss[0]].box;
      if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center' });
      message.textContent = fmt(miss.length === 1 ? S.missingOne : S.missingOther, { count: miss.length });
      message.className = 'sv-message sv-message--error';
      return;
    }
    const t = now();
    const title = String(def.title || '').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    const stamp = '' + t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) + '_' + pad(t.getHours()) + pad(t.getMinutes());
    const name = [S.fileAnswers, title, stamp].filter(Boolean).join('_') + '.json';
    const response = {
      format: 'dmike-survey-response',
      formatVersion: 1,
      surveyId: def.id,
      surveyVersion: def.version,
      recipientId: o.recipientId || null,
      responseId: responseId(),
      submittedAt: t.toISOString(),
      answers: visibleAnswers(answers),
    };
    download(name, JSON.stringify(response, null, 2));
    message.textContent = fmt(S.saved, { file: name });
    message.className = 'sv-message sv-message--ok';
  });

  resetButton.addEventListener('click', () => {
    if (!ask(S.resetConfirm)) return;
    Object.keys(fields).forEach((id) => fields[id].write(null));
    order.forEach((q) => boxes[q.id].box.classList.remove('sv-q--missing'));
    message.textContent = '';
    message.className = 'sv-message';
    refresh();
    store((s) => s.removeItem(draftKey));
  });

  page.addEventListener('change', refresh);
  page.addEventListener('input', refresh);

  const draft = store((s) => s.getItem(draftKey));
  if (draft) {
    try {
      const saved = JSON.parse(draft);
      if (saved && saved.answers && typeof saved.answers === 'object') {
        Object.keys(fields).forEach((id) => fields[id].write(saved.answers[id]));
      }
    } catch (_e) { /* broken draft: start empty */ }
  }
  refresh();
  return logic;
}
