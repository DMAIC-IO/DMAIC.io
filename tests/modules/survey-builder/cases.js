/**
 * Shared cases of the survey-builder domain tests: the example project, a
 * hand-made stored state with every question type (`MIXED`), a stored state
 * with the corners of old projects (`CORNERS`) and the frozen reference of the
 * earlier model and of its results viewmodel.
 *
 * Both stored states are in the earlier form (no `_schema`): the declarative
 * model loads them through its migration `'0→1.0'`.
 *
 * The earlier model is gone. What it did is frozen in
 * `fixtures/legacy-oracles.json`; `frozen(key, compute)` reads an entry. The
 * `compute` function next to each use documents how the entry was produced
 * from the earlier code; it no longer runs. Every comparison loads the earlier
 * result through the same migration, so "same effect as before" reads
 * `toJSON()` against `toJSON()`.
 */
import { SurveyModel } from '../../../js/modules/survey-builder/domain/model.js';
import { toLegacy } from '../../../js/modules/survey-builder/domain/answers.js';

/** @param {string} path relative to this file @returns {Promise<any>} */
async function loadJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  return res.json();
}

/** The example project's module state (earlier form). */
export const EXAMPLE = await loadJson('../../../js/modules/survey-builder/resources/examples/projects/survey-builder-software.json');

/** The frozen entries. */
const ORACLES = await loadJson('./fixtures/legacy-oracles.json');

/** @template T @param {T} v @returns {T} */
export const copy = (v) => JSON.parse(JSON.stringify(v));

/**
 * Every question type, conditions on a section and a question, recipients in
 * all three states, responses with every answer form, a Kano target, VoC marks
 * and a filter, a grouping and a selection.
 */
export const MIXED = Object.freeze({
  survey: {
    id: 'sv-1', version: 2, lang: 'de', title: 'Befragung', intro: 'Hallo', contact: 'Team', anonymous: false,
    sections: [
      {
        id: 's1', title: 'Allgemein', hint: '', when: null, questions: [
          { id: 'q1', type: 'single', text: 'Gruppe', hint: '', required: true, when: null, other: true,
            options: [{ id: 'o1', text: 'Handel' }, { id: 'o2', text: 'Industrie' }] },
          { id: 'q2', type: 'multi', text: 'Kanäle', hint: '', required: false,
            when: [{ questionId: 'q1', optionIds: ['o2'] }], other: true,
            options: [{ id: 'm1', text: 'Mail', group: 'Digital' }, { id: 'm2', text: 'Telefon' }] },
        ],
      },
      {
        id: 's2', title: 'Bewertung', hint: 'Bitte ehrlich', when: [{ questionId: 'q1', optionIds: ['o1', 'o2'] }], questions: [
          { id: 'q3', type: 'rating', text: 'Zufrieden', hint: '', required: false, when: null, noAnswer: true,
            rows: [{ id: 'r1', text: 'Tempo' }, { id: 'r2', text: 'Qualität' }] },
          { id: 'q4', type: 'kano', text: 'Merkmale', hint: '', required: false, when: null, importance: true,
            rows: [{ id: 'k1', text: 'Chat' }, { id: 'k2', text: 'Status' }] },
          { id: 'q5', type: 'text', text: 'Wünsche', hint: '', required: false, when: null, multiline: true },
          { id: 'q6', type: 'info', text: 'Danke', hint: '', required: false, when: null },
        ],
      },
    ],
  },
  recipients: [
    { id: 'rec-a', name: 'Anna', organisation: 'A GmbH', group: 'Handel', email: '', note: '', sentAt: '2026-10-01T09:00:00.000Z', sentVersion: 1 },
    { id: 'rec-b', name: 'Bert', organisation: '', group: 'Industrie', email: 'b@x.de', note: '', sentAt: '2026-10-02T09:00:00.000Z', sentVersion: 2 },
    { id: 'rec-c', name: '', organisation: '', group: '', email: '', note: '', sentAt: null, sentVersion: null },
  ],
  responses: [
    {
      id: 'resp-a', surveyVersion: 1, recipientId: 'rec-a', viaRecipient: true, submittedAt: '2026-10-03T10:00:00.000Z',
      answers: {
        q1: 'o1',
        q2: { ids: ['m1', 'm2'], other: 'Fax' },
        q3: { r1: 4, r2: 'na' },
        q4: { k1: { f: 1, d: 5, w: 7 }, k2: { f: 2, d: 4, w: null } },
        q5: 'Schneller bitte',
      },
    },
    {
      id: 'resp-b', surveyVersion: 2, recipientId: null, viaRecipient: false, submittedAt: '2026-10-04T10:00:00.000Z',
      answers: {
        q1: { other: 'Behörde' },
        q2: { ids: ['m2'], other: null },
        q3: { r1: 2, r2: 5 },
        q4: { k1: { f: 3, d: 3, w: null } },
      },
    },
    {
      id: 'resp-c', surveyVersion: 2, recipientId: null, viaRecipient: false, submittedAt: '2026-10-05T10:00:00.000Z',
      answers: { q1: 'o2', q2: { ids: [], other: 'Brief' }, q3: { r1: 5 } },
    },
  ],
  answeredRecipientIds: ['rec-a'],
  transfers: { kano: { q4: 'kano-1' }, vocTree: { responseKeys: ['resp-a:q5', 'resp-a:q2:other'] } },
  ui: { tab: 'results', selectedQuestionId: 'q2', filter: { questionId: 'q1', optionId: 'o1' }, groupBy: 'q1', reportWithNames: true },
  dirtyStructure: false,
  exportedOnce: true,
});

/**
 * A stored state with the corners of old projects: a filter on a deleted
 * question, a grouping by a multiple choice question, a Kano target as text on
 * a question id that no longer exists (and one that is no text), an answer
 * whose question changed its type since (kano answer on a rating question,
 * option id on a text question), a rating answer with an unknown row key, an
 * answer of a deleted question, a selection of a deleted question and an
 * answered recipient that is gone.
 *
 * The end-to-end case of an old project loads the same state as a project
 * file (survey-builder-legacy-project.json); keep both in step.
 */
export const CORNERS = Object.freeze({
  survey: {
    id: 'sv-old', version: 3, lang: 'en', title: 'Alt', intro: '', contact: '', anonymous: true,
    sections: [
      {
        id: 's1', title: '', hint: '', when: null, questions: [
          { id: 'q1', type: 'multi', text: 'Kanäle', hint: '', required: false, when: null, other: false,
            options: [{ id: 'm1', text: 'Mail' }, { id: 'm2', text: 'Telefon' }] },
          { id: 'q2', type: 'rating', text: 'War Kano', hint: '', required: false, when: null, noAnswer: true,
            rows: [{ id: 'k1', text: 'Chat' }] },
          { id: 'q3', type: 'text', text: 'War Einfachauswahl', hint: '', required: false, when: null, multiline: false },
          { id: 'q4', type: 'rating', text: 'Bewertung', hint: '', required: false, when: null, noAnswer: false,
            rows: [{ id: 'r1', text: 'Tempo' }] },
        ],
      },
    ],
  },
  recipients: [{ id: 'rec-a', name: 'Anna', organisation: '', group: '', email: '', note: '', sentAt: '2026-01-01T00:00:00.000Z', sentVersion: 1 }],
  responses: [
    {
      id: 'resp-1', surveyVersion: 1, recipientId: null, viaRecipient: true, submittedAt: '2026-01-02T00:00:00.000Z',
      answers: {
        q1: { ids: ['m1'], other: null },
        q2: { k1: { f: 1, d: 5, w: null } },
        q3: 'o-alt',
        q4: { r1: 3, 'r-geloescht': 5 },
        'q-geloescht': 'Freitext einer gelöschten Frage',
      },
    },
  ],
  answeredRecipientIds: ['rec-a', 'rec-weg'],
  transfers: { kano: { 'q-geloescht': 'kano-9', q2: 42 }, vocTree: { responseKeys: ['resp-1:q3', 7] } },
  ui: { tab: 'recipients', selectedQuestionId: 'q-geloescht', filter: { questionId: 'q-geloescht', optionId: 'x' }, groupBy: 'q1', reportWithNames: false },
  dirtyStructure: true,
});

/** @param {object} json stored state (earlier form or 1.0) @param {object} [opts] fromJSON options @returns {any} */
export const load = (json, opts) => SurveyModel.fromJSON(copy(json), opts);

/**
 * A frozen entry of the earlier model's behaviour.
 * @param {string} key unique name of the entry
 * @param {(deps: any) => any} _compute how the entry was produced from the earlier code (documentation only)
 * @returns {any} a copy of the entry
 */
export function frozen(key, _compute) {
  if (!Object.hasOwn(ORACLES, key)) throw new Error(`frozen: no entry ${JSON.stringify(key)} in fixtures/legacy-oracles.json`);
  return copy(ORACLES[key]);
}

/**
 * The earlier `fromJSON(json).toJSON()`, frozen (the lambda documents how;
 * it is not run).
 * @param {string} key name of the state @param {object} json stored state (earlier form) @returns {any}
 */
export const legacyJSON = (key, json) => frozen(`fromJSON ${key}`, ({ Legacy }) => Legacy.fromJSON(copy(json)).toJSON());

/**
 * A 1.0 state with every answer in the earlier form. The stored form of an
 * answer whose question is gone or changed its type depends on when it was
 * stored (`{ option }` before, `{ text }` when migrated after) — both give
 * the same earlier form back, which is what the comparisons check.
 * @param {any} json 1.0 state @returns {any}
 */
export function canon(json) {
  const out = copy(json);
  for (const r of out.responses) {
    r.answers = Object.fromEntries(Object.entries(r.answers).map(([q, a]) => [q, toLegacy({}, a)]));
  }
  return out;
}

/**
 * The 1.0 form of what the earlier model held: its `toJSON()` loaded through
 * the migration, answers in the earlier form (`canon`).
 * @param {object} legacyState `toJSON()` of the earlier model @returns {object}
 */
export const expected = (legacyState) => canon(load(legacyState).toJSON());

/**
 * Replace one id by another everywhere in a stored state (new ids come from
 * `uid()` on both sides).
 * @param {object} json @param {string} from @param {string} to @returns {object}
 */
export function swapId(json, from, to) {
  return JSON.parse(JSON.stringify(json).split(JSON.stringify(from)).join(JSON.stringify(to)));
}

/**
 * The same change on the earlier model (frozen under `key`) and on the
 * declarative one, both from `json`.
 * @param {string} key unique name of the case
 * @param {object} json stored state (earlier form)
 * @param {(l: any) => any} _before the change on the earlier model, as it was frozen (documentation only, not run)
 * @param {(m: any) => any} after the command on the declarative model
 * @returns {{ want: object, got: object, m: any, lr: any, mr: any }} `want`/`got` answers in the earlier form
 */
export function both(key, json, _before, after) {
  const o = frozen(`both ${key}`, ({ Legacy }) => {
    const l = Legacy.fromJSON(copy(json));
    const lr = _before(l);
    return { state: l.toJSON(), result: lr ?? null };
  });
  const m = load(json);
  const mr = after(m);
  return { want: expected(o.state), got: canon(m.toJSON()), m, lr: o.result, mr };
}
