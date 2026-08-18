import { createModule } from '../../core/template-module.js';
import { State, TRENDS } from './triz-evolution-trends-model.js';

export default createModule({
  config: {
    id: 'triz-evolution-trends',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-evolution-trends',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,
  data(module, _t) {
    return {
      selectedClass: (e, s) => e.stage === s ? 'is-selected' : '',
      isSelected: (e, s) => e.stage === s,
      qualClass: (e) => e.hasStages ? '' : 'triz-evo__trend--qualitative',
      trendName: (id) => _t(`trend.${  id  }.name`),
      trendDesc: (id) => _t(`trend.${  id  }.description`),
      trendStageName: (id, s) => _t(`trend.${  id  }.stages.${  s}`),
      notesPlaceholder: (id, e) => e.hasStages
        ? _t('notesPlaceholder')
        : _t(`trend.${  id  }.notesPlaceholder`),
      radioName: (id) => `triz-evo-${  id}`,
      trendNum: (i) => i + 1,
      // Alpine x-for over an object exposes the key, not a numeric $index (the
      // legacy engine's $index magic does not exist in this CSP build), so the
      // trend's display number comes from its position in TRENDS.
      trendNumById: (id) => TRENDS.findIndex(t => t.id === id) + 1,

      stageChanged(entry, stage) {
        entry.stage = stage
      },

      systemChanged(event) {
        this.model.system = event.target.value
      },
    }
  },
})
