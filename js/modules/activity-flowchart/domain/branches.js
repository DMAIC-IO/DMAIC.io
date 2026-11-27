/**
 * D.Mike — Activity-Flowchart: Bänder der Kette.
 *
 * Ein Band ist keine eigene Angabe, sondern ergibt sich aus den Rauten:
 * `branchId` eines Schritts ist `'main'` (Hauptpfad) oder `no:<id der Raute>`
 * (Nein-Zweig dieser Raute). Ein Band gilt nur, wenn seine Raute **vor** dem
 * Schritt steht; damit sind Zyklen ausgeschlossen. Reine Funktionen, die
 * Eingaben bleiben unverändert.
 */

/** Band des Hauptpfads. */
export const MAIN_BRANCH = 'main';

/** Präfix des Bands einer Raute: `no:<id>`. */
export const BRANCH_PREFIX = 'no:';

/**
 * @typedef {{ id: string, kind: string, branchId: string }} BranchStep
 */

/**
 * Die Raute, der ein Band gehört.
 * @param {unknown} branchId `'main'` oder `no:<id>`
 * @returns {string|null} id der Raute, beim Hauptpfad (und bei Unlesbarem) `null`
 */
export function branchOwnerId(branchId) {
  return typeof branchId === 'string' && branchId.startsWith(BRANCH_PREFIX) && branchId.length > BRANCH_PREFIX.length
    ? branchId.slice(BRANCH_PREFIX.length)
    : null;
}

/**
 * Indizes aller Schritte eines Bands samt verschachtelter Unterbänder, ohne die
 * Raute selbst, aufsteigend. Ein Unterband zählt mit, sobald seine Raute im
 * Band (oder in einem schon gezählten Unterband) steht.
 * @param {BranchStep[]} steps @param {string} branchId
 * @returns {number[]}
 */
export function memberIndices(steps, branchId) {
  const ownerId = branchOwnerId(branchId);
  const start = ownerId === null ? -1 : steps.findIndex((s) => s.id === ownerId);
  if (ownerId !== null && start === -1) return [];
  const members = new Set([branchId]);
  const out = [];
  for (let i = start + 1; i < steps.length; i++) {
    const s = steps[i];
    if (!members.has(s.branchId)) continue;
    out.push(i);
    if (s.kind === 'decision') members.add(BRANCH_PREFIX + s.id);
  }
  return out;
}

/**
 * Die Indizes, die beim Verschieben des Schritts `id` zusammen wandern: der
 * Schritt selbst, bei einer Raute zusätzlich ihr ganzes Band.
 * @param {BranchStep[]} steps @param {string} id
 * @returns {number[]} aufsteigend; leer bei unbekannter id
 */
export function blockIndices(steps, id) {
  const at = steps.findIndex((s) => s.id === id);
  if (at === -1) return [];
  return steps[at].kind === 'decision' ? [at, ...memberIndices(steps, BRANCH_PREFIX + id)] : [at];
}

/**
 * Hält jedes Band gültig: ein Schritt bleibt nur im Band einer Raute, die vor
 * ihm steht; sonst fällt er in den Hauptpfad.
 * @template {BranchStep} S
 * @param {S[]} steps @returns {S[]} neue Liste (Schritte nur kopiert, wo sie sich ändern)
 */
export function reconcile(steps) {
  const open = new Set([MAIN_BRANCH]);
  return steps.map((s) => {
    const out = open.has(s.branchId) ? s : { ...s, branchId: MAIN_BRANCH };
    if (s.kind === 'decision') open.add(BRANCH_PREFIX + s.id);
    return out;
  });
}

/**
 * @param {BranchStep[]} steps @returns {boolean} jedes Band ist gültig (`reconcile` änderte nichts)
 */
export function branchesValid(steps) {
  const open = new Set([MAIN_BRANCH]);
  for (const s of steps) {
    if (!open.has(s.branchId)) return false;
    if (s.kind === 'decision') open.add(BRANCH_PREFIX + s.id);
  }
  return true;
}

/**
 * Die Bänder, in denen der Schritt `id` an seiner Stelle stehen darf: der
 * Hauptpfad und das Band jeder Raute davor.
 * @param {BranchStep[]} steps @param {string} id
 * @returns {string[]} Band-ids in Kettenfolge der Rauten; leer bei unbekannter id
 */
export function validBands(steps, id) {
  const at = steps.findIndex((s) => s.id === id);
  if (at === -1) return [];
  return [MAIN_BRANCH, ...steps.slice(0, at).filter((s) => s.kind === 'decision').map((s) => BRANCH_PREFIX + s.id)];
}

/**
 * Alle Bänder, die es gibt: der Hauptpfad und das Band jeder Raute.
 * @param {BranchStep[]} steps @returns {string[]}
 */
export function knownBands(steps) {
  return [MAIN_BRANCH, ...steps.filter((s) => s.kind === 'decision').map((s) => BRANCH_PREFIX + s.id)];
}

/**
 * Den Schritt `id` an einen Endindex verschieben; eine Raute nimmt ihr Band als
 * zusammenhängenden Block mit (ein nicht zusammenhängender Block schließt sich).
 * `index` ist die Stelle des Schritts bzw. der Raute nach dem Verschieben,
 * `0…länge − Blockgröße`. Bänder werden danach nicht bereinigt (`reconcile`).
 * @template {BranchStep} S
 * @param {S[]} steps @param {string} id @param {number} index
 * @returns {S[]}
 */
export function moveBlock(steps, id, index) {
  const block = blockIndices(steps, id);
  const inBlock = new Set(block);
  const rest = steps.filter((_, i) => !inBlock.has(i));
  rest.splice(index, 0, ...block.map((i) => steps[i]));
  return rest;
}

/**
 * Lücke der Altform (`0…länge`, vor dem Verschieben gezählt) → Endindex.
 * @param {BranchStep[]} steps @param {string} id @param {number} gap
 * @returns {number}
 */
export function gapToIndex(steps, id, gap) {
  return gap - blockIndices(steps, id).filter((i) => i < gap).length;
}

/**
 * Endindex → die Lücke der Kette, vor dem Verschieben gezählt, an der der Block
 * landet (für die Hervorhebung des Verbinders).
 * @param {BranchStep[]} steps @param {string} id @param {number} index
 * @returns {number} `0…länge`
 */
export function indexToGap(steps, id, index) {
  const inBlock = new Set(blockIndices(steps, id));
  const rest = steps.map((_, i) => i).filter((i) => !inBlock.has(i));
  return index < rest.length ? rest[index] : steps.length;
}
