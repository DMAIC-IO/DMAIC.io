/**
 * D.Mike — Makigami Export: Dateiname, JSON-Wert, Tabellen.
 *
 * Reine Funktionen; Texte (Spaltenköpfe, Platzhalter, Kennzahlen) reicht das
 * Viewmodel übersetzt herein. Der JSON-Wert hat die Form des Altexports
 * (`toJSON()` der Altform), damit die Datei zeichengleich bleibt.
 */

/**
 * @typedef {{ id: string, label: string }} Role
 * @typedef {{ id: string, title: string, description: string, roleIds: string[], processTime: string,
 *   waitTime: string, mudaIds: string[], notes: string }} Step
 * @typedef {{ id: string, code: string, labelKey?: string, label: string, color: string }} MudaCategory
 * @typedef {{ id: string, label: string, factorSeconds: number }} TimeUnit
 * @typedef {{ title: string, roles: ReadonlyArray<Role>, steps: ReadonlyArray<Step>,
 *   mudaCategories: ReadonlyArray<MudaCategory>, timeUnits: ReadonlyArray<TimeUnit>,
 *   collapsed: ReadonlyArray<string>, settingsOpen: boolean }} MakigamiData
 */

/**
 * Der Dateiname ohne Endung: Kleinbuchstaben, Ziffern und Bindestriche aus
 * dem Titel, sonst `makigami`.
 * @param {string} title @returns {string}
 */
export function fileNameBase(title) {
  const slug = (title || 'makigami')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'makigami';
}

/**
 * Die Beschriftung eines Schritts: `S<n>`, mit Titel `S<n>: <Titel>`.
 * @param {{ title: string }} step @param {number} i Position ab 0 @returns {string}
 */
export function stepLabel(step, i) {
  return `S${i + 1}${step.title ? `: ${step.title}` : ''}`;
}

/**
 * Der Name einer Rolle, ohne Namen der Platzhalter.
 * @param {Role} role @param {string} placeholder @returns {string}
 */
export function roleName(role, placeholder) {
  return role.label.trim() || placeholder;
}

/**
 * Der JSON-Wert in der Form des Altexports: Schlüssel in derselben
 * Reihenfolge, `expanded` je Schritt aus `collapsed`, `labelKey` hinter
 * `color` und nur, wenn gesetzt, zuletzt `settingsOpen`.
 * @param {MakigamiData} m @returns {object}
 */
export function toLegacyJSON(m) {
  const collapsed = new Set(m.collapsed);
  return {
    title: m.title,
    roles: m.roles.map((r) => ({ id: r.id, label: r.label })),
    steps: m.steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      roleIds: [...s.roleIds],
      processTime: s.processTime,
      waitTime: s.waitTime,
      mudaIds: [...s.mudaIds],
      notes: s.notes,
      expanded: !collapsed.has(s.id),
    })),
    mudaCategories: m.mudaCategories.map((c) => {
      /** @type {Record<string, string>} */
      const out = { id: c.id, code: c.code, label: c.label, color: c.color };
      if (c.labelKey) out.labelKey = c.labelKey;
      return out;
    }),
    timeUnits: m.timeUnits.map((u) => ({ id: u.id, label: u.label, factorSeconds: u.factorSeconds })),
    settingsOpen: m.settingsOpen,
  };
}

/**
 * @typedef {object} StepTexts
 * @property {string[]} header  die sieben Spaltenköpfe
 * @property {string} rolePlaceholder  Name einer Rolle ohne Namen
 * @property {(cat: MudaCategory) => string} mudaLabel  Name einer Verschwendungsart
 */

/**
 * Die Schrittliste als Zeilen (erste Zeile = Kopf): Schritt, Tätigkeit,
 * Rollen, Bearbeitung, Warten, Verschwendung, Notizen. Rollen und Arten mit
 * `; ` verbunden, unbekannte ids übergangen.
 * @param {MakigamiData} m @param {StepTexts} texts @returns {string[][]}
 */
export function stepRows(m, texts) {
  const roles = new Map(m.roles.map((r) => [r.id, r]));
  const cats = new Map(m.mudaCategories.map((c) => [c.id, c]));
  return [
    [...texts.header],
    ...m.steps.map((s, i) => [
      stepLabel(s, i),
      s.description,
      s.roleIds.map((id) => roles.get(id)).filter((r) => r !== undefined)
        .map((r) => roleName(/** @type {Role} */ (r), texts.rolePlaceholder)).join('; '),
      s.processTime,
      s.waitTime,
      s.mudaIds.map((id) => cats.get(id)).filter((c) => c !== undefined)
        .map((c) => texts.mudaLabel(/** @type {MudaCategory} */ (c))).join('; '),
      s.notes,
    ]),
  ];
}

/**
 * Die Matrix Rollen × Schritte als Zeilen: Kopf mit den Schritten, je Rolle
 * eine Zeile mit `mark` bei Mitwirkung, sonst leer.
 * @param {MakigamiData} m @param {{ rolePlaceholder: string, mark: string }} texts @returns {string[][]}
 */
export function matrixRows(m, texts) {
  return [
    ['', ...m.steps.map((s, i) => stepLabel(s, i))],
    ...m.roles.map((r) => [
      roleName(r, texts.rolePlaceholder),
      ...m.steps.map((s) => (s.roleIds.includes(r.id) ? texts.mark : '')),
    ]),
  ];
}

/**
 * Die Kennzahlen als Zeilen `[Beschriftung, Wert]`; Werte sind die
 * Anzeigetexte (eine Dauer ist keine Zahl, die PCE trägt die Einheit).
 * @param {ReadonlyArray<string>} labels @param {ReadonlyArray<string>} values @returns {string[][]}
 */
export function kpiRows(labels, values) {
  return labels.map((l, i) => [l, values[i]]);
}
