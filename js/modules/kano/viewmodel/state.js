/**
 * D.Mike — Kano: UI-State.
 *
 * Die VoC→CTx-Bäume des Projekts aus dem letzten Lesen (über
 * `ctx.instances`; je Baum die Instanz, ein Anzeigename und die Kundenstimmen
 * in der Leseform des Baum-Moduls), ob die Verknüpfung eben bewusst gelöst
 * wurde (sperrt die Heilung auf den einzigen Baum) und das Umbenennen eines
 * Reiters. Je Komponente, nie gespeichert.
 */
import { defineState, list, object, text, boolean, unchecked } from '../../../core/model.js';

export const UiState = defineState({
  trees: list(object({ instanceId: text(), name: text(), vocs: list(unchecked()) })),
  unlinked: boolean(),
  renamingRespondentId: text({ nullable: true }),
  renameDraft: text(),
});
