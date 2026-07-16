/**
 * DMAIC.io — MSA Type 6 Module Handbook (msa-typ6-help.js)
 * Bilingual help content (DE/EN) for the MSA Type 6 module.
 *
 * Placeholder stub (Task 7 of the msa-typ6 plan) — only exists so the
 * module's handbook entry point resolves cleanly (picked up by
 * `tools/build/help-data.mjs` into the generated help registry, mirroring
 * every sibling MSA module). Task 18 fills in the real content: goal, data
 * requirements, formulas (SPC constants, Nelson rules, linear drift test)
 * and verdict/traffic-light sections, analogous to `msa-typ5-help.js`.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md
 */

export default {
  moduleId: 'msa-typ6',
  sections: {
    goal: {
      de: {
        title: 'Ziel des Verfahrens',
        blocks: [
          { type: 'paragraph', content: 'Handbuch folgt in Task 18.' },
        ],
      },
      en: {
        title: 'Purpose of the Study',
        blocks: [
          { type: 'paragraph', content: 'Handbook content follows in Task 18.' },
        ],
      },
    },
    data: {
      de: {
        title: 'Datenanforderungen',
        blocks: [
          { type: 'paragraph', content: 'Handbuch folgt in Task 18.' },
        ],
      },
      en: {
        title: 'Data Requirements',
        blocks: [
          { type: 'paragraph', content: 'Handbook content follows in Task 18.' },
        ],
      },
    },
    formulas: {
      de: {
        title: 'Formeln',
        blocks: [
          { type: 'paragraph', content: 'Handbuch folgt in Task 18.' },
        ],
      },
      en: {
        title: 'Formulas',
        blocks: [
          { type: 'paragraph', content: 'Handbook content follows in Task 18.' },
        ],
      },
    },
    verdict: {
      de: {
        title: 'Bewertung & Ampeln',
        blocks: [
          { type: 'paragraph', content: 'Handbuch folgt in Task 18.' },
        ],
      },
      en: {
        title: 'Verdict & Traffic Lights',
        blocks: [
          { type: 'paragraph', content: 'Handbook content follows in Task 18.' },
        ],
      },
    },
  },
};
