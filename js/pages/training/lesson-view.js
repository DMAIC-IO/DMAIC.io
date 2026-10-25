/**
 * D.Mike — Course tab of the training page (lesson-view.js)
 *
 * `lessonViewData` is the course/lesson part of the page's Alpine data:
 * overview, step navigation, insight gates, quiz and simulation callbacks and
 * persistence through progress-store.js. Rendering of inline text goes through
 * the shared markdown parser (no x-html).
 */

import { h } from '../../core/dom.js';
import { parseInline } from '../../core/markdown-parser.js';
import { renderInlineMath } from '../../core/katex-loader.js';
import { COURSES, findLesson, quizIds } from './courses/index.js';
import { emptyStepCounts, mergeCounts, isGateOpen, gateHint } from './gates.js';
import { mergeSummary } from './populations.js';
import { emptyLesson, loadLesson, saveLesson, resetLesson as clearStoredLesson, lessonStatus } from './progress-store.js';
import { WIDGETS } from './widgets/index.js';

/**
 * The lesson that was open when the page was last torn down (language switch
 * re-creates the page data), so the learner stays where they were.
 * @type {string|null}
 */
let resumeLessonId = null;

/** Glossary term reference -> marker span; the hover button is added by glossary-inline.js. */
function termRef(id, label) {
  return h('span', { class: 'glossary-term', 'data-glossary-term': id }, label != null ? label : id);
}

/**
 * Lesson-related Alpine data of the training page.
 * @param {(key: string, vars?: object) => string} t translator, prefixed with `training.`
 * @param {{getLanguage: () => string}} i18n
 * @param {{confirm: (opts: object) => Promise<boolean>}} [dialog]
 * @returns {object}
 */
export function lessonViewData(t, i18n, dialog) {
  return {
    lessonId: null,
    stepIndex: 0,
    progress: emptyLesson(),
    stepCounts: {},
    epoch: 0,

    init() {
      if (resumeLessonId && findLesson(resumeLessonId)?.lesson) this.enterLesson(resumeLessonId);
    },

    lang() { return i18n.getLanguage(); },
    isCourses() { return this.activeTab === 'courses'; },
    isOverview() { return this.isCourses() && !this.lessonId; },
    isLesson() { return this.isCourses() && !!this.lessonId; },
    isOther() { return !this.isCourses(); },

    // ---------- overview ----------

    courses() {
      const lang = this.lang();
      return COURSES.map((course) => ({
        id: course.id,
        title: course[lang].title,
        summary: course[lang].summary,
        lessons: course.lessons.map((ref, idx) => ({
          id: ref.id,
          nr: idx + 1,
          title: ref[lang].title,
          summary: ref[lang].summary,
          available: !!ref.content,
          status: this.status(ref),
          statusLabel: this.statusLabel(ref),
          prerequisite: this.prerequisiteText(course, ref, lang),
        })),
      }));
    },
    status(ref) {
      if (!ref.content) return 'soon';
      return lessonStatus(ref.id, quizIds(ref.content), ref.content.de.steps.length - 1);
    },
    statusLabel(ref) {
      return t({ soon: 'course.soon', new: 'course.new', started: 'course.started', complete: 'course.done' }[this.status(ref)]);
    },
    prerequisiteText(course, ref, lang) {
      if (!ref.prerequisites.length) return '';
      const titles = ref.prerequisites.map((id) => course.lessons.find((l) => l.id === id)[lang].title);
      return t('course.prerequisite', { lessons: titles.join(', ') });
    },
    lessonClass(l) {
      if (!l.available) return 'training-course__lesson training-course__lesson--soon';
      if (l.status === 'complete') return 'training-course__lesson training-course__lesson--complete';
      if (l.status === 'started') return 'training-course__lesson training-course__lesson--started';
      return 'training-course__lesson';
    },
    hasPrerequisite(l) { return !!l.prerequisite; },
    openLesson(l) { if (l.available) this.enterLesson(l.id); },

    // ---------- lesson ----------

    /** @private Open a lesson at its stored step (clamped to the lesson). */
    enterLesson(id) {
      this.lessonId = id;
      this.epoch = 0;
      this.stepCounts = {};
      this.progress = loadLesson(id);
      this.stepIndex = Math.min(this.progress.step, this.steps().length - 1);
      this.arrive();
      resumeLessonId = id;
    },
    backToOverview() {
      this.lessonId = null;
      this.stepCounts = {};
      resumeLessonId = null;
    },
    lessonContent() { return this.lessonId ? findLesson(this.lessonId).lesson[this.lang()] : null; },
    lessonTitle() { return this.lessonContent()?.title || ''; },
    courseTitle() { return this.lessonId ? findLesson(this.lessonId).course[this.lang()].title : ''; },
    steps() { return this.lessonContent()?.steps || []; },
    step() { return this.steps()[this.stepIndex] || { title: '', blocks: [] }; },
    stepLabel() { return t('course.stepOf', { current: this.stepIndex + 1, total: this.steps().length }); },
    stepDotClass(i) {
      if (i === this.stepIndex) return 'training-lesson__dot training-lesson__dot--active';
      return i < this.stepIndex ? 'training-lesson__dot training-lesson__dot--past' : 'training-lesson__dot';
    },
    blockKey(i) {
      const suffix = this.epoch ? `:r${this.epoch}` : '';
      return `${this.lessonId}:${this.stepIndex}:${i}${suffix}`;
    },

    /** @private Record the arrival at the current step and persist it. */
    arrive() {
      this.progress.step = this.stepIndex;
      if (this.stepIndex === this.steps().length - 1) this.progress.reachedLast = true;
      delete this.stepCounts[this.stepKey()];
      if (this.stepIndex > 0 || this.progress.reachedLast) this.save();
    },
    save() { saveLesson(this.lessonId, this.progress); },
    stepKey() { return `${this.lessonId}:${this.stepIndex}`; },
    goToStep(i) {
      if (i < 0 || i >= this.steps().length) return;
      this.stepIndex = i;
      this.arrive();
    },
    hasPrev() { return this.stepIndex > 0; },
    hasNext() { return this.stepIndex < this.steps().length - 1; },
    isLast() { return !this.hasNext(); },
    prev() { this.goToStep(this.stepIndex - 1); },
    next() { this.goToStep(this.stepIndex + 1); },
    finish() {
      this.progress.reachedLast = true;
      this.save();
      this.backToOverview();
    },
    async resetLesson() {
      const ok = dialog
        ? await dialog.confirm({ message: t('course.resetConfirm'), danger: true })
        : false;
      if (!ok) return;
      clearStoredLesson(this.lessonId);
      this.progress = emptyLesson();
      this.stepIndex = 0;
      this.stepCounts = {};
      this.epoch += 1;
    },

    // ---------- blocks ----------

    isType(b, type) { return b.type === type; },
    isWidget(b, name) { return b.type === 'simulation' && b.widget === name && WIDGETS.includes(name); },
    hasGlossary(b) { return !!b.glossary; },
    /**
     * Render inline markdown (and `{{term:id|label}}`) into an element.
     * @param {HTMLElement} el
     * @param {string} text
     */
    renderInline(el, text) {
      el.replaceChildren(...parseInline(text, { termRef }));
      renderInlineMath(el);
    },
    /**
     * Render a definition's LaTeX formula. Inline mode with \displaystyle keeps
     * full-size fractions without display mode's centring; the raw LaTeX stays
     * visible if KaTeX fails to load.
     * @param {HTMLElement} el
     * @param {string} latex
     */
    renderFormula(el, latex) {
      el.replaceChildren(h('span', { 'data-katex-inline': `\\displaystyle ${latex}` }, latex));
      renderInlineMath(el);
    },
    /** Definition term; with a glossary id the term becomes a glossary link. */
    renderTerm(el, b) {
      const text = b.glossary ? `{{term:${b.glossary}|${b.term}}}` : b.term;
      el.replaceChildren(...parseInline(text, { termRef }));
    },

    // ---------- insights ----------

    insightOpen(b) {
      return this.progress.insights.includes(b.id)
        || isGateOpen(b, this.stepCounts[this.stepKey()] || emptyStepCounts());
    },
    insightLocked(b) { return !this.insightOpen(b); },
    insightHint(b) {
      const hint = gateHint(b);
      return t(hint.key, hint.params);
    },
    insightTitle() { return t('course.insight'); },

    /** Counts from a widget (current visit of the current step); unlocks and stores insights. */
    onSimProgress(e) {
      const key = this.stepKey();
      this.stepCounts[key] = mergeCounts(this.stepCounts[key] || emptyStepCounts(), e.detail);
      let changed = false;
      for (const b of this.step().blocks) {
        if (b.type === 'insight' && !this.progress.insights.includes(b.id) && this.insightOpen(b)) {
          this.progress.insights.push(b.id);
          changed = true;
        }
      }
      if (changed) this.save();
    },

    // ---------- API handed to widgets and quizzes ----------

    lessonApi() {
      const page = this;
      return {
        quiz: (id) => page.progress.quizzes[id] || null,
        recordQuiz(id, answer, correct) {
          const prev = page.progress.quizzes[id];
          page.progress.quizzes[id] = {
            answer, correct, everCorrect: correct || prev?.everCorrect === true,
          };
          page.save();
        },
        addResult(population, n, summary) {
          const byN = page.progress.results[population] || (page.progress.results[population] = {});
          byN[n] = mergeSummary(byN[n], summary);
          page.save();
        },
        results: () => page.progress.results,
      };
    },
  };
}
