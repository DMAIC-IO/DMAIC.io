/**
 * D.Mike — Survey builder: Stapel der Übergabe einer Kano-Frage an Kano.
 *
 * Rein. Der Survey merkt sich selbst, welche Merkmale und Befragten er je
 * Kano-Instanz angelegt hat (`transfers.kano[questionId].byInstance`); das
 * Ziel der Frage (`instanceId`) ist davon getrennt, ein Umlenken lässt die
 * Referenzen stehen. Eine Übergabe ersetzt nur die eigenen Einträge der
 * Zielinstanz; fremde bleiben samt ihren Antworten. Kano-Kommandos nehmen
 * ein Objekt-Argument.
 */
import { uid } from '../../../../core/uid.js';

/**
 * @typedef {string|{ $from: string, path: string }} Ref
 * @typedef {{ op: 'module.add', id: string, module: 'kano', phase?: string }} AddOp
 * @typedef {{ op: 'instance.call', id?: string, module: string, instance: Ref, method: string, args: any[] }} CallOp
 * @typedef {{ op: 'instance.set', module: 'kano', instance: Ref, values: object }} SetOp
 * @typedef {{ id: string, nodeId?: string|null, label?: string, path?: string, missing?: boolean }} KanoItem
 * @typedef {{ id: string, name?: string }} KanoRespondent
 * @typedef {{ items: ReadonlyArray<KanoItem>, respondents: ReadonlyArray<KanoRespondent> }} KanoRead
 *   was `read({ fields: ['items', 'respondents', …] })` von Kano liefert (Auszug)
 * @typedef {{ itemIds: ReadonlyArray<string>, respondentIds: ReadonlyArray<string> }} Refs
 *   die eigenen Referenzen einer Kano-Frage in einer Kano-Instanz
 * @typedef {{ instanceId: string|null, byInstance: Record<string, Refs> }} Transfer
 *   der Merker einer Kano-Frage: ihr Ziel und ihre Referenzen je Kano-Instanz
 */

/**
 * @param {Refs|undefined} refs
 * @returns {boolean} ob Referenzen gemerkt sind
 */
const hasRefs = (refs) => (refs?.itemIds?.length ?? 0) + (refs?.respondentIds?.length ?? 0) > 0;

/**
 * Die eigenen Einträge einer Kano-Frage in der Instanz: die gemerkten ids,
 * die dort noch vorkommen. Ist für diese Instanz nichts gemerkt, gibt es
 * keine eigenen Einträge.
 * @param {KanoRead} kanoRead
 * @param {Refs|undefined} refs die Referenzen der Frage für diese Instanz (`byInstance[kanoId]`)
 * @returns {{ itemIds: string[], respondentIds: string[] }}
 */
export function kanoOwnEntries(kanoRead, refs) {
  if (!refs || !hasRefs(refs)) return { itemIds: [], respondentIds: [] };
  const items = new Set(kanoRead.items.map((i) => i.id));
  const respondents = new Set(kanoRead.respondents.map((r) => r.id));
  return {
    itemIds: refs.itemIds.filter((id) => items.has(id)),
    respondentIds: refs.respondentIds.filter((id) => respondents.has(id)),
  };
}

/**
 * @param {*} v gespeicherter Antwortwert
 * @param {number} max oberes Ende der Skala, die bei 1 beginnt
 * @returns {number|null} v, wenn es eine ganze Zahl auf der Skala ist, sonst null
 */
function onScale(v, max) {
  return Number.isInteger(v) && v >= 1 && v <= max ? v : null;
}

/**
 * Der Schreibstapel einer Übergabe. Reihenfolge: bei neuer Instanz
 * `module.add` mit `setSourceTree` ohne Baum und der Wichtigkeit der Frage
 * (`instance.set { options }`; eine vorhandene schaltet die Frage nur ein), die eigenen Befragten
 * und Merkmale entfernen, die Merkmalliste aus fremden und neuen Merkmalen,
 * je Antwortendem eine Befragte samt Antworten, zuletzt die eigenen
 * Referenzen für die Zielinstanz und das Ziel selbst (bei neuer Instanz über
 * die Referenz auf `module.add`).
 * @param {{ kanoId: string|null, phase: string, kanoRead: KanoRead|null,
 *   question: { id: string, rows: ReadonlyArray<{ id: string, text: string }>, importance?: boolean },
 *   responses: ReadonlyArray<{ recipientId: string|null, answers: Record<string, any> }>,
 *   recipients: ReadonlyArray<{ id: string, name: string }>, anonymous: boolean,
 *   respondentLabel: (n: number) => string, surveyInstanceId: string,
 *   own: { itemIds: ReadonlyArray<string>, respondentIds: ReadonlyArray<string> } }} input
 *   `kanoId` die Zielinstanz oder `null` für eine neue (in `phase`);
 *   `responses` in der früheren Form (`legacyResponses`)
 * @returns {Array<AddOp|CallOp|SetOp>}
 */
export function kanoStack(input) {
  const { kanoId, phase, kanoRead, question, responses, recipients, anonymous, respondentLabel, surveyInstanceId, own } = input;
  /** @type {Array<AddOp|CallOp|SetOp>} */
  const stack = [];
  /** @type {Ref} */
  const instance = kanoId ?? { $from: 'kano', path: 'instanceId' };
  const call = (/** @type {string} */ method, /** @type {object} */ args, /** @type {string} */ id = '') =>
    stack.push({ op: 'instance.call', ...(id ? { id } : {}), module: 'kano', instance, method, args: [args] });
  const setImportance = (/** @type {boolean} */ importance) =>
    stack.push({ op: 'instance.set', module: 'kano', instance, values: { options: { importance } } });

  if (!kanoId) {
    stack.push({ op: 'module.add', id: 'kano', module: 'kano', phase });
    call('setSourceTree', { instanceId: null });
    setImportance(Boolean(question.importance));
  } else if (question.importance) {
    setImportance(true);
  }
  for (const id of own.respondentIds) call('removeRespondent', { id });
  for (const id of own.itemIds) call('removeItem', { id });

  const ownItems = new Set(own.itemIds);
  const foreign = (kanoRead?.items ?? []).filter((i) => !ownItems.has(i.id)).map((i) => ({
    id: i.id, nodeId: i.nodeId ?? null, label: i.label ?? '', path: i.path ?? '', missing: i.missing ?? false,
  }));
  const itemIdByRow = new Map(question.rows.map((row) => [row.id, uid()]));
  const fresh = question.rows.map((row) => ({ id: itemIdByRow.get(row.id), nodeId: null, label: row.text, path: '', missing: false }));
  call('setItems', { items: [...foreign, ...fresh] });

  const names = new Map(recipients.map((r) => [r.id, r.name]));
  const answering = responses.filter((r) => r.answers?.[question.id] && typeof r.answers[question.id] === 'object');
  /** @type {Array<{ $from: string, path: string }>} */
  const respondentIds = [];
  answering.forEach((resp, i) => {
    const ref = `r${i}`;
    const name = (!anonymous && names.get(resp.recipientId ?? '')?.trim()) || respondentLabel(i + 1);
    call('addRespondent', { name }, ref);
    const respondent = { $from: ref, path: 'value' };
    respondentIds.push(respondent);
    for (const row of question.rows) {
      const a = resp.answers[question.id][row.id];
      if (!a || typeof a !== 'object') continue;
      const itemId = itemIdByRow.get(row.id);
      call('setAnswer', { respondentId: respondent, itemId, field: 'f', value: onScale(a.f, 5) });
      call('setAnswer', { respondentId: respondent, itemId, field: 'd', value: onScale(a.d, 5) });
      call('setAnswer', { respondentId: respondent, itemId, field: 'w', value: onScale(a.w, 9) });
    }
  });

  stack.push({
    op: 'instance.call', module: 'survey-builder', instance: surveyInstanceId, method: 'setKanoTransfer',
    args: [{ questionId: question.id, instanceId: instance, itemIds: fresh.map((i) => i.id), respondentIds }],
  }, {
    op: 'instance.call', module: 'survey-builder', instance: surveyInstanceId, method: 'setKanoTarget',
    args: [{ questionId: question.id, instanceId: instance }],
  });
  return stack;
}
