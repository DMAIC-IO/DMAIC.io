/**
 * D.Mike — Course quiz (quiz.js)
 *
 * Alpine component `trainingQuiz`: one single-choice question. The answer is
 * kept in the lesson progress (via the page API), so it survives reloads;
 * a wrong answer can be followed by another try.
 */

/**
 * Alpine component factory.
 * @param {{i18n: {t: Function}}} ctx page context
 * @returns {object} Alpine data object
 */
export function quizComponent(ctx) {
  const t = (key) => ctx.i18n.t(`training.course.${key}`);
  let quiz = null;
  let api = null;

  return {
    /**
     * @param {{id: string, options: {text: string, correct?: boolean, feedback: string}[]}} block
     * @param {{quiz: Function, recordQuiz: Function}} lessonApi the lesson page's API
     */
    setup(block, lessonApi) {
      quiz = block;
      api = lessonApi;
    },

    /** @returns {{answer: number, correct: boolean}|null} stored answer of this quiz */
    entry() {
      const e = api && quiz ? api.quiz(quiz.id) : null;
      return e && quiz.options[e.answer] ? e : null;
    },
    answered() { return !!this.entry(); },
    isChosen(i) { const e = this.entry(); return !!e && e.answer === i; },

    optClass(i) {
      const e = this.entry();
      if (!e || e.answer !== i) return 'training-quiz__option';
      return `training-quiz__option training-quiz__option--${e.correct ? 'correct' : 'wrong'}`;
    },

    /**
     * Record the chosen option.
     * @param {number} i option index
     */
    choose(i) {
      if (!quiz || !api) return;
      api.recordQuiz(quiz.id, i, quiz.options[i].correct === true);
    },

    verdict() {
      const e = this.entry();
      if (!e) return '';
      return t(e.correct ? 'quizCorrect' : 'quizWrong');
    },
    feedback() {
      const e = this.entry();
      return e ? quiz.options[e.answer].feedback : '';
    },
    feedbackClass() {
      const e = this.entry();
      return `training-quiz__feedback training-quiz__feedback--${e && e.correct ? 'correct' : 'wrong'}`;
    },
  };
}
