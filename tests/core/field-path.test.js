/**
 * Tests for core/field-path.js — Grammatik der Pfade von x-field/x-set und
 * die Schlüsselfelder, auf die ein idOf zeigt.
 */
import { suite, test, assertDeepEqual, assertThrows } from '../test-utils.js';
import { parseFieldPath, keyFieldsOf } from '../../js/core/field-path.js';
import { defineModel, command, idOf, list, object, text } from '../../js/core/model.js';

suite('parseFieldPath', () => {
  test('Wurzel, Namen, Klammern, Feld', () => {
    assertDeepEqual(parseFieldPath('model.alpha'), { root: 'model', steps: [], field: 'alpha' });
    assertDeepEqual(parseFieldPath('item.text'), { root: 'item', steps: [], field: 'text' });
    assertDeepEqual(parseFieldPath('model.items[i].text'),
      { root: 'model', steps: [{ kind: 'name', name: 'items' }, { kind: 'index', ref: 'i' }], field: 'text' });
    assertDeepEqual(parseFieldPath('model.risks[2].actions[j].owner'), {
      root: 'model',
      steps: [{ kind: 'name', name: 'risks' }, { kind: 'index', at: 2 }, { kind: 'name', name: 'actions' }, { kind: 'index', ref: 'j' }],
      field: 'owner',
    });
  });
  test('ungültige Pfade werfen', () => {
    assertThrows(() => parseFieldPath('model'), /invalid field path "model"; expected <root>\.<field>/);
    assertThrows(() => parseFieldPath('model.items[i]'), /expected <root>\.<field>/);
    assertThrows(() => parseFieldPath('model.items[i + 1].text'), /invalid field path/);
    assertThrows(() => parseFieldPath('.text'), /invalid field path/);
  });
});

suite('keyFieldsOf', () => {
  test('idOf in Feldern und Kommando-Parametern, verschachtelt', () => {
    const M = defineModel({
      fields: { risks: list(object({ id: text(), actions: list(object({ uid: text(), text: text() })) })) },
      commands: {
        setRisk: command({ params: { id: idOf('risks') }, run() {} }),
        setAction: command({ params: { risk: idOf('risks'), action: idOf('risks[risk].actions', { key: 'uid' }) }, run() {} }),
      },
    });
    const keys = keyFieldsOf(M.schema);
    assertDeepEqual([...keys.get('risks')], ['id']);
    assertDeepEqual([...keys.get('risks[].actions')], ['uid']);
  });
});
