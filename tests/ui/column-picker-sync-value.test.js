/**
 * ColumnPicker — `syncValue()`: die Auswahl nachziehen, ohne die gerade
 * bediente Steuerung wegzureißen.
 *
 * Hintergrund: Module, die ihren Picker-Rückruf durch dieselbe Setter-Methode
 * schicken wie der Agent („eine Senke, zwei Aufrufer"), schreiben aus dem
 * `change`-Handler heraus in den Picker zurück. Mit dem `value`-Setter läuft
 * dabei `_render()` → `replaceChildren()` über genau das Element, dessen
 * Ereignis gerade behandelt wird: der Fokus landet auf `<body>`, und in der
 * Mehrfachauswahl ist nach einem Kästchen Schluss.
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import { ColumnPicker } from '../../js/ui/column-picker.js';

function makeContext() {
  const ws = {
    sheets: [
      { id: 's1', name: 'Eins', state: { columns: [
        { id: 'a', shortName: 'C1', type: 'numeric', values: [1, 2, 3] },
        { id: 'b', shortName: 'C2', type: 'numeric', values: [4, 5, 6] },
      ] } },
    ],
  };
  const phases = { data: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  return {
    stateManager: {
      get(path) {
        if (path === 'phases') return phases;
        if (path.startsWith('phases.')) return phases[path.slice(7)] ?? [];
        return undefined;
      },
      getModuleState: (id) => (id === 'ws-1' ? ws : null),
    },
    eventBus: { on() {}, off() {} },
    i18n: { t: (k) => k },
  };
}

const REF_A = { instanceId: 'ws-1', sheetId: 's1', columnId: 'a' };
const REF_B = { instanceId: 'ws-1', sheetId: 's1', columnId: 'b' };

let host;
let picker;

function mount(options) {
  host = document.createElement('div');
  document.body.appendChild(host);
  picker = new ColumnPicker(host, makeContext(), options);
  return picker;
}

suite('ColumnPicker — syncValue', () => {
  afterEach(() => {
    picker?.destroy(); picker = null;
    if (host) { host.remove(); host = null; }
  });

  test('eine unveränderte Auswahl zeichnet NICHT neu', () => {
    mount({ mode: 'single', types: ['numeric'] });
    assertEqual(picker.syncValue(REF_A), true);         // neu → zeichnet
    const sel = host.querySelector('select');
    assertEqual(picker.syncValue(REF_A), false);        // gleich → nichts
    assertTrue(host.querySelector('select') === sel);
    assertEqual(picker.value.columnId, 'a');
  });

  test('eine fremde Auswahl zeichnet neu und ist danach gewählt', () => {
    mount({ mode: 'single', types: ['numeric'] });
    picker.syncValue(REF_A);
    const sel = host.querySelector('select');
    assertEqual(picker.syncValue(REF_B), true);
    assertTrue(host.querySelector('select') !== sel);
    assertEqual(picker.value.columnId, 'b');
    assertEqual(host.querySelector('select').value, 'ws-1|s1|b');
  });

  test('das Zurückschreiben aus dem change-Handler behält den Fokus', () => {
    // Genau der Weg des Hypothesentests: onChange → Setter → syncValue.
    mount({
      mode: 'single', types: ['numeric'],
      onChange: (ref) => picker.syncValue(ref),
    });
    const sel = host.querySelector('select');
    sel.focus();
    sel.value = 'ws-1|s1|b';
    sel.dispatchEvent(new Event('change'));
    assertEqual(picker.value.columnId, 'b');
    // Mit dem value-Setter stünde hier <body> und ein ERSETZTES <select>.
    assertTrue(host.querySelector('select') === sel);
    assertEqual(document.activeElement, sel);
  });

  test('Mehrfachauswahl: ein zweites Kästchen bleibt bedienbar', () => {
    mount({
      mode: 'multi', types: ['numeric'],
      onChange: (refs) => picker.syncValue(refs),
    });
    const boxes = () => [...host.querySelectorAll('input[type="checkbox"]')];
    const first = boxes()[0];
    first.focus();
    first.checked = true;
    first.dispatchEvent(new Event('change'));
    // Dieselben Kästchen wie vorher — sonst hätte der Nutzer nach dem ersten
    // Haken keinen Fokus mehr und die Liste wäre neu aufgebaut.
    assertTrue(boxes()[0] === first);
    assertEqual(document.activeElement, first);
    const second = boxes()[1];
    second.checked = true;
    second.dispatchEvent(new Event('change'));
    assertEqual(picker.value.length, 2);
  });

  test('zum Vergleich: der value-Setter nimmt dem change-Handler den Fokus', () => {
    // Der Defekt, den syncValue vermeidet — hier festgenagelt, damit niemand
    // den Rückruf wieder auf `picker.value = ref` umstellt.
    mount({
      mode: 'single', types: ['numeric'],
      onChange: (ref) => { picker.value = ref; },
    });
    const sel = host.querySelector('select');
    sel.focus();
    sel.value = 'ws-1|s1|b';
    sel.dispatchEvent(new Event('change'));
    assertTrue(host.querySelector('select') !== sel);
    assertTrue(document.activeElement !== sel);
  });

  test('die Reihenfolge der Mehrfachauswahl täuscht keine Änderung vor', () => {
    mount({ mode: 'multi', types: ['numeric'] });
    assertEqual(picker.syncValue([REF_A, REF_B]), true);
    assertEqual(picker.syncValue([REF_B, REF_A]), false);
  });
});
