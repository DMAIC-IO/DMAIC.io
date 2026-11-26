/**
 * Stakeholder-Analyse: Beispiele.
 *
 * Beide Beispiele liegen in der Modulablage, bleiben in der Form ohne
 * `_schema`, laden streng und ohne Reparatur, behalten ihre ids `s1…`, und
 * ihr `read()` gleicht dem der Altform wörtlich.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { setModelName } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';
import { State } from '../../../js/modules/stakeholder-analysis/domain/model.js';

setModelName(State, 'stakeholder-analysis');

const BASE = '../../../js/modules/stakeholder-analysis/resources/examples/';
const PIZZA = 'projects/stakeholders-pizza-lieferung.json';
const FLYER = 'projects/stakeholder-analysis-hubschrauber-flyer.json';
const BOTH = { fields: ['stakeholders', 'quadrants'] };

/** `read(BOTH)` der Altform für das Pizza-Beispiel. */
const LEGACY_READ_PIZZA = {
  stakeholders: [
    { id: "s1", name: "S. Conti", role: "Geschäftsführerin", power: 5, interest: 5, support: "supporter", category: "intern", notes: "Treibt Projekt aktiv, finanziert Investitionen" },
    { id: "s2", name: "M. Müller", role: "Filialleiter", power: 4, interest: 5, support: "supporter", category: "intern", notes: "Operative Verantwortung, motiviert" },
    { id: "s3", name: "G. Rossi", role: "Senior-Pizzabäcker", power: 3, interest: 3, support: "neutral", category: "intern", notes: "Skeptisch gegenüber Prozessänderungen in der Küche" },
    { id: "s4", name: "Fahrer-Team", role: "Auslieferer", power: 2, interest: 4, support: "supporter", category: "intern", notes: "Möchten besseres Routenplanungs-Tool" },
    { id: "s5", name: "Kunden Berlin-Mitte", role: "Endkunden", power: 5, interest: 4, support: "neutral", category: "extern", notes: "Reklamationen steigend, Abwanderungsrisiko" },
    { id: "s6", name: "Bewertungsplattformen", role: "Multiplikator", power: 4, interest: 2, support: "neutral", category: "extern", notes: "Schlechte Bewertungen schaden Reichweite" },
    { id: "s7", name: "Buchhaltung", role: "Controlling", power: 2, interest: 2, support: "critic", category: "intern", notes: "Investitionen in Thermo-Boxen sind nicht eingeplant" },
  ],
  quadrants: [
    { id: 's1', quadrant: 'manage-closely' },
    { id: 's2', quadrant: 'manage-closely' },
    { id: 's3', quadrant: 'monitor' },
    { id: 's4', quadrant: 'keep-informed' },
    { id: 's5', quadrant: 'manage-closely' },
    { id: 's6', quadrant: 'keep-satisfied' },
    { id: 's7', quadrant: 'monitor' },
  ],
};

/** `read(BOTH)` der Altform für das Hubschrauber-Beispiel. */
const LEGACY_READ_FLYER = {
  stakeholders: [
    { id: "s1", name: "Qprovement-Marketing", role: "Sponsor", power: 5, interest: 5, support: "supporter", category: "intern", notes: "Finanziert und promotet den Messestand-Flyer, treibt das Projekt aktiv" },
    { id: "s2", name: "Messestand-Besucher", role: "Endanwender / Flyer-Empfänger", power: 3, interest: 5, support: "supporter", category: "extern", notes: "Erlebt das DMAIC-Projekt live am Stand, hohes Interesse an einem funktionierenden Demo-Hubschrauber" },
    { id: "s3", name: "Fluglehrer", role: "SME (Aerodynamik)", power: 2, interest: 3, support: "supporter", category: "intern", notes: "Berät zu Autorotation und Flugverhalten, geringe formale Macht im Projekt" },
    { id: "s4", name: "Papierhersteller", role: "Lieferant Flyer-Papier", power: 1, interest: 1, support: "neutral", category: "lieferant", notes: "Liefert das bedruckte Rohmaterial, keine Beteiligung am DMAIC-Ablauf" },
  ],
  quadrants: [
    { id: 's1', quadrant: 'manage-closely' },
    { id: 's2', quadrant: 'keep-informed' },
    { id: 's3', quadrant: 'monitor' },
    { id: 's4', quadrant: 'monitor' },
  ],
};

/** @param {string} relPath */
async function fetchJson(relPath) {
  const res = await fetch(new URL(BASE + relPath, import.meta.url), { cache: 'no-cache' });
  assertTrue(res.ok, `could not fetch ${relPath}: HTTP ${res.status}`);
  return res.json();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Lesefläche wie im eingehängten Modul. @param {object} m @param {object} [options] */
const read = (m, options) => readSchemaModel(schemaAgentEntry(State), m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

/** Lädt streng und mit Reparatur; liefert das Model und die reparierten Felder. @param {object} raw */
function load(raw) {
  State.fromJSON(plain(raw));
  /** @type {string[]} */
  const repairs = [];
  const m = State.fromJSON(plain(raw), { repair: true, onRepair: (f) => repairs.push(f) });
  return { m, repairs };
}

suite('stakeholder-analysis: Beispiele', () => {
  test('beide Beispiele stehen in der Modulablage', async () => {
    const own = await fetchJson('examples.json');
    assertDeepEqual(own.examples.map((e) => e.id), ['stakeholders-pizza-lieferung', 'stakeholder-analysis-hubschrauber-flyer']);
    assertDeepEqual(own.examples.map((e) => e.file), [PIZZA, FLYER]);
    for (const e of own.examples) {
      assertEqual(e.type, 'project');
      assertEqual(e.format, 'json');
      assertEqual(e.modules, undefined);
      assertTrue(!!e.title.de && !!e.title.en, `Titel fehlt: ${e.id}`);
      assertTrue(!!e.description.de && !!e.description.en, `Beschreibung fehlt: ${e.id}`);
    }
  });

  for (const [name, file, legacy] of [['stakeholders-pizza-lieferung', PIZZA, LEGACY_READ_PIZZA], ['stakeholder-analysis-hubschrauber-flyer', FLYER, LEGACY_READ_FLYER]]) {
    test(`${name}: ohne _schema, streng ohne Reparatur, read() wie die Altform`, async () => {
      const raw = await fetchJson(file);
      assertEqual(raw._schema, undefined);
      const { m, repairs } = load(raw);
      assertDeepEqual(repairs, []);
      assertDeepEqual(m.stakeholders.map((s) => s.id), legacy.stakeholders.map((s) => s.id));
      assertEqual(JSON.stringify(plain(read(m, BOTH))), JSON.stringify(legacy));
      const n = legacy.stakeholders.length;
      const desc = plain(read(m));
      assertEqual(desc.stakeholders.rowCount, n);
      assertEqual(desc.quadrants.rowCount, n);
    });
  }
});
