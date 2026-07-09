import { suite, test, assertEqual } from '../test-utils.js';
import { cycleBlocks, trizBlocks, toolBlocks, modulesBlocks } from '../../js/pages/training/training.js';

const tEcho = (k) => 'T:' + k;                        // fake prefixed-t (training.<key>)
const i18nEcho = { t: (k) => 'I:' + k, exists: () => true };

suite('training block producers', () => {
  test('cycleBlocks returns intro + why + phases + pitfalls + app', () => {
    const blocks = cycleBlocks(tEcho, 'dmaic');
    assertEqual(blocks[0].type, 'p');
    assertEqual(blocks[0].text, 'T:dmaic.intro');
    const ul = blocks.find(b => b.type === 'ul');
    assertEqual(ul.items.length, 4);
    assertEqual(ul.items[0], 'T:dmaic.pitfall1');
  });

  test('trizBlocks includes the tools section headings', () => {
    const h4s = trizBlocks(tEcho).filter(b => b.type === 'h4').map(b => b.text);
    assertEqual(h4s.includes('T:triz.tool40Title'), true);
  });

  test('toolBlocks builds an 8-row, 3-column mapping table', () => {
    const table = toolBlocks(tEcho, 'minitab').find(b => b.type === 'table');
    assertEqual(table.cols.length, 3);
    assertEqual(table.rows.length, 8);
    assertEqual(table.rows[0][0].segs[0].text, 'T:minitab.row1a');
  });

  test('modulesBlocks lists data groups and a table per cycle', () => {
    const registry = {
      getAll: () => ([
        { id: 'worksheet', phase: 'data', group: 'collect' },
        { id: 'sipoc', phase: 'define', cycles: { dmaic: { phase: 'define' } } },
      ]),
    };
    const blocks = modulesBlocks(i18nEcho, tEcho, registry);
    assertEqual(blocks[0].type, 'p');
    assertEqual(blocks[0].text, 'T:modules.intro');
    assertEqual(blocks.some(b => b.type === 'table'), true);
  });

  test('modulesBlocks renders also-allowed hint, extras row, empty-phase fallback, and excludes hidden', () => {
    // exists:()=>false → moduleName falls back to the raw module id, so we can
    // assert names directly instead of the 'I:modules.<id>.name' echo.
    const i18nRaw = { t: (k) => 'I:' + k, exists: () => false };
    const registry = {
      getAll: () => ([
        // home phase 'define', also allowed in 'measure' → hint seg in define cell
        { id: 'charter', phase: 'define', cycles: { dmaic: { phase: 'define', allowedPhases: ['define', 'measure'] } } },
        // no dmaic mapping → extras row
        { id: 'loose-tool', phase: 'analyze' },
        // hidden → must be excluded everywhere
        { id: 'secret', phase: 'define', hiddenFromMenu: true, cycles: { dmaic: { phase: 'define' } } },
      ]),
    };
    const blocks = modulesBlocks(i18nRaw, tEcho, registry);

    // Locate the DMAIC table: the h3 before it carries the cycle name echo.
    const cycleHeadIdx = blocks.findIndex(b => b.type === 'h3' && b.text === 'I:cycles.dmaic.name');
    assertEqual(cycleHeadIdx >= 0, true);
    const table = blocks[cycleHeadIdx + 1];
    assertEqual(table.type, 'table');
    // DMAIC has 5 phases + 1 trailing extras row.
    assertEqual(table.rows.length, 6);

    // Row order matches cycle.phases: define, measure, analyze, improve, control.
    const defineRow = table.rows[0];
    const phaseCell = defineRow[0];
    assertEqual(phaseCell.segs[0].text, 'D');           // phase letter
    assertEqual(phaseCell.segs[1].text, ' — I:phases.define');
    const modsCell = defineRow[1];
    // segs: [{text:'charter'}, {text:' (…)', cls:'hint'}]
    assertEqual(modsCell.segs[0].text, 'charter');
    assertEqual(modsCell.segs[1].cls, 'hint');
    assertEqual(modsCell.segs[1].text, ' (T:modules.alsoAllowed)');

    // measure row is empty → phaseEmpty hint (single hint seg, no module).
    const measureRow = table.rows[1];
    assertEqual(measureRow[1].segs.length, 1);
    assertEqual(measureRow[1].segs[0].text, 'T:modules.phaseEmpty');
    assertEqual(measureRow[1].segs[0].cls, 'hint');

    // extras row is the last one; the loose tool (no mapping) lands here.
    const extrasRow = table.rows[table.rows.length - 1];
    assertEqual(extrasRow[0].segs[0].text, '⋯');
    assertEqual(extrasRow[1].segs[0].text, 'loose-tool');

    // Hidden module must not appear anywhere in the table.
    const allText = table.rows.flat()
      .flatMap(c => c.segs).map(s => s.text).join('|');
    assertEqual(allText.includes('secret'), false);
  });
});
