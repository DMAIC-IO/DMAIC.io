/**
 * Algorithm Lab — Try-It nested Alpine component.
 * Manual / fixture / CSV input → run → result table. Reads `selectedAlgo`
 * from the parent algorithmLab scope.
 */
import {
  buildFunction, mapArgs, getByPath, compare,
  parseNumberArray, parseStringArray, setByPath, parseCsvNumbers,
} from './lab-exec.js';

const MODES = ['manual', 'fixture', 'csv'];

function locValue(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value[lang] ?? value.en ?? value.de ?? '';
  return String(value);
}

export function createTryItComponent({ registry, i18n, eventBus }) {
  return {
    MODES,
    lang: i18n.getLanguage(),
    algo: null,
    mode: 'manual',
    fixtures: null,
    manual: {},          // field.name → string value (x-model)
    fixtureId: '',
    csvText: '',
    csvParams: {},       // field.name → string value
    output: null,        // { duration, error?, rows?, noResult?, expectedMissError? }

    init() {
      this._onLang = () => { this.lang = i18n.getLanguage(); };
      eventBus.on('language:changed', this._onLang);
    },
    destroy() {
      if (this._onLang) eventBus.off('language:changed', this._onLang);
    },

    async boot(algo) {
      this.algo = algo;
      this.fixtures = await registry.getFixtures(algo.id);
    },
    /** Re-load when the parent switches algorithm while the tab stays mounted. */
    async onAlgoChange(algo) {
      if (!algo || algo.id === this.algo?.id) return;
      this.output = null; this.manual = {}; this.fixtureId = ''; this.csvText = ''; this.csvParams = {};
      await this.boot(algo);
    },

    t(key) { return this.lang, i18n.t(key); },
    loc(v) { return locValue(v, this.lang); },
    setMode(m) { this.mode = m; this.output = null; },

    /** CSV file input → read text into csvText (no inline arrow/promise in template). */
    async loadCsvFile(e) { const file = e.target.files?.[0]; if (!file) return; this.csvText = await file.text(); },

    // ── Error display helpers (no optional chaining in templates) ──
    errorBadgeClass() { return this.output?.errorBadge === 'EXPECTED' ? 'lab__tryit-badge--pass' : 'lab__tryit-badge--fail'; },
    hasErrorType() { return Boolean(this.output?.error?.type); },
    errorTypeText() { return `${this.output?.error?.type || ''  }:`; },
    errorMessageText() { return ` ${  this.output?.error?.message || ''}`; },

    get schemaFields() { return this.algo?.try_it?.input_schema?.fields || []; },
    get csvParamFields() { return this.schemaFields.filter(f => f.parse_as !== 'number_array'); },
    get fixturePreview() {
      const tc = this.fixtures?.test_cases?.find(t => t.id === this.fixtureId);
      if (!tc) return null;
      return {
        inputs: JSON.stringify(tc.inputs, null, 2),
        expected: tc.expected ? JSON.stringify(tc.expected, null, 2) : null,
        expectedError: tc.expected_error ? JSON.stringify(tc.expected_error, null, 2) : null,
      };
    },

    // ── Input collection (throws human-readable messages) ──
    _collectManual() {
      const inputs = {};
      for (const field of this.schemaFields) {
        const raw = (this.manual[field.name] ?? '').trim();
        if (field.required && !raw) throw new Error(`${this.loc(field.label)} ${i18n.t('lab.tryIt.isRequired')}`);
        let value;
        if (field.parse_as === 'number_array') value = parseNumberArray(raw);
        else if (field.parse_as === 'string_array') value = parseStringArray(raw);
        else if (field.parse_as === 'json') {
          try { value = raw ? JSON.parse(raw) : undefined; }
          catch { throw new Error(`${this.loc(field.label)}: invalid JSON`); }
        } else if (field.type === 'number' || field.parse_as === 'number') value = raw ? parseFloat(raw) : undefined;
        else value = raw;
        setByPath(inputs, field.name, value);
      }
      return { inputs };
    },
    _collectFixture() {
      if (!this.fixtureId) throw new Error('Please select a fixture');
      const tc = this.fixtures.test_cases.find(t => t.id === this.fixtureId);
      if (!tc) throw new Error('Fixture not found');
      const tol = tc.tolerance_override
        ? this.fixtures.tolerances.overrides[tc.tolerance_override]
        : this.fixtures.tolerances.default;
      return { inputs: { ...tc.inputs }, expectedResult: tc.expected || null,
               expectedError: tc.expected_error || null, tolerances: tol };
    },
    _collectCsv() {
      const data = parseCsvNumbers((this.csvText || '').trim());
      if (!this.csvText.trim()) throw new Error('Please provide CSV data');
      if (data.length === 0) throw new Error('No numeric values found in CSV');
      const inputs = { data };
      for (const field of this.csvParamFields) {
        const raw = (this.csvParams[field.name] ?? '').trim();
        if (field.type === 'number' && raw) inputs[field.name] = parseFloat(raw);
      }
      return { inputs };
    },

    async run() {
      let collected;
      try {
        collected = this.mode === 'manual' ? this._collectManual()
          : this.mode === 'fixture' ? this._collectFixture() : this._collectCsv();
      } catch (err) { this.output = { error: { message: err.message }, simpleError: true }; return; }

      let fn;
      try { fn = await buildFunction(this.algo); }
      catch (err) { this.output = { error: { message: `Build error: ${err.message}` }, simpleError: true }; return; }

      const start = performance.now();
      let result = null, error = null;
      try { result = fn(...mapArgs(this.algo, collected.inputs)); }
      catch (e) { error = { type: e.constructor.name, message: e.message }; }
      this.output = this._buildOutput(result, error, performance.now() - start, collected);
    },

    _buildOutput(result, error, duration, collected) {
      const out = { duration };
      const expectedError = collected.expectedError || null;
      const expectedResult = collected.expectedResult || null;
      const tolerances = collected.tolerances || null;

      if (error) {
        out.error = error;
        if (expectedError) {
          out.errorBadge = (error.type === expectedError.type &&
            error.message.includes(expectedError.message_contains)) ? 'EXPECTED' : 'UNEXPECTED';
        }
        return out;
      }
      if (!result) { out.noResult = true; return out; }
      if (expectedError) out.expectedMissError = expectedError.type;

      const schema = this.algo.try_it?.output_schema;
      const fields = schema?.display_fields || Object.keys(result);
      const format = schema?.format || {};
      const primary = schema?.primary_field;
      out.hasExpected = Boolean(expectedResult);
      out.rows = fields.map(key => {
        const val = getByPath(result, key);
        const fmt = format[key];
        const decimals = fmt?.decimals ?? 6;
        const label = fmt?.label ? this.loc(fmt.label) : key;
        const displayVal = typeof val === 'number' ? val.toFixed(decimals) : String(val);
        const row = { key, label, displayVal, primary: key === primary, hasExpected: out.hasExpected };
        if (out.hasExpected && expectedResult[key] !== undefined) {
          const exp = expectedResult[key];
          row.displayExp = typeof exp === 'number' ? exp.toFixed(decimals) : String(exp);
          row.pass = tolerances ? compare(val, exp, tolerances) : val === exp;
          row.matchIcon = row.pass ? 'status.ok' : 'status.error';
        } else if (out.hasExpected) {
          // No per-key expected value → bare em-dash placeholders with NO value /
          // pass-fail styling (matches the pre-Alpine plain `<td>—</td>` cells).
          row.displayExp = '—'; row.noExpected = true;
        }
        return row;
      });
      return out;
    },
  };
}
