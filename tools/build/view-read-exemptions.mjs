/**
 * Bewusste Lesezugriffe auf `stateManager` / `getModuleState` im view-Block
 * umgestellter Module (Gate Lesezugriff, `checkViewReads` in module-gates.mjs).
 *
 * Je Modul eine Liste `{ file, member, names, reason }`: `file` ist die Datei
 * des view-Teils relativ zum Modulordner, `member` das oberste Glied des
 * zurückgegebenen Objekts (Methode, Getter, Eigenschaft), `names` die
 * erlaubten Bezeichner dort. So eng wie möglich fassen; ohne Grund kein
 * Eintrag. Eine Ausnahme, die nichts mehr trifft, meldet das Gate.
 *
 * @typedef {{ file: string, member: string, names: string[], reason: string }} ViewReadExemption
 * @type {Record<string, ViewReadExemption[]>}
 */
export const VIEW_READ_EXEMPTIONS = {
  worksheet: [
    {
      file: 'viewmodel/sheets.js',
      member: 'init',
      names: ['stateManager', 'getModuleState'],
      reason: 'Besitzer der Daten: liest beim Einhängen den eigenen gespeicherten Stand, um einen neuen oder migrierten Stand sofort abzulegen, wie die Altform beim Einhängen; kein abhängiger Lesewert',
    },
    {
      file: 'viewmodel/toolbar.js',
      member: 'init',
      names: ['stateManager'],
      reason: 'Projektabschluss (isCompleted) schaltet das Raster nur lesend, wie die Altform (_isReadOnly): beim Einhängen und bei project:status-changed in den UI-State (projectCompleted); kein Arbeitsblattinhalt, den ctx.data liefern könnte',
    },
  ],
};
