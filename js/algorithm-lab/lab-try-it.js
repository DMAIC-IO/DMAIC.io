/**
 * Algorithm Lab — Try-It Panel
 * Interactive panel: Manual input, Fixture selection, CSV import.
 * Executes algorithm and displays results with comparison.
 */

const MODES = ['manual', 'fixture', 'csv'];

export class LabTryIt {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   * @param {import('../core/i18n.js').I18n} opts.i18n
   * @param {import('./lab-registry.js').LabRegistry} opts.registry
   * @param {function(object): function} opts.buildFunction
   * @param {function(number, number, object): boolean} opts.compare
   */
  constructor(container, { i18n, registry, buildFunction, compare, loc }) {
    this._container = container;
    this._i18n = i18n;
    this._registry = registry;
    this._buildFunction = buildFunction;
    this._compare = compare;
    this._loc = loc || ((v) => (typeof v === 'string' ? v : ''));
    this._currentAlgo = null;
    this._currentMode = 'manual';
    this._fixtures = null;
  }

  /**
   * Render the try-it panel for an algorithm.
   * @param {object} algo
   */
  async render(algo) {
    this._currentAlgo = algo;
    this._container.innerHTML = '';
    this._container.classList.add('lab__tryit');

    // Header
    const header = document.createElement('div');
    header.className = 'lab__tryit-header';
    header.innerHTML = `<h3>${this._i18n.t('lab.tryIt.title')}</h3>`;
    this._container.append(header);

    // Mode tabs
    const modes = document.createElement('div');
    modes.className = 'lab__tryit-modes';
    for (const mode of MODES) {
      const btn = document.createElement('button');
      btn.className = 'lab__tryit-mode';
      btn.dataset.mode = mode;
      btn.textContent = this._i18n.t(`lab.tryIt.mode.${mode}`);
      if (mode === this._currentMode) btn.classList.add('lab__tryit-mode--active');
      modes.append(btn);
    }
    this._container.append(modes);

    modes.addEventListener('click', (e) => {
      const btn = e.target.closest('.lab__tryit-mode');
      if (!btn) return;
      this._currentMode = btn.dataset.mode;
      modes.querySelectorAll('.lab__tryit-mode').forEach(b =>
        b.classList.toggle('lab__tryit-mode--active', b.dataset.mode === this._currentMode)
      );
      this._renderInputArea();
    });

    // Input area
    this._inputArea = document.createElement('div');
    this._inputArea.className = 'lab__tryit-input';
    this._container.append(this._inputArea);

    // Run button
    const actions = document.createElement('div');
    actions.className = 'lab__tryit-actions';
    this._runBtn = document.createElement('button');
    this._runBtn.className = 'btn btn--primary lab__tryit-run';
    this._runBtn.textContent = this._i18n.t('lab.tryIt.run');
    this._runBtn.addEventListener('click', () => this._execute());
    actions.append(this._runBtn);
    this._container.append(actions);

    // Output area
    this._outputArea = document.createElement('div');
    this._outputArea.className = 'lab__tryit-output';
    this._container.append(this._outputArea);

    // Load fixtures in background
    this._fixtures = await this._registry.getFixtures(algo.id);
    this._renderInputArea();
  }

  // ── Internal ──────────────────────────────────────────────

  _renderInputArea() {
    this._inputArea.innerHTML = '';
    switch (this._currentMode) {
      case 'manual': this._renderManualInputs(); break;
      case 'fixture': this._renderFixtureSelect(); break;
      case 'csv': this._renderCsvImport(); break;
    }
  }

  /**
   * Manual mode: generate form fields from try_it.input_schema.
   */
  _renderManualInputs() {
    const schema = this._currentAlgo.try_it?.input_schema;
    if (!schema?.fields) {
      this._inputArea.innerHTML = `<div class="lab__empty">${this._i18n.t('lab.tryIt.noSchema')}</div>`;
      return;
    }

    for (const field of schema.fields) {
      const group = document.createElement('div');
      group.className = 'field-group';

      const label = document.createElement('label');
      label.textContent = this._loc(field.label);
      if (field.required) {
        const req = document.createElement('span');
        req.className = 'lab__tryit-required';
        req.textContent = ' *';
        label.append(req);
      }
      group.append(label);

      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.className = 'field lab__tryit-textarea';
        input.rows = 4;
      } else {
        input = document.createElement('input');
        input.className = 'field lab__tryit-input-field';
        input.type = field.type === 'number' ? 'number' : 'text';
      }
      input.name = field.name;
      input.placeholder = this._loc(field.placeholder) || '';
      input.dataset.parseAs = field.parse_as || '';
      group.append(input);
      this._inputArea.append(group);
    }
  }

  /**
   * Fixture mode: dropdown to pick a test case.
   */
  _renderFixtureSelect() {
    if (!this._fixtures?.test_cases?.length) {
      this._inputArea.innerHTML = `<div class="lab__empty">${this._i18n.t('lab.tryIt.noFixtures')}</div>`;
      return;
    }

    const group = document.createElement('div');
    group.className = 'field-group';

    const label = document.createElement('label');
    label.textContent = this._i18n.t('lab.tryIt.selectFixture');
    group.append(label);

    const select = document.createElement('select');
    select.className = 'field lab__tryit-select';
    select.name = '__fixture_id';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = `— ${this._i18n.t('lab.tryIt.chooseFixture')} —`;
    select.append(defaultOpt);

    for (const tc of this._fixtures.test_cases) {
      const opt = document.createElement('option');
      opt.value = tc.id;
      opt.textContent = `[${tc.tier}] ${tc.id} — ${tc.description}`;
      select.append(opt);
    }

    group.append(select);
    this._inputArea.append(group);

    // Preview area for selected fixture
    const preview = document.createElement('div');
    preview.className = 'lab__tryit-preview';
    this._inputArea.append(preview);

    select.addEventListener('change', () => {
      const tc = this._fixtures.test_cases.find(t => t.id === select.value);
      if (!tc) { preview.innerHTML = ''; return; }
      preview.innerHTML = `
        <div class="lab__tryit-preview-section">
          <strong>${this._i18n.t('lab.tryIt.inputs')}:</strong>
          <pre class="lab__tryit-json">${JSON.stringify(tc.inputs, null, 2)}</pre>
        </div>
        ${tc.expected ? `<div class="lab__tryit-preview-section">
          <strong>${this._i18n.t('lab.tryIt.expected')}:</strong>
          <pre class="lab__tryit-json">${JSON.stringify(tc.expected, null, 2)}</pre>
        </div>` : ''}
        ${tc.expected_error ? `<div class="lab__tryit-preview-section">
          <strong>${this._i18n.t('lab.tryIt.expectedError')}:</strong>
          <pre class="lab__tryit-json">${JSON.stringify(tc.expected_error, null, 2)}</pre>
        </div>` : ''}
      `;
    });
  }

  /**
   * CSV mode: file input + paste area.
   */
  _renderCsvImport() {
    const group = document.createElement('div');
    group.className = 'field-group';

    const label = document.createElement('label');
    label.textContent = this._i18n.t('lab.tryIt.csvData');
    group.append(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'field lab__tryit-textarea lab__tryit-csv';
    textarea.rows = 6;
    textarea.name = '__csv_data';
    textarea.placeholder = this._i18n.t('lab.tryIt.csvPlaceholder');
    group.append(textarea);

    // File input
    const fileRow = document.createElement('div');
    fileRow.className = 'lab__tryit-file-row';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.txt';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      textarea.value = await file.text();
    });
    fileRow.append(fileInput);
    group.append(fileRow);

    this._inputArea.append(group);

    // Parameter fields (LSL, USL etc.) from schema — same as manual but without data field
    const schema = this._currentAlgo.try_it?.input_schema;
    if (schema?.fields) {
      for (const field of schema.fields) {
        if (field.parse_as === 'number_array') continue; // data comes from CSV
        const fg = document.createElement('div');
        fg.className = 'field-group';
        const lbl = document.createElement('label');
        lbl.textContent = this._loc(field.label);
        fg.append(lbl);
        const input = document.createElement('input');
        input.className = 'field lab__tryit-input-field';
        input.type = field.type === 'number' ? 'number' : 'text';
        input.name = field.name;
        input.placeholder = this._loc(field.placeholder) || '';
        fg.append(input);
        this._inputArea.append(fg);
      }
    }
  }

  /**
   * Execute the algorithm with current inputs.
   */
  async _execute() {
    this._runBtn.disabled = true;
    this._outputArea.innerHTML = '';

    let inputs;
    let expectedResult = null;
    let expectedError = null;
    let tolerances = null;

    try {
      switch (this._currentMode) {
        case 'manual':
          inputs = this._collectManualInputs();
          break;
        case 'fixture':
          ({ inputs, expectedResult, expectedError, tolerances } = this._collectFixtureInputs());
          break;
        case 'csv':
          inputs = this._collectCsvInputs();
          break;
      }
    } catch (err) {
      this._showError(err.message);
      this._runBtn.disabled = false;
      return;
    }

    // Build and execute function
    let fn;
    try {
      fn = await this._buildFunction(this._currentAlgo);
    } catch (err) {
      this._showError(`Build error: ${err.message}`);
      this._runBtn.disabled = false;
      return;
    }

    const start = performance.now();
    let result = null;
    let error = null;

    try {
      const args = this._mapArgs(this._currentAlgo, inputs);
      result = fn(...args);
    } catch (e) {
      error = { type: e.constructor.name, message: e.message };
    }

    const duration = performance.now() - start;
    this._renderOutput(result, error, duration, expectedResult, expectedError, tolerances);
    this._runBtn.disabled = false;
  }

  /**
   * Map inputs to function arguments in the order defined by signature.parameters.
   *
   * Special case: if the signature has exactly one parameter and its name is not
   * a top-level key in `inputs`, pass the whole `inputs` object as that argument.
   * This lets flat fixture shapes (e.g. {function, x, mu}) be forwarded directly
   * to a single-object dispatcher like math-utils `evaluate(inputs)`.
   */
  _mapArgs(algo, inputs) {
    const params = algo.source?.signature?.parameters;
    if (params && params.length > 0) {
      if (params.length === 1 && !(params[0].name in (inputs || {}))) {
        return [inputs];
      }
      return params.map(p => inputs[p.name]);
    }
    return [inputs.data, inputs.lsl, inputs.usl];
  }

  _collectManualInputs() {
    const schema = this._currentAlgo.try_it?.input_schema;
    if (!schema?.fields) throw new Error('No input schema');

    const inputs = {};
    for (const field of schema.fields) {
      const el = this._inputArea.querySelector(`[name="${field.name}"]`);
      if (!el) continue;
      const raw = el.value.trim();

      if (field.required && !raw) {
        throw new Error(`${this._loc(field.label)} ${this._i18n.t('lab.tryIt.isRequired')}`);
      }

      let value;
      if (field.parse_as === 'number_array') {
        value = this._parseNumberArray(raw);
      } else if (field.parse_as === 'string_array') {
        value = this._parseStringArray(raw);
      } else if (field.parse_as === 'json') {
        try { value = raw ? JSON.parse(raw) : undefined; }
        catch { throw new Error(`${this._loc(field.label)}: invalid JSON`); }
      } else if (field.type === 'number' || field.parse_as === 'number') {
        value = raw ? parseFloat(raw) : undefined;
      } else {
        value = raw;
      }

      // Support dotted names like "data.parts" → { data: { parts: ... } }
      this._setByPath(inputs, field.name, value);
    }
    return inputs;
  }

  _collectFixtureInputs() {
    const select = this._inputArea.querySelector('select[name="__fixture_id"]');
    const fixtureId = select?.value;
    if (!fixtureId) throw new Error('Please select a fixture');

    const tc = this._fixtures.test_cases.find(t => t.id === fixtureId);
    if (!tc) throw new Error('Fixture not found');

    const tol = tc.tolerance_override
      ? this._fixtures.tolerances.overrides[tc.tolerance_override]
      : this._fixtures.tolerances.default;

    return {
      inputs: { ...tc.inputs },
      expectedResult: tc.expected || null,
      expectedError: tc.expected_error || null,
      tolerances: tol,
    };
  }

  _collectCsvInputs() {
    const textarea = this._inputArea.querySelector('[name="__csv_data"]');
    const csvText = textarea?.value?.trim();
    if (!csvText) throw new Error('Please provide CSV data');

    // Parse CSV: assume first column is numeric data
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    const data = [];
    for (const line of lines) {
      const vals = line.split(/[,;\t]/).map(v => v.trim()).filter(v => v);
      for (const v of vals) {
        const n = parseFloat(v);
        if (!isNaN(n)) data.push(n);
      }
    }

    if (data.length === 0) throw new Error('No numeric values found in CSV');

    // Collect additional parameters
    const inputs = { data };
    const schema = this._currentAlgo.try_it?.input_schema;
    if (schema?.fields) {
      for (const field of schema.fields) {
        if (field.parse_as === 'number_array') continue;
        const el = this._inputArea.querySelector(`[name="${field.name}"]`);
        if (!el) continue;
        const raw = el.value.trim();
        if (field.type === 'number' && raw) {
          inputs[field.name] = parseFloat(raw);
        }
      }
    }
    return inputs;
  }

  _parseStringArray(raw) {
    if (!raw) return [];
    return raw.split(/[,;\t\n]+/)
      .map(v => v.trim())
      .filter(v => v);
  }

  _setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in cur)) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  _parseNumberArray(raw) {
    if (!raw) return [];
    // Split by comma, space, newline, semicolon, tab
    return raw.split(/[,;\s\t\n]+/)
      .map(v => v.trim())
      .filter(v => v)
      .map(v => {
        const n = parseFloat(v);
        if (isNaN(n)) throw new Error(`Invalid number: "${v}"`);
        return n;
      });
  }

  /**
   * Render execution results.
   */
  _renderOutput(result, error, duration, expectedResult, expectedError, tolerances) {
    this._outputArea.innerHTML = '';
    this._outputArea.className = 'lab__tryit-output';

    // Duration
    const durEl = document.createElement('div');
    durEl.className = 'lab__tryit-duration';
    durEl.textContent = `${duration.toFixed(2)} ms`;
    this._outputArea.append(durEl);

    if (error) {
      const errEl = document.createElement('div');
      errEl.className = 'lab__tryit-error';
      errEl.innerHTML = `<strong>${error.type}:</strong> ${error.message}`;

      // Check against expected error if in fixture mode
      if (expectedError) {
        const pass = error.type === expectedError.type &&
          error.message.includes(expectedError.message_contains);
        const badge = document.createElement('span');
        badge.className = pass ? 'lab__tryit-badge lab__tryit-badge--pass' : 'lab__tryit-badge lab__tryit-badge--fail';
        badge.textContent = pass ? 'EXPECTED' : 'UNEXPECTED';
        errEl.prepend(badge);
      }

      this._outputArea.append(errEl);
      return;
    }

    if (!result) {
      this._outputArea.innerHTML = '<div class="lab__empty">No result</div>';
      return;
    }

    // If we expected an error but didn't get one
    if (expectedError) {
      const warn = document.createElement('div');
      warn.className = 'lab__tryit-error';
      warn.innerHTML = `<span class="lab__tryit-badge lab__tryit-badge--fail">FAIL</span> Expected ${expectedError.type} but got a result`;
      this._outputArea.append(warn);
    }

    // Result table
    const outputSchema = this._currentAlgo.try_it?.output_schema;
    const fields = outputSchema?.display_fields || Object.keys(result);
    const format = outputSchema?.format || {};
    const primary = outputSchema?.primary_field;

    const table = document.createElement('table');
    table.className = 'lab__tryit-results';

    // Header row
    const hasExpected = !!expectedResult;
    let headHTML = `<thead><tr><th>${this._i18n.t('lab.source.field')}</th><th>${this._i18n.t('lab.tryIt.value')}</th>`;
    if (hasExpected) headHTML += `<th>${this._i18n.t('lab.tryIt.expected')}</th><th>${this._i18n.t('lab.tryIt.match')}</th>`;
    headHTML += '</tr></thead>';
    table.innerHTML = headHTML;

    const tbody = document.createElement('tbody');

    for (const key of fields) {
      const val = this._getByPath(result, key);
      const fmt = format[key];
      const decimals = fmt?.decimals ?? 6;
      const label = fmt?.label ? this._loc(fmt.label) : key;
      const displayVal = typeof val === 'number' ? val.toFixed(decimals) : String(val);

      const row = document.createElement('tr');
      if (key === primary) row.classList.add('lab__tryit-primary');

      let html = `<td>${label}</td><td class="lab__tryit-value">${displayVal}</td>`;

      if (hasExpected && expectedResult[key] !== undefined) {
        const exp = expectedResult[key];
        const displayExp = typeof exp === 'number' ? exp.toFixed(decimals) : String(exp);
        const pass = tolerances ? this._compare(val, exp, tolerances) : val === exp;
        html += `<td class="lab__tryit-value">${displayExp}</td>`;
        html += `<td class="${pass ? 'lab__test-pass' : 'lab__test-fail'}">${pass ? '✓' : '✗'}</td>`;
      } else if (hasExpected) {
        html += '<td>—</td><td>—</td>';
      }

      row.innerHTML = html;
      tbody.append(row);
    }

    table.append(tbody);
    this._outputArea.append(table);
  }

  _getByPath(obj, path) {
    if (obj == null) return undefined;
    if (path in obj) return obj[path];
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  _showError(msg) {
    this._outputArea.innerHTML = `<div class="lab__tryit-error">${msg}</div>`;
  }
}
