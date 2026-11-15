/**
 * D.Mike — Survey builder: view part "questionnaire" (viewmodel/questionnaire.js)
 *
 * The output side of the draft: warnings before the export (they never
 * block it), the version line, the general export and the live preview.
 *
 * The export starts the run `buildSurveyFile` and downloads its file. The
 * preview runs the runner of the exported page in a shadow root under the
 * preview box (an iframe `srcdoc` would need an inline script, which the
 * app's CSP blocks), in the language of the questionnaire, a short while
 * after the last edit; storage and download are switched off there.
 */
import { downloadBlob } from '../../../core/export-utils.js';
import { documentOrder } from '../domain/conditions.js';
import { questionLabel, sectionPlaceholder } from '../domain/labels.js';
import { runSurvey, RUNNER_CSS } from '../domain/runner.js';
import { runnerStringsOf } from '../domain/questionnaire.js';
import { loadTexts } from './texts.js';

/** Pause of the live preview after an edit, in ms. */
const PREVIEW_DELAY_MS = 300;

/**
 * Page frame of the preview's shadow root. RUNNER_CSS styles `body`, which
 * does not exist inside a shadow root, so `:host` takes its colours. Fixed
 * light colours on purpose: the preview shows the exported page, which never
 * follows the app theme (same rule as RUNNER_CSS).
 */
const PREVIEW_HOST_CSS = ':host{display:block;background:#f4f5f7;color:#1f2328;'
  + 'font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}';

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const questionnaireView = (ctx) => {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  /** true once the part is torn down: a preview that comes back later draws nothing */
  let gone = false;
  return {
    init() {
      gone = false;
      this.$watch(() => JSON.stringify(this.model.survey), () => this.schedulePreview());
      this.$nextTick(() => this.renderPreview());
    },
    destroy() {
      gone = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },

    // ── Warnings ──────────────────────────────────────────────

    /** Hints before the export; they never block it. @returns {Array<{ key: string, text: string }>} */
    get warnings() {
      const out = [];
      const survey = this.model.survey;
      const order = documentOrder(survey);
      if (order.length === 0) out.push({ key: 'none', text: this.t('warnNoQuestions') });
      survey.sections.forEach((sec, i) => {
        if (sec.questions.length === 0) {
          out.push({ key: `s:${sec.id}`, text: this.t('warnEmptySection', { section: sec.title || sectionPlaceholder(i, this.t) }) });
        }
      });
      for (const { question: q } of order) {
        const label = questionLabel(survey, q, this.t);
        if (!q.text.trim()) out.push({ key: `t:${q.id}`, text: this.t('warnEmptyText', { question: label }) });
        const items = q.options || q.rows;
        if (Array.isArray(items) && !items.some((x) => x.text.trim())) {
          out.push({ key: `i:${q.id}`, text: this.t('warnNoItems', { question: label }) });
        }
      }
      return out;
    },

    /** @returns {boolean} */
    get hasWarnings() { return this.warnings.length > 0; },

    // ── Export ────────────────────────────────────────────────

    /** The current version, plus the raise the next export brings. @returns {string} */
    get versionLine() {
      const version = this.model.survey.version;
      const next = /** @type {any} */ (this.model).nextExportVersion;
      return next === version ? this.t('versionLine', { version }) : this.t('versionNext', { version, next });
    },

    /**
     * „Fragebogen exportieren“: the general questionnaire file, downloaded.
     * @returns {Promise<void>}
     */
    async exportGeneral() {
      const out = await this._asyncTaskHost.start('buildSurveyFile', {});
      if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
      if (out.status !== 'done') return;
      downloadBlob(new Blob([out.value.content], { type: 'text/html;charset=utf-8' }), out.value.fileName);
    },

    // ── Preview ───────────────────────────────────────────────

    /** Draws the preview a short while after the last edit. */
    schedulePreview() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; this.renderPreview(); }, PREVIEW_DELAY_MS);
    },

    /**
     * Draws the preview: the runner of the exported page in a shadow root.
     * @returns {Promise<void>}
     */
    async renderPreview() {
      if (gone) return;
      try {
        const survey = JSON.parse(JSON.stringify(this.model.survey));
        const strings = runnerStringsOf(await loadTexts(survey.lang));
        if (gone) return;
        const host = /** @type {HTMLElement|null} */ (this.$root.querySelector('[data-ref="preview"]'));
        if (!host) return;
        const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = PREVIEW_HOST_CSS + RUNNER_CSS;
        const root = document.createElement('div');
        shadow.replaceChildren(style, root);
        runSurvey(survey, strings, {
          root, recipientId: null, storage: null, download: () => {}, confirm: () => true,
        });
      } catch (err) {
        console.error('[survey-builder] preview failed', err);
        if (!gone) ctx.notify(this.t('previewFailed'), 'error');
      }
    },
  };
};
