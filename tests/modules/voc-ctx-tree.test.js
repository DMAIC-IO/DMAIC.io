/**
 * D.Mike — VoC → CTx Tree Model unit tests (voc-ctx-tree.test.js)
 *
 * Tests the pure business logic / state in voc-ctx-tree-model.js:
 * constructor defaults, toJSON/fromJSON roundtrip & style sanitization,
 * node CRUD (VoC / Need / Driver / Requirement), sibling reorder with
 * cross-group rejection, export-row flattening, active-VoC selection,
 * and hasContent().
 */

import { suite, test, assertEqual, assert } from '../test-utils.js';
import { State, DEFAULT_COLORS } from '../../js/modules/voc-ctx-tree/voc-ctx-tree-model.js';

suite('VoC-CTx Model — defaults & serialization', () => {
  test('constructor: empty vocs, no active, default styles', () => {
    const s = new State();
    assertEqual(Array.isArray(s.vocs), true);
    assertEqual(s.vocs.length, 0);
    assertEqual(s.activeVocId, null);
    assertEqual(s.styles.borderWidth, 1);
    assertEqual(s.styles.colors.voc, DEFAULT_COLORS.voc);
    assertEqual(s.styles.colors.req, DEFAULT_COLORS.req);
  });

  test('toJSON returns { vocs, activeVocId, styles }', () => {
    const s = new State();
    const id = s.addVoc('Hello', 'src');
    const j = s.toJSON();
    assertEqual(Array.isArray(j.vocs), true);
    assertEqual(j.vocs.length, 1);
    assertEqual(j.activeVocId, id);
    assertEqual(j.styles.borderWidth, 1);
    assertEqual(typeof j.styles.colors.voc, 'string');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.vocs.length, 0);
    assertEqual(s.activeVocId, null);
    assertEqual(s.styles.colors.ctq, DEFAULT_COLORS.ctq);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.vocs.length, 0);
    assertEqual(s.styles.borderWidth, 1);
  });

  test('fromJSON(malformed) returns valid default', () => {
    const s = State.fromJSON({ vocs: 'not-array', styles: 42, activeVocId: 99 });
    assertEqual(Array.isArray(s.vocs), true);
    assertEqual(s.vocs.length, 0);
    assertEqual(s.styles.borderWidth, 1);
    assertEqual(s.styles.colors.voc, DEFAULT_COLORS.voc);
  });

  test('fromJSON merges partial styles onto defaults', () => {
    const s = State.fromJSON({
      vocs: [],
      styles: { borderWidth: 3, colors: { voc: 'rgba(1,2,3,1)' } },
    });
    assertEqual(s.styles.borderWidth, 3);
    assertEqual(s.styles.colors.voc, 'rgba(1,2,3,1)');
    // missing color keys fall back to defaults
    assertEqual(s.styles.colors.need, DEFAULT_COLORS.need);
  });

  test('toJSON → fromJSON roundtrip is lossless', () => {
    const s = new State();
    const vId = s.addVoc('Pizza cold', 'survey');
    const nId = s.addNeed(vId, 'Hot pizza');
    const dId = s.addDriver(vId, nId, 'Temperature', 'ctd');
    s.addRequirement(vId, nId, dId, 'T >= 50C', 'tgt', 'thermo');
    const j = s.toJSON();
    const s2 = State.fromJSON(JSON.parse(JSON.stringify(j)));
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(j));
  });

  test('fromJSON auto-selects first VoC when activeVocId missing', () => {
    const s = State.fromJSON({
      vocs: [{ id: 'a', text: 'A', source: '', needs: [] }],
    });
    assertEqual(s.activeVocId, 'a');
  });
});

suite('VoC-CTx Model — VoC CRUD', () => {
  test('addVoc appends and returns id; auto-selects first', () => {
    const s = new State();
    const id = s.addVoc('Statement 1');
    assertEqual(s.vocs.length, 1);
    assertEqual(s.vocs[0].text, 'Statement 1');
    assertEqual(s.vocs[0].source, '');
    assertEqual(Array.isArray(s.vocs[0].needs), true);
    assertEqual(s.activeVocId, id);
  });

  test('addVoc sets new VoC active (legacy behaviour)', () => {
    const s = new State();
    s.addVoc('First');
    const second = s.addVoc('Second');
    assertEqual(s.activeVocId, second);
  });

  test('updateVoc changes text and source', () => {
    const s = new State();
    const id = s.addVoc('Old', 'oldsrc');
    s.updateVoc(id, 'New', 'newsrc');
    assertEqual(s.vocs[0].text, 'New');
    assertEqual(s.vocs[0].source, 'newsrc');
  });

  test('deleteVoc removes and reselects first remaining', () => {
    const s = new State();
    const a = s.addVoc('A');
    const b = s.addVoc('B');
    s.setActiveVoc(b);
    s.deleteVoc(b);
    assertEqual(s.vocs.length, 1);
    assertEqual(s.activeVocId, a);
  });

  test('deleteVoc last leaves activeVocId null', () => {
    const s = new State();
    const a = s.addVoc('A');
    s.deleteVoc(a);
    assertEqual(s.vocs.length, 0);
    assertEqual(s.activeVocId, null);
  });

  test('deleteVoc of inactive keeps current active', () => {
    const s = new State();
    const a = s.addVoc('A');
    const b = s.addVoc('B');
    s.setActiveVoc(a);
    s.deleteVoc(b);
    assertEqual(s.activeVocId, a);
  });
});

suite('VoC-CTx Model — Need / Driver / Requirement CRUD', () => {
  test('addNeed appends a need with empty drivers', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'Need 1');
    assertEqual(s.vocs[0].needs.length, 1);
    assertEqual(s.vocs[0].needs[0].text, 'Need 1');
    assertEqual(Array.isArray(s.vocs[0].needs[0].drivers), true);
    assertEqual(typeof n, 'string');
  });

  test('addNeed on missing voc returns null', () => {
    const s = new State();
    assertEqual(s.addNeed('nope', 'x'), null);
  });

  test('updateNeed / deleteNeed', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n1 = s.addNeed(v, 'N1');
    s.addNeed(v, 'N2');
    s.updateNeed(v, n1, 'N1-edited');
    assertEqual(s.vocs[0].needs[0].text, 'N1-edited');
    s.deleteNeed(v, n1);
    assertEqual(s.vocs[0].needs.length, 1);
    assertEqual(s.vocs[0].needs[0].text, 'N2');
  });

  test('addDriver with type', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'Driver', 'ctc');
    const drv = s.vocs[0].needs[0].drivers[0];
    assertEqual(drv.text, 'Driver');
    assertEqual(drv.type, 'ctc');
    assertEqual(Array.isArray(drv.requirements), true);
    assertEqual(typeof d, 'string');
  });

  test('updateDriver changes text and type', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    s.updateDriver(v, n, d, 'D2', 'ctd');
    const drv = s.vocs[0].needs[0].drivers[0];
    assertEqual(drv.text, 'D2');
    assertEqual(drv.type, 'ctd');
  });

  test('deleteDriver', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d1 = s.addDriver(v, n, 'D1', 'ctq');
    s.addDriver(v, n, 'D2', 'ctd');
    s.deleteDriver(v, n, d1);
    assertEqual(s.vocs[0].needs[0].drivers.length, 1);
    assertEqual(s.vocs[0].needs[0].drivers[0].text, 'D2');
  });

  test('addRequirement with target/measure', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    const r = s.addRequirement(v, n, d, 'Req', 'tgt', 'msr');
    const req = s.vocs[0].needs[0].drivers[0].requirements[0];
    assertEqual(req.text, 'Req');
    assertEqual(req.target, 'tgt');
    assertEqual(req.measure, 'msr');
    assertEqual(typeof r, 'string');
  });

  test('addRequirement defaults target/measure to empty', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    s.addRequirement(v, n, d, 'Req');
    const req = s.vocs[0].needs[0].drivers[0].requirements[0];
    assertEqual(req.target, '');
    assertEqual(req.measure, '');
  });

  test('updateRequirement / deleteRequirement', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    const r1 = s.addRequirement(v, n, d, 'R1');
    s.addRequirement(v, n, d, 'R2');
    s.updateRequirement(v, n, d, r1, 'R1x', 't', 'm');
    const req = s.vocs[0].needs[0].drivers[0].requirements[0];
    assertEqual(req.text, 'R1x');
    assertEqual(req.target, 't');
    s.deleteRequirement(v, n, d, r1);
    assertEqual(s.vocs[0].needs[0].drivers[0].requirements.length, 1);
    assertEqual(s.vocs[0].needs[0].drivers[0].requirements[0].text, 'R2');
  });
});

suite('VoC-CTx Model — reorder', () => {
  test('reorder needs within a voc', () => {
    const s = new State();
    const v = s.addVoc('V');
    const a = s.addNeed(v, 'A');
    const b = s.addNeed(v, 'B');
    // move B before A
    s.reorderNodes('need', { vocId: v }, b, a);
    assertEqual(s.vocs[0].needs[0].text, 'B');
    assertEqual(s.vocs[0].needs[1].text, 'A');
  });

  test('reorder drivers within a need', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d1 = s.addDriver(v, n, 'D1', 'ctq');
    const d2 = s.addDriver(v, n, 'D2', 'ctd');
    s.reorderNodes('driver', { vocId: v, needId: n }, d2, d1);
    assertEqual(s.vocs[0].needs[0].drivers[0].text, 'D2');
  });

  test('reorder requirements within a driver', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    const r1 = s.addRequirement(v, n, d, 'R1');
    const r2 = s.addRequirement(v, n, d, 'R2');
    s.reorderNodes('req', { vocId: v, needId: n, drvId: d }, r2, r1);
    assertEqual(s.vocs[0].needs[0].drivers[0].requirements[0].text, 'R2');
  });

  test('reorder is a no-op when from === to', () => {
    const s = new State();
    const v = s.addVoc('V');
    const a = s.addNeed(v, 'A');
    s.addNeed(v, 'B');
    s.reorderNodes('need', { vocId: v }, a, a);
    assertEqual(s.vocs[0].needs[0].text, 'A');
  });

  test('reorder is a no-op for unknown ids', () => {
    const s = new State();
    const v = s.addVoc('V');
    s.addNeed(v, 'A');
    s.reorderNodes('need', { vocId: v }, 'x', 'y');
    assertEqual(s.vocs[0].needs.length, 1);
  });
});

suite('VoC-CTx Model — export rows', () => {
  test('voc with no needs → single sparse row', () => {
    const s = new State();
    s.addVoc('Lonely', 'src');
    const rows = s.getExportRows();
    assertEqual(rows.length, 1);
    assertEqual(rows[0][0], 'Lonely');
    assertEqual(rows[0][1], 'src');
    assertEqual(rows[0][2], '');
  });

  test('need with no drivers → row with need only', () => {
    const s = new State();
    const v = s.addVoc('V');
    s.addNeed(v, 'N');
    const rows = s.getExportRows();
    assertEqual(rows.length, 1);
    assertEqual(rows[0][2], 'N');
    assertEqual(rows[0][3], '');
  });

  test('full chain → one row per requirement with uppercased type', () => {
    const s = new State();
    const v = s.addVoc('V', 'S');
    const n = s.addNeed(v, 'N');
    const d = s.addDriver(v, n, 'D', 'ctq');
    s.addRequirement(v, n, d, 'R1', 't1', 'm1');
    s.addRequirement(v, n, d, 'R2');
    const rows = s.getExportRows();
    assertEqual(rows.length, 2);
    assertEqual(rows[0][0], 'V');
    assertEqual(rows[0][3], 'CTQ');
    assertEqual(rows[0][4], 'D');
    assertEqual(rows[0][5], 'R1');
    assertEqual(rows[0][6], 't1');
    assertEqual(rows[0][7], 'm1');
    assertEqual(rows[1][5], 'R2');
    assertEqual(rows[1][6], '');
  });

  test('driver without requirements → row stops at driver', () => {
    const s = new State();
    const v = s.addVoc('V');
    const n = s.addNeed(v, 'N');
    s.addDriver(v, n, 'D', 'ctd');
    const rows = s.getExportRows();
    assertEqual(rows.length, 1);
    assertEqual(rows[0][3], 'CTD');
    assertEqual(rows[0][4], 'D');
    assertEqual(rows[0][5], '');
  });
});

suite('VoC-CTx Model — hasContent & active', () => {
  test('hasContent false on empty, true with a voc', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.addVoc('X');
    assertEqual(s.hasContent(), true);
  });

  test('setActiveVoc updates activeVocId', () => {
    const s = new State();
    const a = s.addVoc('A');
    const b = s.addVoc('B');
    s.setActiveVoc(a);
    assertEqual(s.activeVocId, a);
    s.setActiveVoc(b);
    assertEqual(s.activeVocId, b);
  });

  test('activeVoc getter returns the selected voc object', () => {
    const s = new State();
    const a = s.addVoc('A');
    s.addVoc('B');
    s.setActiveVoc(a);
    assertEqual(s.activeVoc.text, 'A');
  });
});

suite('VoC-CTx Model — default node colours are distinguishable', () => {
  // Parse "rgba(r,g,b,a)" → [r, g, b]
  const rgb = (str) => str.match(/[\d.]+/g).slice(0, 3).map(Number);
  // HSL hue in degrees (0..360) for an [r, g, b] triple (0..255)
  const hue = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d === 0) return 0;
    let h;
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  };
  // Shortest angular distance between two hues (0..180)
  const hueDist = (a, b) => {
    const raw = Math.abs(a - b) % 360;
    return Math.min(raw, 360 - raw);
  };

  test('CTD and Requirement defaults differ clearly in hue (≥ 30°)', () => {
    assert(
      DEFAULT_COLORS.ctd !== DEFAULT_COLORS.req,
      'CTD and requirement default colours must not be identical'
    );
    const dist = hueDist(hue(rgb(DEFAULT_COLORS.ctd)), hue(rgb(DEFAULT_COLORS.req)));
    assert(
      dist >= 30,
      `CTD (${DEFAULT_COLORS.ctd}) and Requirement (${DEFAULT_COLORS.req}) hues `
        + `only ${dist.toFixed(1)}° apart — must be ≥ 30° to be distinguishable`
    );
  });

  test('all default node colours are pairwise distinguishable (≥ 25° hue)', () => {
    const keys = Object.keys(DEFAULT_COLORS);
    const hues = Object.fromEntries(keys.map((k) => [k, hue(rgb(DEFAULT_COLORS[k]))]));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        const dist = hueDist(hues[a], hues[b]);
        assert(
          dist >= 25,
          `${a} (${DEFAULT_COLORS[a]}) and ${b} (${DEFAULT_COLORS[b]}) hues `
            + `only ${dist.toFixed(1)}° apart — must be ≥ 25°`
        );
      }
    }
  });
});
