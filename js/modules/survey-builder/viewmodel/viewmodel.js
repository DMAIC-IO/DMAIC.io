/**
 * D.Mike — Survey builder: viewmodel (viewmodel/viewmodel.js)
 *
 * A questionnaire is drafted (sections, questions, options, conditions),
 * sent to recipients as self-contained HTML files, and the returned answer
 * files are read in and evaluated. Data and commands live in the model
 * (domain/model.js), the agent surface comes from its schema. The interface
 * is put together from view parts, one per area of the draft; the runs are
 * in tasks.js.
 */
import { createModule } from '../../../core/template-module.js';
import { setFields, cloneJSON } from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import descriptor from '../module.js';
import { SurveyModel } from '../domain/model.js';
import { UiState } from './state.js';
import { asyncTasks } from './tasks.js';
import { outlineView } from './outline.js';
import { propertiesView } from './properties.js';
import { conditionsView } from './conditions.js';
import { questionnaireView } from './questionnaire.js';
import { recipientsView } from './recipients.js';
import { responsesView } from './responses.js';

export default createModule({
  descriptor,
  Model: SurveyModel,
  State: UiState,
  asyncTasks,

  /**
   * An empty survey with an id of its own (answer files name it).
   * @returns {SurveyModel}
   */
  createDefault() {
    const m = new SurveyModel();
    setFields(m, { survey: { ...cloneJSON(m.survey), id: uid() } });
    return m;
  },

  /**
   * A loaded example gets a fresh survey id, so answers to an earlier copy
   * are told apart.
   * @param {object} data module state of the example
   * @returns {object} copy with a new `survey.id`
   */
  beforeLoadExample(data) {
    const copy = JSON.parse(JSON.stringify(data));
    if (copy.survey && typeof copy.survey === 'object') copy.survey.id = uid();
    return copy;
  },

  view: [outlineView, propertiesView, conditionsView, questionnaireView, recipientsView, responsesView],
});
