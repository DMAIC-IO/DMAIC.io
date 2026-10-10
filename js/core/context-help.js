/**
 * D.Mike — Kontexthilfe am Label (context-help.js)
 *
 * Die UI-Seite der Agenten-Kontexthilfen. Spec §8 verlangt, dass derselbe
 * i18n-Schlüssel die Agentenbeschreibung UND die Kontexthilfe in der UI
 * speist — „die Kontexthilfe flächendeckend zu haben ist ohnehin eine
 * Verbesserung für Menschen; der Agent ist der Anlass, nicht der einzige
 * Nutznießer."
 *
 * Bedienung (Nutzerentscheid 2026-10-09):
 *   • Alt halten  → am rechten oberen Rand jedes beschriebenen Labels
 *     erscheint ein kleines Fragezeichen im Kreis.
 *   • Klick       → ein kleines Kontextfenster mit dem Hilfetext.
 *   • Klick auf den Hintergrund (oder Escape) → geschlossen.
 *
 * Das Fragezeichen liegt DAUERHAFT im DOM und wird nur über `visibility`
 * ein- und ausgeblendet: so verschiebt das Halten der Alt-Taste das Layout
 * nicht um einen Pixel.
 *
 * Emittenten markieren nur:
 *
 *   <label data-help-key="modules.five-why.fields.problem.help">Problem</label>
 *
 * Alles Visuelle — Icon, Knopf, Fenster, Hintergrund, aria — liegt in dieser
 * einen Datei plus dem CSS in components.css. Fehlt der i18n-Schlüssel,
 * entsteht KEIN Knopf: eine Lücke bleibt sichtbar und blockiert nichts
 * (Spec §8, Regel 1).
 *
 * Muster und Idempotenz-Vertrag sind von `core/glossary-inline.js` übernommen;
 * wer dort etwas ändert, sollte hier hinsehen.
 */
import { icon } from './icon.js';

const ARMED_CLASS = 'dmike-context-help-armed';

/* Der eingespritzte Knopf spiegelt `data-help-key` (DOM-Vertrag der E2E-Tests)
   und wäre damit selbst ein Anker — die Negation hält ihn aus dem Durchlauf. */
const ANCHOR_SELECTOR = '[data-help-key]:not(.context-help__btn)';

const STATE = {
  /** @type {object|null} i18n-Instanz, gesetzt über setContextHelpConfig */
  i18n: null,
  /** @type {MutationObserver|null} */
  observer: null,
  /** @type {{ panel: HTMLElement, backdrop: HTMLElement }|null} */
  open: null,
  /** ob die Tasten- und Klickbehandlung schon hängt */
  wired: false,
};

/**
 * i18n-Instanz binden. Beim Rahmenaufbau einmal, bei Sprachwechsel erneut —
 * die Texte werden beim Öffnen gelesen, ein erneuter Aufruf genügt also.
 * @param {{ i18n?: object }} cfg
 */
export function setContextHelpConfig(cfg = {}) {
  if (cfg.i18n) STATE.i18n = cfg.i18n;
}

/**
 * Jedes `[data-help-key]` unter `root` mit dem Fragezeichen-Knopf versehen.
 * Billig genug, um beliebig oft aufgerufen zu werden.
 * @param {ParentNode} root
 */
export function augmentContextHelp(root = document) {
  if (!STATE.i18n || !root || typeof root.querySelectorAll !== 'function') return;
  for (const anchor of root.querySelectorAll(ANCHOR_SELECTOR)) augmentOne(anchor);
  if (root.matches?.(ANCHOR_SELECTOR)) augmentOne(root);
}

/**
 * Erster Durchlauf plus genau ein MutationObserver auf `document.body`, plus
 * die Alt-Tasten- und Klickbehandlung. Mehrfachaufruf ist unschädlich.
 */
export function startContextHelp() {
  if (typeof document === 'undefined') return;
  if (!STATE.wired) {
    wireGlobalHandlers();
    STATE.wired = true;
  }
  augmentContextHelp(document);
  if (STATE.observer || typeof MutationObserver === 'undefined') return;
  STATE.observer = new MutationObserver(handleMutations);
  STATE.observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Das Kontextfenster zu einem Knopf öffnen. Es ist immer höchstens eines
 * offen — zwei übereinander wären unlesbar.
 * @param {HTMLElement} button  der `.context-help__btn`
 */
export function openContextHelp(button) {
  closeContextHelp();
  if (!button || !STATE.i18n) return;
  const key = button.getAttribute('data-help-key');
  if (!key || !STATE.i18n.exists?.(key)) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'context-help__backdrop';

  const panel = document.createElement('div');
  panel.className = 'context-help__panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');

  const anchor = button.parentElement?.closest(ANCHOR_SELECTOR);
  const label = anchor ? anchorLabel(anchor) : '';
  if (label) {
    const title = document.createElement('div');
    title.className = 'context-help__panel-title';
    title.textContent = label;
    panel.appendChild(title);
  }
  const body = document.createElement('div');
  body.className = 'context-help__panel-body';
  body.textContent = STATE.i18n.t(key);
  panel.appendChild(body);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  position(panel, button);
  STATE.open = { panel, backdrop };
}

/** Das offene Kontextfenster schließen. Ohne offenes Fenster ein No-op. */
export function closeContextHelp() {
  if (!STATE.open) return;
  STATE.open.panel.remove();
  STATE.open.backdrop.remove();
  STATE.open = null;
}

const DESCRIPTIONS_ID = 'dmike-context-help-descriptions';

/* Alpines Bindung bleibt als Merkmal im DOM stehen, auch nachdem sie
   ausgewertet wurde — daran ist ein fremder Titel auch dann erkennbar, wenn
   wir VOR Alpine laufen und `title` noch gar nicht gesetzt ist. */
const TITLE_BINDINGS = [':title', 'x-bind:title'];

/**
 * Ob das Element seinen `title` selbst mitbringt — als Merkmal oder als
 * Alpine-Bindung. Beides heißt: Finger weg.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function hasOwnTitle(el) {
  return el.hasAttribute('title') || TITLE_BINDINGS.some((a) => el.hasAttribute(a));
}

/**
 * Einem Element den Hilfesatz zu `key` als `title` und `aria-describedby`
 * anlegen — die EINE Anwendung dieser beiden Merkmale im Projekt. Wer
 * irgendwo eine Kontexthilfe an ein Element hängt (als Nächstes die
 * Werkzeugleisten-Knöpfe aus `ui/resolve-actions.js` und `ui/workspace.js`),
 * ruft das hier und löst den Text nicht selbst auf: zwei Anwendungen gegen
 * eine Quelle driften genauso auseinander wie zwei Quellen.
 *
 * Wie weit die beiden Wege wirklich tragen:
 *
 *   `title` — trägt überall. Der Satz als Maus-Tooltip, ohne Vorwissen über
 *   die Alt-Taste. Das ist die eigentliche Lücke, nicht die Redundanz zum
 *   Kontextfenster. ABER: nur, wenn das Element nicht schon einen eigenen
 *   `title` hat. Bei den Symbolknöpfen `undo`/`redo` der Datensammlung ist
 *   dieser kurze Titel die EINZIGE Quelle des zugänglichen Namens (der Inhalt
 *   ist ein `aria-hidden`-Icon, das Fragezeichen ist `visibility: hidden` und
 *   zählt nicht mit). Ihn zu überschreiben nähme dem Knopf seinen Namen samt
 *   Tastenkürzel. Solche Anker behalten ihren Titel und bekommen den langen
 *   Satz über `aria-describedby`.
 *
 *   `aria-describedby` — wirkt nur an Elementen, die auch FOKUSSIERT werden:
 *   Knöpfe und Eingabefelder. An einem `<label>` ohne `for` (five-why
 *   „Problemstellung", die sechs Labels des Hypothesentests) liest es
 *   niemand vor — das Label bekommt keinen Fokus, und das Eingabefeld daneben
 *   erbt die Beschreibung nicht. Diese Anker tragen den Satz faktisch nur über
 *   `title`. Die Label-Verknüpfung nachzuziehen ist ein eigenes Stück Arbeit
 *   (ROADMAP-Eintrag über Task 19), kein Teil dieser Stufe.
 *
 * Beide werden bei JEDEM Aufruf neu gesetzt, nicht beim ersten eingefroren —
 * aus demselben Grund wie das `aria-label` am Fragezeichen.
 *
 * @param {HTMLElement} el  das zu beschreibende Element
 * @param {string} key  der i18n-Hilfeschlüssel
 * @returns {string} der angewandte Satz, oder `''` wenn der Schlüssel nicht auflöst
 */
export function describeElement(el, key) {
  if (!el || !key || !STATE.i18n?.exists?.(key)) return '';
  const text = STATE.i18n.t(key);
  // Den eigenen Titel wiedererkennen: ohne diese Marke wäre der Satz nach dem
  // ersten Durchlauf eingefroren (ab dann trägt das Element ja einen `title`)
  // und ein Sprachwechsel zöge ihn nicht mehr nach.
  if (!hasOwnTitle(el) || el.dataset.contextHelpTitle === '1') {
    el.setAttribute('title', text);
    el.dataset.contextHelpTitle = '1';
  }
  el.setAttribute('aria-describedby', describeTarget(key, text).id);
  return text;
}

/**
 * Das verborgene Beschreibungsziel zu einem Hilfeschlüssel — die EINZIGE
 * Stelle, an der solche Ziele entstehen. Normalerweise nicht direkt rufen,
 * sondern `describeElement(el, key)`: das ist die vollständige Anwendung
 * einschließlich der Titelregel. Direkt gebraucht wird `describeTarget` nur,
 * wo die Kennung ohne ein Element gebraucht wird.
 *
 * Ein Ziel JE SCHLÜSSEL, nicht je Anker: `hypothesis-test.html` trägt
 * `fields.targetValue.help` zweimal (σ²₀ und μ₀), und zwei Elemente mit
 * derselben id wären ungültiges HTML. Mehrere Anker dürfen auf dasselbe
 * `aria-describedby`-Ziel zeigen — das ist der vorgesehene Weg.
 *
 * Die Ziele liegen gesammelt in einem Behälter an `document.body`, nicht am
 * Anker: ein Kind IM Anker würde unter „name from content" in dessen
 * zugänglichen Namen einfließen („Why hinzufügen Legt eine Why-Frage an."),
 * von Alpines `x-text` weggewischt (derselbe Grund, aus dem die Idempotenz in
 * `augmentOne` am Knopf hängt und nicht am Merkmal) und in `anchorLabel`
 * mitzählen.
 *
 * @param {string} key  der i18n-Hilfeschlüssel, z. B. `modules.five-why.fields.problem.help`
 * @param {string} text  der aufgelöste Satz; wird bei jedem Aufruf neu gesetzt,
 *   damit ein Sprachwechsel nachgezogen wird
 * @returns {HTMLElement} das `<span>` mit der `id` für `aria-describedby`
 */
export function describeTarget(key, text) {
  let box = document.getElementById(DESCRIPTIONS_ID);
  if (!box) {
    box = document.createElement('div');
    box.id = DESCRIPTIONS_ID;
    box.className = 'dmike-sr-only';
    document.body.appendChild(box);
  }
  const id = `ch-desc-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  let target = document.getElementById(id);
  if (!target) {
    target = document.createElement('span');
    target.id = id;
    // Die Klasse auch am `<span>`, nicht nur am Behälter: so bleibt das Ziel
    // verborgen, falls es je woanders hängt.
    target.className = 'dmike-sr-only';
    box.appendChild(target);
  }
  // Wie beim `aria-label`: bei jedem Durchlauf neu, damit ein Sprachwechsel
  // nachgezogen wird.
  target.textContent = text;
  return target;
}

// ─── Intern ────────────────────────────────────────────────────────

function augmentOne(anchor) {
  if (!anchor || anchor.classList.contains('context-help__btn')) return;
  const key = anchor.getAttribute('data-help-key');
  // Kein Schlüssel hinterlegt → kein Knopf. Die Lücke ist dann sichtbar und
  // wird über `npm run agent:report` gezählt, statt eine leere Blase zu
  // öffnen.
  if (!key || !STATE.i18n?.exists?.(key)) return;

  // Idempotenz am tatsächlich vorhandenen Kind, nicht nur am Merkmal: Alpines
  // `x-text` setzt `textContent` und wischt den eingespritzten Knopf dabei
  // weg, ohne das Merkmal anzufassen. Ein Merkmal allein hieße: einmal
  // überschrieben, für immer ohne Knopf.
  let button = anchor.querySelector(':scope > .context-help__btn');
  if (!button) {
    // Ein `<span role="button">`, KEIN `<button>`: der Anker darf selbst ein
    // Knopf sein (five-why: „Why hinzufügen"), und ein `<button>` in einem
    // `<button>` ist ungültiges Markup.
    button = document.createElement('span');
    button.setAttribute('role', 'button');
    button.className = 'context-help__btn';
    button.setAttribute('data-help-key', key);
    // Nicht im Tabulator-Lauf: die Fläche ist ein Zusatz, kein Pflichtweg; über
    // die Tastatur bleibt der Hilfetext über das Handbuch erreichbar.
    button.tabIndex = -1;
    button.appendChild(icon('status.help', { size: 'sm' }));
    // Der Griff MUSS am Knopf selbst hängen, nicht nur am Dokument: ist der
    // Anker ein Knopf mit eigenem `@click` (Alpine hängt direkt am Element),
    // liefe dessen Griff in der Bubble-Phase VOR dem Dokumentgriff — ein
    // Klick auf das Fragezeichen hätte die Aktion des Ankers ausgelöst.
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContextHelp(button);
    });
    anchor.appendChild(button);
  }

  // Der Labeltext wird bei jedem Durchlauf neu gelesen statt beim ersten
  // eingefroren: beim Einhängen einer Vorlage steht der Text noch nicht da
  // (Alpines `x-text` füllt erst in `initTree`), die Beschriftung wäre sonst
  // dauerhaft „Kontexthilfe zu „“ anzeigen".
  button.setAttribute(
    'aria-label',
    STATE.i18n.t('contextHelp.ariaLabel', { label: anchorLabel(anchor) }),
  );

  describeElement(anchor, key);

  anchor.classList.add('context-help-anchor');
  // Nur noch Markierung für Diagnose und E2E — die Idempotenz hängt oben am
  // Knopf selbst, weil dieses Merkmal einen `textContent`-Überschreiber
  // überlebt, der Knopf aber nicht.
  anchor.dataset.contextHelpAugmented = '1';
}

/**
 * Der sichtbare Text des Ankers ohne den eingespritzten Knopf.
 * @param {HTMLElement} anchor
 * @returns {string}
 */
function anchorLabel(anchor) {
  let text = '';
  for (const node of anchor.childNodes) {
    if (node.nodeType === 1 && node.classList?.contains('context-help__btn')) continue;
    text += node.textContent ?? '';
  }
  return text.trim();
}

function handleMutations(records) {
  for (const record of records) {
    if (record.type !== 'childList') continue;
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1) {
        // Ein Textknoten statt eines Elements — das ist der Abdruck von
        // `el.textContent = …` (Alpines `x-text`). Dabei verschwindet der
        // Knopf aus dem Anker; ohne diesen Zweig käme er nie zurück, weil
        // Merkmalsänderungen hier nicht beobachtet werden.
        if (record.target?.nodeType === 1) augmentContextHelp(record.target);
        continue;
      }
      // Eigene Einspritzungen nicht erneut anfassen.
      if (node.classList?.contains('context-help__btn')) continue;
      augmentContextHelp(node);
    }
  }
}

function wireGlobalHandlers() {
  // Alt halten „schärft" die Fläche. Der Zustand hängt an einer Körperklasse,
  // damit das Sichtbarmachen reines CSS ist und keine Reflow-Welle auslöst.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Alt') document.body.classList.add(ARMED_CLASS);
    if (event.key === 'Escape') closeContextHelp();
  });
  const disarm = () => document.body.classList.remove(ARMED_CLASS);
  window.addEventListener('keyup', (event) => { if (event.key === 'Alt') disarm(); });
  // Ohne diese zwei verliert der Browser das keyup (Fensterwechsel per
  // Alt+Tab ist genau der Fall) und die Fragezeichen blieben stehen.
  window.addEventListener('blur', disarm);
  document.addEventListener('visibilitychange', disarm);

  // Nur der Hintergrundklick: ein Zweig für den Knopf selbst wäre hier
  // unerreichbar. Jeder Knopf bekommt bei seiner Erzeugung seinen eigenen
  // Griff (`augmentOne`), der `stopPropagation()` ruft — und geklont wird
  // keiner: `querySelectorAll` steigt nicht in `<template>`-Inhalte, und
  // Alpines `x-for` vervielfältigt nur noch nicht ergänzten Inhalt.
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('.context-help__backdrop')) closeContextHelp();
  });
}

/**
 * Das Fenster unter dem Knopf platzieren und am Viewport-Rand zurückholen.
 * Feste Positionierung, damit Scrollcontainer es nicht abschneiden.
 */
function position(panel, button) {
  const rect = button.getBoundingClientRect();
  const width = panel.offsetWidth || 280;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${rect.bottom + 6}px`;
}
