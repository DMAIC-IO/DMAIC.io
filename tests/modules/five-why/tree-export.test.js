/**
 * Tests for modules/five-why/io/tree.js — `toExport` baut die Form des
 * bisherigen JSON-Exports: am Altprojekt Text für Text gleich der Byte-Fixture
 * der Altform (ohne BOM, gleicher `timestamp`), Ebene 5 mit `children: []`,
 * `collapsed` je Knoten aus der id-Liste; der leere Baum exportiert ebenso.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toExport } from '../../../js/modules/five-why/io/tree.js';
import { State } from '../../../js/modules/five-why/domain/model.js';
import { toJsonText } from '../../../js/core/exporter.js';
import { setModelName } from '../../../js/core/model.js';

setModelName(State, 'five-why');

/** Die Byte-Fixture `legacy-export.json` (JSON-Download der Altform) ohne BOM, Zeile für Zeile. */
const LEGACY_EXPORT_LINES = [
  '{',
  '  "tool": "5-Why",',
  '  "timestamp": "2026-11-26T00:00:00.000Z",',
  '  "problem": "Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert",',
  '  "nodes": [',
  '    {',
  '      "id": 3,',
  '      "level": 1,',
  '      "parentId": null,',
  '      "question": "",',
  '      "answer": "Öl tropft aus der Ringleitung",',
  '      "children": [',
  '        {',
  '          "id": 7,',
  '          "level": 2,',
  '          "parentId": 3,',
  '          "question": "",',
  '          "answer": "Dichtung am Flansch ist spröde",',
  '          "children": [',
  '            {',
  '              "id": 8,',
  '              "level": 3,',
  '              "parentId": 7,',
  '              "question": "",',
  '              "answer": "Falscher Dichtungswerkstoff für 90 °C",',
  '              "children": [',
  '                {',
  '                  "id": 12,',
  '                  "level": 4,',
  '                  "parentId": 8,',
  '                  "question": "",',
  '                  "answer": "Einkauf bestellt nach alter Stückliste\\nÄnderung von 2024 nie eingepflegt",',
  '                  "children": [',
  '                    {',
  '                      "id": 20,',
  '                      "level": 5,',
  '                      "parentId": 12,',
  '                      "question": "",',
  '                      "answer": "Kein Änderungsprozess für Stücklisten & Lieferantendaten",',
  '                      "children": [],',
  '                      "collapsed": false',
  '                    }',
  '                  ],',
  '                  "collapsed": false',
  '                }',
  '              ],',
  '              "collapsed": false',
  '            }',
  '          ],',
  '          "collapsed": false',
  '        },',
  '        {',
  '          "id": 11,',
  '          "level": 2,',
  '          "parentId": 3,',
  '          "question": "",',
  '          "answer": "",',
  '          "children": [],',
  '          "collapsed": false',
  '        }',
  '      ],',
  '      "collapsed": false',
  '    },',
  '    {',
  '      "id": 5,',
  '      "level": 1,',
  '      "parentId": null,',
  '      "question": "",',
  '      "answer": "Prüfstand meldet zu spät",',
  '      "children": [',
  '        {',
  '          "id": 6,',
  '          "level": 2,',
  '          "parentId": 5,',
  '          "question": "",',
  '          "answer": "Grenzwert < 2 bar ist zu weich eingestellt",',
  '          "children": [],',
  '          "collapsed": false',
  '        }',
  '      ],',
  '      "collapsed": true',
  '    }',
  '  ]',
  '}',
];
const STAMP = new Date('2026-11-26T00:00:00.000Z');

/** Knoten auf Ebene `level` (auf Ebene 5 ohne `children`). */
function node(id, level, parentId, answer = '', children = []) {
  return level < 5 ? { id, level, parentId, answer, children } : { id, level, parentId, answer };
}

/** Das Altprojekt nach 0→1.0. */
const LEGACY_STATE = {
  problem: 'Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert',
  nodes: [
    node(3, 1, null, 'Öl tropft aus der Ringleitung', [
      node(7, 2, 3, 'Dichtung am Flansch ist spröde', [
        node(8, 3, 7, 'Falscher Dichtungswerkstoff für 90 °C', [
          node(12, 4, 8, 'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt', [
            node(20, 5, 12, 'Kein Änderungsprozess für Stücklisten & Lieferantendaten'),
          ]),
        ]),
      ]),
      node(11, 2, 3, ''),
    ]),
    node(5, 1, null, 'Prüfstand meldet zu spät', [node(6, 2, 5, 'Grenzwert < 2 bar ist zu weich eingestellt')]),
  ],
  collapsed: [5],
};

suite('five-why Export (io/tree.js)', () => {
  test('Altprojekt: Text gleich der Byte-Fixture ohne BOM', () => {
    const m = State.fromJSON({ _schema: { name: 'five-why', version: '1.0' }, ...LEGACY_STATE });
    assertEqual(toJsonText(toExport(m, m.collapsed, STAMP)), LEGACY_EXPORT_LINES.join('\n'));
  });
  test('Altprojekt aus der Altform (Migration) ergibt denselben Export', () => {
    const old = JSON.parse(LEGACY_EXPORT_LINES.join('\n'));
    const m = State.fromJSON({ problem: old.problem, nodes: old.nodes });
    assertEqual(toJsonText(toExport(m, m.collapsed, STAMP)), LEGACY_EXPORT_LINES.join('\n'));
  });
  test('Schlüsselreihenfolge je Knoten, question leer, Ebene 5 mit children []', () => {
    const out = toExport(LEGACY_STATE, [], STAMP);
    assertDeepEqual(Object.keys(out), ['tool', 'timestamp', 'problem', 'nodes']);
    assertDeepEqual(Object.keys(out.nodes[0]), ['id', 'level', 'parentId', 'question', 'answer', 'children', 'collapsed']);
    const l5 = out.nodes[0].children[0].children[0].children[0].children[0];
    assertDeepEqual(l5, { id: 20, level: 5, parentId: 12, question: '', answer: 'Kein Änderungsprozess für Stücklisten & Lieferantendaten', children: [], collapsed: false });
    assertEqual(out.nodes[1].collapsed, false);
  });
  test('leerer Baum exportiert die Hülle', () => {
    assertDeepEqual(toExport({ problem: '', nodes: [] }, [], STAMP), {
      tool: '5-Why', timestamp: '2026-11-26T00:00:00.000Z', problem: '', nodes: [],
    });
  });
});
