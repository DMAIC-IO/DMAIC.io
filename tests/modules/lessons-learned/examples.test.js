/**
 * Lessons Learned: Beispiele.
 *
 * Beide Beispiele liegen in der Modulablage, bleiben in der Form ohne
 * `_schema`, laden über `fromExample` streng und ohne Reparatur, behalten ihre
 * ids `l1…`, und ihr `read()` gleicht dem der Altform bei fester Uhr — bis auf
 * das relative `updatedAt`, das die Altform als 0 las und die Zielform auflöst.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/lessons-learned/domain/model.js';
import { fromExample } from '../../../js/modules/lessons-learned/io/example.js';

setModelName(State, 'lessons-learned');

const BASE = '../../../js/modules/lessons-learned/resources/examples/';
const PIZZA = 'projects/lessons-pizza-pilotprojekt.json';
const FLYER = 'projects/lessons-learned-hubschrauber-flyer.json';
const LESSONS = { fields: ['lessons'] };

const RealDate = Date;
const NOW = new RealDate(2026, 10, 26, 12, 0, 0).getTime();
/** Zeitpunkt `n` Tage vor bzw. nach der festen Uhr. @param {number} n */
const day = (n) => { const d = new RealDate(NOW); d.setDate(d.getDate() + n); return d.getTime(); };

/**
 * Führt `fn` mit fester Uhr aus (`new Date()` und `Date.now()` liefern NOW).
 * @template T @param {() => T} fn @returns {T}
 */
function atFixedClock(fn) {
  class FixedDate extends RealDate {
    /** @param {any[]} a */
    constructor(...a) { if (a.length) super(...(/** @type {[any]} */ (a))); else super(NOW); }
    static now() { return NOW; }
  }
  globalThis.Date = /** @type {DateConstructor} */ (/** @type {unknown} */ (FixedDate));
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

/** `read(LESSONS).lessons` der Altform für das Pizza-Beispiel. */
const LEGACY_PIZZA = [
    {"id":"l1","title":"Vorab-Routenplanung spart im Pilot 5 min pro Bestellung","category":"success","phase":"improve","impact":"high","owner":"L. Becker","description":"Im Pilot wurden Routen vor Übergabe an den Fahrer in der App vorgeplant. Die durchschnittliche Lieferzeit sank von 42 auf 37 min.","rootCause":"Routen wurden bisher erst nach Übergabe spontan vom Fahrer entschieden.","recommendation":"Vorab-Routenplanung in den Standard-Prozess aufnehmen, App-Lizenzen für alle Schichten beschaffen.","actions":[{"text":"App-Lizenzen für alle Fahrer-Tablets","done":false}],"createdAt":day(-30),"updatedAt":0},
    {"id":"l2","title":"Thermo-Doppelwand-Boxen halten Temperatur signifikant länger","category":"success","phase":"improve","impact":"high","owner":"Einkauf","description":"Im Test waren Pizzen aus den Doppelwand-Boxen nach 20 min noch bei 52 °C statt 38 °C in der Altbox.","rootCause":"Alte Boxen mit defekten Dichtungen, Wärmeverlust > 10 °C/15 min.","recommendation":"Komplettausstattung mit Doppelwand-Boxen, alte Boxen entsorgen.","actions":[{"text":"30 Doppelwand-Boxen beschaffen","done":true}],"createdAt":day(-29),"updatedAt":0},
    {"id":"l3","title":"Wochenstart-Standup verkürzt Schnittstellen-Probleme","category":"improve","phase":"control","impact":"medium","owner":"M. Müller","description":"Ein 15-min-Standup am Montagmorgen mit Bestellannahme, Küche, Fahrern reduziert Missverständnisse über die Woche.","rootCause":"Frühere Kommunikation lief nur ad-hoc bei akuten Problemen.","recommendation":"Standup dauerhaft etablieren, Filialleiter moderiert.","actions":[],"createdAt":day(-28),"updatedAt":0},
    {"id":"l4","title":"Bestellannahme war unterschätzter Engpass","category":"problem","phase":"analyze","impact":"medium","owner":"L. Becker","description":"Adresseingabe ohne Autocomplete führt zu 15 % Adress-Korrekturen — verzögert die gesamte Liefer-Kette.","rootCause":"Bestellsystem ohne Adress-Datenbank gewählt, weil ursprünglich nur Kassenbetrieb.","recommendation":"Bei Neuanschaffung von Software die Logistikfunktionen mit-evaluieren.","actions":[{"text":"Adress-Autovervollständigung im Bestellsystem aktivieren","done":false}],"createdAt":day(-27),"updatedAt":0},
];

/** `read(LESSONS).lessons` der Altform für das Hubschrauber-Beispiel (`updatedAt` las sie als 0). */
const LEGACY_FLYER = [
    {"id":"l1","title":"Sequenzielle Bearbeitungsreihenfolge löst das Irreversibilitäts-Problem der Rotorlänge","category":"success","phase":"control","impact":"high","owner":"Flyer-Empfänger (Belt)","description":"Da mit nur einem Prototypen gearbeitet wurde und die Rotorlänge nur monoton per Schere gekürzt werden kann (8 → 6 → 4 cm, nie wieder länger), wurde das DoE nach Rotorlänge geblockt: erst alle Läufe bei 8 cm, dann kürzen auf 6 cm, dann auf 4 cm. `randomize: false` + Zeilenreihenfolge im Datenblatt bilden die physisch erzwungene Blockung ab.","rootCause":"Ein einzelner physischer Prototyp erlaubt keine echte Randomisierung eines irreversiblen Faktors — jede Rücknahme eines Schnitts ist unmöglich.","recommendation":"Bei irreversiblen/destruktiven Faktoren grundsätzlich nach diesem Faktor blocken und die Randomisierung auf die reversiblen Faktoren (hier: Klammernzahl) beschränken.","actions":[{"text":"Sequenzielle Blockung als Standard-Vorgehen für Projekte mit irreversiblen Faktoren im Handbuch dokumentieren","done":false}],"createdAt":day(-14),"updatedAt":0},
    {"id":"l2","title":"MSA vor DoE durchgeführt — Messsystem als Störgröße ausgeschlossen","category":"success","phase":"control","impact":"high","owner":"Fluglehrer (SME)","description":"Die Typ-1-Messsystemanalyse für den Zeitstopp (25 Wiederholmessungen der 2,000-s-Metronom-Referenz) wurde vor dem DoE abgeschlossen. Erst dadurch war sicher, dass die im DoE beobachtete Streuung tatsächlich von den Faktoren Rotorlänge/Klammernzahl stammt und nicht vom Messsystem selbst.","rootCause":"Ohne vorab abgesicherte Messfähigkeit wäre jede spätere Aussage über Faktoreffekte angreifbar gewesen.","recommendation":"MSA Typ 1 als Pflicht-Gate vor jedem DoE etablieren, nicht als optionalen Schritt.","actions":[{"text":"MSA-Typ-1-Gate vor DoE-Start fest in die Projekt-Checkliste aufnehmen","done":true}],"createdAt":day(-13),"updatedAt":0},
    {"id":"l3","title":"Fokus auf zwei Faktoren hält das Design handhabbar","category":"success","phase":"control","impact":"medium","owner":"Qprovement-Marketing","description":"Die bewusste Beschränkung auf zwei Faktoren (Rotorlänge, Klammernzahl) statt drei erlaubte ein vollständiges 3²-Design mit 2 Replikaten (18 Läufe) in einer Messestand-Session — ein drittes Faktorlevel hätte die Laufzahl auf 54+ getrieben.","rootCause":"Zeit- und Prototypen-Restriktionen am Messestand erlauben kein größeres Design.","recommendation":"Bei engem Zeitbudget den Faktorraum aktiv auf die zwei wirkungsstärksten Faktoren begrenzen, weitere Faktoren als Folgeprojekt vormerken.","actions":[],"createdAt":day(-12),"updatedAt":0},
    {"id":"l4","title":"Rotorbreite konnte nicht als dritter Faktor aufgenommen werden","category":"problem","phase":"control","impact":"medium","owner":"Papercraft-Enthusiast (SME)","description":"Die Rotorbreite ist wie die Rotorlänge nur monoton kürzbar — mit nur einem Prototypen hätte ein dritter irreversibler Faktor die Blockungsstruktur des Designs gesprengt (3 Faktoren × sequenzielle Blockung ist mit einem einzigen Flyer nicht mehr sauber trennbar).","rootCause":"Ein einzelner physischer Prototyp limitiert die Zahl gleichzeitig blockbarer irreversibler Faktoren auf eins.","recommendation":"Rotorbreite in einem zweiten Flyer als eigenständiges Augmentierungs-Design untersuchen.","actions":[{"text":"Zweiten Flyer für Augmentierungs-Design mit Rotorbreite als drittem Faktor vorbereiten","done":false}],"createdAt":day(-11),"updatedAt":0},
    {"id":"l5","title":"Wurftechnik dominiert die Reststreuung trotz optimaler Einstellung","category":"problem","phase":"control","impact":"high","owner":"Flyer-Empfänger (Belt)","description":"Auch bei den Bestätigungsläufen im Optimum (L = 6 cm, C = 1) blieb eine spürbare Streuung zwischen den 5 Läufen bestehen (σ ≈ 0,12 s). Die 5-Why-Analyse zeigt: Wurftechnik (Loslasshöhe, Drehimpuls beim Loslassen) ist nicht standardisiert und dominiert die Reststreuung stärker als jeder verbleibende Faktoreffekt.","rootCause":"Ohne feste Wurfvorrichtung wirft jede Person den Flyer minimal anders — Fallhöhe und Anfangsrotation variieren von Wurf zu Wurf.","recommendation":"Wurf-SOP dokumentieren und mittelfristig eine einfache Wurfvorrichtung bauen, um die Reststreuung weiter zu senken.","actions":[{"text":"Wurf-SOP (Loslasshöhe, Griff, Freigabetechnik) dokumentieren","done":false},{"text":"Einfache Wurfvorrichtung für reproduzierbare Fallhöhe/Rotation bauen","done":false}],"createdAt":day(-10),"updatedAt":0},
];

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(BASE + relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const T = (/** @type {string} */ k) => k;

/** Lesefläche wie im eingehängten Modul. @param {object} m @param {object} [options] */
const read = (m, options) => readSchemaModel(schemaAgentEntry(State), m, options, evaluateDerived(m, /** @type {any} */ (undefined), undefined, T));

/** Lädt über `fromExample` streng und mit Reparatur. @param {object} raw */
function load(raw) {
  const data = atFixedClock(() => fromExample(plain(raw), {}));
  State.fromJSON(plain(data));
  /** @type {string[]} */
  const repairs = [];
  const m = State.fromJSON(plain(data), { repair: true, onRepair: (f) => repairs.push(f) });
  return { m, repairs };
}

suite('lessons-learned: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson('examples.json');
    assertDeepEqual(own.examples.map((e) => e.id), ['lessons-pizza-pilotprojekt', 'lessons-learned-hubschrauber-flyer']);
    assertDeepEqual(own.examples.map((e) => e.file), [PIZZA, FLYER]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.modules, undefined);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  test('lessons-pizza-pilotprojekt: ohne _schema, ohne Reparatur, read() wie die Altform', async () => {
    const raw = await fetchJson(PIZZA);
    assertEqual(raw._schema, undefined);
    const { m, repairs } = load(raw);
    assertDeepEqual(repairs, []);
    assertDeepEqual(m.lessons.map((l) => l.id), ['l1', 'l2', 'l3', 'l4']);
    assertEqual(JSON.stringify(plain(read(m, LESSONS).lessons)), JSON.stringify(LEGACY_PIZZA));
    assertDeepEqual(plain(read(m).stats), { total: 4, success: 2, problem: 1, improve: 1, openActions: 2 });
  });

  test('lessons-learned-hubschrauber-flyer: ohne _schema, ohne Reparatur, read() wie die Altform, updatedAt aufgelöst', async () => {
    const raw = await fetchJson(FLYER);
    assertEqual(raw._schema, undefined);
    const { m, repairs } = load(raw);
    assertDeepEqual(repairs, []);
    assertDeepEqual(m.lessons.map((l) => l.id), ['l1', 'l2', 'l3', 'l4', 'l5']);
    const expected = LEGACY_FLYER.map((l) => ({ ...l, updatedAt: l.createdAt }));
    assertEqual(JSON.stringify(plain(read(m, LESSONS).lessons)), JSON.stringify(expected));
    assertDeepEqual(plain(read(m).stats), { total: 5, success: 3, problem: 2, improve: 0, openActions: 4 });
  });
});
