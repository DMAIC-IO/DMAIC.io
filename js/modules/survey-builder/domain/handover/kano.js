/**
 * D.Mike — Survey builder: Stapel der Übergabe einer Kano-Frage an Kano.
 *
 * Rein. Der Survey merkt sich selbst, welche Merkmale und Befragten er in
 * einer Kano-Instanz angelegt hat (`transfers.kano[questionId]`). Eine
 * Übergabe ersetzt nur diese eigenen Einträge; fremde bleiben samt ihren
 * Antworten. Einträge aus der früheren Übergabe tragen statt eines Merkers
 * eine `origin`-Marke in Kano. Weil `setItems` die Marken der Merkmale
 * verwirft, sichert der Stapel sie zuerst als Merker aller Herkünfte
 * (`kanoBackups`); erst danach folgen die Schreibschritte an Kano.
 */
import { uid } from '../../../../core/uid.js';

/**
 * @typedef {string|{ $from: string, path: string }} Ref
 * @typedef {{ op: 'module.add', id: string, module: 'kano', phase?: string }} AddOp
 * @typedef {{ op: 'instance.call', id?: string, module: string, instance: Ref, method: string, args: any[] }} CallOp
 * @typedef {{ surveyInstanceId: string, questionId: string }} Origin
 * @typedef {{ id: string, nodeId?: string|null, label?: string, path?: string, missing?: boolean, origin?: Origin }} KanoItem
 * @typedef {{ id: string, name?: string, origin?: Origin }} KanoRespondent
 * @typedef {{ items: ReadonlyArray<KanoItem>, respondents: ReadonlyArray<KanoRespondent> }} KanoRead
 *   was `read({ fields: ['items', 'respondents', …] })` von Kano liefert (Auszug)
 * @typedef {{ instanceId: string, itemIds: ReadonlyArray<string>, respondentIds: ReadonlyArray<string> }} Transfer
 * @typedef {{ instance: string, questionId: string, transfer: { instanceId: string, itemIds: string[], respondentIds: string[] } }} Backup
 */

/**
 * @param {any} x ein Eintrag aus Kano
 * @param {string} surveyInstanceId
 * @param {string} questionId
 * @returns {boolean} ob seine `origin`-Marke auf diese Herkunft zeigt
 */
const fromOrigin = (x, surveyInstanceId, questionId) =>
  x?.origin?.surveyInstanceId === surveyInstanceId && x.origin.questionId === questionId;

/**
 * Die eigenen Einträge einer Kano-Frage in der Instanz: die gemerkten ids,
 * die dort noch vorkommen. Ist nichts gemerkt (früherer Bestand), die
 * Einträge mit der `origin`-Marke dieser Herkunft.
 * @param {KanoRead} kanoRead
 * @param {Transfer|undefined} transfer der Merker der Frage
 * @param {string} surveyInstanceId
 * @param {string} questionId
 * @returns {{ itemIds: string[], respondentIds: string[] }}
 */
export function kanoOwnEntries(kanoRead, transfer, surveyInstanceId, questionId) {
  const remembered = (transfer?.itemIds.length ?? 0) + (transfer?.respondentIds.length ?? 0) > 0;
  if (remembered && transfer) {
    const items = new Set(kanoRead.items.map((i) => i.id));
    const respondents = new Set(kanoRead.respondents.map((r) => r.id));
    return {
      itemIds: transfer.itemIds.filter((id) => items.has(id)),
      respondentIds: transfer.respondentIds.filter((id) => respondents.has(id)),
    };
  }
  return {
    itemIds: kanoRead.items.filter((i) => fromOrigin(i, surveyInstanceId, questionId)).map((i) => i.id),
    respondentIds: kanoRead.respondents.filter((r) => fromOrigin(r, surveyInstanceId, questionId)).map((r) => r.id),
  };
}

/**
 * Die Merker, die der Stapel vor dem Schreiben sichert: je Herkunft
 * `(surveyInstanceId, questionId)` der `origin`-Marken in der Instanz, deren
 * Survey-Instanz noch existiert und für diese Frage auf diese Kano-Instanz
 * zeigt, aber noch nichts gemerkt hat.
 * @param {KanoRead} kanoRead
 * @param {ReadonlyArray<{ instanceId: string, transfers: { kano: Record<string, Transfer> } }>} surveys
 *   die Survey-Instanzen des Projekts mit ihren Merkern
 * @param {string} kanoId die Kano-Instanz
 * @returns {Backup[]}
 */
export function kanoBackups(kanoRead, surveys, kanoId) {
  /** @type {Map<string, Backup>} */
  const byOrigin = new Map();
  const collect = (/** @type {ReadonlyArray<KanoItem|KanoRespondent>} */ entries, /** @type {'itemIds'|'respondentIds'} */ list) => {
    for (const x of entries) {
      const o = x.origin;
      if (!o || typeof o.surveyInstanceId !== 'string' || typeof o.questionId !== 'string') continue;
      const key = JSON.stringify([o.surveyInstanceId, o.questionId]);
      if (!byOrigin.has(key)) {
        byOrigin.set(key, { instance: o.surveyInstanceId, questionId: o.questionId, transfer: { instanceId: kanoId, itemIds: [], respondentIds: [] } });
      }
      byOrigin.get(key)?.transfer[list].push(x.id);
    }
  };
  collect(kanoRead.items, 'itemIds');
  collect(kanoRead.respondents, 'respondentIds');
  const linked = new Map(surveys.map((s) => [s.instanceId, s.transfers.kano]));
  return [...byOrigin.values()].filter((b) => {
    const t = linked.get(b.instance)?.[b.questionId];
    return Boolean(t) && t.instanceId === kanoId && t.itemIds.length === 0 && t.respondentIds.length === 0;
  });
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
 * Der Schreibstapel einer Übergabe. Reihenfolge: die Sicherungen, bei neuer
 * Instanz `module.add` mit `setSourceTree(null)` und der Wichtigkeit der
 * Frage (eine vorhandene schaltet die Frage nur ein), die eigenen Befragten
 * und Merkmale entfernen, die Merkmalliste aus fremden und neuen Merkmalen,
 * je Antwortendem eine Befragte samt Antworten, zuletzt der eigene Merker.
 * @param {{ kanoId: string|null, phase: string, kanoRead: KanoRead|null,
 *   question: { id: string, rows: ReadonlyArray<{ id: string, text: string }>, importance?: boolean },
 *   responses: ReadonlyArray<{ recipientId: string|null, answers: Record<string, any> }>,
 *   recipients: ReadonlyArray<{ id: string, name: string }>, anonymous: boolean,
 *   respondentLabel: (n: number) => string, surveyInstanceId: string,
 *   backups: ReadonlyArray<Backup>, own: { itemIds: ReadonlyArray<string>, respondentIds: ReadonlyArray<string> } }} input
 *   `kanoId` die Zielinstanz oder `null` für eine neue (in `phase`);
 *   `responses` in der früheren Form (`legacyResponses`)
 * @returns {Array<AddOp|CallOp>}
 */
export function kanoStack(input) {
  const { kanoId, phase, kanoRead, question, responses, recipients, anonymous, respondentLabel, surveyInstanceId, backups, own } = input;
  /** @type {Array<AddOp|CallOp>} */
  const stack = backups.map((b) => ({
    op: 'instance.call', module: 'survey-builder', instance: b.instance, method: 'setKanoTransfer',
    args: [{ questionId: b.questionId, transfer: b.transfer }],
  }));
  /** @type {Ref} */
  const instance = kanoId ?? { $from: 'kano', path: 'instanceId' };
  const call = (/** @type {string} */ method, /** @type {any[]} */ args, /** @type {string} */ id = '') =>
    stack.push({ op: 'instance.call', ...(id ? { id } : {}), module: 'kano', instance, method, args });

  if (!kanoId) {
    stack.push({ op: 'module.add', id: 'kano', module: 'kano', phase });
    call('setSourceTree', [null]);
    call('setImportance', [Boolean(question.importance)]);
  } else if (question.importance) {
    call('setImportance', [true]);
  }
  for (const id of own.respondentIds) call('removeRespondent', [id]);
  for (const id of own.itemIds) call('removeItem', [id]);

  const ownItems = new Set(own.itemIds);
  const foreign = (kanoRead?.items ?? []).filter((i) => !ownItems.has(i.id)).map((i) => ({
    id: i.id, nodeId: i.nodeId ?? null, label: i.label ?? '', path: i.path ?? '', missing: i.missing ?? false,
  }));
  const itemIdByRow = new Map(question.rows.map((row) => [row.id, uid()]));
  const fresh = question.rows.map((row) => ({ id: itemIdByRow.get(row.id), nodeId: null, label: row.text, path: '', missing: false }));
  call('setItems', [[...foreign, ...fresh]]);

  const names = new Map(recipients.map((r) => [r.id, r.name]));
  const answering = responses.filter((r) => r.answers?.[question.id] && typeof r.answers[question.id] === 'object');
  /** @type {Array<{ $from: string, path: string }>} */
  const respondentIds = [];
  answering.forEach((resp, i) => {
    const ref = `r${i}`;
    const name = (!anonymous && names.get(resp.recipientId ?? '')?.trim()) || respondentLabel(i + 1);
    call('addRespondent', [name], ref);
    const respondent = { $from: ref, path: 'value' };
    respondentIds.push(respondent);
    for (const row of question.rows) {
      const a = resp.answers[question.id][row.id];
      if (!a || typeof a !== 'object') continue;
      const itemId = itemIdByRow.get(row.id);
      call('setAnswer', [respondent, itemId, 'f', onScale(a.f, 5)]);
      call('setAnswer', [respondent, itemId, 'd', onScale(a.d, 5)]);
      call('setAnswer', [respondent, itemId, 'w', onScale(a.w, 9)]);
    }
  });

  stack.push({
    op: 'instance.call', module: 'survey-builder', instance: surveyInstanceId, method: 'setKanoTransfer',
    args: [{ questionId: question.id, transfer: { instanceId: instance, itemIds: fresh.map((i) => i.id), respondentIds } }],
  });
  return stack;
}
